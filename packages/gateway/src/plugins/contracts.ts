import type {
  PluginToolSourceMetadata,
  ToolCategory,
  ToolConsentLevel,
  ToolDefinition,
  ToolParametersSchema,
  ToolRisk,
  ToolTier,
} from "../tools/contracts.js";
import type { ToolPermission } from "../security/tool-permissions.js";
import type { PluginManifest } from "./manifest.js";

/* ------------------------------------------------------------------ */
/*  Core descriptor / context                                          */
/* ------------------------------------------------------------------ */

export interface PluginContext {
  gatewayVersion: string;
  workspaceRoot: string;
  /** Read plugin-scoped config (persisted in DB). */
  getConfig<T = Record<string, unknown>>(): T;
  /** Write plugin-scoped config. */
  setConfig(value: Record<string, unknown>): Promise<void>;
  /** Scoped logger. */
  log: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export interface PluginDescriptor {
  id: string;
  displayName: string;
}

/* ------------------------------------------------------------------ */
/*  Tool declarations                                                  */
/* ------------------------------------------------------------------ */

export interface PluginToolDeclaration<TInput = unknown>
  extends Omit<ToolDefinition<TInput>, "source" | "sourceMetadata" | "risk" | "defaultConsentLevel" | "tier" | "category"> {
  tier: ToolTier;
  category: ToolCategory;
  risk: ToolRisk;
  defaultConsentLevel: ToolConsentLevel;
}

export function buildPluginToolSourceMetadata(plugin: PluginDescriptor): PluginToolSourceMetadata {
  return {
    kind: "plugin",
    pluginId: plugin.id,
    pluginDisplayName: plugin.displayName,
  };
}

export function toPluginToolDefinition<TInput = unknown>(
  plugin: PluginDescriptor,
  tool: PluginToolDeclaration<TInput>,
): ToolDefinition<TInput> {
  return {
    ...tool,
    source: `plugin:${plugin.id}`,
    sourceMetadata: buildPluginToolSourceMetadata(plugin),
  };
}

/* ------------------------------------------------------------------ */
/*  Plugin contribution + module lifecycle                             */
/* ------------------------------------------------------------------ */

export interface PluginContribution {
  tools?: PluginToolDeclaration[];
  settingsSchema?: ToolParametersSchema;
  permissions?: ToolPermission[];
}

export interface PluginModule extends PluginDescriptor {
  setup(context: PluginContext): Promise<PluginContribution | void>;
  dispose(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Runtime state tracked by the plugin manager                        */
/* ------------------------------------------------------------------ */

export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

/** Persisted metadata about an installed plugin (stored in DB). */
export interface InstalledPlugin {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
  /** Absolute path to the plugin's root directory. */
  path: string;
  status: PluginStatus;
  /** Plugin-scoped user config (JSON blob). */
  config: Record<string, unknown>;
  /** Error message when status === "error". */
  error?: string;
  installedAt: string;
  updatedAt: string;
}

/** Runtime handle for a loaded plugin (in-memory only). */
export interface LoadedPlugin {
  manifest: PluginManifest;
  installed: InstalledPlugin;
  module: PluginModule | null;
  contribution: PluginContribution | null;
}

/* ------------------------------------------------------------------ */
/*  SDK helper                                                         */
/* ------------------------------------------------------------------ */

export interface PluginEntry {
  id: string;
  displayName: string;
  setup(context: PluginContext): Promise<PluginContribution | void>;
  dispose?(): Promise<void>;
}

/** Convenience wrapper for plugin authors. */
export function definePlugin(entry: PluginEntry): PluginModule {
  return {
    id: entry.id,
    displayName: entry.displayName,
    setup: entry.setup,
    dispose: entry.dispose ?? (async () => {}),
  };
}
