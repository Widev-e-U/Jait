/**
 * Shared types for agent threads and CLI providers.
 *
 * These types are consumed by both the gateway (backend) and
 * the web app (frontend) for the parallel-agents UI.
 */

// ── Provider identity ────────────────────────────────────────────────

export type ProviderId = string;

/**
 * HTTP backend the built-in `jait` provider sends its OpenAI-compatible
 * /chat/completions requests to. Shared so the gateway's settings validation
 * and the web app's settings UI can never drift apart on the allowed values.
 *
 * - `openai`     — OpenAI or any OPENAI_BASE_URL-compatible endpoint
 * - `openrouter` — OpenRouter's hosted catalogue
 * - `ollama`     — a local Ollama server
 * - `omniroute`  — a local OmniRoute router (default http://localhost:20128/v1)
 */
export type JaitBackend = "openai" | "openrouter" | "ollama" | "omniroute";

export const JAIT_BACKENDS: readonly JaitBackend[] = [
  "openai",
  "openrouter",
  "ollama",
  "omniroute",
];

export function isJaitBackend(value: unknown): value is JaitBackend {
  return typeof value === "string" && (JAIT_BACKENDS as readonly string[]).includes(value);
}

export function providerTypeFromId(providerId: ProviderId): ProviderId {
  if (providerId.startsWith("codex-")) return "codex";
  if (providerId.startsWith("claude-code-")) return "claude-code";
  return providerId;
}

export interface ProviderInfo {
  id: ProviderId;
  providerType?: ProviderId;
  name: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  modes: RuntimeMode[];
  auth?: ProviderAuthInfo;
  /**
   * Device the provider actually runs on: `"gateway"` for gateway-hosted
   * providers, otherwise the connected node's id. Every provider belongs to
   * exactly one device — clients scope and route by this field instead of
   * re-deriving device ownership from node capability lists.
   */
  nodeId?: string;
  /** Human-readable name of {@link nodeId} ("Gateway", "Windows workstation", …). */
  nodeName?: string;
}

export type RuntimeMode = "full-access" | "supervised";
export type ThreadKind = "delivery" | "delegation";

export interface ProviderAuthCapabilities {
  login: boolean;
  logout: boolean;
  deviceCode: boolean;
}

export interface ProviderAuthInfo extends ProviderAuthCapabilities {
  authenticated?: boolean | null;
  detail?: string;
  username?: string;
}

export interface ProviderAuthStatus extends ProviderAuthCapabilities {
  authenticated: boolean | null;
  detail?: string;
  username?: string;
}

export interface ProviderLoginResult {
  ok: boolean;
  status: "started" | "completed" | "unsupported" | "error";
  providerId: ProviderId;
  message: string;
  verificationUri?: string;
  userCode?: string;
  rawOutput?: string;
  requiresCodeInput?: boolean;
  inputPrompt?: string;
}

export interface ProviderLogoutResult {
  ok: boolean;
  status: "completed" | "unsupported" | "error";
  providerId: ProviderId;
  message: string;
  rawOutput?: string;
}

export interface ProviderModelInfo {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  group?: string;
  /** Model accepts a provider-specific reasoning/thinking effort option. */
  reasoningEffortSupported?: boolean;
  /** Exact effort values advertised by the provider for this model. */
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string;
    description?: string;
  }>;
}

export interface RemoteProviderStatus {
  id: ProviderId;
  providerType?: ProviderId;
  name?: string;
  installed: boolean;
  authenticated: boolean | null;
  detail?: string;
}

export interface RemoteProviderInfo {
  nodeId: string;
  nodeName: string;
  platform: string;
  providers: string[];
  availableProviderTypes?: string[];
  providerStatuses?: RemoteProviderStatus[];
}

// ── Routing plan ─────────────────────────────────────────────────────

/**
 * Intent classification for the thread router.
 * Determines what kind of problem-solving approach is needed.
 */
export type ThreadIntent =
  | "coding"          // write/modify/refactor code
  | "debugging"       // diagnose and fix errors
  | "research"        // investigate, compare, gather information
  | "review"          // code review, PR review, quality assessment
  | "planning"        // architecture, design, task breakdown
  | "devops"          // deploy, CI/CD, infrastructure
  | "data"            // data analysis, transformation, querying
  | "general";        // conversation, questions, misc

