#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    services::background_command_monitor::{
        BackgroundCommandMonitor, ExecutionSnapshot, ExternalOptions, OutputCallback, Schedule,
        TimerCallback,
    },
    tools::{core_io::HostError, sandbox_background_terminal::*},
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicI64, Ordering},
    },
};
use tokio::sync::oneshot;
const ID: &str = "018f0011-2233-7444-8555-667788990011";
const TERMINAL: &str = "sandbox-command-018f0011-2233-7444-8555-667788990011";
type Cell<T> = Arc<Mutex<T>>;
#[derive(Default)]
struct Timers {
    next: u64,
    entries: BTreeMap<u64, (i64, TimerCallback)>,
}
fn schedule(clock: Arc<AtomicI64>, timers: Cell<Timers>) -> Schedule {
    Arc::new(move |ms, callback| {
        let mut s = timers.lock().unwrap();
        s.next += 1;
        let id = s.next;
        s.entries.insert(
            id,
            (clock.load(Ordering::SeqCst) + ms.max(1.0) as i64, callback),
        );
        let timers = timers.clone();
        Arc::new(move || {
            timers.lock().unwrap().entries.remove(&id);
        })
    })
}
async fn flush() {
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
}
async fn advance(target: i64, clock: &Arc<AtomicI64>, timers: &Cell<Timers>) {
    loop {
        let next = {
            let mut s = timers.lock().unwrap();
            let id = s
                .entries
                .iter()
                .filter(|(_, v)| v.0 <= target)
                .min_by_key(|(id, v)| (v.0, **id))
                .map(|(id, _)| *id);
            id.map(|id| s.entries.remove(&id).unwrap())
        };
        let Some((at, callback)) = next else { break };
        clock.store(at, Ordering::SeqCst);
        callback().unwrap();
        flush().await;
    }
    clock.store(target, Ordering::SeqCst);
    flush().await;
}
#[derive(Default)]
struct Signal {
    aborted: AtomicBool,
    race: bool,
    listener: Cell<Option<Arc<dyn Fn() + Send + Sync>>>,
}
impl AbortSignal for Signal {
    fn aborted(&self) -> bool {
        self.aborted.load(Ordering::SeqCst)
    }
    fn subscribe(&self, callback: Arc<dyn Fn() + Send + Sync>) -> Subscription {
        *self.listener.lock().unwrap() = Some(callback);
        if self.race {
            self.aborted.store(true, Ordering::SeqCst);
        }
        let slot = self.listener.clone();
        Subscription(Some(Box::new(move || {
            slot.lock().unwrap().take();
        })))
    }
}
impl Signal {
    fn abort(&self) {
        if self.aborted.swap(true, Ordering::SeqCst) {
            return;
        }
        let f = self.listener.lock().unwrap().take();
        if let Some(f) = f {
            f();
        }
    }
}
struct Execution {
    output: Mutex<Vec<u16>>,
    listeners: Cell<Vec<OutputCallback>>,
    stopped: Mutex<usize>,
    spec: Value,
    tx: Mutex<Option<oneshot::Sender<Result<SandboxCompletion, HostError>>>>,
    rx: Mutex<Option<oneshot::Receiver<Result<SandboxCompletion, HostError>>>>,
}
impl Execution {
    fn finish(&self, overrides: &Value) {
        let mut result = json!({"ok":true,"output":"","exitCode":0,"timedOut":false,"containerName":"container"});
        if let Some(fields) = overrides.as_object() {
            for (k, v) in fields {
                result[k] = v.clone();
            }
        }
        let mut completion: SandboxCompletion = serde_json::from_value(result).unwrap();
        if overrides.get("output").is_none() {
            completion.output = self.output();
        }
        if let Some(tx) = self.tx.lock().unwrap().take() {
            let _ = tx.send(Ok(completion));
        }
    }
    fn emit(&self, text: &str) {
        let units = text.encode_utf16().collect::<Vec<_>>();
        self.output.lock().unwrap().extend(&units);
        let callbacks = self.listeners.lock().unwrap().clone();
        for f in callbacks {
            f(Utf16Text(units.clone())).unwrap();
        }
    }
}
impl SandboxExecution for Execution {
    fn container_name(&self) -> String {
        "container".into()
    }
    fn output(&self) -> Utf16Text {
        Utf16Text(self.output.lock().unwrap().clone())
    }
    fn on_output(&self, callback: OutputCallback) -> Result<Subscription, HostError> {
        self.listeners.lock().unwrap().push(callback);
        let listeners = self.listeners.clone();
        Ok(Subscription(Some(Box::new(move || {
            listeners.lock().unwrap().clear()
        }))))
    }
    fn completion(&self) -> BoxFuture<'static, Result<SandboxCompletion, HostError>> {
        let rx = self.rx.lock().unwrap().take().unwrap();
        Box::pin(async move { rx.await.unwrap() })
    }
    fn stop(&self) -> BoxFuture<'static, Result<(), HostError>> {
        *self.stopped.lock().unwrap() += 1;
        if self.spec["stopCompletes"] == true {
            self.finish(&json!({"ok":false,"exitCode":null}));
        }
        let error = self.spec["stopError"].as_str().map(str::to_owned);
        Box::pin(async move { error.map_or(Ok(()), |e| Err(HostError::Error(e))) })
    }
}
struct Manager {
    execution: Arc<Execution>,
    started: Cell<Vec<Value>>,
}
impl SandboxManager for Manager {
    fn start_background_command(
        &self,
        options: SandboxOptions,
    ) -> Result<Arc<dyn SandboxExecution>, HostError> {
        self.started
            .lock()
            .unwrap()
            .push(serde_json::to_value(options).unwrap());
        if let Some(error) = self.execution.spec["startError"].as_str() {
            return Err(HostError::Error(error.into()));
        }
        Ok(self.execution.clone())
    }
}
fn snapshot(s: Option<ExecutionSnapshot>) -> Value {
    s.map_or(Value::Null,|s|json!({"terminalId":s.terminal_id,"executionId":s.execution_id,"status":s.status,"output":s.output.0,"exitCode":s.exit_code,"durationMs":s.duration_ms}))
}
fn result_json(mut r: ToolResult) -> Value {
    let output = r.data.as_mut().and_then(|d| d.output.take());
    let mut v = serde_json::to_value(r).unwrap();
    if let Some(output) = output {
        v["data"]["output"] = json!(output.0);
    }
    v
}
async fn native(spec: Value) -> Value {
    let clock = Arc::new(AtomicI64::new(1000));
    let timers = Arc::new(Mutex::new(Timers::default()));
    let schedule = schedule(clock.clone(), timers.clone());
    let c = clock.clone();
    let clock_port: jait_gateway::time::Clock = Arc::new(move || c.load(Ordering::SeqCst));
    let monitor = BackgroundCommandMonitor::with_options(
        clock_port.clone(),
        schedule.clone(),
        Arc::new(|_| {}),
    );
    let notifications = Arc::new(Mutex::new(vec![]));
    let n = notifications.clone();
    let _handler=monitor.set_completion_handler(Arc::new(move |r|{n.lock().unwrap().push(json!({"session":r.session_id,"terminal":r.terminal_id,"command":r.command,"output":r.output.0,"exitCode":r.exit_code,"timedOut":r.timed_out,"durationMs":r.duration_ms}));Box::pin(async{Ok(())})}));
    if spec["capacity"] == true {
        for i in 0..50 {
            assert!(monitor.track_external(
                ExternalOptions {
                    session_id: "busy".into(),
                    terminal_id: format!("busy-{i}"),
                    command: "held".into(),
                    started_at: 1000.0,
                    execution_id: None,
                    get_output: None,
                    should_notify: None,
                    on_cancel: None
                },
                Box::pin(std::future::pending())
            ));
        }
    }
    let (tx, rx) = oneshot::channel();
    let execution = Arc::new(Execution {
        output: Mutex::new(vec![]),
        listeners: Arc::default(),
        stopped: Mutex::new(0),
        spec: spec.clone(),
        tx: Mutex::new(Some(tx)),
        rx: Mutex::new(Some(rx)),
    });
    let started = Arc::new(Mutex::new(vec![]));
    let manager = Manager {
        execution: execution.clone(),
        started: started.clone(),
    };
    let signal = Arc::new(Signal {
        aborted: AtomicBool::new(spec["preAborted"] == true),
        race: spec["abortRace"] == true,
        listener: Arc::default(),
    });
    let chunks = Arc::new(Mutex::new(vec![]));
    let chunk_sink = chunks.clone();
    let context = Context {
        session_id: "owner".into(),
        action_id: if spec["noAction"] == true {
            None
        } else {
            Some("action".into())
        },
        sandbox_container_name: if spec["thread"] == true {
            Some("thread-container".into())
        } else {
            None
        },
        signal: Some(signal.clone()),
        on_output_chunk: Some(Arc::new(move |s| {
            chunk_sink.lock().unwrap().push(s.0);
            Ok(())
        })),
    };
    let mut options = json!({"command":"fixture","containerName":"existing","timeoutMs":10000});
    if let Some(fields) = spec["options"].as_object() {
        for (k, v) in fields {
            options[k] = v.clone();
        }
    }
    let wait = spec
        .get("wait")
        .map(|w| Wait {
            is_background: w["isBackground"] == true,
            yield_time_ms: w["yieldTimeMs"].as_f64().unwrap(),
        })
        .unwrap_or_default();
    let adapter = SandboxBackgroundTerminal {
        monitor: monitor.clone(),
        schedule,
        clock: clock_port,
        next_id: Arc::new(|| ID.into()),
    };
    let outcome: Cell<Option<(i64, Result<ToolResult, HostError>)>> = Arc::default();
    let o = outcome.clone();
    let now = clock.clone();
    let task = tokio::spawn(async move {
        let result = adapter
            .run(
                &manager,
                serde_json::from_value(options).unwrap(),
                "visible command".into(),
                context,
                wait,
            )
            .await;
        *o.lock().unwrap() = Some((now.load(Ordering::SeqCst) - 1000, result));
    });
    flush().await;
    let mut inspections = vec![];
    for step in spec["steps"].as_array().unwrap_or(&vec![]) {
        advance(1000 + step["at"].as_i64().unwrap(), &clock, &timers).await;
        match step["kind"].as_str().unwrap() {
            "output" => execution.emit(step["text"].as_str().unwrap()),
            "complete" => execution.finish(&step["result"]),
            "abort" => signal.abort(),
            "inspect" | "cancel" => {
                let owner = if step["foreign"] == true {
                    "foreign"
                } else {
                    "owner"
                };
                let id = if step["stale"] == true {
                    "stale"
                } else if spec["noAction"] == true {
                    TERMINAL
                } else {
                    "action"
                };
                let value = if step["kind"] == "cancel" {
                    monitor.cancel_execution(owner, TERMINAL, id).unwrap()
                } else {
                    monitor.inspect_execution(owner, TERMINAL, id)
                };
                inspections.push(snapshot(value));
            }
            _ => panic!("unknown action"),
        }
        flush().await;
    }
    advance(
        1000 + spec["finishAt"].as_i64().unwrap_or(6000),
        &clock,
        &timers,
    )
    .await;
    flush().await;
    assert!(task.is_finished(), "virtual case did not settle: {spec}");
    task.await.unwrap();
    monitor.drain_notifications().await;
    let (at, r) = outcome.lock().unwrap().take().unwrap();
    let (result, error) = match r {
        Ok(r) => (result_json(r), Value::Null),
        Err(HostError::Error(e)) => (Value::Null, json!(e)),
        Err(e) => panic!("unexpected error: {e:?}"),
    };
    let result = json!({"result":result,"error":error,"endedAt":at,"started":*started.lock().unwrap(),"stopped":*execution.stopped.lock().unwrap(),"chunks":*chunks.lock().unwrap(),"outputListeners":execution.listeners.lock().unwrap().len(),"abortListeners":usize::from(signal.listener.lock().unwrap().is_some()),"pendingTimers":timers.lock().unwrap().entries.len(),"active":monitor.active_count(),"notifications":*notifications.lock().unwrap(),"inspections":inspections});
    monitor.clear_for_tests().unwrap();
    result
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn numbers(v: &Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.iter().map(numbers).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, v)| (k.clone(), numbers(v))).collect()),
        _ => v.clone(),
    }
}
async fn compare(cases: Vec<Value>) {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/sandbox-terminal")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let expected = internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[{"op":"nativesandboxterm.run","cases":cases}]}),
        &|| false,
    )
    .unwrap();
    let expected = &expected[0];
    assert_eq!(expected.as_array().unwrap().len(), cases.len());
    let mut actual = vec![];
    for case in &cases {
        actual.push(native(case.clone()).await);
    }
    std::fs::write(
        directory.join("actual.json"),
        serde_json::to_vec_pretty(&actual).unwrap(),
    )
    .unwrap();
    std::fs::write(
        directory.join("expected.json"),
        serde_json::to_vec_pretty(expected).unwrap(),
    )
    .unwrap();
    for (i, actual) in actual.iter().enumerate() {
        assert_eq!(
            numbers(actual),
            numbers(&expected[i]),
            "case {i}: {}",
            cases[i]
        );
    }
}
#[tokio::test]
async fn completion_precedence_result_fields_and_listener_cleanup() {
    compare(vec![
 json!({"thread":true,"steps":[{"at":10,"kind":"output","text":"hello 🚀"},{"at":20,"kind":"complete"}],"finishAt":50}),
 json!({"steps":[{"at":0,"kind":"complete","result":{"ok":false,"exitCode":7,"output":"failure","containerName":"resolved-container"}}],"finishAt":1}),
 json!({"steps":[{"at":20,"kind":"complete","result":{"ok":false,"exitCode":null,"timedOut":true}}],"finishAt":50}),
 json!({"steps":[{"at":20,"kind":"complete","result":{"ok":false,"exitCode":null}}],"finishAt":50}),
]).await;
}
#[tokio::test]
async fn startup_cap_idle_resets_exact_deadlines_and_no_late_streaming() {
    compare(vec![
 json!({"steps":[{"at":5001,"kind":"output","text":"late"},{"at":5100,"kind":"complete"}],"finishAt":5200}),
 json!({"steps":[{"at":100,"kind":"output","text":"one"},{"at":599,"kind":"output","text":"two"},{"at":1098,"kind":"output","text":"three"},{"at":1600,"kind":"output","text":"late"},{"at":1700,"kind":"complete"}],"finishAt":1800}),
 json!({"options":{"timeoutMs":250},"steps":[{"at":100,"kind":"output","text":"partial"},{"at":251,"kind":"complete"}],"finishAt":300}),
 json!({"wait":{"isBackground":false,"yieldTimeMs":75},"steps":[{"at":20,"kind":"output","text":"no idle"},{"at":76,"kind":"complete"}],"finishAt":100}),
 json!({"wait":{"isBackground":true,"yieldTimeMs":1},"steps":[{"at":5001,"kind":"complete"}],"finishAt":5100}),
 json!({"steps":[{"at":100,"kind":"output","text":"tie"},{"at":600,"kind":"complete"}],"finishAt":650}),
]).await;
}
#[tokio::test]
async fn preabort_install_race_and_foreground_abort_stop_before_return() {
    compare(vec![
 json!({"preAborted":true,"finishAt":0}),
 json!({"abortRace":true,"stopCompletes":true,"finishAt":1}),
 json!({"stopCompletes":true,"steps":[{"at":10,"kind":"output","text":"partial"},{"at":20,"kind":"abort"}],"finishAt":30}),
]).await;
}
#[tokio::test]
async fn tracked_completion_scoped_inspection_and_cancellation() {
    compare(vec![
 json!({"wait":{"isBackground":false,"yieldTimeMs":1},"steps":[{"at":2,"kind":"output","text":"background"},{"at":3,"kind":"inspect"},{"at":4,"kind":"cancel","foreign":true},{"at":5,"kind":"cancel","stale":true},{"at":6,"kind":"complete","result":{"exitCode":9,"ok":false}},{"at":7,"kind":"inspect"}],"finishAt":8}),
 json!({"stopCompletes":true,"wait":{"isBackground":false,"yieldTimeMs":1},"steps":[{"at":2,"kind":"output","text":"partial"},{"at":3,"kind":"cancel"},{"at":4,"kind":"inspect"},{"at":5,"kind":"complete"}],"finishAt":6}),
 json!({"noAction":true,"wait":{"isBackground":false,"yieldTimeMs":1},"steps":[{"at":2,"kind":"inspect"},{"at":3,"kind":"complete","result":{"timedOut":true,"ok":false,"exitCode":null}},{"at":4,"kind":"inspect"}],"finishAt":5}),
 json!({"stopCompletes":true,"wait":{"isBackground":false,"yieldTimeMs":1},"steps":[{"at":2,"kind":"abort"},{"at":3,"kind":"inspect"}],"finishAt":4}),
]).await;
}
#[tokio::test]
async fn capacity_failure_stops_command_and_start_stop_errors_propagate() {
    compare(vec![
        json!({"capacity":true,"stopCompletes":true,"finishAt":5001}),
        json!({"startError":"start failed","finishAt":0}),
        json!({"capacity":true,"stopCompletes":true,"stopError":"stop failed","finishAt":5001}),
    ])
    .await;
}
