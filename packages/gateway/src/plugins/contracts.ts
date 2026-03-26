import type { ToolDefinition, ToolParametersSchema } from "../tools/contracts.js";
import type { ToolPermission } from "../security/tool-permissions.js";

export interface PluginContext {
  gatewayVersion: string;
  workspaceRoot: string;
}

export interface PluginContribution {
  tools?: ToolDefinition[];
  settingsSchema?: ToolParametersSchema;
  permissions?: ToolPermission[];
}

export interface PluginModule {
  id: string;
  displayName: string;
  setup(context: PluginContext): Promise<PluginContribution | void>;
  dispose(): Promise<void>;
}
