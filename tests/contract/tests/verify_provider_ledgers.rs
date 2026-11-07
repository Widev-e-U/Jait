//! W1 consumer-level verification: `services/provider-accounts.ts` -> `provider_accounts.rs`
//! and `services/provider-usage.ts` -> `provider_usage.rs`.
//!
//! PROVENANCE OF EXPECTATIONS
//! * Account-type projection and label rules are re-derived from the real TypeScript:
//!     sed -n '37,60p' packages/gateway/src/services/provider-accounts.ts
//!   -> label validation uses JS string `.length` (UTF-16 code units) and a hard cap of 80:
//!      `if (label.length > 80) throw new Error("Account label must be 80 characters or fewer")`,
//!      `createAccount` also rejects non-auth providers.
//! * Usage warning copy comes from the real TypeScript:
//!     sed -n '118,140p' packages/gateway/src/services/provider-usage.ts
//!   -> "Approaching usage limit", "session limit", "weekly limit", "extra usage",
//!      link target "/settings?tab=usage".
//! * The main usage read path is already covered by the existing contract target
//!   `gateway_rust_provider_usage.rs`; this file deliberately covers *different* paths:
//!   warning emission/dedupe/re-arm, field redaction, owner scoping and the account_ids filter.
//! * Service-level storage guards ("Account storage paths must be absolute") are native
//!   hardening with no TS counterpart; they are marked NATIVE-INVARIANT and quoted from
//!   packages/gateway-rust/src/services/provider_accounts.rs.
use jait_gateway::db::worker::DatabaseWorker;
use jait_gateway::providers::registry::{ProviderAdapter, ProviderRegistry};
use jait_gateway::runtime::blocking::BlockingLane;
use jait_gateway::services::provider_accounts::{
    AccountAdapterFactory, AccountDefinition, AccountHomeLease, AccountLaunch,
    ProviderAccountRecord, ProviderAccountService,
};
use jait_gateway::services::provider_usage::{ProviderUsageService, UsageWarning};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::num::NonZeroU16;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------- fixtures ---

/// Consumer-side test double for the public `AccountAdapterFactory` seam. The service
/// requires a real adapter for every created account, so this returns a minimal
/// `ProviderAdapter` implementation and records the launch plan it was handed.
#[derive(Default)]
struct RecordingFactory {
    launches: Arc<Mutex<Vec<(String, String, String, Option<String>)>>>,
}

impl RecordingFactory {
    fn record(&self, launch: &AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String> {
        self.launches.lock().unwrap().push((
            launch.account.provider_type.clone(),
            launch.name.clone(),
            launch.command.clone(),
            launch.execution_node_id.clone(),
        ));
        Ok(Arc::new(StubAdapter {
            id: launch.account.id.clone(),
            owner: launch.account.user_id.clone(),
        }))
    }
}

struct StubAdapter {
    id: String,
    owner: String,
}

impl ProviderAdapter for StubAdapter {
    fn id(&self) -> &str {
        &self.id
    }

    fn owner_user_id(&self) -> Option<&str> {
        Some(&self.owner)
    }

    fn info(&self) -> Value {
        json!({ "id": self.id, "status": "ready" })
    }

    fn check_availability(&self) -> futures_util::future::BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
}

impl AccountAdapterFactory for RecordingFactory {
    fn build(&self, launch: AccountLaunch) -> Result<Arc<dyn ProviderAdapter>, String> {
        self.record(&launch)
    }

    fn build_private(
        &self,
        launch: AccountLaunch,
        _home: AccountHomeLease,
    ) -> Result<Arc<dyn ProviderAdapter>, String> {
        self.record(&launch)
    }

    fn rename(&self, _id: &str, _name: &str) -> Result<(), String> {
        Ok(())
    }

