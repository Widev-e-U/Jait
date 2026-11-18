#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::{
    notifications::{Broadcast, NotificationService, NotificationSink, Subscription},
    usage_refresh_cache::{FailurePredicate, RefreshFuture, RefreshOptions, UsageRefreshCache},
    usage_summary::summarize_provider_usage,
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicI64, Ordering},
    },
    time::Duration,
};
use tokio::sync::oneshot;
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn vectors() -> Value {
    serde_json::from_str(include_str!("../vectors/native-feedback.json")).unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/native-feedback")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn notifications(vector: &Value) -> Value {
    let mut call = vector.clone();
    call["op"] = json!("nativefeedback.notifications");
    call["now"] = json!(NOW);
    let expected = reference(call);
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let broadcast_error = Arc::new(AtomicBool::new(false));
    let log = events.clone();
    let error = broadcast_error.clone();
    let broadcast: Broadcast = Arc::new(move |event| {
        log.lock()
            .unwrap()
            .push(json!({"kind":"broadcast","event":event}));
        if error.load(Ordering::SeqCst) {
            Err("broadcast failed".into())
        } else {
            Ok(())
        }
    });
    let service = NotificationService::with_clock(broadcast, Arc::new(|| 1_792_324_800_000));
    let slot = Arc::new(Mutex::new(Some(service.clone())));
    let callbacks = Arc::new(Mutex::new(HashMap::<String, NotificationSink>::new()));
    let subscriptions = Arc::new(Mutex::new(HashMap::<String, Subscription>::new()));
    for (name, behavior) in vector["sinks"].as_object().unwrap() {
        let key = name.clone();
        let name = name.clone();
        let behavior = behavior.clone();
        let log = events.clone();
        let slot = slot.clone();
        let callbacks_ref = callbacks.clone();
        let subscriptions = subscriptions.clone();
        let fired = AtomicBool::new(false);
        let sink: NotificationSink = Arc::new(move |payload| {
            log.lock()
                .unwrap()
                .push(json!({"kind":"sink","name":name,"payload":payload}));
            if behavior["op"] == "throw" {
                return Err("sink failed".into());
            }
            if behavior["op"] == "mutate" {
                payload[behavior["key"].as_str().unwrap()] = behavior["value"].clone();
            }
            if !fired.swap(true, Ordering::SeqCst) {
                if behavior["op"] == "remove"
                    && let Some(sub) = subscriptions
                        .lock()
                        .unwrap()
                        .get(behavior["alias"].as_str().unwrap())
                {
                    sub.unsubscribe();
                }
                if behavior["op"] == "append" {
                    let callback = callbacks_ref
                        .lock()
                        .unwrap()
                        .get(behavior["name"].as_str().unwrap())
                        .unwrap()
                        .clone();
                    let service = slot.lock().unwrap().clone().unwrap();
                    service.add_sink(callback);
                }
            }
            Ok(())
        });
        callbacks.lock().unwrap().insert(key, sink);
    }
    let mut results = vec![];
    for step in vector["steps"].as_array().unwrap() {
        let result: Result<(), String> = (|| {
            match step["op"].as_str().unwrap() {
                "add" => {
                    let callback = callbacks
                        .lock()
                        .unwrap()
                        .get(step["name"].as_str().unwrap())
                        .unwrap()
                        .clone();
                    subscriptions.lock().unwrap().insert(
                        step["alias"].as_str().unwrap().into(),
                        service.add_sink(callback),
                    );
                }
                "remove" => {
                    if let Some(sub) = subscriptions
                        .lock()
                        .unwrap()
                        .get(step["alias"].as_str().unwrap())
                    {
                        sub.unsubscribe();
                    }
                }
                "send" => {
                    broadcast_error.store(step["broadcastError"] == true, Ordering::SeqCst);
                    service.send(step["notification"].as_object().unwrap())?;
                }
                "notify" => {
                    broadcast_error.store(step["broadcastError"] == true, Ordering::SeqCst);
                    service.notify(
                        step["level"].as_str().unwrap(),
                        step["title"].as_str().unwrap(),
                        step["body"].as_str().unwrap(),
                        step["link"].as_str(),
                    )?;
                }
                _ => panic!("unknown step"),
            }
            Ok(())
        })();
        results.push(match result {
            Ok(()) => Value::Null,
            Err(error) => json!({"error":error}),
        });
    }
    let actual = json!({"results":results,"events":*events.lock().unwrap()});
    subscriptions.lock().unwrap().clear();
    callbacks.lock().unwrap().clear();
    *slot.lock().unwrap() = None;
    assert_eq!(actual, expected, "{}", vector["name"]);
    actual
}
#[test]
fn notification_broadcast_and_best_effort_sinks_match_reference() {
    let v = notifications(&vectors()["notifications"][0]);
    assert_eq!(v["results"][7], json!({"error":"broadcast failed"}));
    let events = v["events"].as_array().unwrap();
    assert_eq!(events[0]["kind"], "broadcast");
    assert_eq!(events[1]["name"], "a");
    assert_eq!(events[3]["payload"]["fromB"], true);
}
#[test]
fn notification_live_array_and_unsubscribe_identity_match_reference() {
    let values = vectors();
    let v = notifications(&values["notifications"][1]);
    let names = v["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|e| e["name"].as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        vec!["a", "b", "b", "c", "a", "c", "d", "a", "c", "d"]
    );
    let v = notifications(&values["notifications"][2]);
    assert_eq!(v["events"][2]["name"], "b");
}
#[test]
fn usage_summary_preserves_quota_order_labels_plan_precedence_and_error_metadata() {
    for v in vectors()["summary"].as_array().unwrap() {
        let mut call = v.clone();
        call["op"] = json!("nativefeedback.summary");
        call["now"] = json!(NOW);
        let expected = reference(call);
        let actual = summarize_provider_usage(
            v["accounts"].as_array().unwrap(),
            v["quotas"].as_array().unwrap(),
            &v["options"],
            NOW,
        );
        assert_eq!(actual, expected, "{}", v["name"]);
    }
}
type Handles = Vec<(String, RefreshFuture<Value>)>;
type Releases = Arc<Mutex<BTreeMap<String, oneshot::Sender<()>>>>;
fn run(
    cache: &UsageRefreshCache<Value>,
    step: &Value,
    handles: &mut Handles,
    loads: &Arc<Mutex<Vec<String>>>,
    releases: &Releases,
) -> Value {
    let name = step["handle"].as_str().unwrap().to_string();
    let held = step["hold"] == true;
    let value = step["value"].clone();
    let error = step["error"].as_str().map(String::from);
    let log = loads.clone();
    let releases = releases.clone();
    let loader_name = name.clone();
    let options = RefreshOptions {
        force: step["force"] == true,
        failed: (step["failed"] == true)
            .then(|| Arc::new(|_: &Value| true) as FailurePredicate<Value>),
    };
    let future = cache.run(
        step["key"].as_str().unwrap(),
        move || async move {
            log.lock().unwrap().push(loader_name.clone());
            if held {
                let (send, receive) = oneshot::channel();
                releases.lock().unwrap().insert(loader_name, send);
                receive
                    .await
                    .map_err(|_| "fixture release lost".to_string())?;
            }
            if let Some(error) = error {
                Err(error)
            } else {
                Ok(value)
            }
        },
        options,
    );
    let same = handles
        .iter()
        .find(|(_, previous)| RefreshFuture::ptr_eq(previous, &future))
        .map(|(alias, _)| alias.clone());
    handles.push((name, future));
    json!({"sameAs":same})
}
async fn cache(vector: &Value) -> Value {
    let mut call = vector.clone();
    call["op"] = json!("nativefeedback.cache");
    let expected = tokio::task::spawn_blocking(move || reference(call))
        .await
        .unwrap();
    let clock = Arc::new(AtomicI64::new(vector["now"].as_i64().unwrap()));
    let source = clock.clone();
    let service = UsageRefreshCache::new(Arc::new(move || source.load(Ordering::SeqCst)));
    let loads = Arc::new(Mutex::new(Vec::new()));
    let releases = Arc::new(Mutex::new(BTreeMap::new()));
    let mut handles = vec![];
    let mut results = vec![];
    for step in vector["steps"].as_array().unwrap() {
        let result = match step["op"].as_str().unwrap() {
            "run" => run(&service, step, &mut handles, &loads, &releases),
            "time" => {
                clock.store(step["now"].as_i64().unwrap(), Ordering::SeqCst);
                Value::Null
            }
            "release" => {
                releases
                    .lock()
                    .unwrap()
                    .remove(step["handle"].as_str().unwrap())
                    .unwrap()
                    .send(())
                    .unwrap();
                Value::Null
            }
            "await" => {
                let handle = handles
                    .iter()
                    .find(|(name, _)| name == step["handle"].as_str().unwrap())
                    .unwrap()
                    .1
                    .clone();
                match handle.await {
                    Ok(value) => json!({"ok":value}),
                    Err(error) => json!({"error":*error}),
                }
            }
            "bulk" => {
                let start = handles.len();
                for i in 0..step["count"].as_u64().unwrap() {
                    run(
                        &service,
                        &json!({"key":format!("bulk{i}"),"handle":format!("bulk{i}"),"value":i}),
                        &mut handles,
                        &loads,
                        &releases,
                    );
                }
                for (_, future) in &handles[start..] {
                    future.clone().await.unwrap();
                }
                Value::Null
            }
            _ => panic!("unknown step"),
        };
        results.push(result);
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
    }
    let actual = json!({"results":results,"loads":*loads.lock().unwrap()});
    assert_eq!(actual, expected, "{}", vector["name"]);
    actual
}
#[tokio::test]
async fn usage_cache_shares_active_requests_and_bypasses_settled_freshness() {
    let v = cache(&vectors()["cache"][0]).await;
    assert_eq!(v["results"][2]["sameAs"], "first");
    assert_eq!(v["loads"], json!(["first", "cool", "forced", "expired"]));
}
#[tokio::test]
async fn usage_cache_reuses_failures_and_caps_backoff_then_resets_after_success() {
    cache(&vectors()["cache"][1]).await;
    cache(&vectors()["cache"][2]).await;
}
#[tokio::test]
async fn usage_cache_capacity_and_expired_eviction_match_reference() {
    cache(&vectors()["cache"][3]).await;
}
#[tokio::test]
async fn usage_cache_keeps_active_work_when_waiters_drop_and_never_evicts_it() {
    let clock = Arc::new(AtomicI64::new(0));
    let source = clock.clone();
    let cache = UsageRefreshCache::new(Arc::new(move || source.load(Ordering::SeqCst)));
    let (send, receive) = oneshot::channel();
    let first = cache.run(
        "active",
        move || async move { receive.await.map_err(|e| e.to_string()) },
        RefreshOptions::default(),
    );
    drop(first);
    for i in 0..999 {
        cache
            .run(
                &format!("bulk{i}"),
                || async { Ok(()) },
                RefreshOptions::default(),
            )
            .await
            .unwrap();
    }
    assert!(
        cache
            .run("blocked", || async { Ok(()) }, RefreshOptions::default())
            .await
            .is_err()
    );
    clock.store(300_000, Ordering::SeqCst);
    cache
        .run("new", || async { Ok(()) }, RefreshOptions::default())
        .await
        .unwrap();
    let shared = cache.run(
        "active",
        || async { Err("must not load".into()) },
        RefreshOptions {
            force: true,
            failed: None,
        },
    );
    send.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(1), shared)
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn usage_cache_manual_refresh_bypasses_settled_failure_backoff() {
    let v = cache(&vectors()["cache"][4]).await;
    assert_eq!(v["loads"], json!(["a", "b", "c", "d", "e"]));
}
