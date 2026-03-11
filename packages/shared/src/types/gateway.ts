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

/**
 * A filesystem node — a device that can expose its local filesystem
 * for remote browsing through the gateway.
 */
export interface FsNode {
  id: string;
  name: string;
  platform: "windows" | "macos" | "linux" | "android" | "ios";
  /** The WS client ID that owns this node (used for proxying requests) */
  clientId: string;
  /** Whether this is the gateway server itself (uses local fs, no WS proxy needed) */
  isGateway: boolean;
  /** CLI providers available on this node (e.g. ["codex", "claude-code"]) */
  providers?: string[];
  registeredAt: string;
}

/** Entry returned by filesystem browse operations */
export interface FsBrowseEntry {
  name: string;
  path: string;
  type: "dir" | "file";
}

/** Response from a filesystem browse request */
export interface FsBrowseResponse {
  path: string;
  parent: string | null;
  entries: FsBrowseEntry[];
}

/** Response from a filesystem roots request */
export interface FsRootsResponse {
  roots: FsBrowseEntry[];
}