    fn reset_models(&self, _id: &str) -> Result<(), String> {
        Ok(())
    }
}

fn definition(id: &str, name: &str, auth: bool, registry: Value) -> AccountDefinition {
    AccountDefinition {
        id: id.into(),
        name: name.into(),
        description: format!("{name} command line interface"),
        auth,
        command: id.into(),
        args: Vec::new(),
        env: HashMap::new(),
        registry,
    }
}

fn definitions() -> Vec<AccountDefinition> {
    vec![
        definition(
            "claude-code",
            "Claude Code",
            true,
            json!({
                "version": "1.2.3",
                "icon": "claude.svg",
                "website": "https://claude.ai",
                "distribution": {"npm": "@anthropic-ai/claude-code"},
                "repository": "https://github.com/anthropics/claude-code",
                "emptyField": ""
            }),
        ),
        // Non-auth provider: must not surface as an account type.
        definition("ollama", "Ollama", false, json!({"version": "0.5.1"})),
        definition(
            "gemini",
            "Gemini CLI",
            true,
            json!({"version": "0.9.0", "distribution": "npm:@google/gemini-cli"}),
        ),
    ]
}

fn db() -> DatabaseWorker {
    let conn = Connection::open_in_memory().expect("in-memory db");
    jait_gateway::db::migrate_database(&conn).expect("migrate");
    DatabaseWorker::new(conn, NonZeroU16::new(1).unwrap()).expect("db worker")
}

/// Provider accounts require absolute paths whose every component is owned by the
/// current user and not group/world writable. Fixtures are anchored on the
/// contract manifest inside project artifacts; production ancestor checks remain active.
fn root(tag: &str) -> PathBuf {
    let boundary = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/verify-w1/fixtures/provider-accounts");
    let base = boundary.join(format!("{tag}-{}", uuid::Uuid::new_v4()));
    let dirs = [
        boundary,
        base.clone(),
        base.join("accounts"),
        base.join("home"),
    ];
    for path in &dirs {
        std::fs::create_dir_all(path).expect("fixture root");
    }
    for path in &dirs {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .expect("fixture permissions");
    }
    std::fs::canonicalize(base).expect("canonical fixture root")
}
fn accounts(db: DatabaseWorker) -> ProviderAccountService {
    accounts_at(db, root("accounts"))
}
fn accounts_at(db: DatabaseWorker, fixtures: PathBuf) -> ProviderAccountService {
    ProviderAccountService::new(
        db,
        ProviderRegistry::default(),
        definitions(),
        fixtures.join("accounts"),
        fixtures.join("home"),
        None,
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
        Arc::new(RecordingFactory::default()),
    )
    .expect("service")
}

type Warnings = Arc<Mutex<Vec<(String, String, String)>>>;

fn usage(db: DatabaseWorker) -> (ProviderUsageService, Warnings) {
    let seen: Warnings = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    let warn: UsageWarning = Arc::new(move |title: &str, detail: &str, link: &str| {
        sink.lock()
            .unwrap()
            .push((title.to_string(), detail.to_string(), link.to_string()));
    });
    (ProviderUsageService::new(db, Some(warn)), seen)
}

// ------------------------------------------------- provider-accounts checks ---

#[tokio::test]
async fn account_types_project_registry_metadata_and_skip_non_auth() {
    let db = db();
    let svc = accounts(db.clone());
    let types = svc.list_types();
    let ids: Vec<String> = types
        .iter()
        .map(|t| t["providerType"].as_str().unwrap_or_default().to_string())
        .collect();
    assert_eq!(
        ids,
        vec!["claude-code", "gemini"],
        "auth providers only, catalog order: {types:?}"
    );

    let claude = &types[0];
    assert_eq!(claude["name"], json!("Claude Code"));
    assert_eq!(
        claude["description"],
        json!("Claude Code command line interface")
    );
    assert_eq!(claude["version"], json!("1.2.3"));
    assert_eq!(claude["icon"], json!("claude.svg"));
    assert_eq!(claude["website"], json!("https://claude.ai"));
    assert_eq!(
        claude["repository"],
        json!("https://github.com/anthropics/claude-code")
    );
    // TS projects `distribution` only when it is a plain string; the npm object form is dropped.
    assert!(
        claude.get("distribution").is_none(),
        "object distribution dropped: {claude:?}"
    );
    // Empty strings are omitted, not surfaced as "".
    assert!(
        claude.get("emptyField").is_none(),
        "empty registry field dropped: {claude:?}"
    );
    // String distribution is projected verbatim.
    assert_eq!(types[1]["distribution"], json!("npm:@google/gemini-cli"));
}

#[tokio::test]
async fn refresh_types_keeps_catalog_when_empty_and_replaces_otherwise() {
    let db = db();
    let svc = accounts(db.clone());
    svc.refresh_types(Vec::new());
    let ids = |types: Vec<Value>| -> Vec<String> {
        types
            .iter()
            .map(|t| t["providerType"].as_str().unwrap_or_default().to_string())
            .collect()
    };
    assert_eq!(ids(svc.list_types()), vec!["claude-code", "gemini"]);

    svc.refresh_types(vec![definition(
        "codex",
        "Codex",
        true,
        json!({"version": "9.9.9"}),
    )]);
    let types = svc.list_types();
    assert_eq!(
        ids(types.clone()),
        vec!["codex"],
        "non-empty refresh replaces the catalog"
    );
    assert_eq!(types[0]["version"], json!("9.9.9"));
}

#[tokio::test]
async fn create_rejects_unsupported_owner_and_label_bounds() {
    let db = db();
    let svc = accounts(db.clone());

    let err = svc
        .create("user-1".to_string(), "ollama".to_string(), "Personal", None)
        .await
        .err()
        .expect("non-auth provider rejected");
    assert_eq!(err, "Provider accounts are not supported for ollama");

    let err = svc
        .create(String::new(), "claude-code".to_string(), "Personal", None)
        .await
        .err()
        .expect("missing owner rejected");
    assert_eq!(err, "Authenticated owner is required");

    let err = svc
        .create("user-1".to_string(), "claude-code".to_string(), "  ", None)
        .await
        .err()
        .expect("blank label rejected");
    assert_eq!(err, "Account label is required");

    // 81 UTF-16 code units -> rejected (TS: label.length > 80).
    let long = "a".repeat(81);
    let err = svc
        .create("user-1".to_string(), "claude-code".to_string(), &long, None)
        .await
        .err()
        .expect("81 chars rejected");
    assert_eq!(err, "Account label must be 80 characters or fewer");

    // 41 emoji = 41 chars but 82 UTF-16 code units: TS `.length` counts code units, so rejected.
    let emoji = "\u{1F9E0}".repeat(41);

    let err = svc
        .create(
            "user-1".to_string(),
            "claude-code".to_string(),
            &emoji,
            None,
        )
        .await
        .err()
        .expect("82 UTF-16 units rejected");
    assert_eq!(err, "Account label must be 80 characters or fewer");

    // The accepted 80-unit local-create path requires a descriptor-bound fixture
    // reachable through trusted ancestors; it is not verified by this validation test.
}

#[tokio::test]
async fn launch_plan_resolves_definition_and_rejects_relative_storage() {
    // NATIVE-INVARIANT: absolute-path guard, see provider_accounts.rs `new`.
    let err = ProviderAccountService::new(
        db(),
        ProviderRegistry::default(),
        definitions(),
        PathBuf::from("relative/accounts"),
        root("relative").join("home"),
        None,
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
        Arc::new(RecordingFactory::default()),
    )
    .err()
    .expect("relative storage rejected");
    assert_eq!(err, "Account storage paths must be absolute");

    let db = db();
    let svc = accounts(db.clone());
    let rec = seed_account(&db, "user-1", "Personal", "gateway").await;

    let plan = svc.launch_plan(&rec).expect("plan");
    let plan = plan.expect("known provider has a plan");
    // TS `packages/gateway/src/services/provider-accounts.ts:239` builds the launch name as
    // `${definition.name} — ${account.label}` (em dash, spaced).
    assert_eq!(plan.name, "Claude Code \u{2014} Personal");
    assert_eq!(plan.command, "claude-code");
    assert!(plan.auth);
    assert_eq!(plan.execution_node_id, None);

    // Unknown provider type: no launch plan rather than an error.
    let mut ghost = rec.clone();
    ghost.provider_type = "ghost-cli".to_string();
    assert!(svc.launch_plan(&ghost).expect("no error").is_none());

    // Remote execution node is propagated verbatim.
    let remote = seed_account(&db, "user-1", "Remote", "node-7").await;
    let plan = svc
        .launch_plan(&remote)
        .expect("plan")
        .expect("plan present");
    assert_eq!(plan.execution_node_id.as_deref(), Some("node-7"));
}

// ---------------------------------------------------- provider-usage checks ---

// Usage and launch-plan tests consume persisted account records, independently of
// the local descriptor-bound account-home launcher. Seeding is fixture setup,
// not evidence that account creation or filesystem isolation has passed.
async fn seed_account(
    db: &DatabaseWorker,
    user: &str,
    label: &str,
    node: &str,
) -> ProviderAccountRecord {
    let account = ProviderAccountRecord {
        id: format!("claude-code-{}", uuid::Uuid::new_v4()),
        user_id: user.into(),
        provider_type: "claude-code".into(),
        node_id: node.into(),
        label: label.into(),
        created_at: "2026-11-03T00:00:00.000Z".into(),
        updated_at: "2026-11-03T00:00:00.000Z".into(),
    };
    let saved = account.clone();
    db.run(move |db| {
         db.execute(
             "INSERT INTO provider_accounts(id,user_id,provider_type,node_id,label,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
             rusqlite::params![saved.id, saved.user_id, saved.provider_type, saved.node_id, saved.label, saved.created_at, saved.updated_at],
         )?;
         Ok(())
     }).await.expect("seed persisted account");
    account
}

fn claude_window(kind: &str, utilization: f64, status: &str, resets_at: Value) -> Value {
    json!({
        "rateLimitType": kind,
        "status": status,
        "utilization": utilization,
        "resetsAt": resets_at,
        "isUsingOverage": false
    })
}

#[tokio::test]
async fn claude_rate_limit_warns_once_per_window_and_rearms() {
    let db = db();
    let rec = seed_account(&db, "user-1", "Personal", "gateway").await;
    let (u, seen) = usage(db.clone());

    // 92% of the 5h session window -> TS "Approaching usage limit" copy.
    u.record_claude_rate_limit(
        rec.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.92, "allowed_warning", json!(1750000000.5)),
    )
    .await
    .expect("record");
    {
        let got = seen.lock().unwrap().clone();
        assert_eq!(got.len(), 1, "one warning: {got:?}");
        assert_eq!(got[0].0, "Approaching usage limit");
        assert_eq!(got[0].1, "Claude Code's session limit is at 92%.");
        assert_eq!(got[0].2, "/settings?tab=usage");
    }

