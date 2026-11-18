#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    contracts::bounded_json::{self, JsonGraph, JsonNode},
    db,
    services::audit::AuditWriter,
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-audit")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn expand(value: &Value) -> Value {
    if let Some(spec) = value.get("$repeat") {
        return json!(
            spec["text"]
                .as_str()
                .unwrap()
                .repeat(spec["count"].as_u64().unwrap() as usize)
        );
    }
    match value {
        Value::Array(v) => json!(v.iter().map(expand).collect::<Vec<_>>()),
        Value::Object(v) => Value::Object(v.iter().map(|(k, v)| (k.clone(), expand(v))).collect()),
        _ => value.clone(),
    }
}
fn check_bounded(value: Value, max: usize) {
    let expected = observe(json!({"op":"nativeaudit.bounded","value":value,"max":max}));
    let actual = bounded_json::serialize_bounded_json(&expand(&value), max);
    assert_eq!(json!(actual), expected, "max {max}");
    assert!(actual.len() <= max.max(128));
    assert!(serde_json::from_str::<Box<serde_json::value::RawValue>>(&actual).is_ok());
}
#[test]
fn bounded_json_retains_order_values_numbers_and_json_escape_semantics() {
    for value in [
        json!({"z":1,"a":true,"10":"ten","2":"two","00":null,"__proto__":{"own":true},"4294967295":"not index","1":"one"}),
        json!([
            0,
            -0.0,
            1.0,
            1e-6,
            1e-7,
            1e20,
            1e21,
            5e-324,
            1.7976931348623157e308,
            9007199254740993u64
        ]),
        json!({"a":"資料🦀\n\u{0000}\u{2028}","quote":"\"/\\","empty":{},"array":[]}),
    ] {
        check_bounded(value, 128000)
    }
}
#[test]
fn bounded_json_passes_depth_width_multibyte_limits_and_final_fallback_match_reference() {
    let wide = Value::Object(
        (0..130)
            .map(|i| {
                (
                    format!("k{i}"),
                    json!({"$repeat":{"text":"🦀資料","count":600}}),
                )
            })
            .collect(),
    );
    let mut deep = json!({"leaf":"v"});
    for _ in 0..12 {
        deep = json!({"child":deep})
    }
    for value in [
        wide,
        deep,
        json!({"$repeat":{"text":"🦀資料\n","count":35000}}),
        json!((0..150).map(|i| json!({"key":i})).collect::<Vec<_>>()),
    ] {
        for max in [0, 128, 512, 4096, 128000] {
            check_bounded(value.clone(), max)
        }
    }
}
fn graph_spec(graph: &JsonGraph) -> Value {
    json!({"root":graph.root,"nodes":graph.nodes.iter().map(|n|match n {
        JsonNode::Null=>json!({"kind":"null"}),JsonNode::Undefined=>json!({"kind":"undefined"}),
        JsonNode::Bool(v)=>json!({"kind":"bool","value":v}),JsonNode::Number(v)=>json!({"kind":"number","value":v.to_string()}),
        JsonNode::String(v)=>json!({"kind":"string","units":v}),JsonNode::BigInt(v)=>json!({"kind":"bigint","value":v}),
        JsonNode::Array(v)=>json!({"kind":"array","children":v}),JsonNode::Object(v)=>json!({"kind":"object","entries":v}),
    }).collect::<Vec<_>>()})
}
#[test]
fn bounded_json_circular_shared_bigint_undefined_nonfinite_and_lone_surrogates_match_reference() {
    let graphs = vec![
        JsonGraph {
            root: 0,
            nodes: vec![JsonNode::Object(vec![("self".into(), 0)])],
        },
        JsonGraph {
            root: 0,
            nodes: vec![JsonNode::Array(vec![0])],
        },
        JsonGraph {
            root: 0,
            nodes: vec![
                JsonNode::Object(vec![("a".into(), 1), ("b".into(), 1), ("big".into(), 2)]),
                JsonNode::Array(vec![3]),
                JsonNode::BigInt("12345678901234567890".into()),
                JsonNode::Bool(true),
            ],
        },
        JsonGraph {
            root: 0,
            nodes: vec![
                JsonNode::Object(vec![("skip".into(), 1), ("values".into(), 2)]),
                JsonNode::Undefined,
                JsonNode::Array(vec![1, 3, 4, 5]),
                JsonNode::Number(f64::NAN),
                JsonNode::Number(f64::INFINITY),
                JsonNode::String(vec![0xd83e]),
            ],
        },
        JsonGraph {
            root: 0,
            nodes: vec![JsonNode::Undefined],
        },
        JsonGraph {
            root: 0,
            nodes: vec![JsonNode::String(vec![0xd83e; 9000])],
        },
    ];
    for graph in graphs {
        for max in [128, 512, 128000] {
            let expected =
                observe(json!({"op":"nativeaudit.bounded","graph":graph_spec(&graph),"max":max}));
            let actual = graph.bounded(max);
            assert_eq!(json!(actual), expected);
            assert!(actual.len() <= max.max(128));
        }
    }
}
#[test]
fn utf8_and_serialized_limits_retain_valid_shapes_and_do_not_split_pairs() {
    for value in ["abc", "🦀資料\n", "a🦀b".repeat(30).as_str()] {
        for max in [0, 1, 2, 3, 4, 5, 6, 23, 24, 25, 30, 100] {
            for suffix in [None, Some(""), Some("終")] {
                assert_eq!(
                    json!(bounded_json::limit_utf8(value, max, suffix)),
                    observe(
                        json!({"op":"nativeaudit.utf8","value":value,"max":max,"suffix":suffix.unwrap_or(bounded_json::SUFFIX)})
                    )
                );
            }
        }
    }
    for raw in [
        "not JSON".repeat(100),
        "{\"x\":1}".into(),
        format!("{{\"data\":\"{}\"}}", "🦀".repeat(1000)),
    ] {
        for max in [0, 128, 500, 128000] {
            assert_eq!(
                json!(bounded_json::limit_serialized_json(&raw, max)),
                observe(json!({"op":"nativeaudit.serialized","value":raw,"max":max}))
            );
        }
    }
}
fn normalize(value: &mut Value, ids: &BTreeMap<String, String>) {
    match value {
        Value::String(s) => {
            if let Some(v) = ids.get(s) {
                *s = v.clone()
            }
        }
        Value::Object(map) => {
            for key in ["inputs", "outputs", "sideEffects", "side_effects"] {
                if let Some(Value::String(raw)) = map.get(key)
                    && let Ok(parsed) = serde_json::from_str::<Value>(raw)
                {
                    map.insert(key.into(), parsed);
                }
            }
            if let Some(time) = map.get_mut("timestamp") {
                let s = time.as_str().unwrap();
                assert!(s.contains('T') && s.ends_with('Z'));
                *time = json!("<time>")
            }
            for v in map.values_mut() {
                normalize(v, ids)
            }
        }
        Value::Array(values) => {
            for v in values {
                normalize(v, ids)
            }
        }
        _ => {}
    }
}
#[test]
fn audit_writer_persists_nullish_bounded_fields_action_lookup_and_timestamp_order() {
    let steps = vec![
        json!({"op":"has","id":"a1"}),
        json!({"op":"session","id":"missing"}),
        json!({"op":"write","entry":{"actionId":"a1","actionType":"session.create","status":"executed","sessionId":"s1","inputs":false,"outputs":0,"sideEffects":""}}),
        json!({"op":"has","id":"a1"}),
        json!({"op":"has","id":""}),
        json!({"op":"write","entry":{"actionId":"a2","actionType":"test","status":"denied","surfaceType":"web","deviceId":"d","toolName":"read","inputs":null,"parentActionId":"a1","consentMethod":"user"}}),
        json!({"op":"write","entry":{"actionId":"a3","actionType":"large","status":"executed","sessionId":"s1","outputs":{"nested":{"$repeat":{"text":"🦀","count":40000}}}}}),
        json!({"op":"session","id":"s1"}),
        json!({"op":"session","id":""}),
        json!({"op":"all"}),
    ];
    let mut expected = observe(json!({"op":"nativeaudit.run","steps":steps}));
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    let writer = AuditWriter::new(&connection);
    let mut results = vec![];
    for step in &steps {
        results.push(match step["op"].as_str().unwrap() {
            "write" => json!(
                writer
                    .write(serde_json::from_value(expand(&step["entry"])).unwrap())
                    .unwrap()
            ),
            "has" => json!(writer.has_action(step["id"].as_str().unwrap()).unwrap()),
            "session" => json!(writer.get_by_session(step["id"].as_str().unwrap()).unwrap()),
            "all" => json!(writer.get_all().unwrap()),
            _ => unreachable!(),
        });
    }
    let mut stmt=connection.prepare("SELECT id,timestamp,session_id,surface_type,device_id,action_id,action_type,tool_name,inputs,outputs,side_effects,signature,parent_action_id,status,consent_method FROM audit_log ORDER BY timestamp").unwrap();
    let rows=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"timestamp":r.get::<_,String>(1)?,"session_id":r.get::<_,Option<String>>(2)?,"surface_type":r.get::<_,Option<String>>(3)?,"device_id":r.get::<_,Option<String>>(4)?,"action_id":r.get::<_,String>(5)?,"action_type":r.get::<_,String>(6)?,"tool_name":r.get::<_,Option<String>>(7)?,"inputs":r.get::<_,Option<String>>(8)?,"outputs":r.get::<_,Option<String>>(9)?,"side_effects":r.get::<_,Option<String>>(10)?,"signature":r.get::<_,Option<String>>(11)?,"parent_action_id":r.get::<_,Option<String>>(12)?,"status":r.get::<_,String>(13)?,"consent_method":r.get::<_,Option<String>>(14)?}))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    let mut actual = json!({"results":results,"rows":rows});
    for value in [&mut actual, &mut expected] {
        let ids = value["rows"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| {
                (
                    r["id"].as_str().unwrap().into(),
                    format!("<{}>", r["action_id"].as_str().unwrap()),
                )
            })
            .collect();
        normalize(value, &ids);
    }
    assert_eq!(actual, expected);
}
