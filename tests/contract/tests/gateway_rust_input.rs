#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::{
        chat_notifications::ChatNotificationsService,
        input_requests::{
            InputHandle, InputRequest, Observer, SecretInputService, UserQuestionService,
        },
        json_state::SessionStateService,
    },
};
use serde_json::{Map, Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/native-input")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn normalize(value: &mut Value) {
    let mut ids = vec![];
    for e in value["events"].as_array().unwrap() {
        if e["kind"] == "request" {
            let id = e["request"]["id"].as_str().unwrap();
            assert_eq!(uuid::Uuid::parse_str(id).unwrap().get_version_num(), 7);
            ids.push(id.to_string());
        }
    }
    fn visit(v: &mut Value, ids: &[String]) {
        match v {
            Value::String(s) => {
                if let Some(i) = ids.iter().position(|id| id == s) {
                    *s = format!("<request-{i}>");
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, ids);
                }
            }
            Value::Object(m) => {
                for v in m.values_mut() {
                    visit(v, ids);
                }
            }
            _ => {}
        }
    }
    visit(value, &ids);
}
async fn inputs(secret: bool, steps: Value, default_ms: Option<f64>) -> Value {
    let call = json!({"op":"nativeinput.run","now":NOW,"secret":secret,"steps":steps,"defaultTimeoutMs":default_ms});
    let mut expected = tokio::task::spawn_blocking(move || reference(call))
        .await
        .unwrap();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let observer = |kind: &'static str| -> Observer {
        let events = events.clone();
        Arc::new(move |request: InputRequest| {
            events
                .lock()
                .unwrap()
                .push(json!({"kind":kind,"request":request}));
        })
    };
    let clock = Arc::new(|| 1_792_324_800_000_i64);
    let questions = UserQuestionService::new(
        clock.clone(),
        Some(observer("request")),
        Some(observer("resolved")),
    );
    let secrets = SecretInputService::new(
        clock,
        default_ms.unwrap_or(120_000.0),
        Some(observer("request")),
        Some(observer("resolved")),
    );
    let mut handles = BTreeMap::<String, InputHandle>::new();
    let mut results = vec![];
    let mut resolved = Map::new();
    for step in steps.as_array().unwrap() {
        let user = step["user"].as_str();
        let alias = step["alias"].as_str().unwrap_or("");
        let id = handles.get(alias).map(|h| h.id.as_str()).unwrap_or(alias);
        let result = match step["op"].as_str().unwrap() {
            "ask" => {
                let handle = if secret {
                    secrets
                        .request_secret(serde_json::from_value(step["input"].clone()).unwrap())
                        .unwrap()
                } else {
                    questions.ask(serde_json::from_value(step["input"].clone()).unwrap())
                };
                handles.insert(alias.into(), handle);
                Value::Null
            }
            "list" => json!(if secret {
                secrets.list_pending(step["session"].as_str(), user)
            } else {
                questions.list_pending(step["session"].as_str(), user)
            }),
            "submit" => json!(if secret {
                secrets.submit(id, step["value"].as_str().unwrap().into(), user)
            } else {
                questions.submit(id, step["value"].clone(), user)
            }),
            "cancel" => json!(if secret {
                secrets.cancel(id, user)
            } else {
                questions.cancel(id, user)
            }),
            "wait" => {
                tokio::time::sleep(Duration::from_millis(step["ms"].as_u64().unwrap())).await;
                Value::Null
            }
            _ => panic!("unknown step"),
        };
        results.push(result);
        for (alias, handle) in &mut handles {
            if let Ok(value) = handle.result.try_recv() {
                resolved.insert(alias.clone(), json!(value));
            }
        }
    }
    let mut actual =
        json!({"results":results,"events":*events.lock().unwrap(),"resolved":resolved});
    normalize(&mut actual);
    normalize(&mut expected);
    assert_eq!(actual, expected, "{steps}");
    actual
}
#[tokio::test]
async fn questions_preserve_order_filters_defaults_and_owner_resolution() {
    let v=inputs(false,json!([
        {"op":"ask","alias":"a","input":{"sessionId":"s","userId":"alice","questions":[{"id":"q","header":"Choice","question":"Pick","options":[{"label":"yes","recommended":true}]}]}},
        {"op":"ask","alias":"b","input":{"sessionId":"t","userId":"bob","title":"  Urgent \u{00a0}","attention":"urgent","questions":[]}},
        {"op":"ask","alias":"c","input":{"sessionId":"s","userId":"","title":"\u{FEFF}\u{2029}","attention":"unexpected","questions":[]}},
        {"op":"list"},{"op":"list","session":"s"},{"op":"list","user":"alice"},{"op":"list","session":"","user":""},
        {"op":"submit","alias":"a","user":"bob","value":{"answers":{}}},{"op":"cancel","alias":"a"},
        {"op":"submit","alias":"a","user":"alice","value":{"answers":{"q":{"selected":["yes"],"freeText":null,"skipped":false}}}},
        {"op":"submit","alias":"a","user":"alice","value":{"answers":{}}},
        {"op":"cancel","alias":"b","user":"bob"},{"op":"cancel","alias":"c"},{"op":"list"}
    ]),None).await;
    assert_eq!(v["results"][7], false);
    assert_eq!(v["results"][9], true);
    assert_eq!(v["events"][2]["request"]["title"], "Input requested");
    assert_eq!(v["results"][13], json!([]));
    assert!(
        v["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| e["request"]["expiresAt"].is_null())
    );
}
#[tokio::test]
async fn questions_keep_pending_requests_when_receivers_are_dropped_and_callbacks_reenter() {
    let slot = Arc::new(Mutex::new(None::<UserQuestionService>));
    let seen = Arc::new(Mutex::new(Vec::new()));
    let capture = slot.clone();
    let record = seen.clone();
    let observer: Observer = Arc::new(move |r| {
        let service = capture.lock().unwrap().clone().unwrap();
        assert_eq!(service.list_pending(None, None).len(), 1);
        assert!(service.cancel(&r.id, Some("owner")));
        record.lock().unwrap().push(r.id);
    });
    let service = UserQuestionService::new(Arc::new(|| 1_792_324_800_000), Some(observer), None);
    *slot.lock().unwrap() = Some(service.clone());
    let handle = service.ask(
        serde_json::from_value(json!({"sessionId":"s","userId":"owner","questions":[]})).unwrap(),
    );
    assert_eq!(handle.result.await.unwrap(), None);
    assert_eq!(seen.lock().unwrap().len(), 1);
    *slot.lock().unwrap() = None;
    let service = UserQuestionService::default();
    let handle = service.ask(Default::default());
    let id = handle.id;
    drop(handle.result);
    assert_eq!(service.list_pending(None, None).len(), 1);
    assert!(service.submit(&id, json!({"answers":{}}), None));
}
#[tokio::test]
async fn secrets_keep_values_out_of_callbacks_and_cancel_their_timers() {
    let v=inputs(true,json!([
        {"op":"ask","alias":"a","input":{"sessionId":"s","userId":"owner","title":"Enter","prompt":"Password","requestedBy":"terminal","command":"fixture","rememberable":false,"rememberLabel":"","secretType":"password","secretKey":"fixture","timeoutMs":60}},
        {"op":"list","user":"other"},
        {"op":"submit","alias":"a","user":"other","value":"fixture-secret"},
        {"op":"submit","alias":"a","user":"owner","value":"fixture-secret"},
        {"op":"cancel","alias":"a","user":"owner"},
        {"op":"wait","ms":100},{"op":"list"}
    ]),None).await;
    assert_eq!(v["resolved"]["a"], "fixture-secret");
    assert!(!v["events"].to_string().contains("fixture-secret"));
    assert_eq!(v["events"].as_array().unwrap().len(), 2);
    assert_eq!(v["results"][1], json!([]));
}
#[tokio::test]
async fn secret_expiry_default_override_and_nonpositive_delays_match_reference() {
    let v=inputs(true,json!([
        {"op":"ask","alias":"a","input":{"sessionId":"s","title":"A","prompt":"","timeoutMs":0}},
        {"op":"ask","alias":"b","input":{"sessionId":"s","title":"B","prompt":"","timeoutMs":-2.5}},
        {"op":"wait","ms":40},{"op":"list"},
        {"op":"ask","alias":"c","input":{"sessionId":"s","title":"C","prompt":""}},
        {"op":"wait","ms":40},{"op":"list"},
        {"op":"submit","alias":"c","value":"late"},
        {"op":"cancel","alias":"missing"}
    ]),Some(2.5)).await;
    assert_eq!(v["resolved"], json!({"a":null,"b":null,"c":null}));
    assert_eq!(v["results"][7], false);
    assert_eq!(v["events"][0]["request"]["expiresAt"], NOW);
}
#[tokio::test]
async fn secret_cancellation_and_reentrant_submission_are_single_resolution() {
    let v=inputs(true,json!([
        {"op":"ask","alias":"a","input":{"sessionId":"s","userId":"owner","title":"A","prompt":"","timeoutMs":1000}},
        {"op":"cancel","alias":"a"},{"op":"cancel","alias":"a","user":"other"},
        {"op":"cancel","alias":"a","user":"owner"},
        {"op":"submit","alias":"a","user":"owner","value":"late"},{"op":"list"}
    ]),None).await;
    assert_eq!(v["results"][3], true);
    assert_eq!(v["events"][1]["request"]["status"], "cancelled");
    let slot = Arc::new(Mutex::new(None::<SecretInputService>));
    let capture = slot.clone();
    let observer: Observer = Arc::new(move |r| {
        let service = capture.lock().unwrap().clone().unwrap();
        assert!(service.submit(&r.id, "value".into(), None));
    });
    let service =
        SecretInputService::new(Arc::new(|| 1_792_324_800_000), 1.0, Some(observer), None);
    *slot.lock().unwrap() = Some(service.clone());
    let handle = service
        .request_secret(
            serde_json::from_value(json!({"sessionId":"s","title":"","prompt":""})).unwrap(),
        )
        .unwrap();
    assert_eq!(handle.result.await.unwrap(), Some(json!("value")));
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert!(service.list_pending(None, None).is_empty());
    *slot.lock().unwrap() = None;
}
fn notifications(storage: bool, steps: Value, seed: &str) -> Value {
    let expected = reference(
        json!({"op":"nativeinput.notifications","now":NOW,"storage":storage,"steps":steps,"seed":seed}),
    );
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let mut service =
        ChatNotificationsService::new(storage.then(|| SessionStateService::with_time(&db, NOW)));
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        let result: rusqlite::Result<Value> = (|| match step["op"].as_str().unwrap() {
            "get" => Ok(json!(service.get(step["id"].as_str().unwrap())?)),
            "list" => Ok(json!(service.list(step["user"].as_str().unwrap())?)),
            "set" => {
                service.set(step["user"].as_str().unwrap(), &step["state"])?;
                Ok(Value::Null)
            }
            "raw" => {
                SessionStateService::with_time(&db, NOW).set(
                    step["id"].as_str().unwrap(),
                    json!({"notification.completion":step["value"]})
                        .as_object()
                        .unwrap(),
                )?;
                Ok(Value::Null)
            }
            "bulk" => {
                for i in 0..step["count"].as_u64().unwrap() {
                    service.set("owner", &state(&format!("s{i}"), &format!("n{i}"), false))?;
                }
                Ok(Value::Null)
            }
            _ => panic!("unknown step"),
        })();
        results.push(result.unwrap_or(json!({"error":true})));
    }
    let rows=db.prepare("SELECT session_id,key,value,updated_at FROM session_state ORDER BY rowid").unwrap()
        .query_map([],|r|Ok(json!({"session_id":r.get::<_,String>(0)?,"key":r.get::<_,String>(1)?,"value":r.get::<_,Option<String>>(2)?,"updated_at":r.get::<_,String>(3)?})))
        .unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    let actual = json!({"results":results,"rows":rows});
    assert_eq!(actual, expected);
    actual
}
fn state(session: &str, id: &str, read: bool) -> Value {
    json!({"id":id,"sessionId":session,"replaceId":format!("chat-complete:{session}"),"read":read})
}
#[test]
fn completion_notifications_validate_metadata_strip_previews_and_filter_owners() {
    for storage in [false, true] {
        let mut good = state("s", "n", false);
        good["preview"] = json!("must never persist");
        let v = notifications(
            storage,
            json!([
                {"op":"get","id":"s"},{"op":"set","user":"owner","state":good},
                {"op":"get","id":"s"},{"op":"list","user":"other"},{"op":"list","user":"owner"},
                {"op":"set","user":"owner","state":state("s","n",true)},{"op":"get","id":"s"},
                {"op":"set","user":"","state":state("s","ignored",false)},
                {"op":"set","user":"owner","state":{"id":"bad","sessionId":"s","replaceId":"bad","read":true}},
                {"op":"set","user":"owner","state":{"id":"","sessionId":"s","replaceId":"chat-complete:s","read":true}},
                {"op":"set","user":"owner","state":{"id":"n","sessionId":"s","replaceId":"chat-complete:s","read":"true"}},
                {"op":"get","id":"s"},{"op":"list","user":"owner"}
            ]),
            "",
        );
        assert_eq!(v["results"][6]["state"]["read"], true);
        assert!(!v.to_string().contains("must never persist"));
        assert_eq!(v["results"][11]["state"]["id"], "n");
    }
}
#[test]
fn notification_ids_use_utf16_limits_and_fallback_eviction_retains_recent_updates() {
    for storage in [false, true] {
        notifications(
            storage,
            json!([
                {"op":"set","user":"owner","state":state("s",&"😀".repeat(256),false)},
                {"op":"get","id":"s"},
                {"op":"set","user":"owner","state":state("s",&"😀".repeat(257),true)},
                {"op":"get","id":"s"}
            ]),
            "",
        );
    }
    let v = notifications(
        false,
        json!([
            {"op":"bulk","count":2048},
            {"op":"set","user":"owner","state":state("s0","updated",true)},
            {"op":"set","user":"owner","state":state("new","n",false)},
            {"op":"get","id":"s0"},{"op":"get","id":"s1"},{"op":"get","id":"s2"}
        ]),
        "",
    );
    assert_eq!(v["results"][3]["state"]["id"], "updated");
    assert!(v["results"][4].is_null());
}
#[test]
fn legacy_notification_rows_are_validated_without_rewriting_or_deleting() {
    let v = notifications(
        true,
        json!([
            {"op":"raw","id":"a","value":{"userId":"owner","state":{"id":"n","sessionId":"wrong","replaceId":"chat-complete:a","read":false}}},
            {"op":"raw","id":"b","value":{"userId":"owner","state":{"id":"n","sessionId":"b","replaceId":"chat-complete:b","read":false,"preview":"legacy"}}},
            {"op":"raw","id":"c","value":[1,2]},
            {"op":"get","id":"a"},{"op":"get","id":"b"},{"op":"list","user":"owner"}
        ]),
        "",
    );
    assert!(v["results"][3].is_null());
    assert_eq!(v["results"][5].as_array().unwrap().len(), 1);
    assert_eq!(v["rows"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn secret_expiration_accepts_ecmascript_extended_years_and_timer_overflow() {
    let now = 1_792_324_800_000_f64;
    let v=inputs(true,json!([
        {"op":"ask","alias":"a","input":{"sessionId":"s","title":"A","prompt":"","timeoutMs":8.64e15-now}},
        {"op":"wait","ms":40},
        {"op":"ask","alias":"b","input":{"sessionId":"s","title":"B","prompt":"","timeoutMs":-8.64e15-now}},
        {"op":"wait","ms":40},
        {"op":"list"}
    ]),None).await;
    assert_eq!(
        v["events"][0]["request"]["expiresAt"],
        "+275760-09-13T00:00:00.000Z"
    );
    assert_eq!(
        v["events"][2]["request"]["expiresAt"],
        "-271821-04-20T00:00:00.000Z"
    );
    assert_eq!(v["resolved"], json!({"a":null,"b":null}));
}

#[tokio::test]
async fn secret_timer_retains_registry_until_expiry_and_concurrent_resolutions_are_atomic() {
    let service = SecretInputService::new(Arc::new(|| 1_792_324_800_000), 2.0, None, None);
    let handle = service
        .request_secret(
            serde_json::from_value(json!({"sessionId":"s","title":"","prompt":""})).unwrap(),
        )
        .unwrap();
    drop(service);
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(1), handle.result)
            .await
            .unwrap()
            .unwrap(),
        None
    );
    let resolved = Arc::new(Mutex::new(Vec::new()));
    let sink = resolved.clone();
    let observer: Observer = Arc::new(move |r| sink.lock().unwrap().push(r));
    let service = UserQuestionService::new(Arc::new(|| 1_792_324_800_000), None, Some(observer));
    let handle = service.ask(Default::default());
    let mut tasks = vec![];
    for i in 0..16 {
        let service = service.clone();
        let id = handle.id.clone();
        tasks.push(tokio::spawn(async move {
            if i % 2 == 0 {
                service.cancel(&id, None)
            } else {
                service.submit(&id, json!({"answers":{}}), None)
            }
        }));
    }
    let mut winners = 0;
    for task in tasks {
        winners += usize::from(task.await.unwrap());
    }
    assert_eq!(winners, 1);
    let _ = handle.result.await.unwrap();
    assert_eq!(resolved.lock().unwrap().len(), 1);
    assert!(service.list_pending(None, None).is_empty());
}