    // Same window, same threshold: deduped.
    u.record_claude_rate_limit(
        rec.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.93, "allowed_warning", json!(1750000000.5)),
    )
    .await
    .expect("record");
    assert_eq!(seen.lock().unwrap().len(), 1, "repeat warning deduped");

    // Weekly window is a separate warning bucket with its own copy.
    u.record_claude_rate_limit(
        rec.id.clone(),
        "claude-code".to_string(),
        claude_window("seven_day", 0.9, "allowed_warning", json!(1750500000)),
    )
    .await
    .expect("record");
    {
        let got = seen.lock().unwrap().clone();
        assert_eq!(got.len(), 2, "weekly warning is independent: {got:?}");
        assert_eq!(got[1].1, "Claude Code's weekly limit is at 90%.");
    }

    // Healthy sample clears the latch for the session window ...
    u.record_claude_rate_limit(
        rec.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.10, "allowed", Value::Null),
    )
    .await
    .expect("record");
    assert_eq!(
        seen.lock().unwrap().len(),
        2,
        "healthy sample emits nothing"
    );

    // ... so the next spike warns again.
    u.record_claude_rate_limit(
        rec.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.95, "allowed_warning", json!(1750003600)),
    )
    .await
    .expect("record");
    {
        let got = seen.lock().unwrap().clone();
        assert_eq!(got.len(), 3, "warning re-armed after recovery: {got:?}");
        assert_eq!(got[2].1, "Claude Code's session limit is at 95%.");
    }
}

