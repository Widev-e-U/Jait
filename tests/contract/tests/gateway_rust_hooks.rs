#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::scheduler::hooks::{Handler, HookBus, HookError, register_built_in_hooks};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/native-hooks")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn observe(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &directory(),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
fn normalize(value: &mut Value) {
    match value {
        Value::Object(object) => {
            if let Some(timestamp) = object.get_mut("timestamp") {
                let s = timestamp.as_str().unwrap();
                assert!(s.len() >= 24 && s.contains('T') && s.ends_with('Z'));
                *timestamp = json!("<time>");
            }
            for value in object.values_mut() {
                normalize(value)
            }
        }
        Value::Array(values) => {
            for value in values {
                normalize(value)
            }
        }
        _ => {}
    }
}
fn scenario(mut call: Value) {
    call["op"] = json!("nativehooks.run");
    let mut expected = observe(call.clone());
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let used = Arc::new(Mutex::new(HashSet::<String>::new()));
    let registry = Arc::new(Mutex::new(BTreeMap::<String, Handler>::new()));
    let mut names = HashSet::<String>::new();
    for step in call["steps"].as_array().unwrap() {
        if let Some(name) = step["handler"].as_str() {
            names.insert(name.into());
        }
    }
    if let Some(actions) = call["actions"].as_object() {
        for (id, action) in actions {
            names.insert(id.clone());
            if let Some(id) = action["handler"].as_str() {
                names.insert(id.into());
            }
        }
    }
    for id in names {
        let events = events.clone();
        let used = used.clone();
        let registry_ref = registry.clone();
        let handler_id = id.clone();
        let action = call["actions"][&id].clone();
        let handler: Handler = Arc::new(move |event, bus| {
            events
                .lock()
                .unwrap()
                .push(json!({"id":handler_id,"event":event}));
            if action.is_null() || !used.lock().unwrap().insert(handler_id.clone()) {
                return Ok(());
            }
            match action["op"].as_str().unwrap() {
                "on" | "off" => {
                    let handler = registry_ref
                        .lock()
                        .unwrap()
                        .get(action["handler"].as_str().unwrap())
                        .unwrap()
                        .clone();
                    if action["op"] == "on" {
                        bus.on(action["type"].as_str().unwrap(), handler);
                    } else {
                        bus.off(action["type"].as_str().unwrap(), &handler);
                    }
                }
                "emit" => bus.emit(action["type"].as_str().unwrap(), action["payload"].clone())?,
                "throw" => return Err(HookError::Handler("handler rejected".into())),
                "mutate" => event.payload = action["payload"].clone(),
                _ => panic!("unknown handler action"),
            };
            Ok(())
        });
        registry.lock().unwrap().insert(id, handler);
    }
    let bus = HookBus::with_clock(|| "2026-10-18T12:00:00.000Z".into());
    if call["builtins"] == true {
        register_built_in_hooks(&bus, call["root"].as_str().map(PathBuf::from))
    }
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let result = match step["op"].as_str().unwrap() {
            "on" | "off" => {
                let h = registry
                    .lock()
                    .unwrap()
                    .get(step["handler"].as_str().unwrap())
                    .unwrap()
                    .clone();
                if step["op"] == "on" {
                    bus.on(step["type"].as_str().unwrap(), h);
                } else {
                    bus.off(step["type"].as_str().unwrap(), &h);
                }
                Value::Null
            }
            "emit" => bus
                .emit(step["type"].as_str().unwrap(), step["payload"].clone())
                .map(|_| Value::Null)
                .unwrap_or(json!({"error":true})),
            "count" => json!(bus.listener_count(step["type"].as_str())),
            "types" => json!(bus.registered_event_types()),
            _ => panic!("unknown operation"),
        };
        results.push(result);
    }
    registry.lock().unwrap().clear();
    let mut actual = json!({"results":results,"events":events.lock().unwrap().clone()});
    normalize(&mut actual);
    normalize(&mut expected);
    assert_eq!(actual, expected);
}
#[test]
fn hook_identity_order_wildcards_removal_and_re_registration_match_reference() {
    scenario(json!({"steps":[
        {"op":"off","type":"none","handler":"a"},{"op":"on","type":"session.*","handler":"a"},
        {"op":"on","type":"session.start","handler":"b"},{"op":"on","type":"session.*","handler":"a"},
        {"op":"on","type":"*","handler":"c"},{"op":"types"},{"op":"count"},{"op":"count","type":""},
        {"op":"count","type":"session.*"},{"op":"count","type":"session.start"},
        {"op":"emit","type":"session.start","payload":{"x":1}},
        {"op":"emit","type":"session","payload":null},
        {"op":"emit","type":"session.other","payload":[]},
        {"op":"off","type":"session.*","handler":"a"},{"op":"types"},{"op":"count"},
        {"op":"on","type":"session.*","handler":"a"},{"op":"types"},
        {"op":"emit","type":"session.start","payload":{"x":2}}
    ]}));
}
#[test]
fn hook_emission_observes_live_listener_mutation_and_nested_emission() {
    for action in [
        json!({"op":"off","type":"x","handler":"b"}),
        json!({"op":"on","type":"x","handler":"c"}),
        json!({"op":"on","type":"x.*","handler":"c"}),
        json!({"op":"emit","type":"nested","payload":{"nested":true}}),
        json!({"op":"mutate","payload":{"changed":true}}),
        json!({"op":"throw"}),
    ] {
        scenario(json!({"actions":{"a":action},"steps":[
            {"op":"on","type":"x","handler":"a"},{"op":"on","type":"x","handler":"b"},
            {"op":"on","type":"nested","handler":"c"},
            {"op":"emit","type":"x","payload":{"initial":true}},
            {"op":"emit","type":"x.child","payload":null},
            {"op":"emit","type":"x","payload":{"again":true}},
            {"op":"types"},{"op":"count"}
        ]}));
    }
    scenario(
        json!({"actions":{"a":{"op":"off","type":"x","handler":"a"}},"steps":[
            {"op":"on","type":"x","handler":"a"},{"op":"emit","type":"x","payload":1},{"op":"types"},{"op":"count"}
        ]}),
    );
}
#[test]
fn built_in_hooks_read_ordered_bootstrap_files_and_emit_reentrant_lifecycle_event() {
    let dir = directory();
    fs::create_dir_all(dir.join(".jait")).unwrap();
    fs::write(dir.join(".jait/bootstrap.md"), "first 資料").unwrap();
    fs::write(dir.join(".jait/session-bootstrap.md"), [0xff, b'a']).unwrap();
    fs::write(dir.join("BOOTSTRAP.md"), "third").unwrap();
    scenario(json!({"builtins":true,"root":dir,"steps":[
        {"op":"types"},{"op":"count"},
        {"op":"on","type":"session.*","handler":"all"},
        {"op":"on","type":"session.bootstrap.loaded","handler":"loaded"},
        {"op":"emit","type":"session.start","payload":{"sessionId":"s"}},
        {"op":"emit","type":"session.end","payload":{"sessionId":"s"}},
        {"op":"count","type":"surface.*"}
    ]}));
    scenario(json!({"builtins":true,"root":directory(),"steps":[
        {"op":"on","type":"session.bootstrap.loaded","handler":"loaded"},
        {"op":"emit","type":"session.start","payload":{"sessionId":"s","projectRoot":dir}}
    ]}));
}
#[test]
fn built_in_hooks_keep_read_failures_visible_and_missing_files_are_allowed() {
    let dir = directory();
    fs::create_dir_all(dir.join(".jait/bootstrap.md")).unwrap();
    for root in [dir, directory()] {
        scenario(json!({"builtins":true,"root":root,"steps":[
            {"op":"on","type":"session.bootstrap.loaded","handler":"loaded"},
            {"op":"emit","type":"session.start","payload":{}},{"op":"count"}
        ]}));
    }
}
#[test]
fn hook_unsubscribe_handle_and_default_clock_are_usable() {
    let bus = HookBus::new();
    let handler: Handler = Arc::new(|event, _| {
        assert!(event.timestamp.len() >= 24 && event.timestamp.ends_with('Z'));
        Ok(())
    });
    let subscription = bus.on("x", handler);
    bus.emit("x", Value::Null).unwrap();
    subscription.unsubscribe();
    assert_eq!(bus.listener_count(None), 0);
}
