//! Exact differential outputs from the production model-result helpers.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::model_result::{
    bound_model_data_with_limit, project_model_data, serialize_tool_result_for_model,
};
use serde_json::{Value, json};
use std::path::PathBuf;
fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/model-result"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<_> = calls
        .iter()
        .map(|c| {
            let before = c["value"].clone();
            let result = match c["op"].as_str().unwrap() {
                "nativemodelresult.project" => project_model_data(&c["value"]),
                "nativemodelresult.bound" => bound_model_data_with_limit(
                    &c["value"],
                    c["maxChars"].as_f64().unwrap_or(30_000.0),
                ),
                "nativemodelresult.serialize" => json!(serialize_tool_result_for_model(
                    c["value"]["ok"].as_bool().unwrap(),
                    c["value"]["message"].as_str().unwrap(),
                    c["value"].get("data")
                )),
                _ => panic!("unknown operation"),
            };
            json!({"result":result,"unchanged":before==c["value"]})
        })
        .collect();
    assert_eq!(
        js_numbers(json!(actual)),
        js_numbers(expected),
        "calls={calls:?}"
    );
}
// JSON has one Number domain. Compare numeric values after the same f64
// coercion JavaScript applies when it parses the driver request; string outputs
// and preview content remain byte-exact, including their numeric spelling.
fn js_numbers(value: Value) -> Value {
    match value {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(v) => Value::Array(v.into_iter().map(js_numbers).collect()),
        Value::Object(v) => Value::Object(v.into_iter().map(|(k, v)| (k, js_numbers(v))).collect()),
        other => other,
    }
}
fn project(v: Value) -> Value {
    json!({"op":"nativemodelresult.project","value":v})
}
fn bound(v: Value, max: usize) -> Value {
    json!({"op":"nativemodelresult.bound","value":v,"maxChars":max})
}
#[test]
fn projection_preserves_evidence_and_removes_only_echo_fields() {
    compare(vec![
        project(
            json!({"output":"","terminalOutput":"echo","terminalOutputAnsi":"ansi","nested":{"terminalOutputAnsi":"keep"}}),
        ),
        project(json!({"output":null,"terminalOutput":"evidence","terminalOutputAnsi":false})),
        project(json!({"output":9,"terminalOutput":"evidence","terminalOutputAnsi":null})),
        project(json!({"terminalOutput":"evidence"})),
        project(json!([{"output":"keep","terminalOutputAnsi":"keep"}])),
        project(Value::Null),
        project(json!("text")),
        project(json!(false)),
        project(json!(1.0)),
    ]);
}
#[test]
fn clipping_counts_utf16_and_never_splits_emoji_pairs() {
    for v in [
        json!({"output":"🦀😀\\\"\n\t\u{0000}".repeat(15)}),
        json!(["🦀".repeat(30), true]),
        json!("🦀".repeat(40)),
    ] {
        compare((60..100).map(|max| bound(v.clone(), max)).collect());
    }
}
#[test]
fn scalar_execution_status_survives_clipping_and_non_scalars_are_dropped() {
    let v = json!({"output":"a".repeat(700),"ok":false,"exitCode":2,"timedOut":true,"needsInteraction":false,"terminalId":"term-🦀","outputOffset":1.0,"outputEndOffset":1e-7});
    compare(
        [200, 220, 250, 300]
            .into_iter()
            .map(|max| bound(v.clone(), max))
            .collect(),
    );
    compare(vec![bound(
        json!({"output":"a".repeat(500),"ok":null,"exitCode":{},"timedOut":[],"needsInteraction":"yes","terminalId":null,"outputOffset":false,"outputEndOffset":null}),
        160,
    )]);
}
#[test]
fn tiny_budgets_return_the_reference_minimum_envelope() {
    compare(
        [0, 1, 2, 20, 50, 60]
            .into_iter()
            .map(|max| bound(json!({"output":"x".repeat(100)}), max))
            .collect(),
    );
}
#[test]
fn numeric_keys_and_numbers_keep_js_serialization_spelling() {
    let v:Value=serde_json::from_str(r#"{"z":1.0,"10":2,"2":3,"01":-0.0,"0":1e-7,"4294967295":1e20,"3":1e21,"nested":{"b":0.000001,"12":7,"1":6}}"#).unwrap();
    compare(
        [50, 80, 100, 120, 140, 160, 1000]
            .into_iter()
            .map(|max| bound(v.clone(), max))
            .collect(),
    );
}

fn serialize(value: Value) -> Value {
    json!({"op":"nativemodelresult.serialize","value":value})
}
#[test]
fn serialization_deduplicates_only_top_level_strings_equal_to_message() {
    compare(vec![
        serialize(
            json!({"ok":true,"message":"same","data":{"output":"same","label":"same","other":"keep","nested":{"output":"same"},"parts":["same"]}}),
        ),
        serialize(
            json!({"ok":false,"message":"","data":{"output":"","empty":"","terminalOutput":"echo","terminalOutputAnsi":"ansi"}}),
        ),
        serialize(
            json!({"ok":true,"message":"same","data":{"output":"same","terminalOutput":"echo","terminalOutputAnsi":"ansi"}}),
        ),
        serialize(json!({"ok":true,"message":"same","data":{}})),
        serialize(json!({"ok":true,"message":"same"})),
        serialize(json!({"ok":true,"message":"same","data":null})),
        serialize(json!({"ok":true,"message":"same","data":"same"})),
        serialize(
            json!({"ok":true,"message":"same","data":["same",{"terminalOutputAnsi":"keep"}]}),
        ),
        serialize(json!({"ok":false,"message":"x","data":false})),
        serialize(json!({"ok":false,"message":"x","data":0})),
    ]);
}
#[test]
fn serializer_uses_js_number_spelling_and_property_order() {
    let data:Value=serde_json::from_str(r#"{"z":1.0,"10":"ten","2":"two","-1":-0.0,"01":1000000000000000100,"tiny":1e-7,"huge":1e21,"nested":{"b":2,"3":3,"1":1}}"#).unwrap();
    compare(vec![serialize(
        json!({"ok":true,"message":"🦀\n\t\"\\\u{0000}","data":data}),
    )]);
}
#[test]
fn serialization_clips_large_results_at_the_default_ceiling() {
    compare(vec![serialize(
        json!({"ok":false,"message":"failed","data":{"output":"🦀".repeat(9000),"other":"x".repeat(20000),"terminalOutputAnsi":"ansi"}}),
    )]);
    for target in [29_999, 30_000, 30_001] {
        let base = json!({"ok":true,"message":""}).to_string().len();
        compare(vec![serialize(
            json!({"ok":true,"message":"m".repeat(target-base)}),
        )]);
    }
}
#[test]
fn fractional_negative_and_default_budgets_use_reference_comparisons() {
    compare([-100.0,-0.0,50.5,60.0,60.75,70.25].into_iter().map(|max| json!({"op":"nativemodelresult.bound","value":{"output":"🦀".repeat(60)},"maxChars":max})).collect());
    compare(vec![
        json!({"op":"nativemodelresult.bound","value":{"output":"a".repeat(200)}}),
    ]);
}
#[test]
fn exact_budget_boundaries_and_escape_expansion_match() {
    for v in [
        json!({"output":"a".repeat(200)}),
        json!("\"\\\n\t\u{0001}".repeat(40)),
        json!([1, 2, 3]),
        json!(false),
    ] {
        let size = v.to_string().encode_utf16().count();
        compare(
            [size - 1, size, size + 1]
                .into_iter()
                .map(|max| bound(v.clone(), max))
                .collect(),
        );
    }
}
#[test]
fn scientific_and_large_integer_spellings_are_byte_exact_in_serialized_results() {
    for value in [
        json!(-0.0),
        json!(1e23),
        json!(1e-6),
        json!(1e-7),
        json!(f64::MAX),
        json!(f64::MIN_POSITIVE),
        json!(1000000000000000128_u64),
        json!(1.2345678901234567),
    ] {
        compare(vec![serialize(
            json!({"ok":true,"message":"number","data":value}),
        )]);
    }
}

#[test]
fn large_terminal_failure_retains_recovery_ids_diagnostics_coverage_and_tail() {
    let value = json!({"output":format!("build started\n{}\nERROR at completion", "noise ".repeat(5000)),"executionId":"execution-1","status":"failed","exitCode":1,"errors":["missing dependency"],"coverage":{"complete":false}});
    compare(vec![bound(value.clone(), 1024)]);
    let result = bound_model_data_with_limit(&value, 1024.);
    assert_eq!(result["executionId"], "execution-1");
    assert_eq!(result["errors"], json!(["missing dependency"]));
    assert_eq!(result["coverage"]["complete"], false);
    let preview = result["preview"].as_str().unwrap();
    assert!(preview.contains("build started") && preview.contains("ERROR at completion"));
    assert!(preview.contains("omitted middle"));
    assert!(result.to_string().encode_utf16().count() <= 1024);
}
