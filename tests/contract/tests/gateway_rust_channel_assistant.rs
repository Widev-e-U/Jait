#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::integrations::channel_assistant::{self as assistant, ChannelTurnContext};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference_many(calls: Vec<Value>) -> Vec<Value> {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/channel-assistant")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
    .as_array()
    .unwrap()
    .clone()
}
fn reference(call: Value) -> Value {
    reference_many(vec![call]).remove(0)
}
fn compare(actual: Value, expected: Value, label: &str) {
    if actual == expected {
        return;
    }
    let dir = root()
        .join(".jait/artifacts/gateway-rust/channel-assistant")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("native.json"),
        serde_json::to_vec_pretty(&actual).unwrap(),
    )
    .unwrap();
    fs::write(
        dir.join("reference.json"),
        serde_json::to_vec_pretty(&expected).unwrap(),
    )
    .unwrap();
    let mut a = &actual;
    let mut b = &expected;
    let mut index = None;
    if let (Some(aa), Some(bb)) = (actual.as_array(), expected.as_array()) {
        for (i, (x, y)) in aa.iter().zip(bb).enumerate() {
            if x != y {
                a = x;
                b = y;
                index = Some(i);
                break;
            }
        }
    }
    panic!(
        "channel assistant parity ({label}) row {index:?}: native {}, reference {}; artifacts {}",
        a,
        b,
        dir.display()
    );
}
fn render(row: &Value) -> Value {
    let now = if row["invalid"] == true {
        None
    } else {
        row["ms"].as_i64()
    };
    let zone = row["zone"].as_str().unwrap();
    let result = assistant::format_local_time(now, zone).and_then(|format| {
        assistant::build_context_block(&ChannelTurnContext {
            channel_id: row["channelId"].as_str().unwrap_or("fixture"),
            channel_label: row["channelLabel"].as_str().unwrap_or("Fixture"),
            conversation_id: row["conversationId"].as_str().unwrap_or("room"),
            model: row["model"].as_str(),
            time_zone: zone,
            now_ms: now,
        })
        .map(|context| json!({"ok":true,"format":format,"context":context}))
    });
    match result {
        Ok(v) => v,
        Err(e) => json!({"ok":false,"name":"RangeError","message":e}),
    }
}
fn compare_rows(rows: &[Value], label: &str) {
    for chunk in rows.chunks(64) {
        let expected = reference(json!({"op":"nativechannelassistant.formats","rows":chunk}));
        let actual = json!(chunk.iter().map(render).collect::<Vec<_>>());
        compare(actual, expected, label);
    }
}
#[test]
fn embedded_assistant_instructions_and_activated_tools_match_actual_exports() {
    let expected = reference(json!({"op":"nativechannelassistant.constants"}));
    let actual = json!({"tools":assistant::activated_tools(),"note":assistant::assistant_note()});
    compare(actual, expected, "constants");
}
#[test]
fn local_time_and_context_match_dst_history_extended_years_and_invalid_inputs() {
    let matrix: Value =
        serde_json::from_str(include_str!("../fixtures/channel-assistant-cases.json")).unwrap();
    let rows = matrix["rows"].as_array().unwrap();
    assert!(rows.len() >= 250);
    compare_rows(rows, "date matrix");
}
#[test]
fn all_reference_timezones_aliases_and_offsets_match_current_and_historical_seconds() {
    let zones = reference(json!({"op":"nativechannelassistant.zones"}));
    let zones = zones.as_array().unwrap();
    assert!(zones.len() > 400);
    let mut names = zones
        .iter()
        .map(|v| v.as_str().unwrap().to_owned())
        .collect::<std::collections::BTreeSet<_>>();
    let tz_source = include_str!("../../../packages/gateway-rust/src/scheduler/tzdata_2024a.rs");
    names.extend(
        tz_source
            .lines()
            .filter_map(|line| {
                line.trim()
                    .strip_prefix("(\"")
                    .and_then(|tail| tail.split('"').next())
            })
            .map(str::to_owned),
    );
    names.extend(
        [
            "US/Eastern",
            "GB-Eire",
            "europe/vienna",
            "utc",
            "Factory",
            "Etc/Unknown",
            "UTC+01",
            "GMT+01:00",
            "+02",
            "+0200",
            "-00",
            "-00:00",
            "+23:59",
            "-23:59",
            "+24",
        ]
        .into_iter()
        .map(str::to_owned),
    );
    let rows = names
        .iter()
        .flat_map(|zone| {
            [-2208988745000_i64, 1792584000123_i64].map(|ms| json!({"ms":ms,"zone":zone}))
        })
        .collect::<Vec<_>>();
    compare_rows(&rows, "canonical zones");
}
#[test]
fn host_zone_resolution_preserves_string_or_falls_back_after_missing_empty_and_failure() {
    let matrix: Value =
        serde_json::from_str(include_str!("../fixtures/channel-assistant-cases.json")).unwrap();
    let cases = matrix["host_cases"].as_array().unwrap();
    let calls = cases
        .iter()
        .map(|case| {
            let mut call = case.clone();
            call["op"] = json!("nativechannelassistant.host");
            call
        })
        .collect();
    let expected = reference_many(calls);
    let actual = cases
        .iter()
        .map(|case| {
            json!(assistant::host_time_zone(|| if case["error"] == true {
                Err(())
            } else {
                Ok(case["zone"].as_str().map(str::to_owned))
            }))
        })
        .collect::<Vec<_>>();
    compare(json!(actual), json!(expected), "host zone");
}

#[test]
fn malformed_offsets_and_timeclip_edges_match_fallback_without_panicking() {
    let zones = [
        "+aéa",
        "-a🦀",
        "+éé",
        "+01:0é",
        "+1:00",
        "+010",
        "+00:60",
        "+24:00",
        "-24:00",
        "+12:34:56",
        "+00:00",
        "-00:00",
        "\u{feff}UTC",
        "UTC\n",
        "No/Such_Zone",
    ];
    let mut rows: Vec<Value> = zones
        .iter()
        .map(|zone| json!({"ms":0,"zone":zone}))
        .collect();
    for ms in [
        -8_640_000_000_000_001_i64,
        -8_640_000_000_000_000,
        -1,
        0,
        8_640_000_000_000_000,
        8_640_000_000_000_001,
        i64::MIN,
        i64::MAX,
    ] {
        for zone in ["UTC", "+23:59", "-23:59", "America/New_York", "Bad/Zone"] {
            rows.push(json!({"ms":ms,"zone":zone}));
        }
    }
    compare_rows(&rows, "invalid offsets and TimeClip");
}
