//! State-machine contracts against production System One exports, with controlled I/O.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    services::system_one::{
        Cancellation, DecisionHttpResponse, DecisionRequest, DecisionTransport, SYSTEM_ONE_PROMPT,
        SystemOne, resolve_system_one, system_one_enabled,
    },
    tools::decision,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    future::Future,
    path::PathBuf,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, AtomicUsize, Ordering},
    },
};
struct Transport {
    replies: Vec<Value>,
    next: AtomicUsize,
    requests: Mutex<Vec<Value>>,
    signal: Mutex<Option<Cancellation>>,
}
impl DecisionTransport for Transport {
    fn send<'a>(
        &'a self,
        request: DecisionRequest,
    ) -> Pin<Box<dyn Future<Output = Result<DecisionHttpResponse, String>> + Send + 'a>> {
        self.requests
            .lock()
            .unwrap()
            .push(serde_json::to_value(request).unwrap());
        let reply = self
            .replies
            .get(self.next.fetch_add(1, Ordering::SeqCst))
            .cloned()
            .unwrap_or_else(|| json!({"status":503}));
        let signal = self.signal.lock().unwrap().clone();
        Box::pin(async move {
            if reply["abort"] == true {
                if let Some(signal) = signal {
                    signal.abort("cancelled-fixture");
                }
                return Err("cancelled-fixture".into());
            }
            if let Some(error) = reply["error"].as_str() {
                return Err(error.into());
            }
            if reply["timeout"] == true {
                return std::future::pending().await;
            }
            Ok(DecisionHttpResponse {
                status: reply["status"].as_u64().unwrap_or(200) as u16,
                body: match reply["jsonError"].as_str() {
                    Some(error) => Err(error.into()),
                    None => Ok(reply.get("body").cloned().unwrap_or(Value::Null)),
                },
            })
        })
    }
}
fn keys(value: Option<&Value>) -> Option<HashMap<String, String>> {
    value
        .filter(|v| !v.is_null())
        .map(|v| serde_json::from_value(v.clone()).unwrap())
}
fn reference(calls: Vec<Value>) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/system-one"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
// Compare JSON Number values after the coercion used by the JS input transport.
// Request body strings and tool JSON strings remain byte-exact.
fn numbers(value: Value) -> Value {
    match value {
        Value::Number(v) => json!(v.as_f64().unwrap()),
        Value::Array(v) => Value::Array(v.into_iter().map(numbers).collect()),
        Value::Object(v) => Value::Object(v.into_iter().map(|(k, v)| (k, numbers(v))).collect()),
        other => other,
    }
}
async fn trace(frame: Value) {
    let expected = reference(vec![frame.clone()]);
    let transport = Arc::new(Transport {
        replies: frame["responses"].as_array().cloned().unwrap_or_default(),
        next: AtomicUsize::new(0),
        requests: Mutex::new(vec![]),
        signal: Mutex::new(None),
    });
    let clock = Arc::new(AtomicI64::new(frame["now"].as_i64().unwrap_or(1_000_000)));
    let now = clock.clone();
    let engine = SystemOne::with_clock(
        transport.clone(),
        Arc::new(move || now.load(Ordering::SeqCst)),
    );
    let mut results = Vec::new();
    for action in frame["actions"].as_array().unwrap() {
        if action["op"] == "clock" {
            clock.store(action["now"].as_i64().unwrap(), Ordering::SeqCst);
            results.push(Value::Null);
            continue;
        }
        let signal =
            (action["aborted"] == true || action["signal"] == true).then(Cancellation::default);
        if action["aborted"] == true {
            signal.as_ref().unwrap().abort("cancelled-fixture");
        }
        *transport.signal.lock().unwrap() = signal.clone();
        let keys = keys(
            action
                .get("keys")
                .filter(|v| !v.is_null())
                .or_else(|| frame.get("keys")),
        );
        let result = match action["op"].as_str().unwrap() {
            "eval" => engine
                .evaluate(
                    keys.as_ref(),
                    action["state"].as_str().unwrap(),
                    &action["questions"],
                    signal.as_ref(),
                )
                .await
                .map(|value| json!({"ok":true,"value":value})),
            "tool" => Ok(
                json!({"ok":true,"value":decision::evaluate(&action["input"],keys.as_ref(),signal.as_ref(),&engine).await}),
            ),
            "rank" => {
                let described = Mutex::new(Vec::new());
                let scores = Mutex::new(Vec::new());
                let ranked = engine
                    .rank(
                        keys.as_ref(),
                        action["query"].as_str().unwrap(),
                        action["items"].as_array().unwrap(),
                        |item| {
                            let mut items = described.lock().unwrap();
                            items.push(item.clone());
                            if action["describeThrowAt"].as_u64() == Some(items.len() as u64) {
                                return Err("describe failed".into());
                            }
                            Ok(item.as_str().map(str::to_owned).unwrap_or_else(|| {
                                item.get("description")
                                    .or_else(|| item.get("id"))
                                    .and_then(Value::as_str)
                                    .unwrap_or("item")
                                    .into()
                            }))
                        },
                        action["purpose"].as_str().unwrap_or("candidate"),
                        signal.as_ref(),
                        |item, score| {
                            if action["onScore"] == false {
                                return Ok(());
                            }
                            let mut values = scores.lock().unwrap();
                            values.push(json!({"item":item,"score":score}));
                            if action["scoreThrowAt"].as_u64() == Some(values.len() as u64) {
                                return Err("onScore failed".into());
                            }
                            Ok(())
                        },
                        action["minimum"].as_f64(),
                    )
                    .await;
                Ok(match ranked {
                    Ok(value) => {
                        json!({"ok":true,"value":value,"scores":*scores.lock().unwrap(),"described":*described.lock().unwrap()})
                    }
                    Err(message) => {
                        json!({"ok":false,"message":message,"scores":*scores.lock().unwrap(),"described":*described.lock().unwrap()})
                    }
                })
            }
            _ => panic!("unknown fixture action"),
        };
        // Mirrors tools/decision.rs: the message table carries no suffix and the
        // HTTP status is appended exactly once, only for upstream failures.
        results.push(result.unwrap_or_else(|error| {
            let base = error.message();
            let message = match (error.code, error.status) {
                ("upstream_http", Some(status)) => format!("{base} (HTTP {status})"),
                _ => base,
            };
            json!({"ok":false,"message":message})
        }));
    }
    let actual = json!({"results":results,"requests":*transport.requests.lock().unwrap()});
    assert_eq!(
        numbers(actual),
        numbers(expected[0].clone()),
        "frame={frame}"
    );
}
fn question() -> Value {
    json!({"q":{"type":"noul","instructions":"Is this relevant?"}})
}
fn eval(state: &str) -> Value {
    json!({"op":"eval","state":state,"questions":question()})
}
fn reply(probability: f64) -> Value {
    json!({"body":{"model":"jev-latest","answers":{"q":{"type":"noul","noul":probability}}}})
}
fn frame(actions: Vec<Value>, responses: Vec<Value>) -> Value {
    json!({"op":"nativesystemone.trace","keys":{"JEV_API_KEY":"test-account"},"actions":actions,"responses":responses})
}
fn rank(items: Value) -> Value {
    json!({"op":"rank","items":items,"query":"user request","purpose":"memory"})
}
fn rank_reply(scores: &[f64]) -> Value {
    json!({"body":{"model":"jev-latest","answers":scores.iter().enumerate().map(|(i,score)|(format!("item{i}"),json!({"type":"noul","noul":score}))).collect::<serde_json::Map<_,_>>()}})
}
#[test]
fn resolves_generic_and_legacy_config_with_parseint_precedence_and_caps() {
    let mut cases = vec![
        Value::Null,
        json!({}),
        json!({"JEV_API_KEY":" \u{feff} "}),
        json!({"JEV_API_KEY":" legacy ","JEV_MODEL":" model "}),
        json!({"JEV_API_KEY":"legacy","SYSTEM_ONE_API_KEY":" generic ","SYSTEM_ONE_MODEL":" chosen "}),
        json!({"SYSTEM_ONE_BASE_URL":" http://localhost:11434/v1/ "}),
        json!({"SYSTEM_ONE_BASE_URL":" \u{feff}","SYSTEM_ONE_API_KEY":"key"}),
    ];
    for timeout in [
        "1",
        "  +25ms ",
        "1e3",
        "0x20",
        "-1",
        "0",
        "1.9",
        "120001",
        "999999999999999999999999999999999999999999999999999999",
        "Infinity",
        "not a number",
        "\u{feff}123",
    ] {
        cases.push(json!({"JEV_API_KEY":"key","SYSTEM_ONE_TIMEOUT_MS":timeout}));
        cases.push(
            json!({"SYSTEM_ONE_BASE_URL":"http://local.invalid","SYSTEM_ONE_TIMEOUT_MS":timeout}),
        );
    }
    let actual:Vec<_>=cases.iter().map(|v|{let k=keys(Some(v));json!({"endpoint":resolve_system_one(k.as_ref()),"enabled":system_one_enabled(k.as_ref())})}).collect();
    assert_eq!(
        json!(actual),
        reference(
            cases
                .into_iter()
                .map(|keys| json!({"op":"nativesystemone.resolve","keys":keys}))
                .collect()
        )
    );
}
#[test]
fn tool_metadata_and_system_prompt_match_source() {
    let expected = reference(vec![json!({"op":"nativesystemone.metadata"})]);
    assert_eq!(
        json!({"metadata":decision::metadata(),"prompt":SYSTEM_ONE_PROMPT}),
        expected[0]
    );
}
#[tokio::test(start_paused = true)]
async fn account_origin_and_model_isolate_cache_entries() {
    let mut actions = vec![eval("same"), eval("same")];
    let mut different = eval("same");
    different["keys"] = json!({"JEV_API_KEY":"other-account"});
    actions.push(different);
    let mut model = eval("same");
    model["keys"] = json!({"JEV_API_KEY":"test-account","JEV_MODEL":"other-model"});
    actions.push(model);
    trace(frame(actions, vec![reply(0.1), reply(0.2), reply(0.3)])).await;
    let mut a = eval("same");
    a["keys"] =
        json!({"SYSTEM_ONE_API_KEY":"same-key","SYSTEM_ONE_BASE_URL":"https://one.invalid/v1"});
    let mut b = a.clone();
    b["keys"]["SYSTEM_ONE_BASE_URL"] = json!("https://two.invalid/v1");
    let generic = json!({"body":{"choices":[{"message":{"content":{"answers":{"q":{"type":"noul","noul":0.9}}}}}]}});
    trace(frame(vec![a.clone(), a, b], vec![generic.clone(), generic])).await;
}
#[tokio::test(start_paused = true)]
async fn ttl_and_backoff_expire_at_the_exact_boundary() {
    trace(frame(
        vec![
            eval("cached"),
            json!({"op":"clock","now":1029999}),
            eval("cached"),
            json!({"op":"clock","now":1030000}),
            eval("cached"),
        ],
        vec![reply(0.1), reply(0.9)],
    ))
    .await;
    trace(frame(
        vec![
            eval("failed"),
            eval("other"),
            json!({"op":"clock","now":1014999}),
            eval("other"),
            json!({"op":"clock","now":1015000}),
            eval("other"),
        ],
        vec![json!({"status":503}), reply(0.9)],
    ))
    .await;
}
#[tokio::test(start_paused = true)]
async fn caller_abort_does_not_poison_the_tenant_failure_cache() {
    let mut aborted = eval("query");
    aborted["aborted"] = json!(true);
    let mut during = eval("query");
    during["signal"] = json!(true);
    trace(frame(
        vec![aborted, during, eval("query")],
        vec![json!({"abort":true}), reply(0.5)],
    ))
    .await;
    trace(frame(
        vec![eval("timeout"), eval("other")],
        vec![json!({"timeout":true})],
    ))
    .await;
}
#[tokio::test(start_paused = true)]
async fn generic_request_paths_optional_models_and_payload_forms_match() {
    for url in [
        "https://model.invalid/v1///",
        "https://model.invalid/v1/chat/completions",
        "https://model.invalid/v1/chat/completions///",
    ] {
        let mut f = frame(
            vec![eval("context")],
            vec![
                json!({"body":{"choices":[{"message":{"content":"{\"answers\":{\"q\":{\"type\":\"noul\",\"noul\":0.7}}}"}}]}}),
            ],
        );
        f["keys"] = json!({"SYSTEM_ONE_BASE_URL":url});
        trace(f).await;
    }
    let mut f = frame(
        vec![eval("context")],
        vec![
            json!({"body":{"choices":[{"message":{"content":{"q":{"type":"noul","noul":0.7}}}}]}}),
        ],
    );
    f["keys"] = json!({"SYSTEM_ONE_BASE_URL":"https://model.invalid","SYSTEM_ONE_MODEL":"fixture","SYSTEM_ONE_API_KEY":"auth-key"});
    trace(f).await;
}
#[tokio::test(start_paused = true)]
async fn validation_rejects_invalid_sizes_and_question_shapes_before_fetch() {
    let mut cases = vec![eval(""), eval(" \u{feff}"), eval(&"x".repeat(24001))];
    for questions in [
        json!({}),
        json!({"q":null}),
        json!({"q":{"type":"unknown","instructions":"x"}}),
        json!({"q":{"type":"noul","instructions":""}}),
        json!({"q":{"type":"noul","instructions":3}}),
        json!({"q":{"type":"noul","instructions":"x".repeat(2001)}}),
        json!({"q":{"type":"choice","instructions":"x","criteria":{"a":"one"}}}),
        json!({"q":{"type":"choice","instructions":"x","criteria":{"a":"one","b":false}}}),
        json!({"q":{"type":"score","instructions":"x","criteria":["one"]}}),
        json!({"q":{"type":"score","instructions":"x","criteria":{"a":"one","b":"two"}}}),
    ] {
        let mut action = eval("state");
        action["questions"] = questions;
        cases.push(action);
    }
    for action in cases {
        trace(frame(vec![action], vec![])).await;
    }
    let mut action = eval("state");
    action["questions"] = Value::Object(
        (0..49)
            .map(|i| (format!("q{i}"), json!({"type":"noul","instructions":"x"})))
            .collect(),
    );
    trace(frame(vec![action], vec![])).await;
    let mut f = frame(vec![eval("")], vec![]);
    f["keys"] = json!({});
    trace(f).await;
}
#[tokio::test(start_paused = true)]
async fn serialized_payload_limit_is_independent_of_question_count() {
    let mut action = eval(&"s".repeat(4200));
    action["questions"] = json!({"q":{"type":"choice","instructions":"pick","criteria":(0..30).map(|i|(format!("c{i}"),json!("a".repeat(2000)))).collect::<serde_json::Map<_,_>>()}});
    trace(frame(vec![action], vec![])).await;
}
#[tokio::test(start_paused = true)]
async fn answer_validation_preserves_fractional_scores_and_rejects_bad_probabilities() {
    let questions = json!({"route":{"type":"choice","instructions":"pick","criteria":{"a":"one","b":"two"}},"severity":{"type":"score","instructions":"rate","criteria":["low","medium","high"]},"urgent":{"type":"noul","instructions":"urgent"}});
    let answers = json!({"route":{"type":"choice","choice":"b","confidence":0.9},"severity":{"type":"score","score":1.2},"urgent":{"type":"noul","noul":0.8},"extra":{"type":"noul","noul":0.1}});
    let mut action = eval("context");
    action["questions"] = questions;
    trace(frame(
        vec![action.clone()],
        vec![json!({"body":{"model":"returned-model","answers":answers,"extraField":"retained"}})],
    ))
    .await;
    for (id, field, value) in [
        ("route", "choice", json!("invented")),
        ("route", "confidence", json!(null)),
        ("severity", "score", json!(3)),
        ("severity", "score", json!(-0.1)),
        ("severity", "score", json!("1")),
        ("urgent", "noul", json!(1.1)),
        ("urgent", "noul", json!(false)),
        ("urgent", "type", json!("choice")),
    ] {
        let mut invalid = answers.clone();
        invalid[id][field] = value;
        trace(frame(
            vec![action.clone()],
            vec![json!({"body":{"model":"model","answers":invalid}})],
        ))
        .await;
    }
}
#[tokio::test(start_paused = true)]
async fn numeric_ids_extra_question_fields_and_legacy_string_criteria_are_preserved() {
    let mut action = eval("context");
    action["questions"]=serde_json::from_str(r#"{"10":{"type":"choice","instructions":"choose","criteria":{"9":"nine","1":"one"},"extra":true},"2":{"type":"noul","instructions":"judge"}}"#).unwrap();
    trace(frame(vec![action],vec![json!({"body":{"model":"model","answers":{"2":{"type":"noul","noul":0.4},"10":{"type":"choice","choice":"1"}}}})])).await;
    for criteria in ["ab", "🦀"] {
        let mut action = eval("context");
        action["questions"] =
            json!({"0":{"type":"choice","instructions":"pick","criteria":criteria}});
        trace(frame(
            vec![action.clone()],
            vec![json!({"body":{"model":"model","answers":[{"type":"choice","choice":"0"}]}})],
        ))
        .await;
        let mut f = frame(
            vec![action],
            vec![
                json!({"body":{"choices":[{"message":{"content":[{"type":"choice","choice":"0"}]}}]}}),
            ],
        );
        f["keys"] = json!({"SYSTEM_ONE_BASE_URL":"https://model.invalid"});
        trace(f).await;
    }
}
#[tokio::test(start_paused = true)]
async fn response_and_transport_failures_trigger_backoff() {
    for reply in [
        json!({"status":401}),
        json!({"error":"network-fixture"}),
        json!({"jsonError":"bad-json-fixture"}),
        json!({"body":null}),
        json!({"body":{"model":4,"answers":{}}}),
        json!({"body":{"model":"x","answers":null}}),
        json!({"body":{"model":"x","answers":{}}}),
    ] {
        trace(frame(vec![eval("first"), eval("second")], vec![reply])).await;
    }
    for reply in [
        json!({"jsonError":"bad-json"}),
        json!({"body":{"choices":[]}}),
        json!({"body":{"choices":[{"message":{"content":7}}]}}),
    ] {
        let mut f = frame(vec![eval("first"), eval("second")], vec![reply]);
        f["keys"] = json!({"SYSTEM_ONE_BASE_URL":"https://model.invalid"});
        trace(f).await;
    }
}
#[tokio::test(start_paused = true)]
async fn cache_eviction_and_failure_eviction_follow_original_insertion_order() {
    let mut actions: Vec<_> = (0..129).map(|i| eval(&format!("state-{i}"))).collect();
    actions.extend([eval("state-1"), eval("state-0")]);
    trace(frame(actions, vec![reply(0.5); 130])).await;
    let mut actions = Vec::new();
    for i in 0..129 {
        let mut action = eval("same");
        action["keys"] = json!({"JEV_API_KEY":format!("tenant-{i}")});
        actions.push(action);
    }
    let mut first = eval("retry");
    first["keys"] = json!({"JEV_API_KEY":"tenant-0"});
    actions.push(first);
    let mut second = eval("retry");
    second["keys"] = json!({"JEV_API_KEY":"tenant-1"});
    actions.push(second);
    trace(frame(actions, vec![json!({"status":503}); 130])).await;
}
#[tokio::test(start_paused = true)]
async fn ranking_is_stable_filters_minimums_and_preserves_unranked_tail() {
    let items = json!(["first", "second", "third"]);
    trace(frame(
        vec![rank(items.clone())],
        vec![rank_reply(&[0.5, 0.9, 0.5])],
    ))
    .await;
    let mut action = rank(items);
    action["minimum"] = json!(0.6);
    trace(frame(vec![action], vec![rank_reply(&[0.5, 0.9, 0.5])])).await;
    let items = json!((0..51).map(|i| format!("item-{i}")).collect::<Vec<_>>());
    let scores: Vec<_> = (0..48).map(|i| i as f64 / 48.0).collect();
    trace(frame(vec![rank(items.clone())], vec![rank_reply(&scores)])).await;
    let mut action = rank(items);
    action["minimum"] = json!(0.5);
    trace(frame(vec![action], vec![rank_reply(&scores)])).await;
}
#[tokio::test(start_paused = true)]
async fn ranking_early_returns_and_callbacks_keep_failure_semantics() {
    for (items, query, minimum) in [
        (json!([]), "request", None),
        (json!(["one"]), "request", None),
        (json!(["one", "two"]), " \u{feff}", None),
        (json!([]), "request", Some(0.0)),
    ] {
        let mut action = rank(items);
        action["query"] = json!(query);
        if let Some(v) = minimum {
            action["minimum"] = json!(v);
        }
        trace(frame(vec![action], vec![])).await;
    }
    let mut one = rank(json!(["one"]));
    one["minimum"] = json!(0.0);
    trace(frame(vec![one], vec![rank_reply(&[0.1])])).await;
    let base = rank(json!(["one", "two"]));
    trace(frame(vec![base.clone()], vec![json!({"status":503})])).await;
    let mut action = base.clone();
    action["describeThrowAt"] = json!(2);
    trace(frame(vec![action], vec![])).await;
    let mut action = base.clone();
    action["scoreThrowAt"] = json!(1);
    trace(frame(vec![action], vec![rank_reply(&[0.2, 0.8])])).await;
    let mut action = base.clone();
    action["onScore"] = json!(false);
    trace(frame(vec![action], vec![rank_reply(&[0.2, 0.8])])).await;
    let mut f = frame(vec![base], vec![]);
    f["keys"] = json!({});
    trace(f).await;
}
#[tokio::test(start_paused = true)]
async fn ranking_slices_utf16_without_replacing_surrogates() {
    let mut action = rank(json!([format!("{}🦀tail", "a".repeat(799)), "second"]));
    action["query"] = json!(format!("{}🦀tail", "q".repeat(7999)));
    trace(frame(vec![action], vec![rank_reply(&[0.1, 0.9])])).await;
}
#[tokio::test(start_paused = true)]
async fn tool_constructs_all_question_kinds_and_preserves_fractional_scores() {
    let input = json!({"state":"context","questions":[{"id":"route","type":"choice","instructions":"pick","options":[{"id":"a","description":"one"},{"id":"b","description":"two"}]},{"id":"level","type":"score","instructions":"rate","levels":["low","high"]},{"id":"urgent","type":"noul","instructions":"urgent"}]});
    let response = json!({"body":{"model":"model","answers":{"route":{"type":"choice","choice":"a"},"level":{"type":"score","score":0.5},"urgent":{"type":"noul","noul":0.3}}}});
    trace(frame(
        vec![json!({"op":"tool","input":input})],
        vec![response],
    ))
    .await;
}
#[tokio::test(start_paused = true)]
async fn tool_rejects_duplicate_or_blank_ids_and_contains_service_failures() {
    for questions in [
        json!(null),
        json!({}),
        json!([null]),
        json!([{"id":" ","type":"noul","instructions":"x"}]),
        json!([{"id":"x","type":"noul","instructions":"x"},{"id":"x","type":"noul","instructions":"x"}]),
        json!([{"id":"x","type":"choice","instructions":"x","options":false}]),
    ] {
        trace(frame(
            vec![json!({"op":"tool","input":{"state":"context","questions":questions}})],
            vec![],
        ))
        .await;
    }
    let input =
        json!({"state":"context","questions":[{"id":"x","type":"noul","instructions":"x"}]});
    trace(frame(
        vec![json!({"op":"tool","input":input})],
        vec![json!({"status":503})],
    ))
    .await;
}
#[tokio::test(start_paused = true)]
async fn tool_choice_ids_follow_property_key_coercion_and_duplicate_replacement() {
    let input = json!({"state":"context","questions":[{"id":"route","type":"choice","instructions":"pick","options":[{"id":1,"description":"old"},{"id":null,"description":"null"},{"id":1,"description":"replacement"}]}]});
    trace(frame(
        vec![json!({"op":"tool","input":input})],
        vec![json!({"body":{"model":"m","answers":{"route":{"type":"choice","choice":"1"}}}})],
    ))
    .await;
}

#[tokio::test(start_paused = true)]
async fn expired_cache_refresh_keeps_original_position_until_evicted() {
    let mut actions: Vec<_> = (0..128).map(|i| eval(&format!("state-{i}"))).collect();
    actions.push(json!({"op":"clock","now":1030000}));
    actions.push(eval("state-10"));
    actions.extend((128..139).map(|i| eval(&format!("state-{i}"))));
    actions.push(eval("state-10"));
    trace(frame(actions, vec![reply(0.5); 141])).await;
}
#[tokio::test(start_paused = true)]
async fn endpoint_aliases_keep_separate_tenants_even_when_the_request_url_is_equal() {
    let mut a = eval("same");
    a["keys"] =
        json!({"SYSTEM_ONE_API_KEY":"same-key","SYSTEM_ONE_BASE_URL":"https://model.invalid/v1"});
    let mut b = a.clone();
    b["keys"]["SYSTEM_ONE_BASE_URL"] = json!("https://model.invalid/v1/");
    let response = json!({"body":{"choices":[{"message":{"content":{"answers":{"q":{"type":"noul","noul":0.7}}}}}]}});
    trace(frame(
        vec![a.clone(), b, a],
        vec![response.clone(), response],
    ))
    .await;
}

#[tokio::test(start_paused = true)]
async fn negative_and_positive_zero_probabilities_keep_original_tie_order() {
    trace(frame(
        vec![rank(json!(["first", "second"]))],
        vec![rank_reply(&[-0.0, 0.0])],
    ))
    .await;
    trace(frame(
        vec![rank(json!(["first", "second"]))],
        vec![rank_reply(&[0.0, -0.0])],
    ))
    .await;
}
