#!/usr/bin/env node
import { Command } from "commander";
import { runSetup } from "./commands/setup.js";
import { runStart, runStatus, runStop } from "./commands/lifecycle.js";
import { runDoctorCommand, runLogs, runReset, runUpdate } from "./commands/maintenance.js";
import { runCronList, runDevicesList, runSurfacesList } from "./commands/resources.js";

const program = new Command();

const printJson = (data: unknown): void => {
  console.log(JSON.stringify(data, null, 2));
};

program.name("jait").description("Jait CLI").version("0.1.0");

program
  .command("setup")
  .description("Interactive setup wizard")
  .option("--non-interactive", "Skip prompts and use defaults/options")
  .option("--llm-provider <provider>", "openai|ollama")
  .option("--gateway-port <port>")
  .option("--web-port <port>")
  .option("--ws-port <port>")
  .option("--turn-enabled", "Enable TURN service")
  .action(async (options) => {
    const config = await runSetup(options);
    printJson({ message: "Setup complete", config });
  });

program.command("start").description("Start Jait services").action(async () => {
  await runStart();
  console.log("Jait services started.");
});

program.command("stop").description("Stop Jait services").action(async () => {
  await runStop();
  console.log("Jait services stopped.");
});

program.command("status").description("Show service status").action(async () => {
  for (const line of await runStatus()) {
    console.log(line);
  }
});

program.command("logs").description("Show generated compose template").action(async () => {
  console.log(await runLogs());
});

program.command("doctor").description("Run diagnostics").action(async () => {
  for (const line of await runDoctorCommand()) {
    console.log(line);
  }
});

program.command("reset").description("Reset ~/.jait state").action(async () => {
  await runReset();
  console.log("Reset complete.");
});

program.command("update").description("Update local Jait deployment").action(async () => {
  console.log(await runUpdate());
});

const surfaces = program.command("surfaces").description("Surface operations");
surfaces.command("list").action(async () => printJson(await runSurfacesList()));

const devices = program.command("devices").description("Device operations");
devices.command("list").action(async () => printJson(await runDevicesList()));

const cron = program.command("cron").description("Cron operations");
cron.command("list").action(async () => printJson(await runCronList()));

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`jait: ${message}`);
  process.exit(1);
});
