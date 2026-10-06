// @jait/shared — main entry point
export * from "./types/index.js";
export * from "./schemas/index.js";
export * from "./constants/index.js";
export * from "./provider-auth.js";
export * from "./project-ui.js";
export * from "./project-tree.js";
export * from "./code-graph.js";
export * from "./jait-backends.js";

export type { DesktopGatewayConfig, DesktopGatewayStatus } from "./desktop-gateway.js";

export type { OllamaUsageSetup } from "./ollama-usage.js";

export * from "./notifications.js";
export * from "./capability-catalog.js";
export * from "./persona-agent.js";
export * from "./security-assessment.js";

export * from "./security-workbench.js";
