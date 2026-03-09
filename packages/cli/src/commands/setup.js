import { mkdir, writeFile } from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDefaultConfig } from "../templates/config.js";
import { renderComposeTemplate } from "../templates/docker-compose.js";
import { getComposePath } from "../lib/paths.js";
import { ensureJaitHome, resolveDataDir, writeConfig } from "../lib/storage.js";
const ask = async (question, fallback) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(`${question} (${fallback}): `);
    rl.close();
    return answer.trim() || fallback;
};
export const runSetup = async (options) => {
    const config = createDefaultConfig();
    if (options.nonInteractive) {
        config.llmProvider = options.llmProvider ?? config.llmProvider;
        config.serviceMode = options.serviceMode ?? config.serviceMode;
        config.gatewayPort = Number(options.gatewayPort ?? config.gatewayPort);
        config.webPort = Number(options.webPort ?? config.webPort);
        config.wsPort = Number(options.wsPort ?? config.wsPort);
        config.turnEnabled = options.turnEnabled ?? config.turnEnabled;
    }
    else {
        config.llmProvider = (await ask("LLM provider [openai|ollama]", config.llmProvider));
        config.serviceMode = (await ask("Service mode [process|docker]", config.serviceMode));
        config.gatewayPort = Number(await ask("Gateway port", String(config.gatewayPort)));
        config.webPort = Number(await ask("Web port", String(config.webPort)));
        config.wsPort = Number(await ask("Websocket port", String(config.wsPort)));
        config.turnEnabled = (await ask("Enable TURN [true|false]", String(config.turnEnabled))) === "true";
    }
    await ensureJaitHome();
    config.dataDir = resolveDataDir(config.dataDir);
    await mkdir(config.dataDir, { recursive: true });
    await writeConfig(config);
    await writeFile(getComposePath(), renderComposeTemplate(config), "utf-8");
    return config;
};
//# sourceMappingURL=setup.js.map