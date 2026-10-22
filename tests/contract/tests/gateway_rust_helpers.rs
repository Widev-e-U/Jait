#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    plugins::manifest::validate_manifest,
    scheduler::cron::is_valid_cron_expression,
    services::{
        background_command_continuation::{
            ContinuationOptions, build_background_command_continuation_payload,
        },
        json_state::SessionStateService,
        users::UserService,
    },
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/helpers")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
#[test]
fn cron_checks_five_fields_ranges_steps_safe_integers_and_js_whitespace() {
    let mut values = vec![
        "* * * * *".into(),
        "\u{feff}0\t23 31 12 6\n".into(),
        "* * * *".into(),
        "* * * * * *".into(),
        "\u{0085}* * * * *".into(),
        " ".repeat(257),
        format!("{}* * * * *", " ".repeat(247)),
    ];
    for (index, (min, max)) in [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
        .into_iter()
        .enumerate()
    {
        for field in [
            format!("{min}"),
            format!("{max}"),
            format!("{}", max + 1),
            format!("{}-{max}", min),
            format!("{max}-{min}"),
            format!("{min},{max}"),
            "0,".into(),
            "*/0".into(),
            "*/1".into(),
            "*/9007199254740991".into(),
            "*/9007199254740992".into(),
            "+1".into(),
            "1.0".into(),
            "1/2".into(),
            "１".into(),
            "00000000000000000001".into(),
        ] {
            let mut parts = [
                "*".to_string(),
                "*".into(),
                "*".into(),
                "*".into(),
                "*".into(),
            ];
            parts[index] = field;
            values.push(parts.join(" "));
        }
    }
    for chunk in values.chunks(30) {
        let expected = reference(json!({"op":"nativehelpers.cron","values":chunk}));
        let actual = chunk
            .iter()
            .map(|s| is_valid_cron_expression(s))
            .collect::<Vec<_>>();
        assert_eq!(json!(actual), expected);
    }
}
#[test]
fn manifests_keep_minimal_validation_order_and_ascii_word_ids() {
    let mut values = vec![
        Value::Null,
        json!(false),
        json!(42),
        json!("x"),
        json!([]),
        json!({}),
        json!({"id":"a"}),
        json!({"id":"a","displayName":"A"}),
    ];
    for id in [
        "valid",
        "UpperCase",
        "_",
        "0",
        ".bad",
        "-bad",
        "a.b-c_d",
        "@org/name",
        "@_org/name",
        "@org//name",
        "name/other",
        "é",
        "名前",
        "a b",
        "a\n",
        "@org/name\n",
        "constructor",
        "__proto__",
    ] {
        values.push(json!({"id":id,"displayName":" ","version":"not-semver","arbitrary":true}));
    }
    values.extend([
        json!({"id":0,"displayName":"X","version":"1"}),
        json!({"id":"ok","displayName":"","version":"1"}),
        json!({"id":"ok","displayName":"X","version":false}),
    ]);
    let expected = reference(json!({"op":"nativehelpers.manifest","values":values}));
    assert_eq!(
        json!(values.iter().map(validate_manifest).collect::<Vec<_>>()),
        expected
    );
}
#[test]
fn public_action_uuid_helper_matches_timestamp_entropy_and_layout() {
    let entropy = std::array::from_fn::<u8, 16, _>(|i| (i * 17) as u8);
    for now in [
        0,
        1,
        65535,
        4294967297,
        281474976710655,
        281474976710657,
        9007199254740991u64,
    ] {
        let expected = reference(json!({"op":"nativehelpers.uuid","now":now,"entropy":entropy}));
        let value = db::identifiers::uuidv7_from_parts(now, entropy).to_string();
        assert_eq!(json!([value, value]), expected);
    }
    let mut seen = std::collections::HashSet::new();
    for _ in 0..100 {
        let id = jait_gateway::identifiers::new_action_id();
        assert_eq!(id.len(), 36);
        let parsed = uuid::Uuid::parse_str(&id).unwrap();
        assert_eq!(parsed.get_version_num(), 7);
        assert_eq!(parsed.get_variant(), uuid::Variant::RFC4122);
        assert!(seen.insert(id));
    }
    let id = jait_gateway::identifiers::uuidv7();
    assert_eq!(uuid::Uuid::parse_str(&id).unwrap().get_version_num(), 7);
}
fn continuation(mut call: Value) -> Value {
    call["op"] = json!("nativehelpers.continuation");
    let expected = reference(call.clone());
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let users = UserService::new(&db);
    users.get_settings("u").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let state = SessionStateService::new(&db);
    if let Some(values) = call["state"].as_object() {
        state.set("s", values).unwrap();
    }
    let actual = build_background_command_continuation_payload(ContinuationOptions {
        session_id: call["sessionId"].as_str().unwrap_or("s"),
        notification: call["notification"].as_str().unwrap_or("Command completed"),
        notice: call["notice"].as_str(),
        user_id: call["userId"].as_str().unwrap_or("u"),
        users: &users,
        session_state: (call["withState"] != false).then_some(&state),
        session_metadata: &call["metadata"],
    })
    .unwrap_or_else(|_| json!({"error":true}));
    assert_eq!(actual, expected);
    actual
}
#[test]
fn continuation_preserves_metadata_null_overrides_and_external_provider_selection() {
    let seed = "UPDATE user_settings SET chat_provider='codex',reasoning_effort='high'";
    let state = json!({"chat.cliModels":{"codex":" model "},"chat.providerRuntimeMode":"supervised","chat.reasoningEffort":"low"});
    for metadata in [
        json!(null),
        json!([]),
        json!("bad-json"),
        json!({"chat":null}),
        json!({"chat":[]}),
        json!({"chat":{}}),
        json!({"chat":{"reasoningEffort":null}}),
        json!({"chat":{"reasoningEffort":" custom-max "}}),
        json!({"chat":{"reasoningEffort":3}}),
        json!({"chat":{"reasoningEffort":"bad value"}}),
        json!("{\"chat\":{\"reasoningEffort\":null}}"),
        json!("{\"chat\":{\"reasoningEffort\":\"medium\"}}"),
    ] {
        continuation(json!({"seed":seed,"state":state,"metadata":metadata,"notice":"Finished"}));
    }
    continuation(json!({"state":state,"notice":"","metadata":{"chat":{"reasoningEffort":null}}}));
    continuation(json!({"seed":seed,"withState":false,"state":state}));
    continuation(json!({"seed":seed,"state":state,"userId":" u ","sessionId":" s "}));
    continuation(
        json!({"seed":seed,"state":{"chat.reasoningEffort":"invalid effort","chat.cliModels":[],"chat.providerRuntimeMode":"invalid"}}),
    );
}
#[test]
fn continuation_database_failures_and_fallback_short_circuit_match() {
    continuation(json!({"seed":"DROP TABLE session_state"}));
    continuation(
        json!({"seed":"DROP TABLE user_settings","metadata":{"chat":{"reasoningEffort":null}}}),
    );
    continuation(
        json!({"seed":"UPDATE user_settings SET reasoning_effort=' minimal '; DROP TABLE session_state","withState":false}),
    );
}

#[tokio::test]
async fn resume_callbacks_preserve_identity_errors_and_separate_chat_thread_keys() {
    use jait_gateway::services::intervention_run_resume::{
        InterventionRunResumeRegistry, ResumeHandler, ResumeKind,
    };
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };
    let call = json!({"op":"nativehelpers.resume","handlers":{
     "a":{"value":{"status":"steered"}},"b":{"value":{"status":"queued","error":"detail"}},"bad":{"error":"callback failed"}
    },"steps":[
     {"op":"resume","kind":"chat","id":"same","message":"missing"},
     {"op":"register","kind":"chat","id":"same","handler":"a","alias":"old"},
     {"op":"register","kind":"chat","id":"same","handler":"b","alias":"new"},
     {"op":"register","kind":"thread","id":"same","handler":"a","alias":"thread"},
     {"op":"release","alias":"old"},{"op":"resume","kind":"chat","id":"same","message":"use new"},
     {"op":"resume","kind":"thread","id":"same","message":"thread isolated"},
     {"op":"release","alias":"new"},{"op":"resume","kind":"chat","id":"same","message":"removed"},
     {"op":"register","kind":"chat","id":"x","handler":"a","alias":"same1"},
     {"op":"register","kind":"chat","id":"x","handler":"a","alias":"same2"},
     {"op":"release","alias":"same1"},{"op":"resume","kind":"chat","id":"x","message":"identity removed"},
     {"op":"register","kind":"thread","id":"error","handler":"bad","alias":"bad"},
     {"op":"resume","kind":"thread","id":"error","message":"throw"},{"op":"resume","kind":"thread","id":"error","message":"throw again"},
     {"op":"clear"},{"op":"resume","kind":"thread","id":"same","message":"cleared"},{"op":"release","alias":"thread"}
    ]});
    let expected = reference(call.clone());
    let registry = InterventionRunResumeRegistry::default();
    let events = Arc::new(Mutex::new(vec![]));
    let mut handlers = HashMap::new();
    for (name, behavior) in call["handlers"].as_object().unwrap() {
        let key = name.clone();
        let name = name.clone();
        let behavior = behavior.clone();
        let events = events.clone();
        let handler: ResumeHandler = Arc::new(move |message| {
            let name = name.clone();
            let behavior = behavior.clone();
            let events = events.clone();
            Box::pin(async move {
                events
                    .lock()
                    .unwrap()
                    .push(json!({"name":name,"message":message}));
                tokio::task::yield_now().await;
                if let Some(error) = behavior["error"].as_str() {
                    Err(error.into())
                } else {
                    Ok(behavior["value"].clone())
                }
            })
        });
        handlers.insert(key, handler);
    }
    let mut subscriptions = HashMap::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let kind = if step["kind"] == "chat" {
            ResumeKind::Chat
        } else {
            ResumeKind::Thread
        };
        let id = step["id"].as_str().unwrap_or("");
        let value = match step["op"].as_str().unwrap() {
            "register" => {
                subscriptions.insert(
                    step["alias"].as_str().unwrap(),
                    registry.register(
                        kind,
                        id,
                        handlers[step["handler"].as_str().unwrap()].clone(),
                    ),
                );
                Value::Null
            }
            "release" => {
                subscriptions[step["alias"].as_str().unwrap()].unsubscribe();
                Value::Null
            }
            "clear" => {
                registry.clear();
                Value::Null
            }
            "resume" => {
                registry
                    .resume(kind, id, step["message"].as_str().unwrap())
                    .await
            }
            _ => panic!("bad step"),
        };
        results.push(value);
    }
    assert_eq!(
        json!({"results":results,"events":*events.lock().unwrap()}),
        expected
    );
}

