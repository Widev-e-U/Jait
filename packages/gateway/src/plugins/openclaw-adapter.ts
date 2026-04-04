/**
 * OpenClaw compatibility adapter.
 *
 * Loads OpenClaw-format plugins (openclaw.plugin.json + index.ts using
 * definePluginEntry) and bridges them into Jait's plugin system.
 *
 * Supported:
 *  - Tool registration (registerTool) → Jait ToolDefinition
 *  - Plugin config passthrough
 *  - Scoped logging
 *
 * Unsupported registrations (channels, speech providers, CLI backends, etc.)
 * are silently captured so the plugin doesn't throw, but they are not wired
 * into Jait's runtime. They are logged at debug level.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PluginManifest as JaitManifest } from "./manifest.js";
import type { PluginModule, PluginContext, PluginContribution, PluginToolDeclaration } from "./contracts.js";
import type { ToolCategory, ToolConsentLevel, ToolRisk, ToolTier, ToolResult } from "../tools/contracts.js";

/* ------------------------------------------------------------------ */
/*  OpenClaw manifest shape (subset we actually need)                  */
/* ------------------------------------------------------------------ */

interface OpenClawManifest {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  configSchema?: Record<string, unknown>;
  contracts?: {
    tools?: string[];
    webFetchProviders?: string[];
    webSearchProviders?: string[];
    [key: string]: unknown;
  };
  providers?: string[];
  channels?: string[];
  uiHints?: Record<string, unknown>;
  enabledByDefault?: boolean;
}

/* ------------------------------------------------------------------ */
/*  OpenClaw tool shape (AgentTool-compatible)                         */
/* ------------------------------------------------------------------ */

interface OpenClawTool {
  name: string;
  label?: string;
  description?: string;
  parameters?: Record<string, unknown>; // TypeBox / JSON Schema
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
  ownerOnly?: boolean;
  displaySummary?: string;
}

/* ------------------------------------------------------------------ */
/*  Stub OpenClawPluginApi                                             */
/* ------------------------------------------------------------------ */

interface StubApi {
  tools: OpenClawTool[];
  unsupported: { method: string; args: unknown[] }[];
}

