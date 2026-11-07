//! Contract evidence for already-implemented native Rust ports of the Jait gateway.
//!
//! Each test below pins *observable* native behaviour that the reference TypeScript
//! implementation also exposes. No JS is executed and no reference test is translated;
//! every assertion is derived from the Rust source (and cross-checked against the
//! reference TS where a message/constant is asserted).
//!
//! Components covered here (reference -> native):
//!   packages/gateway/src/security/http-auth.ts     -> security::http_auth
//!   packages/gateway/src/crypto-polyfill.ts        -> security::preview_token
//!   packages/gateway/src/db/schema.ts               -> db::schema
//!   packages/gateway/src/db/sqlite-shim.ts          -> db::sqlite_shim

use std::sync::Mutex;

use jait_gateway::db::schema::{ColumnDefault, relational_config, table_by_var};
use jait_gateway::db::sqlite_shim::{
    Backend, BackendStatus, DrizzleAdapter, DrizzleSchemaConfig, EngineError, OpenError,
    SqliteDriver, SqliteShimHost, open_raw_sqlite,
};
use jait_gateway::security::http_auth::{
    AUTH_COOKIE_NAME, AuthUser, current_timestamp, is_public_api_path, require_auth, resolve_auth,
    sign_auth_token_at, verify_auth_token_at,
};
use jait_gateway::security::preview_token::{sign_preview_token_at, verify_preview_token_at};

const SECRET: &str = "contract-evidence-secret";
const NOW: u64 = 1_700_000_000;

fn user() -> AuthUser {
    AuthUser {
        id: "user-1".to_string(),
        username: "ada".to_string(),
    }
}

// ---------------------------------------------------------------------------
// 1. security/http-auth.ts -> security::http_auth
// ---------------------------------------------------------------------------

/// A preview token and a session token are signed with the same secret, so the two
/// verifiers must stay separated by the `purpose` claim. `verify_auth_token_at` rejects
/// any token carrying a truthy `purpose`, therefore a preview token can never be
/// replayed as a session cookie.
#[test]
fn preview_token_can_never_authenticate_a_session() {
    let preview = sign_preview_token_at("user-1", "app-42", SECRET, NOW).expect("sign preview");

    // It is a valid preview token for its own scope...
    assert_eq!(
        verify_preview_token_at(&preview, "app-42", SECRET, NOW),
        Some("user-1".to_string())
    );

    // ...but the session verifier refuses it outright, even though the HMAC verifies.
    assert_eq!(verify_auth_token_at(&preview, SECRET, NOW), None);

    // The asymmetric direction holds too: a session token is not a preview token.
    let session = sign_auth_token_at(&user(), SECRET, NOW).expect("sign session");
    assert_eq!(
        verify_auth_token_at(&session, SECRET, NOW).map(|u| u.id),
        Some("user-1".to_string())
    );
    assert_eq!(
        verify_preview_token_at(&session, "app-42", SECRET, NOW),
        None
    );
}

/// Preview links are scoped: a token minted for one resource is rejected for another,
/// and it stops verifying once the one-hour TTL has elapsed.
#[test]
fn preview_token_is_scoped_to_its_resource_and_expires_after_one_hour() {
    let token = sign_preview_token_at("user-1", "app-42", SECRET, NOW).expect("sign preview");

    assert_eq!(verify_preview_token_at(&token, "app-43", SECRET, NOW), None);
    assert_eq!(
        verify_preview_token_at(&token, "app-42", SECRET, NOW + 3_599),
        Some("user-1".to_string())
    );
    assert_eq!(
        verify_preview_token_at(&token, "app-42", SECRET, NOW + 3_600),
        None
    );
    // A different signing secret must never be accepted.
    assert_eq!(
        verify_preview_token_at(&token, "app-42", "other-secret", NOW),
        None
    );
}

/// Session credentials are read from both the `Authorization: Bearer` header and the
/// `jait_token` cookie, with the header taking precedence — the same resolution order
/// the reference applies on every gateway request.
#[test]
fn session_resolution_prefers_bearer_header_over_the_jait_token_cookie() {
    assert_eq!(AUTH_COOKIE_NAME, "jait_token");

    let alice = AuthUser {
        id: "user-alice".to_string(),
        username: "alice".to_string(),
    };
    let bob = AuthUser {
        id: "user-bob".to_string(),
        username: "bob".to_string(),
    };
    let alice_token = sign_auth_token_at(&alice, SECRET, current_timestamp()).expect("sign alice");
    let bob_token = sign_auth_token_at(&bob, SECRET, current_timestamp()).expect("sign bob");

    let header = format!("Bearer {alice_token}");
    let resolved = resolve_auth(Some(&header), Some(&bob_token), SECRET).expect("resolved");
    assert_eq!(resolved.id, "user-alice");

    // Cookie only, no header: the cookie authenticates.
    let cookie_only = resolve_auth(None, Some(&alice_token), SECRET).expect("cookie auth");
    assert_eq!(cookie_only.username, "alice");

    // Garbage in both places resolves to nobody rather than to a partial identity.
    assert_eq!(
        resolve_auth(Some("Bearer not-a-jwt"), Some("garbage"), SECRET),
        None
    );
}

