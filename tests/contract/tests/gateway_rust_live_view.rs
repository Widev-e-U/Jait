#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::services::live_view_manager::*;
use serde_json::{Value, json};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
};
type Fut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
struct Fixture {
    call: Value,
    events: Arc<Mutex<Vec<Value>>>,
    clock: AtomicU64,
    reservations: AtomicUsize,
    children: AtomicUsize,
    spawned: AtomicBool,
}
impl Fixture {
    fn new(call: Value) -> Self {
        Self {
            call,
            events: Arc::new(Mutex::new(vec![])),
            clock: AtomicU64::new(0),
            reservations: AtomicUsize::new(0),
            children: AtomicUsize::new(0),
            spawned: AtomicBool::new(false),
        }
    }
    fn event(&self, v: Value) {
        self.events.lock().unwrap().push(v);
    }
}
struct Child {
    id: usize,
    events: Arc<Mutex<Vec<Value>>>,
    fail: bool,
    terminated: bool,
}
impl LiveViewProcess for Child {
    fn terminate(&mut self) -> Result<()> {
        if self.terminated {
            return Ok(());
        }
        self.terminated = true;
        self.events
            .lock()
            .unwrap()
            .push(json!({"name":"kill","id":self.id}));
        if self.fail {
            Err(LiveViewError("kill failed".into()))
        } else {
            Ok(())
        }
    }
}
impl Drop for Child {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}
impl LiveViewHost for Fixture {
    fn cwd(&self) -> Result<String> {
        Ok("/fixture/project".into())
    }
    fn max_container_starts(&self) -> Option<String> {
        self.call["environment"].as_str().map(str::to_string)
    }
    fn reserve_port(&self, container: bool) -> Fut<'_, Result<u16>> {
        let n = self.reservations.fetch_add(1, Ordering::SeqCst) + 1;
        let port = 6099 + n as u16;
        self.event(json!({"name":"reserve","container":container,"port":port}));
        Box::pin(async move {
            if self.call["reserveFailure"] == n {
                return Err(LiveViewError("reserve failed".into()));
            }
            if let Some(failure) = self.call["reserveErrors"].get(n.to_string()) {
                for _ in 0..failure["ticks"].as_u64().unwrap_or(0) {
                    tokio::task::yield_now().await;
                }
                return Err(LiveViewError(failure["message"].as_str().unwrap().into()));
            }
            Ok(port)
        })
    }
    fn display_exists(&self, display: &str) -> bool {
        let exists = if self.spawned.load(Ordering::SeqCst) {
            self.clock.load(Ordering::SeqCst) >= self.call["readyAt"].as_u64().unwrap_or(0)
        } else {
            self.call["allOccupied"] == true
                || self.call["occupied"]
                    .as_array()
                    .is_some_and(|a| a.contains(&json!(display)))
        };
        self.event(json!({"name":"exists","display":display,"exists":exists}));
        exists
    }
    fn now_ms(&self) -> u64 {
        self.clock.load(Ordering::SeqCst)
    }
    fn sleep(&self, ms: u64) -> Fut<'_, ()> {
        Box::pin(async move {
            self.event(json!({"name":"sleep","ms":ms}));
            self.clock.fetch_add(ms, Ordering::SeqCst);
        })
    }
    fn spawn(&self, command: LiveViewCommand, args: &[String]) -> Result<Box<dyn LiveViewProcess>> {
        self.event(json!({"name":"spawn","command":command.executable(),"args":args,"options":{"stdio":"ignore","detached":false}}));
        let id = self.children.fetch_add(1, Ordering::SeqCst) + 1;
        self.event(json!({"name":"unref","id":id}));
        if self.call["spawnFailure"] == command.executable() {
            return Err(LiveViewError(format!(
                "spawn {} failed",
                command.executable()
            )));
        }
        self.spawned.store(true, Ordering::SeqCst);
        Ok(Box::new(Child {
            id,
            events: self.events.clone(),
            fail: self.call["killFailures"]
                .as_array()
                .is_some_and(|a| a.contains(&json!(id))),
            terminated: false,
        }))
    }
}
impl BrowserSandboxPort for Fixture {
    fn start(&self, request: BrowserSandboxRequest) -> Fut<'_, Result<BrowserSandboxSession>> {
        Box::pin(async move {
            self.event(json!({"name":"sandboxStart","request":request}));
            if let Some(error) = self.call["sandboxFailure"].as_str() {
                return Err(LiveViewError(error.into()));
            }
            Ok(serde_json::from_value(self.call.get("sandbox").cloned().unwrap_or_else(||json!({"containerName":"fixture-container","vncPort":7001,"novncPort":7002,"novncUrl":"http://fixture/vnc","cdpUrl":"http://fixture/cdp"}))).unwrap())
        })
    }
    fn stop(&self, container: String) -> Fut<'_, Result<()>> {
        Box::pin(async move {
            self.event(json!({"name":"sandboxStop","container":container}));
            if self.call["stopFailure"] == true {
                Err(LiveViewError("stop failed".into()))
            } else {
                Ok(())
            }
        })
    }
}
fn description(s: &LiveViewSession) -> Value {
    let mut v = serde_json::to_value(&s.description).unwrap();
    v["processCount"] = json!(s.process_count());
    v
}
async fn compare(mut call: Value) {
    call["op"] = json!("nativeliveview.run");
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let path = root
        .join(".jait/artifacts/gateway-rust/live-view")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    let reference = internal_driver::call(
        &root,
        &path.join("reference"),
        json!({"version":1,"calls":[call.clone()]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let f = Arc::new(Fixture::new(call.clone()));
    let m = LiveViewManager::new(f.clone(), f.clone(), 64);
    let opts =
        serde_json::from_value(call.get("options").cloned().unwrap_or_else(|| json!({}))).unwrap();
    let mut kept = None;
    let result = match m.start(opts).await {
        Ok(mut s) => {
            let mut result = json!({"before":description(&s)});
            if call["clearContainerName"] == true {
                s.description.container_name = Some(String::new());
            }
            if call["stop"] != false {
                m.stop(&mut s).await;
                result["after"] = description(&s);
            }
            kept = Some(s);
            result
        }
        Err(e) => json!({"error":e.0}),
    };
    let native = json!({"result":result,"events":f.events.lock().unwrap().clone()});
    std::fs::write(
        path.join("comparison.json"),
        serde_json::to_vec_pretty(&json!({"call":call,"native":native,"reference":reference}))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(native, reference, "{}", path.display());
    drop(kept);
}
#[tokio::test]
async fn default_container_and_explicit_root_derive_state_from_sandbox() {
    compare(json!({})).await;
    compare(
        json!({"options":{"projectRoot":"/custom","width":999,"displayNumber":12},"stop":false}),
    )
    .await;
}
#[tokio::test]
async fn container_failures_do_not_fall_back_and_stop_errors_are_suppressed() {
    compare(json!({"sandboxFailure":"docker run failed"})).await;
    compare(json!({"stopFailure":true})).await;
    compare(json!({"clearContainerName":true})).await;
}
#[tokio::test]
async fn all_reservations_are_attempted_but_failed_reservation_never_starts() {
    for n in 1..=3 {
        compare(json!({"reserveFailure":n})).await;
    }
    for n in 1..=2 {
        compare(json!({"options":{"preferContainer":false},"reserveFailure":n})).await;
    }
}
#[tokio::test]
async fn host_defaults_exact_commands_and_reverse_stop_order() {
    compare(json!({"options":{"preferContainer":false}})).await;
}
#[tokio::test]
async fn explicit_display_dimensions_zero_fractional_and_negative_are_forwarded() {
    for options in [
        json!({"preferContainer":false,"displayNumber":0,"width":0,"height":0}),
        json!({"preferContainer":false,"displayNumber":12.5,"width":-1.5,"height":810}),
    ] {
        compare(json!({"options":options})).await;
    }
}
#[tokio::test]
async fn scans_first_free_display_including_upper_boundary() {
    compare(json!({"options":{"preferContainer":false},"occupied":["99","100"]})).await;
    compare(json!({"options":{"preferContainer":false},"occupied":(99..199).map(|n|n.to_string()).collect::<Vec<_>>()})).await;
    compare(json!({"options":{"preferContainer":false},"allOccupied":true})).await;
}
#[tokio::test]
async fn readiness_polling_timeout_and_exact_deadline_do_not_spawn_vnc() {
    for ready in [250, 4900, 5000, 6000] {
        compare(json!({"options":{"preferContainer":false,"displayNumber":101},"readyAt":ready}))
            .await;
    }
}
#[tokio::test]
async fn each_spawn_failure_cleans_only_started_children_in_forward_order() {
    for command in ["Xvfb", "x11vnc", "websockify"] {
        compare(json!({"options":{"preferContainer":false},"spawnFailure":command})).await;
    }
}
#[tokio::test]
async fn kill_failures_do_not_prevent_later_cleanup() {
    compare(json!({"options":{"preferContainer":false},"killFailures":[3,2]})).await;
    compare(
        json!({"options":{"preferContainer":false},"spawnFailure":"websockify","killFailures":[1]}),
    )
    .await;
}

struct QueueFixture {
    host: Fixture,
    environment: Mutex<Option<String>>,
    started: Mutex<Vec<String>>,
    waiting:
        Mutex<std::collections::BTreeMap<String, tokio::sync::oneshot::Sender<Option<String>>>>,
}
impl QueueFixture {
    fn new() -> Self {
        Self {
            host: Fixture::new(json!({})),
            environment: Mutex::new(None),
            started: Mutex::new(vec![]),
            waiting: Mutex::new(std::collections::BTreeMap::new()),
        }
    }
}
impl LiveViewHost for QueueFixture {
    fn cwd(&self) -> Result<String> {
        self.host.cwd()
    }
    fn max_container_starts(&self) -> Option<String> {
        self.environment.lock().unwrap().clone()
    }
    fn reserve_port(&self, c: bool) -> Fut<'_, Result<u16>> {
        self.host.reserve_port(c)
    }
    fn display_exists(&self, n: &str) -> bool {
        self.host.display_exists(n)
    }
    fn now_ms(&self) -> u64 {
        self.host.now_ms()
    }
    fn sleep(&self, n: u64) -> Fut<'_, ()> {
        self.host.sleep(n)
    }
    fn spawn(&self, c: LiveViewCommand, a: &[String]) -> Result<Box<dyn LiveViewProcess>> {
        self.host.spawn(c, a)
    }
}
struct WaitingRegistration<'a> {
    fixture: &'a QueueFixture,
    id: String,
}
impl Drop for WaitingRegistration<'_> {
    fn drop(&mut self) {
        self.fixture.waiting.lock().unwrap().remove(&self.id);
    }
}
impl BrowserSandboxPort for QueueFixture {
    fn start(&self, request: BrowserSandboxRequest) -> Fut<'_, Result<BrowserSandboxSession>> {
        Box::pin(async move {
            let id = request.project_root;
            self.started.lock().unwrap().push(id.clone());
            let (tx, rx) = tokio::sync::oneshot::channel();
            self.waiting.lock().unwrap().insert(id.clone(), tx);
            let _registration = WaitingRegistration {
                fixture: self,
                id: id.clone(),
            };
            if let Some(error) = rx
                .await
                .map_err(|_| LiveViewError("fixture cancelled".into()))?
            {
                return Err(LiveViewError(error));
            }
            Ok(BrowserSandboxSession {
                container_name: id,
                vnc_port: 5900,
                novnc_port: 6080,
                novnc_url: "fixture".into(),
                cdp_url: None,
            })
        })
    }
    fn stop(&self, _container: String) -> Fut<'_, Result<()>> {
        Box::pin(async { Ok(()) })
    }
}
async fn settle() {
    for _ in 0..40 {
        tokio::task::yield_now().await;
    }
}
fn release(f: &QueueFixture, id: &str, error: Option<String>) {
    f.waiting
        .lock()
        .unwrap()
        .remove(id)
        .unwrap()
        .send(error)
        .unwrap();
}
async fn compare_queue(steps: Value) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let path = root
        .join(".jait/artifacts/gateway-rust/live-view-queue")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&path).unwrap();
    let expected = internal_driver::call(
        &root,
        &path.join("reference"),
        json!({"version":1,"calls":[{"op":"nativeliveviewqueue.run","steps":steps}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    let f = Arc::new(QueueFixture::new());
    let m = Arc::new(LiveViewManager::new(f.clone(), f.clone(), 64));
    let results = Arc::new(Mutex::new(serde_json::Map::new()));
    let mut tasks = vec![];
    let mut phases = vec![];
    for step in steps.as_array().unwrap() {
        if let Some(env) = step.get("environment") {
            *f.environment.lock().unwrap() = env.as_str().map(str::to_string);
        }
        if let Some(id) = step["launch"].as_str() {
            let m = m.clone();
            let id = id.to_string();
            let results = results.clone();
            tasks.push(tokio::spawn(async move {
                let r = m
                    .start(LiveViewOptions {
                        project_root: Some(id.clone()),
                        ..Default::default()
                    })
                    .await;
                let result = match r {
                    Ok(s) => json!({"ok":s.description.container_name}),
                    Err(e) => json!({"error":e.0}),
                };
                results.lock().unwrap().insert(id, result);
            }));
        }
        if let Some(id) = step["release"].as_str() {
            release(&f, id, step["error"].as_str().map(str::to_string));
        }
        settle().await;
        phases.push(json!({"started":f.started.lock().unwrap().clone(),"results":results.lock().unwrap().clone()}));
        assert_eq!(
            phases.last().unwrap(),
            &expected[phases.len() - 1],
            "queue phase {}",
            phases.len()
        );
    }
    for task in tasks {
        task.await.unwrap();
    }
    let native = json!(phases);
    std::fs::write(
        path.join("comparison.json"),
        serde_json::to_vec_pretty(&json!({"native":native,"reference":expected})).unwrap(),
    )
    .unwrap();
    assert_eq!(native, expected, "{}", path.display());
}
#[tokio::test]
async fn actual_reference_fifo_holds_until_complete_and_failure_releases_slot() {
    compare_queue(json!([{"launch":"a"},{"launch":"b"},{"launch":"c"},{"release":"a","error":"docker failed"},{"release":"b"},{"release":"c"},{"launch":"d"},{"release":"d"}])).await;
}
#[tokio::test]
async fn dynamic_decimal_prefix_environment_and_fifo_survive_limit_changes() {
    for env in [
        "2workers",
        "+2.9",
        "0x10",
        "invalid",
        "0",
        "-3",
        "\u{feff}2",
        "\u{0085}2",
    ] {
        let max = if ["2workers", "+2.9", "\u{feff}2"].contains(&env) {
            2
        } else {
            1
        };
        let steps = if max == 2 {
            json!([{"launch":"a","environment":env},{"launch":"b"},{"launch":"c","environment":"1"},{"launch":"d","environment":"4"},{"release":"a"},{"release":"b"},{"release":"c"},{"release":"d"}])
        } else {
            json!([{"launch":"a","environment":env},{"launch":"b"},{"release":"a"},{"release":"b"}])
        };
        compare_queue(steps).await;
    }
}
#[tokio::test]
async fn bounded_overload_cancelled_waiter_and_cancelled_active_start_release_admission() {
    let f = Arc::new(QueueFixture::new());
    let m = Arc::new(LiveViewManager::new(f.clone(), f.clone(), 1));
    let launch = |id: &str| {
        let m = m.clone();
        let id = id.to_string();
        tokio::spawn(async move {
            m.start(LiveViewOptions {
                project_root: Some(id),
                ..Default::default()
            })
            .await
        })
    };
    let a = launch("a");
    settle().await;
    let b = launch("b");
    settle().await;
    let error = match m.start(LiveViewOptions::default()).await {
        Err(e) => e,
        Ok(_) => panic!("overload accepted"),
    };
    assert_eq!(
        error.0,
        "Docker sandbox browser failed: Live-view start queue is full"
    );
    b.abort();
    assert!(matches!(b.await, Err(e) if e.is_cancelled()));
    let c = launch("c");
    settle().await;
    assert_eq!(*f.started.lock().unwrap(), vec!["a"]);
    a.abort();
    assert!(matches!(a.await, Err(e) if e.is_cancelled()));
    settle().await;
    assert_eq!(*f.started.lock().unwrap(), vec!["a", "c"]);
    release(&f, "c", None);
    assert!(c.await.unwrap().is_ok());
    let d = launch("d");
    settle().await;
    release(&f, "d", None);
    assert!(d.await.unwrap().is_ok());
    assert!(f.waiting.lock().unwrap().is_empty());
}
#[tokio::test]
async fn dropping_host_start_during_display_wait_cleans_started_child() {
    struct WaitingHost {
        fixture: Fixture,
        entered: tokio::sync::Notify,
    }
    impl LiveViewHost for WaitingHost {
        fn cwd(&self) -> Result<String> {
            self.fixture.cwd()
        }
        fn max_container_starts(&self) -> Option<String> {
            None
        }
        fn reserve_port(&self, c: bool) -> Fut<'_, Result<u16>> {
            self.fixture.reserve_port(c)
        }
        fn display_exists(&self, _: &str) -> bool {
            false
        }
        fn now_ms(&self) -> u64 {
            0
        }
        fn sleep(&self, _: u64) -> Fut<'_, ()> {
            Box::pin(async {
                self.entered.notify_one();
                std::future::pending::<()>().await
            })
        }
        fn spawn(&self, c: LiveViewCommand, a: &[String]) -> Result<Box<dyn LiveViewProcess>> {
            self.fixture.spawn(c, a)
        }
    }
    let host = Arc::new(WaitingHost {
        fixture: Fixture::new(json!({})),
        entered: tokio::sync::Notify::new(),
    });
    let sandbox = Arc::new(Fixture::new(json!({})));
    let manager = Arc::new(LiveViewManager::new(host.clone(), sandbox, 1));
    let m = manager.clone();
    let task = tokio::spawn(async move {
        m.start(LiveViewOptions {
            prefer_container: Some(false),
            ..Default::default()
        })
        .await
    });
    host.entered.notified().await;
    task.abort();
    assert!(matches!(task.await, Err(e) if e.is_cancelled()));
    let events = host.fixture.events.lock().unwrap();
    assert_eq!(events.last().unwrap(), &json!({"name":"kill","id":1}));
}
#[cfg(unix)]
#[tokio::test]
async fn native_process_port_spawns_no_shell_interpolation_terminates_and_reaps() {
    use std::os::unix::fs::PermissionsExt;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/live-view-process")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dir).unwrap();
    let executable = dir.join("owned-process");
    std::fs::write(
        &executable,
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"${0}.args\"\nexec sleep 30\n",
    )
    .unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut host = NativeLiveViewHost::default();
    host.binaries = [executable.clone(), dir.join("missing"), executable];
    let mut child = host
        .spawn(LiveViewCommand::Xvfb, &["literal;$(false)".into()])
        .unwrap();
    let args_file = dir.join("owned-process.args");
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while !args_file.exists() {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(&args_file).unwrap(),
        "literal;$(false)\n"
    );
    let pid = child.process_id().unwrap();
    assert_eq!(unsafe { libc_kill(pid, 0) }, 0);
    child.terminate().unwrap();
    assert_eq!(unsafe { libc_kill(pid, 0) }, -1);
    child.terminate().unwrap();
    assert!(host.spawn(LiveViewCommand::X11vnc, &[]).is_err());
    let child = host.spawn(LiveViewCommand::Websockify, &[]).unwrap();
    let pid = child.process_id().unwrap();
    drop(child);
    assert_eq!(unsafe { libc_kill(pid, 0) }, -1);
    let port = host.reserve_port(false).await.unwrap();
    assert!(port > 0);
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port))
        .await
        .unwrap();
    drop(listener);
}
#[cfg(unix)]
unsafe fn libc_kill(pid: u32, signal: i32) -> i32 {
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    unsafe { kill(pid as i32, signal) }
}

#[tokio::test]
async fn reservation_first_rejection_uses_completion_order() {
    compare(json!({"reserveErrors":{"1":{"ticks":10,"message":"slow failure"},"2":{"ticks":1,"message":"first failure"}}})).await;
}
