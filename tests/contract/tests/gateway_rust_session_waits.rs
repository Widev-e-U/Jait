#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::session_waits::*;
use serde_json::{Value, json};
use std::{cell::RefCell, collections::HashMap, path::PathBuf, rc::Rc};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn handles(waits: Vec<WaitHandle>) -> Value {
    Value::Array(
        waits
            .iter()
            .map(|wait| serde_json::to_value(&*wait.borrow()).unwrap())
            .collect(),
    )
}
fn value(wait: Option<WaitHandle>) -> Value {
    wait.map_or(Value::Null, |wait| {
        serde_json::to_value(&*wait.borrow()).unwrap()
    })
}
fn observer(service: &Rc<SessionWaitService>, changes: &Rc<RefCell<Vec<Value>>>, config: &Value) {
    if config.is_null() || config == &json!(false) {
        service.set_broadcaster(None);
        return;
    }
    let weak = Rc::downgrade(service);
    let changes = changes.clone();
    let config = config.clone();
    service.set_broadcaster(Some(Rc::new(move |change| {
        let change = change.borrow();
        changes
            .borrow_mut()
            .push(json!({"sessionId":change.session_id,"waits":handles(change.waits.clone())}));
        if let Some(label) = config["mutateLabel"].as_str()
            && let Some(first) = change.waits.first()
        {
            first.borrow_mut().label = label.into();
        }
        let service = weak.upgrade().unwrap();
        if config["disable"] == true {
            service.set_broadcaster(None);
        }
        if let Some(key) = config["clearKey"].as_str() {
            service.clear(&key.into())?;
        }
        if config["fail"] == true {
            return Err("delivery failed".into());
        }
        Ok(())
    })));
}
fn native(call: &Value) -> Value {
    if call["op"] == "nativewaits.labels" {
        return json!({
            "labels":call["kinds"].as_array().unwrap().iter().map(|kind|session_wait_label(serde_json::from_value(kind.clone()).unwrap())).collect::<Vec<_>>(),
            "blocking":BLOCKING_SESSION_WAIT_KINDS,
            "keys":call["ids"].as_array().unwrap().iter().map(|id| {
                let id = id.as_str().unwrap().into();
                [terminal_wait_key(&id),browser_wait_key(&id),background_wait_key(&id)]
            }).collect::<Vec<_>>()
        });
    }
    let service = Rc::new(SessionWaitService::new());
    let changes = Rc::new(RefCell::new(vec![]));
    observer(&service, &changes, &json!({}));
    let mut held = HashMap::<String, WaitHandle>::new();
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let outcome = (|| -> Result<Value, String> {
            Ok(match step["op"].as_str().unwrap() {
                "raise" => {
                    let wait =
                        service.raise(serde_json::from_value(step["input"].clone()).unwrap())?;
                    if let Some(id) = step["hold"].as_str() {
                        held.insert(id.into(), wait.clone());
                    }
                    value(Some(wait))
                }
                "clear" => json!(service.clear(&step["key"].as_str().unwrap().into())?),
                "clearSession" => {
                    service.clear_session(&step["sessionId"].as_str().unwrap().into())?;
                    Value::Null
                }
                "list" => handles(service.list(&step["sessionId"].as_str().unwrap().into())),
                "snapshot" => handles(service.snapshot()),
                "get" => value(service.get(&step["key"].as_str().unwrap().into())),
                "held" => value(held.get(step["id"].as_str().unwrap()).cloned()),
                "alias" => json!(match (
                    held.get(step["id"].as_str().unwrap()),
                    service.get(&step["key"].as_str().unwrap().into())
                ) {
                    (Some(a), Some(b)) => Rc::ptr_eq(a, &b),
                    (None, None) => true,
                    _ => false,
                }),
                "mutate" => {
                    let mut record =
                        serde_json::to_value(&*held[step["id"].as_str().unwrap()].borrow())
                            .unwrap();
                    for (key, field) in step["patch"].as_object().unwrap() {
                        record[key] = field.clone();
                    }
                    *held[step["id"].as_str().unwrap()].borrow_mut() =
                        serde_json::from_value(record).unwrap();
                    Value::Null
                }
                "observer" => {
                    observer(&service, &changes, &step["observer"]);
                    Value::Null
                }
                "reset" => {
                    service.clear_for_tests();
                    Value::Null
                }
                _ => panic!("unknown native wait action"),
            })
        })();
        results.push(match outcome {
            Ok(value) => json!({"value":value,"snapshot":handles(service.snapshot())}),
            Err(error) => json!({"error":error,"snapshot":handles(service.snapshot())}),
        });
    }
    json!({"results":results,"changes":*changes.borrow(),"snapshot":handles(service.snapshot())})
}
fn compare(calls: Vec<Value>) {
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/session-waits")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    assert_eq!(expected.as_array().unwrap().len(), calls.len());
    for (call, expected) in calls.iter().zip(expected.as_array().unwrap()) {
        assert_eq!(&native(call), expected, "call {call}");
    }
}
fn raise(key: &str, kind: &str, session: &str) -> Value {
    json!({"op":"raise","input":{"key":key,"kind":kind,"sessionId":session}})
}
fn sequence(steps: Vec<Value>) -> Value {
    json!({"op":"nativewaits.sequence","steps":steps})
}
#[test]
fn every_label_default_and_stable_key_matches_shared_exports() {
    let kinds = [
        "question",
        "consent",
        "secret",
        "browser",
        "terminal",
        "background",
    ];
    let mut steps: Vec<_> = kinds.iter().map(|kind| raise(kind, kind, "chat")).collect();
    steps.extend([
        json!({"op":"raise","input":{"key":"blank","kind":"question","sessionId":"","label":"","detail":"","blocking":false}}),
        json!({"op":"raise","input":{"key":"null","kind":"terminal","sessionId":"chat","label":null,"detail":null,"blocking":null}}),
        json!({"op":"raise","input":{"key":"detail","kind":"background","sessionId":"chat","label":"custom","detail":"build","blocking":false}}),
    ]);
    compare(vec![
        json!({"op":"nativewaits.labels","kinds":kinds,"ids":["","term-1","a:b","😀\n\u{0000}"]}),
        sequence(steps),
    ]);
}
#[test]
fn idempotent_raises_and_changed_fields_have_exact_broadcasts() {
    let mut steps = vec![
        raise("key", "question", "chat"),
        raise("key", "question", "chat"),
        raise("key", "question", "chat"),
    ];
    for patch in [
        json!({"detail":"new"}),
        json!({"label":"custom"}),
        json!({"blocking":false}),
        json!({"kind":"terminal"}),
        json!({"sessionId":"other"}),
    ] {
        let mut step = raise("key", "question", "chat");
        for (key, value) in patch.as_object().unwrap() {
            step["input"][key] = value.clone();
        }
        steps.push(step);
    }
    steps.push(json!({"op":"list","sessionId":"chat"}));
    compare(vec![sequence(steps)]);
}
#[test]
fn clears_sessions_resets_and_observer_replacement_match() {
    compare(vec![sequence(vec![
        raise("a", "question", "one"),
        raise("b", "consent", "one"),
        raise("c", "browser", "two"),
        json!({"op":"clear","key":"a"}),
        json!({"op":"clear","key":"a"}),
        json!({"op":"clearSession","sessionId":"missing"}),
        json!({"op":"clearSession","sessionId":"one"}),
        json!({"op":"observer","observer":null}),
        raise("d", "secret", "two"),
        json!({"op":"observer","observer":{}}),
        json!({"op":"clearSession","sessionId":"two"}),
        raise("e", "terminal", "one"),
        json!({"op":"reset"}),
        raise("f", "background", "one"),
        json!({"op":"get","key":"e"}),
        json!({"op":"snapshot"}),
    ])]);
}
#[test]
fn blocking_locale_order_and_collation_ties_preserve_insertion_order() {
    let mut calls = vec![];
    for ids in [
        vec!["a", "A", "ä", "e\u{301}", "é", "😀", "2", "10"],
        vec!["é", "e\u{301}", "ä", "A", "a", "10", "2", "😀"],
    ] {
        let mut steps = vec![];
        for session in &ids {
            for key in &ids {
                steps.push(raise(key, "question", session));
            }
        }
        let mut background = raise("!first", "background", "0");
        background["input"]["blocking"] = json!(false);
        steps.push(background);
        steps.push(json!({"op":"snapshot"}));
        steps.push(json!({"op":"list","sessionId":"é"}));
        calls.push(sequence(steps));
    }
    compare(calls);
}
#[test]
fn return_identity_and_external_mutation_follow_reference_map_keys() {
    let mut held = raise("key", "question", "chat");
    held["hold"] = json!("first");
    compare(vec![sequence(vec![
        held,
        json!({"op":"alias","id":"first","key":"key"}),
        json!({"op":"mutate","id":"first","patch":{"key":"mutated","detail":"caller-owned"}}),
        json!({"op":"get","key":"key"}),
        json!({"op":"get","key":"mutated"}),
        raise("key", "question", "chat"),
        json!({"op":"alias","id":"first","key":"key"}),
        json!({"op":"held","id":"first"}),
        json!({"op":"clear","key":"key"}),
    ])]);
}
#[test]
fn callback_failures_and_reentrant_mutation_preserve_state_order() {
    let mut calls = vec![];
    for observer in [
        json!({"fail":true}),
        json!({"disable":true,"clearKey":"key","mutateLabel":"during callback","fail":true}),
    ] {
        calls.push(sequence(vec![
            json!({"op":"observer","observer":observer}),
            raise("key", "question", "chat"),
            json!({"op":"get","key":"key"}),
            json!({"op":"clear","key":"key"}),
            raise("other", "question", "chat"),
            json!({"op":"clearSession","sessionId":"chat"}),
        ]));
    }
    compare(calls);
}
