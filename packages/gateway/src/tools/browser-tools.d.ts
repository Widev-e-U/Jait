import type { SurfaceRegistry } from "../surfaces/registry.js";
import { SSRFGuard } from "../security/ssrf-guard.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import type { ToolDefinition } from "./contracts.js";
interface BrowserNavigateInput {
    url: string;
    browserId?: string;
}
interface BrowserSnapshotInput {
    browserId?: string;
}
interface BrowserSandboxStartInput {
    novncPort?: number;
    vncPort?: number;
    mountMode?: SandboxMountMode;
}
interface WebFetchInput {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
    ignoreTlsErrors?: boolean;
}
interface WebSearchInput {
    query: string;
    provider?: "auto" | "openai" | "brave" | "perplexity" | "grok" | "gemini" | "kimi";
    limit?: number;
}
export declare function createBrowserNavigateTool(registry: SurfaceRegistry): ToolDefinition<BrowserNavigateInput>;
export declare function createBrowserSnapshotTool(registry: SurfaceRegistry): ToolDefinition<BrowserSnapshotInput>;
export declare function createBrowserInteractionTools(registry: SurfaceRegistry): ToolDefinition[];
export declare function createWebFetchTool(guard?: SSRFGuard): ToolDefinition<WebFetchInput>;
export declare function createWebSearchTool(guard?: SSRFGuard): ToolDefinition<WebSearchInput>;
export declare function createBrowserSandboxStartTool(sandboxManager?: SandboxManager): ToolDefinition<BrowserSandboxStartInput>;
export {};
//# sourceMappingURL=browser-tools.d.ts.map