/// `require_auth` is the guard the routes use: it yields the reference's 401 payload
/// instead of an identity, and public endpoints are opted out by path.
#[test]
fn require_auth_rejects_with_401_login_required_and_public_paths_opt_out() {
    let (status, body) = require_auth(None, None, SECRET).expect_err("must reject anonymous");
    assert_eq!(status, 401);
    assert_eq!(body["detail"], "login_required");

    // Expired session tokens are rejected on the same path.
    let stale = sign_auth_token_at(&user(), SECRET, NOW).expect("sign");
    assert!(require_auth(Some(&format!("Bearer {stale}")), None, SECRET).is_err());

    // Public routes bypass the guard so the client can boot before it has a session.
    assert!(is_public_api_path("/api/auth/login"));
    assert!(is_public_api_path("/api/auth/register"));
    assert!(!is_public_api_path("/api/projects"));
}

// ---------------------------------------------------------------------------
// 2. db/schema.ts -> db::schema
// ---------------------------------------------------------------------------

/// The declarative table DSL must keep TypeScript's `jsKey`/`sqlName` split and the
/// defaults the reference schema declares, otherwise drizzle-generated SQL drifts.
#[test]
fn user_settings_table_keeps_reference_column_names_and_defaults() {
    let table = table_by_var("userSettings").expect("userSettings table");
    assert_eq!(table.name, "user_settings");

    let by_key = |key: &str| {
        table
            .columns
            .iter()
            .find(|c| c.key == key)
            .unwrap_or_else(|| panic!("missing column {key}"))
    };

    let user_id = by_key("userId");
    assert_eq!(user_id.name, "user_id");

    let theme = by_key("theme");
    assert_eq!(theme.name, "theme");
    assert_eq!(theme.default, Some(ColumnDefault::Text("system")));
    assert!(theme.not_null, "theme is declared notNull in the reference");

    let stt = by_key("sttProvider");
    assert_eq!(stt.name, "stt_provider");
    assert_eq!(stt.default, Some(ColumnDefault::Text("whisper")));

    let chat_provider = by_key("chatProvider");
    assert_eq!(chat_provider.default, Some(ColumnDefault::Text("jait")));

    // Primary key follows the declared column-level `.primaryKey()`.
    assert!(user_id.primary_key);
}

/// The relational config is the bridge between the module export name and the SQL
/// table name; both directions must resolve and unknown names must stay absent.
#[test]
fn relational_config_maps_export_name_and_sql_table_name_both_ways() {
    let config = relational_config();

    let by_ts = config.table("userSettings").expect("ts name lookup");
    assert_eq!(by_ts.ts_name, "userSettings");
    assert_eq!(by_ts.db_name, "user_settings");

    let by_db = config
        .table_for_db_name("user_settings")
        .expect("db name lookup");
    assert_eq!(by_db.ts_name, "userSettings");

    assert!(config.table("noSuchTable").is_none());
    assert!(config.table_for_db_name("no_such_table").is_none());
    assert!(table_by_var("noSuchTable").is_none());
}

// ---------------------------------------------------------------------------
// 3. db/sqlite-shim.ts -> db::sqlite_shim
// ---------------------------------------------------------------------------

struct RecordingDriver {
    name: &'static str,
    log: std::sync::Arc<Mutex<Vec<&'static str>>>,
}

impl SqliteDriver for RecordingDriver {
    fn open(
        &self,
        _path: &str,
    ) -> Result<Box<dyn jait_gateway::db::sqlite_shim::RawDatabase>, EngineError> {
        self.log.lock().unwrap().push(self.name);
        Err(EngineError::new("driver unavailable in contract test"))
    }
}

struct FakeHost {
    bun: bool,
    bun_driver: bool,
    log: std::sync::Arc<Mutex<Vec<&'static str>>>,
}

impl SqliteShimHost for FakeHost {
    fn is_bun(&self) -> bool {
        self.bun
    }

    fn load_bun_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
        if !self.bun_driver {
            return None;
        }
        Some(Box::new(RecordingDriver {
            name: "bun",
            log: self.log.clone(),
        }))
    }

    fn load_node_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
        Some(Box::new(RecordingDriver {
            name: "node",
            log: self.log.clone(),
        }))
    }

    fn load_better_sqlite3(&self) -> Option<Box<dyn SqliteDriver>> {
        Some(Box::new(RecordingDriver {
            name: "better",
            log: self.log.clone(),
        }))
    }

    fn create_drizzle(
        &self,
        _client: &dyn jait_gateway::db::sqlite_shim::DatabaseClient,
        _adapter: DrizzleAdapter,
        _config: &DrizzleSchemaConfig,
    ) -> Result<Box<dyn jait_gateway::db::sqlite_shim::DrizzleDatabase>, EngineError> {
        Err(EngineError::new("drizzle never constructed in this path"))
    }
}

/// When every candidate driver fails to open, the shim must surface the reference's
/// friendly "no sqlite backend" error rather than the raw driver error, and it must
/// try the candidates in the reference's order.
#[test]
fn sqlite_shim_tries_backends_in_reference_order_then_reports_no_backend() {
    // Non-Bun host: bun:sqlite is not even attempted.
    let log = std::sync::Arc::new(Mutex::new(Vec::new()));
    let host = FakeHost {
        bun: false,
        bun_driver: false,
        log: log.clone(),
    };
    let err =
        open_raw_sqlite(&host, ":memory:", &BackendStatus::new()).expect_err("all drivers fail");
    assert!(matches!(err, OpenError::NoBackend));
    assert_eq!(
        err.to_string(),
        jait_gateway::db::sqlite_shim::NO_BACKEND_ERROR
    );
    assert_eq!(*log.lock().unwrap(), vec!["node", "better"]);
}