function createStubApi(manifest: OpenClawManifest, pluginConfig: Record<string, unknown>, log: PluginContext["log"]): StubApi & Record<string, unknown> {
  const collected: StubApi = { tools: [], unsupported: [] };

  const noop = (method: string) => (...args: unknown[]) => {
    collected.unsupported.push({ method, args });
    log.info(`[openclaw-compat] ${manifest.id}: skipped ${method} (not supported in Jait)`);
  };

  // Build a minimal shape that satisfies OpenClawPluginApi
  const api: Record<string, unknown> = {
    id: manifest.id,
    name: manifest.name ?? manifest.id,
    version: manifest.version,
    description: manifest.description,
    source: `openclaw:${manifest.id}`,
    rootDir: undefined, // set later
    registrationMode: "full" as const,
    config: {},        // OpenClaw global config — empty in Jait context
    pluginConfig,
    runtime: {},       // Empty runtime object
    logger: log,

    // ── Supported: tool registration ──────────────────────────────
    registerTool: (tool: OpenClawTool | ((...args: unknown[]) => OpenClawTool)) => {
      if (typeof tool === "function") {
        // Factory pattern (OpenClawPluginToolFactory)
        try {
          const resolved = (tool as () => OpenClawTool)();
          collected.tools.push(resolved);
        } catch (err) {
          log.warn(`[openclaw-compat] ${manifest.id}: tool factory threw: ${err}`);
        }
      } else if (tool && typeof tool === "object" && "name" in tool) {
        collected.tools.push(tool);
      }
    },

    // ── Unsupported — captured but not wired ──────────────────────
    registerHook: noop("registerHook"),
    registerHttpRoute: noop("registerHttpRoute"),
    registerChannel: noop("registerChannel"),
    registerGatewayMethod: noop("registerGatewayMethod"),
    registerCli: noop("registerCli"),
    registerService: noop("registerService"),
    registerCliBackend: noop("registerCliBackend"),
    registerProvider: noop("registerProvider"),
    registerSpeechProvider: noop("registerSpeechProvider"),
    registerRealtimeTranscriptionProvider: noop("registerRealtimeTranscriptionProvider"),
    registerRealtimeVoiceProvider: noop("registerRealtimeVoiceProvider"),
    registerMediaUnderstandingProvider: noop("registerMediaUnderstandingProvider"),
    registerImageGenerationProvider: noop("registerImageGenerationProvider"),
    registerWebFetchProvider: noop("registerWebFetchProvider"),
    registerWebSearchProvider: noop("registerWebSearchProvider"),
    registerInteractiveHandler: noop("registerInteractiveHandler"),
    onConversationBindingResolved: noop("onConversationBindingResolved"),
    registerCommand: noop("registerCommand"),
    registerContextEngine: noop("registerContextEngine"),
    registerMemoryPromptSection: noop("registerMemoryPromptSection"),
    registerMemoryFlushPlan: noop("registerMemoryFlushPlan"),
    registerMemoryRuntime: noop("registerMemoryRuntime"),
    registerMemoryEmbeddingProvider: noop("registerMemoryEmbeddingProvider"),

    // ── Utility stubs ─────────────────────────────────────────────
    resolvePath: (p: string) => p,
    on: noop("on"),
  };

  return api as StubApi & Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Convert OpenClaw tool → Jait PluginToolDeclaration                 */
/* ------------------------------------------------------------------ */

function convertTool(_pluginId: string, tool: OpenClawTool): PluginToolDeclaration {
  return {
    name: tool.name,
    description: tool.description ?? tool.label ?? tool.name,
    parameters: (tool.parameters as unknown as PluginToolDeclaration["parameters"]) ?? {
      type: "object" as const,
      properties: {},
    },
    tier: "external" as ToolTier,
    category: "external" as ToolCategory,
    risk: "high" as ToolRisk,
    defaultConsentLevel: "dangerous" as ToolConsentLevel,
    execute: async (input: unknown, _ctx: unknown): Promise<ToolResult> => {
      const toolCallId = `jait-${Date.now()}`;
      const params = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
      try {
        const result = await tool.execute(toolCallId, params);
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return { ok: true, message: text };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `Error: ${msg}` };
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Discovery — find openclaw.plugin.json in a directory               */
/* ------------------------------------------------------------------ */

export async function discoverOpenClawPlugins(extensionsDir: string): Promise<{ manifest: OpenClawManifest; dir: string }[]> {
  const results: { manifest: OpenClawManifest; dir: string }[] = [];
  let entries: string[];
  try {
    entries = await readdir(extensionsDir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const dir = join(extensionsDir, entry);
    const dirStat = await stat(dir).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    const manifestPath = join(dir, "openclaw.plugin.json");
    try {
      const raw = JSON.parse(await readFile(manifestPath, "utf-8")) as OpenClawManifest;
      if (!raw.id || typeof raw.id !== "string") continue;
      results.push({ manifest: raw, dir });
    } catch {
      // No OpenClaw manifest — skip
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/*  Convert OpenClaw manifest → Jait manifest (for UI display)         */
/* ------------------------------------------------------------------ */

export function openclawToJaitManifest(oc: OpenClawManifest, _dir: string): JaitManifest {
  return {
    id: `openclaw:${oc.id}`,
    displayName: oc.name ?? oc.id,
    version: oc.version ?? "0.0.0",
    description: oc.description,
    author: "OpenClaw",
    main: "index.ts",
    categories: ["openclaw"],
    configSchema: oc.configSchema as JaitManifest["configSchema"],
    contributes: {
      tools: oc.contracts?.tools?.map((name) => ({ name, description: name })),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Load a single OpenClaw plugin as a Jait PluginModule               */
/* ------------------------------------------------------------------ */

export function createOpenClawPluginModule(
  manifest: OpenClawManifest,
  dir: string,
): PluginModule {
  const jaitId = `openclaw:${manifest.id}`;
  let disposeCallbacks: (() => void | Promise<void>)[] = [];

  return {
    id: jaitId,
    displayName: manifest.name ?? manifest.id,

    async setup(ctx: PluginContext): Promise<PluginContribution> {
      const pluginConfig = ctx.getConfig();
      const api = createStubApi(manifest, pluginConfig, ctx.log);
      api.rootDir = dir;

      // Try to import the plugin entry
      // OpenClaw plugins use index.ts or index.js
      const candidates = ["index.ts", "index.js", "index.mjs"];
      let loaded = false;

      for (const candidate of candidates) {
        const entryPath = resolve(dir, candidate);
        try {
          const entryStat = await stat(entryPath).catch(() => null);
          if (!entryStat?.isFile()) continue;

          const mod = await import(entryPath);
          const definition = mod.default ?? mod.plugin ?? mod;

          if (typeof definition === "function") {
            // Direct function export: (api) => void
            await definition(api);
            loaded = true;
            break;
          } else if (definition && typeof definition === "object") {
            if (typeof definition.register === "function") {
              await definition.register(api);
              loaded = true;
              break;
            } else if (typeof definition.activate === "function") {
              await definition.activate(api);
              loaded = true;
              break;
            }
          }
        } catch (err) {
          ctx.log.warn(`Failed to load OpenClaw plugin entry ${entryPath}: ${err}`);
        }
      }

      if (!loaded) {
        ctx.log.warn(`OpenClaw plugin ${manifest.id}: no loadable entry found in ${dir}`);
      }

      // Convert collected tools
      const tools: PluginToolDeclaration[] = (api as unknown as StubApi).tools.map(
        (t) => convertTool(jaitId, t),
      );

      const unsupported = (api as unknown as StubApi).unsupported;
      if (unsupported.length > 0) {
        const methods = [...new Set(unsupported.map((u) => u.method))];
        ctx.log.info(
          `OpenClaw plugin ${manifest.id}: ${tools.length} tool(s) bridged, ` +
          `${unsupported.length} unsupported registration(s) skipped (${methods.join(", ")})`,
        );
      } else if (tools.length > 0) {
        ctx.log.info(`OpenClaw plugin ${manifest.id}: ${tools.length} tool(s) bridged`);
      }

      return { tools };
    },

    async dispose(): Promise<void> {
      for (const cb of disposeCallbacks) {
        try { await cb(); } catch { /* best effort */ }
      }
      disposeCallbacks = [];
    },
  };
}
