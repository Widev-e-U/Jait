#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::session_waits::*;
use serde_json::{Value, json};
use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    path::PathBuf,
    rc::Rc,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn waits(values: Vec<WaitHandle>) -> Value {
    json!(
        values
            .iter()
            .map(|v| serde_json::to_value(&*v.borrow()).unwrap())
            .collect::<Vec<_>>()
    )
}
fn change(value: &SessionWaitChangeHandle) -> Value {
    let v = value.borrow();
    json!({"sessionId":v.session_id,"waits":waits(v.waits.clone())})
}
struct Fixture {
    service: SessionWaitService,
    callbacks: RefCell<HashMap<String, SessionWaitBroadcaster>>,
    unsubs: RefCell<HashMap<String, SessionWaitUnsubscribe>>,
    events: RefCell<Vec<Value>>,
    retained: RefCell<Vec<SessionWaitChangeHandle>>,
    mode: String,
    mutated: Cell<bool>,
    nested: Cell<bool>,
}
impl Fixture {
    fn callback(self: &Rc<Self>, name: &str) -> SessionWaitBroadcaster {
        if let Some(callback) = self.callbacks.borrow().get(name) {
            return callback.clone();
        }
        let weak = Rc::downgrade(self);
        let id = name.to_string();
        let callback: SessionWaitBroadcaster = Rc::new(move |event| {
            let fixture = weak.upgrade().unwrap();
            fixture.receive(&id, event)
        });
        self.callbacks
            .borrow_mut()
            .insert(name.into(), callback.clone());
        callback
    }
    fn receive(self: &Rc<Self>, name: &str, event: SessionWaitChangeHandle) -> Result<(), String> {
        self.events
            .borrow_mut()
            .push(json!({"name":name,"change":change(&event)}));
        self.retained.borrow_mut().push(event.clone());
        if self.mode == "mutation" {
            if name == "broadcaster" && !self.mutated.replace(true) {
                let unsubscribe = self.unsubs.borrow()["b"].clone();
                unsubscribe();
                let unsubscribe = self.service.subscribe(self.callback("d"));
                self.unsubs.borrow_mut().insert("d".into(), unsubscribe);
                let mut e = event.borrow_mut();
                e.session_id = "mutated".into();
                if let Some(wait) = e.waits.first() {
                    wait.borrow_mut().label = "changed by broadcaster".into();
                }
            }
            if name == "a" {
                event.borrow_mut().waits.clear();
            }
        }
        if self.mode == "nested" && name == "a" && !self.nested.replace(true) {
            let unsubscribe = self.unsubs.borrow()["a"].clone();
            unsubscribe();
            self.service.clear(&"key".into())?;
        }
        if (self.mode == "failure-broadcaster" && name == "broadcaster")
            || (self.mode == "failure-subscriber" && name == "b")
        {
            return Err("delivery failed".into());
        }
        Ok(())
    }
}
fn compare(mut call: Value) {
    call["op"] = json!("nativewaitsubscribers.sequence");
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/wait-subscriber-refresh")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let fixture = Rc::new(Fixture {
        service: SessionWaitService::new(),
        callbacks: RefCell::new(HashMap::new()),
        unsubs: RefCell::new(HashMap::new()),
        events: RefCell::new(vec![]),
        retained: RefCell::new(vec![]),
        mode: call["mode"].as_str().unwrap().into(),
        mutated: Cell::new(false),
        nested: Cell::new(false),
    });
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        let outcome = (|| -> Result<Value, String> {
            Ok(match step["op"].as_str().unwrap() {
                "subscribe" => {
                    let unsubscribe = fixture
                        .service
                        .subscribe(fixture.callback(step["name"].as_str().unwrap()));
                    fixture
                        .unsubs
                        .borrow_mut()
                        .insert(step["alias"].as_str().unwrap().into(), unsubscribe);
                    Value::Null
                }
                "unsubscribe" => {
                    let unsubscribe =
                        fixture.unsubs.borrow()[step["alias"].as_str().unwrap()].clone();
                    unsubscribe();
                    Value::Null
                }
                "broadcaster" => {
                    fixture
                        .service
                        .set_broadcaster(step["name"].as_str().map(|name| fixture.callback(name)));
                    Value::Null
                }
                "raise" => {
                    let wait = fixture
                        .service
                        .raise(serde_json::from_value(step["input"].clone()).unwrap())?;
                    serde_json::to_value(&*wait.borrow()).unwrap()
                }
                "clear" => json!(
                    fixture
                        .service
                        .clear(&step["key"].as_str().unwrap().into())?
                ),
                "reset" => {
                    fixture.service.clear_for_tests();
                    Value::Null
                }
                _ => panic!("unknown subscription step"),
            })
        })();
        let snapshot = waits(fixture.service.snapshot());
        results.push(match outcome {
            Ok(value) => json!({"value":value,"snapshot":snapshot}),
            Err(error) => json!({"error":error,"snapshot":snapshot}),
        });
    }
    let actual = json!({"results":results,"events":*fixture.events.borrow(),"retained":fixture.retained.borrow().iter().map(change).collect::<Vec<_>>(),"snapshot":waits(fixture.service.snapshot())});
    assert_eq!(actual, expected, "mode {}", call["mode"]);
}
fn subscribe(name: &str) -> Value {
    json!({"op":"subscribe","alias":name,"name":name})
}
fn raise(key: &str) -> Value {
    json!({"op":"raise","input":{"key":key,"kind":"question","sessionId":"chat"}})
}
#[test]
fn duplicate_identity_old_unsubscribe_and_test_reset_match_the_live_set() {
    compare(
        json!({"mode":"basic","steps":[{"op":"subscribe","alias":"a1","name":"a"},{"op":"subscribe","alias":"a2","name":"a"},subscribe("b"),{"op":"broadcaster","name":"a"},raise("key"),{"op":"unsubscribe","alias":"a1"},raise("second"),{"op":"unsubscribe","alias":"b"},{"op":"subscribe","alias":"a3","name":"a"},{"op":"unsubscribe","alias":"a2"},raise("third"),{"op":"subscribe","alias":"a4","name":"a"},{"op":"reset"},raise("fourth"),{"op":"unsubscribe","alias":"a3"},raise("fifth")]}),
    );
}
#[test]
fn broadcaster_and_subscribers_share_the_event_and_visit_live_additions() {
    compare(
        json!({"mode":"mutation","steps":[subscribe("a"),subscribe("b"),subscribe("c"),{"op":"broadcaster","name":"broadcaster"},raise("key"),{"op":"clear","key":"key"}]}),
    );
}
#[test]
fn nested_emission_and_self_unsubscribe_keep_outer_iteration_stable() {
    compare(
        json!({"mode":"nested","steps":[subscribe("a"),subscribe("b"),subscribe("c"),{"op":"broadcaster","name":"broadcaster"},raise("key"),raise("second")]}),
    );
}
#[test]
fn failures_stop_later_callbacks_without_rolling_back_committed_waits() {
    for mode in ["failure-broadcaster", "failure-subscriber"] {
        compare(
            json!({"mode":mode,"steps":[subscribe("a"),subscribe("b"),subscribe("c"),{"op":"broadcaster","name":"broadcaster"},raise("key"),{"op":"unsubscribe","alias":"b"},{"op":"broadcaster","name":null},{"op":"clear","key":"key"}]}),
        );
    }
}