#[tokio::test]
async fn replacing_a_resume_callback_during_await_preserves_both_invocations() {
    use jait_gateway::services::intervention_run_resume::{
        InterventionRunResumeRegistry, ResumeHandler, ResumeKind,
    };
    use std::sync::{Arc, Mutex};
    let expected = reference(json!({"op":"nativehelpers.resumeRace"}));
    let registry = InterventionRunResumeRegistry::default();
    let events = Arc::new(Mutex::new(vec![]));
    let (send_started, started) = tokio::sync::oneshot::channel::<()>();
    let (finish_send, finish) = tokio::sync::oneshot::channel::<()>();
    let wait = Arc::new(Mutex::new(Some((send_started, finish))));
    let log = events.clone();
    let first_handler: ResumeHandler = Arc::new(move |_| {
        let (send_started, finish) = wait.lock().unwrap().take().unwrap();
        let log = log.clone();
        Box::pin(async move {
            log.lock().unwrap().push("first:start");
            send_started.send(()).unwrap();
            finish.await.unwrap();
            log.lock().unwrap().push("first:end");
            Ok(json!({"status":"steered"}))
        })
    });
    let old = registry.register(ResumeKind::Chat, "race", first_handler);
    let copy = registry.clone();
    let pending = tokio::spawn(async move { copy.resume(ResumeKind::Chat, "race", "first").await });
    started.await.unwrap();
    let log = events.clone();
    let handler: ResumeHandler = Arc::new(move |_| {
        let log = log.clone();
        Box::pin(async move {
            log.lock().unwrap().push("second");
            Ok(json!({"status":"steered"}))
        })
    });
    let current = registry.register(ResumeKind::Chat, "race", handler);
    old.unsubscribe();
    let second = registry.resume(ResumeKind::Chat, "race", "second").await;
    finish_send.send(()).unwrap();
    let first = pending.await.unwrap();
    current.unsubscribe();
    let missing = registry.resume(ResumeKind::Chat, "race", "missing").await;
    assert_eq!(
        json!({"events":*events.lock().unwrap(),"first":first,"second":second,"missing":missing}),
        expected
    );
}

