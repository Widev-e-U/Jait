#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    surfaces::registry::*,
    tools::{
        core_io::{HostError, HostPort},
        surfaces::{self, SurfaceTools},
    },
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
const ID: &str = "01800000-0000-7000-8000-000000000001";
struct Fixture {
    id: String,
    kind: String,
    config: Value,
    state: Mutex<(SurfaceState, String)>,
    events: Arc<Mutex<Vec<Value>>>,
}
impl Fixture {
    fn new(id: &str, kind: &str, config: Value, events: Arc<Mutex<Vec<Value>>>) -> Self {
        Self {
            id: id.into(),
            kind: kind.into(),
            state: Mutex::new((
                serde_json::from_value(config.get("state").cloned().unwrap_or(json!("idle")))
                    .unwrap(),
                config["sessionId"].as_str().unwrap_or("").into(),
            )),
            config,
            events,
        }
    }
}
impl Surface for Fixture {
    fn id(&self) -> &str {
        &self.id
    }
    fn kind(&self) -> &str {
        &self.kind
    }
    fn state(&self) -> SurfaceState {
        self.state.lock().unwrap().0
    }
    fn session_id(&self) -> Option<String> {
        Some(self.state.lock().unwrap().1.clone())
    }
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            self.events
                .lock()
                .unwrap()
                .push(json!({"op":"start","id":self.id,"input":input}));
            let mut state = self.state.lock().unwrap();
            *state = (SurfaceState::Starting, input.session_id);
            if self.config["failStart"] == true {
                return Err("start failed".into());
            }
            state.0 = SurfaceState::Running;
            Ok(())
        })
    }
    fn stop(&self, reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            let mut input = json!({});
            if let Some(reason) = reason {
                input["reason"] = json!(reason);
            }
            self.events
                .lock()
                .unwrap()
                .push(json!({"op":"stop","id":self.id,"input":input}));
            let mut state = self.state.lock().unwrap();
            state.0 = SurfaceState::Stopping;
            if self.config["failStop"] == true {
                return Err("stop failed".into());
            }
            state.0 = SurfaceState::Stopped;
            Ok(())
        })
    }
    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        if self.config["failSnapshot"] == true {
            return Err("snapshot failed".into());
        }
        let state = self.state.lock().unwrap();
        Ok(SurfaceSnapshot {
            id: self.id.clone(),
            kind: self.kind.clone(),
            state: state.0,
            session_id: state.1.clone(),
            started_at: None,
            metadata: self.config["metadata"]
                .as_object()
                .cloned()
                .unwrap_or_default(),
        })
    }
}
struct Factory {
    kind: String,
    config: Value,
    events: Arc<Mutex<Vec<Value>>>,
}
impl SurfaceFactory for Factory {
    fn kind(&self) -> &str {
        &self.kind
    }
    fn create(&self, id: &str) -> SurfaceResult<SurfaceRef> {
        if self.config["failCreate"] == true {
            return Err("create failed".into());
        }
        Ok(Arc::new(Fixture::new(
            id,
            &self.kind,
            self.config.clone(),
            self.events.clone(),
        )))
    }
}
fn thrown(e: HostError) -> Value {
    match e {
        HostError::Error(s) => json!({"error":s}),
        HostError::Thrown(v) => json!({"value":v}),
    }
}
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    for batch in cases.chunks(8) {
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/surface-tools/contracts"),
            json!({"version":1,"calls":[{"op":"nativesurfacetools.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let registry = SurfaceRegistry::default();
            let events = Arc::new(Mutex::new(vec![]));
            for factory in test["factories"].as_array().into_iter().flatten() {
                registry.register(Arc::new(Factory {
                    kind: factory["type"].as_str().unwrap().into(),
                    config: factory.clone(),
                    events: events.clone(),
                }));
            }
            for instance in test["instances"].as_array().into_iter().flatten() {
                let id = instance["id"].as_str().unwrap();
                registry.register_instance(
                    id,
                    Arc::new(Fixture::new(
                        id,
                        instance["type"].as_str().unwrap(),
                        instance.clone(),
                        events.clone(),
                    )),
                );
            }
            let browser: Option<HostPort<Value>> = if test["preview"] == true {
                let events = events.clone();
                let config = test["inspect"].clone();
                Some(Arc::new(move |_, input, ctx| {
                    events
                        .lock()
                        .unwrap()
                        .push(json!({"op":"inspect","input":input,"context":ctx}));
                    let result = if let Some(s) = config["error"].as_str() {
                        Err(HostError::Error(s.into()))
                    } else if let Some(v) = config.get("thrown") {
                        Err(HostError::Thrown(v.clone()))
                    } else {
                        Ok(config
                            .get("response")
                            .cloned()
                            .unwrap_or(json!({"ok":false,"message":"no browser"})))
                    };
                    Box::pin(async move { result })
                }))
            } else {
                None
            };
            let tools = SurfaceTools::new(registry, browser).with_id_source(Arc::new(|| ID.into()));
            let mut outcomes = vec![];
            for op in test["ops"].as_array().into_iter().flatten() {
                let input = op.get("input").cloned().unwrap_or(json!({}));
                let context = op.get("context").cloned().unwrap_or(json!({}));
                let outcome = match op["op"].as_str().unwrap() {
                    "list" => tools
                        .list()
                        .map(|r| json!({"ok":r.ok,"messageUnits":r.message.0,"data":r.data})),
                    "start" => Ok(tools.start(&input, &context).await),
                    "stop" => tools.stop(&input).await,
                    _ => unreachable!(),
                };
                outcomes.push(match outcome {
                    Ok(v) => json!({"result":v}),
                    Err(e) => json!({"thrown":thrown(e)}),
                });
            }
            actual.push(json!({"metadata":surfaces::metadata(),"outcomes":outcomes,"events":*events.lock().unwrap()}));
        }
        for (index, (actual, expected)) in
            actual.iter().zip(expected.as_array().unwrap()).enumerate()
        {
            assert_eq!(actual, expected, "case {:?}", batch[index]);
        }
    }
}
#[tokio::test]
async fn real_registry_start_stop_list_defaults_failures_and_preview_match() {
    let context = json!({"sessionId":"current-session","projectRoot":"/owned","userId":"owner","extra":{"keep":true}});
    let mut cases = vec![];
    for kind in ["terminal", "filesystem", "browser", "custom"] {
        for options in [
            json!({}),
            json!({"sessionId":"override","projectRoot":"/override"}),
            json!({"sessionId":"","projectRoot":""}),
            json!({"sessionId":null,"projectRoot":null}),
        ] {
            let mut input = options;
            input["type"] = json!(kind);
            cases.push(json!({"factories":[{"type":kind}],"ops":[{"op":"list"},{"op":"start","input":input,"context":context},{"op":"list"},{"op":"stop","input":{"surfaceId":format!("{kind}-{ID}"),"reason":"done"}},{"op":"list"},{"op":"stop","input":{"surfaceId":format!("{kind}-{ID}")}}]}));
        }
    }
    for flag in ["failCreate", "failStart", "failStop", "failSnapshot"] {
        let mut factory = json!({"type":"terminal"});
        factory[flag] = json!(true);
        cases.push(json!({"factories":[factory],"ops":[{"op":"start","input":{"type":"terminal"},"context":context},{"op":"list"},{"op":"stop","input":{"surfaceId":format!("terminal-{ID}")}}]}));
    }
    cases.push(json!({"ops":[{"op":"start","input":{"type":"unknown"},"context":context},{"op":"stop","input":{"surfaceId":"missing"}}]}));
    cases.push(json!({"instances":(0..12).map(|i|json!({"id":format!("surface-{i}"),"type":"terminal","state":"running","sessionId":format!("session-{i}"),"metadata":{"n":i}})).collect::<Vec<_>>(),"ops":[{"op":"list"}]}));
    for session in [
        "🦀🦀🦀🦀tail",
        "é中é中é中é中tail",
        "1234567🦀tail",
        "a🦀🦀🦀🦀tail",
    ] {
        cases.push(json!({"instances":[{"id":"unicode","type":"terminal","state":"running","sessionId":session}],"ops":[{"op":"list"}]}));
    }
    for input in [
        json!({"type":"browser"}),
        json!({"type":"browser","sessionId":"current-session","projectRoot":"/override"}),
        json!({"type":"browser","sessionId":"other"}),
        json!({"type":"browser","sessionId":"","projectRoot":""}),
    ] {
        for inspect in [
            json!({"response":{"ok":true,"message":"ready","data":{"browserId":"browser-existing","url":"http://owned","id":"overridden","metadata":{"overridden":true}},"extra":42}}),
            json!({"response":{"ok":false,"message":"denied","data":{"browserId":"browser-existing"}}}),
            json!({"response":{"ok":true,"message":"no surface","data":{"browserId":"missing"}}}),
            json!({"error":"scope denied"}),
            json!({"thrown":null}),
        ] {
            cases.push(json!({"preview":true,"instances":[{"id":"browser-existing","type":"browser","state":"running","sessionId":"current-session"}],"inspect":inspect,"ops":[{"op":"start","input":input,"context":context}]}));
        }
    }
    compare(cases).await;
}