/// On Bun the `bun:sqlite` load is *outside* the reference's try/catch, so a missing or
/// failing driver rejects with the driver error itself — it must not silently fall back to
/// `node:sqlite`/`better-sqlite3`, and it must not be rewritten as the friendly
/// "no backend" message. The attempted backend is recorded before the constructor runs.
#[test]
fn bun_host_propagates_the_driver_error_without_falling_back() {
    // 1. Constructor throws: error escapes, no other driver is consulted.
    let log = std::sync::Arc::new(Mutex::new(Vec::new()));
    let status = BackendStatus::new();
    let host = FakeHost {
        bun: true,
        bun_driver: true,
        log: log.clone(),
    };
    let err = open_raw_sqlite(&host, ":memory:", &status).expect_err("driver throws");
    assert!(matches!(err, OpenError::Driver(_)));
    assert_ne!(
        err.to_string(),
        jait_gateway::db::sqlite_shim::NO_BACKEND_ERROR,
        "a bun driver failure must not be masked as the friendly no-backend error"
    );
    assert_eq!(*log.lock().unwrap(), vec!["bun"]);
    assert_eq!(status.get(), Backend::BunSqlite);

    // 2. Module unavailable: also a driver error, still no fallback attempt.
    let log2 = std::sync::Arc::new(Mutex::new(Vec::new()));
    let host2 = FakeHost {
        bun: true,
        bun_driver: false,
        log: log2.clone(),
    };
    let err2 = open_raw_sqlite(&host2, ":memory:", &BackendStatus::new()).expect_err("no bun");
    assert!(matches!(err2, OpenError::Driver(_)));
    assert!(log2.lock().unwrap().is_empty());
}

/// The module-level backend report starts at better-sqlite3 (the reference's initial
/// export value) and names each candidate with the same runtime strings.
#[test]
fn backend_status_starts_at_better_sqlite3_and_uses_reference_names() {
    let status = BackendStatus::new();
    assert_eq!(status.get(), Backend::BetterSqlite3);
    assert_eq!(status.name(), "better-sqlite3");
    assert_eq!(Backend::BunSqlite.name(), "bun:sqlite");
    assert_eq!(Backend::NodeSqlite.name(), "node:sqlite");
}

// ===========================================================================
// Component 6: packages/gateway/src/services/github-pull-requests.ts
//              -> services::github_pull_requests
// ===========================================================================

use jait_gateway::services::github_pull_requests::{
    ConflictContent, ConflictFile, ConflictOutcome,
};

fn conflict_file(path: &str, ours: ConflictContent, theirs: ConflictContent) -> ConflictFile {
    ConflictFile {
        path: path.into(),
        ours,
        theirs,
    }
}

#[test]
fn conflict_response_marks_binary_sides_and_suppresses_both_blobs() {
    let json = ConflictOutcome::Conflicts(vec![
        conflict_file(
            "src/a.ts",
            ConflictContent::Text("ours-line".into()),
            ConflictContent::Text("theirs-line".into()),
        ),
        conflict_file(
            "assets/logo.png",
            ConflictContent::Binary,
            ConflictContent::Text("not-exposed".into()),
        ),
        conflict_file(
            "src/new.rs",
            ConflictContent::Missing,
            ConflictContent::Text("theirs-only".into()),
        ),
    ])
    .into_json();

    assert_eq!(json["status"], "conflicts");
    let files = json["files"].as_array().expect("files is an array");
    assert_eq!(files.len(), 3);

    // A fully textual conflict exposes both stages verbatim.
    assert_eq!(files[0]["path"], "src/a.ts");
    assert_eq!(files[0]["binary"], false);
    assert_eq!(files[0]["ours"], "ours-line");
    assert_eq!(files[0]["theirs"], "theirs-line");

    // `binary ? "" : ...` in the reference: one binary side suppresses BOTH blobs.
    assert_eq!(files[1]["binary"], true);
    assert_eq!(files[1]["ours"], "");
    assert_eq!(files[1]["theirs"], "");

    // A missing stage is empty text rather than an omitted key.
    assert_eq!(files[2]["binary"], false);
    assert_eq!(files[2]["ours"], "");
    assert_eq!(files[2]["theirs"], "theirs-only");
}

#[test]
fn pushed_outcome_uses_the_reference_message_while_merged_only_pins_status() {
    let pushed = ConflictOutcome::Pushed.into_json();
    assert_eq!(pushed["status"], "pushed");
    // Same literal in packages/gateway/src/services/github-pull-requests.ts
    // (`status: "pushed", message: "Conflicts resolved and pushed."`).
    assert_eq!(pushed["message"], "Conflicts resolved and pushed.");

    // DIVERGENCE (reported, deliberately not asserted): the reference builds its
    // merged message by interpolating base/head branch names, whereas the native
    // port emits a fixed sentence. Only the status field is pinned here.
    let merged = ConflictOutcome::Merged.into_json();
    assert_eq!(merged["status"], "merged");
    assert!(merged.get("message").is_some(), "merged carries a message");
}

// ===========================================================================
// Component 7: packages/gateway/src/services/jait-llm.ts -> services::jait_llm
// ===========================================================================

use jait_gateway::services::jait_llm::{infer_context_window, normalize_openrouter_model_id};

#[test]
fn openrouter_aliases_resolve_to_canonical_vendor_ids() {
    for (input, expected) in [
        (" GPT-4O ", "openai/gpt-4o"),
        ("gpt-4.1-mini", "openai/gpt-4.1-mini"),
        ("o4-mini", "openai/o4-mini"),
        ("deepseek-reasoner", "deepseek/deepseek-r1"),
        ("Mimo V2 Pro", "xiaomi/mimo-v2-pro"),
        ("xiaomi: mimo-v2-pro", "xiaomi/mimo-v2-pro"),
        // Documented fold-in: the v3 spelling is served by the v2 endpoint.
        ("mimo-v3-pro", "xiaomi/mimo-v2-pro"),
        ("hunter-alpha", "xiaomi/mimo-v2-pro"),
        ("mimo v2 flash", "xiaomi/mimo-v2-flash"),
        ("xiaomi/mimo-v2-omni", "xiaomi/mimo-v2-omni"),
    ] {
        assert_eq!(
            normalize_openrouter_model_id(input),
            expected,
            "alias {input:?} must normalize to {expected:?}"
        );
    }
}

