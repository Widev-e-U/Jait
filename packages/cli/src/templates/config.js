import { getJaitHome } from "../lib/paths.js";
export const createDefaultConfig = () => ({
    llmProvider: "ollama",
    gatewayPort: 8000,
    webPort: 3000,
    wsPort: 18789,
    turnEnabled: false,
    turnPort: 3478,
    dataDir: `${getJaitHome()}/data`,
    serviceMode: "process",
    createdAt: new Date().toISOString(),
});
//# sourceMappingURL=config.js.map