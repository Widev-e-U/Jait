#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{services::thread_title::*, tools::core_io::HostError};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::mpsc;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(cases: &[Value]) -> Value {
    internal_driver::call(
        &root(),
        &root().join(".jait/artifacts/gateway-rust/thread-title/contracts"),
        json!({"version":1,"calls":[{"op":"nativetitle.compare","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn failure(test: &Value, key: &str) -> Result<(), HostError> {
    if let Some(v) = test.get(key) {
        return Err(HostError::Error(v.as_str().unwrap().into()));
    }
    if let Some(v) = test.get(format!("{key}Thrown")) {
        return Err(HostError::Thrown(v.clone()));
    }
    Ok(())
}
struct Provider {
    test: Value,
    events: Arc<Mutex<Vec<Value>>>,
    sender: Mutex<Option<mpsc::UnboundedSender<Value>>>,
}
impl TitleProvider for Provider {
    fn subscribe(&self) -> Result<TitleSubscription, HostError> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"name":"subscribe"}));
        failure(&self.test, "subscribeError")?;
        let (sender, events) = mpsc::unbounded_channel();
        *self.sender.lock().unwrap() = Some(sender);
        let log = self.events.clone();
        Ok(TitleSubscription {
            events,
            unsubscribe: Some(Box::new(move || {
                log.lock().unwrap().push(json!({"name":"unsubscribe"}))
            })),
        })
    }
    fn send_turn(&self, session: &str, prompt: &str) -> BoxFuture<'static, Result<(), HostError>> {
        self.events
            .lock()
            .unwrap()
            .push(json!({"name":"send","session":session,"prompt":prompt}));
        for event in self.test["events"].as_array().into_iter().flatten() {
            self.sender
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .send(event.clone())
                .unwrap();
        }
        let test = self.test.clone();
        let sender = self.sender.lock().unwrap().clone().unwrap();
        Box::pin(async move {
            if let Some(events) = test["delayedEvents"].as_array() {
                tokio::task::yield_now().await;
                for event in events {
                    let _ = sender.send(event.clone());
                }
            }
            failure(&test, "sendError")?;
            if test["pending"] == true {
                std::future::pending::<()>().await;
            }
            Ok(())
        })
    }
}
async fn native(test: &Value) -> Value {
    let events = Arc::new(Mutex::new(Vec::new()));
    let result = if test["turn"] == true {
        let provider = Provider {
            test: test.clone(),
            events: events.clone(),
            sender: Mutex::new(None),
        };
        generate_title_via_turn(
            &provider,
            test["session"].as_str().unwrap_or("s"),
            test["task"].as_str().unwrap_or(" task "),
        )
        .await
        .map(|s| json!(s.encode_utf16().collect::<Vec<_>>()))
        .map_err(TitleError::Host)
    } else {
        let options = test["options"].clone();
        let test = test.clone();
        let log = events.clone();
        let port: TitleApiPort = Arc::new(move |operation| {
            let (event, key, value) = match operation {
                TitleApiOperation::ResolveLlm(input) => (
                    json!({"name":"resolve","args":[input]}),
                    "resolveError",
                    test["resolved"].clone(),
                ),
                TitleApiOperation::CompleteLlm {
                    config,
                    messages,
                    options,
                } => (
                    json!({"name":"complete","args":[config,messages,options]}),
                    "completeError",
                    test["raw"].clone(),
                ),
                TitleApiOperation::Fetch { url, headers, body } => (
                    json!({"name":"fetch","url":url,"method":"POST","headers":headers,"body":body}),
                    "fetchError",
                    json!({"status":test["status"],"body":test["body"]}),
                ),
            };
            log.lock().unwrap().push(event);
            let mut result = failure(&test, key).map(|()| value);
            if key == "fetchError"
                && test["status"]
                    .as_u64()
                    .is_some_and(|v| (200..300).contains(&v))
            {
                result = result.and_then(|v| failure(&test, "jsonError").map(|()| v));
            }
            Box::pin(async move { result })
        });
        generate_title_via_api(&options, &port)
            .await
            .map(|s| json!(s.0))
    };
    let events = events.lock().unwrap().clone();
    match result {
        Ok(result) => json!({"ok":true,"result":result,"events":events}),
        Err(error) => {
            json!({"ok":false,"error":match error {TitleError::Host(HostError::Error(message))=>json!({"kind":"Error","name":"Error","message":message}),TitleError::TypeError(message)=>json!({"kind":"Error","name":"TypeError","message":message}),TitleError::Host(HostError::Thrown(value))=>json!({"kind":"Thrown","value":value})},"events":events})
        }
    }
}
async fn compare(cases: Vec<Value>) {
    let expected = reference(&cases);
    for (index, test) in cases.iter().enumerate() {
        assert_eq!(native(test).await, expected[index], "case {index}: {test}");
    }
}
fn options() -> Value {
    json!({"task":" \u{feff}Investigate an issue\u{a0}","config":{"llmProvider":"ollama","openaiApiKey":"config-key","openaiBaseUrl":"https://fixture.invalid/v1///","openaiModel":"config-model","ollamaUrl":"http://fixture.invalid:11434///","ollamaModel":"local-model"}})
}
fn api(openai: bool, body: Value) -> Value {
    let mut options = options();
    if openai {
        options["config"]["llmProvider"] = json!("openai");
    }
    json!({"options":options,"status":200,"body":body})
}
#[tokio::test(start_paused = true)]
async fn provider_sessions_streaming_replacement_errors_and_timeout_match_reference() {
    compare(vec![
  json!({"turn":true,"events":[{"type":"token","sessionId":"other","content":"ignored"},{"type":"token","sessionId":"s","content":" Streamed "},{"type":"message","sessionId":"s","role":"user","content":"ignored"},{"type":"token","sessionId":"s","content":"title "},{"type":"turn.completed","sessionId":"s"}]}),
  json!({"turn":true,"session":"x","task":" \u{feff}custom\u{a0}","events":[{"type":"token","sessionId":"x","content":"partial"},{"type":"message","sessionId":"x","role":"assistant","content":"Full title"},{"type":"token","sessionId":"x","content":" appended"},{"type":"session.completed","sessionId":"x"}]}),
  json!({"turn":true,"events":[{"type":"session.error","sessionId":"s","error":"provider failed"}]}),
  json!({"turn":true,"subscribeError":"subscribe failed"}),
  json!({"turn":true,"subscribeErrorThrown":{"opaque":true}}),
  json!({"turn":true,"delayedEvents":[{"type":"token","sessionId":"s","content":"async tokens"},{"type":"turn.completed","sessionId":"s"}]}),
  json!({"turn":true,"delayedEvents":[{"type":"session.error","sessionId":"s","error":"async failure"}]}),
  json!({"turn":true,"sendError":"send failed"}),
  json!({"turn":true,"sendErrorThrown":{"fixture":true}}),
  json!({"turn":true,"pending":true}),
  json!({"turn":true}),
  json!({"turn":true,"events":[{"type":"turn.completed","sessionId":"other"}]}),
  json!({"turn":true,"sendError":"later error","events":[{"type":"turn.completed","sessionId":"s"}]}),
  json!({"turn":true,"sendError":"late asynchronous error","delayedEvents":[{"type":"token","sessionId":"s","content":"completed first"},{"type":"turn.completed","sessionId":"s"}]}),
  json!({"turn":true,"sendError":"late asynchronous error","delayedEvents":[{"type":"session.error","sessionId":"s","error":"event failed first"}]}),
  json!({"turn":true,"pending":true,"events":[{"type":"session.completed","sessionId":"s"}]}),
  json!({"turn":true,"events":[{"type":"token","content":"no session"},{"type":"turn.completed","sessionId":"s"}]}),
 ]).await;
    assert_eq!(TITLE_TURN_TIMEOUT, std::time::Duration::from_secs(30));
}
#[tokio::test]
async fn openai_and_ollama_requests_content_and_normalization_match_reference() {
    let bodies = [
        json!({"choices":[{"message":{"content":"Title: Fix the gateway."}}]}),
        json!({"choices":[{"message":{"content":[{"type":"text","text":"  Fix "},null,{"type":"image","text":"ignored"},{"type":"text"},{"type":"text","text":"issue.  "}]}}]}),
        json!({"choices":[]}),
        json!({"choices":[{"message":{"content":"<tool_call>bad"}}]}),
        json!({"choices":[{"message":{"content":" "}}]}),
        json!({"choices":[{"message":{"content":[]}}]}),
    ];
    let mut cases = bodies.into_iter().map(|v| api(true, v)).collect::<Vec<_>>();
    for body in [
        json!({"message":{"content":" Title: Fix the issue. "}}),
        json!({}),
        json!({"message":{"content":""}}),
        json!({"message":{"content":" \n "}}),
        json!({"message":{"content":"<tool_calls>bad"}}),
    ] {
        cases.push(api(false, body));
    }
    for openai in [false, true] {
        for status in [201, 204, 299, 300, 401, 429, 500] {
            let mut test = api(
                openai,
                if openai {
                    json!({"choices":[{"message":{"content":"Valid title"}}]})
                } else {
                    json!({"message":{"content":"Valid title"}})
                },
            );
            test["status"] = json!(status);
            cases.push(test);
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn credential_model_url_precedence_and_dependency_failures_match_reference() {
    let base = api(true, json!({"choices":[{"message":{"content":"A title"}}]}));
    let mut cases = vec![];
    for keys in [
        json!({}),
        json!({"OPENAI_API_KEY":" override ","OPENAI_BASE_URL":" https://fixture.invalid/override/// ","OPENAI_MODEL":" key-model "}),
        json!({"OPENAI_API_KEY":" \u{feff} ","OPENAI_MODEL":" "}),
    ] {
        for model in [None, Some(""), Some(" explicit model ")] {
            let mut test = base.clone();
            test["options"]["apiKeys"] = keys.clone();
            if let Some(model) = model {
                test["options"]["model"] = json!(model);
            }
            cases.push(test);
        }
    }
    for config_key in ["", " "] {
        let mut test = base.clone();
        test["options"]["config"]["openaiApiKey"] = json!(config_key);
        cases.push(test);
    }
    let mut test = api(
        false,
        json!({"choices":[{"message":{"content":"API key selects OpenAI"}}]}),
    );
    test["options"]["apiKeys"] = json!({"OPENAI_API_KEY":"forces-openai"});
    cases.push(test);
    for field in [
        "fetchError",
        "fetchErrorThrown",
        "jsonError",
        "jsonErrorThrown",
    ] {
        let mut test = base.clone();
        test[field] = if field.ends_with("Thrown") {
            json!({"opaque":true})
        } else {
            json!("fixture failure")
        };
        cases.push(test);
    }
    compare(cases).await;
}
#[tokio::test]
async fn shared_llm_configuration_forwarding_budget_and_errors_match_reference() {
    let mut base = json!({"options":options(),"resolved":{"backend":"glm","openaiApiKey":"fixture-key","openaiModel":"resolved-model"},"raw":"Title: Backend task."});
    base["options"]["jaitBackend"] = json!("glm");
    let mut cases = vec![base.clone()];
    for model in [json!(""), json!("requested-model"), Value::Null] {
        let mut test = base.clone();
        test["options"]["model"] = model;
        test["options"]["apiKeys"] = json!({"GLM_API_KEY":"fixture"});
        cases.push(test);
    }
    for key in [Value::Null, json!(""), json!(" ")] {
        let mut test = base.clone();
        test["resolved"]["openaiApiKey"] = key;
        cases.push(test);
    }
    for raw in ["", "<tool_call>", "**odd task**", "1. Fix backend:"] {
        let mut test = base.clone();
        test["raw"] = json!(raw);
        cases.push(test);
    }
    for field in [
        "resolveError",
        "resolveErrorThrown",
        "completeError",
        "completeErrorThrown",
    ] {
        let mut test = base.clone();
        test[field] = if field.ends_with("Thrown") {
            json!(["opaque"])
        } else {
            json!("dependency failed")
        };
        cases.push(test);
    }
    compare(cases).await;
}
#[tokio::test(start_paused = true)]
async fn caller_drop_unregisters_provider_and_exact_timeout_is_enforced() {
    let provider = Provider {
        test: json!({"pending":true}),
        events: Arc::new(Mutex::new(vec![])),
        sender: Mutex::new(None),
    };
    let mut task = Box::pin(generate_title_via_turn(&provider, "owned", "task"));
    assert!(futures_util::poll!(&mut task).is_pending());
    tokio::time::advance(std::time::Duration::from_millis(29_999)).await;
    assert!(futures_util::poll!(&mut task).is_pending());
    tokio::time::advance(std::time::Duration::from_millis(1)).await;
    assert_eq!(
        futures_util::poll!(&mut task),
        std::task::Poll::Ready(Err(HostError::Error("Title turn timed out".into())))
    );
    assert_eq!(
        provider
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|v| v["name"] == "unsubscribe")
            .count(),
        1
    );
    let mut task = Box::pin(generate_title_via_turn(&provider, "owned", "task"));
    assert!(futures_util::poll!(&mut task).is_pending());
    drop(task);
    assert_eq!(
        provider
            .events
            .lock()
            .unwrap()
            .iter()
            .filter(|v| v["name"] == "unsubscribe")
            .count(),
        2
    );
}

#[tokio::test]
async fn malformed_provider_response_shapes_match_reference() {
    let mut cases = vec![];
    for openai in [false, true] {
        for body in [
            Value::Null,
            json!(42),
            json!({"choices": {"0": {"message": {"content": "Object choices"}}}}),
            json!({"message": {"content": false}}),
            json!({"message": {"content": ["array"]}}),
        ] {
            cases.push(api(openai, body));
        }
    }
    cases.push(api(true, json!({"choices":[{"message":{"content":[{"type":"text","text":42},{"type":"text","text":true},{"type":"text","text":["array",null,"tail"]},{"type":"text","text":{}},{"type":"text","text":null}]}}]})));
    compare(cases).await;
}

#[tokio::test]
async fn api_normalization_unicode_protocol_and_truncation_match_reference() {
    let mut raw = vec![
        "\r\n  Title: 1) `Fix gateway routing...`\nignored".to_owned(),
        "\u{feff}•  '  Fix\t gateway\u{a0}routing  ' ".to_owned(),
        "TITLE : \"Quoted task\";–".to_owned(),
        "<tool_call>ignored".to_owned(),
        "</FUNCTION_CALLS|ignored".to_owned(),
        "<|tool_use />ignored".to_owned(),
        "[tool_calls]ignored".to_owned(),
        "<tool_calligraphy>allowed".to_owned(),
        "\n\n\u{200b}visible\n".to_owned(),
        "-  ... – ;".to_owned(),
        "Title:".to_owned(),
        "\u{feff} \t\r\n".to_owned(),
    ];
    raw.push("😀".repeat(41));
    raw.push(format!("{}😀 trailing", "a".repeat(79)));
    raw.push(format!("{} {}", "a".repeat(24), "b".repeat(80)));
    raw.push(format!("{} {}", "a".repeat(23), "b".repeat(80)));
    raw.push("task ".repeat(30));
    compare(
        raw.into_iter()
            .map(|text| api(true, json!({"choices":[{"message":{"content":text}}]})))
            .collect(),
    )
    .await;
}
