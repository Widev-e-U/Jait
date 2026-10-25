#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::ecmascript_json::JsonDocument, db, services::sub_agent_history::*};
use serde_json::{Map, Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn compare(calls: Vec<Value>, native: impl Fn(&Value) -> Value) {
    for batch in calls.chunks(16) {
        let expected = internal_driver::call(
            &root(),
            &root()
                .join(".jait/artifacts/gateway-rust/sub-agent-history")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":batch}),
            &|| false,
        )
        .unwrap();
        assert_eq!(expected.as_array().unwrap().len(), batch.len());
        for (call, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(&native(call), expected, "call {call}");
        }
    }
}
fn pure(cases: Vec<Option<String>>) {
    compare(
        cases
            .into_iter()
            .map(|text| json!({"op":"nativehistorypayload.pure","text":text}))
            .collect(),
        |call| {
            let text = call["text"].as_str();
            json!({"extracted":serde_json::to_string(&extract_sub_agent_payloads(text)).unwrap(),"stripped":strip_sub_agent_payloads(text)})
        },
    );
}
#[test]
fn extraction_and_stubs_match_real_exports_for_shapes_and_metadata() {
    let mut cases = vec![None, Some(String::new())];
    for text in [
        "null",
        "false",
        "42",
        "[]",
        "{}",
        "broken",
        " ",
        r#"{"data":{"subAgentId":""}}"#,
        r#"{"data":{"subAgentId":4}}"#,
        r#"{"data":{"subAgentId":"x","content":"","partialContent":"partial","performative":"","rounds":0,"durationMs":0,"segments":[],"toolCalls":[]},"extra":"kept"}"#,
        r#"[{"data":{"subAgentId":" ","partialContent":"partial","content":null,"rounds":2.5,"durationMs":-4.5,"segments":[{"type":"text","content":"full"}],"toolCalls":[{"name":"child"}]}},null,[],{"data":[]},{"data":{"subAgentId":"wrong","segments":{},"toolCalls":false,"rounds":"4","performative":8}}]"#,
        r#"{"data":{"subAgentId":"x","content":false,"partialContent":0},"0":"zero"}"#,
    ] {
        cases.push(Some(text.into()));
    }
    pure(cases);
}
#[test]
fn unicode_duplicate_keys_numbers_and_key_order_match_js_json() {
    let texts = [
        r#"{"2":2,"1":1,"data":{"subAgentId":"x","content":"first","content":"last\n😀","rounds":9007199254740993,"durationMs":-0},"z":2.00000}"#,
        r#"{"data":{"subAgentId":"x","content":"\ud800","performative":"\udfff","segments":[{"\ud800":"\udfff"}],"rounds":1e999,"durationMs":1e-999}}"#,
        r#"{"__proto__":{"data":{"subAgentId":"not-inherited"}},"data":{"subAgentId":"literal","toolCalls":[{"02":2,"2":1,"1":3,"4294967295":4,"0":0}]}}"#,
        r#"[1e999,1e-999,-0,{"data":{"subAgentId":"x","rounds":-1e999,"content":"\\\/\b\f\r\t\u0000"}}]"#,
    ];
    pure(texts.into_iter().map(|s| Some(s.into())).collect());
}
#[test]
fn json_grammar_and_scalar_serialization_match_ecmascript() {
    let mut texts: Vec<String> = [
        "true",
        "false",
        "null",
        "0",
        "-0",
        "-0.0",
        "1E+03",
        "1e-3000",
        "1e3000",
        "9007199254740993",
        "{\"a\":1,\"a\":2}",
        "[1,true,\"text\",null]",
        "\"\\ud800\"",
        "\"😀\"",
        "0.1",
        "1.23456789012345678",
        "[1,]",
        "{\"a\":1,}",
        "+1",
        "01",
        "1.",
        ".1",
        "-",
        "1e",
        "1e+",
        "1e-",
        "NaN",
        "Infinity",
        "[",
        "{",
        "tru",
        "true false",
        "\"raw\nline\"",
        "\"\\x20\"",
        "\u{feff}{}",
        "\u{a0}null",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    for depth in [1, 32, 128, 1000] {
        texts.push(format!("{}0{}", "[".repeat(depth), "]".repeat(depth)));
    }
    compare(
        texts
            .into_iter()
            .map(|text| json!({"op":"nativehistorypayload.json","text":text}))
            .collect(),
        |call| match JsonDocument::parse(call["text"].as_str().unwrap()) {
            Ok(doc) => json!({"ok":true,"wire":doc.stringify()}),
            Err(_) => json!({"ok":false}),
        },
    );
}
#[test]
fn deep_payload_data_roundtrips_without_serde_recursion_limits() {
    let deep = format!(
        "{}{{\"type\":\"text\"}}{}",
        "[".repeat(1500),
        "]".repeat(1500)
    );
    pure(vec![Some(format!(
        "{{\"data\":{{\"subAgentId\":\"deep\",\"segments\":[{deep}]}}}}"
    ))]);
}
fn rows(db: &rusqlite::Connection) -> Value {
    let result = (|| -> rusqlite::Result<Value> {
        let mut stmt = db.prepare("SELECT *,hex(sub_agent_id) AS sub_id_hex,hex(performative) AS performative_hex FROM sub_agent_history ORDER BY rowid")?;
        let names: Vec<_> = stmt.column_names().into_iter().map(String::from).collect();
        let rows = stmt
            .query_map([], |row| {
                let mut obj = Map::new();
                for (i, name) in names.iter().enumerate() {
                    let value = match row.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(n) => json!(n),
                        rusqlite::types::ValueRef::Real(n) => json!(n),
                        rusqlite::types::ValueRef::Text(v) => {
                            json!(String::from_utf8_lossy(v))
                        }
                        _ => panic!("fixture type"),
                    };
                    obj.insert(name.clone(), value);
                }
                Ok(json!(obj))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(json!(rows))
    })();
    result.unwrap_or(json!({"error":true}))
}
fn persistence(steps: Value) {
    compare(
        vec![json!({"op":"nativehistorypayload.persist","steps":steps})],
        |call| {
            let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
            db::migrate_database(&db).unwrap();
            let now = Arc::new(AtomicI64::new(1740000000000));
            let clock = now.clone();
            let clock: jait_gateway::time::Clock = Arc::new(move || clock.load(Ordering::SeqCst));
            let mut results = vec![];
            for step in call["steps"].as_array().unwrap() {
                if let Some(at) = step["now"].as_i64() {
                    now.store(at, Ordering::SeqCst);
                }
                let result = if step["op"] == "sql" {
                    db.execute_batch(step["sql"].as_str().unwrap())
                        .map_err(|e| e.to_string())
                } else {
                    persist_sub_agent_histories_with_clock(
                        &db,
                        step["session"].as_str().unwrap_or("s"),
                        step["message"].as_str().unwrap_or("m"),
                        step["text"].as_str(),
                        &clock,
                    )
                };
                results.push(match result {
                    Ok(()) => Value::Null,
                    Err(_) => json!({"error":true}),
                });
            }
            json!({"results":results,"rows":rows(&db)})
        },
    );
}
#[test]
fn inserts_updates_and_preserved_creation_time_match_sqlite_reference() {
    persistence(json!([
        {"op":"persist","text":r#"[{"data":{"subAgentId":"one","content":"full","rounds":2,"durationMs":4.5,"segments":[],"toolCalls":[]}},{"data":{"subAgentId":"two","content":"","partialContent":"not selected","performative":""}}]"#},
        {"op":"persist","now":1740000099999i64,"session":"new session","message":"new message","text":r#"{"data":{"subAgentId":"one","partialContent":"updated","performative":"inform"}}"#},
        {"op":"persist","text":"{broken"},{"op":"persist","text":null}
    ]));
}
#[test]
fn malformed_row_is_nonfatal_and_later_rows_still_persist() {
    persistence(json!([
        {"op":"sql","sql":"CREATE TRIGGER reject_one BEFORE INSERT ON sub_agent_history WHEN NEW.sub_agent_id='blocked' BEGIN SELECT RAISE(FAIL,'fixture blocked'); END;"},
        {"op":"persist","text":r#"[{"data":{"subAgentId":"blocked"}},{"data":{"subAgentId":"safe'); DROP TABLE sub_agent_history;--","content":"later","rounds":-1,"durationMs":0}}]"#},
        {"op":"sql","sql":"DROP TABLE sub_agent_history;"},{"op":"persist","text":r#"{"data":{"subAgentId":"missing table"}}"#}
    ]));
}
#[test]
fn sqlite_number_unicode_and_empty_value_coercions_match_reference() {
    persistence(json!([
        {"op":"persist","text":r#"[{"data":{"subAgentId":"unicode-😀","content":"\ud800","performative":"\udfff","rounds":1e999,"durationMs":9007199254740993}},{"data":{"subAgentId":"\ud800","content":"x","rounds":1e-999,"segments":[-0,1e999]}},{"data":{"subAgentId":"left\ud800right","performative":"a\ud800"}},{"data":{"subAgentId":"BOM","performative":"\ufeffabc"}},{"data":{"subAgentId":"swap","performative":"\ufffeA"}}]"#}
    ]));
}

#[test]
fn iterative_json_handles_twenty_thousand_levels_without_stack_growth() {
    let text = format!("{}0{}", "[".repeat(20_000), "]".repeat(20_000));
    let start = std::time::Instant::now();
    let document = JsonDocument::parse(&text).unwrap();
    assert_eq!(document.stringify(), text);
    assert!(start.elapsed() < std::time::Duration::from_secs(5));
}
#[test]
fn failed_clock_only_matters_when_there_is_a_payload_to_persist() {
    persistence(json!([
        {"op":"persist","text":"[]","now":8640000000000001i64},
        {"op":"persist","text":r#"{"data":{"subAgentId":"x"}}"#,"now":8640000000000001i64}
    ]));
}