#[test]
fn unmapped_model_ids_keep_the_callers_spelling() {
    // Already-qualified ids pass through untouched instead of being re-prefixed.
    assert_eq!(
        normalize_openrouter_model_id("openai/gpt-4o"),
        "openai/gpt-4o"
    );
    // Only surrounding whitespace is stripped; case is preserved for passthrough.
    assert_eq!(
        normalize_openrouter_model_id("  Anthropic/Claude-3.5-Sonnet  "),
        "Anthropic/Claude-3.5-Sonnet"
    );
    assert_eq!(normalize_openrouter_model_id(""), "");
}

// ===========================================================================
// Component 15: packages/gateway/src/config.ts -> jait_llm::infer_context_window
// ===========================================================================

#[test]
fn infer_context_window_maps_every_reference_model_family() {
    for (model, expected) in [
        ("auto", 128_000.0),
        ("auto/best-coding", 128_000.0),
        ("gpt-5.1-codex", 400_000.0),
        ("gpt-4o-mini", 128_000.0),
        ("gpt-4-turbo", 128_000.0),
        ("gpt-4", 8_192.0),
        ("gpt-3.5-turbo", 16_385.0),
        ("claude-4-sonnet", 200_000.0),
        ("claude-3-5-sonnet", 200_000.0),
        // Only the numeric-generation prefixes are widened; older/other Claude
        // spellings fall back to the 100k tier in the reference too (config.ts:143).
        ("claude-sonnet-4", 100_000.0),
        ("claude-2.1", 100_000.0),
        ("gemini-2.5-pro", 128_000.0),
        ("o3-mini", 200_000.0),
        ("deepseek-chat", 64_000.0),
        ("mistral-large", 32_000.0),
        ("llama-3.1-70b", 8_192.0),
        ("some-unlisted-model", 128_000.0),
    ] {
        assert_eq!(
            infer_context_window(model),
            expected,
            "context window for {model:?}"
        );
    }
    // Matching is case-insensitive, exactly like the reference's toLowerCase().
    assert_eq!(infer_context_window("GPT-5"), 400_000.0);
}

// ===========================================================================
// Component 8: packages/gateway/src/services/maintenance.ts -> services::maintenance
// ===========================================================================

use jait_gateway::services::maintenance::MaintenanceConfig;

#[test]
fn maintenance_defaults_run_the_reference_check_set() {
    let config = MaintenanceConfig::default();
    let pairs: Vec<(&str, &str)> = config
        .checks
        .iter()
        .map(|check| (check.name.as_str(), check.command.as_str()))
        .collect();
    assert_eq!(
        pairs,
        vec![
            ("Typecheck", "bun run typecheck"),
            ("Tests", "bun run test"),
            ("Lint", "bun run lint"),
        ]
    );
    assert_eq!(config.timeout_ms, 120_000);
    assert_eq!(config.preferred_provider, None);
}

#[test]
fn maintenance_config_accepts_reference_camel_case_overrides() {
    let config: MaintenanceConfig = serde_json::from_str(
        r#"{"checks":[{"name":"Typecheck","command":"bun run typecheck"}],"timeoutMs":5000}"#,
    )
    .expect("camelCase timeoutMs deserializes");
    assert_eq!(config.timeout_ms, 5_000);
    assert_eq!(config.checks.len(), 1);
    // `#[serde(default)]` keeps the unmentioned provider optional.
    assert_eq!(config.preferred_provider, None);

    // An empty object yields the full reference defaults.
    let empty: MaintenanceConfig = serde_json::from_str("{}").expect("defaults apply");
    assert_eq!(empty.checks.len(), 3);
    assert_eq!(empty.timeout_ms, 120_000);
}

// ===========================================================================
// Component 9: packages/gateway/src/services/project-watcher.ts -> services::project_watcher
// ===========================================================================

use jait_gateway::services::project_watcher::{
    DEFAULT_IGNORE, FileChangeEvent, FileChangeType, ProjectWatcherOptions, coalesce_events,
};

fn change(path: &str, kind: FileChangeType) -> FileChangeEvent {
    FileChangeEvent {
        path: path.into(),
        kind,
    }
}

#[test]
fn file_change_coalescing_reproduces_reference_transitions() {
    // create -> update collapses to a single create.
    assert_eq!(
        coalesce_events([
            change("a.ts", FileChangeType::Created),
            change("a.ts", FileChangeType::Updated),
        ]),
        vec![change("a.ts", FileChangeType::Created)]
    );
    // create -> delete cancels out entirely.
    assert_eq!(
        coalesce_events([
            change("b.ts", FileChangeType::Created),
            change("b.ts", FileChangeType::Deleted),
        ]),
        Vec::<FileChangeEvent>::new()
    );
    // delete -> create is a modification of an already-known file.
    assert_eq!(
        coalesce_events([
            change("c.ts", FileChangeType::Deleted),
            change("c.ts", FileChangeType::Created),
        ]),
        vec![change("c.ts", FileChangeType::Updated)]
    );
    // First-seen order is preserved and paths stay case-sensitive.
    assert_eq!(
        coalesce_events([
            change("Dir/B.ts", FileChangeType::Created),
            change("dir/b.ts", FileChangeType::Created),
            change("Dir/B.ts", FileChangeType::Updated),
        ]),
        vec![
            change("Dir/B.ts", FileChangeType::Created),
            change("dir/b.ts", FileChangeType::Created),
        ]
    );
}

