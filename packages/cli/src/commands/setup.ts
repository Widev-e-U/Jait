import { mkdir } from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDefaultConfig } from "../templates/config.js";
import { ensureJaitHome, resolveDataDir, writeConfig } from "../lib/storage.js";
import type { JaitConfig } from "../types.js";

export interface SetupOptions {
  nonInteractive?: boolean;
  llmProvider?: "openai" | "ollama";
  gatewayPort?: string;
  webPort?: string;
  wsPort?: string;
  turnEnabled?: boolean;
}

const ask = async (question: string, fallback: string): Promise<string> => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} (${fallback}): `);
  rl.close();
  return answer.trim() || fallback;
};

export const runSetup = async (options: SetupOptions): Promise<JaitConfig> => {
  const config = createDefaultConfig();

  if (options.nonInteractive) {
    config.llmProvider = options.llmProvider ?? config.llmProvider;
    config.gatewayPort = Number(options.gatewayPort ?? config.gatewayPort);
    config.webPort = Number(options.webPort ?? config.webPort);
    config.wsPort = Number(options.wsPort ?? config.wsPort);
    config.turnEnabled = options.turnEnabled ?? config.turnEnabled;
  } else {
    config.llmProvider = (await ask("LLM provider [openai|ollama]", config.llmProvider)) as JaitConfig["llmProvider"];
    config.gatewayPort = Number(await ask("Gateway port", String(config.gatewayPort)));
    config.webPort = Number(await ask("Web port", String(config.webPort)));
    config.wsPort = Number(await ask("Websocket port", String(config.wsPort)));
    config.turnEnabled = (await ask("Enable TURN [true|false]", String(config.turnEnabled))) === "true";
  }

  await ensureJaitHome();
  config.dataDir = resolveDataDir(config.dataDir);
  await mkdir(config.dataDir, { recursive: true });

  await writeConfig(config);

  return config;
};
