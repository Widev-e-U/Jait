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

export type NodeSurfaceType = "terminal" | "filesystem" | "browser";

export interface NodeCapabilities {
  providers: string[];
  surfaces: NodeSurfaceType[];
  tools: string[];
  screenShare: boolean;
  voice: boolean;
  preview: boolean;
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
