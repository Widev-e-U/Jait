//! Compound native port evidence, deliberately separate from the still-legacy
//! actual HTTP callback/reference comparisons in gateway_rust_github_composition.
use jait_gateway::{
    db::{self, worker::DatabaseWorker},
    services::{
        agent_github_apps::{
            AgentGithubAppService, GithubEffect, GithubResponse, GithubSetupCallback,
        },
        agent_github_challenge::TTL_MS,
        agent_github_port::{GithubHost, GithubOperation as Op, NativeGithubPort},
        user_secrets::UserSecretService,
    },
    tools::core_io::HostError,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    num::NonZeroU16,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
    time::Duration,
};
const NOW: i64 = 1_700_000_000_123;
const KEY: &str = include_str!("../fixtures/github-app/test-only-key.pem");
fn message(e: HostError) -> String {
    match e {
        HostError::Error(s) => s,
        HostError::Thrown(v) => v.to_string(),
    }
}
fn ok(v: Result<Value, HostError>) -> Value {
    v.unwrap_or_else(|e| panic!("{}", message(e)))
}
fn host(effect: GithubEffect) -> GithubHost {
    GithubHost {
        effect,
        initialize: Arc::new(|| Box::pin(async { Ok(()) })),
        current_agent: Arc::new(|_, _| Box::pin(async { Ok(Value::Null) })),
    }
}
fn manifest() -> Value {
    json!({"id":123,"slug":"fixture","name":"Fixture","pem":KEY,"webhook_secret":"test-webhook-secret"})
}
fn installation() -> Value {
    json!({"id":99,"app_id":123,"account":{"login":"fixture","type":"User"},"repository_selection":"selected","permissions":{"contents":"write"}})
}
struct Fixture {
    worker: DatabaseWorker,
    service: Arc<AgentGithubAppService>,
    port: Arc<NativeGithubPort>,
    now: Arc<AtomicI64>,
    calls: Arc<AtomicUsize>,
    replies: Arc<Mutex<VecDeque<Result<Value, String>>>>,
}
impl Fixture {
    fn from_connection(c: rusqlite::Connection, custom: Option<GithubEffect>) -> Self {
        db::migrate_database(&c).unwrap();
        let worker = DatabaseWorker::new(c, NonZeroU16::new(8).unwrap()).unwrap();
        let now = Arc::new(AtomicI64::new(NOW));
        let clock = now.clone();
        let service = Arc::new(AgentGithubAppService::new(
            Some(UserSecretService::with_clock(
                "challenge-flow-fixture",
                Arc::new(|| NOW),
            )),
            Some("state-fixture".into()),
            Arc::new(move || clock.load(Ordering::SeqCst)),
        ));
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let replies = Arc::new(Mutex::new(VecDeque::<Result<Value, String>>::new()));
        let queue = replies.clone();
        let effect: GithubEffect = custom.unwrap_or_else(|| {
            Arc::new(move |request| {
                assert_eq!(request.user, "u");
                assert_eq!(request.agent, "a");
                assert!(!request.follow_redirects);
                assert_eq!(request.timeout, Duration::from_secs(15));
                count.fetch_add(1, Ordering::SeqCst);
                let reply = queue
                    .lock()
                    .unwrap()
                    .pop_front()
                    .expect("unexpected outbound effect");
                Box::pin(async move {
                    reply.map(|value| GithubResponse {
                        status: 200,
                        body: serde_json::to_vec(&value).unwrap(),
                    })
                })
            })
        });
        let port = NativeGithubPort::new(
            service.clone(),
            worker.clone(),
            host(effect),
            NonZeroU16::new(4).unwrap(),
        );
        Self {
            worker,
            service,
            port,
            now,
            calls,
            replies,
        }
    }
    fn new() -> Self {
        Self::from_connection(rusqlite::Connection::open_in_memory().unwrap(), None)
    }
    fn reply(&self, v: Value) {
        self.replies.lock().unwrap().push_back(Ok(v));
    }
    async fn setup(&self) -> String {
        ok(self
            .port
            .call(Op::BeginSetup {
                user: "u".into(),
                agent: "a".into(),
                options: json!({"appName":"Fixture"}),
            })
            .await)["state"]
            .as_str()
            .unwrap()
            .into()
    }
    fn callback(&self, state: &str, code: Option<&str>, installation: Option<&str>) -> Op {
        Op::CompleteCallback(GithubSetupCallback {
            user: "u".into(),
            agent: "a".into(),
            state: state.into(),
            code: code.map(Into::into),
            installation: installation.map(Into::into),
        })
    }
    async fn run(
        &self,
        state: &str,
        code: Option<&str>,
        installation: Option<&str>,
    ) -> Result<Value, HostError> {
        self.port
            .call(self.callback(state, code, installation))
            .await
    }
    async fn reject(
        &self,
        state: &str,
        code: Option<&str>,
        installation: Option<&str>,
        expected: &str,
    ) {
        assert!(message(self.run(state, code, installation).await.unwrap_err()).contains(expected));
    }
    async fn snapshot(&self) -> Value {
        self.worker.run(|db| {
        let phase:String = db.query_row("SELECT phase FROM native_github_setup_challenges WHERE user_id='u' AND agent_id='a'",[],|r|r.get(0))?;
        let secrets:i64 = db.query_row("SELECT count(*) FROM user_secrets",[],|r|r.get(0))?;
        let replay:Option<String> = db.query_row("SELECT manifest_result FROM native_github_setup_challenges WHERE user_id='u' AND agent_id='a'",[],|r|r.get(0))?;
        Ok(json!({"phase":phase,"secrets":secrets,"replay":replay}))
    }).await.unwrap()
    }
    async fn close(self) {
        self.port.close();
        self.worker.shutdown().await.unwrap();
    }
}
#[tokio::test]
async fn combined_exact_replay_is_durable_public_and_changed_inputs_have_no_effect() {
    let f = Fixture::new();
    let state = f.setup().await;
    f.reply(manifest());
    f.reply(installation());
    let first = ok(f.run(&state, Some("code"), Some("99")).await);
    assert_eq!(first["status"], "connected");
    assert_eq!(ok(f.run(&state, Some("code"), Some("99")).await), first);
    f.reject(&state, Some("changed"), Some("99"), "replay does not match")
        .await;
    f.reject(&state, Some("code"), Some("100"), "replay does not match")
        .await;
    assert_eq!(f.calls.load(Ordering::SeqCst), 2);
    let row = f.snapshot().await;
    assert_eq!(row["phase"], "complete");
    assert_eq!(row["secrets"], 2);
    assert!(!row["replay"].as_str().unwrap().contains("BEGIN"));
    assert!(
        !row["replay"]
            .as_str()
            .unwrap()
            .contains("test-webhook-secret")
    );
    assert!(!row["replay"].as_str().unwrap().contains(&state));
    f.close().await;
}
#[tokio::test]
async fn two_stage_keeps_absolute_deadline_replays_without_effect_and_rejects_clock_rollback() {
    let f = Fixture::new();
    let state = f.setup().await;
    f.now.store(NOW + TTL_MS - 1, Ordering::SeqCst);
    f.reply(manifest());
    let manifest = ok(f.run(&state, Some("code"), None).await);
    assert_eq!(manifest["appId"], "123");
    assert_eq!(ok(f.run(&state, Some("code"), None).await), manifest);
    f.now.store(NOW - 1, Ordering::SeqCst);
    f.reject(&state, None, Some("99"), "expired").await;
    f.now.store(NOW + TTL_MS, Ordering::SeqCst);
    f.reject(&state, None, Some("99"), "expired").await;
    f.reject(&state, Some("code"), None, "expired").await;
    assert_eq!(f.calls.load(Ordering::SeqCst), 1);
    assert_eq!(f.snapshot().await["phase"], "awaiting_installation");
    f.close().await;
}
#[tokio::test]
async fn setup_replacement_manual_save_disconnect_legacy_and_wrong_owner_deny_before_io() {
    let f = Fixture::new();
    let old = f.setup().await;
    let state = f.setup().await;
    f.reject(&old, Some("code"), None, "Invalid GitHub setup challenge")
        .await;
    let legacy = f.service.sign_state("u", "a").unwrap();
    f.reject(
        &legacy,
        Some("code"),
        None,
        "Invalid GitHub setup challenge",
    )
    .await;
    let wrong = Op::CompleteCallback(GithubSetupCallback {
        user: "other".into(),
        agent: "a".into(),
        state: state.clone(),
        code: Some("code".into()),
        installation: None,
    });
    assert!(message(f.port.call(wrong).await.unwrap_err()).contains("Invalid GitHub setup state"));
    ok(f.port
        .call(Op::SaveManual {
            user: "u".into(),
            agent: "a".into(),
            options: json!({"appId":"456","privateKey":KEY}),
        })
        .await);
    f.reject(&state, Some("code"), None, "Invalid GitHub setup challenge")
        .await;
    let state = f.setup().await;
    ok(f.port.call(Op::Disconnect("u".into(), "a".into())).await);
    f.reject(&state, None, Some("99"), "Invalid GitHub setup challenge")
        .await;
    assert_eq!(f.calls.load(Ordering::SeqCst), 0);
    f.close().await;
}
#[tokio::test]
async fn installation_on_existing_app_requires_fresh_setup_and_cannot_change_app() {
    let f = Fixture::new();
    ok(f.port
        .call(Op::SaveManual {
            user: "u".into(),
            agent: "a".into(),
            options: json!({"appId":"123","privateKey":KEY}),
        })
        .await);
    let state = f.setup().await;
    f.reply(installation());
    let installed = ok(f.run(&state, None, Some("99")).await);
    assert_eq!(installed["installationId"], "99");
    assert_eq!(ok(f.run(&state, None, Some("99")).await), installed);
    f.reject(&state, Some("new-code"), None, "Invalid GitHub setup phase")
        .await;
    let state = f.setup().await;
    let mut reply = installation();
    reply["app_id"] = json!(456);
    f.reply(reply);
    f.reject(&state, None, Some("99"), "different GitHub App")
        .await;
    f.reject(&state, None, Some("99"), "uncertain").await;
    assert_eq!(f.calls.load(Ordering::SeqCst), 2);
    f.close().await;
}
#[tokio::test]
async fn transport_and_local_commit_failure_retain_uncertainty_without_partial_credentials() {
    for remote_failure in [true, false] {
        let f = Fixture::new();
        let state = f.setup().await;
        if remote_failure {
            f.replies
                .lock()
                .unwrap()
                .push_back(Err("lost remote response".into()));
        } else {
            f.reply(manifest());
            f.worker.run(|db| {db.execute_batch("CREATE TRIGGER deny_webhook BEFORE INSERT ON user_secrets WHEN NEW.key LIKE '%:webhook' BEGIN SELECT RAISE(FAIL,'injected commit failure'); END;")?;Ok(())}).await.unwrap();
        }
        assert!(f.run(&state, Some("code"), None).await.is_err());
        let row = f.snapshot().await;
        assert_eq!(row["phase"], "manifest_uncertain");
        assert_eq!(row["secrets"], 0);
        assert_eq!(row["replay"], Value::Null);
        f.reject(&state, Some("code"), None, "uncertain").await;
        assert_eq!(f.calls.load(Ordering::SeqCst), 1);
        f.close().await;
    }
}
#[tokio::test]
async fn pre_dispatch_preparation_failure_releases_only_held_reservation() {
    let f = Fixture::new();
    ok(f.port
        .call(Op::SaveManual {
            user: "u".into(),
            agent: "a".into(),
            options: json!({"appId":"123","privateKey":"-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----"}),
        })
        .await);
    let state = f.setup().await;
    for _ in 0..2 {
        let reason = message(f.run(&state, None, Some("99")).await.unwrap_err());
        assert!(!reason.contains("uncertain"));
        assert_eq!(f.snapshot().await["phase"], "awaiting_installation");
    }
    assert_eq!(f.calls.load(Ordering::SeqCst), 0);
    f.close().await;
}
#[tokio::test]
async fn one_owner_lease_spans_both_effects_and_abort_leaves_installation_uncertain() {
    let started = Arc::new(tokio::sync::Notify::new());
    let signal = started.clone();
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let effect: GithubEffect = Arc::new(move |_| {
        let index = count.fetch_add(1, Ordering::SeqCst);
        let signal = signal.clone();
        Box::pin(async move {
            if index == 0 {
                Ok(GithubResponse {
                    status: 200,
                    body: serde_json::to_vec(&manifest()).unwrap(),
                })
            } else {
                signal.notify_one();
                std::future::pending().await
            }
        })
    });
    let f = Fixture::from_connection(
        rusqlite::Connection::open_in_memory().unwrap(),
        Some(effect),
    );
    let state = f.setup().await;
    let port = f.port.clone();
    let op = f.callback(&state, Some("code"), Some("99"));
    let task = tokio::spawn(async move { port.call(op).await });
    tokio::time::timeout(Duration::from_secs(5), started.notified())
        .await
        .unwrap();
    f.reject(&state, Some("code"), Some("99"), "busy").await;
    assert!(
        message(
            f.port
                .call(Op::Disconnect("u".into(), "a".into()))
                .await
                .unwrap_err()
        )
        .contains("busy")
    );
    assert!(ok(f.port.call(Op::Get("other".into(), "a".into())).await).is_null());
    assert_eq!(f.snapshot().await["phase"], "installation_uncertain");
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    f.reject(&state, None, Some("99"), "uncertain").await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let current = ok(f.port.call(Op::Get("u".into(), "a".into())).await);
    assert_eq!(current["appId"], "123");
    assert!(current["installationId"].is_null());
    f.close().await;
}
#[tokio::test]
async fn stale_remote_success_and_failure_cannot_overwrite_replacement_from_another_port() {
    for success in [true, false] {
        let started = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let (signal, resume) = (started.clone(), release.clone());
        let effect: GithubEffect = Arc::new(move |_| {
            let (signal, resume) = (signal.clone(), resume.clone());
            Box::pin(async move {
                signal.notify_one();
                resume.notified().await;
                if success {
                    Ok(GithubResponse {
                        status: 200,
                        body: serde_json::to_vec(&manifest()).unwrap(),
                    })
                } else {
                    Err("stale failure".into())
                }
            })
        });
        let f = Fixture::from_connection(
            rusqlite::Connection::open_in_memory().unwrap(),
            Some(effect),
        );
        let state = f.setup().await;
        let port = f.port.clone();
        let op = f.callback(&state, Some("code"), None);
        let task = tokio::spawn(async move { port.call(op).await });
        tokio::time::timeout(Duration::from_secs(5), started.notified())
            .await
            .unwrap();
        let independent = NativeGithubPort::new(
            f.service.clone(),
            f.worker.clone(),
            host(Arc::new(|_| panic!("unexpected effect"))),
            NonZeroU16::new(2).unwrap(),
        );
        ok(independent
            .call(Op::SaveManual {
                user: "u".into(),
                agent: "a".into(),
                options: json!({"appId":"456","privateKey":KEY}),
            })
            .await);
        release.notify_one();
        assert!(task.await.unwrap().is_err());
        let current = ok(f.port.call(Op::Get("u".into(), "a".into())).await);
        assert_eq!(current["appId"], "456");
        assert!(current["lastError"].is_null());
        assert_eq!(f.snapshot().await["phase"], "revoked");
        f.close().await;
    }
}
#[tokio::test]
async fn bounded_and_missing_callback_inputs_do_not_consume_challenge_or_reach_effect() {
    let f = Fixture::new();
    let state = f.setup().await;
    f.reject(&state, None, None, "Missing GitHub setup code")
        .await;
    f.reject(&state, Some(""), None, "Invalid GitHub setup callback")
        .await;
    f.reject(
        &state,
        Some(&"x".repeat(8193)),
        None,
        "Invalid GitHub setup callback",
    )
    .await;
    f.reject(
        &"x".repeat(8193),
        Some("code"),
        None,
        "Invalid GitHub setup callback",
    )
    .await;
    assert_eq!(f.snapshot().await["phase"], "awaiting_manifest");
    assert_eq!(f.calls.load(Ordering::SeqCst), 0);
    f.reply(manifest());
    ok(f.run(&state, Some("code"), None).await);
    f.close().await;
}
#[tokio::test]
async fn uncertain_flow_survives_full_worker_and_service_reopen() {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/agent-github-compound/restart")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    let path = path.join("state.sqlite");
    let f = Fixture::from_connection(rusqlite::Connection::open(&path).unwrap(), None);
    let state = f.setup().await;
    f.replies
        .lock()
        .unwrap()
        .push_back(Err("ambiguous conversion".into()));
    assert!(f.run(&state, Some("code"), None).await.is_err());
    f.close().await;
    let f = Fixture::from_connection(rusqlite::Connection::open(&path).unwrap(), None);
    f.reject(&state, Some("code"), None, "uncertain").await;
    assert_eq!(f.calls.load(Ordering::SeqCst), 0);
    let fresh = f.setup().await;
    f.reply(manifest());
    ok(f.run(&fresh, Some("new-code"), None).await);
    f.close().await;
}
