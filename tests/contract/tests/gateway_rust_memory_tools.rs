#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    core_io::{HostError, HostPort},
    memory_tools::*,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn thrown(e: HostError) -> Value {
    match e {
        HostError::Error(s) => json!({"error":s}),
        HostError::Thrown(v) => json!({"value":v}),
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(4) {
        let root = root();
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/memory-tools/contracts"),
            json!({"version":1,"calls":[{"op":"nativememorytools.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let context = Arc::new(test.get("context").cloned().unwrap_or(json!({})));
            let events = Arc::new(Mutex::new(vec![]));
            let cursor = Arc::new(AtomicUsize::new(0));
            let port: HostPort<Value> = {
                let test = test.clone();
                let events = events.clone();
                let cursor = cursor.clone();
                Arc::new(move |op, args, _ctx| {
                    let i = cursor.fetch_add(1, Ordering::SeqCst);
                    let step = test["steps"][i].clone();
                    events.lock().unwrap().push(json!({"op":op,"args":args}));
                    Box::pin(async move {
                        if let Some(ms) = step["delay"].as_u64() {
                            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
                        }
                        if let Some(s) = step["error"].as_str() {
                            return Err(HostError::Error(s.into()));
                        }
                        if let Some(v) = step.get("thrown") {
                            return Err(HostError::Thrown(v.clone()));
                        }
                        if let Some(unit) = step["repeatText"]["unit"].as_str() {
                            return Ok(json!(
                                unit.repeat(step["repeatText"]["count"].as_u64().unwrap() as usize)
                            ));
                        }
                        if let Some(n) = step["bytes"]["count"].as_u64() {
                            let offset = step["bytes"]["offset"].as_u64().unwrap_or(0);
                            return Ok(json!(
                                (0..n).map(|i| (i + offset) % 256).collect::<Vec<_>>()
                            ));
                        }
                        Ok(step.get("response").cloned().unwrap_or(json!({})))
                    })
                })
            };
            let kind = test["kind"].as_str().unwrap();
            let now = test["now"].as_i64().unwrap_or(1740000000000);
            let clock: jait_gateway::time::Clock = Arc::new(move || now);
            let reminders = test["reminders"] != false;
            let retrieved = test["markRetrieved"] != false;
            let tool = match kind {
                "save" => create_memory_save_tool(port, clock, reminders, retrieved),
                "search" => create_memory_search_tool(port, clock, reminders, retrieved),
                "forget" => create_memory_forget_tool(port, clock, reminders, retrieved),
                "hygiene" => create_memory_hygiene_tool(port, clock, reminders, retrieved),
                "review" => create_memory_review_chats_tool(port, clock, reminders, retrieved),
                "list" => create_memory_list_tool(port, clock, reminders, retrieved),
                "update" => create_memory_update_tool(port, clock, reminders, retrieved),
                _ => panic!("unknown memory tool"),
            };
            let definition = tool.definition();
            let result = tool.execute(&test["input"], &context).await.map(|result| {
                // Compare exact UTF-16 units, including a clipped surrogate. The
                // public result serializes these units as escaped JSON text.
                let mut wire = json!({"ok":result.ok,"message":result.message.0});
                if let Some(data) = result.data {
                    wire["data"] = data;
                }
                wire
            });
            let mut output = json!({"metadata":definition,"events":*events.lock().unwrap()});
            match result {
                Ok(v) => output["result"] = v,
                Err(e) => output["thrown"] = thrown(e),
            };
            actual.push(output);
        }
        for (index, (actual, expected)) in
            actual.iter().zip(expected.as_array().unwrap()).enumerate()
        {
            assert_eq!(
                actual.get("result"),
                expected.get("result"),
                "case {:?}",
                batch[index]
            );
            assert_eq!(actual, expected, "case {:?}", batch[index]);
        }
    }
}
fn memory(id: &str, content: &str) -> Value {
    json!({"id":id,"content":content,"source":{"type":"chat"}})
}
fn reminder(id: &str, content: &str) -> Value {
    json!({"id":id,"content":content,"status":"active"})
}
#[tokio::test]
async fn save_preserves_source_ttl_nullish_defaults_and_reminder_user_scope() {
    let mut cases = vec![];
    for ttl in [
        None,
        Some(json!(null)),
        Some(json!(0)),
        Some(json!(-1)),
        Some(json!(1.125)),
        Some(json!(0.0001)),
        Some(json!(8_640_000_000_000.0)),
        Some(json!(1e100)),
    ] {
        let mut input = json!({"scope":"project","content":" é🦀\r\n","sourceType":"chat","sourceId":"row","sourceSurface":"web","projectId":"ignored","tags":["ignored"]});
        if let Some(ttl) = ttl {
            input["ttlSeconds"] = ttl;
        }
        cases.push(json!({"kind":"save","input":input,"context":{"userId":"owner","sessionId":"chat"},"steps":[{"response":memory("m","new")}]}));
    }
    for reminders in [true, false] {
        for project in [None, Some(Value::Null), Some(json!("project"))] {
            for session in [
                None,
                Some(Value::Null),
                Some(json!("explicit")),
                Some(json!("")),
            ] {
                let mut input = json!({"kind":"reminder","scope":"project","content":"remember","sourceType":"explicit","sourceId":"s","sourceSurface":"web","ttlSeconds":999,"tags":["t"]});
                if let Some(v) = &project {
                    input["projectId"] = v.clone();
                }
                if let Some(v) = session {
                    input["sessionId"] = v;
                }
                cases.push(json!({"kind":"save","reminders":reminders,"input":input,"context":{"userId":"owner","sessionId":"fallback"},"steps":[{"response":reminder("r","remember")}]}));
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn search_lists_active_owned_reminders_and_marks_exact_ids_in_order() {
    let mut cases = vec![];
    for reminders in [true, false] {
        for retrieved in [true, false] {
            for include in [
                None,
                Some(json!(false)),
                Some(json!(true)),
                Some(Value::Null),
            ] {
                for limit in [None, Some(json!(0)), Some(Value::Null), Some(json!(1.5))] {
                    let mut input = json!({"query":" needle ","scope":"contact","projectId":"p"});
                    if let Some(v) = &include {
                        input["includeReminders"] = v.clone();
                    }
                    if let Some(v) = limit {
                        input["limit"] = v;
                    }
                    cases.push(json!({"kind":"search","reminders":reminders,"markRetrieved":retrieved,"input":input,"context":{"userId":"owner"},"steps":[{"response":[memory("m","durable")]},{"response":[reminder("r1","one"),reminder("r2","two")]},{}]}));
                }
            }
        }
    }
    cases.push(
        json!({"kind":"search","input":{"query":"q"},"steps":[{"response":[]},{"response":[]}]}),
    );
    cases.push(
        json!({"kind":"search","input":{"query":"q"},"steps":[{"response":[]},{"response":null}]}),
    );
    compare(cases).await;
}
#[tokio::test]
async fn forget_checks_reminder_first_and_never_deletes_memory_for_explicit_reminder_kind() {
    let mut cases = vec![];
    for available in [true, false] {
        for kind in [None, Some("reminder"), Some("memory")] {
            for removed in [false, true] {
                for memory_removed in [false, true] {
                    let mut input = json!({"id":"record"});
                    if let Some(kind) = kind {
                        input["kind"] = json!(kind);
                    }
                    cases.push(json!({"kind":"forget","reminders":available,"input":input,"context":{"userId":"owner"},"steps":[{"response":removed},{"response":memory_removed}]}));
                }
            }
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn list_update_hygiene_review_keep_defaults_patch_nulls_and_result_shapes() {
    let mut cases = vec![];
    for available in [true, false] {
        for input in [
            json!({}),
            json!({"limit":null,"status":null,"projectId":null,"sessionId":null}),
            json!({"status":"all","limit":0,"projectId":"p","sessionId":"s"}),
        ] {
            cases.push(json!({"kind":"list","reminders":available,"input":input,"context":{"userId":"owner"},"steps":[{"response":[reminder("r","text"),{"id":"archive","content":"older","status":"archived"}]}]}));
        }
        for input in [
            json!({"id":"r"}),
            json!({"id":"r","content":"","projectId":null,"sessionId":null,"tags":[],"status":"archived","unknown":"ignore"}),
        ] {
            for updated in [Value::Null, reminder("r", "changed")] {
                cases.push(json!({"kind":"update","reminders":available,"input":input,"context":{"userId":"owner"},"steps":[{"response":updated}]}));
            }
        }
    }
    for input in [
        json!({}),
        json!({"limit":null}),
        json!({"limit":0}),
        json!({"limit":25}),
    ] {
        cases.push(json!({"kind":"review","input":input,"context":{"userId":"owner"},"steps":[{"response":{"scanned":13,"created":2,"extra":"kept"}}]}));
    }
    cases.push(json!({"kind":"hygiene","input":{"ignored":true},"context":{"userId":"owner"},"steps":[{"response":{"archived":3,"flagged":1,"ids":["a"]}}]}));
    compare(cases).await;
}
#[tokio::test]
async fn previews_keep_eight_item_order_and_exact_utf16_clipping_including_split_pairs() {
    let mut cases = vec![];
    for content in [
        "  tabs\tnew\nline  ".into(),
        "a".repeat(121),
        "é🦀".repeat(65),
        format!("{}🦀z", "a".repeat(118)),
        "\u{feff}trim\u{a0}".into(),
    ] {
        cases.push(json!({"kind":"search","input":{"query":"q"},"steps":[{"response":[memory("m",&content)]},{"response":[reminder("r",&content)]},{}]}));
        cases.push(
            json!({"kind":"list","input":{},"steps":[{"response":[reminder("r",&content)]}]}),
        );
    }
    cases.push(json!({"kind":"search","input":{"query":"q"},"steps":[{"response":(0..7).map(|i|memory(&format!("m{i}"),"content")).collect::<Vec<_>>()},{"response":(0..7).map(|i|reminder(&format!("r{i}"),"content")).collect::<Vec<_>>()},{}]}));
    cases.push(json!({"kind":"list","input":{},"steps":[{"response":(0..12).map(|i|reminder(&format!("r{i}"),"content")).collect::<Vec<_>>()}]}));
    compare(cases).await;
}
#[tokio::test]
async fn service_errors_and_non_error_throws_escape_with_no_later_side_effects() {
    let mut cases = vec![];
    for kind in [
        "save", "search", "forget", "hygiene", "review", "list", "update",
    ] {
        for index in 0..if kind == "search" {
            3
        } else if kind == "forget" {
            2
        } else {
            1
        } {
            for failure in [
                json!({"error":"service failed"}),
                json!({"thrown":null}),
                json!({"thrown":{"opaque":true}}),
            ] {
                let mut steps = if kind == "search" {
                    vec![
                        json!({"response":[memory("m","text")]}),
                        json!({"response":[reminder("r","text")]}),
                        json!({}),
                    ]
                } else {
                    vec![json!({"response":false}), json!({"response":true})]
                };
                steps[index] = failure;
                cases.push(json!({"kind":kind,"input":{"scope":"project","content":"text","sourceType":"chat","sourceId":"s","sourceSurface":"web","id":"r","query":"q"},"context":{"userId":"owner"},"steps":steps}));
            }
        }
    }
    compare(cases).await;
}
#[test]
fn result_serializes_clipped_surrogates_as_json_escapes() {
    let result = MemoryToolResult {
        ok: json!(true),
        message: jait_gateway::contracts::bounded_json::Utf16Text(vec![0xd83e, 0x2026]),
        data: None,
    };
    assert_eq!(
        serde_json::to_string(&result).unwrap(),
        "{\"ok\":true,\"message\":\"\\ud83e…\"}"
    );
}
