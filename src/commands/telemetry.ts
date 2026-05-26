import chalk from "chalk";
import { Command } from "commander";

import {
  enableTelemetry,
  disableTelemetry,
  getTelemetry,
  isHardDisabled,
} from "../telemetry/state.js";

function printStatus(): void {
  const t = getTelemetry();
  const state = isHardDisabled()
    ? "hard-disabled (Q_NO_TELEMETRY / DO_NOT_TRACK)"
    : t.enabled
      ? "on"
      : "off";
  process.stdout.write(`telemetry: ${state}\n`);
  if (t.enabled && t.anonId) {
    process.stdout.write(chalk.dim(`anon id: ${t.anonId}`) + "\n");
  }
  if (!t.enabled && !isHardDisabled()) {
    process.stdout.write(chalk.dim("enable with: q telemetry on") + "\n");
  }
}

export function buildTelemetryCommand(): Command {
  const cmd = new Command("telemetry")
    .description("Control anonymous, opt-in usage telemetry")
    .action(() => printStatus());

  cmd
    .command("on")
    .description("Enable anonymous telemetry")
    .action(() => {
      enableTelemetry();
      process.stdout.write(
        chalk.green("telemetry enabled (anonymous). Turn off anytime: q telemetry off") + "\n",
      );
    });

  cmd
    .command("off")
    .description("Disable telemetry")
    .action(() => {
      disableTelemetry();
      process.stdout.write(chalk.green("telemetry disabled") + "\n");
    });

  cmd.command("status").description("Show telemetry status").action(printStatus);

  return cmd;
}
