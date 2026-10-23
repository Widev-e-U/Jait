// @jait/shared — main entry point
export * from "./chat-node.js";
export * from "./messenger.js";
export * from "./agent-control.js";

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
export * from "./jait-link.js";

export * from "./team-chat.js";

export * from "./network-resources.js";

export type * from "./email.js";

export type { ModelUsage, UsageSummary } from "./model-usage.js";
export * from "./chat-loop.js";
