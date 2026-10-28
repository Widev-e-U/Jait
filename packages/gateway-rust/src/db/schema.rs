//! Native port of `packages/gateway/src/db/schema.ts`.
//!
//! The TypeScript original is a pure declaration module: it builds 48 drizzle-orm
//! `SQLiteTable` objects through the `sqliteTable(...)` builder chain
//! (`text`/`integer`/`real` columns with `.primaryKey()`, `.notNull()`, `.unique()`,
//! `.default(...)`, `.references(..., { onDelete: "cascade" })` and doc comments, plus the
//! table-level `(table) => [...]` extra-config array of `index`/`uniqueIndex`/`primaryKey`
//! entries) and exports nothing else. It performs no I/O, so this port has no host boundary.
//!
//! The drizzle builder objects are a JavaScript library type, so the declarations are ported
//! as plain `const`-evaluated data: [`Table`], [`Column`] and [`TableIndex`] mirror the
//! builder chain one modifier per `const fn` (so the generated initializers in this file are
//! checked by the compiler, not at run time), and [`TABLES`] holds every table in source
//! order. Everything the runtime needs from the schema is then *derived* from that data:
//!
//! * [`namespace_order`] reproduces the iteration order of the `import * as schema`
//!   namespace object. Per the ECMAScript spec a module namespace object's own keys are
//!   sorted by code unit, so `Object.entries(schema)` in `sqlite-shim.ts` visits the
//!   exports in ASCII order — not source order, which is why [`TABLES`] and
//!   [`namespace_order`] differ.
//! * [`relational_config`] reproduces
//!   `extractTablesRelationalConfig(schema, createTableRelationsHelpers)` from
//!   `drizzle-orm/relations` for the subset of inputs this schema actually uses (see
//!   [`TablesRelationalConfig`] for the two branches that cannot fire here).
//!
//! Fidelity notes: column doc comments are prose in the original (they travel into drizzle's
//! `Column` metadata as `columnType`/doc hints only); they are carried here as
//! [`Column::doc`] data so the information is not lost, and no runtime behaviour depends on
//! them.

/// The SQLite storage class drizzle assigns for a column, i.e. the `sqlite-core` builder
/// that created it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ColumnKind {
    /// `text("name")`.
    Text,
    /// `integer("name")` — also the builder behind `{ mode: "boolean" }` columns.
    Integer,
    /// `real("name")`.
    Real,
}

impl ColumnKind {
    /// The SQLite column affinity (`text`/`integer`/`real`), as drizzle emits it.
    pub const fn sql_type(self) -> &'static str {
        match self {
            ColumnKind::Text => "text",
            ColumnKind::Integer => "integer",
            ColumnKind::Real => "real",
        }
    }

    /// Name of the `drizzle-orm/sqlite-core` builder function that produced the column.
    pub const fn builder(self) -> &'static str {
        self.sql_type()
    }
}

/// A `.default(...)` argument. TypeScript passes the raw JS value; the variants mirror the
/// three shapes the schema uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColumnDefault {
    /// `.default(true)` / `.default(false)` on an `{ mode: "boolean" }` integer column.
    Boolean(bool),
    /// `.default(0)` on an integer column.
    Integer(i64),
    /// `.default("...")` on a text column.
    Text(&'static str),
}

/// The `{ onDelete: ... }` option of `.references(...)`. The schema only ever uses `cascade`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReferentialAction {
    /// `{ onDelete: "cascade" }`.
    Cascade,
}

impl ReferentialAction {
    /// The option string as written in the TS source.
    pub const fn as_str(self) -> &'static str {
        match self {
            ReferentialAction::Cascade => "cascade",
        }
    }
}

/// A `.references(() => other.column, options)` target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ColumnReference {
    /// Property name of the referenced table's export (`messages`, ...).
    pub table: &'static str,
    /// Referenced column property name.
    pub column: &'static str,
    /// `onDelete` from the `references()` options; `None` when options were omitted.
    pub on_delete: Option<ReferentialAction>,
}

/// One column of a [`Table`], i.e. the result of the drizzle column builder chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Column {
    /// Property name in the drizzle table object — the first builder argument.
    pub key: &'static str,
    /// SQL column name — the second builder argument.
    pub name: &'static str,
    /// The builder that produced the column.
    pub kind: ColumnKind,
    /// `integer(..., { mode: "boolean" })`.
    pub boolean_mode: bool,
    /// `.primaryKey()`.
    pub primary_key: bool,
    /// `.notNull()`.
    pub not_null: bool,
    /// `.unique()`.
    pub unique: bool,
    /// `.default(...)`, if any.
    pub default: Option<ColumnDefault>,
    /// `.references(...)`, if any.
    pub reference: Option<ColumnReference>,
    /// Prose doc comment carried by the column in the TS source.
    pub doc: Option<&'static str>,
}

impl Column {
    const fn new(key: &'static str, name: &'static str, kind: ColumnKind) -> Self {
        Column {
            key,
            name,
            kind,
            boolean_mode: false,
            primary_key: false,
            not_null: false,
            unique: false,
            default: None,
            reference: None,
            doc: None,
        }
    }

    /// `text("name", "sql_name")`.
    pub const fn text(key: &'static str, name: &'static str) -> Self {
        Column::new(key, name, ColumnKind::Text)
    }

    /// `integer("name", "sql_name")`.
    pub const fn integer(key: &'static str, name: &'static str) -> Self {
        Column::new(key, name, ColumnKind::Integer)
    }

    /// `real("name", "sql_name")`.
    pub const fn real(key: &'static str, name: &'static str) -> Self {
        Column::new(key, name, ColumnKind::Real)
    }

    /// `integer("name", "sql_name", { mode: "boolean" })`.
    pub const fn integer_boolean(key: &'static str, name: &'static str) -> Self {
        let mut column = Column::new(key, name, ColumnKind::Integer);
        column.boolean_mode = true;
        column
    }

    /// `.primaryKey()`.
    pub const fn primary_key(mut self) -> Self {
        self.primary_key = true;
        self
    }

    /// `.notNull()`.
    pub const fn not_null(mut self) -> Self {
        self.not_null = true;
        self
    }

    /// `.unique()`.
    pub const fn unique(mut self) -> Self {
        self.unique = true;
        self
    }

    /// `.default(true)` / `.default(false)`.
    pub const fn default_boolean(mut self, value: bool) -> Self {
        self.default = Some(ColumnDefault::Boolean(value));
        self
    }

    /// `.default(0)`.
    pub const fn default_integer(mut self, value: i64) -> Self {
        self.default = Some(ColumnDefault::Integer(value));
        self
    }

    /// `.default("...")`.
    pub const fn default_text(mut self, value: &'static str) -> Self {
        self.default = Some(ColumnDefault::Text(value));
        self
    }

    /// `.references(() => table.column, { onDelete: "cascade" })`.
    pub const fn references_cascade(mut self, table: &'static str, column: &'static str) -> Self {
        self.reference = Some(ColumnReference {
            table,
            column,
            on_delete: Some(ReferentialAction::Cascade),
        });
        self
    }

    /// The column's doc comment. The TS source never stacks two doc comments on one column,
    /// so a later call replaces rather than appends (enforced by a test).
    pub const fn doc(mut self, text: &'static str) -> Self {
        self.doc = Some(text);
        self
    }
}

/// Which drizzle builder produced a [`TableIndex`] entry of a table's extra-config array.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexKind {
    /// `index("name").on(...)`, `.on(...)` — a plain index.
    Index,
    /// `uniqueIndex("name").on(...)`.
    UniqueIndex,
    /// `primaryKey({ columns: [...] })` — a composite primary key.
    PrimaryKey,
}

/// One entry of the `(table) => [...]` extra-config array drizzle collects during
/// `sqliteTable(...)`. The array's order is preserved because drizzle walks it in order when
/// assembling `primaryKey`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TableIndex {
    /// Which builder produced the entry.
    pub kind: IndexKind,
    /// Index name as written in the TS source. Empty for [`IndexKind::PrimaryKey`], which
    /// carries no name.
    pub name: &'static str,
    /// Column keys the entry covers, in source order.
    pub columns: &'static [&'static str],
}

