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
  ResponseStyle,
  DevPreviewPanelState,
  ProjectUIState,
  ProjectOpenData,
  ProjectCloseData,
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
  ProviderAuthCapabilities,
  ProviderAuthInfo,
  ProviderAuthStatus,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  RemoteProviderInfo,
  RuntimeMode,
  ThreadKind,
  ThreadIntent,
  ExecutionTopology,
  RoutingPlan,
  ThreadStatus,
  ThreadInfo,
  AgentThread,
  ThreadActivityKind,
  ThreadActivity,
  ThreadRegistrySnapshot,
  CreateThreadRequest,
  CreateThreadParams,
  UpdateThreadRequest,
  UpdateThreadParams,
  ThreadWsEventType,
  ThreadWsEvent,
} from "./thread.js";

export type {
  AutomationRepo,
  CreateRepoRequest,
  UpdateRepoRequest,
  PlanStatus,
  PlanTaskStatus,
  PlanTask,
  AutomationPlan,
  CreatePlanRequest,
  UpdatePlanRequest,
  GeneratePlanTasksRequest,
  JaitTodoStatus,
  JaitTodoPriority,
  JaitTodo,
  RepoProposal,
  CreateJaitTodoRequest,
  CreateRepoProposalRequest,
  UpdateJaitTodoRequest,
  UpdateRepoProposalRequest,
  GenerateJaitTodosRequest,
  ReminderStatus,
  ReminderSession,
  ReminderProject,
  ReminderRecord,
  ReminderSnapshot,
  CreateReminderRequest,
  UpdateReminderRequest,
  UserSecretRecord,
  CreateUserSecretRequest,
} from "./automation.js";

export type {
  AssistantProfile,
  CreateAssistantProfileParams,
  UpdateAssistantProfileParams,
} from "./assistant.js";

export type {
  EnvironmentProject,
  EnvironmentRepository,
  EnvironmentConnector,
  EnvironmentSnapshot,
} from "./environment.js";

export type {
  PluginStatus,
  PluginInfo,
  SkillInfo,
  ClawHubSkillListing,
  ClawHubPackageListing,
} from "./plugin.js";

export type {
  VoiceAssistantStatus,
  VoiceAssistantState,
  VoiceClientMessage,
  VoiceServerMessage,
} from "./voice-assistant.js";
export { VOICE_ASSISTANT_INITIAL_STATE } from "./voice-assistant.js";
