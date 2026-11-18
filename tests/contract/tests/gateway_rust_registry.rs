#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::registry::*;
type BoxFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
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
fn reference(calls: Vec<Value>) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/provider-registry")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":calls}), &|| false).unwrap()
}
struct Fixture {
    def: Value,
    id: String,
    owner: Option<String>,
    info: Arc<Mutex<Value>>,
    events: Arc<Mutex<Vec<String>>>,
    started: Arc<tokio::sync::Semaphore>,
    release: Arc<tokio::sync::Semaphore>,
}
impl ProviderAdapter for Fixture {
    fn id(&self) -> &str {
        &self.id
    }
    fn owner_user_id(&self) -> Option<&str> {
        self.owner.as_deref()
    }
    fn info(&self) -> Value {
        self.info.lock().unwrap().clone()
    }
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        let alias = self.def["alias"].as_str().unwrap();
        self.events.lock().unwrap().push(format!("check:{alias}"));
        self.started.add_permits(1);
        let (def, release, info) = (self.def.clone(), self.release.clone(), self.info.clone());
        Box::pin(async move {
            if def["hold"] == true {
                release.acquire().await.unwrap().forget();
            }
            if let Some(e) = def["checkError"].as_str() {
                return Err(e.into());
            }
            info.lock().unwrap()["checked"] = json!(true);
            Ok(())
        })
    }
    fn dispose(&self) -> BoxFuture<'static, Result<(), String>> {
        let def = self.def.clone();
        let events = self.events.clone();
        if def["noDispose"] != true {
            events
                .lock()
                .unwrap()
                .push(format!("dispose:{}", def["alias"].as_str().unwrap()));
        }
        Box::pin(async move {
            if let Some(e) = def["disposeError"]
                .as_str()
                .filter(|_| def["noDispose"] != true)
            {
                Err(e.into())
            } else {
                Ok(())
            }
        })
    }
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativeregistry.run");
    let expected = reference(vec![call.clone()])[0].clone();
    let registry = ProviderRegistry::default();
    let events = Arc::new(Mutex::new(vec![]));
    let errors = Arc::new(Mutex::new(vec![]));
    let started = Arc::new(tokio::sync::Semaphore::new(0));
    let log = {
        let e = errors.clone();
        Arc::new(move |s| e.lock().unwrap().push(s)) as Arc<dyn Fn(String) + Send + Sync>
    };
    let mut fixtures = HashMap::<String, Arc<Fixture>>::new();
    let mut names = HashMap::<usize, String>::new();
    let label = |p: Option<Arc<dyn ProviderAdapter>>, names: &HashMap<usize, String>| {
        p.map(|p| json!(names.get(&(Arc::as_ptr(&p) as *const () as usize)).unwrap()))
            .unwrap_or(Value::Null)
    };
    let mut pending: Option<tokio::task::JoinHandle<Vec<Value>>> = None;
    let mut results = vec![];
    for s in call["steps"].as_array().unwrap() {
        let result: Result<Value, String> = match s["action"].as_str().unwrap() {
            "register" => {
                let d = s["def"].clone();
                let id = d["id"].as_str().unwrap().to_string();
                let alias = d["alias"].as_str().unwrap().to_string();
                let fixture = Arc::new(Fixture {
                    def: d.clone(),
                    id: id.clone(),
                    owner: d["owner"].as_str().map(String::from),
                    info: Arc::new(Mutex::new(
                        d.get("info")
                            .cloned()
                            .unwrap_or(json!({"id":id,"label":alias})),
                    )),
                    events: events.clone(),
                    started: started.clone(),
                    release: Arc::new(tokio::sync::Semaphore::new(0)),
                });
                names.insert(Arc::as_ptr(&fixture) as usize, alias.clone());
                registry.register(fixture.clone());
                fixtures.insert(alias, fixture);
                Ok(Value::Null)
            }
            "get" => Ok(label(registry.get(s["id"].as_str().unwrap()), &names)),
            "getUser" => Ok(label(
                registry.get_for_user(s["id"].as_str().unwrap(), s["user"].as_str().unwrap()),
                &names,
            )),
            "visible" => Ok(json!(
                registry.is_visible_to(s["id"].as_str().unwrap(), s["user"].as_str().unwrap())
            )),
            "throw" => registry
                .get_or_throw(s["id"].as_str().unwrap())
                .map(|p| label(Some(p), &names)),
            "list" => Ok(json!(
                registry
                    .list()
                    .into_iter()
                    .map(|p| label(Some(p), &names))
                    .collect::<Vec<_>>()
            )),
            "unregister" => registry
                .unregister(s["id"].as_str().unwrap())
                .await
                .map(|v| json!(v)),
            "check" => Ok(json!(registry.check_all_with_log(log.clone()).await)),
            "begin" => {
                let count = registry.list().len();
                if started.available_permits() > 0 {
                    started
                        .try_acquire_many(started.available_permits() as u32)
                        .unwrap()
                        .forget();
                }
                let r = registry.clone();
                let log = log.clone();
                pending = Some(tokio::spawn(async move { r.check_all_with_log(log).await }));
                if count > 0 {
                    tokio::time::timeout(
                        std::time::Duration::from_secs(2),
                        started.acquire_many(count as u32),
                    )
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                }
                Ok(Value::Null)
            }
            "release" => {
                fixtures[s["alias"].as_str().unwrap()]
                    .release
                    .add_permits(1);
                Ok(Value::Null)
            }
            "finish" => Ok(json!(pending.take().unwrap().await.unwrap())),
            _ => panic!("unknown fixture action"),
        };
        results.push(result.unwrap_or_else(|e| json!({"error":e})));
    }
    let actual = json!({"results":results,"events":*events.lock().unwrap(),"errors":*errors.lock().unwrap()});
    assert_eq!(actual, expected);
}
#[tokio::test]
async fn registry_preserves_map_order_replacement_and_owner_visibility() {
    compare(json!({"steps":[
  {"action":"register","def":{"id":"a","alias":"first"}},
  {"action":"register","def":{"id":"b","alias":"owned","owner":"owner"}},
  {"action":"get","id":"missing"},{"action":"throw","id":"missing"},
  {"action":"getUser","id":"a","user":"foreign"},{"action":"getUser","id":"b","user":"foreign"},
  {"action":"visible","id":"b","user":"owner"},{"action":"visible","id":"missing","user":"owner"},
  {"action":"register","def":{"id":"a","alias":"replacement","owner":""}},
  {"action":"list"},{"action":"get","id":"a"},{"action":"getUser","id":"a","user":""},
  {"action":"unregister","id":"b"},{"action":"unregister","id":"b"},{"action":"list"}
 ]})).await;
}
#[tokio::test]
async fn unregister_removes_before_disposal_failure_and_optional_disposal_is_supported() {
    compare(json!({"steps":[
  {"action":"register","def":{"id":"bad","alias":"bad","disposeError":"dispose failed"}},
  {"action":"unregister","id":"bad"},{"action":"get","id":"bad"},{"action":"unregister","id":"bad"},
  {"action":"register","def":{"id":"plain","alias":"plain","noDispose":true}},
  {"action":"unregister","id":"plain"},{"action":"unregister","id":"missing"},
  {"action":"check"}
 ]})).await;
}
#[tokio::test]
async fn availability_settles_all_checks_and_logs_failures_in_registration_order() {
    compare(json!({"steps":[
     {"action":"register","def":{"id":"a","alias":"a","hold":true,"checkError":"failure a"}},
     {"action":"register","def":{"id":"b","alias":"b","hold":true,"checkError":"failure b"}},
     {"action":"register","def":{"id":"c","alias":"c"}},
     {"action":"begin"},{"action":"release","alias":"b"},{"action":"release","alias":"a"},
     {"action":"finish"},{"action":"list"}
    ]}))
    .await;
}
#[tokio::test]
async fn availability_returns_current_registration_after_inflight_replacement_and_removal() {
    compare(json!({"steps":[
  {"action":"register","def":{"id":"a","alias":"old-a","hold":true}},
  {"action":"register","def":{"id":"b","alias":"old-b","hold":true}},
  {"action":"begin"},
  {"action":"unregister","id":"a"},
  {"action":"register","def":{"id":"b","alias":"new-b"}},
  {"action":"register","def":{"id":"c","alias":"new-c"}},
  {"action":"release","alias":"old-b"},{"action":"release","alias":"old-a"},{"action":"finish"},{"action":"list"}
 ]})).await;
}
#[test]
fn mcp_refs_normalize_hosts_urls_context_and_keep_router_auth_opt_in() {
    let mut calls = vec![];
    for host in ["0.0.0.0", "127.0.0.1", "localhost", "[::1]"] {
        for base in [
            Value::Null,
            json!(""),
            json!(" \u{feff} "),
            json!(" https://Example.TEST:443/path/// "),
            json!("http://user:pass@localhost:20128/base?x=y#z"),
            json!("invalid"),
            json!("http://["),
            json!("://broken"),
            json!("mailto:owner@example.invalid"),
        ] {
            calls.push(json!({"op":"nativeregistry.refs","config":{"host":host,"port":8220},"base":base,"context":{"sessionId":"s +&🦀","projectRoot":"/tmp/a b","runtimeMode":"supervised"}}));
        }
    }
    for env in [
        json!({}),
        json!({"JAIT_OMNIROUTE_MCP":"true","OMNIROUTE_API_KEY":"key"}),
        json!({"JAIT_OMNIROUTE_MCP":"1"}),
        json!({"JAIT_OMNIROUTE_MCP":"1","OMNIROUTE_API_KEY":" "}),
        json!({"JAIT_OMNIROUTE_MCP":" 1 ","OMNIROUTE_API_KEY":" key "}),
        json!({"JAIT_OMNIROUTE_MCP":"1","OMNIROUTE_API_KEY":"key","OMNIROUTE_BASE_URL":" https://router.test/root/v1/// "}),
        json!({"JAIT_OMNIROUTE_MCP":"1","OMNIROUTE_API_KEY":"key","OMNIROUTE_BASE_URL":"http://router.test/V1"}),
    ] {
        calls.push(json!({"op":"nativeregistry.refs","config":{"host":"localhost","port":1},"context":{},"env":env}));
    }
    let expected = reference(calls.clone());
    for (i, call) in calls.iter().enumerate() {
        let env: HashMap<String, String> =
            serde_json::from_value(call.get("env").cloned().unwrap_or(json!({}))).unwrap();
        let host = call["config"]["host"].as_str().unwrap();
        let port = call["config"]["port"].as_u64().unwrap() as u16;
        let base = call["base"].as_str();
        let ctx = &call["context"];
        let actual = match build_jait_mcp_server_ref(host, port, base, ctx) {
            Ok(one) => {
                json!({"one":one,"all":build_jait_mcp_server_refs(host,port,base,ctx,&env).unwrap(),"omniroute":build_omniroute_mcp_server_ref(&env)})
            }
            Err(e) => json!({"error":e}),
        };
        assert_eq!(actual, expected[i], "ref case {call}");
    }
}