impl TableIndex {
    /// `index("name").on(table.a, table.b)`.
    pub const fn index(name: &'static str, columns: &'static [&'static str]) -> Self {
        TableIndex {
            kind: IndexKind::Index,
            name,
            columns,
        }
    }

    /// `uniqueIndex("name").on(table.a)`.
    pub const fn unique(name: &'static str, columns: &'static [&'static str]) -> Self {
        TableIndex {
            kind: IndexKind::UniqueIndex,
            name,
            columns,
        }
    }

    /// `primaryKey({ columns: [table.a, table.b] })`.
    pub const fn primary_key(columns: &'static [&'static str]) -> Self {
        TableIndex {
            kind: IndexKind::PrimaryKey,
            name: "",
            columns,
        }
    }

    /// `true` for the composite-primary-key entry.
    pub const fn is_primary_key(&self) -> bool {
        matches!(self.kind, IndexKind::PrimaryKey)
    }
}

/// One `export const <var> = sqliteTable(...)` declaration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Table {
    /// Module export name — drizzle's `tsName` once the table is registered in a schema.
    pub var: &'static str,
    /// SQL table name — the first `sqliteTable` argument (drizzle's `Table.Symbol.Name`).
    pub name: &'static str,
    /// Columns in declaration order (drizzle's `Table.Symbol.Columns`).
    pub columns: &'static [Column],
    /// The `(table) => [...]` extra-config array, in source order.
    pub extra: &'static [TableIndex],
}

impl Table {
    /// Look up a column by its TS property name.
    pub fn column(&self, key: &str) -> Option<&'static Column> {
        self.columns.iter().find(|column| column.key == key)
    }

    /// `getTableName(table)` from `drizzle-orm`.
    pub fn table_name(&self) -> &'static str {
        self.name
    }

    /// `getTableUniqueName(table)`: `schema ? "schema.name" : name`. SQLite tables carry no
    /// schema, so the unique name is the table name.
    pub fn unique_name(&self) -> &'static str {
        self.name
    }

    /// The plain-index and unique-index entries of the extra-config array, in source order.
    pub fn indexes(&self) -> impl Iterator<Item = &TableIndex> {
        self.extra.iter().filter(|entry| !entry.is_primary_key())
    }

    /// The composite-primary-key entries of the extra-config array, in source order.
    pub fn primary_key_indexes(&self) -> impl Iterator<Item = &TableIndex> {
        self.extra.iter().filter(|entry| entry.is_primary_key())
    }

    /// The table's primary-key columns the way drizzle assembles them for
    /// `TableRelationalConfig.primaryKey`: the column-level `.primaryKey()` columns in
    /// declaration order, then the columns of every composite `primaryKey({ columns })`
    /// entry in extra-config order.
    pub fn primary_key_columns(&self) -> Vec<&'static Column> {
        let mut keys: Vec<&'static Column> =
            self.columns.iter().filter(|column| column.primary_key).collect();
        for entry in self.primary_key_indexes() {
            for key in entry.columns {
                if let Some(column) = self.column(key) {
                    keys.push(column);
                }
            }
        }
        keys
    }
}
// ── Table declarations (source order of `schema.ts`) ──────────────────────

/// `export const projects` — SQL table `projects`.
pub static PROJECTS: Table = Table {
    var: "projects",
    name: "projects",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("title", "title"),
        Column::text("rootPath", "root_path"),
        Column::text("nodeId", "node_id"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("lastActiveAt", "last_active_at").not_null(),
        Column::text("status", "status").default_text("active"),
        Column::text("metadata", "metadata"),
        Column::text("parentId", "parent_id").doc("Parent folder, or null at the root. Only `kind: 'folder'` rows may be parents."),
        Column::text("instructions", "instructions").doc("Extra context injected into the system prompt of every chat below this node."),
        Column::text("description", "description").doc("Free-text description shown in the UI."),
        Column::text("color", "color").doc("Palette token (e.g. \"blue\") or a `#rrggbb` value from the colour picker."),
        Column::text("kind", "kind").not_null().default_text("workspace").doc("'workspace' (folder on disk) | 'folder' (pure chat category)"),
    ],
    extra: &[
        TableIndex::index("idx_projects_user_status", &["userId", "status", "lastActiveAt"]),
        TableIndex::index("idx_projects_user_root", &["userId", "rootPath", "nodeId"]),
        TableIndex::index("idx_projects_parent", &["userId", "parentId", "status", "lastActiveAt"]),
    ],
};

/// `export const sessions` — SQL table `sessions`.
pub static SESSIONS: Table = Table {
    var: "sessions",
    name: "sessions",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").doc("UUIDv7"),
        Column::text("projectId", "project_id"),
        Column::text("name", "name"),
        Column::text("projectPath", "project_path"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("lastActiveAt", "last_active_at").not_null(),
        Column::text("status", "status").default_text("active"),
        Column::text("metadata", "metadata").doc("'active' | 'archived' | 'deleted'"),
        Column::text("viewedAt", "viewed_at").doc("JSON"),
    ],
    extra: &[
        TableIndex::index("idx_sessions_status", &["status", "lastActiveAt"]),
    ],
};

/// `export const users` — SQL table `users`.
pub static USERS: Table = Table {
    var: "users",
    name: "users",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("username", "username").not_null().unique(),
        Column::text("passwordHash", "password_hash").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_users_username", &["username"]),
    ],
};

/// `export const userSettings` — SQL table `user_settings`.
pub static USER_SETTINGS: Table = Table {
    var: "userSettings",
    name: "user_settings",
    columns: &[
        Column::text("userId", "user_id").primary_key(),
        Column::text("theme", "theme").not_null().default_text("system"),
        Column::text("apiKeys", "api_keys").doc("'light' | 'dark' | 'system'"),
        Column::text("disabledTools", "disabled_tools").doc("JSON object"),
        Column::text("sttProvider", "stt_provider").not_null().default_text("whisper").doc("JSON string[] of disabled tool names"),
        Column::text("chatStreamingAction", "chat_streaming_action").not_null().default_text("queue").doc("'whisper' | 'wyoming' | 'gpt' | 'elevenlabs'"),
        Column::text("chatProvider", "chat_provider").not_null().default_text("jait").doc("'steer' | 'queue' | 'thread'"),
        Column::text("jaitBackend", "jait_backend").not_null().default_text("openai"),
        Column::text("recentModels", "recent_models").doc("JaitBackend: 'openai' | 'openrouter' | 'ollama' | 'omniroute'"),
        Column::text("selectedModel", "selected_model").doc("JSON string[] of recently used model ids"),
        Column::text("reasoningEffort", "reasoning_effort").doc("last model id picked in the UI; used by background channels (e.g. WhatsApp)"),
        Column::text("projectPickerPath", "project_picker_path").doc("'minimal' | 'low' | 'medium' | 'high' | null (only for reasoning-capable models)"),
        Column::text("projectPickerNodeId", "project_picker_node_id"),
        Column::text("lastSelectedProjectId", "last_selected_project_id").doc("Explicit \"last selected\" project/session, set only when the user picks one in the UI. Distinct from sessions.lastActiveAt, which is bumped by any activity (including background automation) and must not be used to decide what reopens on reload."),
        Column::text("lastSelectedSessionId", "last_selected_session_id"),
        Column::text("lastSelectedAt", "last_selected_at"),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[],
};

/// `export const providerAccounts` — SQL table `provider_accounts`.
pub static PROVIDER_ACCOUNTS: Table = Table {
    var: "providerAccounts",
    name: "provider_accounts",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").not_null(),
        Column::text("providerType", "provider_type").not_null(),
        Column::text("nodeId", "node_id").not_null().default_text("gateway"),
        Column::text("label", "label").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_provider_accounts_user_node_type_label", &["userId", "nodeId", "providerType", "label"]),
        TableIndex::index("idx_provider_accounts_user", &["userId", "updatedAt"]),
    ],
};

/// `export const providerUsage` — SQL table `provider_usage`.
pub static PROVIDER_USAGE: Table = Table {
    var: "providerUsage",
    name: "provider_usage",
    columns: &[
        Column::text("accountId", "account_id").not_null(),
        Column::text("rateLimitType", "rate_limit_type").not_null(),
        Column::text("providerType", "provider_type").not_null().doc("'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage' | ..."),
        Column::text("status", "status"),
        Column::real("utilization", "utilization").doc("'allowed' | 'allowed_warning' | 'rejected'"),
        Column::text("resetsAt", "resets_at").doc("fraction 0-1, as reported by the provider SDK"),
        Column::integer("isUsingOverage", "is_using_overage").not_null().default_integer(0).doc("ISO timestamp"),
        Column::text("rawJson", "raw_json").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_provider_usage_account_type", &["accountId", "rateLimitType"]),
    ],
};

