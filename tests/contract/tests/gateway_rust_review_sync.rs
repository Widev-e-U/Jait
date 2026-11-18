#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{services::thread_review_sync::*, tools::core_io::HostError};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::Notify;

struct State {
    test: Value,
    rows: Vec<Value>,
    events: Vec<Value>,
    counts: HashMap<String, u64>,
    held: bool,
    timers: u64,
    active: u64,
}
impl State {
    fn invoke(&mut self, name: &str, args: Value, fallback: Value) -> Result<Value, HostError> {
        self.events.push(json!({"name":name,"args":args}));
        let count = self.counts.entry(name.into()).or_default();
        *count += 1;
        if self.test["fail"]["name"] == name
            && self.test["fail"]["at"].as_u64().unwrap_or(1) == *count
        {
            if let Some(v) = self.test["fail"].get("thrown") {
                return Err(HostError::Thrown(v.clone()));
            }
            return Err(HostError::Error(
                self.test["fail"]["message"]
                    .as_str()
                    .unwrap_or("fixture failure")
                    .into(),
            ));
        }
        Ok(self.test["replies"].get(name).cloned().unwrap_or(fallback))
    }
    fn port(&mut self, op: ReviewOperation) -> Result<Value, HostError> {
        match op {
            ReviewOperation::List { limit } => {
                self.invoke("list", json!([null, limit]), json!(self.rows))
            }
            ReviewOperation::Exists(cwd) => {
                self.invoke("exists", json!([cwd]), json!(self.test["local"] != false))
            }
            ReviewOperation::PreferredRemote { cwd, branch } => {
                self.invoke("preferred", json!([cwd, branch]), json!("origin"))
            }
            ReviewOperation::RemoteUrl { cwd, remote } => self.invoke(
                "url",
                json!([cwd, remote]),
                self.test
                    .get("remoteUrl")
                    .cloned()
                    .unwrap_or(json!("https://github.com/org/repo.git")),
            ),
            ReviewOperation::ParseRemote(url) => self.invoke(
                "parse",
                json!([url]),
                json!({"provider":"github","owner":"org","repo":"repo"}),
            ),
            ReviewOperation::ResolveForge(url) => self.invoke("resolve", json!([url]), json!(true)),
            ReviewOperation::GetForge(provider) => {
                self.invoke("forge", json!([provider]), json!(true))
            }
            ReviewOperation::FindPr {
                cwd,
                remote,
                branch,
                ..
            } => self.invoke(
                "find",
                json!([cwd, remote, branch]),
                self.test["pr"].clone(),
            ),
            ReviewOperation::Nodes => self.invoke(
                "nodes",
                json!([]),
                self.test.get("nodes").cloned().unwrap_or(json!([])),
            ),
            ReviewOperation::ProxyGit {
                node,
                cwd,
                query,
                timeout_ms,
            } => {
                let (name, stdout) = match query {
                    GitQuery::BranchRemote(_) => ("configured", json!("origin")),
                    GitQuery::Remotes => ("remotes", json!("origin\n")),
                    GitQuery::RemoteUrl(_) => (
                        "remoteUrl",
                        self.test
                            .get("remoteUrl")
                            .cloned()
                            .unwrap_or(json!("https://github.com/org/repo.git")),
                    ),
                };
                self.invoke(
                    name,
                    json!([node,"git",{"cwd":cwd,"args":query.reference_arguments()},timeout_ms]),
                    json!({"stdout":stdout}),
                )
            }
            ReviewOperation::Update { id, patch } => {
                let idx = self.rows.iter().position(|r| r["id"] == id);
                let mut fallback = idx.map(|i| self.rows[i].clone()).unwrap_or(Value::Null);
                if let Some(object) = fallback.as_object_mut() {
                    for (k, v) in patch.as_object().unwrap() {
                        object.insert(k.clone(), v.clone());
                    }
                }
                let result = self.invoke("update", json!([id, patch]), fallback)?;
                if let (Some(i), Some(object)) = (idx, result.as_object()) {
                    for (k, v) in object {
                        self.rows[i]
                            .as_object_mut()
                            .unwrap()
                            .insert(k.clone(), v.clone());
                    }
                }
                Ok(result)
            }
            ReviewOperation::AddActivity {
                id,
                summary,
                metadata,
            } => self.invoke(
                "activity",
                json!([id, "activity", summary, metadata]),
                json!({"id":"activity"}),
            ),
            ReviewOperation::Broadcast(event) => {
                self.invoke("broadcast", json!([event]), Value::Null)
            }
            ReviewOperation::Log(message) => self.invoke("log", json!([message]), Value::Null),
        }
    }
}
fn error(value: Result<(), HostError>) -> Value {
    match value {
        Ok(()) => Value::Null,
        Err(HostError::Error(e)) => json!({"error":e}),
        Err(HostError::Thrown(v)) => json!({"thrown":v}),
    }
}
async fn native(test: &Value) -> Value {
    let state = Arc::new(Mutex::new(State {
        test: test.clone(),
        rows: test["rows"].as_array().cloned().unwrap_or_default(),
        events: vec![],
        counts: HashMap::new(),
        held: false,
        timers: 0,
        active: 0,
    }));
    let gate = Arc::new(Notify::new());
    let port: ReviewPort = {
        let state = state.clone();
        let gate = gate.clone();
        Arc::new(move |op| {
            let mut s = state.lock().unwrap();
            let hold =
                matches!(op, ReviewOperation::FindPr { .. }) && s.test["hold"] == true && !s.held;
            if hold {
                s.held = true;
            }
            let value = s.port(op);
            let gate = gate.clone();
            drop(s);
            Box::pin(async move {
                if hold {
                    gate.notified().await;
                }
                value
            })
        })
    };
    let schedule: RepeatSchedule = {
        let state = state.clone();
        Arc::new(move |ms, _callback| {
            let mut s = state.lock().unwrap();
            s.timers += 1;
            s.active += 1;
            let id = s.timers;
            s.events.push(json!({"name":"schedule","args":[if ms.fract() == 0.0 {json!(ms as i64)} else {json!(ms)},id]}));
            drop(s);
            let cancel = state.clone();
            let unref = state.clone();
            Ok(IntervalRegistration {
                cancel: Some(Box::new(move || {
                    let mut s = cancel.lock().unwrap();
                    s.active -= 1;
                    s.events.push(json!({"name":"cancel","args":[id]}));
                })),
                unref: Some(Box::new(move || {
                    unref
                        .lock()
                        .unwrap()
                        .events
                        .push(json!({"name":"unref","args":[id]}));
                    Ok(())
                })),
            })
        })
    };
    let cleanup: ScheduleCleanup = {
        let state = state.clone();
        Arc::new(move |request| {
            let _ = state.lock().unwrap().invoke("cleanup",json!([request.cwd,request.has_ws,request.branch,{"preserveBranch":request.preserve_branch}]),Value::Null);
        })
    };
    let service = ThreadReviewSyncService::with_clock(
        port,
        schedule,
        cleanup,
        ReviewSyncConfig {
            process_cwd: "/fixture".into(),
            has_ws: test["noWs"] != true,
            custom_forge_resolver: test["defaultResolver"] != true,
        },
        Arc::new(|| 1000),
    );
    let mut errors = vec![];
    if test["lifecycle"] == true {
        service.start(test["interval"].as_f64()).unwrap();
        service.start(Some(99.)).unwrap();
        service.stop();
        service.stop();
        service.start(None).unwrap();
        errors.push(error(service.tick().await));
        service.stop();
    } else if test["hold"] == true {
        let mut first = Box::pin(service.tick());
        tokio::select! { biased; result=&mut first => panic!("expected held poll: {result:?}"), _=tokio::task::yield_now()=>{} }
        errors.push(error(service.tick().await));
        gate.notify_one();
        errors.push(error(first.await));
    } else {
        for _ in 0..test["ticks"].as_u64().unwrap_or(1) {
            errors.push(error(service.tick().await));
        }
    }
    let s = state.lock().unwrap();
    json!({"events":s.events,"errors":errors,"rows":s.rows,"timers":s.active})
}
fn row() -> Value {
    json!({"id":"thread-1","kind":"delivery","branch":"feature/branch","workingDirectory":"/owned/repo","prState":"open","prUrl":"https://github.com/org/repo/pull/42","prNumber":42,"prTitle":"Old","providerSessionId":"provider-1"})
}
fn case(patch: Value) -> Value {
    let mut value = json!({"rows":[row()],"pr":{"state":"merged","url":"https://github.com/org/repo/pull/42","number":42,"title":"Old","baseBranch":"main"}});
    for (k, v) in patch.as_object().unwrap() {
        value[k] = v.clone();
    }
    value
}
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/review-sync/contracts"),
        json!({"version":1,"calls":[{"op":"nativereviewsync.compare","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (i, c) in cases.iter().enumerate() {
        assert_eq!(native(c).await, expected[i], "case {i}: {c}");
    }
}
#[tokio::test]
async fn local_state_changes_metadata_noops_and_cleanup() {
    let mut same = row();
    same["prState"] = json!("open");
    same["prBaseBranch"] = json!("main");
    compare(vec![
        case(json!({})),case(json!({"noWs":true})),case(json!({"cleanupPending":true})),
        case(json!({"pr":{"state":"closed"}})),case(json!({"pr":{"state":"open","title":"Updated"}})),
        case(json!({"pr":{"url":"","number":0,"title":"","baseBranch":""}})),
        case(json!({"rows":[same],"pr":{"state":"open","url":"https://github.com/org/repo/pull/42","number":42,"title":"Old","baseBranch":"main"}})),
        case(json!({"pr":null})),case(json!({"replies":{"update":null}})),
        case(json!({"pr":{"state":"merged"},"ticks":2})),
    ]).await;
}
#[tokio::test]
async fn filters_all_candidates_and_preserves_sequential_progress() {
    let mut rows = vec![];
    for (field, values) in [
        ("kind", vec![json!("task"), Value::Null]),
        ("branch", vec![json!(""), json!(2), Value::Null]),
        (
            "workingDirectory",
            vec![json!(""), json!(false), Value::Null],
        ),
        ("prState", vec![json!("merged"), json!("closed")]),
    ] {
        for v in values {
            let mut r = row();
            r[field] = v;
            rows.push(r);
        }
    }
    let mut no_url = row();
    no_url["prState"] = Value::Null;
    no_url["prUrl"] = Value::Null;
    rows.push(no_url);
    let mut creating = row();
    creating["id"] = json!("creating");
    creating["prState"] = json!("creating");
    rows.push(creating);
    let mut whitespace = row();
    whitespace["id"] = json!("whitespace");
    whitespace["branch"] = json!(" ");
    rows.push(whitespace);
    let mut linked = row();
    linked["id"] = json!("linked");
    linked["prState"] = Value::Null;
    rows.push(linked);
    compare(vec![case(json!({"rows":rows})), case(json!({"rows":[]}))]).await;
}
#[tokio::test]
async fn local_resolution_default_resolver_and_missing_values() {
    let mut cases = vec![case(json!({"defaultResolver":true}))];
    for key in ["preferred", "url", "parse", "resolve", "forge"] {
        let mut replies = json!({});
        replies[key] = Value::Null;
        cases.push(case(
            json!({"replies":replies,"defaultResolver":key=="forge"}),
        ));
    }
    compare(cases).await;
}
#[tokio::test]
async fn remote_node_selection_platforms_and_git_precedence() {
    let nodes = json!([{"id":"gateway","isGateway":true},{"id":"linux","platform":"linux"},{"id":"windows","platform":"windows"}]);
    let mut windows = row();
    windows["workingDirectory"] = json!("C:\\owned\\repo");
    let mut cases = vec![
        case(json!({"local":false,"nodes":nodes})),
        case(json!({"local":false,"nodes":nodes,"rows":[windows]})),
        case(json!({"local":false,"noWs":true})),
        case(json!({"local":false,"nodes":[]})),
    ];
    for replies in [
        json!({"configured":{"stdout":" upstream \r\n"},"remotes":{"stdout":"origin\n upstream \n"}}),
        json!({"configured":{"stdout":"missing"},"remotes":{"stdout":"custom\n origin\n"}}),
        json!({"configured":{"stdout":"."},"remotes":{"stdout":"custom\n other\n"}}),
        json!({"remotes":{"stdout":" \n\t"}}),
        json!({"remoteUrl":{"stdout":" \u{feff}\n"}}),
        json!({"remoteUrl":{"stdout":"  https://github.com/org/repo.git\u{2029}"}}),
    ] {
        cases.push(case(json!({"local":false,"nodes":nodes,"replies":replies})));
    }
    compare(cases).await;
}
#[tokio::test]
async fn errors_are_isolated_and_poll_guard_recovers() {
    let mut cases = vec![];
    for name in [
        "list",
        "exists",
        "preferred",
        "url",
        "parse",
        "resolve",
        "find",
        "update",
        "activity",
        "broadcast",
        "cleanup",
    ] {
        cases.push(case(
            json!({"fail":{"name":name,"message":"fixture failure"},"ticks":2}),
        ));
    }
    for thrown in [Value::Null, json!(7), json!({"bad":"data"}), json!([1, 2])] {
        cases.push(case(
            json!({"fail":{"name":"find","thrown":thrown},"ticks":2}),
        ));
    }
    for name in ["configured", "remotes", "remoteUrl"] {
        cases.push(case(json!({"local":false,"nodes":[{"id":"node"}],"fail":{"name":name,"message":"missing git"}})));
    }
    compare(cases).await;
}
#[tokio::test]
async fn null_fallbacks_partial_failure_and_broadcast_order() {
    let mut missing = row();
    missing.as_object_mut().unwrap().remove("prState");
    let mut second = row();
    second["id"] = json!("second");
    let mut unicode = row();
    unicode["branch"] = json!("feature/🦀");
    unicode["workingDirectory"] = json!("/owned/🦀");
    compare(vec![
        case(json!({"rows":[missing]})),case(json!({"rows":[unicode]})),
        case(json!({"rows":[row(),second],"fail":{"name":"find"}})),
        case(json!({"pr":{"state":"future"}})),
        case(json!({"pr":{"state":"open","url":null,"number":null,"title":null,"baseBranch":null}})),
        case(json!({"fail":{"name":"update","at":2}})),
        case(json!({"fail":{"name":"broadcast","at":2}})),
        case(json!({"defaultResolver":true,"fail":{"name":"parse","at":2}})),
        case(json!({"defaultResolver":true,"fail":{"name":"forge"}})),
        case(json!({"local":false,"nodes":[{"id":"node"}],"fail":{"name":"nodes"}})),
        case(json!({"local":false,"nodes":[{"id":"windows","platform":"windows"},{"id":"linux","platform":"linux"}]})),
    ]).await;
}
#[tokio::test]
async fn cancellation_releases_poll_guard_without_detached_effects() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = Arc::new(AtomicUsize::new(0));
    let observed = calls.clone();
    let port: ReviewPort = Arc::new(move |op| {
        assert!(matches!(op, ReviewOperation::List { limit: 100 }));
        let count = observed.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            if count == 0 {
                std::future::pending::<()>().await;
            }
            Ok(json!([]))
        })
    });
    let service = ThreadReviewSyncService::new(
        port,
        Arc::new(|_, _| panic!("no interval requested")),
        Arc::new(|_| panic!("no cleanup permitted")),
        ReviewSyncConfig {
            process_cwd: "/fixture".into(),
            has_ws: false,
            custom_forge_resolver: false,
        },
    );
    let mut first = Box::pin(service.tick());
    tokio::select! { biased; _=&mut first=>panic!("poll should wait"), _=tokio::task::yield_now()=>{} }
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(service.tick().await.is_ok());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    drop(first);
    assert!(service.tick().await.is_ok());
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn interval_callbacks_do_not_retain_service_and_drop_cancels_registration() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let callback: Arc<Mutex<Option<PollCallback>>> = Arc::new(Mutex::new(None));
    let cancelled = Arc::new(AtomicUsize::new(0));
    let calls = Arc::new(AtomicUsize::new(0));
    let stored = callback.clone();
    let cancel_count = cancelled.clone();
    let observed = calls.clone();
    let schedule: RepeatSchedule = Arc::new(move |ms, cb| {
        assert_eq!(ms, 30_000.);
        *stored.lock().unwrap() = Some(cb);
        let count = cancel_count.clone();
        Ok(IntervalRegistration {
            cancel: Some(Box::new(move || {
                count.fetch_add(1, Ordering::SeqCst);
            })),
            unref: None,
        })
    });
    let port: ReviewPort = Arc::new(move |op| {
        assert!(matches!(op, ReviewOperation::List { limit: 100 }));
        observed.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(json!([])) })
    });
    let service = ThreadReviewSyncService::new(
        port,
        schedule,
        Arc::new(|_| panic!("no cleanup permitted")),
        ReviewSyncConfig {
            process_cwd: "/fixture".into(),
            has_ws: false,
            custom_forge_resolver: false,
        },
    );
    service.start(None).unwrap();
    service.start(Some(5.)).unwrap();
    let cb = callback.lock().unwrap().clone().unwrap();
    cb().await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let weak = Arc::downgrade(&service);
    drop(service);
    assert!(weak.upgrade().is_none());
    assert_eq!(cancelled.load(Ordering::SeqCst), 1);
    cb().await.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn lifecycle_is_idempotent_and_overlapping_ticks_are_skipped() {
    compare(vec![
        case(json!({"lifecycle":true})),
        case(json!({"lifecycle":true,"interval":17})),
        case(json!({"hold":true})),
    ])
    .await;
}
