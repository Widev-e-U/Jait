#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{db, security::consent_manager::*};
use serde_json::{Map, Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn normalize(value: &mut Value) {
    let ids: Vec<_> = value["events"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["kind"] == "request")
        .map(|e| e["request"]["id"].as_str().unwrap().to_string())
        .collect();
    for id in &ids {
        assert_eq!(uuid::Uuid::parse_str(id).unwrap().get_version_num(), 7);
    }
    fn visit(v: &mut Value, ids: &[String]) {
        match v {
            Value::String(s) => {
                if let Some(index) = ids.iter().position(|id| id == s) {
                    *s = format!("<request-{index}>");
                }
            }
            Value::Array(a) => {
                for item in a {
                    visit(item, ids)
                }
            }
            Value::Object(o) => {
                for item in o.values_mut() {
                    visit(item, ids)
                }
            }
            _ => {}
        }
    }
    if let Some(rows) = value["rows"].as_array_mut() {
        for (index, row) in rows.iter_mut().enumerate() {
            assert_eq!(
                uuid::Uuid::parse_str(row["id"].as_str().unwrap())
                    .unwrap()
                    .get_version_num(),
                7
            );
            row["id"] = json!(format!("<audit-{index}>"));
        }
    }
    visit(value, &ids);
}
fn query(db: &Arc<Mutex<rusqlite::Connection>>, sql: &str) -> Value {
    let db = db.lock().unwrap();
    let result = (|| -> rusqlite::Result<Value> {
        let mut stmt = db.prepare(sql)?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let rows = stmt
            .query_map([], |row| {
                let mut output = Map::new();
                for (index, name) in names.iter().enumerate() {
                    let value = match row.get_ref(index)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(n) => json!(n),
                        rusqlite::types::ValueRef::Real(n) => json!(n),
                        rusqlite::types::ValueRef::Text(t) => json!(String::from_utf8_lossy(t)),
                        _ => panic!("unsupported fixture cell"),
                    };
                    output.insert(name.clone(), value);
                }
                Ok(Value::Object(output))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(json!(rows))
    })();
    result.unwrap_or(json!({"error":true}))
}
async fn scenario(mut call: Value) {
    call["op"] = json!("nativeconsent.run");
    call["now"] = json!(1740000000000i64);
    let fixture = call.clone();
    let mut expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &root(),
            &root()
                .join(".jait/artifacts/gateway-rust/consent-manager")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":[fixture]}),
            &|| false,
        )
        .unwrap()[0]
            .clone()
    })
    .await
    .unwrap();
    let db = Arc::new(Mutex::new(
        db::open_database(std::path::Path::new(":memory:")).unwrap(),
    ));
    db::migrate_database(&db.lock().unwrap()).unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.lock().unwrap().execute_batch(seed).unwrap();
    }
    let clock = Arc::new(AtomicI64::new(1740000000000));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let retained = Arc::new(Mutex::new(Vec::<SharedRequest>::new()));
    let current = Arc::new(Mutex::new(None::<ConsentManager>));
    let make = || {
        let state = clock.clone();
        let request_events = events.clone();
        let decision_events = events.clone();
        let request_slot = current.clone();
        let decision_slot = current.clone();
        let retained = retained.clone();
        let immediate = call["immediateApprove"] == true;
        let throw_request = call["throwRequest"] == true;
        let throw_decision = call["throwDecision"] == true;
        ConsentManager::new(ConsentManagerOptions {
            default_timeout_ms: call["defaultTimeoutMs"].as_f64().unwrap_or(120000.0),
            store: if call["storage"] == true {
                Some(Arc::new(SqliteConsentStore { db: db.clone() }) as Arc<dyn ConsentPersistence>)
            } else {
                None
            },
            clock: Arc::new(move || state.load(Ordering::SeqCst)),
            on_request: Some(Arc::new(move |r| {
                let manager = request_slot.lock().unwrap().clone().unwrap();
                retained.lock().unwrap().push(r.clone());
                request_events.lock().unwrap().push(json!({"kind":"request","request":r.snapshot(),"pending":manager.pending_count()}));
                if immediate {
                    manager.approve(&r.snapshot().id, None, None)?;
                }
                if throw_request {
                    return Err("request observer failed".into());
                }
                Ok(())
            })),
            on_decision: Some(Arc::new(move |decision| {
                let manager = decision_slot.lock().unwrap().clone().unwrap();
                decision_events.lock().unwrap().push(json!({"kind":"decision","decision":decision,"pending":manager.pending_count()}));
                if throw_decision {
                    return Err("decision observer failed".into());
                }
                Ok(())
            })),
        })
    };
    let mut manager = make();
    *current.lock().unwrap() = Some(manager.clone());
    let mut aliases = HashMap::<String, String>::new();
    let mut handles = HashMap::<String, ConsentHandle>::new();
    let mut due = HashMap::<String, tokio::time::Instant>::new();
    let mut results = Vec::<Value>::new();
    let mut resolved = Map::<String, Value>::new();
    for step in call["steps"].as_array().unwrap() {
        let alias = step["alias"].as_str().unwrap_or("");
        let id = aliases
            .get(alias)
            .map(String::as_str)
            .unwrap_or(alias)
            .to_string();
        let via: Option<DecisionVia> = serde_json::from_value(step["via"].clone()).ok();
        let reason = step["reason"].as_str().map(String::from);
        let result = (|| -> Result<Value, String> {
            Ok(match step["op"].as_str().unwrap() {
                "ask" => {
                    let input: RequestConsent =
                        serde_json::from_value(step["input"].clone()).unwrap();
                    let timeout = input
                        .timeout_ms
                        .unwrap_or(call["defaultTimeoutMs"].as_f64().unwrap_or(120000.0));
                    match manager.request_consent(input) {
                        Ok(handle) => {
                            aliases.insert(alias.into(), handle.id.clone());
                            due.insert(
                                handle.id.clone(),
                                tokio::time::Instant::now()
                                    + Duration::from_millis(
                                        if !(1.0..=2147483647.0).contains(&timeout) {
                                            1
                                        } else {
                                            timeout.trunc() as u64
                                        },
                                    ),
                            );
                            handles.insert(alias.into(), handle);
                        }
                        Err(error) => {
                            resolved.insert(alias.into(), json!({"error":true,"message":error}));
                        }
                    }
                    Value::Null
                }
                "approve" => json!(manager.approve(&id, via, reason)?),
                "reject" => json!(manager.reject(&id, via, reason)?),
                "get" => manager
                    .get_request(&id)
                    .map(|r| json!(r.snapshot()))
                    .unwrap_or(Value::Null),
                "list" => json!(
                    manager
                        .list_pending(step["session"].as_str())
                        .iter()
                        .map(|r| r.snapshot())
                        .collect::<Vec<_>>()
                ),
                "count" => json!(manager.pending_count()),
                "enable" => {
                    manager.enable_approve_all_for_session(step["session"].as_str().unwrap());
                    Value::Null
                }
                "disable" => {
                    manager.disable_approve_all_for_session(step["session"].as_str().unwrap());
                    Value::Null
                }
                "enabled" => json!(
                    manager.is_approve_all_enabled_for_session(step["session"].as_str().unwrap())
                ),
                "cancel" => {
                    manager.cancel_all(reason.as_deref())?;
                    Value::Null
                }
                "reopen" => {
                    manager.cancel_all(Some("restart"))?;
                    manager = make();
                    *current.lock().unwrap() = Some(manager.clone());
                    Value::Null
                }
                "sql" => {
                    db.lock()
                        .unwrap()
                        .execute_batch(step["sql"].as_str().unwrap())
                        .map_err(|e| e.to_string())?;
                    Value::Null
                }
                "advance" => Value::Null,
                _ => panic!("step"),
            })
        })();
        if step["op"] == "advance" {
            let ms = step["ms"].as_i64().unwrap();
            clock.fetch_add(ms, Ordering::SeqCst);
            tokio::time::advance(Duration::from_millis(ms as u64)).await;
            // Wait for due timers' real blocking-lane writes, not for any reference result.
            let start = std::time::Instant::now();
            while due.iter().any(|(id, deadline)| {
                *deadline <= tokio::time::Instant::now()
                    && handles
                        .values()
                        .any(|h| h.id == *id && h.outcome().is_none())
            }) {
                assert!(
                    start.elapsed() < Duration::from_secs(2),
                    "expired native consent did not resolve"
                );
                tokio::task::yield_now().await;
            }
        }
        results.push(result.unwrap_or_else(|error| json!({"error":true,"message":error})));
        tokio::task::yield_now().await;
        for (alias, handle) in &handles {
            if !resolved.contains_key(alias)
                && let Some(outcome) = handle.outcome()
            {
                resolved.insert(
                    alias.clone(),
                    match outcome {
                        Ok(decision) => json!({"ok":true,"decision":decision}),
                        Err(error) => json!({"error":true,"message":error}),
                    },
                );
            }
        }
    }
    let mut actual = json!({"results":results,"events":events.lock().unwrap().clone(),"retained":retained.lock().unwrap().iter().map(|r|r.snapshot()).collect::<Vec<_>>(),"resolved":resolved,
        "rows":if call["storage"]==true {query(&db,"SELECT id,action_id,tool_name,decision,decided_at,decided_via FROM consent_log ORDER BY rowid")}else{Value::Null},
        "approvals":if call["storage"]==true {query(&db,"SELECT session_id,approve_all,updated_at FROM consent_session_approvals ORDER BY rowid")}else{Value::Null}});
    normalize(&mut actual);
    normalize(&mut expected);
    // Intentional Rust safety differences: failed persistence cannot enable an override,
    // and shutdown claims the whole snapshot before invoking observers.
    if call["compatibility"] == "failed_override" {
        let index = if call["seed"].is_string() { 1 } else { 2 };
        assert_eq!(expected["results"][index], json!(true));
        expected["results"][index] = json!(false);
    }
    if call["compatibility"] == "atomic_cancel" {
        assert_eq!(expected["events"][2]["pending"], json!(1));
        expected["events"][2]["pending"] = json!(0);
    }
    assert_eq!(actual, expected, "scenario {call}");
    *current.lock().unwrap() = None;
}
fn input(session: &str, action: &str) -> Value {
    json!({"sessionId":session,"actionId":action,"toolName":"terminal.run","summary":"fixture action","preview":{"command":"owned fixture only","nested":[1,null]},"risk":"high","policy":{"consentLevel":"dangerous","description":"requires review","knownTool":false,"source":"unknown-tool"}})
}
fn ask(alias: &str, session: &str) -> Value {
    json!({"op":"ask","alias":alias,"input":input(session,alias)})
}
#[tokio::test(start_paused = true)]
async fn queue_order_filter_status_and_single_decisions_match_reference() {
    for storage in [false, true] {
        scenario(json!({"storage":storage,"steps":[
        ask("one","a"),ask("two","b"),{"op":"list"},{"op":"list","session":"a"},{"op":"list","session":""},
        {"op":"get","alias":"one"},{"op":"approve","alias":"one"},{"op":"approve","alias":"one"},
        {"op":"reject","alias":"missing"},{"op":"count"},{"op":"reject","alias":"two","via":"voice","reason":"not now"},
        {"op":"get","alias":"two"},{"op":"list"}]})).await;
    }
}
#[tokio::test(start_paused = true)]
async fn default_custom_fractional_and_expired_timers_match_reference() {
    let mut short = input("a", "short");
    short["timeoutMs"] = json!(-10);
    let mut fractional = input("a", "fractional");
    fractional["timeoutMs"] = json!(12.9);
    scenario(json!({"storage":true,"defaultTimeoutMs":50,"steps":[
        ask("default","a"),{"op":"ask","alias":"short","input":short},{"op":"ask","alias":"fractional","input":fractional},
        {"op":"advance","ms":1},{"op":"count"},{"op":"advance","ms":11},{"op":"count"},
        {"op":"advance","ms":38},{"op":"count"},{"op":"approve","alias":"default"}]})).await;
}
#[tokio::test(start_paused = true)]
async fn approve_all_persistence_is_separate_from_pending_decisions() {
    scenario(json!({"storage":true,"seed":"INSERT INTO consent_session_approvals VALUES ('old',1,'before'),('disabled',0,'before');","steps":[
        {"op":"enabled","session":"old"},{"op":"enabled","session":"disabled"},{"op":"enable","session":"new"},
        {"op":"enable","session":"new"},ask("one","new"),{"op":"count"},{"op":"reopen"},
        {"op":"enabled","session":"new"},{"op":"disable","session":"old"},{"op":"reopen"},{"op":"enabled","session":"old"}]})).await;
}
#[tokio::test(start_paused = true)]
async fn database_failures_preserve_memory_and_allow_decision_delivery() {
    scenario(json!({"storage":true,"compatibility":"failed_override","steps":[
        {"op":"sql","sql":"CREATE TRIGGER fail_log BEFORE INSERT ON consent_log BEGIN SELECT RAISE(FAIL,'blocked fixture'); END; CREATE TRIGGER fail_override BEFORE INSERT ON consent_session_approvals BEGIN SELECT RAISE(FAIL,'blocked fixture'); END;"},
        {"op":"enable","session":"s"},{"op":"enabled","session":"s"},ask("one","s"),{"op":"approve","alias":"one"},
        {"op":"reopen"},{"op":"enabled","session":"s"}]})).await;
    scenario(json!({"storage":true,"compatibility":"failed_override","seed":"DROP TABLE consent_session_approvals;","steps":[{"op":"enable","session":"s"},{"op":"enabled","session":"s"},{"op":"disable","session":"s"},{"op":"enabled","session":"s"}]})).await;
}
#[tokio::test(start_paused = true)]
async fn observer_reentry_and_exceptions_match_promise_ordering() {
    for flags in [
        json!({"immediateApprove":true}),
        json!({"throwRequest":true}),
        json!({"throwDecision":true}),
        json!({"immediateApprove":true,"throwRequest":true}),
    ] {
        let mut call = flags;
        call["steps"] = json!([ask("one","s"),{"op":"approve","alias":"one"},{"op":"count"}]);
        scenario(call).await;
    }
}
#[tokio::test(start_paused = true)]
async fn shutdown_rejection_and_manual_timeout_via_keep_reference_status_rules() {
    scenario(json!({"storage":true,"compatibility":"atomic_cancel","steps":[ask("one","a"),ask("two","b"),{"op":"cancel"},{"op":"cancel","reason":"again"},{"op":"count"},ask("three","a"),{"op":"reject","alias":"three","via":"timeout","reason":"explicit"}]})).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn competing_decisions_write_and_notify_exactly_once() {
    let db = Arc::new(Mutex::new(
        db::open_database(std::path::Path::new(":memory:")).unwrap(),
    ));
    db::migrate_database(&db.lock().unwrap()).unwrap();
    let notified = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let count = notified.clone();
    let manager = ConsentManager::new(ConsentManagerOptions {
        store: Some(Arc::new(SqliteConsentStore { db: db.clone() })),
        on_decision: Some(Arc::new(move |_| {
            count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        })),
        ..Default::default()
    });
    let mut handle = manager
        .request_consent(serde_json::from_value(input("s", "race")).unwrap())
        .unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(8));
    let mut jobs = vec![];
    for index in 0..8 {
        let manager = manager.clone();
        let id = handle.id.clone();
        let barrier = barrier.clone();
        jobs.push(tokio::task::spawn_blocking(move || {
            barrier.wait();
            if index % 2 == 0 {
                manager.approve(&id, None, None)
            } else {
                manager.reject(&id, None, None)
            }
        }));
    }
    let mut wins = 0;
    for job in jobs {
        wins += usize::from(job.await.unwrap().unwrap());
    }
    assert_eq!(wins, 1);
    assert_eq!(notified.load(Ordering::SeqCst), 1);
    assert_eq!(manager.pending_count(), 0);
    let decision = handle.wait().await.unwrap();
    let rows = query(&db, "SELECT decision FROM consent_log");
    assert_eq!(
        rows,
        json!([{"decision":if decision.approved{"approved"}else{"rejected"}}])
    );
}
#[tokio::test]
async fn abandoned_waiter_still_expires_on_the_real_timer() {
    let notified = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let count = notified.clone();
    let manager = ConsentManager::new(ConsentManagerOptions {
        default_timeout_ms: 5.0,
        on_decision: Some(Arc::new(move |decision| {
            assert_eq!(decision.decided_via, DecisionVia::Timeout);
            count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        })),
        ..Default::default()
    });
    let handle = manager
        .request_consent(serde_json::from_value(input("s", "abandoned")).unwrap())
        .unwrap();
    drop(handle);
    tokio::time::timeout(Duration::from_secs(2), async {
        while notified.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await
        }
    })
    .await
    .unwrap();
    assert_eq!(manager.pending_count(), 0);
    assert_eq!(notified.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn invalid_expiry_has_no_request_and_no_timer() {
    let manager = ConsentManager::default();
    for timeout in [f64::NAN, f64::INFINITY, 9e15, -9e15] {
        let mut params: RequestConsent = serde_json::from_value(input("s", "invalid")).unwrap();
        params.timeout_ms = Some(timeout);
        assert_eq!(
            manager.request_consent(params).err().unwrap(),
            "Invalid time value"
        );
        assert_eq!(manager.pending_count(), 0);
    }
}
#[tokio::test]
async fn persisted_overrides_and_audit_survive_connection_reopen() {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/consent-manager")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("consent.sqlite");
    {
        let db = Arc::new(Mutex::new(db::open_database(&path).unwrap()));
        db::migrate_database(&db.lock().unwrap()).unwrap();
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(Arc::new(SqliteConsentStore { db })),
            ..Default::default()
        });
        manager.enable_approve_all_for_session("persisted");
        let mut handle = manager
            .request_consent(serde_json::from_value(input("s", "durable")).unwrap())
            .unwrap();
        manager.reject(&handle.id, None, None).unwrap();
        assert!(!handle.wait().await.unwrap().approved);
    }
    let db = Arc::new(Mutex::new(db::open_database(&path).unwrap()));
    let manager = ConsentManager::new(ConsentManagerOptions {
        store: Some(Arc::new(SqliteConsentStore { db: db.clone() })),
        ..Default::default()
    });
    assert!(manager.is_approve_all_enabled_for_session("persisted"));
    assert_eq!(
        query(&db, "SELECT action_id,decision FROM consent_log"),
        json!([{"action_id":"durable","decision":"rejected"}])
    );
    manager.disable_approve_all_for_session("persisted");
    assert_eq!(
        query(&db, "SELECT * FROM consent_session_approvals"),
        json!([])
    );
}
