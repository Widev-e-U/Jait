#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::bounded_json::Utf16Text, routes::update_failure::*};
use serde_json::{Value, json};
use std::path::PathBuf;
fn compare(cases: &[Value]) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    for batch in cases.chunks(32) {
        let calls = batch
            .iter()
            .map(|v| {
                let mut v = v.clone();
                v["op"] = json!("nativeupdatefailure.describe");
                v
            })
            .collect::<Vec<_>>();
        let expected = internal_driver::call(
            &root,
            &root
                .join(".jait/artifacts/gateway-rust/update-failure")
                .join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":calls}),
            &|| false,
        )
        .unwrap();
        for (case, expected) in batch.iter().zip(expected.as_array().unwrap()) {
            let raw = if let Some(units) = case.get("units") {
                Utf16Text(serde_json::from_value(units.clone()).unwrap())
            } else {
                Utf16Text::from(case["display"].as_str().or(case["raw"].as_str()).unwrap())
            };
            let code = if matches!(case["kind"].as_str(), Some("error" | "object")) {
                case["code"].as_str()
            } else {
                None
            };
            let actual = describe_update_failure(&raw, code);
            assert_eq!(
                json!({"code":actual.code,"hint":actual.hint,"detailUnits":actual.detail.0}),
                *expected,
                "{case}"
            );
            // Serialization must retain the exact detail instead of repairing surrogate halves.
            let serialized = serde_json::to_string(&actual).unwrap();
            assert!(serialized.contains("\"detail\":"));
        }
    }
}
#[test]
fn all_classifiers_and_precedence_match_real_source() {
    let needles = [
        "ETARGET",
        "no matching version found",
        "E404",
        "404 Not Found",
        "not in this registry",
        "EACCES",
        "EPERM",
        "permission denied",
        "EBADENGINE",
        "unsupported engine",
        "requires node",
        "ETIMEDOUT",
        "timed out",
        "timeout",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ECONNRESET",
        "ECONNREFUSED",
        "network",
        "proxy",
        "unexpected",
    ];
    let mut cases = vec![];
    for (i, a) in needles.iter().enumerate() {
        cases.push(json!({"kind":"error","raw":format!("Command failed: npm install -g\n{a}")}));
        cases.push(json!({"kind":"error","raw":"opaque","code":a}));
        cases.push(json!({"kind":"string","raw":a.to_uppercase()}));
        for b in &needles[i..] {
            cases.push(json!({"kind":"error","raw":format!("{b} progress {a}")}));
        }
    }
    compare(&cases);
}
#[test]
fn tail_limits_ecmascript_whitespace_and_lone_surrogates_match() {
    let mut cases = vec![];
    for n in [0, 1, 1199, 1200, 1201, 2401] {
        for s in ["x", "🦀"] {
            cases.push(json!({"raw":format!(" \u{feff}{}\u{00a0}\r\n",s.repeat(n))}));
        }
    }
    for c in [
        '\u{0085}', '\u{180e}', '\u{200b}', '\u{feff}', '\u{2028}', '\u{3000}',
    ] {
        cases.push(json!({"raw":format!("{c}{c}")}));
    }
    cases.push(json!({"raw":format!("ETARGET{}","x".repeat(1400))}));
    let mut split = vec![0xd83e, 0xdd80];
    split.extend(vec![120; 1199]);
    cases.push(json!({"units":split}));
    cases.push(json!({"units":[0xd800,0x20,0xdc00]}));
    compare(&cases);
    let result = describe_update_failure(&Utf16Text(split), None);
    assert_eq!(result.detail.0[1], 0xdd80);
    assert!(serde_json::to_string(&result).unwrap().contains("\\udd80"));
}
#[test]
fn host_display_boundary_and_non_string_codes_match() {
    compare(&[
        json!({"kind":"object","raw":"ETARGET","display":"[object Object]","code":"E404"}),
        json!({"kind":"object","raw":"ETARGET","display":"[object Object]","code":42}),
        json!({"kind":"undefined","display":"undefined"}),
        json!({"kind":"null","display":"null"}),
        json!({"kind":"array","value":[null,"EPERM",4],"display":",EPERM,4"}),
        json!({"kind":"array","value":[],"display":""}),
        json!({"kind":"error","raw":"opaque","code":{"x":"ETARGET"}}),
        json!({"raw":"ETIMEDOUT","code":"ETARGET"}),
    ]);
}
