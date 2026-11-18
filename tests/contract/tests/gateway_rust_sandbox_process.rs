#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::FutureExt;
use jait_gateway::{
    contracts::bounded_json::Utf16Text,
    security::sandbox_background_process::*,
    services::background_command_monitor::{Schedule, TimerCallback},
    tools::{core_io::HostError, sandbox_background_terminal::SandboxExecution},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};
use tokio::sync::oneshot;
type Cell<T> = Arc<Mutex<T>>;
#[derive(Default)]
struct Timers {
    next: usize,
    entries: BTreeMap<usize, (i64, TimerCallback)>,
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
    for _ in 0..50 {
        tokio::task::yield_now().await;
    }
}
async fn advance(at: i64, clock: &Arc<AtomicI64>, timers: &Cell<Timers>) {
    loop {
        let next = {
            let mut s = timers.lock().unwrap();
            let id = s
                .entries
                .iter()
                .filter(|(_, v)| v.0 <= at)
                .min_by_key(|(id, v)| (v.0, **id))
                .map(|(id, _)| *id);
            id.map(|id| s.entries.remove(&id).unwrap())
        };
        let Some((at, callback)) = next else { break };
        clock.store(at, Ordering::SeqCst);
        callback().unwrap();
        flush().await;
    }
    clock.store(at, Ordering::SeqCst);
    flush().await;
}
struct FakeChild {
    index: usize,
    clock: Arc<AtomicI64>,
    kills: Cell<Vec<Value>>,
}
impl Child for FakeChild {
    fn kill(&self) {
        self.kills.lock().unwrap().push(
            json!({"at":self.clock.load(Ordering::SeqCst),"index":self.index,"signal":"SIGKILL"}),
        );
    }
}
fn signature(s: &Utf16Text) -> Value {
    let bytes = s.0.iter().flat_map(|v| v.to_le_bytes()).collect::<Vec<_>>();
    json!({"length":s.0.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
async fn native(test: &Value) -> Value {
    let clock = Arc::new(AtomicI64::new(0));
    let timers = Cell::new(Mutex::new(Timers::default()));
    let sched = schedule(clock.clone(), timers.clone());
    let launches = Cell::new(Mutex::new(vec![]));
    let kills = Cell::new(Mutex::new(vec![]));
    let children: Cell<Vec<Arc<ProcessEvents>>> = Cell::default();
    let tasks: Cell<Vec<tokio::task::JoinHandle<()>>> = Cell::default();
    let spawn = {
        let test = test.clone();
        let clock = clock.clone();
        let children = children.clone();
        let launches = launches.clone();
        let kills = kills.clone();
        let sched = sched.clone();
        Arc::new(
            move |launch: Launch, events: ProcessEvents| -> Result<Arc<dyn Child>, HostError> {
                let index = children.lock().unwrap().len();
                if test["spawnError"].as_u64() == Some(index as u64) {
                    return Err(HostError::Error("launch failed".into()));
                }
                launches.lock().unwrap().push(json!({"at":clock.load(Ordering::SeqCst),"executable":launch.executable,"arguments":launch.arguments,"capture_output":launch.capture_output,"windows_hide":launch.windows_hide}));
                let events = Arc::new(events);
                children.lock().unwrap().push(events.clone());
                if !launch.capture_output
                    && (!test.as_object().unwrap().contains_key("cleanupDelay")
                        || !test["cleanupDelay"].is_null())
                {
                    let fail = test["cleanupError"].as_bool().unwrap_or(false);
                    sched(
                        test["cleanupDelay"].as_f64().unwrap_or(1.0),
                        Box::new(move || {
                            if fail {
                                (events.error)("cleanup error".into());
                            } else {
                                (events.close)(Some(0.0));
                            }
                            Ok(())
                        }),
                    );
                }
                Ok(Arc::new(FakeChild {
                    index,
                    clock: clock.clone(),
                    kills: kills.clone(),
                }))
            },
        )
    };
    let supervised = tasks.clone();
    let runtime = Runtime {
        spawn,
        schedule: sched,
        supervise: Arc::new(move |f| {
            supervised.lock().unwrap().push(tokio::spawn(async move {
                let _observed = f.await;
            }));
        }),
        uuid: Arc::new(|| "fixture-uuid".into()),
    };
    let admission = Admission::default();
    let (tx, rx) = oneshot::channel();
    let mut resolve = Some(tx);
    let runner_invocations: Cell<Vec<Value>> = Cell::default();
    let executor = test["executor"].as_bool().unwrap_or(false);
    let invocation = vec![
        "fake".into(),
        "exec".into(),
        "container".into(),
        "bash".into(),
        "-lc".into(),
        test["command"].as_str().unwrap_or("echo hi").into(),
    ];
    let execution: Result<Arc<dyn SandboxExecution>, HostError> = if executor {
        let captured = runner_invocations.clone();
        let input = Mutex::new(Some(rx));
        Ok(Arc::new(start_executor_backed_command(
            &runtime,
            Arc::new(move |invocation, timeout| {
                captured
                    .lock()
                    .unwrap()
                    .push(json!({"invocation":invocation,"timeout":timeout}));
                let rx = input.lock().unwrap().take().unwrap();
                async move { rx.await.unwrap() }.boxed()
            }),
            ["fake", "exec", "container", "bash", "-lc", "echo hi"]
                .map(String::from)
                .to_vec(),
            "container".into(),
            test["timeout"].as_f64().unwrap_or(10000.0),
        )))
    } else {
        BackgroundProcess::start(
            runtime.clone(),
            &admission,
            &invocation,
            "container".into(),
            test["timeout"].as_f64().unwrap_or(10000.0),
            test["remove"].as_bool().unwrap_or(false),
        )
        .map(|v| Arc::new(v) as Arc<dyn SandboxExecution>)
    };
    let error: Cell<Value> = Cell::new(Mutex::new(Value::Null));
    let outcome: Cell<Value> = Cell::new(Mutex::new(Value::Null));
    let ended: Cell<Value> = Cell::new(Mutex::new(Value::Null));
    let stops: Cell<usize> = Cell::default();
    let chunks: Cell<Vec<Value>> = Cell::default();
    if let Ok(execution) = &execution {
        let chunks = chunks.clone();
        let output_clock = clock.clone();
        let throw = test["listenerThrows"].as_bool().unwrap_or(false);
        let mut subscription = Some(
            execution
                .on_output(Arc::new(move |v| {
                    chunks.lock().unwrap().push(
                        json!({"at":output_clock.load(Ordering::SeqCst),"text":signature(&v)}),
                    );
                    if throw {
                        Err("observer".into())
                    } else {
                        Ok(())
                    }
                }))
                .unwrap(),
        );
        let future = execution.completion();
        let outcome = outcome.clone();
        let ended = ended.clone();
        let completion_clock = clock.clone();
        tasks.lock().unwrap().push(tokio::spawn(async move {let r=future.await.unwrap();*outcome.lock().unwrap()=json!({"ok":r.ok,"output":signature(&r.output),"exitCode":r.exit_code,"timedOut":r.timed_out,"containerName":r.container_name});*ended.lock().unwrap()=json!(completion_clock.load(Ordering::SeqCst));}));
        for step in test["steps"].as_array().unwrap_or(&vec![]) {
            advance(step["at"].as_i64().unwrap(), &clock, &timers).await;
            let first = children.lock().unwrap().first().cloned();
            match step["kind"].as_str().unwrap() {
                "stdout" => {
                    (first.unwrap().stdout)(Utf16Text::from(
                        step["text"]
                            .as_str()
                            .unwrap()
                            .replace("$MARKER", "__JAIT_SANDBOX_PID_fixture-uuid__"),
                    ))
                    .unwrap();
                }
                "stderr" => {
                    (first.unwrap().stderr)(Utf16Text::from(step["text"].as_str().unwrap()))
                        .unwrap();
                }
                "close" => (first.unwrap().close)(step["code"].as_f64()),
                "error" => (first.unwrap().error)(step["text"].as_str().unwrap().into()),
                "stop" => {
                    let f = execution.stop();
                    let stops = stops.clone();
                    let error = error.clone();
                    tasks.lock().unwrap().push(tokio::spawn(async move {
                        match f.await {
                            Ok(()) => *stops.lock().unwrap() += 1,
                            Err(HostError::Error(v)) => *error.lock().unwrap() = json!(v),
                            Err(e) => panic!("{e:?}"),
                        }
                    }));
                }
                "stopDrop" => {
                    drop(execution.stop());
                }
                "unsubscribe" => {
                    subscription.take();
                }
                "resolve" => {
                    resolve
                        .take()
                        .unwrap()
                        .send(Ok(RunnerResult {
                            output: Utf16Text::from(step["text"].as_str().unwrap()),
                            exit_code: step["code"].as_f64(),
                            timed_out: step["timedOut"].as_bool().unwrap_or(false),
                        }))
                        .ok();
                }
                "reject" => {
                    resolve
                        .take()
                        .unwrap()
                        .send(Err(HostError::Error(step["text"].as_str().unwrap().into())))
                        .ok();
                }
                _ => panic!("unknown step"),
            };
            flush().await;
        }
        advance(test["finishAt"].as_i64().unwrap_or(100), &clock, &timers).await;
    } else if let Err(HostError::Error(v)) = &execution {
        *error.lock().unwrap() = json!(v);
    }
    let value = json!({"result":*outcome.lock().unwrap(),"endedAt":*ended.lock().unwrap(),"error":*error.lock().unwrap(),"stops":*stops.lock().unwrap(),"launches":*launches.lock().unwrap(),"kills":*kills.lock().unwrap(),"chunks":*chunks.lock().unwrap(),"runnerInvocations":*runner_invocations.lock().unwrap(),"output":execution.as_ref().ok().map(|v|signature(&v.output())),"pendingTimers":timers.lock().unwrap().entries.len()});
    for child in children.lock().unwrap().iter() {
        (child.close)(Some(0.0));
    }
    flush().await;
    for task in tasks.lock().unwrap().drain(..) {
        task.abort();
    }
    value
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
        .join(".jait/artifacts/gateway-rust/sandbox-process")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let expected = internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[{"op":"nativesandboxproc.run","cases":cases}]}),
        &|| false,
    )
    .unwrap();
    let mut actual = vec![];
    for case in &cases {
        actual.push(native(case).await);
    }
    std::fs::write(
        directory.join("actual.json"),
        serde_json::to_vec_pretty(&actual).unwrap(),
    )
    .unwrap();
    std::fs::write(
        directory.join("expected.json"),
        serde_json::to_vec_pretty(&expected[0]).unwrap(),
    )
    .unwrap();
    for (i, v) in actual.iter().enumerate() {
        assert_eq!(
            numbers(v),
            numbers(&expected[0][i]),
            "case {i}: {}",
            cases[i]
        );
    }
}
#[tokio::test]
async fn launch_framing_completion_and_errors() {
    compare(vec![
 json!({"steps":[{"at":1,"kind":"stdout","text":"$MARKER42\nhello 🚀"},{"at":2,"kind":"stderr","text":" err "},{"at":3,"kind":"close","code":0},{"at":4,"kind":"error","text":"ignored"}]}),
 json!({"timeout":500,"command":"echo \"$HOME\"; exit 7","steps":[{"at":1,"kind":"stdout","text":"__JAIT_SANDBOX_"},{"at":2,"kind":"stdout","text":"PID_fixture-uuid__99\n"},{"at":3,"kind":"close","code":7}]}),
 json!({"steps":[{"at":1,"kind":"stdout","text":"unframed"},{"at":2,"kind":"error","text":"transport failed"},{"at":3,"kind":"close","code":0}]}),
 json!({"steps":[{"at":1,"kind":"stdout","text":"$MARKER0\nuser output"},{"at":2,"kind":"stdout","text":"$MARKER123\nrest"},{"at":3,"kind":"close","code":124}]}),
 json!({"steps":[{"at":1,"kind":"close","code":137}]}),json!({"steps":[{"at":1,"kind":"close"}]}),json!({"spawnError":0}),
 ]).await;
}
#[tokio::test]
async fn stop_escalation_late_pid_removal_and_cleanup_deadline() {
    compare(vec![
 json!({"steps":[{"at":1,"kind":"stdout","text":"$MARKER42\n"},{"at":2,"kind":"stop"},{"at":3,"kind":"stop"},{"at":2100,"kind":"close","code":0}],"finishAt":2200}),
 json!({"steps":[{"at":1,"kind":"stop"},{"at":2,"kind":"stdout","text":"$MARKER42\nlate"},{"at":100,"kind":"close","code":0}],"finishAt":2100}),
 json!({"remove":true,"steps":[{"at":1,"kind":"stop"},{"at":10,"kind":"close","code":0}]}),
 json!({"remove":true,"steps":[{"at":1,"kind":"stopDrop"},{"at":10,"kind":"close","code":0}]}),
 json!({"remove":true,"cleanupDelay":null,"steps":[{"at":1,"kind":"stop"}],"finishAt":5001}),
 json!({"cleanupError":true,"steps":[{"at":1,"kind":"stdout","text":"$MARKER1\n"},{"at":2,"kind":"stop"},{"at":20,"kind":"close","code":0}],"finishAt":2100}),
 json!({"timeout":1,"steps":[],"finishAt":8001}),
 json!({"spawnError":1,"remove":true,"steps":[{"at":1,"kind":"stop"},{"at":10,"kind":"close","code":0}]}),
 ]).await;
}
#[tokio::test]
async fn output_bounds_observer_failure_unsubscribe_and_framing_threshold() {
    compare(vec![
 json!({"listenerThrows":true,"steps":[{"at":1,"kind":"stdout","text":format!("$MARKER42\n🚀{}","a".repeat(15999))},{"at":2,"kind":"stderr","text":"tail"},{"at":3,"kind":"close","code":0}]}),
 json!({"steps":[{"at":1,"kind":"stdout","text":"x".repeat(512)},{"at":2,"kind":"unsubscribe"},{"at":3,"kind":"stderr","text":"\u{feff} visible \u{85}"},{"at":4,"kind":"close","code":0}]}),
 json!({"steps":[{"at":1,"kind":"stdout","text":"$MARKER12345678901\n"},{"at":2,"kind":"close","code":0}]}),
 ]).await;
}
#[tokio::test]
async fn injected_runner_projection_and_cancel_limitations() {
    compare(vec![
 json!({"executor":true,"steps":[{"at":1,"kind":"resolve","text":"  hello 🚀  ","code":0}]}),
 json!({"executor":true,"steps":[{"at":1,"kind":"stop"},{"at":2,"kind":"resolve","text":format!("prefix{}","a".repeat(16001)),"code":0,"timedOut":true}]}),
 json!({"executor":true,"steps":[{"at":1,"kind":"resolve","text":format!("🚀{}","a".repeat(15999)),"code":124,"timedOut":true}]}),
 json!({"executor":true,"steps":[{"at":1,"kind":"reject","text":"failed"}]}),
 json!({"executor":true,"steps":[{"at":1,"kind":"resolve","text":"   ","code":0}]}),
 ]).await;
}
#[tokio::test]
async fn admission_cap_releases_once_on_error_close_and_spawn_failure() {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/sandbox-process")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let expected = internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[{"op":"nativesandboxproc.capacity"}]}),
        &|| false,
    )
    .unwrap();
    let clock = Arc::new(AtomicI64::new(0));
    let timers = Cell::new(Mutex::new(Timers::default()));
    let events: Cell<Vec<ProcessEvents>> = Cell::default();
    let captured = events.clone();
    let runtime = Runtime {
        spawn: Arc::new(move |_, e| {
            let mut captured = captured.lock().unwrap();
            let index = captured.len();
            captured.push(e);
            Ok(Arc::new(FakeChild {
                index,
                clock: Arc::new(AtomicI64::new(0)),
                kills: Cell::default(),
            }))
        }),
        schedule: schedule(clock, timers.clone()),
        supervise: Arc::new(|_| panic!("unexpected supervisor task")),
        uuid: Arc::new(|| "capacity".into()),
    };
    let admission = Admission::default();
    let invocation = ["fake", "exec", "container", "bash", "-lc", "true"].map(String::from);
    let start = || {
        BackgroundProcess::start(
            runtime.clone(),
            &admission,
            &invocation,
            "container".into(),
            1000.0,
            false,
        )
    };
    for _ in 0..50 {
        start().unwrap();
    }
    assert_eq!(admission.active(), 50);
    let mut errors = vec![];
    match start() {
        Err(HostError::Error(v)) => errors.push(v),
        _ => panic!("capacity accepted"),
    };
    (events.lock().unwrap()[0].error)("failed".into());
    assert_eq!(admission.active(), 49);
    (events.lock().unwrap()[0].close)(Some(0.0));
    assert_eq!(admission.active(), 49);
    start().unwrap();
    match start() {
        Err(HostError::Error(v)) => errors.push(v),
        _ => panic!("duplicate release"),
    };
    for e in events.lock().unwrap().iter() {
        (e.close)(Some(0.0));
    }
    assert_eq!(admission.active(), 0);
    for _ in 0..50 {
        start().unwrap();
    }
    for e in events.lock().unwrap().iter() {
        (e.close)(Some(0.0));
    }
    assert_eq!(admission.active(), 0);
    assert_eq!(
        json!({"errors":errors,"launches":events.lock().unwrap().len(),"pendingTimers":timers.lock().unwrap().entries.len()}),
        expected[0]
    );
    let mut failing = runtime;
    failing.spawn = Arc::new(|_, _| Err(HostError::Error("spawn".into())));
    assert!(
        BackgroundProcess::start(failing, &admission, &invocation, "c".into(), 1000.0, false)
            .is_err()
    );
    assert_eq!(admission.active(), 0);
}
