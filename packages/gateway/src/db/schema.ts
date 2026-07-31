/**
 * Drizzle ORM schema for ~/.jait/data/jait.db
 *
 * Tables: sessions, audit_log, trust_levels, consent_log, consent_session_approvals
 * All IDs are UUIDv7 (sortable by time). Single-operator — no users table.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ─── Projects ──────────────────────────────────────────────────────
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    title: text("title"),
    rootPath: text("root_path"),
    nodeId: text("node_id"),
    createdAt: text("created_at").notNull(),
    lastActiveAt: text("last_active_at").notNull(),
    status: text("status").default("active"),
    metadata: text("metadata"),
  },
  (table) => [
    index("idx_projects_user_status").on(table.userId, table.status, table.lastActiveAt),
    index("idx_projects_user_root").on(table.userId, table.rootPath, table.nodeId),
  ],
);

// ─── Sessions ────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // UUIDv7
  userId: text("user_id"),
  projectId: text("project_id"),
  name: text("name"),
  projectPath: text("project_path"),
  createdAt: text("created_at").notNull(),
  lastActiveAt: text("last_active_at").notNull(),
  status: text("status").default("active"), // 'active' | 'archived' | 'deleted'
  metadata: text("metadata"), // JSON
});

// ─── Users ───────────────────────────────────────────────────────────
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_users_username").on(table.username),
  ],
);

// ─── User Settings ───────────────────────────────────────────────────
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey(),
  theme: text("theme").notNull().default("system"), // 'light' | 'dark' | 'system'
  apiKeys: text("api_keys"), // JSON object
  disabledTools: text("disabled_tools"), // JSON string[] of disabled tool names
  sttProvider: text("stt_provider").notNull().default("whisper"), // 'whisper' | 'wyoming' | 'gpt' | 'elevenlabs'
  chatProvider: text("chat_provider").notNull().default("jait"),
  jaitBackend: text("jait_backend").notNull().default("openai"), // 'openai' | 'openrouter'
  recentModels: text("recent_models"), // JSON string[] of recently used model ids
  selectedModel: text("selected_model"), // last model id picked in the UI; used by background channels (e.g. WhatsApp)
  reasoningEffort: text("reasoning_effort"), // 'minimal' | 'low' | 'medium' | 'high' | null (only for reasoning-capable models)
  projectPickerPath: text("project_picker_path"),
  projectPickerNodeId: text("project_picker_node_id"),
  // Explicit "last selected" project/session, set only when the user picks
  // one in the UI. Distinct from sessions.lastActiveAt, which is bumped by
  // any activity (including background automation) and must not be used to
  // decide what reopens on reload.
  lastSelectedProjectId: text("last_selected_project_id"),
  lastSelectedSessionId: text("last_selected_session_id"),
  lastSelectedAt: text("last_selected_at"),
  updatedAt: text("updated_at").notNull(),
});

export const providerAccounts = sqliteTable(
  "provider_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    providerType: text("provider_type").notNull(),
    nodeId: text("node_id").notNull().default("gateway"),
    label: text("label").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_provider_accounts_user_node_type_label").on(table.userId, table.nodeId, table.providerType, table.label),
    index("idx_provider_accounts_user").on(table.userId, table.updatedAt),
  ],
);

// ─── Provider Usage (subscription rate limits) ───────────────────────
export const providerUsage = sqliteTable(
  "provider_usage",
  {
    accountId: text("account_id").notNull(),
    rateLimitType: text("rate_limit_type").notNull(), // 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage' | ...
    providerType: text("provider_type").notNull(),
    status: text("status"), // 'allowed' | 'allowed_warning' | 'rejected'
    utilization: real("utilization"), // fraction 0-1, as reported by the provider SDK
    resetsAt: text("resets_at"), // ISO timestamp
    isUsingOverage: integer("is_using_overage").notNull().default(0),
    rawJson: text("raw_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_provider_usage_account_type").on(table.accountId, table.rateLimitType),
  ],
);

// ─── Assistant Profiles ─────────────────────────────────────────────
export const assistantProfiles = sqliteTable(
  "assistant_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt"),
    runtimeMode: text("runtime_mode"),
    toolProfile: text("tool_profile"),
    enabledSkills: text("enabled_skills"),
    enabledPlugins: text("enabled_plugins"),
    isDefault: integer("is_default").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_assistant_profiles_user").on(table.userId, table.updatedAt),
  ],
);

// ─── Audit Log ───────────────────────────────────────────────────────
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(), // UUIDv7
    timestamp: text("timestamp").notNull(), // ISO 8601

    // Context
    sessionId: text("session_id"),
    surfaceType: text("surface_type"),
    deviceId: text("device_id"),

    // What
    actionId: text("action_id").unique(),
    actionType: text("action_type"), // 'tool_call', 'consent', 'message', etc.
    toolName: text("tool_name"),

    // Details (JSON strings)
    inputs: text("inputs"),
    outputs: text("outputs"),
    sideEffects: text("side_effects"),

    // Verification
    signature: text("signature"),
    parentActionId: text("parent_action_id"),

    // Status
    status: text("status"), // 'pending','approved','executed','failed','reverted'
    consentMethod: text("consent_method"), // 'auto','confirm','voice'
  },
  (table) => [
    index("idx_audit_action_id").on(table.actionId),
    index("idx_audit_session").on(table.sessionId, table.timestamp),
    index("idx_audit_surface").on(table.surfaceType, table.timestamp),
    index("idx_audit_device").on(table.deviceId, table.timestamp),
  ],
);

// ─── Trust Levels ────────────────────────────────────────────────────
export const trustLevels = sqliteTable("trust_levels", {
  actionType: text("action_type").primaryKey(), // e.g. 'terminal.run'
  approvedCount: integer("approved_count").default(0),
  revertedCount: integer("reverted_count").default(0),
  currentLevel: integer("current_level").default(0), // 0=observer,1=assisted,2=trusted,3=autopilot
});

// ─── Consent Log ─────────────────────────────────────────────────────
export const consentLog = sqliteTable("consent_log", {
  id: text("id").primaryKey(),
  actionId: text("action_id").notNull(),
  toolName: text("tool_name").notNull(),
  decision: text("decision").notNull(), // 'approved','rejected','timeout'
  decidedAt: text("decided_at").notNull(),
  decidedVia: text("decided_via"), // 'click','voice','auto'
});

// ─── Session-Level Consent Overrides ────────────────────────────────
export const consentSessionApprovals = sqliteTable("consent_session_approvals", {
  sessionId: text("session_id").primaryKey(),
  approveAll: integer("approve_all").notNull().default(1), // 1 = enabled
  updatedAt: text("updated_at").notNull(),
});


// ─── Memories ───────────────────────────────────────────────────────
export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    content: text("content").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceSurface: text("source_surface").notNull(),
    embedding: text("embedding").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("idx_memories_scope").on(table.scope, table.createdAt),
    index("idx_memories_expires").on(table.expiresAt),
  ],
);

// ─── User Secrets ───────────────────────────────────────────────────
export const userSecrets = sqliteTable(
  "user_secrets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    type: text("type").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    uniqueIndex("idx_user_secrets_unique").on(table.userId, table.type, table.key),
    index("idx_user_secrets_user_type").on(table.userId, table.type, table.updatedAt),
  ],
);

// ─── Email Accounts (connected mailboxes; OAuth tokens live in user_secrets) ──
export const emailAccounts = sqliteTable(
  "email_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    provider: text("provider").notNull(), // 'gmail' | 'outlook'
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    status: text("status").notNull().default("connected"), // 'connected' | 'error'
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_email_accounts_unique").on(table.userId, table.provider, table.email),
    index("idx_email_accounts_user").on(table.userId, table.updatedAt),
  ],
);

// ─── Calendar Accounts (connected calendars; OAuth tokens live in user_secrets) ──
export const calendarAccounts = sqliteTable(
  "calendar_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    provider: text("provider").notNull(), // 'google'
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    status: text("status").notNull().default("connected"), // 'connected' | 'error'
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_calendar_accounts_unique").on(table.userId, table.provider, table.email),
    index("idx_calendar_accounts_user").on(table.userId, table.updatedAt),
  ],
);

export const deviceCalendarSnapshots = sqliteTable(
  "device_calendar_snapshots",
  {
    accountId: text("account_id").primaryKey(),
    userId: text("user_id"),
    calendars: text("calendars").notNull().default("[]"),
    events: text("events").notNull().default("[]"),
    syncedAt: text("synced_at").notNull(),
  },
  (table) => [index("idx_device_calendar_snapshots_user").on(table.userId, table.syncedAt)],
);

// ─── Reminders ─────────────────────────────────────────────────────
export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    projectId: text("project_id"),
    sessionId: text("session_id"),
    content: text("content").notNull(),
    sourceType: text("source_type").notNull().default("agent"),
    sourceId: text("source_id"),
    sourceSurface: text("source_surface").notNull().default("chat"),
    status: text("status").notNull().default("active"),
    tags: text("tags").notNull().default("[]"),
    usageCount: integer("usage_count").notNull().default(0),
    lastRetrievedAt: text("last_retrieved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_reminders_user_status").on(table.userId, table.status, table.updatedAt),
    index("idx_reminders_project").on(table.projectId, table.updatedAt),
    index("idx_reminders_session").on(table.sessionId, table.updatedAt),
  ],
);

// ─── Chat Messages ───────────────────────────────────────────────────
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    role: text("role").notNull(), // 'user' | 'assistant'
    content: text("content").notNull(),
    toolCalls: text("tool_calls"), // JSON array of executed tool calls (nullable)
    segments: text("segments"), // JSON array of MessageSegment for interleaved rendering (nullable)
    contextFlow: text("context_flow"), // JSON snapshot of outbound LLM context for this assistant response
    thinking: text("thinking"), // Chain-of-thought / reasoning content (nullable)
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_messages_session").on(table.sessionId, table.createdAt),
  ],
);

// ─── Session State (per-session key-value UI/app state) ─────────────
export const sessionState = sqliteTable(
  "session_state",
  {
    sessionId: text("session_id").notNull(),
    key: text("key").notNull(),
    value: text("value"),       // JSON-serialized
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_session_state_session").on(table.sessionId),
  ],
);

// ─── Project State (per-project key-value UI/app state) ─────────
export const projectState = sqliteTable(
  "project_state",
  {
    projectId: text("project_id").notNull(),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_project_state_project").on(table.projectId),
  ],
);

// ─── Project Architecture Diagrams ───────────────────────────────
export const architectureDiagrams = sqliteTable(
  "architecture_diagrams",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    projectRoot: text("project_root").notNull(),
    diagram: text("diagram").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_architecture_diagrams_user_project").on(table.userId, table.projectRoot),
    index("idx_architecture_diagrams_updated").on(table.updatedAt),
  ],
);

// ─── Repository Code Graph Indexes ──────────────────────────────────
export const codeGraphIndexes = sqliteTable(
  "code_graph_indexes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    repositoryId: text("repository_id"),
    projectRoot: text("project_root").notNull(),
    provider: text("provider").notNull().default("graphify"),
    status: text("status").notNull().default("missing"),
    graphPath: text("graph_path"),
    graphVersion: text("graph_version"),
    sourceRevision: text("source_revision"),
    graphifyVersion: text("graphify_version"),
    stats: text("stats"),
    graphRagStatus: text("graphrag_status").notNull().default("not-prepared"),
    graphRagPath: text("graphrag_path"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_code_graph_indexes_user_project").on(table.userId, table.projectRoot),
    index("idx_code_graph_indexes_repository").on(table.repositoryId, table.updatedAt),
    index("idx_code_graph_indexes_status").on(table.status, table.updatedAt),
  ],
);

// ─── Agent Threads ───────────────────────────────────────────────────
export const agentThreads = sqliteTable(
  "agent_threads",
  {
    id: text("id").primaryKey(), // UUIDv7
    userId: text("user_id"),
    sessionId: text("session_id"), // Links to the chat session
    title: text("title").notNull(),
    providerId: text("provider_id").notNull(), // "jait" | "codex" | "claude-code"
    model: text("model"),
    runtimeMode: text("runtime_mode").notNull().default("full-access"), // "full-access" | "supervised"
    kind: text("kind").notNull().default("delivery"), // delivery | delegation
    skillIds: text("skill_ids"), // JSON string[] override; null => use global enabled skills
    workingDirectory: text("working_directory"),
    branch: text("branch"), // Git branch name
    status: text("status").notNull().default("running"), // running | completed | error | interrupted
    providerSessionId: text("provider_session_id"), // Active provider session ID
    error: text("error"),
    prUrl: text("pr_url"),
    prNumber: integer("pr_number"),
    prTitle: text("pr_title"),
    prBaseBranch: text("pr_base_branch"),
    prState: text("pr_state"), // open | closed | merged
    executionNodeId: text("execution_node_id"),   // Id of the FsNode executing this thread
    executionNodeName: text("execution_node_name"), // Human-readable node name
    routingPlan: text("routing_plan"), // JSON RoutingPlan from thread router
    changeFiles: integer("change_files"),   // persisted diff stats (files changed)
    changeInsertions: integer("change_insertions"), // persisted diff stats (lines added)
    changeDeletions: integer("change_deletions"),   // persisted diff stats (lines removed)
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_agent_threads_user").on(table.userId),
    index("idx_agent_threads_session").on(table.sessionId),
    index("idx_agent_threads_status").on(table.status),
    index("idx_agent_threads_updated").on(table.updatedAt),
  ],
);

// ─── Agent Thread Activities ─────────────────────────────────────────
export const agentThreadActivities = sqliteTable(
  "agent_thread_activities",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    kind: text("kind").notNull(), // "tool.start" | "tool.result" | "message" | "error" | "activity"
    summary: text("summary").notNull(),
    payload: text("payload"), // JSON
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_agent_thread_activities_thread").on(table.threadId, table.createdAt),
  ],
);

// ─── Automation Repositories ─────────────────────────────────────────
export const automationRepositories = sqliteTable(
  "automation_repositories",
  {
    id: text("id").primaryKey(), // UUIDv7
    userId: text("user_id"),
    deviceId: text("device_id"), // which client device registered this repo
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    localPath: text("local_path").notNull(),
    githubUrl: text("github_url"), // HTTPS clone URL for gateway-side cloning
    strategy: text("strategy"), // Markdown strategy/instructions for agent threads
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_automation_repos_user").on(table.userId),
  ],
);

// ─── Automation Plans ────────────────────────────────────────────────
export const automationPlans = sqliteTable(
  "automation_plans",
  {
    id: text("id").primaryKey(), // UUIDv7
    repoId: text("repo_id").notNull(),
    userId: text("user_id"),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"), // draft | active | completed | archived
    tasks: text("tasks").notNull().default("[]"), // JSON array of PlanTask objects
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_automation_plans_repo").on(table.repoId),
    index("idx_automation_plans_user").on(table.userId),
  ],
);

// ─── Automation Repo Proposals ───────────────────────────────────────
export const automationRepoProposals = sqliteTable(
  "automation_repo_proposals",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    userId: text("user_id"),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    dueDate: text("due_date"),
    tags: text("tags").notNull().default("[]"),
    completedAt: text("completed_at"),
    completionHistory: text("completion_history").notNull().default("[]"),
    sourceThreadId: text("source_thread_id"),
    sourceThreadTitle: text("source_thread_title"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_automation_repo_proposals_repo").on(table.repoId, table.updatedAt),
    index("idx_automation_repo_proposals_user").on(table.userId, table.updatedAt),
    index("idx_automation_repo_proposals_completed").on(table.repoId, table.completedAt),
  ],
);

// ─── Network Hosts (persistent scan results) ────────────────────────
export const networkHosts = sqliteTable(
  "network_hosts",
  {
    ip: text("ip").primaryKey(),
    mac: text("mac"),
    hostname: text("hostname"),
    osVersion: text("os_version"),
    openPorts: text("open_ports").notNull().default("[]"), // JSON number[]
    sshReachable: integer("ssh_reachable").notNull().default(0),
    agentStatus: text("agent_status").notNull().default("not-installed"),
    providers: text("providers"), // JSON string[] | null
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    scannedAt: text("scanned_at").notNull(),
  },
  (table) => [
    index("idx_network_hosts_last_seen").on(table.lastSeenAt),
  ],
);

// ─── Scheduled Jobs ──────────────────────────────────────────────────
export const scheduledJobs = sqliteTable(
  "scheduled_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    toolName: text("tool_name").notNull(),
    input: text("input"), // JSON object
    sessionId: text("session_id"),
    projectRoot: text("project_root"),
    enabled: integer("enabled").notNull().default(1),
    lastRunAt: text("last_run_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_scheduled_jobs_enabled").on(table.enabled),
    index("idx_scheduled_jobs_updated").on(table.updatedAt),
  ],
);

// ─── Scheduled Job Runs (persistent execution history) ───────────────
export const scheduledJobRuns = sqliteTable(
  "scheduled_job_runs",
  {
    id: text("id").primaryKey(), // UUIDv7
    jobId: text("job_id").notNull(),
    status: text("status").notNull().default("running"), // running | completed | failed
    triggeredBy: text("triggered_by").notNull().default("schedule"), // schedule | manual | maintenance
    output: text("output"), // stdout/stderr or summary text
    error: text("error"),
    planId: text("plan_id"), // FK → automation_plans.id if a fix plan was created
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_job_runs_job").on(table.jobId),
    index("idx_job_runs_started").on(table.startedAt),
  ],
);

export const mobilePushRegistrations = sqliteTable(
  "mobile_push_registrations",
  {
    deviceId: text("device_id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull().default("android"),
    enabled: integer("enabled").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_mobile_push_token").on(table.token),
    index("idx_mobile_push_user_enabled").on(
      table.userId,
      table.enabled,
      table.lastSeenAt,
    ),
  ],
);

// ─── Browser Collaboration ──────────────────────────────────────────
export const browserSessions = sqliteTable(
  "browser_sessions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    projectRoot: text("project_root"),
    targetUrl: text("target_url"),
    previewUrl: text("preview_url"),
    previewSessionId: text("preview_session_id"),
    browserId: text("browser_id"),
    mode: text("mode").notNull().default("shared"), // 'shared' | 'isolated'
    origin: text("origin").notNull().default("direct"), // 'attached' | 'managed' | 'direct'
    controller: text("controller").notNull().default("agent"), // 'agent' | 'user' | 'observer'
    status: text("status").notNull().default("ready"), // 'ready' | 'running' | 'paused' | 'intervention-required' | 'closed'
    secretSafe: integer("secret_safe").notNull().default(0),
    storageProfile: text("storage_profile"), // JSON
    createdBy: text("created_by"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_browser_sessions_browser").on(table.browserId),
    index("idx_browser_sessions_preview").on(table.previewSessionId),
    index("idx_browser_sessions_user_updated").on(table.createdBy, table.updatedAt),
  ],
);

export const browserInterventions = sqliteTable(
  "browser_interventions",
  {
    id: text("id").primaryKey(),
    browserSessionId: text("browser_session_id").notNull(),
    threadId: text("thread_id"),
    chatSessionId: text("chat_session_id"),
    kind: text("kind").notNull().default("custom"),
    reason: text("reason").notNull(),
    instructions: text("instructions").notNull(),
    status: text("status").notNull().default("open"), // 'open' | 'resolved' | 'cancelled'
    secretSafe: integer("secret_safe").notNull().default(0),
    allowUserNote: integer("allow_user_note").notNull().default(1),
    requestedBy: text("requested_by"),
    resolvedBy: text("resolved_by"),
    userNote: text("user_note"),
    requestedAt: text("requested_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_browser_interventions_session").on(table.browserSessionId, table.requestedAt),
    index("idx_browser_interventions_status").on(table.status, table.requestedAt),
  ],
);

// ─── Plugins ───────────────────────────────────────────────────────
export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  author: text("author"),
  path: text("path").notNull(),
  status: text("status").notNull().default("installed"), // 'installed' | 'enabled' | 'disabled' | 'error'
  config: text("config").notNull().default("{}"),
  error: text("error"),
  installedAt: text("installed_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
