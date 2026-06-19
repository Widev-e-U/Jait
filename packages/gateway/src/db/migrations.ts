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
import { uuidv7 } from "./uuidv7.js";

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
  {
    id: 21,
    name: "workspaces_and_workspace_state",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          title TEXT,
          root_path TEXT,
          node_id TEXT,
          created_at TEXT NOT NULL,
          last_active_at TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          metadata TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_user_status ON workspaces(user_id, status, last_active_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_user_root ON workspaces(user_id, root_path, node_id)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS workspace_state (
          workspace_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (workspace_id, key)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_state_workspace ON workspace_state(workspace_id)`);

      try { db.exec(`ALTER TABLE sessions ADD COLUMN workspace_id TEXT`); } catch { /* exists */ }

      type SessionRow = {
        id: string;
        user_id: string | null;
        name: string | null;
        workspace_path: string | null;
        created_at: string;
        last_active_at: string;
        workspace_id: string | null;
      };
      const sessions = db.prepare(`
        SELECT id, user_id, name, workspace_path, created_at, last_active_at, workspace_id
        FROM sessions
        ORDER BY created_at ASC
      `).all() as SessionRow[];

      const existingWorkspaceRows = db.prepare(`
        SELECT id, user_id, root_path, node_id
        FROM workspaces
      `).all() as Array<{ id: string; user_id: string | null; root_path: string | null; node_id: string | null }>;

      const workspaceByRootKey = new Map<string, string>();
      for (const row of existingWorkspaceRows) {
        if (!row.root_path) continue;
        workspaceByRootKey.set(`${row.user_id ?? ""}::${row.node_id ?? "gateway"}::${row.root_path}`, row.id);
      }

      const titleFromPath = (value: string | null, fallback: string) => {
        const normalized = value?.trim();
        if (!normalized) return fallback;
        const parts = normalized.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
        return parts[parts.length - 1] || fallback;
      };

      for (const session of sessions) {
        if (session.workspace_id) continue;

        let workspaceId: string | null = null;
        if (session.workspace_path) {
          const key = `${session.user_id ?? ""}::gateway::${session.workspace_path}`;
          workspaceId = workspaceByRootKey.get(key) ?? null;
          if (!workspaceId) {
            workspaceId = uuidv7();
            db.prepare(`
              INSERT INTO workspaces (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL)
            `).run(
              workspaceId,
              session.user_id,
              titleFromPath(session.workspace_path, session.name?.trim() || "Workspace"),
              session.workspace_path,
              "gateway",
              session.created_at,
              session.last_active_at,
            );
            workspaceByRootKey.set(key, workspaceId);
          }
        } else {
          workspaceId = uuidv7();
          db.prepare(`
            INSERT INTO workspaces (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata)
            VALUES (?, ?, ?, NULL, 'gateway', ?, ?, 'active', NULL)
          `).run(
            workspaceId,
            session.user_id,
            session.name?.trim() || "Untitled Workspace",
            session.created_at,
            session.last_active_at,
          );
        }

        db.prepare(`UPDATE sessions SET workspace_id = ? WHERE id = ?`).run(workspaceId, session.id);
      }
    },
  },

  // ─── 022: Jait backend preference & recent models ────────────────
  {
    id: 22,
    name: "user_settings_jait_backend",
    run(db) {
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN jait_backend TEXT NOT NULL DEFAULT 'openai'`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN recent_models TEXT`); } catch { /* exists */ }
    },
  },

  {
    id: 23,
    name: "assistant_profiles_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS assistant_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          system_prompt TEXT,
          runtime_mode TEXT,
          tool_profile TEXT,
          enabled_skills TEXT,
          enabled_plugins TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_assistant_profiles_user ON assistant_profiles(user_id, updated_at DESC)`);
    },
  },

  // ─── 024: Browser collaboration tables ───────────────────────────
  {
    id: 24,
    name: "browser_collaboration_tables",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS browser_sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          workspace_root TEXT,
          target_url TEXT,
          preview_url TEXT,
          preview_session_id TEXT,
          browser_id TEXT,
          mode TEXT NOT NULL DEFAULT 'shared',
          origin TEXT NOT NULL DEFAULT 'direct',
          controller TEXT NOT NULL DEFAULT 'agent',
          status TEXT NOT NULL DEFAULT 'ready',
          secret_safe INTEGER NOT NULL DEFAULT 0,
          storage_profile TEXT,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_browser_sessions_browser ON browser_sessions(browser_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_browser_sessions_preview ON browser_sessions(preview_session_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_browser_sessions_user_updated ON browser_sessions(created_by, updated_at DESC)`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS browser_interventions (
          id TEXT PRIMARY KEY,
          browser_session_id TEXT NOT NULL,
          thread_id TEXT,
          chat_session_id TEXT,
          kind TEXT NOT NULL DEFAULT 'custom',
          reason TEXT NOT NULL,
          instructions TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          secret_safe INTEGER NOT NULL DEFAULT 0,
          allow_user_note INTEGER NOT NULL DEFAULT 1,
          requested_by TEXT,
          resolved_by TEXT,
          user_note TEXT,
          requested_at TEXT NOT NULL,
          resolved_at TEXT
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_browser_interventions_session ON browser_interventions(browser_session_id, requested_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_browser_interventions_status ON browser_interventions(status, requested_at DESC)`);
    },
  },

  // ─── 025: Plugins table ──────────────────────────────────────────
  {
    id: 25,
    name: "plugins_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS plugins (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          version TEXT NOT NULL,
          description TEXT,
          author TEXT,
          path TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'installed',
          config TEXT NOT NULL DEFAULT '{}',
          error TEXT,
          installed_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    },
  },

  // ─── 026: Persist outbound LLM context snapshots ─────────────────
  {
    id: 26,
    name: "messages_context_flow_column",
    run(db) {
      try { db.exec(`ALTER TABLE messages ADD COLUMN context_flow TEXT`); } catch { /* exists */ }
    },
  },
  {
    id: 27,
    name: "agent_threads_pr_base_branch",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN pr_base_branch TEXT`); } catch { /* exists */ }
    },
  },
  {
    id: 28,
    name: "agent_threads_skill_ids",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN skill_ids TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 029: Persist chain-of-thought / reasoning content ────────────
  {
    id: 29,
    name: "messages_thinking_column",
    run(db) {
      try { db.exec(`ALTER TABLE messages ADD COLUMN thinking TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 030: Thread routing plan (auto-orchestration) ────────────────
  {
    id: 30,
    name: "agent_threads_routing_plan",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN routing_plan TEXT`); } catch { /* exists */ }
    },
  },

  // ─── 031: Thread diff stats (persisted changes) ────────────────────
  {
    id: 31,
    name: "agent_threads_diff_stats",
    run(db) {
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN change_files INTEGER`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN change_insertions INTEGER`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE agent_threads ADD COLUMN change_deletions INTEGER`); } catch { /* exists */ }
    },
  },

  // ─── 032: Repo-scoped thread proposal list ─────────────────────────
  {
    id: 32,
    name: "automation_repo_proposals_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS automation_repo_proposals (
          id TEXT PRIMARY KEY,
          repo_id TEXT NOT NULL,
          user_id TEXT,
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          priority TEXT NOT NULL DEFAULT 'normal',
          due_date TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          source_thread_id TEXT,
          source_thread_title TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_repo_proposals_repo ON automation_repo_proposals(repo_id, updated_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_repo_proposals_user ON automation_repo_proposals(user_id, updated_at DESC)`);
    },
  },

  // ─── 033: Repo todo metadata ───────────────────────────────────────
  {
    id: 33,
    name: "automation_repo_proposals_todo_metadata",
    run(db) {
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN due_date TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`); } catch { /* exists */ }
    },
  },

  // ─── 034: Agent reminders table ──────────────────────────────────
  {
    id: 34,
    name: "reminders_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          workspace_id TEXT,
          session_id TEXT,
          content TEXT NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'agent',
          source_id TEXT,
          source_surface TEXT NOT NULL DEFAULT 'chat',
          status TEXT NOT NULL DEFAULT 'active',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON reminders(user_id, status, updated_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_workspace ON reminders(workspace_id, updated_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_session ON reminders(session_id, updated_at DESC)`);
    },
  },

  // ─── 035: Repo todo completion history ────────────────────────────
  {
    id: 35,
    name: "automation_repo_proposals_completion_history",
    run(db) {
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN completed_at TEXT`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE automation_repo_proposals ADD COLUMN completion_history TEXT NOT NULL DEFAULT '[]'`); } catch { /* exists */ }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_repo_proposals_completed ON automation_repo_proposals(repo_id, completed_at DESC)`);
    },
  },

  // ─── 036: User secret store ───────────────────────────────────────
  {
    id: 36,
    name: "user_secrets_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_secrets (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          type TEXT NOT NULL,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          encrypted_value TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_used_at TEXT
        )
      `);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_secrets_unique ON user_secrets(user_id, type, key)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_secrets_user_type ON user_secrets(user_id, type, updated_at DESC)`);
    },
  },

  // ─── 037: Rename workspace concept → project ──────────────────────
  // Pure terminology rename: tables, columns, and indexes go from
  // `workspace*` to `project*`. Preserves all existing data.
  {
    id: 37,
    name: "rename_workspace_to_project",
    run(db) {
      function renameTable(from: string, to: string): void {
        const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(from);
        const newExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(to);
        if (exists && !newExists) {
          db.exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
        }
      }
      function renameColumn(table: string, from: string, to: string): void {
        const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!tableExists) return;
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        const names = new Set(cols.map((c) => c.name));
        if (names.has(from) && !names.has(to)) {
          db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
        }
      }
      function dropIndex(name: string): void {
        db.exec(`DROP INDEX IF EXISTS "${name}"`);
      }

      // Tables
      renameTable("workspaces", "projects");
      renameTable("workspace_state", "project_state");

      // Columns
      renameColumn("project_state", "workspace_id", "project_id");
      renameColumn("sessions", "workspace_id", "project_id");
      renameColumn("sessions", "workspace_path", "project_path");
      renameColumn("user_settings", "workspace_picker_path", "project_picker_path");
      renameColumn("user_settings", "workspace_picker_node_id", "project_picker_node_id");
      renameColumn("reminders", "workspace_id", "project_id");
      renameColumn("architecture_diagrams", "workspace_root", "project_root");
      renameColumn("scheduled_jobs", "workspace_root", "project_root");
      renameColumn("browser_sessions", "workspace_root", "project_root");

      // Old indexes (drop; recreate under new names below).
      dropIndex("idx_workspaces_user_status");
      dropIndex("idx_workspaces_user_root");
      dropIndex("idx_workspace_state_workspace");
      dropIndex("idx_reminders_workspace");
      dropIndex("idx_architecture_diagrams_user_workspace");

      // New indexes (guarded — tables may not exist on fresh/partial DBs)
      function tableExists(name: string): boolean {
        return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      }
      if (tableExists("projects")) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status, last_active_at)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_user_root ON projects(user_id, root_path, node_id)`);
      }
      if (tableExists("project_state")) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_project_state_project ON project_state(project_id)`);
      }
      if (tableExists("reminders")) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_project ON reminders(project_id, updated_at DESC)`);
      }
      if (tableExists("architecture_diagrams")) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_architecture_diagrams_user_project ON architecture_diagrams(user_id, project_root)`);
      }
      if (tableExists("memories")) {
        db.exec(`UPDATE memories SET scope = 'project' WHERE scope = 'workspace'`);
      }
      if (tableExists("project_state")) {
        db.exec(`UPDATE project_state SET key = 'project.ui' WHERE key = 'workspace.ui'`);
        db.exec(`UPDATE project_state SET key = 'project.panel' WHERE key = 'workspace.panel'`);
        db.exec(`UPDATE project_state SET key = 'project.tabs' WHERE key = 'workspace.tabs'`);
        db.exec(`UPDATE project_state SET key = 'project.layout' WHERE key = 'workspace.layout'`);
        db.exec(`UPDATE project_state SET key = 'project.layout.mobile' WHERE key = 'workspace.layout.mobile'`);
      }
      if (tableExists("session_state")) {
        db.exec(`UPDATE session_state SET key = 'project.panel' WHERE key = 'workspace.panel'`);
        db.exec(`UPDATE session_state SET key = 'project.tabs' WHERE key = 'workspace.tabs'`);
        db.exec(`UPDATE session_state SET key = 'project.layout' WHERE key = 'workspace.layout'`);
        db.exec(`UPDATE session_state SET key = 'project.layout.mobile' WHERE key = 'workspace.layout.mobile'`);
      }
    },
  },

  // ─── 038: Memory usage metadata ───────────────────────────────────
  {
    id: 38,
    name: "reminders_usage_metadata",
    run(db) {
      try { db.exec(`ALTER TABLE reminders ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
      try { db.exec(`ALTER TABLE reminders ADD COLUMN last_retrieved_at TEXT`); } catch { /* exists */ }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_retrieved ON reminders(user_id, last_retrieved_at)`);
    },
  },

  // ─── 039: FTS search over sessions and thread activities ───────────
  {
    id: 39,
    name: "session_search_fts",
    run(db) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          body,
          role UNINDEXED,
          session_id UNINDEXED,
          message_id UNINDEXED,
          created_at UNINDEXED
        )
      `);

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS agent_thread_activities_fts USING fts5(
          body,
          kind UNINDEXED,
          thread_id UNINDEXED,
          activity_id UNINDEXED,
          created_at UNINDEXED
        )
      `);

      db.exec(`DELETE FROM messages_fts`);
      db.exec(`
        INSERT INTO messages_fts(rowid, body, role, session_id, message_id, created_at)
        SELECT rowid, content, role, session_id, id, created_at
        FROM messages
      `);

      db.exec(`DELETE FROM agent_thread_activities_fts`);
      db.exec(`
        INSERT INTO agent_thread_activities_fts(rowid, body, kind, thread_id, activity_id, created_at)
        SELECT
          rowid,
          summary || CASE WHEN payload IS NOT NULL AND payload != '' THEN ' ' || payload ELSE '' END,
          kind,
          thread_id,
          id,
          created_at
        FROM agent_thread_activities
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_ai
        AFTER INSERT ON messages
        BEGIN
          INSERT INTO messages_fts(rowid, body, role, session_id, message_id, created_at)
          VALUES (new.rowid, new.content, new.role, new.session_id, new.id, new.created_at);
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_ad
        AFTER DELETE ON messages
        BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_au
        AFTER UPDATE ON messages
        BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
          INSERT INTO messages_fts(rowid, body, role, session_id, message_id, created_at)
          VALUES (new.rowid, new.content, new.role, new.session_id, new.id, new.created_at);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS agent_thread_activities_fts_ai
        AFTER INSERT ON agent_thread_activities
        BEGIN
          INSERT INTO agent_thread_activities_fts(rowid, body, kind, thread_id, activity_id, created_at)
          VALUES (
            new.rowid,
            new.summary || CASE WHEN new.payload IS NOT NULL AND new.payload != '' THEN ' ' || new.payload ELSE '' END,
            new.kind,
            new.thread_id,
            new.id,
            new.created_at
          );
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS agent_thread_activities_fts_ad
        AFTER DELETE ON agent_thread_activities
        BEGIN
          DELETE FROM agent_thread_activities_fts WHERE rowid = old.rowid;
        END
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS agent_thread_activities_fts_au
        AFTER UPDATE ON agent_thread_activities
        BEGIN
          DELETE FROM agent_thread_activities_fts WHERE rowid = old.rowid;
          INSERT INTO agent_thread_activities_fts(rowid, body, kind, thread_id, activity_id, created_at)
          VALUES (
            new.rowid,
            new.summary || CASE WHEN new.payload IS NOT NULL AND new.payload != '' THEN ' ' || new.payload ELSE '' END,
            new.kind,
            new.thread_id,
            new.id,
            new.created_at
          );
        END
      `);
    },
  },

  // ─── 040: External messaging channels (WhatsApp, etc.) ─────────────
  {
    id: 40,
    name: "channels_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL DEFAULT 0,
          config TEXT NOT NULL DEFAULT '{}',
          updated_at TEXT NOT NULL
        )
      `);
    },
  },

  // ─── 041: Connected email accounts (Gmail / Outlook) ───────────────
  {
    id: 41,
    name: "email_accounts_table",
    run(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_accounts (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          provider TEXT NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'connected',
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_accounts_unique ON email_accounts(user_id, provider, email)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id, updated_at DESC)`);
    },
  },

  // ─── 042: Reasoning effort preference ─────────────────────────────
  {
    id: 42,
    name: "user_settings_reasoning_effort",
    run(db) {
      try { db.exec(`ALTER TABLE user_settings ADD COLUMN reasoning_effort TEXT`); } catch { /* exists */ }
    },
  },

];