#[test]
fn project_watcher_defaults_match_reference_thresholds() {
    let options = ProjectWatcherOptions::default();
    assert_eq!(options.coalesce, std::time::Duration::from_millis(150));
    assert_eq!(
        options.reconcile_interval,
        std::time::Duration::from_secs(2)
    );
    assert_eq!(options.lifetime, std::time::Duration::from_secs(3600));
    assert_eq!(options.max_batch_size, 500);
    assert_eq!(options.max_batch_bytes, 256 * 1024);
    assert_eq!(options.channel_capacity, 8);
    assert!(!options.allow_generated_root, "generated roots need opt-in");
    // The ignore list ships the reference globs (vcs and build output dirs).
    assert_eq!(options.ignore.len(), DEFAULT_IGNORE.len());
    assert!(options.ignore.iter().any(|g| g.contains("node_modules")));
    assert!(options.ignore.iter().any(|g| g.contains(".git")));
}

// ===========================================================================
// Component 13: packages/gateway/src/surfaces/remote-terminal.ts
//               -> surfaces::remote_terminal
// ===========================================================================

use jait_gateway::surfaces::remote_terminal::{
    BRACKETED_PASTE_MARKER, DEFAULT_COLS, DEFAULT_ROWS, MAX_OUTPUT_CHUNKS, REMOTE_TERMINAL_KIND,
    RETAINED_OUTPUT_CHUNKS, SHELL_INTEGRATION_COMMAND_DONE_MARKER, SHELL_INTEGRATION_PROMPT_MARKER,
    START_TIMEOUT, STOP_TIMEOUT,
};

#[test]
fn remote_terminal_shell_integration_markers_and_buffers_match_reference() {
    // OSC 633 sequences emitted by the reference shell integration.
    assert_eq!(SHELL_INTEGRATION_PROMPT_MARKER, "\u{1b}]633;B");
    assert_eq!(SHELL_INTEGRATION_COMMAND_DONE_MARKER, "\u{1b}]633;D");
    assert_eq!(BRACKETED_PASTE_MARKER, "\u{1b}[?2004h");

    assert_eq!(REMOTE_TERMINAL_KIND, "terminal");
    assert_eq!(DEFAULT_COLS, 120);
    assert_eq!(DEFAULT_ROWS, 30);

    // Start is allowed more time than a graceful stop, and retention keeps the
    // newest half of the accepted output history.
    assert_eq!(START_TIMEOUT, std::time::Duration::from_secs(15));
    assert_eq!(STOP_TIMEOUT, std::time::Duration::from_secs(5));
    assert!(STOP_TIMEOUT < START_TIMEOUT);
    assert_eq!(MAX_OUTPUT_CHUNKS, 10_000);
    assert_eq!(RETAINED_OUTPUT_CHUNKS, 5_000);
    assert!(RETAINED_OUTPUT_CHUNKS < MAX_OUTPUT_CHUNKS);
}

// ===========================================================================
// Component 14: packages/gateway/src/ws.ts -> ws
// ===========================================================================

use jait_gateway::ws::{HandshakeOutcome, HandshakeRequest, negotiate_handshake};

fn upgrade_request(target: &str) -> HandshakeRequest {
    HandshakeRequest {
        method: "GET".into(),
        target: target.into(),
        headers: vec![
            ("Host".into(), "localhost:8787".into()),
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "keep-alive, Upgrade".into()),
            ("Sec-WebSocket-Version".into(), "13".into()),
            // RFC 6455 §1.3 sample nonce.
            (
                "Sec-WebSocket-Key".into(),
                "dGhlIHNhbXBsZSBub25jZQ==".into(),
            ),
        ],
    }
}