/// `export const assistantProfiles` — SQL table `assistant_profiles`.
pub static ASSISTANT_PROFILES: Table = Table {
    var: "assistantProfiles",
    name: "assistant_profiles",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("name", "name").not_null(),
        Column::text("description", "description"),
        Column::text("systemPrompt", "system_prompt"),
        Column::text("runtimeMode", "runtime_mode"),
        Column::text("toolProfile", "tool_profile"),
        Column::text("enabledSkills", "enabled_skills"),
        Column::text("enabledPlugins", "enabled_plugins"),
        Column::integer("isDefault", "is_default").not_null().default_integer(0),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_assistant_profiles_user", &["userId", "updatedAt"]),
    ],
};

/// `export const auditLog` — SQL table `audit_log`.
pub static AUDIT_LOG: Table = Table {
    var: "auditLog",
    name: "audit_log",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("timestamp", "timestamp").not_null().doc("UUIDv7"),
        Column::text("sessionId", "session_id").doc("ISO 8601 Context"),
        Column::text("surfaceType", "surface_type"),
        Column::text("deviceId", "device_id"),
        Column::text("actionId", "action_id").unique().doc("What"),
        Column::text("actionType", "action_type"),
        Column::text("toolName", "tool_name").doc("'tool_call', 'consent', 'message', etc."),
        Column::text("inputs", "inputs").doc("Details (JSON strings)"),
        Column::text("outputs", "outputs"),
        Column::text("sideEffects", "side_effects"),
        Column::text("signature", "signature").doc("Verification"),
        Column::text("parentActionId", "parent_action_id"),
        Column::text("status", "status").doc("Status"),
        Column::text("consentMethod", "consent_method").doc("'pending','approved','executed','failed','reverted'"),
    ],
    extra: &[
        TableIndex::index("idx_audit_action_id", &["actionId"]),
        TableIndex::index("idx_audit_timestamp", &["timestamp"]),
        TableIndex::index("idx_audit_session", &["sessionId", "timestamp"]),
        TableIndex::index("idx_audit_surface", &["surfaceType", "timestamp"]),
        TableIndex::index("idx_audit_device", &["deviceId", "timestamp"]),
    ],
};

/// `export const trustLevels` — SQL table `trust_levels`.
pub static TRUST_LEVELS: Table = Table {
    var: "trustLevels",
    name: "trust_levels",
    columns: &[
        Column::text("actionType", "action_type").primary_key(),
        Column::integer("approvedCount", "approved_count").default_integer(0).doc("e.g. 'terminal.run'"),
        Column::integer("revertedCount", "reverted_count").default_integer(0),
        Column::integer("currentLevel", "current_level").default_integer(0),
    ],
    extra: &[],
};

/// `export const consentLog` — SQL table `consent_log`.
pub static CONSENT_LOG: Table = Table {
    var: "consentLog",
    name: "consent_log",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("actionId", "action_id").not_null(),
        Column::text("toolName", "tool_name").not_null(),
        Column::text("decision", "decision").not_null(),
        Column::text("decidedAt", "decided_at").not_null().doc("'approved','rejected','timeout'"),
        Column::text("decidedVia", "decided_via"),
    ],
    extra: &[],
};

/// `export const consentSessionApprovals` — SQL table `consent_session_approvals`.
pub static CONSENT_SESSION_APPROVALS: Table = Table {
    var: "consentSessionApprovals",
    name: "consent_session_approvals",
    columns: &[
        Column::text("sessionId", "session_id").primary_key(),
        Column::integer("approveAll", "approve_all").not_null().default_integer(1),
        Column::text("updatedAt", "updated_at").not_null().doc("1 = enabled"),
    ],
    extra: &[],
};

/// `export const memories` — SQL table `memories`.
pub static MEMORIES: Table = Table {
    var: "memories",
    name: "memories",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("scope", "scope").not_null(),
        Column::text("content", "content").not_null(),
        Column::text("sourceType", "source_type").not_null(),
        Column::text("sourceId", "source_id").not_null(),
        Column::text("sourceSurface", "source_surface").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
        Column::text("expiresAt", "expires_at"),
    ],
    extra: &[
        TableIndex::index("idx_memories_scope", &["scope", "createdAt"]),
        TableIndex::index("idx_memories_expires", &["expiresAt"]),
    ],
};

/// `export const userSecrets` — SQL table `user_secrets`.
pub static USER_SECRETS: Table = Table {
    var: "userSecrets",
    name: "user_secrets",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("type", "type").not_null(),
        Column::text("key", "key").not_null(),
        Column::text("label", "label").not_null(),
        Column::text("encryptedValue", "encrypted_value").not_null(),
        Column::text("iv", "iv").not_null(),
        Column::text("authTag", "auth_tag").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
        Column::text("lastUsedAt", "last_used_at"),
    ],
    extra: &[
        TableIndex::unique("idx_user_secrets_unique", &["userId", "type", "key"]),
        TableIndex::index("idx_user_secrets_user_type", &["userId", "type", "updatedAt"]),
    ],
};

/// `export const emailAccounts` — SQL table `email_accounts`.
pub static EMAIL_ACCOUNTS: Table = Table {
    var: "emailAccounts",
    name: "email_accounts",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("provider", "provider").not_null(),
        Column::text("email", "email").not_null().doc("'gmail' | 'outlook'"),
        Column::text("displayName", "display_name").not_null().default_text(""),
        Column::text("status", "status").not_null().default_text("connected"),
        Column::text("error", "error").doc("'connected' | 'error'"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_email_accounts_unique", &["userId", "provider", "email"]),
        TableIndex::index("idx_email_accounts_user", &["userId", "updatedAt"]),
    ],
};

/// `export const calendarAccounts` — SQL table `calendar_accounts`.
pub static CALENDAR_ACCOUNTS: Table = Table {
    var: "calendarAccounts",
    name: "calendar_accounts",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("provider", "provider").not_null(),
        Column::text("email", "email").not_null().doc("'google'"),
        Column::text("displayName", "display_name").not_null().default_text(""),
        Column::text("status", "status").not_null().default_text("connected"),
        Column::text("error", "error").doc("'connected' | 'error'"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_calendar_accounts_unique", &["userId", "provider", "email"]),
        TableIndex::index("idx_calendar_accounts_user", &["userId", "updatedAt"]),
    ],
};

/// `export const deviceCalendarSnapshots` — SQL table `device_calendar_snapshots`.
pub static DEVICE_CALENDAR_SNAPSHOTS: Table = Table {
    var: "deviceCalendarSnapshots",
    name: "device_calendar_snapshots",
    columns: &[
        Column::text("accountId", "account_id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("calendars", "calendars").not_null().default_text("[]"),
        Column::text("events", "events").not_null().default_text("[]"),
        Column::text("syncedAt", "synced_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_device_calendar_snapshots_user", &["userId", "syncedAt"]),
    ],
};

/// `export const reminders` — SQL table `reminders`.
pub static REMINDERS: Table = Table {
    var: "reminders",
    name: "reminders",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("projectId", "project_id"),
        Column::text("sessionId", "session_id"),
        Column::text("content", "content").not_null(),
        Column::text("sourceType", "source_type").not_null().default_text("agent"),
        Column::text("sourceId", "source_id"),
        Column::text("sourceSurface", "source_surface").not_null().default_text("chat"),
        Column::text("status", "status").not_null().default_text("active"),
        Column::text("tags", "tags").not_null().default_text("[]"),
        Column::integer("usageCount", "usage_count").not_null().default_integer(0),
        Column::text("lastRetrievedAt", "last_retrieved_at"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_reminders_user_status", &["userId", "status", "updatedAt"]),
        TableIndex::index("idx_reminders_project", &["projectId", "updatedAt"]),
        TableIndex::index("idx_reminders_session", &["sessionId", "updatedAt"]),
    ],
};

/// `export const messages` — SQL table `messages`.
pub static MESSAGES: Table = Table {
    var: "messages",
    name: "messages",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("sessionId", "session_id").not_null(),
        Column::text("role", "role").not_null(),
        Column::text("content", "content").not_null().doc("'user' | 'assistant'"),
        Column::text("toolCalls", "tool_calls"),
        Column::text("segments", "segments").doc("JSON array of executed tool calls (nullable)"),
        Column::text("persona", "persona").doc("JSON array of MessageSegment for interleaved rendering (nullable)"),
        Column::text("contextFlow", "context_flow").doc("JSON server-owned identity snapshot for this turn"),
        Column::text("thinking", "thinking").doc("JSON snapshot of outbound LLM context for this assistant response"),
        Column::text("createdAt", "created_at").not_null().doc("Chain-of-thought / reasoning content (nullable)"),
    ],
    extra: &[
        TableIndex::index("idx_messages_session", &["sessionId", "createdAt"]),
        TableIndex::index("idx_messages_created_at", &["createdAt"]),
    ],
};