#[tokio::test]
async fn claude_rate_limit_redacts_undocumented_fields() {
    let db = db();
    let rec = seed_account(&db, "user-1", "Personal", "gateway").await;
    let (u, _seen) = usage(db.clone());

    let mut window = claude_window("five_hour", 0.5, "allowed", json!(1750000000.5));
    window["apiKey"] = json!("sk-ant-super-secret");
    window["rawHeaders"] = json!({"authorization": "Bearer sk-ant-super-secret"});
    u.record_claude_rate_limit(rec.id.clone(), "claude-code".to_string(), window)
        .await
        .expect("record");

    let rows = u
        .list_for_user("user-1".to_string(), vec![rec.id.clone()])
        .await
        .expect("list");
    assert_eq!(rows.len(), 1, "one row: {rows:?}");
    let row = &rows[0];
    assert_eq!(row["accountId"], json!(rec.id));
    assert_eq!(row["rateLimitType"], json!("five_hour"));
    assert_eq!(row["providerType"], json!("claude-code"));
    assert_eq!(row["status"], json!("allowed"));
    assert_eq!(row["utilization"], json!(0.5));
    assert_eq!(row["isUsingOverage"], json!(false));

    let serialized = serde_json::to_string(&rows).unwrap();
    assert!(
        !serialized.contains("super-secret") && !serialized.contains("apiKey"),
        "undocumented fields must never be persisted/projected: {serialized}"
    );
}

