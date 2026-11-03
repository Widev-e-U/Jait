#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::persisted_tool_calls::{
    SerializationOptions, serialize_persisted_tool_calls,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn verify(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    for chunk in calls.chunks(16) {
        let dir = root
            .join(".jait/artifacts/gateway-rust/native-persisted")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        let expected =
            internal_driver::call(&root, &dir, json!({"version":1,"calls":chunk}), &|| false)
                .unwrap();
        for (i, call) in chunk.iter().enumerate() {
            let options: SerializationOptions =
                serde_json::from_value(call.get("options").cloned().unwrap_or(json!({}))).unwrap();
            let actual = serialize_persisted_tool_calls(call["raw"].as_str(), &options);
            assert_eq!(json!(actual), expected[i], "{call}");
            if let Some(value) = actual {
                let parsed: Value = serde_json::from_str(&value).unwrap();
                assert!(parsed.is_array());
                let max = options.max_bytes.unwrap_or(512000.0).floor().max(1024.0) as usize;
                assert!(value.len() <= max);
            }
        }
    }
}
fn call(raw: Value, options: Value) -> Value {
    json!({"op":"nativepersisted.serialize","raw":raw,"options":options})
}
#[test]
fn persisted_calls_preserve_valid_raw_json_and_reject_malformed_or_nonarrays() {
    verify(
        [
            Value::Null,
            json!(""),
            json!(" "),
            json!("not json"),
            json!("{}"),
            json!("null"),
            json!("1"),
            json!("true"),
            json!("\"array\""),
            json!("[1,]"),
            json!("\u{feff}[]"),
            json!(" [ { \"tool\" : \"read\", \"args\":{} } ]\n"),
        ]
        .into_iter()
        .map(|raw| call(raw, json!({})))
        .collect(),
    );
}
#[test]
fn persisted_calls_compact_exact_field_types_defaults_and_optional_metadata() {
    let raw=json!([
        null,false,5,"text",[],
        {"callId":"id","tool":"read","args":null,"ok":true,"message":"hello","data":null,"output":"out","parentCallId":"parent","status":"done","approvalRequestId":"approval","approvalState":"approved","startedAt":1.0,"completedAt":2,"retryCount":0,"extra":"ignored"},
        {"callId":42,"tool":true,"args":false,"ok":"true","message":5,"data":false,"output":0,"parentCallId":null,"status":5,"startedAt":"not numeric"},
        {"args":"","data":[],"ok":false},
        {"args":{"path":"/fixture"},"data":{"result":"🦀"},"message":"\u{0000}\n\t"}
    ]).to_string();
    verify(vec![
        call(json!(raw), json!({"forceCompact":true})),
        call(
            json!(raw),
            json!({"forceCompact":true,"markCompacted":true}),
        ),
    ]);
}
#[test]
fn persisted_calls_enforce_byte_boundaries_unicode_and_metadata_only_fallback() {
    let mut calls = vec![];
    for size in [127, 128, 129, 511, 512, 1023, 1024, 1200] {
        let raw=json!([{"callId":"🦀".repeat(size),"tool":"é".repeat(size),"message":"雪".repeat(size),"output":"output ".repeat(size),"args":{"long":"x".repeat(size)},"data":{"long":"y".repeat(size)},"parentCallId":"a".repeat(size)}]).to_string();
        calls.push(call(
            json!(raw),
            json!({"maxBytes":1024,"detailBytes":128,"textBytes":128,"markCompacted":true}),
        ));
    }
    // Keep each fixture request below the bridge's 64 KiB ceiling.
    for request in calls {
        verify(vec![request]);
    }
    let raw=json!((0..30).map(|i|json!({"callId":format!("call-{i}"),"tool":"execute","message":"x".repeat(100),"output":"y".repeat(100),"args":{"path":"z".repeat(100)},"data":{"detail":"w".repeat(100)}})).collect::<Vec<_>>()).to_string();
    verify(vec![
        call(json!(raw), json!({"maxBytes":1024,"forceCompact":true})),
        call(
            json!(raw),
            json!({"maxBytes":2048,"forceCompact":true,"markCompacted":true}),
        ),
    ]);
}
#[test]
fn persisted_calls_apply_progressive_compaction_passes_and_floor_minimum_budgets() {
    for max in [-10.0, 0.0, 1024.0, 1024.9, 4096.0, 12000.0] {
        let raw=json!([{"tool":"execute","callId":"one","message":"m".repeat(5000),"data":{"large":"d".repeat(5000)},"args":{"large":"a".repeat(5000)}}]).to_string();
        verify(vec![call(
            json!(raw),
            json!({"maxBytes":max,"forceCompact":true,"detailBytes":4000.9,"textBytes":2000.1}),
        )]);
    }
    let raw = json!([{"tool":"one","args":null,"data":null}]).to_string();
    verify(vec![call(
        json!(raw),
        json!({"forceCompact":true,"detailBytes":-1,"textBytes":1.5}),
    )]);
}

#[test]
fn persisted_long_history_retains_the_same_bounded_metadata_prefix() {
    // A small wire fixture expands into thousands of metadata records, so this
    // exercises the long fallback without exceeding the driver's 64 KiB limit.
    let entries = vec![json!({"data":0}); 2000];
    let raw = serde_json::to_string(&entries).unwrap();
    verify(vec![
        call(json!(raw), json!({"forceCompact":true,"maxBytes":100000})),
        call(
            json!(raw),
            json!({"forceCompact":true,"maxBytes":1024,"markCompacted":true}),
        ),
    ]);
}