/// `export const subAgentHistory` — SQL table `sub_agent_history`.
pub static SUB_AGENT_HISTORY: Table = Table {
    var: "subAgentHistory",
    name: "sub_agent_history",
    columns: &[
        Column::text("subAgentId", "sub_agent_id").primary_key(),
        Column::text("sessionId", "session_id"),
        Column::text("messageId", "message_id"),
        Column::text("content", "content"),
        Column::text("performative", "performative").doc("JSON array of SubAgentSegment"),
        Column::integer("rounds", "rounds"),
        Column::integer("durationMs", "duration_ms"),
        Column::text("segments", "segments"),
        Column::text("toolCalls", "tool_calls").doc("JSON array of MessageSegment (lazy render fallback)"),
        Column::text("createdAt", "created_at").not_null().doc("JSON array of executed tool calls"),
    ],
    extra: &[
        TableIndex::index("idx_sub_agent_history_session", &["sessionId", "createdAt"]),
        TableIndex::index("idx_sub_agent_history_message", &["messageId"]),
    ],
};

/// `export const sessionEvents` — SQL table `session_events`.
pub static SESSION_EVENTS: Table = Table {
    var: "sessionEvents",
    name: "session_events",
    columns: &[
        Column::text("sessionId", "session_id").not_null(),
        Column::integer("logId", "log_id").not_null(),
        Column::text("type", "type").not_null(),
        Column::text("payload", "payload").not_null(),
        Column::integer("createdAt", "created_at").not_null().doc("JSON serialized stream event"),
    ],
    extra: &[
        TableIndex::primary_key(&["sessionId", "logId"]),
    ],
};

/// `export const messageContextMetadata` — SQL table `message_context_metadata`.
pub static MESSAGE_CONTEXT_METADATA: Table = Table {
    var: "messageContextMetadata",
    name: "message_context_metadata",
    columns: &[
        Column::text("messageId", "message_id").primary_key().references_cascade("messages", "id"),
        Column::integer_boolean("hasMemoryProvenance", "has_memory_provenance").not_null().default_boolean(false),
    ],
    extra: &[],
};

/// `export const sessionState` — SQL table `session_state`.
pub static SESSION_STATE: Table = Table {
    var: "sessionState",
    name: "session_state",
    columns: &[
        Column::text("sessionId", "session_id").not_null(),
        Column::text("key", "key").not_null(),
        Column::text("value", "value"),
        Column::text("updatedAt", "updated_at").not_null().doc("JSON-serialized"),
    ],
    extra: &[
        TableIndex::index("idx_session_state_session", &["sessionId"]),
    ],
};

/// `export const projectState` — SQL table `project_state`.
pub static PROJECT_STATE: Table = Table {
    var: "projectState",
    name: "project_state",
    columns: &[
        Column::text("projectId", "project_id").not_null(),
        Column::text("key", "key").not_null(),
        Column::text("value", "value"),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_project_state_project", &["projectId"]),
    ],
};

/// `export const architectureDiagrams` — SQL table `architecture_diagrams`.
pub static ARCHITECTURE_DIAGRAMS: Table = Table {
    var: "architectureDiagrams",
    name: "architecture_diagrams",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("projectRoot", "project_root").not_null(),
        Column::text("diagram", "diagram").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_architecture_diagrams_user_project", &["userId", "projectRoot"]),
        TableIndex::index("idx_architecture_diagrams_updated", &["updatedAt"]),
    ],
};

/// `export const codeGraphIndexes` — SQL table `code_graph_indexes`.
pub static CODE_GRAPH_INDEXES: Table = Table {
    var: "codeGraphIndexes",
    name: "code_graph_indexes",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("repositoryId", "repository_id"),
        Column::text("projectRoot", "project_root").not_null(),
        Column::text("provider", "provider").not_null().default_text("graphify"),
        Column::text("status", "status").not_null().default_text("missing"),
        Column::text("graphPath", "graph_path"),
        Column::text("graphVersion", "graph_version"),
        Column::text("sourceRevision", "source_revision"),
        Column::text("graphifyVersion", "graphify_version"),
        Column::text("stats", "stats"),
        Column::text("graphRagStatus", "graphrag_status").not_null().default_text("not-prepared"),
        Column::text("graphRagPath", "graphrag_path"),
        Column::text("error", "error"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_code_graph_indexes_user_project", &["userId", "projectRoot"]),
        TableIndex::index("idx_code_graph_indexes_repository", &["repositoryId", "updatedAt"]),
        TableIndex::index("idx_code_graph_indexes_status", &["status", "updatedAt"]),
    ],
};

/// `export const personaAgents` — SQL table `persona_agents`.
pub static PERSONA_AGENTS: Table = Table {
    var: "personaAgents",
    name: "persona_agents",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").not_null(),
        Column::text("data", "data").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_persona_agents_user", &["userId"]),
    ],
};

/// `export const agentThreads` — SQL table `agent_threads`.
pub static AGENT_THREADS: Table = Table {
    var: "agentThreads",
    name: "agent_threads",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").doc("UUIDv7"),
        Column::text("sessionId", "session_id"),
        Column::text("personaAgentId", "persona_agent_id").doc("Links to the chat session"),
        Column::text("title", "title").not_null(),
        Column::text("providerId", "provider_id").not_null(),
        Column::text("model", "model").doc("\"jait\" | \"codex\" | \"claude-code\""),
        Column::text("reasoningEffort", "reasoning_effort"),
        Column::text("runtimeMode", "runtime_mode").not_null().default_text("full-access").doc("Provider-specific effort (\"high\", \"xhigh\", …)"),
        Column::text("kind", "kind").not_null().default_text("delivery").doc("\"full-access\" | \"supervised\""),
        Column::text("skillIds", "skill_ids").doc("delivery | delegation"),
        Column::text("workingDirectory", "working_directory").doc("JSON string[] override; null => use global enabled skills"),
        Column::text("branch", "branch"),
        Column::text("status", "status").not_null().default_text("running").doc("Git branch name"),
        Column::text("providerSessionId", "provider_session_id").doc("running | completed | error | interrupted"),
        Column::text("error", "error").doc("Active provider session ID"),
        Column::text("prUrl", "pr_url"),
        Column::integer("prNumber", "pr_number"),
        Column::text("prTitle", "pr_title"),
        Column::text("prBaseBranch", "pr_base_branch"),
        Column::text("prState", "pr_state"),
        Column::text("executionNodeId", "execution_node_id").doc("open | closed | merged"),
        Column::text("executionNodeName", "execution_node_name").doc("Id of the FsNode executing this thread"),
        Column::text("routingPlan", "routing_plan").doc("Human-readable node name"),
        Column::integer("changeFiles", "change_files").doc("JSON RoutingPlan from thread router"),
        Column::integer("changeInsertions", "change_insertions").doc("persisted diff stats (files changed)"),
        Column::integer("changeDeletions", "change_deletions").doc("persisted diff stats (lines added)"),
        Column::text("createdAt", "created_at").not_null().doc("persisted diff stats (lines removed)"),
        Column::text("updatedAt", "updated_at").not_null(),
        Column::text("completedAt", "completed_at"),
    ],
    extra: &[
        TableIndex::index("idx_agent_threads_user", &["userId"]),
        TableIndex::index("idx_agent_threads_session", &["sessionId"]),
        TableIndex::index("idx_agent_threads_status", &["status"]),
        TableIndex::index("idx_agent_threads_updated", &["updatedAt"]),
    ],
};

/// `export const threadRecovery` — SQL table `thread_recovery`.
pub static THREAD_RECOVERY: Table = Table {
    var: "threadRecovery",
    name: "thread_recovery",
    columns: &[
        Column::text("threadId", "thread_id").primary_key(),
        Column::integer("attempts", "attempts").not_null().default_integer(0),
        Column::text("staleProviderSessionId", "stale_provider_session_id"),
        Column::integer_boolean("pending", "pending").not_null().default_boolean(true),
    ],
    extra: &[],
};

