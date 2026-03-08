export type { SurfaceType, SurfaceCapabilities, SurfaceInfo } from "./surface.js";
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
  WorkspaceOpenData,
  WorkspaceCloseData,
  TerminalFocusData,
  FileHighlightData,
  ScreenShareOpenData,
} from "./message.js";
export type { GatewayStatus, DeviceInfo, FsNode, FsBrowseEntry, FsBrowseResponse, FsRootsResponse } from "./gateway.js";

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
  CreateThreadParams,
  UpdateThreadParams,
  ThreadWsEventType,
  ThreadWsEvent,
} from "./thread.js";
