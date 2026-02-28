// @jait/shared — Gateway / health types
export interface GatewayStatus {
  version: string;
  uptime: number;
  sessions: number;
  surfaces: number;
  devices: number;
  healthy: boolean;
}

export interface DeviceInfo {
  id: string;
  name: string;
  platform: "desktop" | "mobile" | "browser";
  capabilities: string[];
  connectedAt: string;
  lastSeen: string;
}