/// `export const agentThreadActivities` — SQL table `agent_thread_activities`.
pub static AGENT_THREAD_ACTIVITIES: Table = Table {
    var: "agentThreadActivities",
    name: "agent_thread_activities",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("threadId", "thread_id").not_null(),
        Column::text("kind", "kind").not_null(),
        Column::text("summary", "summary").not_null().doc("\"tool.start\" | \"tool.result\" | \"message\" | \"error\" | \"activity\""),
        Column::text("payload", "payload"),
        Column::text("createdAt", "created_at").not_null().doc("JSON"),
    ],
    extra: &[
        TableIndex::index("idx_agent_thread_activities_thread", &["threadId", "createdAt"]),
        TableIndex::index("idx_agent_thread_activities_kind_created_at", &["kind", "createdAt"]),
    ],
};

/// `export const automationRepositories` — SQL table `automation_repositories`.
pub static AUTOMATION_REPOSITORIES: Table = Table {
    var: "automationRepositories",
    name: "automation_repositories",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").doc("UUIDv7"),
        Column::text("deviceId", "device_id"),
        Column::text("name", "name").not_null().doc("which client device registered this repo"),
        Column::text("defaultBranch", "default_branch").not_null().default_text("main"),
        Column::text("localPath", "local_path").not_null(),
        Column::text("githubUrl", "github_url"),
        Column::text("strategy", "strategy").doc("HTTPS clone URL for gateway-side cloning"),
        Column::text("createdAt", "created_at").not_null().doc("Markdown strategy/instructions for agent threads"),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_automation_repos_user", &["userId"]),
    ],
};

/// `export const automationPlans` — SQL table `automation_plans`.
pub static AUTOMATION_PLANS: Table = Table {
    var: "automationPlans",
    name: "automation_plans",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("repoId", "repo_id").not_null().doc("UUIDv7"),
        Column::text("userId", "user_id"),
        Column::text("title", "title").not_null(),
        Column::text("status", "status").not_null().default_text("draft"),
        Column::text("tasks", "tasks").not_null().default_text("[]").doc("draft | active | completed | archived"),
        Column::text("createdAt", "created_at").not_null().doc("JSON array of PlanTask objects"),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_automation_plans_repo", &["repoId"]),
        TableIndex::index("idx_automation_plans_user", &["userId"]),
    ],
};

/// `export const automationRepoProposals` — SQL table `automation_repo_proposals`.
pub static AUTOMATION_REPO_PROPOSALS: Table = Table {
    var: "automationRepoProposals",
    name: "automation_repo_proposals",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("repoId", "repo_id").not_null(),
        Column::text("userId", "user_id"),
        Column::text("message", "message").not_null(),
        Column::text("status", "status").not_null().default_text("open"),
        Column::text("priority", "priority").not_null().default_text("normal"),
        Column::text("dueDate", "due_date"),
        Column::text("tags", "tags").not_null().default_text("[]"),
        Column::text("completedAt", "completed_at"),
        Column::text("completionHistory", "completion_history").not_null().default_text("[]"),
        Column::text("sourceThreadId", "source_thread_id"),
        Column::text("sourceThreadTitle", "source_thread_title"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_automation_repo_proposals_repo", &["repoId", "updatedAt"]),
        TableIndex::index("idx_automation_repo_proposals_user", &["userId", "updatedAt"]),
        TableIndex::index("idx_automation_repo_proposals_completed", &["repoId", "completedAt"]),
    ],
};

/// `export const networkHosts` — SQL table `network_hosts`.
pub static NETWORK_HOSTS: Table = Table {
    var: "networkHosts",
    name: "network_hosts",
    columns: &[
        Column::text("ip", "ip").primary_key(),
        Column::text("mac", "mac"),
        Column::text("hostname", "hostname"),
        Column::text("osVersion", "os_version"),
        Column::text("openPorts", "open_ports").not_null().default_text("[]"),
        Column::integer("sshReachable", "ssh_reachable").not_null().default_integer(0).doc("JSON number[]"),
        Column::text("agentStatus", "agent_status").not_null().default_text("not-installed"),
        Column::text("providers", "providers"),
        Column::text("firstSeenAt", "first_seen_at").not_null().doc("JSON string[] | null"),
        Column::text("lastSeenAt", "last_seen_at").not_null(),
        Column::text("scannedAt", "scanned_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_network_hosts_last_seen", &["lastSeenAt"]),
    ],
};

/// `export const nodes` — SQL table `nodes`.
pub static NODES: Table = Table {
    var: "nodes",
    name: "nodes",
    columns: &[
        Column::text("nodeId", "node_id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("name", "name"),
        Column::text("platform", "platform"),
        Column::text("role", "role"),
        Column::text("firstSeenAt", "first_seen_at").not_null(),
        Column::text("lastSeenAt", "last_seen_at").not_null(),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_nodes_last_seen", &["lastSeenAt"]),
    ],
};

/// `export const nodePermissions` — SQL table `node_permissions`.
pub static NODE_PERMISSIONS: Table = Table {
    var: "nodePermissions",
    name: "node_permissions",
    columns: &[
        Column::text("nodeId", "node_id").not_null(),
        Column::text("capability", "capability").not_null(),
        Column::integer("granted", "granted").not_null().default_integer(0).doc("'terminal'|'filesystem'|'screen'|'voice'|'browser'|'camera'|'network'"),
        Column::text("updatedAt", "updated_at").not_null().doc("0 = denied, 1 = granted"),
    ],
    extra: &[
        TableIndex::primary_key(&["nodeId", "capability"]),
    ],
};

/// `export const scheduledJobs` — SQL table `scheduled_jobs`.
pub static SCHEDULED_JOBS: Table = Table {
    var: "scheduledJobs",
    name: "scheduled_jobs",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id"),
        Column::text("name", "name").not_null(),
        Column::text("cron", "cron").not_null(),
        Column::text("toolName", "tool_name").not_null(),
        Column::text("input", "input"),
        Column::text("sessionId", "session_id").doc("JSON object"),
        Column::text("projectRoot", "project_root"),
        Column::integer("enabled", "enabled").not_null().default_integer(1),
        Column::text("lastRunAt", "last_run_at"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_scheduled_jobs_enabled", &["enabled"]),
        TableIndex::index("idx_scheduled_jobs_updated", &["updatedAt"]),
    ],
};

/// `export const scheduledJobRuns` — SQL table `scheduled_job_runs`.
pub static SCHEDULED_JOB_RUNS: Table = Table {
    var: "scheduledJobRuns",
    name: "scheduled_job_runs",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("jobId", "job_id").not_null().doc("UUIDv7"),
        Column::text("status", "status").not_null().default_text("running"),
        Column::text("triggeredBy", "triggered_by").not_null().default_text("schedule").doc("running | completed | failed"),
        Column::text("output", "output").doc("schedule | manual | maintenance"),
        Column::text("error", "error").doc("stdout/stderr or summary text"),
        Column::text("planId", "plan_id"),
        Column::text("startedAt", "started_at").not_null().doc("FK → automation_plans.id if a fix plan was created"),
        Column::text("completedAt", "completed_at"),
    ],
    extra: &[
        TableIndex::index("idx_job_runs_job", &["jobId"]),
        TableIndex::index("idx_job_runs_started", &["startedAt"]),
    ],
};

/// `export const mobilePushRegistrations` — SQL table `mobile_push_registrations`.
pub static MOBILE_PUSH_REGISTRATIONS: Table = Table {
    var: "mobilePushRegistrations",
    name: "mobile_push_registrations",
    columns: &[
        Column::text("deviceId", "device_id").primary_key(),
        Column::text("userId", "user_id").not_null(),
        Column::text("token", "token").not_null(),
        Column::text("platform", "platform").not_null().default_text("android"),
        Column::integer("enabled", "enabled").not_null().default_integer(1),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
        Column::text("lastSeenAt", "last_seen_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_mobile_push_token", &["token"]),
        TableIndex::index("idx_mobile_push_user_enabled", &["userId", "enabled", "lastSeenAt"]),
    ],
};