#[tokio::test]
async fn list_for_user_scopes_owner_and_ignores_foreign_account_ids() {
    let db = db();
    let mine = seed_account(&db, "user-1", "Mine", "gateway").await;
    let theirs = seed_account(&db, "user-2", "Theirs", "gateway").await;

    let (u, _seen) = usage(db.clone());
    u.record_claude_rate_limit(
        mine.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.2, "allowed", Value::Null),
    )
    .await
    .expect("record");
    u.record_claude_rate_limit(
        theirs.id.clone(),
        "claude-code".to_string(),
        claude_window("five_hour", 0.7, "allowed", Value::Null),
    )
    .await
    .expect("record");

    // Owner scoping: user-1 only ever sees their own rows.
    let rows = u
        .list_for_user(
            "user-1".to_string(),
            vec![mine.id.clone(), theirs.id.clone()],
        )
        .await
        .unwrap();
    assert_eq!(rows.len(), 1, "no cross-owner leakage: {rows:?}");
    assert_eq!(rows[0]["accountId"], json!(mine.id));

    // account_ids acts as an explicit allow-list: narrowing it removes the row.
    assert!(
        u.list_for_user("user-1".to_string(), vec![theirs.id.clone()])
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        u.list_for_user("user-1".to_string(), Vec::new())
            .await
            .unwrap()
            .is_empty()
    );

    // Unknown owner: empty, not an error.
    assert!(
        u.list_for_user("user-404".to_string(), vec![mine.id.clone()])
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn local_account_creation_rejects_writable_fixture_ancestor() {
    use std::os::unix::fs::PermissionsExt;
    let fixture = root("unsafe-ancestor");
    let writable = fixture.join("writable");
    std::fs::create_dir_all(&writable).expect("writable fixture");
    std::fs::set_permissions(&writable, std::fs::Permissions::from_mode(0o777)).unwrap();
    let svc = accounts_at(db(), writable.clone());
    let error = svc
        .create("user-1".into(), "claude-code".into(), &"b".repeat(80), None)
        .await
        .expect_err("unsafe local ancestry must fail closed");
    assert_eq!(
        error,
        "Account storage identity, ownership or permissions are unsafe"
    );
    std::fs::set_permissions(&writable, std::fs::Permissions::from_mode(0o700)).unwrap();
}
