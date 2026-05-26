import type { Config, FeatureFlags } from "../config/schema.js";
import type {
  AskParams,
  AskResult,
  DryRunInfo,
  EngineDeps,
  LastRun,
  QEngine,
  StreamEvent,
  ToolCallRecord,
  Turn,
  Usage,
} from "./types.js";
import { readConfig } from "../config/store.js";
import { resolveApiKey, resolveModel, resolveFeatures } from "../config/resolve.js";
import {
  getProvider,
  resolveProvider,
  wireModelId,
  KNOWN_MODELS,
  PROVIDER_NAMES,
  PROVIDER_ENV_VARS,
} from "../providers/index.js";
import { buildSystemPrompt } from "../prompt/system.js";
import { toProviderTools } from "../tools/to-provider.js";
import { executeTool, toToolCallRecord } from "../tools/execute.js";
import { matchTools } from "./regex-route.js";
import { recordLastRun } from "./feedback.js";
import { runLoop } from "./loop.js";
import { ProviderError } from "../util/errors.js";

const PREVIEW_LEN = 280;

export function createEngine(deps?: EngineDeps): QEngine {
  function cfg(): Config {
    return deps?.config ?? readConfig();
  }

  function effectiveFeatures(params: AskParams): FeatureFlags {
    const overrides: Partial<FeatureFlags> = {};
    if (params.tools !== undefined) overrides.tools = params.tools;
    if (params.think !== undefined) overrides.think = params.think;
    if (params.format !== undefined) overrides.format = params.format;
    return resolveFeatures(overrides, cfg());
  }

  async function* stream(params: AskParams): AsyncIterable<StreamEvent> {
    const config = cfg();
    const features = effectiveFeatures(params);
    const model = resolveModel(params.model, config);
    const history: Turn[] = params.history ?? [];

    const provider = resolveProvider(model);
    // The wire id drops any leading `provider/` so the API sees the model it expects.
    const wireModel = wireModelId(model);
    const enabledTools = features.tools
      ? config.tools.filter((t) => t.enabled)
      : [];
    const system = buildSystemPrompt({ tools: enabledTools, format: features.format });
    const toolSpecs = toProviderTools(enabledTools);

    // --- Dry run: render the plan, no network. ---
    if (params.dryRun) {
      const dryRun: DryRunInfo = {
        system,
        messages: [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: params.question },
        ],
        tools: toolSpecs.map((t) => t.name),
      };
      const result: AskResult = {
        answer: "",
        model,
        provider,
        usage: { inputTokens: 0, outputTokens: 0 },
        toolCalls: [],
        routedVia: "llm",
        dryRun,
      };
      yield { type: "done", result };
      return;
    }

    // Resolve the key lazily: detecting a regex match and answering
    // deterministically (`--no-phrase`) need no API key at all, so we only
    // require one when we actually have to call the model.
    const apiKey = resolveApiKey(provider, config);
    const requireKey = (): string => {
      if (!apiKey) {
        const envVar = PROVIDER_ENV_VARS[provider]?.[0] ?? `${provider.toUpperCase()}_API_KEY`;
        // Point the user at providers they already have a key for.
        const available = PROVIDER_NAMES.filter(
          (p) => p !== provider && resolveApiKey(p, config),
        );
        let suggestion = "";
        if (available.length > 0) {
          const example = KNOWN_MODELS.find((m) => {
            try {
              return available.includes(resolveProvider(m));
            } catch {
              return false;
            }
          });
          suggestion =
            ` You do have a key for: ${available.join(", ")}` +
            (example ? ` — try \`q model set ${example}\`.` : ".");
        }
        throw new ProviderError(
          `No API key for ${provider} (model "${model}"). Set ${envVar}, ` +
            `or run \`q config set keys.${provider} <key>\`.${suggestion}`,
        );
      }
      return apiKey;
    };

    // --- Regex fast-path. Detection + deterministic answers need no key. ---
    if (features.tools && enabledTools.length > 0) {
      const hit = matchTools(params.question, enabledTools);
      if (hit) {
        yield { type: "routed", via: "regex", pattern: hit.pattern, tool: hit.tool.name };

        const start = Date.now();
        yield { type: "tool_call_start", tool: hit.tool.name, input: hit.input };
        const execResult = await executeTool(hit.tool, hit.input, {
          ...(params.signal ? { signal: params.signal } : {}),
          ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        });
        const record = toToolCallRecord({
          tool: hit.tool.name,
          input: hit.input,
          result: execResult,
          durationMs: Date.now() - start,
        });
        yield { type: "tool_call_end", record };

        // Phrase via the model only when requested AND a key is available;
        // otherwise answer deterministically from the tool body (works offline).
        const wantPhrase = params.phrase ?? features.regexPhraseWithLLM;
        const phrase = wantPhrase && Boolean(apiKey);
        let answer: string;
        const usage: Usage = { inputTokens: 0, outputTokens: 0 };

        if (phrase) {
          // Pass the tool result through the LLM to phrase a natural answer.
          const provInst = getProvider(model, requireKey());
          const phraseSystem = buildSystemPrompt({
            tools: enabledTools,
            format: features.format,
          });
          const phrasePrompt =
            `The user asked: ${params.question}\n\n` +
            `Tool "${hit.tool.name}" returned:\n${execResult.body}\n\n` +
            `Answer the user's question using only this result. Cite the tool as the source.`;
          let text = "";
          for await (const ev of provInst.run({
            model: wireModel,
            system: phraseSystem,
            messages: [{ role: "user", content: phrasePrompt }],
            tools: [],
            think: features.think,
            ...(params.signal ? { signal: params.signal } : {}),
          })) {
            if (ev.type === "text_delta") {
              text += ev.text;
              yield { type: "text_delta", text: ev.text };
            } else if (ev.type === "thinking_delta") {
              yield { type: "thinking_delta", text: ev.text };
            } else if (ev.type === "done") {
              usage.inputTokens += ev.usage.inputTokens;
              usage.outputTokens += ev.usage.outputTokens;
            }
          }
          answer = text;
        } else {
          // Synthesize directly from the tool body, no LLM.
          answer = synthesizeAnswer(hit.tool.name, execResult);
          yield { type: "text_delta", text: answer };
        }

        const result: AskResult = {
          answer,
          model,
          provider,
          usage,
          toolCalls: [record],
          routedVia: "regex",
          matchedPattern: hit.pattern,
          matchedTool: hit.tool.name,
          // The answer is only trustworthy if the tool call actually succeeded.
          ...(execResult.ok ? {} : { error: execResult.body }),
        };
        recordLastRun(toLastRun(params.question, result));
        yield { type: "done", result };
        return;
      }
    }

    // --- LLM path (no fast-path match): requires a key. ---
    yield { type: "routed", via: "llm" };
    const providerInstance = getProvider(model, requireKey());
    const gen = runLoop({
      provider: providerInstance,
      model: wireModel,
      system,
      question: params.question,
      history,
      tools: enabledTools,
      toolSpecs,
      think: features.think,
      ...(params.signal ? { signal: params.signal } : {}),
      ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });

    let outcome: { answer: string; usage: Usage; toolCalls: ToolCallRecord[] } = {
      answer: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      toolCalls: [],
    };
    while (true) {
      const next = await gen.next();
      if (next.done) {
        outcome = next.value;
        break;
      }
      yield next.value;
    }

    const result: AskResult = {
      answer: outcome.answer,
      model,
      provider,
      usage: outcome.usage,
      toolCalls: outcome.toolCalls,
      routedVia: "llm",
    };
    recordLastRun(toLastRun(params.question, result));
    yield { type: "done", result };
  }

  async function ask(params: AskParams): Promise<AskResult> {
    let result: AskResult | undefined;
    for await (const ev of stream(params)) {
      if (ev.type === "done") result = ev.result;
      else if (ev.type === "error") throw new ProviderError(ev.error);
    }
    if (!result) {
      throw new ProviderError("Engine produced no result.");
    }
    return result;
  }

  function listModels(): string[] {
    const config = cfg();
    const models = [...KNOWN_MODELS];
    if (!models.includes(config.defaultModel)) models.push(config.defaultModel);
    return models;
  }

  function listTools(): { name: string; description?: string }[] {
    return cfg()
      .tools.filter((t) => t.enabled)
      .map((t) => ({ name: t.name, description: t.description }));
  }

  return { ask, stream, listModels, listTools };
}

function synthesizeAnswer(
  toolName: string,
  result: { ok: boolean; status?: number; body: string },
): string {
  if (!result.ok) {
    const status = result.status ? ` (HTTP ${result.status})` : "";
    return `The ${toolName} tool failed${status}: ${result.body}`;
  }
  return `${result.body.trim()}\n\n(source: ${toolName})`;
}

function toLastRun(question: string, result: AskResult): LastRun {
  const run: LastRun = {
    ts: Date.now(),
    question,
    routedVia: result.routedVia,
    model: result.model,
    answerPreview: result.answer.slice(0, PREVIEW_LEN),
  };
  if (result.matchedTool) run.tool = result.matchedTool;
  if (result.matchedPattern) run.matchedPattern = result.matchedPattern;
  return run;
}