/**
 * Execution topology — how many threads the router recommends.
 */
export type ExecutionTopology =
  | "single"          // one delivery thread handles it all
  | "delegated";      // delivery thread + spawned helper threads

/**
 * The router's output: a plan for how to execute the thread's task.
 * Stored on the thread and injected into the agent's context.
 */
export interface RoutingPlan {
  /** Classified intent of the task. */
  intent: ThreadIntent;
  /** Why the router chose this plan — shown in UI and given to agent. */
  reason: string;
  /** Suggested skills (by id) that match the task. */
  suggestedSkillIds: string[];
  /** Whether the task would benefit from helper threads. */
  topology: ExecutionTopology;
  /** Specific sub-tasks for helpers, if topology is "delegated". */
  subtasks?: string[];
  /** Timestamp of when routing was computed. */
  routedAt: string;
}

// ── Thread status ────────────────────────────────────────────────────

export type ThreadStatus =
  | "idle"
  | "running"
  | "completed"
  | "error"
  | "interrupted";

// ── Thread info (DB row shape) ───────────────────────────────────────

export interface ThreadInfo {
  id: string;
  userId: string | null;
  sessionId: string | null;
  title: string;
  providerId: ProviderId;
  model: string | null;
  runtimeMode: RuntimeMode;
  kind: ThreadKind;
  skillIds: string[] | null;
  workingDirectory: string | null;
  branch: string | null;
  status: ThreadStatus;
  providerSessionId: string | null;
  error: string | null;
  prUrl: string | null;
  prNumber: number | null;
  prTitle: string | null;
  prBaseBranch: string | null;
  prState: "creating" | "open" | "closed" | "merged" | null;
  executionNodeId: string | null;
  executionNodeName: string | null;
  routingPlan: RoutingPlan | null;
  changeFiles: number | null;
  changeInsertions: number | null;
  changeDeletions: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ThreadRegistrySnapshot {
  serverTime: string;
  threads: ThreadInfo[];
  hasMore?: boolean;
}

export type AgentThread = ThreadInfo;

// ── Thread activity ──────────────────────────────────────────────────

export type ThreadActivityKind =
  | "tool.start"
  | "tool.result"
  | "tool.error"
  | "tool.approval"
  | "skill.active"
  | "message"
  | "error"
  | "session"
  | "activity";

export interface ThreadActivity {
  id: string;
  threadId: string;
  kind: string; // ThreadActivityKind or custom
  summary: string;
  payload?: unknown;
  createdAt: string;
}

// ── Create / Update params ───────────────────────────────────────────

export interface CreateThreadRequest {
  sessionId?: string;
  title: string;
  providerId: ProviderId;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: ThreadKind;
  skillIds?: string[] | null;
  workingDirectory?: string;
  branch?: string;
  prBaseBranch?: string | null;
}

export interface CreateThreadParams extends CreateThreadRequest {
  userId?: string;
}

export interface UpdateThreadRequest {
  title?: string;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: ThreadKind;
  skillIds?: string[] | null;
  workingDirectory?: string;
  branch?: string;
  prUrl?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prBaseBranch?: string | null;
  prState?: "creating" | "open" | "closed" | "merged" | null;
}

export interface UpdateThreadParams extends Omit<UpdateThreadRequest, "workingDirectory" | "branch"> {
  providerId?: ProviderId;
  workingDirectory?: string | null;
  branch?: string | null;
  status?: ThreadStatus;
  providerSessionId?: string | null;
  error?: string | null;
  completedAt?: string | null;
  executionNodeId?: string | null;
  executionNodeName?: string | null;
  routingPlan?: RoutingPlan | null;
  changeFiles?: number | null;
  changeInsertions?: number | null;
  changeDeletions?: number | null;
}

// ── Thread WS events ────────────────────────────────────────────────

export type ThreadWsEventType =
  | "thread.created"
  | "thread.updated"
  | "thread.deleted"
  | "thread.status"
  | "thread.activity";

export interface ThreadWsEvent {
  type: ThreadWsEventType;
  threadId: string;
  data: unknown;
}