/// `export const browserSessions` — SQL table `browser_sessions`.
pub static BROWSER_SESSIONS: Table = Table {
    var: "browserSessions",
    name: "browser_sessions",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("name", "name").not_null(),
        Column::text("projectRoot", "project_root"),
        Column::text("targetUrl", "target_url"),
        Column::text("previewUrl", "preview_url"),
        Column::text("previewSessionId", "preview_session_id"),
        Column::text("browserId", "browser_id"),
        Column::text("mode", "mode").not_null().default_text("shared"),
        Column::text("origin", "origin").not_null().default_text("direct").doc("'shared' | 'isolated'"),
        Column::text("controller", "controller").not_null().default_text("agent").doc("'attached' | 'managed' | 'direct'"),
        Column::text("status", "status").not_null().default_text("ready").doc("'agent' | 'user' | 'observer'"),
        Column::integer("secretSafe", "secret_safe").not_null().default_integer(0).doc("'ready' | 'running' | 'paused' | 'intervention-required' | 'closed'"),
        Column::text("storageProfile", "storage_profile"),
        Column::text("createdBy", "created_by").doc("JSON"),
        Column::text("createdAt", "created_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_browser_sessions_browser", &["browserId"]),
        TableIndex::index("idx_browser_sessions_preview", &["previewSessionId"]),
        TableIndex::index("idx_browser_sessions_user_updated", &["createdBy", "updatedAt"]),
    ],
};

/// `export const browserInterventions` — SQL table `browser_interventions`.
pub static BROWSER_INTERVENTIONS: Table = Table {
    var: "browserInterventions",
    name: "browser_interventions",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("browserSessionId", "browser_session_id").not_null(),
        Column::text("threadId", "thread_id"),
        Column::text("chatSessionId", "chat_session_id"),
        Column::text("kind", "kind").not_null().default_text("custom"),
        Column::text("reason", "reason").not_null(),
        Column::text("instructions", "instructions").not_null(),
        Column::text("status", "status").not_null().default_text("open"),
        Column::integer("secretSafe", "secret_safe").not_null().default_integer(0).doc("'open' | 'resolved' | 'cancelled'"),
        Column::integer("allowUserNote", "allow_user_note").not_null().default_integer(1),
        Column::text("requestedBy", "requested_by"),
        Column::text("resolvedBy", "resolved_by"),
        Column::text("userNote", "user_note"),
        Column::text("requestedAt", "requested_at").not_null(),
        Column::text("resolvedAt", "resolved_at"),
    ],
    extra: &[
        TableIndex::index("idx_browser_interventions_session", &["browserSessionId", "requestedAt"]),
        TableIndex::index("idx_browser_interventions_status", &["status", "requestedAt"]),
    ],
};

/// `export const plugins` — SQL table `plugins`.
pub static PLUGINS: Table = Table {
    var: "plugins",
    name: "plugins",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("displayName", "display_name").not_null(),
        Column::text("version", "version").not_null(),
        Column::text("description", "description"),
        Column::text("author", "author"),
        Column::text("path", "path").not_null(),
        Column::text("status", "status").not_null().default_text("installed"),
        Column::text("config", "config").not_null().default_text("{}").doc("'installed' | 'enabled' | 'disabled' | 'error'"),
        Column::text("error", "error"),
        Column::text("installedAt", "installed_at").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[],
};

/// `export const nodeCredentials` — SQL table `node_credentials`.
pub static NODE_CREDENTIALS: Table = Table {
    var: "nodeCredentials",
    name: "node_credentials",
    columns: &[
        Column::text("tokenHash", "token_hash").primary_key(),
        Column::text("nodeId", "node_id").not_null(),
        Column::text("userId", "user_id").not_null(),
        Column::text("createdAt", "created_at").not_null(),
    ],
    extra: &[],
};

/// `export const accountInvitations` — SQL table `account_invitations`.
pub static ACCOUNT_INVITATIONS: Table = Table {
    var: "accountInvitations",
    name: "account_invitations",
    columns: &[
        Column::text("tokenHash", "token_hash").primary_key(),
        Column::text("createdBy", "created_by").not_null(),
        Column::text("expiresAt", "expires_at").not_null(),
    ],
    extra: &[],
};

/// `export const teamRooms` — SQL table `team_rooms`.
pub static TEAM_ROOMS: Table = Table {
    var: "teamRooms",
    name: "team_rooms",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").not_null(),
        Column::text("rootAgentId", "root_agent_id").not_null(),
        Column::text("data", "data").not_null(),
    ],
    extra: &[
        TableIndex::index("idx_team_room_root", &["userId", "rootAgentId"]),
    ],
};

/// `export const teamMessages` — SQL table `team_room_messages`.
pub static TEAM_MESSAGES: Table = Table {
    var: "teamMessages",
    name: "team_room_messages",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("roomId", "room_id").not_null(),
        Column::text("clientKey", "client_key").not_null(),
        Column::text("data", "data").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_team_message_key", &["roomId", "clientKey"]),
    ],
};

/// `export const agentGithubApps` — SQL table `agent_github_apps`.
pub static AGENT_GITHUB_APPS: Table = Table {
    var: "agentGithubApps",
    name: "agent_github_apps",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("userId", "user_id").not_null(),
        Column::text("agentId", "agent_id").not_null(),
        Column::text("status", "status").not_null(),
        Column::text("data", "data").not_null(),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[
        TableIndex::unique("idx_agent_github_app_agent", &["userId", "agentId"]),
    ],
};

/// `export const teamDeliveries` — SQL table `team_room_deliveries`.
pub static TEAM_DELIVERIES: Table = Table {
    var: "teamDeliveries",
    name: "team_room_deliveries",
    columns: &[
        Column::text("id", "id").primary_key(),
        Column::text("roomId", "room_id").not_null(),
        Column::text("messageId", "message_id").not_null(),
        Column::text("agentId", "agent_id").not_null(),
        Column::text("sessionId", "session_id").not_null(),
        Column::text("status", "status").not_null(),
        Column::text("error", "error"),
    ],
    extra: &[
        TableIndex::index("idx_team_delivery_status", &["status"]),
    ],
};

/// `export const agentControl` — SQL table `agent_control`.
pub static AGENT_CONTROL: Table = Table {
    var: "agentControl",
    name: "agent_control",
    columns: &[
        Column::text("userId", "user_id").primary_key(),
        Column::integer_boolean("halted", "halted").not_null().default_boolean(false),
        Column::text("reason", "reason"),
        Column::text("haltedAt", "halted_at"),
        Column::text("updatedAt", "updated_at").not_null(),
    ],
    extra: &[],
};

/// Every table in `schema.ts` declaration order (`TABLES` is not sorted).
pub static TABLES: &[&Table] = &[
    &PROJECTS,
    &SESSIONS,
    &USERS,
    &USER_SETTINGS,
    &PROVIDER_ACCOUNTS,
    &PROVIDER_USAGE,
    &ASSISTANT_PROFILES,
    &AUDIT_LOG,
    &TRUST_LEVELS,
    &CONSENT_LOG,
    &CONSENT_SESSION_APPROVALS,
    &MEMORIES,
    &USER_SECRETS,
    &EMAIL_ACCOUNTS,
    &CALENDAR_ACCOUNTS,
    &DEVICE_CALENDAR_SNAPSHOTS,
    &REMINDERS,
    &MESSAGES,
    &SUB_AGENT_HISTORY,
    &SESSION_EVENTS,
    &MESSAGE_CONTEXT_METADATA,
    &SESSION_STATE,
    &PROJECT_STATE,
    &ARCHITECTURE_DIAGRAMS,
    &CODE_GRAPH_INDEXES,
    &PERSONA_AGENTS,
    &AGENT_THREADS,
    &THREAD_RECOVERY,
    &AGENT_THREAD_ACTIVITIES,
    &AUTOMATION_REPOSITORIES,
    &AUTOMATION_PLANS,
    &AUTOMATION_REPO_PROPOSALS,
    &NETWORK_HOSTS,
    &NODES,
    &NODE_PERMISSIONS,
    &SCHEDULED_JOBS,
    &SCHEDULED_JOB_RUNS,
    &MOBILE_PUSH_REGISTRATIONS,
    &BROWSER_SESSIONS,
    &BROWSER_INTERVENTIONS,
    &PLUGINS,
    &NODE_CREDENTIALS,
    &ACCOUNT_INVITATIONS,
    &TEAM_ROOMS,
    &TEAM_MESSAGES,
    &AGENT_GITHUB_APPS,
    &TEAM_DELIVERIES,
    &AGENT_CONTROL,
];