#[test]
fn upgrade_handshake_completes_rfc6455_accept_key_example() {
    let outcome = negotiate_handshake(&upgrade_request("/api/ws?..."), "/api/ws");
    match &outcome {
        HandshakeOutcome::Accepted { accept_key } => {
            assert_eq!(accept_key, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
        }
        other => panic!("expected acceptance, got {other:?}"),
    }
    assert_eq!(outcome.status(), 101);
    assert_eq!(outcome.accept_key(), Some("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="));
}

#[test]
fn upgrade_handshake_rejections_use_the_reference_status_reason_and_body() {
    let with_header = |name: &str, value: &str| {
        let mut request = upgrade_request("/api/ws");
        for (key, existing) in request.headers.iter_mut() {
            if key.eq_ignore_ascii_case(name) {
                *existing = value.to_string();
            }
        }
        request
    };
    let without_header = |name: &str| {
        let mut request = upgrade_request("/api/ws");
        request
            .headers
            .retain(|(key, _)| !key.eq_ignore_ascii_case(name));
        request
    };

    let cases: Vec<(HandshakeRequest, u16, &str, &str)> = vec![
        (
            HandshakeRequest {
                method: "POST".into(),
                ..upgrade_request("/api/ws")
            },
            405,
            "Method Not Allowed",
            "websocket upgrade requires GET",
        ),
        (
            upgrade_request("/api/other"),
            404,
            "Not Found",
            "unknown websocket endpoint",
        ),
        (
            without_header("upgrade"),
            400,
            "Bad Request",
            "missing Upgrade: websocket",
        ),
        (
            with_header("upgrade", "h2c"),
            400,
            "Bad Request",
            "missing Upgrade: websocket",
        ),
        (
            with_header("connection", "keep-alive"),
            400,
            "Bad Request",
            "missing Connection: Upgrade",
        ),
        (
            without_header("sec-websocket-version"),
            400,
            "Bad Request",
            "missing Sec-WebSocket-Version",
        ),
        (
            with_header("sec-websocket-version", "8"),
            426,
            "Upgrade Required",
            "unsupported websocket version, expected 13",
        ),
        (
            without_header("sec-websocket-key"),
            400,
            "Bad Request",
            "missing Sec-WebSocket-Key",
        ),
        (
            with_header("sec-websocket-key", "not-base64"),
            400,
            "Bad Request",
            "invalid Sec-WebSocket-Key",
        ),
    ];

    for (request, status, reason, body) in cases {
        match negotiate_handshake(&request, "/api/ws") {
            HandshakeOutcome::Rejected {
                status: got_status,
                reason: got_reason,
                body: got_body,
            } => {
                assert_eq!(
                    (got_status, got_reason),
                    (status, reason),
                    "rejection body was {got_body:?}"
                );
                assert_eq!(got_body, body);
            }
            other => panic!("expected {status} rejection, got {other:?}"),
        }
    }
}

#[test]
fn upgrade_and_rejection_responses_carry_reference_wire_headers() {
    use jait_gateway::ws::{rejection_response, switching_protocols_response};

    let request = upgrade_request("/api/ws");
    let accept = negotiate_handshake(&request, "/api/ws")
        .accept_key()
        .expect("valid handshake accepted")
        .to_string();
    let response = String::from_utf8(switching_protocols_response(&accept)).expect("ascii");
    assert!(response.starts_with("HTTP/1.1 101 Switching Protocols\r\n"));
    assert!(response.contains("Upgrade: websocket\r\n"));
    assert!(response.contains("Connection: Upgrade\r\n"));
    assert!(response.contains(&format!("Sec-WebSocket-Accept: {accept}\r\n")));
    assert!(response.ends_with("\r\n\r\n"));

    // A rejected upgrade stays plain text and closes the connection so the client
    // cannot mistake it for an upgraded socket.
    let rejection =
        String::from_utf8(rejection_response(426, "Upgrade Required", "nope")).expect("ascii");
    assert!(rejection.starts_with("HTTP/1.1 426 Upgrade Required\r\n"));
    assert!(rejection.contains("Content-Type: text/plain; charset=utf-8\r\n"));
    assert!(rejection.contains("Content-Length: 4\r\n"));
    assert!(rejection.contains("Connection: close\r\n"));
    assert!(rejection.ends_with("\r\n\r\nnope"));
}

// ===========================================================================
// Component 5: packages/gateway/src/services/git-forge.ts -> services::git_forge
// ===========================================================================

use jait_gateway::services::git_forge::{ForgeError, ForgeProvider, ForgeRepository};

#[test]
fn create_pr_url_uses_each_forges_reference_endpoint() {
    let github = ForgeRepository::new("github.com", "Jakob", "jait").expect("valid repo");
    let github_url = github
        .create_pr_url(ForgeProvider::Github, "feature/x", None)
        .expect("github pr url");
    assert!(
        github_url.starts_with("https://github.com/Jakob/jait/compare/"),
        "url was {github_url}"
    );
    // No base is supplied: the reference defaults to `main`.
    assert!(
        github_url.contains("main...feature"),
        "url was {github_url}"
    );
    assert!(github_url.contains("expand=1"), "url was {github_url}");

    let gitlab = ForgeRepository::new("gitlab.com", "jakob", "jait").expect("valid repo");
    let gitlab_url = gitlab
        .create_pr_url(ForgeProvider::Gitlab, "feature/x", Some("develop"))
        .expect("gitlab mr url");
    assert!(
        gitlab_url.contains("/-/merge_requests/new"),
        "url was {gitlab_url}"
    );
    assert!(
        gitlab_url.contains("merge_request%5Bsource_branch%5D=feature"),
        "url was {gitlab_url}"
    );
    assert!(
        !gitlab_url.contains("compare"),
        "gitlab must not use the github compare endpoint: {gitlab_url}"
    );

    let gitea = ForgeRepository::new("gitea.example.com", "jakob", "jait").expect("valid repo");
    let gitea_url = gitea
        .create_pr_url(ForgeProvider::Gitea, "topic", None)
        .expect("gitea pr url");
    assert!(
        !gitea_url.contains("merge_requests"),
        "gitea must not use the gitlab endpoint: {gitea_url}"
    );
    assert!(gitea_url.contains("topic"), "url was {gitea_url}");
}

#[test]
fn create_pr_url_refuses_host_provider_mismatch_and_azure_keeps_project_spaces() {
    let github = ForgeRepository::new("github.com", "jakob", "jait").expect("valid repo");
    // An Azure provider needs an Azure repository; the plain host refuses to guess.
    assert!(matches!(
        github.create_pr_url(ForgeProvider::AzureDevops, "topic", None),
        Err(ForgeError::InvalidInput)
    ));
    // ...and an Azure repository refuses every non-Azure provider.
    let azure =
        ForgeRepository::azure("dev.azure.com", "org", "My Project", "repo").expect("azure repo");
    assert!(matches!(
        azure.create_pr_url(ForgeProvider::Github, "topic", None),
        Err(ForgeError::InvalidInput)
    ));
    // Azure project names may contain spaces, unlike git host slugs.
    let azure_url = azure
        .create_pr_url(ForgeProvider::AzureDevops, "feature/x", Some("develop"))
        .expect("azure pr url");
    assert!(azure_url.contains("feature"), "url was {azure_url}");
    assert!(azure_url.contains("develop"), "url was {azure_url}");

    // Host validation mirrors the reference: empty host and single-label hosts fail.
    assert!(matches!(
        ForgeRepository::new("", "jakob", "jait"),
        Err(ForgeError::InvalidInput)
    ));
    assert!(matches!(
        ForgeRepository::new("github.com", "jakob", "not a repo"),
        Err(ForgeError::InvalidInput)
    ));
}

// ===========================================================================
// Component 4: packages/gateway/src/os-control/windows-driver.ts
//             -> os_control::windows_driver
// ===========================================================================

use jait_gateway::os_control::windows_driver as wd;

#[test]
fn windows_driver_send_keys_translation_and_escaping_match_reference() {
    // Modifier chords become the SendKeys sigils and special keys keep their braces.
    assert_eq!(wd::build_windows_send_keys("ctrl+shift+t"), "^+t");
    // F-keys are deliberately absent from the map (the reference only maps editing
    // and navigation keys) so they pass through lowercased behind the modifier.
    assert_eq!(wd::build_windows_send_keys("alt+F4"), "%f4");
    assert_eq!(
        wd::build_windows_send_keys(" super + Enter "),
        "{LWIN}{ENTER}"
    );
    assert_eq!(wd::windows_key_token("Esc"), "{ESC}");
    assert_eq!(wd::windows_key_token("pagedown"), "{PGDN}");
    assert_eq!(wd::windows_key_token("space"), " ");
    assert_eq!(wd::windows_key_token("nonsense"), "nonsense");

    // Text destined for SendKeys must escape its own control characters, or the
    // guest interprets them as modifiers (this is the injection guard).
    assert_eq!(wd::escape_send_keys_text("50%+x"), "50{%}{+}x");
    assert_eq!(wd::escape_send_keys_text("a(b)"), "a{(}b{)}");
    assert_eq!(wd::escape_send_keys_text("plain"), "plain");
}

#[test]
fn windows_driver_ssh_argv_and_pty_output_cleanup_match_reference() {
    assert_eq!(wd::DEFAULT_SSH_PORT, 2222);
    assert_eq!(wd::DEFAULT_SSH_USER, "docker");
    assert_eq!(wd::PTY_TERMINAL_NAME, "xterm-256color");
    assert_eq!((wd::PTY_COLS, wd::PTY_ROWS), (160, 40));

    let argv = wd::build_windows_ssh_args(2222, "docker", "whoami");
    assert_eq!(argv[0], "-p");
    assert_eq!(argv[1], "2222");
    // TS buildWindowsSshArgs has no option terminator; adding one is a wire divergence.
    assert!(
        !argv.iter().any(|a| a == "--"),
        "argv must match TS exactly: {argv:?}"
    );
    assert_eq!(argv.len(), 18, "argv was {argv:?}");
    assert!(
        argv.iter().any(|a| a == "StrictHostKeyChecking=no"),
        "argv was {argv:?}"
    );
    // The forwarded container is always reached over loopback with the fixed user.
    assert_eq!(argv[argv.len() - 2], "docker@127.0.0.1");
    assert_eq!(argv[argv.len() - 1], "whoami");

    // OSC title sequences must be dropped whole, not just their ESC bracket part,
    // otherwise `user@host: dir` leaks into the "clean" PTY output.
    assert_eq!(
        wd::strip_ansi("\x1b]0;root@box: /srv\x07ready\x1b[0m\n"),
        "ready\n"
    );

    // JS Math.round semantics: halves round toward +Infinity, not away from zero.
    assert_eq!(wd::js_round(2.5), 3.0);
    assert_eq!(wd::js_round(-2.5), -2.0);

    // Screenshot payloads arrive line-wrapped; the decoder must tolerate whitespace.
    assert_eq!(wd::decode_screenshot("aGk=\n"), b"hi".to_vec());
}

// ===========================================================================
// Component 12: packages/gateway/src/surfaces/browser.ts -> surfaces::browser
// ===========================================================================

use jait_gateway::surfaces::browser::BrowserInteractiveElement;

#[test]
fn browser_interactive_element_maps_reference_wire_field_names() {
    let wire = serde_json::json!({
        "selector": "#go",
        "tagName": "button",
        "role": "button",
        "name": "Go",
        "text": "Go now",
        "type": "submit",
        "placeholder": "search",
        "href": "/next",
        "value": "v1",
        "disabled": true,
        "visible": false,
        "checked": true
    });
    let element = BrowserInteractiveElement::from_json(&wire);
    assert_eq!(element.selector, "#go");
    // `type` is the wire name; the Rust field is `input_type`.
    assert_eq!(element.input_type.as_deref(), Some("submit"));
    assert_eq!(element.disabled, Some(true));
    assert_eq!(element.visible, Some(false));
    assert_eq!(element.checked, Some(true));

    let round_tripped = element.to_json();
    assert_eq!(round_tripped["type"], "submit");
    assert_eq!(round_tripped["tagName"], "button");
    assert_eq!(round_tripped["selector"], "#go");
    assert!(
        round_tripped.get("input_type").is_none(),
        "no rust field names on the wire"
    );

    // Label is `role ?? tagName ?? "element"`, then name, then text, joined by an em dash.
    assert_eq!(element.label(), "button — Go — Go now");
}

#[test]
fn browser_interactive_element_omits_unknown_fields_and_labels_bare_elements() {
    let element = BrowserInteractiveElement::from_json(&serde_json::json!({
        "selector": "div:nth-of-type(3)",
        "unexpected": "ignored"
    }));
    let json = element.to_json();
    assert_eq!(json["selector"], "div:nth-of-type(3)");
    // Absent optionals are omitted rather than emitted as null, which keeps the
    // snapshot payload small and matches the reference's compact element shape.
    assert_eq!(
        json.as_object().map(|o| o.len()),
        Some(1),
        "json was {json}"
    );
    // Without role or tagName the label still describes something actionable.
    assert_eq!(element.label(), "element");
}

// ===========================================================================
// Component 10: packages/gateway/src/services/provider-accounts.ts
//              -> services::provider_accounts
// ===========================================================================

use jait_gateway::services::provider_accounts::ProviderAccountRecord;

#[test]
fn provider_account_record_serializes_with_reference_camel_case_keys() {
    let record = ProviderAccountRecord {
        id: "acct-1".into(),
        user_id: "user-1".into(),
        provider_type: "claude".into(),
        node_id: "gateway".into(),
        label: "Work".into(),
        created_at: "2024-01-01T00:00:00Z".into(),
        updated_at: "2024-01-02T00:00:00Z".into(),
    };
    let value = serde_json::to_value(&record).expect("record serializes");
    assert_eq!(value["userId"], "user-1");
    assert_eq!(value["providerType"], "claude");
    assert_eq!(value["nodeId"], "gateway");
    assert_eq!(value["createdAt"], "2024-01-01T00:00:00Z");
    assert_eq!(value["updatedAt"], "2024-01-02T00:00:00Z");
    // The dashboard client reads camelCase only; snake_case leaking would break it.
    assert!(value.get("user_id").is_none(), "value was {value}");
}

// ===========================================================================
// Component 11: packages/gateway/src/services/provider-usage.ts
//              -> services::provider_usage
// ===========================================================================

#[tokio::test]
async fn provider_usage_snapshot_projects_documented_fields_and_filters_accounts() {
    use jait_gateway::db::worker::DatabaseWorker;
    use jait_gateway::services::provider_usage::ProviderUsageService;
    use rusqlite::Connection;
    use std::num::NonZeroU16;

    let connection = Connection::open_in_memory().expect("in-memory sqlite");
    connection
        .execute_batch(
            "CREATE TABLE provider_accounts (id TEXT PRIMARY KEY, user_id TEXT);
             INSERT INTO provider_accounts VALUES('acc-a','user-1'),('acc-b','user-1'),('acc-c','user-1'),('acc-z','user-2');
             CREATE TABLE provider_usage (
                account_id TEXT, rate_limit_type TEXT, provider_type TEXT, status TEXT,
                utilization REAL, resets_at TEXT, is_using_overage INTEGER, raw_json TEXT,
                updated_at TEXT, UNIQUE(account_id,rate_limit_type));
             INSERT INTO provider_usage VALUES('acc-a','request_activity','ollama','allowed',0.42,
                '2024-01-01T00:00:00Z',1,
                '{\"models\":[{\"name\":\"qwen\",\"requestCount\":3,\"secret\":\"leak\"}],\"planType\":\"pro\",\"prompt\":\"do-not-leak\"}',
                '2024-01-01T00:00:00Z');
             INSERT INTO provider_usage VALUES('acc-b','five_hour','openai','allowed',0.1,
                NULL,0,'{}','2024-01-01T00:00:00Z');
             INSERT INTO provider_usage VALUES('acc-c','five_hour','gemini','allowed',0.2,
                NULL,0,'{}','2024-01-01T00:00:00Z');
             INSERT INTO provider_usage VALUES('acc-z','five_hour','openai','allowed',0.9,
                NULL,0,'{}','2024-01-01T00:00:00Z');",
        )
        .expect("schema");
    let worker =
        DatabaseWorker::new(connection, NonZeroU16::new(4).expect("capacity")).expect("worker");
    let service = ProviderUsageService::new(worker, None);

    let mut rows = service
        .list_for_user(
            "user-1".into(),
            vec!["acc-a".into(), "acc-b".into(), "acc-z".into()],
        )
        .await
        .expect("usage snapshot");
    rows.sort_by(|a, b| a["accountId"].as_str().cmp(&b["accountId"].as_str()));

    // Requested-but-unowned accounts are dropped by the join; owned-but-unrequested
    // accounts are dropped by the account_ids filter.
    let ids: Vec<&str> = rows
        .iter()
        .filter_map(|r| r["accountId"].as_str())
        .collect();
    assert_eq!(ids, vec!["acc-a", "acc-b"], "rows were {rows:?}");

    let empty = service
        .list_for_user("user-1".into(), Vec::new())
        .await
        .expect("empty snapshot");
    assert!(empty.is_empty(), "no account ids means no rows: {empty:?}");

    let row = rows
        .iter()
        .find(|r| r["accountId"] == "acc-a")
        .expect("acc-a row");
    assert_eq!(row["rateLimitType"], "request_activity");
    assert_eq!(row["providerType"], "ollama");
    assert_eq!(row["utilization"], 0.42);
    assert_eq!(row["planType"], "pro");

    // Model entries are whitelisted to name+requestCount: other raw keys stay private.
    assert_eq!(row["models"][0]["name"], "qwen");
    assert_eq!(row["models"][0]["requestCount"], 3);
    assert!(
        row["models"][0].get("secret").is_none(),
        "raw model keys must not leak: {row}"
    );
    assert!(row.get("prompt").is_none(), "raw payload leaked: {row}");
    assert!(
        row.get("raw_json").is_none(),
        "column names must not leak: {row}"
    );
}
