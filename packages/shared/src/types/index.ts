export type { SurfaceType, SurfaceCapabilities, SurfaceInfo, SurfaceRegistryEntry, SurfaceRegistrySnapshot } from "./surface.js";
export { SURFACE_TYPES } from "./surface.js";
export type { SessionInfo, SessionCreateParams } from "./session.js";
export type {
  ActionStatus,
  ActionResponse,
  AuditEntry,
} from "./action.js";
export type {
  MessageRole,
  ChatMessage,
  ToolCall,
  WsEventType,
  WsEvent,
  UICommandType,
  UICommandPayload,
  UIStateKey,
  UIStateUpdate,
  DevPreviewPanelState,
  WorkspaceUIState,
  WorkspaceOpenData,
  WorkspaceCloseData,
  TerminalFocusData,
  FileHighlightData,
  DevPreviewOpenData,
  ScreenShareOpenData,
  ArchitectureUpdateData,
  FsChangeType,
  FsChangeEvent,
  FsChangesPayload,
} from "./message.js";
export type { GatewayStatus, DeviceInfo, FsNode, FsBrowseEntry, FsBrowseResponse, FsRootsResponse } from "./gateway.js";
export type {
  NodePlatform,
  NodeRole,
  NodeSurfaceType,
  NodeCapabilities,
  NodeHelloPayload,
  NodeState,
  NodeRegistrySnapshot,
} from "./node.js";
export { NODE_PROTOCOL_VERSION } from "./node.js";

export type {
  NetworkHost,
  NetworkScanResult,
  SshTestResult,
  DeployStatus,
  GatewayNode,
} from "./network.js";

export type {
  DevicePlatform,
  ScreenShareDevice,
  ScreenShareRouteMode,
  ScreenShareViewer,
  ScreenShareSessionState,
  OsToolNetworkShareState,
  ScreenShareOffer,
  ScreenShareAnswer,
  ScreenShareIceCandidate,
  ScreenShareSignalType,
  ScreenShareStartRequest,
  ScreenShareStopRequest,
} from "./screen-share.js";

export type {
  ProviderId,
  ProviderInfo,
  RuntimeMode,
  ThreadStatus,
  ThreadInfo,
  ThreadActivityKind,
  ThreadActivity,
  ThreadRegistrySnapshot,
  CreateThreadParams,
  UpdateThreadParams,
  ThreadWsEventType,
  ThreadWsEvent,
} from "./thread.js";

export type {
  AssistantProfile,
  CreateAssistantProfileParams,
  UpdateAssistantProfileParams,
} from "./assistant.js";

export type {
  EnvironmentWorkspace,
  EnvironmentRepository,
  EnvironmentConnector,
  EnvironmentSnapshot,
} from "./environment.js";