/// Look up a table by its SQL name (drizzle's `Table.Symbol.Name`).
pub fn table_by_name(name: &str) -> Option<&'static Table> {
    TABLES.iter().copied().find(|table| table.name == name)
}

/// Look up a table by its TS export name.
pub fn table_by_var(var: &str) -> Option<&'static Table> {
    TABLES.iter().copied().find(|table| table.var == var)
}

/// The schema module's exports in ECMAScript module-namespace order.
///
/// `import * as schema from "./schema"` yields a namespace object whose own string keys the
/// spec sorts by code unit (UTF-16 code unit order, which for these ASCII identifiers is
/// byte order). `Object.entries(schema)` — used by both `createDrizzle` and
/// `extractTablesRelationalConfig` — therefore iterates alphabetically, not in source order.
pub fn namespace_order() -> Vec<&'static Table> {
    let mut tables: Vec<&'static Table> = TABLES.to_vec();
    tables.sort_by(|a, b| a.var.as_bytes().cmp(b.var.as_bytes()));
    tables
}

/// One entry of the `tablesConfig` map built by
/// `extractTablesRelationalConfig(schema, createTableRelationsHelpers)`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TableRelationalConfig {
    /// `tsName` — the module export name.
    pub ts_name: &'static str,
    /// `dbName` — `value[Table.Symbol.Name]`, i.e. the SQL table name.
    pub db_name: &'static str,
    /// `columns` — `value[Table.Symbol.Columns]`, in declaration order.
    pub columns: &'static [Column],
    /// `primaryKey` — column-level `.primaryKey()` columns followed by the composite
    /// `primaryKey({ columns })` entries, exactly as
    /// [`Table::primary_key_columns`] assembles them.
    pub primary_key: Vec<&'static Column>,
}

/// The return value of `extractTablesRelationalConfig(...)`, restricted to the inputs this
/// schema produces.
///
/// Two branches of the TS function cannot fire for `schema.ts` and are therefore not modeled:
///
/// * the `Object.keys(schema).length === 1 && "default" in schema` namespace unwrapping —
///   the module has 48 exports and no `default` export;
/// * `relations` — every entry is `{}` because the module declares no `relations(...)`
///   call, so the field carries no information and is omitted instead of being faked;
/// * `schema` — `Table.Symbol.Schema` is `undefined` for SQLite tables, so drizzle does not
///   emit the field at all.
///
/// `tables` and `table_names_map` keep the namespace iteration order, matching the insertion
/// order of the objects the TS function returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TablesRelationalConfig {
    /// `tables` — one config per table, keyed implicitly by `ts_name`.
    pub tables: Vec<TableRelationalConfig>,
    /// `tableNamesMap` — SQL table name → export name.
    pub table_names_map: Vec<(&'static str, &'static str)>,
}

impl TablesRelationalConfig {
    /// Look up a table config by export name (`tables[tsName]`).
    pub fn table(&self, ts_name: &str) -> Option<&TableRelationalConfig> {
        self.tables.iter().find(|table| table.ts_name == ts_name)
    }

    /// Look up a table config by SQL name via `tableNamesMap`.
    pub fn table_for_db_name(&self, db_name: &str) -> Option<&TableRelationalConfig> {
        let ts_name = self
            .table_names_map
            .iter()
            .find(|(name, _)| *name == db_name)
            .map(|(_, ts_name)| *ts_name)?;
        self.table(ts_name)
    }

    /// `tableNamesMap[dbName]`.
    pub fn ts_name_for_db_name(&self, db_name: &str) -> Option<&'static str> {
        self.table_names_map
            .iter()
            .find(|(name, _)| *name == db_name)
            .map(|(_, ts_name)| *ts_name)
    }
}

