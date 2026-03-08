/**
 * Drizzle ORM schema for ~/.jait/data/jait.db
 *
 * Tables: sessions, audit_log, trust_levels, consent_log, consent_session_approvals
 * All IDs are UUIDv7 (sortable by time). Single-operator — no users table.
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ─── Sessions ────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // UUIDv7
  userId: text("user_id"),
  name: text("name"),
  workspacePath: text("workspace_path"),
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
  sttProvider: text("stt_provider").notNull().default("simulated"), // 'simulated' | 'browser'
  chatProvider: text("chat_provider").notNull().default("jait"), // 'jait' | 'codex' | 'claude-code'
  updatedAt: text("updated_at").notNull(),
});

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
    workingDirectory: text("working_directory"),
    branch: text("branch"), // Git branch name
    status: text("status").notNull().default("idle"), // idle | running | completed | error | interrupted
    providerSessionId: text("provider_session_id"), // Active provider session ID
    error: text("error"),
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
    workspaceRoot: text("workspace_root"),
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
