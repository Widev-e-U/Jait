#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    db,
    tools::{
        conversation::{self, ToolContext},
        list_preview::{
            self, ellipsize_text, format_ellipsed_list, memory_line, summarize_with_preview,
        },
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
fn observe(call: Value) -> Value {
    let path = root()
        .join(".jait/artifacts/gateway-rust/native-conversation-tools")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    internal_driver::call(&root(), &path, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
fn units(s: &str) -> Utf16Text {
    Utf16Text(s.encode_utf16().collect())
}
fn number(value: Option<&Value>) -> Option<f64> {
    value.map(|v| match v.as_str() {
        Some("nan") => f64::NAN,
        Some("infinity") => f64::INFINITY,
        Some("negative-infinity") => f64::NEG_INFINITY,
        _ => v.as_f64().unwrap(),
    })
}
fn previews(steps: Value) {
    let expected = observe(json!({"op":"nativeconversationtools.preview","steps":steps}));
    let actual = steps
        .as_array()
        .unwrap()
        .iter()
        .map(|s| {
            let lines = s["lines"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|s| units(s.as_str().unwrap()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            match s["op"].as_str().unwrap_or("") {
                "list" => format_ellipsed_list(&lines, number(s.get("max"))).0,
                "summary" => {
                    summarize_with_preview(
                        &units(s["summary"].as_str().unwrap()).0,
                        &lines,
                        number(s.get("max")),
                    )
                    .0
                }
                "memory" => {
                    memory_line(
                        s["id"].as_str().unwrap(),
                        &units(s["text"].as_str().unwrap()).0,
                        s["kind"].as_str(),
                        s["extra"].as_str(),
                    )
                    .0
                }
                _ => ellipsize_text(&units(s["text"].as_str().unwrap()).0, number(s.get("max"))).0,
            }
        })
        .collect::<Vec<_>>();
    assert_eq!(json!(actual), expected);
}
#[test]
fn preview_text_uses_ecmascript_whitespace_utf16_and_all_budget_boundaries() {
    assert_eq!(list_preview::PREVIEW_MAX_CHARS, 120.0);
    assert_eq!(list_preview::PREVIEW_MAX_ITEMS, 8.0);
    let mut steps = vec![];
    for text in [
        "",
        " a\n b\t c ",
        "A🦀B",
        "x\u{0085}y\u{feff}z",
        "🙂".repeat(65).as_str(),
        "x ".repeat(100).as_str(),
    ] {
        for max in [
            json!(-4),
            json!(0),
            json!(0.5),
            json!(1),
            json!(1.5),
            json!(2),
            json!(3),
            json!(119),
            json!(120),
            json!(121),
            json!("nan"),
            json!("infinity"),
            json!("negative-infinity"),
        ] {
            steps.push(json!({"text":text,"max":max}));
        }
        steps.push(json!({"text":text}));
    }
    for chunk in steps.chunks(40) {
        previews(json!(chunk));
    }
}
#[test]
fn list_summary_and_memory_previews_preserve_lines_hidden_counts_and_optional_suffixes() {
    let mut steps = vec![];
    for count in [0, 1, 7, 8, 9, 12] {
        let lines = (0..count)
            .map(|i| format!("line {i}\nembedded"))
            .collect::<Vec<_>>();
        for max in [
            json!(-1),
            json!(0),
            json!(0.9),
            json!(1.9),
            json!(8),
            json!(100),
            json!("nan"),
            json!("infinity"),
            json!("negative-infinity"),
        ] {
            for op in ["list", "summary"] {
                steps.push(json!({"op":op,"summary":"Summary","lines":lines,"max":max}));
            }
        }
        steps.push(json!({"op":"list","lines":lines}));
    }
    for id in ["id", ""] {
        for kind in [None, Some(""), Some("kind")] {
            for extra in [None, Some(""), Some(" "), Some("source")] {
                steps.push(json!({"op":"memory","id":id,"text":"text\n normalized","kind":kind,"extra":extra}));
            }
        }
    }
    for chunk in steps.chunks(40) {
        previews(json!(chunk));
    }
}
#[test]
fn metadata_matches_production_tool_names_schemas_permissions_and_descriptions() {
    let reference = observe(json!({"op":"nativeconversationtools.metadata"}));
    assert_eq!(conversation::metadata(), &reference);
}
fn scenario(seed: &str, steps: Value) -> Value {
    let reference = observe(json!({"op":"nativeconversationtools.run","seed":seed,"steps":steps}));
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let mut actual = vec![];
    for step in steps.as_array().unwrap() {
        if let Some(sql) = step["sql"].as_str() {
            db.execute_batch(sql).unwrap();
            actual.push(Value::Null);
            continue;
        }
        let context = ToolContext {
            user_id: step["context"]["userId"].as_str().map(String::from),
        };
        if step["op"] == "search" {
            let input = serde_json::from_value(step["input"].clone()).unwrap();
            actual.push(match conversation::session_search(&db, input, &context) {
                Err(_) => json!({"error":true}),
                Ok(result) => {
                    let rows = result
                        .data
                        .results
                        .into_iter()
                        .map(|mut r| {
                            let content = std::mem::take(&mut r.content.0);
                            let snippet = std::mem::take(&mut r.snippet.0);
                            let mut value = serde_json::to_value(r).unwrap();
                            value["content"] = json!(content);
                            value["snippet"] = json!(snippet);
                            value
                        })
                        .collect::<Vec<_>>();
                    json!({"ok":result.ok,"message":result.message.0,"data":{"results":rows}})
                }
            });
        } else {
            let input = serde_json::from_value(step["input"].clone()).unwrap();
            actual.push(match conversation::chat_traces(&db, input, &context) {
                Err(_) => json!({"error":true}),
                Ok(r) => json!({"ok":r.ok,"message":r.message.0,"data":r.data}),
            });
        }
    }
    let actual = json!(actual);
    assert_eq!(actual, reference);
    actual
}
fn seed() -> String {
    let mut seed="INSERT INTO sessions(id,user_id,name,created_at,last_active_at) VALUES('chat','owner','Chat','old','old'),('foreign','other','Secret','old','old'),('unowned',NULL,NULL,'old','old');".to_string();
    for i in 0..11 {
        seed += &format!(
            "INSERT INTO messages(id,session_id,role,content,tool_calls,segments,context_flow,thinking,created_at) VALUES('m{i}','chat','assistant','migration text {i}','[{{\"name\":\"fixture\"}}]','[]','{{\"round\":1}}','reasoning','2026-01-{i:02}');"
        );
        seed += &format!(
            "INSERT INTO agent_threads(id,user_id,session_id,title,model,provider_id,created_at,updated_at) VALUES('t{i}','owner','chat','Thread {i}',{},'fixture','2026-01-{i:02}','old');",
            if i % 2 == 0 {
                "'fixture-model'"
            } else {
                "NULL"
            }
        );
        seed += &format!(
            "INSERT INTO agent_thread_activities(id,thread_id,kind,summary,payload,created_at) VALUES('a{i}','t{i}','message','migration result','{{\"text\":\"payload\"}}','2026-02-{i:02}');"
        );
    }
    seed + "INSERT INTO messages(id,session_id,role,content,created_at) VALUES('foreign-m','foreign','user','migration secret','2026-01-01');INSERT INTO agent_threads(id,user_id,session_id,title,provider_id,created_at,updated_at) VALUES('foreign-t','other','chat','Hidden','fixture','old','old');"
}
#[test]
fn search_tool_executes_real_fts_and_applies_context_ownership_over_input() {
    let steps = json!([
        {"op":"search","input":{"query":"migration","userId":"other","limit":12},"context":{"userId":"owner"}},
        {"op":"search","input":{"query":"absent"},"context":{"userId":"owner"}},
        {"op":"search","input":{"query":"migration","includeMessages":false,"threadId":"t1"},"context":{"userId":"owner"}},
        {"op":"search","input":{"query":"migration","includeThreadActivities":false,"sessionId":"foreign"},"context":{"userId":"owner"}},
        {"op":"search","input":{"query":"migration","limit":1.9},"context":{"userId":"other"}},
        {"op":"search","input":{"query":"migration"},"context":{}},
        {"op":"search","input":{"query":"migration"},"context":{"userId":""}}
    ]);
    let out = scenario(&seed(), steps);
    assert_eq!(out[0]["data"]["results"].as_array().unwrap().len(), 12);
    assert_eq!(out[3]["data"]["results"], json!([]));
}
#[test]
fn traces_tool_formats_counts_threads_missing_owner_and_all_inclusion_flags() {
    let mut steps = vec![];
    for user in [Some("owner"), Some("other"), Some(""), None] {
        for chat in ["chat", "foreign", "unowned", "missing", "quote' OR 1=1--"] {
            steps.push(json!({"op":"traces","input":{"chatId":chat,"userId":"other"},"context":{"userId":user}}));
        }
    }
    for input in [
        json!({"chatId":"chat","includeThreads":false}),
        json!({"chatId":"chat","includeMessages":false}),
        json!({"chatId":"chat","includeContextFlow":true,"includeThinking":true,"includeToolCalls":false,"messageLimit":1,"activityLimit":1}),
        json!({"chatId":"chat","messageLimit":0.5,"activityLimit":0.5}),
    ] {
        steps.push(json!({"op":"traces","input":input,"context":{"userId":"owner"}}));
    }
    scenario(&seed(), json!(steps));
}
#[test]
fn tool_preview_truncation_retains_full_unicode_data_and_empty_titles() {
    let mut seed = seed();
    seed += &format!(
        "UPDATE sessions SET name='' WHERE id='chat';UPDATE agent_threads SET title='' WHERE id='t1';UPDATE messages SET content='migration {}' WHERE id='m1';",
        "🦀 ".repeat(150)
    );
    scenario(
        &seed,
        json!([
            {"op":"search","input":{"query":"migration","limit":12},"context":{"userId":"owner"}},
            {"op":"traces","input":{"chatId":"chat","messageLimit":2},"context":{"userId":"owner"}}
        ]),
    );
}
#[test]
fn query_failures_escape_tool_adapter_without_fabricating_success() {
    scenario(
        &seed(),
        json!([
            {"sql":"DROP TABLE messages_fts"},
            {"op":"search","input":{"query":"migration"},"context":{"userId":"owner"}},
            {"sql":"DROP TABLE agent_thread_activities"},
            {"op":"traces","input":{"chatId":"chat"},"context":{"userId":"owner"}}
        ]),
    );
}
