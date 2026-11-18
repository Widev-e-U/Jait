#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::attention::*;
use serde_json::{Value, json};
use std::{
    cell::RefCell,
    collections::HashMap,
    path::PathBuf,
    rc::Rc,
    sync::{Arc, Mutex},
};
#[derive(Clone)]
struct Transport {
    effects: Arc<Mutex<Vec<Value>>>,
    surfaces: Vec<String>,
    current: Rc<RefCell<Value>>,
}
impl Transport {
    fn check(&self, name: &str) -> Result<(), String> {
        if self.current.borrow()["fail"] == name {
            Err(format!("{name} failed"))
        } else {
            Ok(())
        }
    }
}
impl AttentionTransport for Transport {
    fn live_surfaces(&self, user: Option<&str>) -> Result<Vec<String>, String> {
        self.effects
            .lock()
            .unwrap()
            .push(json!({"op":"live","user":user}));
        self.check("live")?;
        Ok(self.surfaces.clone())
    }
    fn broadcast_by_surface(
        &self,
        user: Option<&str>,
        make: &dyn Fn(&str) -> Value,
    ) -> Result<(), String> {
        self.effects.lock().unwrap().push(json!({"op":"bySurface","user":user,"events":self.surfaces.iter().map(|surface|json!({"surface":surface,"event":make(surface)})).collect::<Vec<_>>()}));
        self.check("bySurface")
    }
    fn broadcast_to_user(&self, user: &str, event: Value) -> Result<(), String> {
        self.effects
            .lock()
            .unwrap()
            .push(json!({"op":"user","user":user,"event":event}));
        self.check("user")
    }
    fn broadcast_all(&self, event: Value) -> Result<(), String> {
        self.effects
            .lock()
            .unwrap()
            .push(json!({"op":"all","event":event}));
        self.check("all")
    }
}
struct Sink {
    id: String,
    effects: Arc<Mutex<Vec<Value>>>,
    modes: Value,
}
impl Sink {
    fn deliver(&self, op: &str, value: Value) -> SinkResult {
        self.effects
            .lock()
            .unwrap()
            .push(json!({"op":format!("sink.{op}"),"id":self.id,"value":value}));
        match self.modes[op].as_str() {
            Some("throw") => Err("sink throw".into()),
            Some("reject") => Ok(Some(Box::pin(async { Err("sink rejection".into()) }))),
            _ => Ok(None),
        }
    }
}
impl AttentionSink for Sink {
    fn raised(&self, item: &AttentionItem) -> SinkResult {
        self.deliver("raised", json!(item))
    }
    fn cleared(&self, event: &AttentionCleared) -> SinkResult {
        self.deliver("cleared", json!(event))
    }
}
async fn trace(call: &Value) -> Value {
    let effects = Arc::new(Mutex::new(vec![]));
    let current = Rc::new(RefCell::new(Value::Null));
    let now = Rc::new(RefCell::new("2026-10-20T10:00:00.000Z".to_owned()));
    let transport = Transport {
        effects: effects.clone(),
        surfaces: serde_json::from_value(
            call.get("surfaces")
                .cloned()
                .unwrap_or(json!(["web", "desktop", "android", "watch"])),
        )
        .unwrap(),
        current: current.clone(),
    };
    let resolver: Option<UserResolver> = if call["noResolver"] == true {
        None
    } else {
        let effects = effects.clone();
        let config = call.clone();
        Some(Box::new(move |session| {
            effects
                .lock()
                .unwrap()
                .push(json!({"op":"resolve","session":session}));
            if config["resolveFail"] == session {
                Err("resolver failed".into())
            } else {
                Ok(config["users"][session].as_str().map(String::from))
            }
        }))
    };
    let clock = now.clone();
    let pending = Rc::new(RefCell::new(Vec::<SinkFuture>::new()));
    let sink_pending = pending.clone();
    let mut service = AttentionService::new(
        Box::new(transport),
        resolver,
        Box::new(move || clock.borrow().clone()),
        Box::new(move |task| sink_pending.borrow_mut().push(task)),
    );
    let mut objects: HashMap<String, Arc<dyn AttentionSink>> = HashMap::new();
    let mut removers = vec![];
    let mut results = vec![];
    for step in call["steps"].as_array().unwrap() {
        *current.borrow_mut() = step.clone();
        if let Some(time) = step["now"].as_str() {
            *now.borrow_mut() = time.into();
        }
        let result: Result<Value, String> = match step["op"].as_str().unwrap() {
            "add" => {
                let id = step["id"].as_str().unwrap();
                let sink = objects
                    .entry(id.into())
                    .or_insert_with(|| {
                        Arc::new(Sink {
                            id: id.into(),
                            effects: effects.clone(),
                            modes: call["sinks"][id].clone(),
                        })
                    })
                    .clone();
                removers.push(service.add_sink(sink));
                Ok(Value::Null)
            }
            "remove" => {
                service.remove_sink(&removers[step["index"].as_u64().unwrap() as usize]);
                Ok(Value::Null)
            }
            "raise" => service
                .raise(serde_json::from_value(step["input"].clone()).unwrap())
                .map(|v| json!(v)),
            "clear" => service
                .clear(
                    serde_json::from_value(step["kind"].clone()).unwrap(),
                    step["request"].as_str().unwrap(),
                    serde_json::from_value(step["reason"].clone()).unwrap(),
                    step["device"].as_str(),
                )
                .map(|v| json!(v)),
            "list" => Ok(json!(service.list(step["user"].as_str()))),
            "get" => Ok(json!(service.get(step["key"].as_str().unwrap()))),
            _ => panic!("unknown trace step"),
        };
        results.push(result.unwrap_or_else(|e| json!({"error":e})));
        let tasks = std::mem::take(&mut *pending.borrow_mut());
        for task in tasks {
            assert!(task.await.is_ok());
        }
    }
    let effects = effects.lock().unwrap().clone();
    json!({"results":results,"effects":effects,"open":service.list(None)})
}
async fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/parallel-20261020/attention/contracts"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    for (index, call) in calls.iter().enumerate() {
        assert_eq!(trace(call).await, expected[index], "case {index}: {call}");
    }
}
fn input(kind: &str, id: &str, extra: Value) -> Value {
    let mut base = json!({"kind":kind,"requestId":id,"sessionId":"session","title":"Title","body":"Body","urgent":true,"actions":[],"link":"/chat?sessionId=session","expiresAt":null});
    base.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    base
}
fn call(steps: Vec<Value>) -> Value {
    json!({"op":"nativeattention.trace","steps":steps})
}
#[tokio::test]
async fn stable_replacement_order_and_kind_identity() {
    compare(vec![call(vec![json!({"op":"raise","input":input("consent","same",json!({"userId":"owner"}))}),json!({"op":"raise","input":input("question","same",json!({}))}),json!({"op":"raise","input":input("consent","same",json!({"title":"Replacement","createdAt":"","detail":{"questions":[{"id":"x"}]}}))}),json!({"op":"get","key":"consent:same"}),json!({"op":"list"}),json!({"op":"get","key":"missing"})])]).await;
}
#[tokio::test]
async fn owner_resolution_nullish_values_and_list_filtering() {
    let mut c = call(vec![
        json!({"op":"raise","input":input("question","resolved",json!({"userId":null}))}),
        json!({"op":"raise","input":input("question","explicit",json!({"userId":"other"}))}),
        json!({"op":"raise","input":input("question","empty",json!({"userId":""}))}),
        json!({"op":"list","user":"owner"}),
        json!({"op":"list","user":""}),
        json!({"op":"list","user":null}),
        json!({"op":"clear","kind":"question","request":"empty","reason":"cancelled","device":""}),
        json!({"op":"clear","kind":"question","request":"resolved","reason":"answered","device":"watch"}),
    ]);
    c["users"] = json!({"session":"owner"});
    compare(vec![c]).await;
}
#[tokio::test]
async fn browser_only_unknown_surface_and_unattributed_clear() {
    let mut c = call(vec![
        json!({"op":"raise","input":input("consent","r",json!({"expiresAt":"soon","createdAt":"custom"}))}),
        json!({"op":"clear","kind":"consent","request":"r","reason":"timeout"}),
        json!({"op":"clear","kind":"consent","request":"r","reason":"superseded"}),
    ]);
    c["surfaces"] = json!(["web", "unknown", "watch"]);
    c["noResolver"] = json!(true);
    compare(vec![c]).await;
}
#[tokio::test]
async fn duplicate_sink_identity_unsubscribe_and_failure_isolation() {
    let mut c = call(vec![
        json!({"op":"add","id":"bad"}),
        json!({"op":"add","id":"async"}),
        json!({"op":"add","id":"good"}),
        json!({"op":"add","id":"good"}),
        json!({"op":"raise","input":input("question","r",json!({}))}),
        json!({"op":"remove","index":3}),
        json!({"op":"raise","input":input("question","r",json!({}))}),
        json!({"op":"remove","index":3}),
        json!({"op":"remove","index":3}),
        json!({"op":"clear","kind":"question","request":"r","reason":"answered"}),
    ]);
    c["sinks"] = json!({"bad":{"raised":"throw","cleared":"reject"},"async":{"raised":"reject","cleared":"throw"}});
    compare(vec![c]).await;
}
#[tokio::test]
async fn transport_failure_order_keeps_prior_state_changes() {
    let mut calls = vec![];
    for fail in ["live", "bySurface", "all", "user"] {
        calls.push(call(vec![json!({"op":"add","id":"sink"}),json!({"op":"raise","input":input("consent","r",json!({"userId":if fail=="user" {json!("owner")} else {Value::Null}})),"fail":fail}),json!({"op":"get","key":"consent:r"}),json!({"op":"clear","kind":"consent","request":"r","reason":"cancelled","fail":fail}),json!({"op":"get","key":"consent:r"})]));
    }
    let mut resolver = call(vec![
        json!({"op":"raise","input":input("question","r",json!({}))}),
        json!({"op":"list"}),
    ]);
    resolver["resolveFail"] = json!("session");
    calls.push(resolver);
    compare(calls).await;
}
#[test]
fn exported_action_and_surface_helpers_match() {
    let requests = vec![
        json!({"questions":[]}),
        json!({"questions":[{"id":"q","options":[{"label":"a"},{"label":"a:b"},{"label":"😀"},{"label":"fourth"}],"allowFreeformInput":true}]}),
        json!({"questions":[{"id":"q","options":[],"allowFreeformInput":true}]}),
        json!({"questions":[{"id":"q","options":[{"label":"a"}],"multiSelect":true,"allowFreeformInput":true}]}),
        json!({"questions":[{"id":"q","options":[{"label":"a"}],"multiSelect":true}]}),
        json!({"questions":[{"id":"q","allowFreeformInput":true},{"id":"b"}]}),
        json!({"questions":[{"id":"none"}]}),
    ];
    let keys = vec![
        json!({"kind":"consent","request":"a:b"}),
        json!({"kind":"question","request":""}),
    ];
    let surfaces: Vec<_> = ["web", "desktop", "android", "watch", "unknown"]
        .into_iter()
        .flat_map(|surface| {
            [
                json!({"surface":surface,"live":[]}),
                json!({"surface":surface,"live":["desktop","web"]}),
            ]
        })
        .collect();
    let call = json!({"op":"nativeattention.helpers","keys":keys,"surfaces":surfaces,"questions":requests});
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/parallel-20261020/attention/helpers"),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap();
    let actual = json!({"actions":consent_attention_actions(),"keys":keys.iter().map(|v|attention_key(serde_json::from_value(v["kind"].clone()).unwrap(),v["request"].as_str().unwrap())).collect::<Vec<_>>(),"surfaces":surfaces.iter().map(|v|should_notify_natively(v["surface"].as_str().unwrap(),&serde_json::from_value::<Vec<String>>(v["live"].clone()).unwrap())).collect::<Vec<_>>(),"questions":requests.iter().map(|v|attention_actions_for_question(&serde_json::from_value::<Vec<AttentionQuestion>>(v["questions"].clone()).unwrap())).collect::<Vec<_>>()});
    assert_eq!(actual, expected[0]);
}
