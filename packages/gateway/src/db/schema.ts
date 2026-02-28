/**
 * Drizzle ORM schema for ~/.jait/data/jait.db
 *
 * Tables: sessions, audit_log, trust_levels, consent_log
 * All IDs are UUIDv7 (sortable by time). Single-operator — no users table.
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ─── Sessions ────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // UUIDv7
  name: text("name"),
  workspacePath: text("workspace_path"),
  createdAt: text("created_at").notNull(),
  lastActiveAt: text("last_active_at").notNull(),
  status: text("status").default("active"), // 'active' | 'archived' | 'deleted'
  metadata: text("metadata"), // JSON
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
