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
  WorkspaceOpenData,
  WorkspaceCloseData,
  TerminalFocusData,
  FileHighlightData,
} from "./message.js";
export type { GatewayStatus, DeviceInfo } from "./gateway.js";

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
