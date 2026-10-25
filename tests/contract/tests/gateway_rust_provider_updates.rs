#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::{FutureExt, future::BoxFuture};
use jait_gateway::services::provider_updates::*;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
use tokio::sync::oneshot;
type Callback = Arc<dyn Fn() + Send + Sync>;
#[derive(Default)]
struct Script {
    events: Vec<Value>,
    exec: usize,
    fetch: usize,
    timer: usize,
    callbacks: HashMap<usize, Callback>,
    held: HashMap<String, oneshot::Sender<()>>,
}
type Tasks = Arc<Mutex<Vec<BoxFuture<'static, ()>>>>;
struct Host {
    test: Value,
    script: Arc<Mutex<Script>>,
    now: AtomicI64,
    tasks: Option<Tasks>,
}
impl Host {
    fn emit(&self, name: &str, args: Value) {
        self.script
            .lock()
            .unwrap()
            .events
            .push(json!({"name":name,"args":args}));
    }
    fn wait(&self, value: &Value) -> BoxFuture<'static, Result<(), UpdateError>> {
        let hold = value["hold"].as_str().map(|id| {
            let (send, receive) = oneshot::channel();
            self.script.lock().unwrap().held.insert(id.into(), send);
            receive
        });
        let value = value.clone();
        async move {
            if let Some(hold) = hold {
                let _ = hold.await;
            }
            error(&value)
        }
        .boxed()
    }
}
fn error(v: &Value) -> Result<(), UpdateError> {
    if let Some(e) = v.get("error") {
        return Err(UpdateError {
            message: e.as_str().unwrap().into(),
            stderr: v["stderr"].as_str().map(str::to_owned),
            is_error: true,
        });
    }
    if let Some(v) = v.get("thrown") {
        return Err(UpdateError {
            message: v.to_string(),
            stderr: v.get("stderr").and_then(Value::as_str).map(str::to_owned),
            is_error: false,
        });
    }
    Ok(())
}
impl UpdateHost for Host {
    fn exec(&self, r: CommandRequest) -> BoxFuture<'static, Result<CommandOutput, UpdateError>> {
        self.emit(
            "exec",
            json!([r.command,r.args,{"timeout":r.timeout,"maxBuffer":r.max_buffer}]),
        );
        let n = {
            let mut s = self.script.lock().unwrap();
            let n = s.exec;
            s.exec += 1;
            n
        };
        let v = self.test["exec"][n].clone();
        let wait = self.wait(&v);
        async move {
            wait.await?;
            Ok(CommandOutput {
                stdout: v["stdout"].as_str().unwrap_or("1.0.0").into(),
                stderr: v["stderr"].as_str().unwrap_or("").into(),
            })
        }
        .boxed()
    }
    fn fetch(
        &self,
        r: RegistryRequest,
    ) -> BoxFuture<'static, Result<RegistryResponse, UpdateError>> {
        self.emit("fetch", json!([r.url, r.headers, r.timeout]));
        let n = {
            let mut s = self.script.lock().unwrap();
            let n = s.fetch;
            s.fetch += 1;
            n
        };
        let v = self.test["fetch"][n].clone();
        let wait = self.wait(&v);
        let script = self.script.clone();
        async move {
            wait.await?;
            Ok(RegistryResponse {
                status: v["status"].as_u64().unwrap_or(200) as u16,
                json: async move {
                    script
                        .lock()
                        .unwrap()
                        .events
                        .push(json!({"name":"json","args":[]}));
                    if let Some(e) = v["jsonError"].as_str() {
                        return Err(UpdateError::new(e));
                    }
                    Ok(v.get("body").cloned().unwrap_or(json!({"version":"1.0.0"})))
                }
                .boxed(),
            })
        }
        .boxed()
    }
    fn resolve_path(&self, command: &str) -> Result<Option<String>, UpdateError> {
        self.emit("resolve", json!([command]));
        if let Some(e) = self.test["resolveError"].as_str() {
            Err(UpdateError::new(e))
        } else {
            Ok(self.test["resolved"].as_str().map(str::to_owned))
        }
    }
    fn now(&self) -> i64 {
        self.now.load(Ordering::SeqCst)
    }
    fn spawn(&self, task: BoxFuture<'static, ()>) {
        if let Some(tasks) = &self.tasks {
            tasks.lock().unwrap().push(task);
        } else {
            tokio::spawn(task);
        }
    }
    fn interval(&self, ms: f64, callback: Callback) -> CancelTimer {
        let id = {
            let mut s = self.script.lock().unwrap();
            s.timer += 1;
            let id = s.timer;
            s.callbacks.insert(id, callback);
            id
        };
        self.emit(
            "interval",
            json!([
                if ms.fract() == 0.0 {
                    json!(ms as i64)
                } else {
                    json!(ms)
                },
                id
            ]),
        );
        self.emit("unref", json!([id]));
        let script = self.script.clone();
        Box::new(move || {
            let mut s = script.lock().unwrap();
            s.events.push(json!({"name":"cancel","args":[id]}));
            s.callbacks.remove(&id);
        })
    }
    fn windows(&self) -> bool {
        self.test["windows"].as_bool().unwrap_or(false)
    }
}
async fn flush() {
    for _ in 0..100 {
        tokio::task::yield_now().await;
    }
}
fn outcome<T: serde::Serialize>(v: Result<T, UpdateError>) -> Value {
    match v {
        Ok(result) => json!({"ok":true,"result":result}),
        Err(e) => json!({"ok":false,"error":e.message}),
    }
}
fn joined(directory: &str, file: &str, windows: bool) -> String {
    if windows {
        format!("{}\\{file}", directory.trim_end_matches('\\'))
    } else {
        jait_gateway::services::code_graph::engine::path_join(&[directory, file])
    }
}
async fn native(test: &Value) -> Value {
    let host = Arc::new(Host {
        test: test.clone(),
        script: Arc::default(),
        tasks: None,
        now: AtomicI64::new(test["now"].as_i64().unwrap_or(0)),
    });
    let service = ProviderUpdateService::new(
        host.clone(),
        test["interval"].as_f64().unwrap_or(CHECK_INTERVAL_MS),
    );
    let mut requests: HashMap<String, BoxFuture<'static, Value>> = HashMap::new();
    let mut snapshots = vec![];
    for step in test["steps"].as_array().unwrap() {
        let provider = step["provider"].as_str().unwrap_or("codex");
        let force = step["force"].as_bool().unwrap_or(false);
        let result = match step["op"].as_str().unwrap() {
            "supports" => json!(service.supports(provider)),
            "native" => json!(is_native_claude_install(step["path"].as_str())),
            "path" => json!(resolve_command_path(
                step["command"].as_str().unwrap_or("claude"),
                test["path"].as_str().unwrap_or(""),
                host.windows(),
                |d, f| joined(d, f, host.windows()),
                |p| {
                    host.emit("access", json!([p, 1]));
                    let file = &test["files"][p];
                    if file.is_null() || file["accessError"] == true {
                        return Err(UpdateError::new("missing"));
                    }
                    host.emit("realpath", json!([p]));
                    if file["realpathError"] == true {
                        return Err(UpdateError::new("missing"));
                    }
                    Ok(file["realpath"].as_str().unwrap_or(p).into())
                }
            )),
            "status" => outcome(service.get_status(provider, force).await),
            "update" => outcome(service.update(provider).await),
            "begin" => {
                let future = if step["update"] == true {
                    service.update(provider).map(outcome).boxed()
                } else {
                    service.get_status(provider, force).map(outcome).boxed()
                };
                requests.insert(step["id"].as_str().unwrap().into(), future);
                Value::Null
            }
            "wait" => requests.remove(step["id"].as_str().unwrap()).unwrap().await,
            "drop" => {
                requests.remove(step["id"].as_str().unwrap());
                Value::Null
            }
            "release" => {
                let sender = host
                    .script
                    .lock()
                    .unwrap()
                    .held
                    .remove(step["id"].as_str().unwrap());
                if let Some(sender) = sender {
                    let _ = sender.send(());
                }
                Value::Null
            }
            "advance" => {
                host.now
                    .fetch_add(step["ms"].as_i64().unwrap(), Ordering::SeqCst);
                Value::Null
            }
            "start" => {
                service.start();
                Value::Null
            }
            "stop" => {
                service.stop();
                Value::Null
            }
            "tick" => {
                let callbacks: Vec<_> = host
                    .script
                    .lock()
                    .unwrap()
                    .callbacks
                    .values()
                    .cloned()
                    .collect();
                for callback in callbacks {
                    callback();
                }
                Value::Null
            }
            _ => panic!("unknown action"),
        };
        flush().await;
        let events = std::mem::take(&mut host.script.lock().unwrap().events);
        snapshots.push(json!({"result":result,"events":events}));
    }
    service.stop();
    flush().await;
    json!(snapshots)
}
async fn compare(name: &str, cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/provider-updates/contracts"),
        json!({"version":1,"calls":[{"op":"nativeproviderupdates.compare","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let mut actual = vec![];
    for (i, test) in cases.iter().enumerate() {
        let result = native(test).await;
        assert_eq!(result, expected[i], "case {i}: {test}");
        actual.push(result);
    }
    std::fs::write(
        root.join(format!(
            ".jait/artifacts/gateway-rust/provider-updates/{name}-comparisons.json"
        )),
        serde_json::to_vec_pretty(
            &json!({"count":cases.len(),"cases":cases,"native":actual,"reference":expected}),
        )
        .unwrap(),
    )
    .unwrap();
}
fn status() -> Value {
    json!({"op":"status"})
}
fn update() -> Value {
    json!({"op":"update"})
}
#[tokio::test]
async fn versions_registry_failures_and_fixed_commands() {
    let mut cases = vec![];
    for (installed, latest) in [
        ("codex v1.2.3\n", "1.3.0"),
        ("", "1.0.0"),
        ("junk", "junk"),
        ("v2.1.0-beta.3", "2.1.0"),
        ("2.1.0", "2.1.0-rc.1"),
        ("2.1.1", "2.1.0"),
        ("build2.0.0 3.0.1", "3.0.2"),
        ("é1.2.3", "1.2.4"),
        ("_1.2.3", "1.0.0"),
        ("9999999999999999999999.0.0", "10000000000000000000000.0.0"),
        ("1.02.003+build", "1.2.3"),
        ("version v01.2.3-rc..", "01.2.4"),
    ] {
        cases.push(json!({"exec":[{"stdout":installed}],"fetch":[{"body":{"version":latest}}],"steps":[status()]}));
    }
    for fetch in [
        json!({"status":404,"jsonError":"must not decode"}),
        json!({"error":"offline"}),
        json!({"jsonError":"bad JSON"}),
        json!({"body":{}}),
        json!({"body":{"version":42}}),
        json!({"body":null}),
        json!({"body":42}),
        json!({"body":[]}),
    ] {
        cases.push(json!({"fetch":[fetch],"steps":[status()]}));
    }
    cases.push(json!({"exec":[{"stdout":"","stderr":"cli 7.2.1"}],"fetch":[{"body":{"version":"7.2.2"}}],"steps":[status()]}));
    cases.push(json!({"exec":[{"error":"spawn denied"}],"steps":[status()]}));
    for windows in [false, true] {
        cases.push(json!({"windows":windows,"steps":[update()]}));
    }
    for resolved in [
        Value::Null,
        json!("/home/u/.npm-global/bin/claude"),
        json!("/home/u/.local/share/claude/v1"),
        json!("C:\\Users\\u\\.CLAUDE\\LOCAL\\claude.exe"),
    ] {
        cases.push(json!({"resolved":resolved,"steps":[{"op":"update","provider":"claude-code"}]}));
    }
    for error in [
        json!({"error":"install failed","stderr":"  EACCES\n"}),
        json!({"error":"install failed","stderr":" \u{feff}"}),
        json!({"thrown":{"stderr":"bad policy"}}),
        json!({"thrown":"failure"}),
    ] {
        cases.push(json!({"exec":[error],"steps":[update()]}));
    }
    cases.push(json!({"exec":[{}, {"stdout":"1.0.0"}],"fetch":[{"body":{"version":"2.0.0"}}],"steps":[update()]}));
    cases.push(
        json!({"resolveError":"bad resolver","steps":[{"op":"update","provider":"claude-code"}]}),
    );
    cases.push(json!({"steps":[{"op":"status","provider":"jait"},{"op":"update","provider":"__proto__"},{"op":"supports","provider":"constructor"},{"op":"supports","provider":"claude-code"}]}));
    for now in [
        -62_167_219_200_000_i64,
        -62_198_755_200_000,
        253_402_300_800_000,
        8_640_000_000_000_000,
        -8_640_000_000_000_000,
        8_640_000_000_000_001,
        -8_640_000_000_000_001,
    ] {
        cases.push(json!({"now":now,"steps":[status(),status()]}));
    }
    compare("versions", cases).await;
}
#[tokio::test]
async fn freshness_inflight_forced_overlap_and_timer_lifecycle() {
    compare("cache",vec![
  json!({"interval":100,"steps":[status(),status(),{"op":"advance","ms":99},status(),{"op":"advance","ms":1},status(),{"op":"status","force":true},{"op":"advance","ms":-500},status()]}),
  json!({"exec":[{"hold":"a"}],"steps":[{"op":"begin","id":"a"},{"op":"begin","id":"b"},{"op":"release","id":"a"},{"op":"wait","id":"a"},{"op":"wait","id":"b"},status()]}),
  json!({"exec":[{"hold":"a"},{"hold":"b"},{"stdout":"3.0.0"}],"steps":[{"op":"begin","id":"a"},{"op":"begin","id":"b","force":true},{"op":"release","id":"a"},{"op":"wait","id":"a"},status(),{"op":"status","force":true},{"op":"release","id":"b"},{"op":"wait","id":"b"},status()]}),
  json!({"exec":[{"hold":"a","error":"old failed"},{"hold":"b"}],"steps":[{"op":"begin","id":"a"},{"op":"begin","id":"b","force":true},{"op":"release","id":"a"},{"op":"wait","id":"a"},status(),{"op":"release","id":"b"},{"op":"wait","id":"b"}]}),
  json!({"exec":[{"error":"temporary"}],"steps":[status(),status(),status()]}),
  json!({"steps":[{"op":"start"},{"op":"start"},{"op":"tick"},{"op":"stop"},{"op":"stop"},{"op":"tick"},{"op":"start"},{"op":"stop"}]}),
  json!({"exec":[{"hold":"a"},{"hold":"b"}],"steps":[{"op":"start"},{"op":"stop"},{"op":"release","id":"a"},{"op":"release","id":"b"},status()]}),
  json!({"exec":[{"hold":"a"}],"steps":[{"op":"begin","id":"a"},{"op":"drop","id":"a"},{"op":"release","id":"a"},status()]}),
  json!({"exec":[{"hold":"a"}],"steps":[{"op":"begin","id":"a","update":true},{"op":"drop","id":"a"},{"op":"release","id":"a"},status()]}),
  json!({"steps":[status(),update(),status()]}),
  json!({"exec":[{"hold":"slow"}],"fetch":[{"error":"registry denied"}],"steps":[{"op":"begin","id":"a"},{"op":"wait","id":"a"},{"op":"release","id":"slow"},status()]}),
  json!({"exec":[{"error":"spawn denied"}],"fetch":[{"hold":"slow"}],"steps":[{"op":"begin","id":"a"},{"op":"wait","id":"a"},{"op":"release","id":"slow"},status()]}),
  json!({"exec":[{}, {"error":"install denied"}],"steps":[status(),update(),status()]}),
  json!({"exec":[{}, {"error":"forced denied"}],"steps":[status(),{"op":"status","force":true},status()]}),
  json!({"exec":[{"stdout":"1.0.0"},{},{"stdout":"2.0.0"}],"fetch":[{"body":{"version":"2.0.0"}},{"body":{"version":"2.0.0"}}],"steps":[status(),update(),status()]}),
        json!({"exec":[{},{}],"fetch":[{"error":"verification failed"}],"steps":[update(),status()]}),
        json!({"interval":0,"steps":[status(),status()]}),
  json!({"interval":-1,"steps":[status(),status()]}),
 ]).await;
}
#[tokio::test]
async fn path_search_realpath_errors_and_native_install_detection() {
    compare("path",vec![
 json!({"steps":[{"op":"path"},{"op":"native"},{"op":"native","path":"/a/.claude/local/bin/claude"},{"op":"native","path":"C:\\A\\.Local\\Share\\Claude\\x"},{"op":"native","path":"/a/.claude/locality/x"}]}),
 json!({"path":":/one::/two:/three:","files":{"/one/claude":{"realpathError":true},"/two/claude":{"realpath":"/resolved/claude"}},"steps":[{"op":"path"}]}),
 json!({"windows":true,"path":";C:\\one;;D:\\two;","files":{"C:\\one\\claude.exe":{"accessError":true},"C:\\one\\claude.cmd":{"realpathError":true},"D:\\two\\claude.bat":{"realpath":"D:\\target\\cli"}},"steps":[{"op":"path"}]}),
 json!({"path":"/one/../two:.","files":{"claude":{"realpath":"/resolved"}},"steps":[{"op":"path"}]}),
 ]).await;
}

fn capturing_host(test: Value) -> (Arc<Host>, Tasks) {
    let tasks: Tasks = Arc::default();
    (
        Arc::new(Host {
            test,
            script: Arc::default(),
            now: AtomicI64::new(0),
            tasks: Some(tasks.clone()),
        }),
        tasks,
    )
}
async fn run_captured(tasks: &Tasks) {
    let pending = std::mem::take(&mut *tasks.lock().unwrap());
    futures_util::future::join_all(pending).await;
}
#[tokio::test]
async fn cancelled_supervisor_releases_inflight_even_before_first_poll() {
    for poll in [false, true] {
        let (host, tasks) = capturing_host(json!({"exec":[{"hold":"pending"}]}));
        let service = ProviderUpdateService::new(host.clone(), CHECK_INTERVAL_MS);
        let first = service.get_status("codex", false);
        let second = service.get_status("codex", false);
        let pending = std::mem::take(&mut *tasks.lock().unwrap());
        assert_eq!(pending.len(), 3);
        if poll {
            for task in pending {
                let _ = task.now_or_never();
            }
        } else {
            drop(pending);
        }
        assert_eq!(
            first.await,
            Err(UpdateError::new("Provider update task cancelled"))
        );
        assert_eq!(
            second.await,
            Err(UpdateError::new("Provider update task cancelled"))
        );
        let retry = service.get_status("codex", false);
        assert_eq!(host.script.lock().unwrap().exec, 2);
        run_captured(&tasks).await;
        assert_eq!(retry.await.unwrap().unwrap().current_version, "1.0.0");
    }
}
#[tokio::test]
async fn concurrent_callers_share_one_admission_and_one_timer() {
    let (host, tasks) = capturing_host(json!({}));
    let service = ProviderUpdateService::new(host.clone(), CHECK_INTERVAL_MS);
    let callers: Vec<_> = (0..24)
        .map(|_| {
            let service = service.clone();
            std::thread::spawn(move || service.get_status("codex", false))
        })
        .collect();
    let requests: Vec<_> = callers.into_iter().map(|t| t.join().unwrap()).collect();
    assert_eq!(host.script.lock().unwrap().exec, 1);
    assert_eq!(host.script.lock().unwrap().fetch, 1);
    run_captured(&tasks).await;
    for request in requests {
        assert!(request.await.unwrap().is_some());
    }
    let callers: Vec<_> = (0..24)
        .map(|_| {
            let service = service.clone();
            std::thread::spawn(move || service.start())
        })
        .collect();
    for caller in callers {
        caller.join().unwrap();
    }
    assert_eq!(host.script.lock().unwrap().timer, 1);
    assert_eq!(host.script.lock().unwrap().callbacks.len(), 1);
    run_captured(&tasks).await;
    drop(service);
    assert!(host.script.lock().unwrap().callbacks.is_empty());
}
