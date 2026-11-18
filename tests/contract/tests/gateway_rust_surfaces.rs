#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::surfaces::registry::*;
use serde_json::{Map, Value, json};
use std::future::Future;
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
struct FixtureSurface {
    id: String,
    kind: String,
    config: Value,
    state: Mutex<(SurfaceState, Option<String>, Map<String, Value>)>,
    events: Arc<Mutex<Vec<Value>>>,
}
impl FixtureSurface {
    fn new(id: &str, kind: &str, config: Value, events: Arc<Mutex<Vec<Value>>>) -> Self {
        let mut metadata = Map::new();
        metadata.insert(
            "factory".into(),
            config.get("label").cloned().unwrap_or(json!("fixture")),
        );
        if let Some(values) = config["metadata"].as_object() {
            metadata.extend(values.clone());
        }
        let state =
            serde_json::from_value(config.get("state").cloned().unwrap_or(json!("idle"))).unwrap();
        let session = config["sessionId"].as_str().map(String::from);
        Self {
            id: id.into(),
            kind: kind.into(),
            config,
            state: Mutex::new((state, session, metadata)),
            events,
        }
    }
}
impl Surface for FixtureSurface {
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
        self.state.lock().unwrap().1.clone()
    }
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            let mut original = input.properties.clone();
            original.insert("sessionId".into(), json!(input.session_id));
            original.insert("projectRoot".into(), json!(input.project_root));
            if let Some(node) = input.node_id {
                original.insert("nodeId".into(), json!(node));
            }
            self.events
                .lock()
                .unwrap()
                .push(json!({"event":"start","id":self.id,"input":original}));
            {
                let mut state = self.state.lock().unwrap();
                state.0 = SurfaceState::Starting;
                state.1 = Some(input.session_id);
            }
            tokio::task::yield_now().await;
            if self.config["failStart"] == true {
                self.state.lock().unwrap().0 = SurfaceState::Error;
                return Err("start fixture".into());
            }
            self.state.lock().unwrap().0 = SurfaceState::Running;
            Ok(())
        })
    }
    fn stop(&self, reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            self.events
                .lock()
                .unwrap()
                .push(json!({"event":"stop","id":self.id,"reason":reason}));
            self.state.lock().unwrap().0 = SurfaceState::Stopping;
            tokio::task::yield_now().await;
            let mut state = self.state.lock().unwrap();
            if self.config["failStop"] == true {
                state.0 = SurfaceState::Error;
                return Err("stop fixture".into());
            }
            state.0 = SurfaceState::Stopped;
            if let Some(reason) = reason {
                state.2.insert("lastReason".into(), json!(reason));
            }
            Ok(())
        })
    }
    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        if self.config["failSnapshot"] == true {
            return Err("snapshot fixture".into());
        }
        let state = self.state.lock().unwrap();
        Ok(SurfaceSnapshot {
            id: self.id.clone(),
            kind: self.kind.clone(),
            state: state.0,
            session_id: state.1.clone().unwrap_or_default(),
            started_at: None,
            metadata: state.2.clone(),
        })
    }
}
struct Factory {
    kind: String,
    label: Value,
    fail: bool,
    configs: Value,
    events: Arc<Mutex<Vec<Value>>>,
}
impl SurfaceFactory for Factory {
    fn kind(&self) -> &str {
        &self.kind
    }
    fn create(&self, id: &str) -> SurfaceResult<SurfaceRef> {
        if self.fail {
            return Err("create fixture".into());
        }
        let mut config = self.configs.get(id).cloned().unwrap_or(json!({}));
        config["label"] = self.label.clone();
        Ok(Arc::new(FixtureSurface::new(
            id,
            &self.kind,
            config,
            self.events.clone(),
        )))
    }
}
fn describe(registry: &SurfaceRegistry, surface: Option<SurfaceRef>) -> Value {
    surface.map(|surface|json!({"id":surface.id(),"type":surface.kind(),"state":surface.state(),"sessionId":surface.session_id(),"owner":registry.owner(surface.id())})).unwrap_or(Value::Null)
}
async fn scenario(mut input: Value) -> Value {
    input["op"] = json!("nativesurfaces.registry");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-surfaces")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    let reference = input.clone();
    let expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &root,
            &dir,
            json!({"version":1,"calls":[reference]}),
            &|| false,
        )
        .unwrap()[0]
            .clone()
    })
    .await
    .unwrap();
    let registry = SurfaceRegistry::default();
    let events = Arc::new(Mutex::new(vec![]));
    let mut results = vec![];
    for step in input["steps"].as_array().unwrap() {
        let id = step["id"].as_str().unwrap_or("");
        let result: SurfaceResult<Value> = match step["op"].as_str().unwrap() {
            "register" => {
                registry.register(Arc::new(Factory {
                    kind: step["type"].as_str().unwrap().into(),
                    label: step.get("label").cloned().unwrap_or(json!("fixture")),
                    fail: step["failCreate"] == true,
                    configs: input["configs"].clone(),
                    events: events.clone(),
                }));
                Ok(Value::Null)
            }
            "instance" => {
                registry.register_instance(
                    step["key"].as_str().unwrap(),
                    Arc::new(FixtureSurface::new(
                        id,
                        step["type"].as_str().unwrap(),
                        step.get("config").cloned().unwrap_or(json!({})),
                        events.clone(),
                    )),
                );
                Ok(Value::Null)
            }
            "owner" => {
                registry.set_owner(id, step["user"].as_str().unwrap());
                Ok(Value::Null)
            }
            "getOwner" => Ok(json!(registry.owner(id))),
            "callbacks" => {
                let cloned = registry.clone();
                let log = events.clone();
                let fail = step["failStarted"] == true;
                registry.on_started(if step["started"]==false{None}else{Some(Arc::new(move|id,surface|{
                    log.lock().unwrap().push(json!({"event":"started","id":id,"snapshot":surface.snapshot()?,"owner":cloned.owner(id)}));
                    if fail{Err("started callback".into())}else{Ok(())}
                }))});
                let cloned = registry.clone();
                let log = events.clone();
                let fail = step["failStopped"] == true;
                registry.on_stopped(if step["stopped"]==false{None}else{Some(Arc::new(move|id,surface,reason|{
                    log.lock().unwrap().push(json!({"event":"stopped","id":id,"snapshot":surface.snapshot()?,"state":surface.state(),"reason":reason,"owner":cloned.owner(id)}));
                    if fail{Err("stopped callback".into())}else{Ok(())}
                }))});
                Ok(Value::Null)
            }
            "start" => registry
                .start_surface(
                    step["type"].as_str().unwrap(),
                    id,
                    serde_json::from_value(step["input"].clone()).unwrap(),
                )
                .await
                .map(|surface| describe(&registry, Some(surface))),
            "duringStart" => {
                let mut pending = Box::pin(registry.start_surface(
                    step["type"].as_str().unwrap(),
                    id,
                    serde_json::from_value(step["input"].clone()).unwrap(),
                ));
                std::future::poll_fn(|cx| {
                    assert!(pending.as_mut().poll(cx).is_pending());
                    std::task::Poll::Ready(())
                })
                .await;
                let during = describe(&registry, registry.surface(id));
                pending.await.map(
                    |surface| json!({"during":during,"result":describe(&registry,Some(surface))}),
                )
            }
            "duringStop" => {
                let mut pending =
                    Box::pin(registry.stop_surface(id, step["reason"].as_str().map(String::from)));
                std::future::poll_fn(|cx| {
                    assert!(pending.as_mut().poll(cx).is_pending());
                    std::task::Poll::Ready(())
                })
                .await;
                let during = describe(&registry, registry.surface(id));
                pending
                    .await
                    .map(|value| json!({"during":during,"result":value}))
            }
            "stop" => registry
                .stop_surface(id, step["reason"].as_str().map(String::from))
                .await
                .map(|v| json!(v)),
            "stopAll" => {
                registry.stop_all(step["reason"].as_str()).await;
                Ok(Value::Null)
            }
            "get" => Ok(describe(&registry, registry.surface(id))),
            "list" => Ok(json!(
                registry
                    .list()
                    .into_iter()
                    .map(|s| describe(&registry, Some(s)))
                    .collect::<Vec<_>>()
            )),
            "snapshots" => registry.snapshots().map(|v| json!(v)),
            "session" => Ok(json!(
                registry
                    .by_session(step["session"].as_str().unwrap())
                    .into_iter()
                    .map(|s| describe(&registry, Some(s)))
                    .collect::<Vec<_>>()
            )),
            "types" => Ok(json!(registry.registered_types())),
            "unregister" => Ok(json!(registry.unregister(id))),
            "sync" => should_sync_project_surface_ui(registry.surface(id).unwrap().as_ref())
                .map(|v| json!(v)),
            _ => panic!("unknown surface operation"),
        };
        results.push(result.unwrap_or_else(|message| json!({"error":true,"message":message})));
    }
    // Callbacks intentionally retain registry clones as a user could; clear them before dropping.
    registry.on_started(None);
    registry.on_stopped(None);
    let actual = json!({"results":results,"events":events.lock().unwrap().clone()});
    assert_eq!(actual, expected);
    actual
}
fn start(kind: &str, id: &str, session: &str, user: Value) -> Value {
    json!({"op":"start","type":kind,"id":id,"input":{"sessionId":session,"projectRoot":"/fixture","userId":user}})
}
#[tokio::test]
async fn registry_factory_replacement_owner_registration_and_stable_order() {
    scenario(json!({"steps":[{"op":"types"},{"op":"register","type":"terminal","label":"first"},{"op":"register","type":"filesystem"},
        {"op":"register","type":"terminal","label":"replacement"},{"op":"types"},{"op":"callbacks"},
        start("terminal","a","one",json!("alice")),start("filesystem","b","two",json!("bob")),
        start("terminal","a","three",json!(null)),{"op":"list"},{"op":"session","session":"one"},{"op":"session","session":"three"},
        {"op":"owner","id":"missing","user":"orphan"},{"op":"unregister","id":"missing"},{"op":"getOwner","id":"missing"},
        {"op":"unregister","id":"a"},{"op":"list"},start("terminal","a","four",json!("")),
        {"op":"list"},{"op":"stop","id":"b","reason":"finished"},{"op":"getOwner","id":"b"},{"op":"stop","id":"missing"},{"op":"snapshots"}
    ]})).await;
}
#[tokio::test]
async fn registry_external_instances_and_frozen_pre_stop_snapshot_reach_callbacks() {
    let result=scenario(json!({"steps":[{"op":"callbacks"},{"op":"instance","key":"a","id":"a","type":"filesystem","config":{"sessionId":"s","state":"running","metadata":{"panelOpen":true}}},
        {"op":"owner","id":"a","user":"alice"},{"op":"sync","id":"a"},{"op":"stop","id":"a","reason":"cleanup"},{"op":"list"},{"op":"getOwner","id":"a"}
    ]})).await;
    let stopped = &result["events"][1];
    assert_eq!(stopped["snapshot"]["state"], "running");
    assert_eq!(stopped["state"], "stopped");
    assert_eq!(stopped["owner"], "alice");
}
#[tokio::test]
async fn registry_errors_preserve_reference_partial_lifecycle_effects() {
    scenario(json!({"configs":{"fail-start":{"failStart":true},"fail-stop":{"failStop":true},"fail-snapshot":{"failSnapshot":true}},"steps":[
        start("missing","a","s",json!("alice")),{"op":"register","type":"broken","failCreate":true},start("broken","a","s",json!("alice")),
        {"op":"register","type":"terminal"},{"op":"callbacks"},
        start("terminal","fail-start","s",json!("alice")),{"op":"get","id":"fail-start"},
        start("terminal","fail-stop","s",json!("bob")),{"op":"stop","id":"fail-stop","reason":"cleanup"},{"op":"get","id":"fail-stop"},
        start("terminal","fail-snapshot","s",json!("carol")),{"op":"stop","id":"fail-snapshot"},{"op":"get","id":"fail-snapshot"},
        {"op":"callbacks","failStarted":true},start("terminal","callback-start","s",json!("alice")),{"op":"get","id":"callback-start"},
        {"op":"callbacks","failStopped":true},{"op":"stop","id":"callback-start"},{"op":"get","id":"callback-start"},
        {"op":"callbacks","started":false,"stopped":false},{"op":"stopAll"},{"op":"list"}
    ]})).await;
}
#[tokio::test]
async fn registry_stop_all_settles_all_adapters_without_discarding_failed_surfaces() {
    scenario(json!({"configs":{"bad":{"failStop":true}},"steps":[{"op":"register","type":"terminal"},{"op":"callbacks"},
        start("terminal","one","s",json!("alice")),start("terminal","bad","s",json!("alice")),start("terminal","three","s",json!("bob")),
        {"op":"stopAll"},{"op":"list"},{"op":"getOwner","id":"bad"},{"op":"snapshots"},{"op":"stopAll","reason":"manual"},{"op":"list"}
    ]})).await;
}
#[tokio::test]
async fn project_ui_sync_requires_a_filesystem_surface_and_boolean_panel_state() {
    let mut steps = vec![];
    for (i, kind) in ["filesystem", "remote-filesystem", "terminal", "screen"]
        .iter()
        .enumerate()
    {
        for (j, panel) in [
            json!(true),
            json!(false),
            Value::Null,
            json!(1),
            json!("true"),
        ]
        .into_iter()
        .enumerate()
        {
            let id = format!("{i}-{j}");
            steps.push(json!({"op":"instance","key":id,"id":id,"type":kind,"config":{"metadata":{"panelOpen":panel}}}));
            steps.push(json!({"op":"sync","id":id}));
        }
    }
    // Non-filesystem sync checks must not call a snapshot that would throw.
    steps.extend([json!({"op":"instance","key":"throws","id":"throws","type":"terminal","config":{"failSnapshot":true}}),json!({"op":"sync","id":"throws"})]);
    scenario(json!({"steps":steps})).await;
}

#[tokio::test]
async fn registry_publishes_ownership_before_start_resolves_and_retains_it_while_stopping() {
    let mut pending = start("terminal", "held", "session", json!("alice"));
    pending["op"] = json!("duringStart");
    let result=scenario(json!({"steps":[{"op":"register","type":"terminal"},{"op":"callbacks"},pending,{"op":"duringStop","id":"held","reason":"manual"},{"op":"get","id":"held"},{"op":"getOwner","id":"held"}]})).await;
    assert_eq!(result["results"][2]["during"]["state"], "starting");
    assert_eq!(result["results"][2]["during"]["owner"], "alice");
    assert_eq!(result["results"][3]["during"]["state"], "stopping");
    assert_eq!(result["results"][3]["during"]["owner"], "alice");
}
