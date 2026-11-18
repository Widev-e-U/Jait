#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::provider_reset_windows::*;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(op: &str, values: &[Value]) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/windows")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(
        &root(),
        &dir,
        json!({"version":1,"calls":[{"op":op,"values":values}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn compare(values: Vec<Value>) {
    for chunk in values.chunks(48) {
        let expected = reference("nativewindows.windows", chunk);
        let actual:Vec<_> = chunk.iter().map(|v| {
            let p=&v["previous"];
            let previous=ResetSnapshot {
                utilization:p["utilization"].as_f64(),
                resets_at:p["resetsAt"].as_str().map(String::from),
                source:parse_ollama_reset_source(&p["source"]),
                observed_at:p["observedAt"].as_str().map(String::from),
            };
            derive_ollama_reset_window(ResetWindowInput {
                window_duration_mins:v["windowDurationMins"].as_f64().unwrap(),
                now_ms:parse_iso(v["now"].as_str().unwrap()).unwrap(),
                utilization:v["utilization"].as_f64(),
                previous:(!p.is_null()).then_some(&previous),
                anchor_iso:v["anchorIso"].as_str(),
            }).map(|w| json!({"windowStartAt":w.window_start_at,"resetsAt":w.resets_at,"source":w.source.as_str()}))
            .unwrap_or_else(|error|json!({"error":error}))
        }).collect();
        assert_eq!(json!(actual), expected, "input: {}", json!(chunk));
    }
}
#[test]
fn grids_cover_midnight_week_month_leap_years_fractional_durations_and_anchors() {
    assert_eq!(OLLAMA_SESSION_MINS, 300.0);
    let mut values = vec![];
    for now in [
        "2026-10-19T00:00:00.000Z",
        "2026-10-18T23:59:59.999Z",
        "2024-02-29T12:34:56.789Z",
        "2026-12-31T23:00:00-03:00",
        "1999-12-31T23:59:59.999Z",
        "0099-01-05T03:00:00.000Z",
    ] {
        for duration in [
            -10.0, 0.0, 0.5, 1.0, 1.234567, 300.0, 1440.0, 10080.0, 43200.0, 999999.0,
        ] {
            for anchor in [
                Value::Null,
                json!("invalid"),
                json!("2026-10-12"),
                json!("2026-11-01T00:00:00Z"),
                json!("1900-01-01T00:00:00Z"),
            ] {
                values.push(json!({"now":now,"windowDurationMins":duration,"anchorIso":anchor}));
            }
        }
    }
    compare(values);
}
#[test]
fn rollovers_preserve_evidence_snap_strictly_after_observation_and_respect_step_caps() {
    let mut values = vec![];
    for duration in [1, 300, 10080, 43200] {
        for reset in [
            Value::Null,
            json!(""),
            json!("invalid"),
            json!("2026-10-19T10:00:00Z"),
            json!("2026-10-19T12:00:00Z"),
            json!("2026-10-19T15:00:00Z"),
            json!("1900-01-01T00:00:00Z"),
            json!("2100-01-01T00:00:00Z"),
        ] {
            for source in [
                Value::Null,
                json!("provider-reported"),
                json!("observed"),
                json!("window-boundary"),
                json!("window-grid"),
            ] {
                for utilization in [
                    Value::Null,
                    json!(0.6),
                    json!(0.5),
                    json!(0.495),
                    json!(0.4949999),
                ] {
                    values.push(json!({"now":"2026-10-19T12:00:00Z","windowDurationMins":duration,"utilization":utilization,"previous":{"utilization":0.5,"resetsAt":reset,"source":source,"observedAt":"2026-10-19T09:30:00Z"}}));
                }
            }
        }
    }
    compare(values);
}
#[test]
fn lower_observation_bounds_invalid_previous_values_and_same_boundary_epsilon() {
    let mut values = vec![];
    for observed in [
        Value::Null,
        json!("bad"),
        json!("2026-10-19T10:00:00Z"),
        json!("2026-10-19T09:59:59.999Z"),
        json!("2026-10-19T13:00:00Z"),
    ] {
        for utilization in [Value::Null, json!(0.0), json!(0.5), json!(-1)] {
            values.push(json!({"now":"2026-10-19T12:00:00Z","windowDurationMins":300,"utilization":0.0,"previous":{"utilization":utilization,"resetsAt":"2026-10-19T15:00:00Z","observedAt":observed,"source":"observed"}}));
        }
    }
    compare(values);
}
#[test]
fn source_parser_accepts_only_declared_strings_and_description_defaults_match() {
    let values = vec![
        Value::Null,
        json!(0),
        json!(false),
        json!({}),
        json!([]),
        json!(""),
        json!("observed "),
        json!("OBSERVED"),
        json!("provider-reported"),
        json!("observed"),
        json!("window-boundary"),
        json!("window-grid"),
    ];
    let actual:Vec<_>=values.iter().map(|v|{
        let source=parse_ollama_reset_source(v);
        json!({"source":source.map(ResetSource::as_str),"description":describe_ollama_reset_source(source)})
    }).collect();
    assert_eq!(json!(actual), reference("nativewindows.sources", &values));
}
