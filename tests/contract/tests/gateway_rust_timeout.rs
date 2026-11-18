#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::execution::command_timeout::TimeoutPolicy;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn observe(calls: &[Value]) -> Vec<Value> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-timeout")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":calls}), &|| false)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}
#[test]
fn finite_timeout_defaults_caps_rounding_coercion_and_warnings_match_reference() {
    let values = vec![
        Value::Null,
        json!(true),
        json!(false),
        json!(0),
        json!(-1),
        json!(0.1),
        json!(0.01),
        json!(10.1),
        json!(500.5),
        json!(501),
        json!(1000),
        json!(3_600_000),
        json!(86_400_000),
        json!(100_000_000),
        json!(1e25),
        json!(""),
        json!("  "),
        json!("\u{feff}500\u{feff}"),
        json!("1e3"),
        json!("0xff"),
        json!("0XFF"),
        json!("0o100"),
        json!("0b11111"),
        json!("0x"),
        json!("+0x10"),
        json!("infinity"),
        json!("not a number"),
        json!([]),
        json!([null]),
        json!([5]),
        json!(["0x10"]),
        json!([[10]]),
        json!([1, 2]),
        json!({}),
        json!([{}]),
    ];
    let mut calls = vec![];
    for (default, max) in [
        (None, None),
        (Some("1000"), Some("500")),
        (Some("0"), Some("10")),
        (Some("garbage"), Some("Infinity")),
        (Some("0x10"), Some("0b100000")),
        (Some(" 500.2 "), Some("750.5")),
        (Some("0.01"), Some("0.1")),
    ] {
        for value in &values {
            let mut call = json!({"op":"nativetimeout.resolve","value":value});
            if let Some(default) = default {
                call["default"] = json!(default);
            }
            if let Some(max) = max {
                call["max"] = json!(max);
            }
            calls.push(call);
        }
        for special in ["nan", "infinity", "negativeInfinity", "undefined"] {
            let mut call = json!({"op":"nativetimeout.resolve","special":special});
            if let Some(default) = default {
                call["default"] = json!(default);
            }
            if let Some(max) = max {
                call["max"] = json!(max);
            }
            calls.push(call);
        }
    }
    for chunk in calls.chunks(60) {
        for (call, reference) in chunk.iter().zip(observe(chunk)) {
            let policy = TimeoutPolicy::from_values(call["default"].as_str(), call["max"].as_str());
            assert_eq!(
                policy.default_ms(),
                reference["default"].as_f64().unwrap(),
                "{call}"
            );
            assert_eq!(
                policy.max_ms(),
                reference["max"].as_f64().unwrap(),
                "{call}"
            );
            let actual = match call["special"].as_str() {
                Some("nan") => policy.resolve_number(f64::NAN),
                Some("infinity") => policy.resolve_number(f64::INFINITY),
                Some("negativeInfinity") => policy.resolve_number(f64::NEG_INFINITY),
                _ => policy.resolve(call.get("value")),
            };
            assert_eq!(
                actual.milliseconds,
                reference["milliseconds"].as_f64().unwrap(),
                "{call}"
            );
            assert_eq!(
                json!(actual.warning.into_iter().collect::<Vec<_>>()),
                reference["warnings"],
                "{call}"
            );
            assert!(actual.milliseconds.is_finite() && actual.milliseconds > 0.0);
        }
    }
}
