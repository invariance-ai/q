import type { ToolEntry } from "../config/schema.js";
import type { ProviderToolSpec } from "../providers/types.js";

/**
 * Convert enabled tool entries into provider tool specs, deriving a JSON-schema
 * `parameters` object from each tool's typed `input` contract.
 */
export function toProviderTools(entries: ToolEntry[]): ProviderToolSpec[] {
  return entries
    .filter((e) => e.enabled)
    .map((e) => ({
      name: e.name,
      description: e.description,
      parameters: inputToSchema(e),
    }));
}

function inputToSchema(entry: ToolEntry): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const input = entry.input ?? {};
  for (const [key, param] of Object.entries(input)) {
    properties[key] = {
      type: param.type,
      ...(param.description ? { description: param.description } : {}),
    };
    if (param.required) required.push(key);
  }
  const schema: Record<string, unknown> = {
    type: "object",
    properties,
  };
  if (required.length > 0) schema["required"] = required;
  return schema;
}
