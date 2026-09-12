/** Native Tauri hosting contract. This is not a remotely callable gateway API. */
export interface DesktopGatewayConfig {
  mode: 'local' | 'remote';
  remoteUrl: string | null;
  port: number;
  allowNetwork: boolean;
}
export interface DesktopGatewayStatus {
  config: DesktopGatewayConfig;
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';
  url: string | null;
  error: string | null;
  logs: string[];
}
