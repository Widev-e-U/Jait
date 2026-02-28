export interface PluginContext {
  gatewayVersion: string;
  workspaceRoot: string;
}

export interface PluginModule {
  id: string;
  displayName: string;
  setup(context: PluginContext): Promise<void>;
  dispose(): Promise<void>;
}
