#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    runtime::blocking::BlockingLane,
    surfaces::{
        filesystem::{FileSystemError, FileSystemResult, FileSystemSurfaceFactory, GuardOptions},
        registry::{
            Surface, SurfaceFactory, SurfaceFuture, SurfaceRef, SurfaceRegistry, SurfaceSnapshot,
            SurfaceStartInput, SurfaceState,
        },
        remote_filesystem::{RemoteFileSystemSurface, RemoteFsTransport},
    },
    tools::filesystem_resolver::FileSystemResolver,
};
use serde_json::{Value, json};
use std::{
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct NoRpc;
impl RemoteFsTransport for NoRpc {
    fn request<'a>(
        &'a self,
        _: &'a str,
        _: &'a str,
        _: Value,
    ) -> BoxFuture<'a, FileSystemResult<Value>> {
        Box::pin(async { Err(FileSystemError::message("resolver must not make RPC calls")) })
    }
}
struct Factory {
    lane: BlockingLane,
    error: Option<String>,
}
impl SurfaceFactory for Factory {
    fn kind(&self) -> &str {
        "filesystem"
    }
    fn create(&self, id: &str) -> Result<SurfaceRef, String> {
        if let Some(error) = &self.error {
            return Err(error.clone());
        }
        Ok(Arc::new(
            FileSystemSurfaceFactory::new(GuardOptions::default(), self.lane.clone())
                .create_filesystem(id)
                .with_clock(Arc::new(|| jait_gateway::time::iso(1790000000000).unwrap())),
        ))
    }
}
struct Other {
    value: Value,
}
impl Surface for Other {
    fn id(&self) -> &str {
        self.value["id"].as_str().unwrap()
    }
    fn kind(&self) -> &str {
        "browser"
    }
    fn state(&self) -> SurfaceState {
        SurfaceState::Running
    }
    fn session_id(&self) -> Option<String> {
        Some(self.value["session"].as_str().unwrap_or("s").into())
    }
    fn snapshot(&self) -> Result<SurfaceSnapshot, String> {
        serde_json::from_value(json!({"id":self.id(),"type":"browser","state":"running","sessionId":self.session_id(),"metadata":{"projectRoot":self.value["root"]}})).map_err(|e|e.to_string())
    }
    fn start(&self, _: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
    fn stop(&self, _: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async { Ok(()) })
    }
}
fn expand(v: &mut Value, work: &Path) {
    match v {
        Value::String(s) => {
            *s = s
                .replace("$WORK", &work.to_string_lossy())
                .replace("$CWD", &root().to_string_lossy())
        }
        Value::Array(a) => {
            for v in a {
                expand(v, work)
            }
        }
        Value::Object(o) => {
            for v in o.values_mut() {
                expand(v, work)
            }
        }
        _ => {}
    }
}
async fn compare(mut cases: Vec<Value>) {
    for c in &mut cases {
        let work = root()
            .join(".jait/artifacts/gateway-rust/fs-resolver/contracts")
            .join(uuid::Uuid::new_v4().to_string())
            .join("work");
        expand(c, &work);
        c["root"] = json!(work);
    }
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/fs-resolver/driver")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativefsresolver.cases","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (i, c) in cases.iter().enumerate() {
        let lane = BlockingLane::new(NonZeroU16::new(2).unwrap());
        let resolver = FileSystemResolver::new(root(), lane.clone()).unwrap();
        let registry = SurfaceRegistry::default();
        if c["noFactory"] != true {
            registry.register(Arc::new(Factory {
                lane: lane.clone(),
                error: c["factoryError"].as_str().map(str::to_string),
            }));
        }
        for item in c["surfaces"].as_array().into_iter().flatten() {
            let id = item["id"].as_str().unwrap();
            let surface: SurfaceRef = if item["kind"] == "remote" {
                Arc::new(
                    RemoteFileSystemSurface::new(id, Arc::new(NoRpc))
                        .with_clock(Arc::new(|| jait_gateway::time::iso(1790000000000).unwrap())),
                )
            } else if item["kind"] == "other" {
                Arc::new(Other {
                    value: item.clone(),
                })
            } else {
                Factory {
                    lane: lane.clone(),
                    error: None,
                }
                .create(id)
                .unwrap()
            };
            if item["kind"] != "other" && item["state"] != "idle" {
                surface
                    .start(SurfaceStartInput {
                        session_id: item["session"].as_str().unwrap_or("s").into(),
                        project_root: item["root"].as_str().unwrap().into(),
                        node_id: Some("node".into()),
                        properties: Default::default(),
                    })
                    .await
                    .unwrap();
                if item["state"] == "stopped" {
                    surface.stop(None).await.unwrap();
                }
            }
            registry.register_instance(id, surface);
        }
        let events = Arc::new(Mutex::new(vec![]));
        let current = Arc::new(Mutex::new(Value::Null));
        let log = events.clone();
        let active = current.clone();
        registry.on_started(Some(Arc::new(move |id, surface| {
            log.lock()
                .unwrap()
                .push(json!({"id":id,"snapshot":surface.snapshot()?}));
            if let Some(e) = active.lock().unwrap()["hookError"].as_str() {
                return Err(e.into());
            }
            Ok(())
        })));
        let mut outcomes = vec![];
        for step in c["ops"].as_array().unwrap() {
            *current.lock().unwrap() = step.clone();
            let session = step["session"].as_str().unwrap_or("s");
            let project_root = step["projectRoot"]
                .as_str()
                .unwrap_or(c["root"].as_str().unwrap());
            let result: Result<Value, String> = match step["op"].as_str().unwrap() {
                "get" => match resolver
                    .get_fs(
                        &registry,
                        &jait_gateway::tools::filesystem_resolver::FileSystemContext {
                            session_id: session,
                            project_root,
                        },
                        step["target"].as_str(),
                    )
                    .await
                {
                    Ok(s) => s.snapshot().map(|s| serde_json::to_value(s).unwrap()),
                    Err(e) => Err(e),
                },
                "root" => resolver
                    .resolve_project_root(&registry, session, step["fallback"].as_str())
                    .map(|s| json!(s)),
                "local" => resolver
                    .is_gateway_local_path_outside_project(
                        step["target"].as_str().unwrap(),
                        step["projectRoot"].as_str(),
                    )
                    .await
                    .map(|v| json!(v)),
                "stop" => registry
                    .stop_surface(step["id"].as_str().unwrap(), None)
                    .await
                    .map(|v| json!(v)),
                _ => panic!("unsupported fixture step"),
            };
            outcomes.push(match result {
                Ok(v) => json!({"value":v}),
                Err(e) => json!({"error":e}),
            });
        }
        let actual = json!({"outcomes":outcomes,"events":*events.lock().unwrap(),"surfaces":registry.snapshots().unwrap()});
        for (j, (a, b)) in actual["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .zip(expected[i]["outcomes"].as_array().unwrap())
            .enumerate()
        {
            assert_eq!(
                a, b,
                "filesystem resolver case {i} step {j}: {}",
                c["ops"][j]
            );
        }
        assert_eq!(actual, expected[i], "filesystem resolver case {i}");
    }
}
#[tokio::test]
async fn default_existing_specific_and_stopped_local_selection_match() {
    compare(vec![json!({"ops":[{"op":"root"},{"op":"root","fallback":"  "},{"op":"get"},{"op":"get","target":"relative.txt"},{"op":"get","target":""},{"op":"root"},{"op":"stop","id":"fs-s"},{"op":"get"}]}),
 json!({"surfaces":[{"id":"fs-s","root":"$WORK"},{"id":"nested","root":"$WORK/deep"},{"id":"same-depth-later","root":"$WORK/deep"},{"id":"foreign-session","root":"$WORK/deep/more","session":"other"},{"id":"browser","kind":"other","root":"$WORK/very/deep/browser"}],"ops":[{"op":"get","target":"$WORK/deep/file"},{"op":"get","target":"relative"},{"op":"root"},{"op":"root","session":"other"}]}),
 json!({"surfaces":[{"id":"fs-s","root":"$WORK","state":"stopped"},{"id":"custom","root":"$WORK/deep"}],"ops":[{"op":"get"},{"op":"root"}]}),
 json!({"noFactory":true,"ops":[{"op":"get"}]}),json!({"factoryError":"create failed","ops":[{"op":"get"}]}),
 json!({"ops":[{"op":"get","hookError":"hook failed"},{"op":"get"}]})]).await;
}
#[tokio::test]
async fn remote_priority_conventional_longest_and_foreign_paths_match() {
    compare(vec![json!({"surfaces":[{"id":"local-wide","root":"$WORK"},{"id":"remote-wide","kind":"remote","root":"E:\\Project"},{"id":"remote-deep","kind":"remote","root":"E:\\Project\\Deep"},{"id":"fs-s","kind":"remote","root":"E:\\Other"}],"ops":[{"op":"get"},{"op":"get","target":"e:/project/deep/file"},{"op":"get","target":"unknown"},{"op":"root"}]}),
 json!({"surfaces":[{"id":"remote-first","kind":"remote","root":"E:\\Project"},{"id":"remote-last","kind":"remote","root":"E:\\Other"}],"ops":[{"op":"get"},{"op":"get","target":"x:/elsewhere"},{"op":"root"}]}),
 json!({"ops":[{"op":"get","target":"E:\\file"},{"op":"get","target":"C:/file"},{"op":"get","target":"C:relative"}]}),
 json!({"surfaces":[{"id":"stopped","kind":"remote","root":"E:\\Project","state":"stopped"},{"id":"other-user","kind":"remote","root":"E:\\Project","session":"other"}],"ops":[{"op":"get","target":"E:/file"},{"op":"root","fallback":"  session path  "}]})]).await;
}
#[tokio::test]
async fn absolute_local_scope_file_directory_missing_and_remote_ownership_match() {
    compare(vec![json!({"setup":[{"path":"project","directory":true},{"path":"outside/existing","content":"x"},{"path":"directory","directory":true}],"surfaces":[{"id":"remote","kind":"remote","root":"E:\\Project"}],"ops":[
 {"op":"local","target":"$WORK/outside/existing","projectRoot":"$WORK/project"},{"op":"local","target":"$WORK/project","projectRoot":"$WORK/project"},{"op":"local","target":"$WORK/missing","projectRoot":"$WORK/project"},{"op":"local","target":"$WORK/outside/existing"},
 {"op":"get","projectRoot":"$WORK/project","target":"$WORK/outside/existing"},{"op":"get","projectRoot":"$WORK/project","target":"$WORK/outside/existing"},{"op":"get","projectRoot":"$WORK/project","target":"$WORK/missing"},{"op":"root"}
 ]}),
 json!({"setup":[{"path":"directory","directory":true},{"path":"existing","content":"x"}],"ops":[{"op":"get","target":"$WORK/directory"},{"op":"get","target":"$WORK/existing"},{"op":"get","target":"$WORK/not-there/file"},{"op":"root"}]})]).await;
}
