import type { JaitConfig } from "../types.js";
export interface SetupOptions {
    nonInteractive?: boolean;
    llmProvider?: "openai" | "ollama";
    serviceMode?: "process" | "docker";
    gatewayPort?: string;
    webPort?: string;
    wsPort?: string;
    turnEnabled?: boolean;
}
export declare const runSetup: (options: SetupOptions) => Promise<JaitConfig>;
//# sourceMappingURL=setup.d.ts.map