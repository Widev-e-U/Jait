//! Stateful contracts against the actual connected-node registry export.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use chrono::{DateTime, SecondsFormat};
use jait_gateway::services::node_state_manager::NodeStateManager;
use serde_json::{Value, json};
use std::{cell::Cell, path::PathBuf};

fn upsert(id: &str, name: &str, client: &str, extra: Value) -> Value {
    let mut input =
        json!({"id":id,"name":name,"platform":"linux","role":"remote","clientId":client});
    input
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    json!({"action":"upsert","input":input})
}
fn native(call: &Value) -> Value {
    let ticks = Cell::new(0_i64);
    let epoch = call["epoch"].as_i64().unwrap_or(1_700_000_000_000);
    let mut manager = NodeStateManager::with_clock(|| {
        let index = ticks.get();
        ticks.set(index + 1);
        DateTime::from_timestamp_millis(epoch + index)
            .unwrap()
            .to_rfc3339_opts(SecondsFormat::Millis, true)
    });
    let results: Vec<Value> = call["steps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|step| match step["action"].as_str().unwrap() {
            "upsert" => {
                json!(manager.upsert_node(serde_json::from_value(step["input"].clone()).unwrap()))
            }
            "remove" => json!(manager.remove_node(step["id"].as_str().unwrap())),
            "removeClient" => {
                json!(manager.remove_nodes_by_client_id(step["clientId"].as_str().unwrap()))
            }
            "get" => json!(manager.get_node(step["id"].as_str().unwrap())),
            "client" => json!(manager.get_client_id(step["id"].as_str().unwrap())),
            "list" => json!(manager.list_nodes()),
            "snapshot" => json!(manager.get_snapshot()),
            _ => panic!("unknown action"),
        })
        .collect();
    json!({"results":results,"ticks":ticks.get()})
}
fn numeric(value: Value) -> Value {
    match value {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(v) => Value::Array(v.into_iter().map(numeric).collect()),
        Value::Object(v) => Value::Object(v.into_iter().map(|(k, v)| (k, numeric(v))).collect()),
        v => v,
    }
}
fn compare(traces: Vec<Vec<Value>>) {
    let calls: Vec<_> = traces
        .into_iter()
        .map(|steps| json!({"op":"nativenodestate.trace","steps":steps}))
        .collect();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/node-state"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<_> = calls.iter().map(native).collect();
    assert_eq!(
        numeric(json!(actual)),
        numeric(expected),
        "traces={calls:?}"
    );
}
#[test]
fn empty_registry_and_missing_removals_do_not_tick() {
    compare(vec![vec![
        json!({"action":"list"}),
        json!({"action":"get","id":"missing"}),
        json!({"action":"client","id":"missing"}),
        json!({"action":"remove","id":"missing"}),
        json!({"action":"removeClient","clientId":"missing"}),
        json!({"action":"snapshot"}),
    ]]);
}
#[test]
fn partial_updates_null_fallbacks_and_explicit_resets() {
    compare(vec![vec![
        upsert(
            "a",
            "A",
            "x",
            json!({"protocolVersion":4,"capabilities":{"providers":["a","a"],"surfaces":["terminal","browser"],"tools":["shell"],"screenShare":true,"voice":true,"preview":true,"interactiveTerminal":true}}),
        ),
        upsert(
            "a",
            "A2",
            "x",
            json!({"capabilities":{"providers":null,"tools":[],"voice":false}}),
        ),
        upsert(
            "a",
            "A3",
            "y",
            json!({"protocolVersion":null,"capabilities":null}),
        ),
        json!({"action":"client","id":"a"}),
        upsert(
            "a",
            "A4",
            "y",
            json!({"protocolVersion":0,"capabilities":{"providers":[],"surfaces":[],"screenShare":false,"preview":false,"interactiveTerminal":false}}),
        ),
        upsert("a", "A5", "y", json!({"protocolVersion":2.5})),
        json!({"action":"snapshot"}),
    ]]);
}
#[test]
fn disconnect_reconnect_and_reassignment_preserve_only_live_first_connection() {
    compare(vec![vec![
        upsert(
            "a",
            "same",
            "first",
            json!({"platform":"windows","role":"desktop"}),
        ),
        upsert(
            "b",
            "same",
            "first",
            json!({"platform":"android","role":"mobile"}),
        ),
        upsert(
            "a",
            "same",
            "second",
            json!({"platform":"web","role":"browser"}),
        ),
        json!({"action":"removeClient","clientId":"first"}),
        json!({"action":"get","id":"b"}),
        json!({"action":"remove","id":"a"}),
        json!({"action":"remove","id":"a"}),
        upsert(
            "a",
            "same",
            "third",
            json!({"platform":"ios","role":"mobile"}),
        ),
        upsert(
            "b",
            "same",
            "third",
            json!({"platform":"macos","role":"desktop"}),
        ),
        json!({"action":"snapshot"}),
    ]]);
}
#[test]
fn gateway_exemption_uses_latest_explicit_flag_and_direct_removal_still_works() {
    compare(vec![vec![
        upsert(
            "g",
            "Gateway",
            "client",
            json!({"isGateway":true,"role":"gateway"}),
        ),
        upsert("a", "Alpha", "client", json!({})),
        upsert("b", "Beta", "other", json!({})),
        upsert("c", "Charlie", "client", json!({"isGateway":false})),
        json!({"action":"removeClient","clientId":"client"}),
        json!({"action":"snapshot"}),
        upsert("g", "Gateway", "client", json!({})),
        json!({"action":"removeClient","clientId":"client"}),
        upsert("g", "Gateway", "client", json!({"isGateway":true})),
        json!({"action":"remove","id":"g"}),
        json!({"action":"snapshot"}),
    ]]);
}
#[test]
fn unicode_collation_and_stable_canonical_ties() {
    let names = [
        "z", "Z", "a", "A", "á", "ä", "Å", "a\u{301}", "a\u{308}", "a!", "a b", "a-b", "a_b", "2",
        "10", "α", "Ж", "中", "😀", "🙂", "", "é", "e\u{301}", "\0", "a\0", "å", "ß", "ss", "œ",
        "oe", "I", "i", "İ", "ı",
    ];
    let mut trace: Vec<_> = names
        .iter()
        .enumerate()
        .map(|(i, n)| upsert(&i.to_string(), n, "x", json!({})))
        .collect();
    trace.push(json!({"action":"list"}));
    trace.push(json!({"action":"snapshot"}));
    compare(vec![trace]);
}
#[test]
fn updates_keep_tie_position_while_remove_and_reinsert_append() {
    compare(vec![vec![
        upsert("2", "tie", "x", json!({})),
        upsert("1", "tie", "x", json!({})),
        upsert("0", "tie", "x", json!({})),
        upsert("2", "tie", "new", json!({})),
        json!({"action":"list"}),
        json!({"action":"remove","id":"1"}),
        upsert("1", "tie", "x", json!({})),
        json!({"action":"list"}),
        json!({"action":"removeClient","clientId":"x"}),
        json!({"action":"snapshot"}),
    ]]);
}
#[test]
fn independent_managers_and_all_capability_fields() {
    let fields = [
        "providers",
        "surfaces",
        "tools",
        "screenShare",
        "voice",
        "preview",
        "interactiveTerminal",
    ];
    let traces = fields
        .into_iter()
        .map(|field| {
            let mut value = json!({});
            value[field] = match field {
                "providers" | "tools" => json!(["test"]),
                "surfaces" => json!(["computer", "filesystem"]),
                _ => json!(true),
            };
            vec![
                upsert(
                    "__proto__",
                    "constructor",
                    "",
                    json!({"capabilities":value}),
                ),
                upsert("__proto__", "constructor", "", json!({"capabilities":{}})),
                json!({"action":"snapshot"}),
            ]
        })
        .collect();
    compare(traces);
}
#[test]
fn long_registry_trace_preserves_clock_count_and_insertion_order() {
    let mut steps = Vec::new();
    for i in 0..80 {
        steps.push(upsert(
            &i.to_string(),
            &format!("Node {}", i % 9),
            &format!("c{}", i % 4),
            json!({"isGateway":i%13==0}),
        ));
    }
    for i in (0..80).step_by(5) {
        steps.push(upsert(&i.to_string(), "renamed", "c0", json!({})));
    }
    steps.extend([
        json!({"action":"removeClient","clientId":"c0"}),
        json!({"action":"removeClient","clientId":"c3"}),
        json!({"action":"snapshot"}),
    ]);
    compare(vec![steps]);
}