#[tokio::test]
async fn chat_resume_options_forward_missing_empty_false_and_hidden_without_changing_identity() {
    use jait_gateway::services::intervention_run_resume::{
        ChatResumeHandler, ChatResumeOptions, InterventionRunResumeRegistry, ResumeHandler,
        ResumeKind,
    };
    use std::sync::{Arc, Mutex};
    let call = json!({"op":"nativehelpers.resume","captureOptions":true,"handlers":{"chat":{"value":{"status":"steered"}},"thread":{"value":{"status":"queued"}}},"steps":[
        {"op":"register","kind":"chat","id":"same","handler":"chat","alias":"first"},
        {"op":"register","kind":"thread","id":"same","handler":"thread","alias":"thread"},
        {"op":"resume","kind":"chat","id":"same","message":"missing"},
        {"op":"resume","kind":"chat","id":"same","message":"empty","options":{}},
        {"op":"resume","kind":"chat","id":"same","message":"visible","options":{"hidden":false}},
        {"op":"resume","kind":"chat","id":"same","message":"internal","options":{"hidden":true}},
        {"op":"resume","kind":"thread","id":"same","message":"thread has no options","options":{"hidden":true}},
        {"op":"register","kind":"chat","id":"same","handler":"chat","alias":"second"},
        {"op":"release","alias":"first"},
        {"op":"resume","kind":"chat","id":"same","message":"removed same identity","options":{"hidden":true}},
        {"op":"resume","kind":"thread","id":"same","message":"thread still registered"}
    ]});
    let expected = reference(call.clone());
    let registry = InterventionRunResumeRegistry::default();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let log = events.clone();
    let chat: ChatResumeHandler = Arc::new(move |message, options| {
        let log = log.clone();
        Box::pin(async move {
            log.lock().unwrap().push(json!({"name":"chat","message":message,"options":options.map(|o| serde_json::to_value(o).unwrap()).unwrap_or(json!({"undefined":true}))}));
            tokio::task::yield_now().await;
            Ok(json!({"status":"steered"}))
        })
    });
    let log = events.clone();
    let thread: ResumeHandler = Arc::new(move |message| {
        let log = log.clone();
        Box::pin(async move {
            log.lock()
                .unwrap()
                .push(json!({"name":"thread","message":message,"options":{"undefined":true}}));
            Ok(json!({"status":"queued"}))
        })
    });
    let mut releases = std::collections::HashMap::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let kind = if step["kind"] == "chat" {
            ResumeKind::Chat
        } else {
            ResumeKind::Thread
        };
        let result = match step["op"].as_str().unwrap() {
            "register" => {
                let sub = if kind == ResumeKind::Chat {
                    registry.register_chat_session("same", chat.clone())
                } else {
                    registry.register(kind, "same", thread.clone())
                };
                releases.insert(step["alias"].as_str().unwrap(), sub);
                Value::Null
            }
            "release" => {
                releases[step["alias"].as_str().unwrap()].unsubscribe();
                Value::Null
            }
            "resume" if kind == ResumeKind::Chat => {
                registry
                    .resume_chat_session(
                        "same",
                        step["message"].as_str().unwrap(),
                        step.get("options").map(|v| {
                            serde_json::from_value::<ChatResumeOptions>(v.clone()).unwrap()
                        }),
                    )
                    .await
            }
            "resume" => {
                registry
                    .resume(kind, "same", step["message"].as_str().unwrap())
                    .await
            }
            _ => unreachable!(),
        };
        results.push(result);
    }
    assert_eq!(
        json!({"results":results,"events":*events.lock().unwrap()}),
        expected
    );
}
