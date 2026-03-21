/**
 * Numbered database migrations for Jait.
 *
 * Each migration has an `id` (monotonically increasing) and a `run` function
 * that receives the raw bun:sqlite Database handle.
 *
 * The migration runner (in connection.ts) tracks applied migrations in a
 * `_migrations` table and only runs new ones. This makes updates safe and
 * idempotent — deploy a new version and it picks up from where it left off.
 *
 * Rules for adding migrations:
 *   - Always append to the end of the array.
 *   - Never modify an existing migration's `run` function.
 *   - Use `CREATE TABLE IF NOT EXISTS` and try/catch `ALTER TABLE` for safety.
 *   - Give each migration a short human-readable `name`.
 */
import type { SqliteDatabase } from "./sqlite-shim.js";

export interface Migration {
  id: number;
  name: string;
  run: (db: SqliteDatabase) => void;
}

export const migrations: Migration[] = [
  // ─── 001: Baseline schema ──────────────────────────────────────────
  {
    id: 1,
    name: "baseline_schema",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT,
          workspace_path TEXT,
          created_at TEXT NOT NULL,
          last_active_at TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          metadata TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status, last_active_at DESC)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY,
          theme TEXT NOT NULL DEFAULT 'system',
          api_keys TEXT,
          stt_provider TEXT NOT NULL DEFAULT 'simulated',
          updated_at TEXT NOT NULL
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          session_id TEXT,
          surface_type TEXT,
          device_id TEXT,
          action_id TEXT UNIQUE,
          action_type TEXT,
          tool_name TEXT,
          inputs TEXT,
          outputs TEXT,
          side_effects TEXT,
          signature TEXT,
          parent_action_id TEXT,
          status TEXT,
          consent_method TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action_id ON audit_log(action_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id, timestamp DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_surface ON audit_log(surface_type, timestamp DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_device ON audit_log(device_id, timestamp DESC)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS trust_levels (
          action_type TEXT PRIMARY KEY,
          approved_count INTEGER DEFAULT 0,
          reverted_count INTEGER DEFAULT 0,
          current_level INTEGER DEFAULT 0
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS consent_log (
          id TEXT PRIMARY KEY,
          action_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          decision TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          decided_via TEXT
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS consent_session_approvals (
          session_id TEXT PRIMARY KEY,
          approve_all INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          content TEXT NOT NULL,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          source_surface TEXT NOT NULL,
          embedding TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          expires_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope, created_at)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_expires ON memories(expires_at)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_calls TEXT,
          created_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          cron TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          input TEXT,
          session_id TEXT,
          workspace_root TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_run_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_updated ON scheduled_jobs(updated_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_user_updated ON scheduled_jobs(user_id, updated_at DESC)`);
    },
  },

  // ─── 002: Legacy column migrations (safe re-runs) ─────────────────
  {
    id: 2,
    name: "legacy_column_additions",
    run(db) {
      // These were the old try/catch ALTER TABLEs — now tracked properly
      try { db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE scheduled_jobs ADD COLUMN user_id TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 003: disabled_tools in user_settings ──────────────────────────
  {
    id: 3,
    name: "user_settings_disabled_tools",
    run(db) {
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN disabled_tools TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 004: Session state (per-session key-value store) ──────────────
  {
    id: 4,
    name: "session_state_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_state (
          session_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (session_id, key)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_session_state_session ON session_state(session_id)`);
    },
  },
  // ─── 005: stt_provider in user_settings ────────────────────────────
  {
    id: 5,
    name: "user_settings_stt_provider",
    run(db) {
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN stt_provider TEXT NOT NULL DEFAULT 'simulated'`); } catch { /* exists */ }
    },
  },

  // ─── 006: segments column on messages ──────────────────────────────
  {
    id: 6,
    name: "messages_segments_column",
    run(db) {
      try { db.exec(`ALTER TABLE messages ADD COLUMN segments TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 007: Agent threads & activities ───────────────────────────────
  {
    id: 7,
    name: "agent_threads_tables",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_threads (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          session_id TEXT,
          title TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT,
          runtime_mode TEXT NOT NULL DEFAULT 'full-access',
          kind TEXT NOT NULL DEFAULT 'delivery',
          working_directory TEXT,
          branch TEXT,
          status TEXT NOT NULL DEFAULT 'idle',
          provider_session_id TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_threads_user ON agent_threads(user_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_threads_session ON agent_threads(session_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_threads_status ON agent_threads(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_threads_updated ON agent_threads(updated_at)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_thread_activities (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          payload TEXT,
          created_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_thread_activities_thread ON agent_thread_activities(thread_id, created_at)`);
    },
  },

  // ─── 008: Add chat_provider to user_settings ──────────────────────
  {
    id: 8,
    name: "user_settings_chat_provider",
    run(db) {
      try {
        db.exec(`ALTER TABLE user_settings ADD COLUMN chat_provider TEXT NOT NULL DEFAULT 'jait'`);
      } catch { /* column already exists */ }
    },
  },

  // ─── 009: Pull request metadata on agent_threads ──────────────────
  {
    id: 9,
    name: "agent_threads_pr_metadata",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN pr_url TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN pr_number INTEGER`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN pr_title TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN pr_state TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 010: Automation repositories table ────────────────────────────
  {
    id: 10,
    name: "automation_repositories_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_repositories (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          default_branch TEXT NOT NULL DEFAULT 'main',
          local_path TEXT NOT NULL,
          github_token TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_repos_user ON automation_repositories(user_id)`);
    },
  },

  // ─── 011: Add device_id to automation repositories ──────────────
  {
    id: 11,
    name: "automation_repositories_device_id",
    run(db) {
      try {
        db.exec(`ALTER TABLE automation_repositories ADD COLUMN device_id TEXT`);
      } catch { /* column already exists */ }
    },
  },

  // ─── 012: Add github_url to automation repositories ──────────────
  {
    id: 12,
    name: "automation_repositories_github_url",
    run(db) {
      try {
        db.exec(`ALTER TABLE automation_repositories ADD COLUMN github_url TEXT`);
      } catch { /* column already exists */ }
    },
  },
  {
    id: 13,
    name: "agent_threads_kind",
    run(db) {
      try {
        db.exec(`ALTER TABLE agent_threads ADD COLUMN kind TEXT NOT NULL DEFAULT 'delivery'`);
      } catch { /* exists */ }
      try {
        db.exec(`UPDATE agent_threads SET kind = 'delivery' WHERE kind IS NULL OR kind = ''`);
      } catch { /* best effort */ }
    },
  },

  // ─── 019: Add strategy to automation repositories ────────────────
  {
    id: 19,
    name: "automation_repositories_strategy",
    run(db) {
      try {
        db.exec(`ALTER TABLE automation_repositories ADD COLUMN strategy TEXT`);
      } catch { /* column already exists */ }
    },
  },

  // ─── 014: Automation plans table ─────────────────────────────────
  {
    id: 14,
    name: "automation_plans_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_plans (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          user_id TEXT,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          tasks TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_plans_repo ON automation_plans(repo_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_plans_user ON automation_plans(user_id)`);
    },
  },

  // ─── 016: Scheduled job runs (persistent execution history) ──────
  {
    id: 16,
    name: "scheduled_job_runs_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_job_runs (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          triggered_by TEXT NOT NULL DEFAULT 'schedule',
          output TEXT,
          error TEXT,
          plan_id TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_job_runs_job ON scheduled_job_runs(job_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_job_runs_started ON scheduled_job_runs(started_at)`);
    },
  },

  // ─── 015: Network hosts table (persistent scan results) ──────────
  {
    id: 17,
    name: "agent_threads_execution_node",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN execution_node_id TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN execution_node_name TEXT`); } catch { /* exists */ }
    },
  },

  {
    id: 15,
    name: "network_hosts_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS network_hosts (
          ip TEXT PRIMARY KEY,
          mac TEXT,
          hostname TEXT,
          os_version TEXT,
          open_ports TEXT NOT NULL DEFAULT '[]',
          ssh_reachable INTEGER NOT NULL DEFAULT 0,
          agent_status TEXT NOT NULL DEFAULT 'not-installed',
          providers TEXT,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          scanned_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_network_hosts_last_seen ON network_hosts(last_seen_at DESC)`);
    },
  },

  // ─── 018: Persist workspace picker location in user_settings ─────
  {
    id: 18,
    name: "user_settings_workspace_picker_location",
    run(db) {
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN workspace_picker_path TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN workspace_picker_node_id TEXT`); } catch { /* exists */ }
    },
  },
  {
    id: 20,
    name: "architecture_diagrams_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS architecture_diagrams (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          workspace_root TEXT NOT NULL,
          diagram TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_architecture_diagrams_user_workspace ON architecture_diagrams(user_id, workspace_root)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_updated ON architecture_diagrams(updated_at DESC)`);
    },
  },

];