/// Port of `extractTablesRelationalConfig(schema, createTableRelationsHelpers)` for this
/// schema: every export is an `SQLiteTable`, none of them declares relations, and the table
/// names are unique (asserted in the tests below), so the TS function is a straight fold over
/// the namespace.
pub fn relational_config() -> TablesRelationalConfig {
    let mut tables = Vec::new();
    let mut table_names_map = Vec::new();
    for table in namespace_order() {
        table_names_map.push((table.name, table.var));
        tables.push(TableRelationalConfig {
            ts_name: table.var,
            db_name: table.name,
            columns: table.columns,
            primary_key: table.primary_key_columns(),
        });
    }
    TablesRelationalConfig {
        tables,
        table_names_map,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_columns() -> Vec<(&'static Table, &'static Column)> {
        TABLES
            .iter()
            .flat_map(|table| table.columns.iter().map(move |column| (*table, column)))
            .collect()
    }

    #[test]
    fn tables_are_declared_in_source_order() {
        let names: Vec<&str> = TABLES.iter().map(|table| table.name).collect();
        assert_eq!(names.len(), 48);
        // `grep -n "sqliteTable(" packages/gateway/src/db/schema.ts` → 48 declarations in this
        // exact order; the Rust table list mirrors the TypeScript declaration order verbatim.
        let vars_in_order: Vec<&str> = TABLES.iter().map(|table| table.var).collect();
        assert_eq!(
            vars_in_order.join(","),
            "projects,sessions,users,userSettings,providerAccounts,providerUsage,\
assistantProfiles,auditLog,trustLevels,consentLog,consentSessionApprovals,memories,userSecrets,\
emailAccounts,calendarAccounts,deviceCalendarSnapshots,reminders,messages,subAgentHistory,\
sessionEvents,messageContextMetadata,sessionState,projectState,architectureDiagrams,\
codeGraphIndexes,personaAgents,agentThreads,threadRecovery,agentThreadActivities,\
automationRepositories,automationPlans,automationRepoProposals,networkHosts,nodes,nodePermissions,\
scheduledJobs,scheduledJobRuns,mobilePushRegistrations,browserSessions,browserInterventions,\
plugins,nodeCredentials,accountInvitations,teamRooms,teamMessages,agentGithubApps,teamDeliveries,\
agentControl"
        );
        // every export is unique, and so is every SQL name (drizzle's `tableNamesMap` keys)
        let mut vars: Vec<&str> = TABLES.iter().map(|table| table.var).collect();
        vars.sort_unstable();
        vars.dedup();
        assert_eq!(vars.len(), 48);
        let mut sql_names: Vec<&str> = names.clone();
        sql_names.sort_unstable();
        sql_names.dedup();
        assert_eq!(sql_names.len(), 48);
    }

    #[test]
    fn column_and_index_inventory_matches_source() {
        let columns = all_columns();
        assert_eq!(columns.len(), 420);
        let extra: Vec<&TableIndex> = TABLES.iter().flat_map(|table| table.extra.iter()).collect();
        assert_eq!(extra.len(), 69);
        let kind_count = |kind: IndexKind| extra.iter().filter(|entry| entry.kind == kind).count();
        assert_eq!(kind_count(IndexKind::Index), 58);
        assert_eq!(kind_count(IndexKind::UniqueIndex), 9);
        assert_eq!(kind_count(IndexKind::PrimaryKey), 2);
        // no table repeats its own index name
        for table in TABLES {
            let mut names: Vec<&str> = table.indexes().map(|entry| entry.name).collect();
            assert!(!names.contains(&""));
            let before = names.len();
            names.sort_unstable();
            names.dedup();
            assert_eq!(before, names.len(), "duplicate index name in {}", table.var);
        }
    }

    #[test]
    fn column_modifiers_match_source() {
        let columns = all_columns();
        assert_eq!(columns.iter().filter(|(_, c)| c.not_null).count(), 215);
        assert_eq!(columns.iter().filter(|(_, c)| c.unique).count(), 2);
        assert_eq!(columns.iter().filter(|(_, c)| c.doc.is_some()).count(), 91);
        assert_eq!(
            columns
                .iter()
                .filter(|(_, c)| matches!(c.default, Some(ColumnDefault::Text(_))))
                .count(),
            45
        );
        // the two `.unique()` columns
        let unique: Vec<(&str, &str)> = columns
            .iter()
            .filter(|(_, c)| c.unique)
            .map(|(t, c)| (t.var, c.key))
            .collect();
        // `grep -n "unique()" packages/gateway/src/db/schema.ts` → users.username and
        // auditLog.actionId are the only two unique columns in the source schema.
        assert_eq!(unique, vec![("users", "username"), ("auditLog", "actionId")]);
    }

    #[test]
    fn boolean_columns_use_integer_mode() {
        let booleans: Vec<(&str, &str, &ColumnKind, Option<ColumnDefault>)> = all_columns()
            .iter()
            .filter(|(_, c)| c.boolean_mode)
            .map(|(t, c)| (t.var, c.key, &c.kind, c.default))
            .collect();
        assert_eq!(booleans.len(), 3);
        assert_eq!(
            booleans,
            vec![
                (
                    "messageContextMetadata",
                    "hasMemoryProvenance",
                    &ColumnKind::Integer,
                    Some(ColumnDefault::Boolean(false))
                ),
                (
                    "threadRecovery",
                    "pending",
                    &ColumnKind::Integer,
                    Some(ColumnDefault::Boolean(true))
                ),
                (
                    "agentControl",
                    "halted",
                    &ColumnKind::Integer,
                    Some(ColumnDefault::Boolean(false))
                ),
            ]
        );
        assert_eq!(ColumnKind::Integer.sql_type(), "integer");
        assert_eq!(ColumnKind::Text.sql_type(), "text");
        assert_eq!(ColumnKind::Real.sql_type(), "real");
    }

    #[test]
    fn defaults_match_the_column_type() {
        for (table, column) in all_columns() {
            match column.default {
                None => {}
                Some(ColumnDefault::Boolean(_)) => {
                    assert!(column.boolean_mode, "{}.{}", table.var, column.key)
                }
                Some(ColumnDefault::Integer(_)) => {
                    assert_eq!(column.kind, ColumnKind::Integer, "{}.{}", table.var, column.key);
                    assert!(!column.boolean_mode, "{}.{}", table.var, column.key);
                }
                Some(ColumnDefault::Text(_)) => {
                    assert_eq!(column.kind, ColumnKind::Text, "{}.{}", table.var, column.key)
                }
            }
        }
    }

    #[test]
    fn references_target_existing_tables_and_columns() {
        let references: Vec<(&str, &str, ColumnReference)> = all_columns()
            .iter()
            .filter_map(|(table, column)| {
                column
                    .reference
                    .map(|reference| (table.var, column.key, reference))
            })
            .collect();
        assert_eq!(references.len(), 1);
        let (var, key, reference) = references[0];
        assert_eq!(var, "messageContextMetadata");
        assert_eq!(key, "messageId");
        assert_eq!(
            reference,
            ColumnReference {
                table: "messages",
                column: "id",
                on_delete: Some(ReferentialAction::Cascade),
            }
        );
        assert_eq!(ReferentialAction::Cascade.as_str(), "cascade");
        for table in TABLES {
            for column in table.columns {
                if let Some(reference) = column.reference {
                    let target = table_by_var(reference.table)
                        .unwrap_or_else(|| panic!("{}: unknown table {}", table.var, reference.table));
                    assert!(
                        target.column(reference.column).is_some(),
                        "{}: unknown column {}.{}",
                        table.var,
                        reference.table,
                        reference.column
                    );
                }
            }
        }
    }

    #[test]
    fn primary_keys_include_composite_entries() {
        let without: Vec<&str> = TABLES
            .iter()
            .filter(|table| table.primary_key_columns().is_empty())
            .map(|table| table.var)
            .collect();
        assert_eq!(without, vec!["providerUsage", "sessionState", "projectState"]);

        let composite: Vec<(&str, Vec<&str>)> = TABLES
            .iter()
            .filter(|table| table.primary_key_indexes().count() > 0)
            .map(|table| {
                let keys = table
                    .primary_key_columns()
                    .iter()
                    .map(|column| column.key)
                    .collect();
                (table.var, keys)
            })
            .collect();
        assert_eq!(
            composite,
            vec![
                ("sessionEvents", vec!["sessionId", "logId"]),
                ("nodePermissions", vec!["nodeId", "capability"]),
            ]
        );

        let projects = table_by_var("projects").expect("projects table");
        assert_eq!(projects.primary_key_columns().len(), 1);
        assert_eq!(projects.primary_key_columns()[0].key, "id");
        assert_eq!(
            projects.columns.iter().map(|column| column.key).collect::<Vec<_>>(),
            vec![
                "id",
                "userId",
                "title",
                "rootPath",
                "nodeId",
                "createdAt",
                "lastActiveAt",
                "status",
                "metadata",
                "parentId",
                "instructions",
                "description",
                "color",
                "kind",
            ]
        );
    }

    #[test]
    fn lookups_are_by_sql_name_and_export_name() {
        let sessions = table_by_name("sessions").expect("sessions");
        assert_eq!(sessions.var, "sessions");
        assert_eq!(sessions.table_name(), "sessions");
        assert_eq!(sessions.unique_name(), "sessions");
        assert_eq!(
            table_by_var("sessions").map(|table| table.name),
            Some("sessions")
        );
        assert!(table_by_name("nope").is_none());
        assert!(table_by_var("nope").is_none());
        assert!(sessions.column("nope").is_none());
        assert_eq!(
            sessions.column("id").map(|column| (column.name, column.kind, column.primary_key)),
            // TS: `id: text("id").primaryKey()` — sessions.id is text, not integer.
            Some(("id", ColumnKind::Text, true))
        );
    }

    #[test]
    fn namespace_order_is_ascii_sorted() {
        let ordered = namespace_order();
        assert_eq!(ordered.len(), 48);
        let vars: Vec<&str> = ordered.iter().map(|table| table.var).collect();
        assert_eq!(vars.first().copied(), Some("accountInvitations"));
        assert_eq!(vars.last().copied(), Some("users"));
        let mut sorted = vars.clone();
        sorted.sort_unstable();
        assert_eq!(vars, sorted);
        // source order is different, i.e. the two orders really are distinct
        assert_ne!(
            TABLES.iter().map(|table| table.var).collect::<Vec<_>>(),
            vars
        );
    }

    #[test]
    fn relational_config_matches_drizzle_extraction() {
        let config = relational_config();
        assert_eq!(config.tables.len(), 48);
        assert_eq!(config.table_names_map.len(), 48);

        for table in TABLES {
            let entry = config.table(table.var).expect("config for export");
            assert_eq!(entry.ts_name, table.var);
            assert_eq!(entry.db_name, table.name);
            assert_eq!(entry.columns.len(), table.columns.len());
            assert_eq!(entry.primary_key, table.primary_key_columns());
            assert_eq!(config.ts_name_for_db_name(table.name), Some(table.var));
            assert_eq!(
                config
                    .table_for_db_name(table.name)
                    .map(|entry| entry.ts_name),
                Some(table.var)
            );
        }

        // tableNamesMap is db name -> export name, in namespace order
        assert_eq!(
            config.table_names_map.first().copied(),
            Some(("account_invitations", "accountInvitations"))
        );
        assert_eq!(
            config.table_names_map.last().copied(),
            Some(("users", "users"))
        );
        assert!(config.table("nope").is_none());
        assert!(config.table_for_db_name("nope").is_none());

        let mcm = config.table("messageContextMetadata").expect("config");
        assert_eq!(mcm.db_name, "message_context_metadata");
        assert_eq!(
            mcm.primary_key
                .iter()
                .map(|column| column.key)
                .collect::<Vec<_>>(),
            vec!["messageId"]
        );
        let events = config.table("sessionEvents").expect("config");
        assert_eq!(
            events
                .primary_key
                .iter()
                .map(|column| column.key)
                .collect::<Vec<_>>(),
            vec!["sessionId", "logId"]
        );
        assert!(config.table("providerUsage").expect("config").primary_key.is_empty());
    }

    #[test]
    fn column_keys_are_unique_per_table() {
        for table in TABLES {
            let mut keys: Vec<&str> = table.columns.iter().map(|column| column.key).collect();
            let before = keys.len();
            keys.sort_unstable();
            keys.dedup();
            assert_eq!(before, keys.len(), "duplicate column key in {}", table.var);
            for column in table.columns {
                // the TS source always passes the SQL name explicitly
                assert!(!column.name.is_empty(), "{}.{}", table.var, column.key);
            }
        }
    }

    #[test]
    fn doc_text_is_preserved_on_columns() {
        let settings = table_by_var("userSettings").expect("userSettings");
        let column = settings.column("lastSelectedProjectId").expect("column");
        let doc = column.doc.expect("doc comment");
        assert!(doc.contains("last selected"), "doc was {doc:?}");
        assert!(!doc.contains('\n'), "docs are joined to a single line");
        // `doc` is data only: it never influences the modifiers
        assert!(!column.not_null);
        assert!(!column.primary_key);
    }
}
