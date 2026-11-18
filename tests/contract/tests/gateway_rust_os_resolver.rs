#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::integrations::os_control::{contracts::*, resolver::*};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn denied<T: Send + 'static>() -> BoxFuture<'static, Result<T, &'static str>> {
    Box::pin(async { Err("driver execution is not part of resolver tests") })
}
struct Driver {
    marker: Value,
    kind: OsDriverType,
}
impl OsControlDriver for Driver {
    type Error = &'static str;
    fn os_type(&self) -> OsDriverType {
        self.kind
    }
    fn screenshot(&self) -> BoxFuture<'_, Result<OsScreenshot, Self::Error>> {
        denied()
    }
    fn click(
        &self,
        _: f64,
        _: f64,
        _: Option<OsClickOptions>,
    ) -> BoxFuture<'_, Result<(), Self::Error>> {
        denied()
    }
    fn mouse_move(&self, _: f64, _: f64) -> BoxFuture<'_, Result<(), Self::Error>> {
        denied()
    }
    fn r#type<'a>(
        &'a self,
        _: &'a str,
        _: Option<OsTypeOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        denied()
    }
    fn key<'a>(
        &'a self,
        _: &'a str,
        _: Option<OsKeyOptions>,
    ) -> BoxFuture<'a, Result<(), Self::Error>> {
        denied()
    }
    fn scroll(&self, _: Option<OsScrollOptions>) -> BoxFuture<'_, Result<(), Self::Error>> {
        denied()
    }
    fn exec<'a>(
        &'a self,
        _: &'a str,
        _: Option<OsExecOptions>,
    ) -> BoxFuture<'a, Result<SandboxRunResult, Self::Error>> {
        denied()
    }
}
struct Source {
    step: Arc<Mutex<Value>>,
    infos: Value,
    events: Arc<Mutex<Vec<Value>>>,
}
impl OsSandboxSource for Source {
    fn list_running_os_sandboxes(
        &self,
    ) -> BoxFuture<'_, Result<Vec<OsSandboxInfo>, ResolverError>> {
        self.events.lock().unwrap().push(json!("list"));
        let step = self.step.lock().unwrap().clone();
        let infos = step.get("infos").unwrap_or(&self.infos).clone();
        Box::pin(async move {
            if let Some(error) = step.get("error") {
                return Err(if step["errorKind"] == "thrown" {
                    ResolverError::Thrown(error.clone())
                } else {
                    ResolverError::Message(error.as_str().unwrap().into())
                });
            }
            Ok(serde_json::from_value(infos).unwrap())
        })
    }
}
struct Factory {
    source: Arc<dyn OsSandboxSource>,
    calls: Arc<Mutex<Vec<Value>>>,
    error: Option<String>,
}
impl Factory {
    fn create(&self, event: Value, kind: OsDriverType) -> Result<Driver, ResolverError> {
        let mut calls = self.calls.lock().unwrap();
        calls.push(event.clone());
        if let Some(error) = &self.error {
            return Err(ResolverError::Message(error.clone()));
        }
        let mut marker = event;
        marker["index"] = json!(calls.len());
        Ok(Driver { marker, kind })
    }
}
impl OsDriverFactory<Driver> for Factory {
    fn linux_desktop(
        &self,
        source: Arc<dyn OsSandboxSource>,
        name: &str,
    ) -> Result<Driver, ResolverError> {
        self.create(json!({"factory":"linux","name":name,"managerIdentity":Arc::ptr_eq(&source,&self.source)}),OsDriverType::LinuxDesktop)
    }
    fn windows(
        &self,
        name: &str,
        username: &str,
        password: Option<&str>,
    ) -> Result<Driver, ResolverError> {
        let mut event = json!({"factory":"windows","name":name,"username":username});
        if let Some(password) = password {
            event["password"] = json!(password);
        }
        self.create(event, OsDriverType::Windows)
    }
}
async fn compare(call: Value) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let mut reference = call.clone();
    reference["op"] = json!("nativeosresolver.scenario");
    let expected = internal_driver::call(
        &root,
        &root
            .join(".jait/artifacts/gateway-rust/os-resolver")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[reference]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let step = Arc::new(Mutex::new(Value::Null));
    let events = Arc::new(Mutex::new(vec![]));
    let factories = Arc::new(Mutex::new(vec![]));
    let source: Arc<dyn OsSandboxSource> = Arc::new(Source {
        step: step.clone(),
        infos: call.get("infos").cloned().unwrap_or(json!([])),
        events: events.clone(),
    });
    let factory = Arc::new(Factory {
        source: source.clone(),
        calls: factories.clone(),
        error: call["factoryError"].as_str().map(str::to_owned),
    });
    let resolver = OsControlResolver::new(
        source,
        factory,
        serde_json::from_value(call.get("windowsSsh").cloned().unwrap_or(json!({}))).unwrap(),
    );
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        *step.lock().unwrap() = s.clone();
        let result = if s["op"] == "list" {
            resolver
                .list_sandboxes()
                .await
                .map(|v| json!({"connections":v}))
        } else {
            resolver.resolve(s["name"].as_str()).await.map(|v|json!({"binding":{"containerName":v.container_name,"type":v.r#type,"driver":v.driver.marker}}))
        };
        results.push(match result {
            Ok(v) => v,
            Err(ResolverError::Message(message)) => {
                json!({"error":{"name":"Error","message":message}})
            }
            Err(ResolverError::Thrown(v)) => json!({"thrown":v}),
        });
    }
    assert_eq!(
        json!({"results":results,"events":*events.lock().unwrap(),"factories":*factories.lock().unwrap()}),
        expected,
        "OS resolver parity"
    );
}
fn info(name: &str, kind: &str, running: bool) -> Value {
    json!({"containerName":name,"type":kind,"running":running})
}
#[tokio::test]
async fn selection_tracks_running_order_trims_lookup_but_retains_original_error_text() {
    compare(json!({"infos":[info("old","linux-desktop",true),info("paused","windows",false),info("vm","windows",true),info("new","linux-desktop",true)],"steps":[
 {"op":"list"},{"op":"resolve"},{"op":"resolve","name":""},{"op":"resolve","name":" \u{feff} "},{"op":"resolve","name":" vm "},{"op":"resolve","name":" paused "},{"op":"resolve","name":" missing "},{"op":"resolve","name":"new"},{"op":"resolve","name":"new"},
 {"op":"resolve","infos":[info("same","linux-desktop",false),info("same","windows",true)],"name":"same"},
 {"op":"resolve","infos":[]},{"op":"resolve","infos":[info("stopped","windows",false)]},{"op":"list","infos":[]}
 ]})).await;
}
#[tokio::test]
async fn connection_defaults_preserve_zero_custom_negative_and_nullish_ports() {
    let mut linux = info("linux", "linux-desktop", true);
    linux["vncPort"] = json!(0);
    linux["novncPort"] = json!(65535);
    let mut windows = info("windows", "windows", true);
    windows["rdpPort"] = json!(-1);
    windows["webViewerPort"] = json!(0);
    windows["sshPort"] = json!(2345.5);
    let mut nulls = info("null", "windows", true);
    nulls["rdpPort"] = Value::Null;
    nulls["webViewerPort"] = Value::Null;
    nulls["sshPort"] = Value::Null;
    compare(json!({"infos":[linux,windows,nulls,info("defaults","linux-desktop",true),info("skip","windows",false)],"steps":[{"op":"list"},{"op":"list"}]})).await;
}
#[tokio::test]
async fn windows_credentials_and_manager_constructor_failures_are_exact() {
    for config in [
        json!({}),
        json!({"username":"fixture","password":"fake-test-value"}),
        json!({"username":"","password":""}),
        json!({"username":null}),
    ] {
        compare(json!({"windowsSsh":config,"infos":[info("win","windows",true),info("linux","linux-desktop",true)],"steps":[{"op":"resolve","name":"win"},{"op":"resolve","name":"linux"},{"op":"list","error":"manager failed"},{"op":"resolve","errorKind":"thrown","error":{"failed":"manager"}}]})).await;
    }
    for kind in ["linux-desktop", "windows"] {
        compare(json!({"factoryError":"constructor rejected","infos":[info("sandbox",kind,true)],"steps":[{"op":"resolve"},{"op":"resolve","name":"sandbox"}]})).await;
    }
}
