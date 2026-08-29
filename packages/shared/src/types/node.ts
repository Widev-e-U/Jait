export const NODE_PROTOCOL_VERSION = 1;

export type NodePlatform =
  | "windows"
  | "macos"
  | "linux"
  | "android"
  | "ios"
  | "web";

export type NodeRole =
  | "gateway"
  | "desktop"
  | "mobile"
  | "browser"
  | "remote";

export type NodeSurfaceType = "terminal" | "filesystem" | "browser" | "computer";

export interface NodeCapabilities {
  providers: string[];
  surfaces: NodeSurfaceType[];
  tools: string[];
  screenShare: boolean;
  voice: boolean;
  preview: boolean;
  /**
   * Whether the node responds to the acknowledged `terminal.op-request` RPC
   * (interactive remote terminals). Older nodes advertise a "terminal" surface
   * (subscribe/output only) but never answer op-requests; the gateway uses this
   * flag to fast-fail instead of hanging on the 30s op timeout.
   */
  interactiveTerminal?: boolean;
}

export interface NodeHelloPayload {
  id: string;
  name: string;
  platform: NodePlatform;
  role?: NodeRole;
  protocolVersion?: number;
  capabilities?: Partial<NodeCapabilities>;
}

export interface NodeState {
  id: string;
  name: string;
  platform: NodePlatform;
  role: NodeRole;
  lifecycle: "ready" | "disconnected";
  protocolVersion: number;
  capabilities: NodeCapabilities;
  connectedAt: string;
  lastSeenAt: string;
}

export interface NodeRegistrySnapshot {
  version: number;
  serverTime: string;
  nodes: NodeState[];
}

// ─── Node capability grants (trust model) ─────────────────────────────
export type NodeCapability =
  | "terminal"
  | "filesystem"
  | "screen"
  | "input"
  | "voice"
  | "browser"
  | "camera"
  | "network"
  | "agent";

export const NODE_CAPABILITIES: readonly NodeCapability[] = [
  "terminal",
  "filesystem",
  "screen",
  "input",
  "voice",
  "browser",
  "camera",
  "network",
  "agent",
];

export interface NodePermissionRecord {
  nodeId: string;
  capability: NodeCapability;
  granted: boolean;
}

/** A node with its full permission grant map attached (settings UI + enforcement view). */
export interface NodeWithPermissions extends NodeState {
  firstSeenAt?: string;
  permissions: Record<NodeCapability, boolean>;
}
