#[path = "../src/internal_driver.rs"]
mod internal_driver;
type BoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;
use jait_gateway::{
    providers::{
        opencode_credentials::*,
        snapshot::{ProviderSnapshotCache, SnapshotProvider},
    },
    time::Clock,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
use tokio::sync::oneshot;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn output() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/provider-helpers")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &output(),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
#[test]
fn credential_files_preserve_connections_permissions_and_invalid_data() {
    let matrices = [
        json!([{"op":"has"},{"op":"read"},{"op":"set","key":"  fixture-key 😀 \u{feff}"},{"op":"has"},{"op":"read"},{"op":"set","key":null},{"op":"has"}]),
        json!([{"op":"raw","raw":"{\"other\":{\"type\":\"oauth\",\"token\":\"fixture\"},\"10\":2,\"2\":3,\"opencode-go\":{\"key\":\"legacy\",\"type\":\"oauth\"}}"},{"op":"read"},{"op":"set","key":""},{"op":"has"},{"op":"set","key":"replacement"},{"op":"set","key":null}]),
        json!([{"op":"raw","raw":"[1,2]"},{"op":"has"},{"op":"read"},{"op":"set","key":"replacement"}]),
        json!([{"op":"raw","raw":"null"},{"op":"has"},{"op":"read"},{"op":"set","key":null}]),
        json!([{"op":"raw","raw":"{bad"},{"op":"has"},{"op":"read"},{"op":"set","key":"replacement"}]),
        json!([{"op":"directory"},{"op":"has"},{"op":"read"},{"op":"set","key":"replacement"}]),
        json!([{"op":"raw","hex":"7b226f70656e636f64652d676f223a7b2274797065223a22617069222c226b6579223a22ff227d7d"},{"op":"read"},{"op":"set","key":null}]),
        json!([{"op":"raw","raw":"{\"opencode-go\":{\"type\":\"api\",\"key\":\"   \"}}"},{"op":"has"},{"op":"read"}]),
    ];
    for (index, steps) in matrices.iter().enumerate() {
        let directory = output();
        let ts = directory.join("reference");
        let native = directory.join("native");
        let expected = reference(
            json!({"op":"nativeproviderhelpers.credentials","directory":ts,"steps":steps}),
        );
        let paths = CredentialPaths {
            home: Some(native.to_string_lossy().into()),
            xdg_data_home: None,
            system_home: directory.clone(),
        };
        let path = paths.auth_path();
        let mut rows = vec![];
        for step in steps.as_array().unwrap() {
            let result = (|| -> Result<Value, String> {
                match step["op"].as_str().unwrap() {
                    "raw" => {
                        fs::create_dir_all(path.parent().unwrap()).unwrap();
                        let bytes = step["hex"]
                            .as_str()
                            .map(|s| hex::decode(s).unwrap())
                            .unwrap_or_else(|| step["raw"].as_str().unwrap().as_bytes().to_vec());
                        fs::write(&path, bytes).unwrap();
                        Ok(Value::Null)
                    }
                    "directory" => {
                        fs::create_dir_all(&path).unwrap();
                        Ok(Value::Null)
                    }
                    "has" => Ok(json!(has_go_credential(&paths))),
                    "read" => Ok(json!(read_go_credential(&paths)?)),
                    "set" => {
                        set_go_credential(step["key"].as_str(), &paths)?;
                        Ok(Value::Null)
                    }
                    _ => unreachable!(),
                }
            })();
            let value=result.unwrap_or_else(|e|json!({"error":if e.starts_with("OpenCode credentials could not be read."){"preserved"}else{"io"}}));
            let file = path.is_file();
            #[cfg(unix)]
            let mode = {
                use std::os::unix::fs::PermissionsExt;
                file.then(|| fs::metadata(&path).unwrap().permissions().mode() & 0o777)
            };
            let leftovers = path
                .parent()
                .filter(|p| p.is_dir())
                .map(|p| {
                    fs::read_dir(p)
                        .unwrap()
                        .filter_map(Result::ok)
                        .filter(|p| p.file_name().to_string_lossy().ends_with(".tmp"))
                        .map(|p| p.file_name().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            rows.push(json!({"value":value,"raw":file.then(||String::from_utf8_lossy(&fs::read(&path).unwrap()).into_owned()),"mode":mode,"leftovers":leftovers}));
        }
        assert_eq!(json!(rows), expected, "credential matrix {index}");
    }
}
#[test]
fn credential_path_precedence_is_explicit() {
    let paths = CredentialPaths {
        xdg_data_home: Some("/fixture/data".into()),
        home: Some("/fixture/home".into()),
        system_home: "/fixture/system".into(),
    };
    assert_eq!(
        paths.auth_path(),
        PathBuf::from("/fixture/data/opencode/auth.json")
    );
    let paths = CredentialPaths {
        xdg_data_home: Some("".into()),
        ..paths
    };
    assert_eq!(
        paths.auth_path(),
        PathBuf::from("/fixture/home/.local/share/opencode/auth.json")
    );
    let paths = CredentialPaths {
        home: Some("".into()),
        ..paths
    };
    assert_eq!(
        paths.auth_path(),
        PathBuf::from("/fixture/system/.local/share/opencode/auth.json")
    );
}
type Pending = Arc<Mutex<HashMap<String, Vec<oneshot::Sender<Result<bool, String>>>>>>;
async fn snapshots(call: Value) -> Value {
    let counts = Arc::new(Mutex::new(serde_json::Map::new()));
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let mut infos = HashMap::new();
    let mut providers = vec![];
    let clock = Arc::new(AtomicI64::new(call["now"].as_i64().unwrap_or(1000)));
    for p in call["providers"].as_array().unwrap() {
        let info = Arc::new(Mutex::new(p["info"].clone()));
        infos.insert(p["id"].as_str().unwrap().to_string(), info.clone());
        let id = p["id"].as_str().unwrap().to_string();
        let definition = p.clone();
        let log = counts.clone();
        let registry = pending.clone();
        let availability = Arc::new(move || -> BoxFuture<'static, Result<bool, String>> {
            let id = id.clone();
            let definition = definition.clone();
            let log = log.clone();
            let registry = registry.clone();
            Box::pin(async move {
                {
                    let mut counts = log.lock().unwrap();
                    let key = format!("{id}:availability");
                    let n = counts.get(&key).and_then(Value::as_u64).unwrap_or(0) + 1;
                    counts.insert(key, json!(n));
                }
                if definition["delay"] == true {
                    let (send, receive) = oneshot::channel();
                    registry.lock().unwrap().entry(id).or_default().push(send);
                    receive.await.unwrap()
                } else if definition["availabilityError"] == true {
                    Err("fixture probe failure".into())
                } else {
                    Ok(definition["installed"].as_bool().unwrap_or(true))
                }
            })
        });
        let auth = if p["hasAuth"] == true {
            let p = p.clone();
            let counts = counts.clone();
            Some(Arc::new(
                move || -> BoxFuture<'static, Result<Option<Value>, String>> {
                    let p = p.clone();
                    let counts = counts.clone();
                    Box::pin(async move {
                        {
                            let mut counts = counts.lock().unwrap();
                            let key = format!("{}:auth", p["id"].as_str().unwrap());
                            let n = counts.get(&key).and_then(Value::as_u64).unwrap_or(0) + 1;
                            counts.insert(key, json!(n));
                        }
                        if p["authError"] == true {
                            Err("fixture auth failure".into())
                        } else {
                            Ok(p.get("auth").cloned())
                        }
                    })
                },
            )
                as jait_gateway::providers::snapshot::AuthStatus)
        } else {
            None
        };
        providers.push(SnapshotProvider {
            id: p["id"].as_str().unwrap().into(),
            provider_type: p["providerType"].as_str().map(str::to_string),
            info: Arc::new(move || info.lock().unwrap().clone()),
            availability,
            auth,
        });
    }
    let providers = Arc::new(Mutex::new(providers));
    let listed = Arc::new(Mutex::new(0));
    let list = listed.clone();
    let registry = providers.clone();
    let error = call["registryError"] == true;
    let now = clock.clone();
    let clock_fn: Clock = Arc::new(move || now.load(Ordering::SeqCst));
    let cache = ProviderSnapshotCache::new(
        Arc::new(move || {
            *list.lock().unwrap() += 1;
            if error {
                panic!("registry failed")
            };
            registry.lock().unwrap().clone()
        }),
        clock_fn,
    );
    let done = Arc::new(Mutex::new(serde_json::Map::new()));
    let mut rows = vec![];
    for step in call["steps"].as_array().unwrap() {
        match step["op"].as_str().unwrap() {
            "get" => {
                let future = cache.get(step["force"].as_bool().unwrap_or(false));
                let key = step["key"].as_str().unwrap().to_string();
                let done = done.clone();
                tokio::spawn(async move {
                    let value = future
                        .await
                        .map(|v| json!(*v))
                        .unwrap_or(json!({"error":true}));
                    done.lock().unwrap().insert(key, value);
                });
            }
            "warm" => cache.warm(),
            "invalidate" => cache.invalidate(),
            "time" => clock.store(step["now"].as_i64().unwrap(), Ordering::SeqCst),
            "info" => {
                *infos[step["id"].as_str().unwrap()].lock().unwrap() = step["info"].clone();
            }
            "empty" => providers.lock().unwrap().clear(),
            "release" => {
                let sender = pending
                    .lock()
                    .unwrap()
                    .get_mut(step["id"].as_str().unwrap())
                    .unwrap()
                    .remove(0);
                let value = if step["error"] == true {
                    Err("fixture failure".into())
                } else {
                    Ok(step["value"].as_bool().unwrap_or(true))
                };
                sender.send(value).unwrap();
            }
            _ => unreachable!(),
        }
        for _ in 0..30 {
            tokio::task::yield_now().await;
        }
        rows.push(json!({"done":done.lock().unwrap().clone(),"counts":counts.lock().unwrap().clone(),"listed":*listed.lock().unwrap()}));
    }
    json!(rows)
}
#[tokio::test]
async fn snapshots_deduplicate_cold_forced_warm_stale_and_invalidated_work() {
    let info = json!({"name":"Provider","description":"fixture","available":false,"modes":["default"],"auth":{"authenticated":false},"providerType":"default"});
    let call = json!({"op":"nativeproviderhelpers.snapshots","providers":[{"id":"one","info":info,"delay":true}],"steps":[
     {"op":"get","key":"cold"},{"op":"get","key":"forced","force":true},{"op":"warm"},{"op":"invalidate"},{"op":"get","key":"invalidated"},
     {"op":"release","id":"one"},{"op":"time","now":60999},{"op":"get","key":"fresh"},{"op":"time","now":61000},{"op":"get","key":"stale"},
     {"op":"get","key":"stale2"},{"op":"get","key":"forced2","force":true},{"op":"info","id":"one","info":{"name":"new","modes":[],"available":true}},
     {"op":"release","id":"one","value":false},{"op":"get","key":"updated"},{"op":"empty"},{"op":"get","key":"empty","force":true},{"op":"get","key":"cachedEmpty"}
    ]});
    assert_eq!(snapshots(call.clone()).await, reference(call));
}
#[tokio::test]
async fn snapshots_preserve_order_and_localize_availability_and_auth_failures() {
    let info = json!({"name":"Provider","description":"fixture","available":true,"modes":[],"auth":{"authenticated":true,"method":"oauth","extra":1},"unavailableReason":null});
    let call = json!({"op":"nativeproviderhelpers.snapshots","providers":[
  {"id":"one","info":info,"availabilityError":true,"hasAuth":true,"authError":true},
  {"id":"two","info":info,"providerType":"override","hasAuth":true,"auth":{"authenticated":false}},
  {"id":"three","info":{"name":"third","available":true,"modes":[]},"hasAuth":true,"authError":true},
  {"id":"four","info":info,"hasAuth":true,"auth":null}],"steps":[{"op":"get","key":"first"},{"op":"get","key":"cached"},{"op":"time","now":0},{"op":"get","key":"backwards"}]});
    assert_eq!(snapshots(call.clone()).await, reference(call));
}
#[tokio::test]
async fn failed_registry_refresh_releases_inflight_for_retry() {
    let call = json!({"op":"nativeproviderhelpers.snapshots","providers":[],"registryError":true,"steps":[{"op":"get","key":"first"},{"op":"get","key":"retry"}]});
    assert_eq!(snapshots(call.clone()).await, reference(call));
}
