import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { runSetup } from "./commands/setup.js";
import { runLogs, runReset, runUpdate } from "./commands/maintenance.js";
import { runStatus } from "./commands/lifecycle.js";
import { getConfigPath } from "./lib/paths.js";
import { readConfig, writeState } from "./lib/storage.js";
import { createDefaultConfig } from "./templates/config.js";

const originalHome = process.env.HOME;

describe("sprint8 cli", () => {
  beforeEach(async () => {
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "jait-cli-test-"));
    process.env.HOME = tempHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  test("setup writes config", async () => {
    const config = await runSetup({ nonInteractive: true, llmProvider: "openai", gatewayPort: "9000", turnEnabled: true });

    expect(config.llmProvider).toBe("openai");
    expect(config.gatewayPort).toBe(9000);

    const savedConfig = JSON.parse(await readFile(getConfigPath(), "utf-8")) as { llmProvider: string };
    expect(savedConfig.llmProvider).toBe("openai");
  });

  test("status command reports stopped services by default", async () => {
    const lines = await runStatus();
    expect(lines).toEqual(["gateway: stopped", "web: stopped"]);
  });

  test("reset clears jait directory", async () => {
    await runSetup({ nonInteractive: true });
    expect(await readConfig()).not.toBeNull();

    await runReset();
    expect(await readConfig()).toBeNull();
  });

  test("status includes pid when provided", async () => {
    await writeState({ gatewayPid: process.pid, webPid: process.pid });

    const lines = await runStatus();
    expect(lines[0]).toContain("running");
    expect(lines[0]).toContain("pid=");
  });

  test("update returns migration note", async () => {
    expect(await runUpdate()).toContain("migration hooks");
  });
});
