#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        auth::AuthState,
        hooks::{HookCallback, HookEmission, HookRoutes},
        user_questions::UserQuestionRoutes,
    },
    security::http_auth::{self, AuthUser},
    services::input_requests::{QuestionInput, UserQuestionService},
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/question-http")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn normalize(value: &mut Value, labels: &HashMap<String, String>) {
    match value {
        Value::Array(a) => {
            for v in a {
                normalize(v, labels)
            }
        }
        Value::Object(m) => {
            for (k, v) in m {
                if k == "createdAt" || k == "timestamp" {
                    *v = json!("<time>")
                } else {
                    normalize(v, labels)
                }
            }
        }
        Value::String(s) => {
            if let Some(label) = labels.get(s) {
                *s = format!("<request:{label}>")
            }
        }
        _ => {}
    }
}
async fn scenario(call: Value) -> Value {
    let expected = reference(call.clone());
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old'),('other','bob','fixture','old','old');").unwrap();
    if let Some(seed) = call["seed"].as_str() {
        db.execute_batch(seed).unwrap();
    }
    let auth = AuthState::new(db, "question-http-secret".into()).unwrap();
    let events = Arc::new(Mutex::new(vec![]));
    let resolved = events.clone();
    let questions = UserQuestionService::new(
        jait_gateway::time::default_clock(),
        None,
        Some(Arc::new(move |r| {
            resolved
                .lock()
                .unwrap()
                .push(json!({"kind":"resolved","request":r}))
        })),
    );
    let hook_events = events.clone();
    let def = call.clone();
    let emit: HookEmission = Arc::new(move |event, payload| {
        hook_events.lock().unwrap().push(json!({"kind":"hook","event":{"type":event,"payload":payload.clone(),"timestamp":"<time>"}}));
        if def["hookMutation"] == true && payload.is_object() {
            payload["fromHook"] = json!(true);
        }
        if def["hookError"] == true {
            Err("fixture hook failure".into())
        } else {
            Ok(())
        }
    });
    let callback = |wake: bool| -> HookCallback {
        let events = events.clone();
        let def = call.clone();
        Arc::new(move |payload| {
            let events = events.clone();
            let def = def.clone();
            Box::pin(async move {
                events.lock().unwrap().push(if wake {
                    json!({"kind":"wake"})
                } else {
                    json!({"kind":"agent","payload":payload})
                });
                if def["callbackError"] == true {
                    Err("fixture callback failure".into())
                } else {
                    Ok(def.get("result").cloned())
                }
            })
        })
    };
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_user_questions(UserQuestionRoutes {
        auth: auth.clone(),
        questions: questions.clone(),
    })
    .with_hooks(HookRoutes {
        auth: auth.clone(),
        hook_secret: call["secret"].as_str().unwrap_or("hook-fixture").into(),
        emit,
        on_wake: callback(true),
        on_agent: callback(false),
    });
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap();
    let mut results = vec![];
    let mut ids = HashMap::new();
    let mut labels = HashMap::new();
    let mut handles = vec![];
    for step in call["steps"].as_array().unwrap() {
        if let Some(input) = step.get("ask") {
            let input: QuestionInput = serde_json::from_value(input.clone()).unwrap();
            let session = input.session_id.clone();
            let handle = questions.ask(input);
            ids.insert(session.clone(), handle.id.clone());
            labels.insert(handle.id.clone(), session.clone());
            handles.push((session, handle.result));
            results.push(Value::Null);
            continue;
        }
        let mut path = step["path"].as_str().unwrap().to_string();
        for (label, id) in &ids {
            path = path.replace(&format!("${label}"), id);
        }
        let mut request = client
            .request(
                step["method"].as_str().unwrap().parse().unwrap(),
                format!("{base}{path}"),
            )
            .header("host", "fixture.local")
            .header("connection", "close");
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        for (field, cookie) in [("user", false), ("cookie", true)] {
            if let Some(user) = step[field].as_str() {
                let token = http_auth::sign_auth_token(
                    &AuthUser {
                        id: user.into(),
                        username: if user == "owner" { "alice" } else { "bob" }.into(),
                    },
                    "question-http-secret",
                )
                .unwrap();
                request = if cookie {
                    request.header("cookie", format!("jait_token={token}"))
                } else {
                    request.bearer_auth(token)
                };
            }
        }
        if let Some(raw) = step["raw"].as_str() {
            request = request.body(raw.to_string());
        } else if let Some(body) = step.get("body") {
            request = request.json(body);
        }
        let res = request.send().await.unwrap();
        let status = res.status().as_u16();
        let raw = res.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    let mut answers = serde_json::Map::new();
    for (label, mut result) in handles {
        if let Ok(answer) = result.try_recv() {
            answers.insert(label, json!(answer));
        }
    }
    let mut actual = json!({"results":results,"events":*events.lock().unwrap(),"answers":answers,"pending":questions.list_pending(None,None)});
    normalize(&mut actual, &labels);
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    auth.shutdown().await.unwrap();
    assert_eq!(actual, expected);
    actual
}
#[tokio::test]
async fn question_requests_enforce_owners_cookie_auth_session_filters_and_resolution() {
    scenario(json!({"op":"nativequestionhttp.routes","steps":[
  {"ask":{"sessionId":"a","userId":"owner","questions":[]}},{"ask":{"sessionId":"b","userId":"other","questions":[]}},{"ask":{"sessionId":"open","questions":[]}},
  {"method":"GET","path":"/api/user-questions/requests"},
  {"method":"GET","path":"/api/user-questions/requests","user":"owner"},
  {"method":"GET","path":"/api/user-questions/requests?sessionId=b","user":"owner"},
  {"method":"GET","path":"/api/user-questions/requests?sessionId=a&sessionId=b","user":"owner"},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"other","body":{"answers":{}}},
  {"method":"POST","path":"/api/user-questions/requests/$a/cancel","user":"other"},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","cookie":"owner","body":{"answers":{"q":{"selected":["a",2,null,"b"],"freeText":"  answer 😀  ","skipped":true},"blank":{"freeText":" \u{feff}"},"primitive":7,"array":[],"__proto__":{"selected":["hidden"]}}}},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","cookie":"owner","body":{"answers":{"q":{"selected":["a",2,null,"b"],"freeText":"  answer 😀  ","skipped":true},"blank":{"freeText":" \u{feff}"},"primitive":7,"array":[]}}},
  {"method":"POST","path":"/api/user-questions/requests/$a/cancel","user":"owner"},
  {"method":"POST","path":"/api/user-questions/requests/$open/cancel","user":"other"},
  {"method":"GET","path":"/api/user-questions/requests?sessionId=b","cookie":"other"},
  {"method":"GET","path":"/api/user-questions/requests","user":"missing"}
 ]})).await;
}
#[tokio::test]
async fn questions_validate_answer_objects_and_preserve_array_entries() {
    scenario(json!({"op":"nativequestionhttp.routes","steps":[{"ask":{"sessionId":"a","userId":"owner","questions":[]}},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{}},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":null}},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":"text"}},
  {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":[{},null,{},3]}},
  {"method":"POST","path":"/api/user-questions/requests/missing/submit","user":"owner","body":{"answers":[]}}
 ]})).await;
}
#[tokio::test]
async fn question_routes_reject_cross_origin_cookie_and_invalid_tokens() {
    scenario(json!({"op":"nativequestionhttp.routes","steps":[
  {"method":"GET","path":"/api/user-questions/requests","cookie":"owner","headers":{"origin":"https://foreign.invalid"}},
  {"method":"GET","path":"/api/user-questions/requests","user":"owner","headers":{"origin":"https://foreign.invalid"}},
  {"method":"GET","path":"/api/user-questions/requests","headers":{"authorization":"Bearer invalid"}}
 ]})).await;
}
#[tokio::test]
async fn hooks_require_exact_secret_and_preserve_event_callback_order_and_shared_payload() {
    scenario(json!({"op":"nativequestionhttp.routes","hookMutation":true,"result":{"done":true},"steps":[
  {"method":"POST","path":"/hooks/wake"},
  {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"wrong"},"body":{"task":"ignored"}},
  {"method":"POST","path":"/hooks/wake","headers":{"x-hook-token":"hook-fixture"}},
  {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture"},"body":{"task":"fixture"}},
  {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture"},"body":null},
  {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture"},"body":"text"}
 ]})).await;
}
#[tokio::test]
async fn hooks_propagate_failures_and_preserve_null_or_omitted_result() {
    for extra in [
        json!({"hookError":true}),
        json!({"callbackError":true}),
        json!({"result":null}),
        json!({}),
    ] {
        let mut call = json!({"op":"nativequestionhttp.routes","steps":[{"method":"POST","path":"/hooks/wake","headers":{"x-hook-token":"hook-fixture"}},{"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture"},"body":false}]});
        for (k, v) in extra.as_object().unwrap() {
            call[k] = v.clone();
        }
        scenario(call).await;
    }
}

#[tokio::test]
async fn http_parser_rejects_nested_prototype_keys_and_preserves_safe_constructor_data() {
    scenario(json!({"op":"nativequestionhttp.routes","steps":[
        {"ask":{"sessionId":"a","userId":"owner","questions":[]}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":{"constructor":{"prototype":null}}}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":{"q":{"constructor":{"prototype":{}}}}}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","raw":"{bad","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","raw":"","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","raw":"{bad","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/api/user-questions/requests/$a/submit","user":"owner","body":{"answers":{"constructor":{"selected":["retained"]}}}}
    ]})).await;
}
#[tokio::test]
async fn hooks_enforce_origin_and_parse_before_secret_validation() {
    scenario(json!({"op":"nativequestionhttp.routes","steps":[
        {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture","origin":"https://foreign.invalid"},"body":{}},
        {"method":"POST","path":"/hooks/agent","raw":"{bad","headers":{"content-type":"application/json"}},
        {"method":"POST","path":"/hooks/agent","headers":{"x-hook-token":"hook-fixture"},"body":[1,2]},
        {"method":"POST","path":"/hooks/agent","raw":"\u{feff}{}","headers":{"content-type":"application/json","x-hook-token":"hook-fixture"}}
    ]})).await;
}

#[tokio::test]
async fn answered_card_choices_survive_authenticated_http_submission() {
    let answers = json!({"target":{"selected":["Homelab","Local"],"freeText":"Only the lab 🦀","skipped":false},"later":{"selected":[],"freeText":null,"skipped":true}});
    let result = scenario(json!({"op":"nativequestionhttp.routes","steps":[
        {"ask":{"sessionId":"card","userId":"owner","questions":[{"id":"target","header":"Target","question":"Where should it run?"},{"id":"later","header":"Later","question":"Anything else?"}]}},
        {"method":"POST","path":"/api/user-questions/requests/$card/submit","user":"other","body":{"answers":answers}},
        {"method":"POST","path":"/api/user-questions/requests/$card/submit","user":"owner","body":{"answers":answers}},
        {"method":"GET","path":"/api/user-questions/requests?sessionId=card","user":"owner"}
    ]})).await;
    assert_eq!(result["answers"]["card"]["answers"], answers);
    assert_eq!(result["pending"], json!([]));
}
