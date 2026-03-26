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

export interface PluginContext {
  gatewayVersion: string;
  workspaceRoot: string;
}

export interface PluginDescriptor {
  id: string;
  displayName: string;
}

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

export interface PluginContribution {
  tools?: PluginToolDeclaration[];
  settingsSchema?: ToolParametersSchema;
  permissions?: ToolPermission[];
}

export interface PluginModule extends PluginDescriptor {
  setup(context: PluginContext): Promise<PluginContribution | void>;
  dispose(): Promise<void>;
}
