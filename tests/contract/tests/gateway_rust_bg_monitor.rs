#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::bounded_json::Utf16Text, services::background_command_monitor::*};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicI64, Ordering},
    },
};

#[derive(Default)]
struct Surface {
    listeners: Mutex<Vec<OutputListener>>,
    exits: Mutex<Vec<ExitListener>>,
    remove_error: bool,
}
impl MonitorableSurface for Surface {
    fn add_exit_listener(&self, l: ExitListener) {
        self.exits.lock().unwrap().push(l);
    }
    fn remove_exit_listener(&self, l: &ExitListener) -> Result<(), String> {
        self.exits.lock().unwrap().retain(|v| !Arc::ptr_eq(v, l));
        Ok(())
    }
    fn add_output_listener(&self, l: OutputListener) {
        self.listeners.lock().unwrap().push(l);
    }
    fn remove_output_listener(&self, l: &OutputListener) -> Result<(), String> {
        self.listeners
            .lock()
            .unwrap()
            .retain(|v| !Arc::ptr_eq(v, l));
        if self.remove_error {
            Err("remove".into())
        } else {
            Ok(())
        }
    }
}
struct Timer {
    at: i64,
    callback: TimerCallback,
}
#[derive(Default)]
struct Timers {
    next: u64,
    timers: BTreeMap<u64, Timer>,
}
type Events = Arc<Mutex<Vec<Value>>>;
fn push(e: &Events, v: Value) {
    e.lock().unwrap().push(v);
}
fn units(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}
fn string(v: &Value, k: &str, default: &str) -> String {
    v[k].as_str().unwrap_or(default).to_string()
}
fn record(r: BackgroundCommandResult) -> Value {
    let timed_out = r.timed_out;
    let mut v = json!({"session":r.session_id,"terminal":r.terminal_id,"command":r.command,"code":r.exit_code,"output":r.output.0,"duration":r.duration_ms});
    if timed_out {
        v["timedOut"] = json!(true);
    }
    v
}
fn snapshot(v: ExecutionSnapshot) -> Value {
    json!({"terminalId":v.terminal_id,"executionId":v.execution_id,"status":v.status,"output":v.output.0,"exitCode":v.exit_code,"durationMs":v.duration_ms})
}
fn handler(m: &BackgroundCommandMonitor, e: &Events, id: &str, fail: bool) -> HandlerSubscription {
    let e = e.clone();
    let id = id.to_string();
    m.set_completion_handler(Arc::new(move |r| {
        let e = e.clone();
        let id = id.clone();
        Box::pin(async move {
            push(&e, json!(["handler", id, record(r)]));
            if fail { Err("handler".into()) } else { Ok(()) }
        })
    }))
}
fn schedule(now: Arc<AtomicI64>, timers: Arc<Mutex<Timers>>) -> Schedule {
    Arc::new(move |ms, callback| {
        let id = {
            let mut t = timers.lock().unwrap();
            t.next += 1;
            let id = t.next;
            t.timers.insert(
                id,
                Timer {
                    at: now.load(Ordering::SeqCst) + ms.max(0.0) as i64,
                    callback,
                },
            );
            id
        };
        let t = timers.clone();
        Arc::new(move || {
            t.lock().unwrap().timers.remove(&id);
        })
    })
}
async fn native(actions: &[Value]) -> Value {
    let now = Arc::new(AtomicI64::new(1000));
    let timers = Arc::new(Mutex::new(Timers::default()));
    let events: Events = Arc::default();
    let warnings: Events = Arc::default();
    let n = now.clone();
    let w = warnings.clone();
    let monitor = BackgroundCommandMonitor::with_options(
        Arc::new(move || n.load(Ordering::SeqCst)),
        schedule(now.clone(), timers.clone()),
        Arc::new(move |s| push(&w, json!(s.0))),
    );
    let mut subscriptions = BTreeMap::new();
    subscriptions.insert(
        "default".to_string(),
        handler(&monitor, &events, "default", false),
    );
    let mut surfaces: BTreeMap<String, Arc<Surface>> = BTreeMap::new();
    let mut pending: BTreeMap<String, tokio::sync::oneshot::Sender<Result<Completion, String>>> =
        BTreeMap::new();
    let mut errors: Vec<String> = vec![];
    let mut snapshots = vec![];
    for a in actions {
        let id = string(a, "id", "t");
        let session = string(a, "session", "s");
        let command = string(a, "command", "run");
        let result: Result<(), String> = match a["op"].as_str().unwrap() {
            "track" => {
                let surface = Arc::new(Surface {
                    listeners: Mutex::default(),
                    exits: Mutex::default(),
                    remove_error: a["removeError"] == true,
                });
                surfaces.insert(id.clone(), surface.clone());
                let e = events.clone();
                let i = id.clone();
                let fail = a["outputError"] == true;
                let stop_on_output = a["stopOnOutput"] == true;
                let owner = monitor.clone();
                let owner_session = session.clone();
                let on_output: OutputCallback = Arc::new(move |r| {
                    push(&e, json!(["output", i, r.0]));
                    if stop_on_output {
                        owner.stop_for_session(&owner_session)?;
                    }
                    if fail { Err("output".into()) } else { Ok(()) }
                });
                let e = events.clone();
                let i = id.clone();
                let fail = a["completeError"] == true;
                let on_complete: CompletionCallback = Arc::new(move |r| {
                    push(&e, json!(["complete", i, r.exit_code, r.output.0]));
                    if fail { Err("complete".into()) } else { Ok(()) }
                });
                let e = events.clone();
                let i = id.clone();
                let fail = a["stopError"] == true;
                let on_stop: SimpleCallback = Arc::new(move || {
                    push(&e, json!(["stop", i]));
                    if fail { Err("stop".into()) } else { Ok(()) }
                });
                let notify = a["notify"] != false;
                let ok = monitor.track(TrackOptions {
                    session_id: session,
                    terminal_id: id.clone(),
                    command,
                    surface,
                    execution_id: a["execution"].as_str().map(String::from),
                    on_cancel: if a["cancel"] == true {
                        let e = events.clone();
                        let i = id.clone();
                        Some(Arc::new(move || {
                            push(&e, json!(["cancel", i]));
                            Ok(())
                        }))
                    } else {
                        None
                    },
                    on_timeout: if a["deadline"] == true {
                        let e = events.clone();
                        let i = id.clone();
                        Some(Arc::new(move || {
                            push(&e, json!(["timeout", i]));
                            Ok(())
                        }))
                    } else {
                        None
                    },
                    completion_token: a["token"].as_str().map(String::from),
                    shell: string(a, "shell", ""),
                    max_watch_ms: a["max"].as_f64(),
                    initial_output: units(a["initial"].as_str().unwrap_or("")),
                    started_at: a["started"].as_f64(),
                    on_output: Some(on_output),
                    should_notify: Some(Arc::new(move || notify)),
                    on_complete: Some(on_complete),
                    on_stop: Some(on_stop),
                });
                push(&events, json!(["track", id, ok]));
                Ok(())
            }
            "external" => {
                let (send, receive) = tokio::sync::oneshot::channel();
                pending.insert(id.clone(), send);
                let e = events.clone();
                let i = id.clone();
                let fail = a["cancelError"] == true;
                let notify = a["notify"] != false;
                let ok = monitor.track_external(
                    ExternalOptions {
                        execution_id: a["execution"].as_str().map(String::from),
                        get_output: {
                            let output = units(a["partial"].as_str().unwrap_or(""));
                            Some(Arc::new(move || Utf16Text(output.clone())))
                        },
                        session_id: session,
                        terminal_id: id.clone(),
                        command,
                        started_at: a["started"]
                            .as_f64()
                            .unwrap_or(now.load(Ordering::SeqCst) as f64),
                        should_notify: Some(Arc::new(move || notify)),
                        on_cancel: Some(Arc::new(move || {
                            push(&e, json!(["cancel", i]));
                            if fail { Err("cancel".into()) } else { Ok(()) }
                        })),
                    },
                    Box::pin(
                        async move { receive.await.unwrap_or_else(|_| Err("external".into())) },
                    ),
                );
                push(&events, json!(["track", id, ok]));
                Ok(())
            }
            "resolve" | "reject" => {
                if let Some(send) = pending.remove(&id) {
                    let _ = send.send(if a["op"] == "reject" {
                        Err("external".into())
                    } else {
                        Ok(Completion {
                            timed_out: a["timedOut"] == true,
                            exit_code: a["code"].as_f64(),
                            output: Utf16Text(units(a["output"].as_str().unwrap_or(""))),
                        })
                    });
                }
                Ok(())
            }
            "exit" => {
                let mut result = Ok(());
                if let Some(surface) = surfaces.get(&id) {
                    let exits = surface.exits.lock().unwrap().clone();
                    for listener in exits {
                        result = listener(a["code"].as_f64());
                        if result.is_err() {
                            break;
                        }
                    }
                }
                result
            }
            "emit" => {
                let mut res = Ok(());
                if let Some(s) = surfaces.get(&id) {
                    let listeners = s.listeners.lock().unwrap().clone();
                    for l in listeners {
                        res = l(&units(a["data"].as_str().unwrap()));
                        if res.is_err() {
                            break;
                        }
                    }
                }
                res
            }
            "advance" => {
                let target = now.load(Ordering::SeqCst) + a["ms"].as_i64().unwrap();
                loop {
                    let due = {
                        let t = timers.lock().unwrap();
                        t.timers
                            .iter()
                            .filter(|(_, t)| t.at <= target)
                            .min_by_key(|(id, t)| (t.at, **id))
                            .map(|(id, _)| *id)
                    };
                    let Some(id) = due else { break };
                    let t = timers.lock().unwrap().timers.remove(&id).unwrap();
                    now.store(t.at, Ordering::SeqCst);
                    if let Err(e) = (t.callback)() {
                        errors.push(e);
                    }
                }
                now.store(target, Ordering::SeqCst);
                Ok(())
            }
            "stop" => monitor.stop_for_session(&session),
            "clear" => monitor.clear_for_tests(),
            "handler" => {
                subscriptions.insert(
                    id.clone(),
                    handler(&monitor, &events, &id, a["fail"] == true),
                );
                Ok(())
            }
            "unsubscribe" => {
                if let Some(s) = subscriptions.get(&id) {
                    s.unsubscribe();
                }
                Ok(())
            }
            "report" => {
                monitor.report_completion(BackgroundCommandResult {
                    timed_out: a["timedOut"] == true,
                    session_id: session,
                    terminal_id: id,
                    command,
                    exit_code: a["code"].as_f64(),
                    output: Utf16Text(units(a["output"].as_str().unwrap_or(""))),
                    duration_ms: a["duration"].as_f64().unwrap_or(0.0),
                });
                Ok(())
            }
            "inspect" | "cancelExecution" => {
                let execution = string(a, "execution", &id);
                let value = if a["op"] == "inspect" {
                    Ok(monitor.inspect_execution(&session, &id, &execution))
                } else {
                    monitor.cancel_execution(&session, &id, &execution)
                };
                match value {
                    Ok(value) => {
                        push(&events, json!([a["op"], value.map(snapshot)]));
                        Ok(())
                    }
                    Err(e) => Err(e),
                }
            }
            other => panic!("unknown {other}"),
        };
        if let Err(e) = result {
            errors.push(e);
        }
        for _ in 0..6 {
            tokio::task::yield_now().await;
        }
        monitor.drain_notifications().await;
        let state = surfaces
            .iter()
            .map(|(id, s)| {
                json!([
                    id,
                    s.listeners.lock().unwrap().len(),
                    monitor.has_watcher_for_terminal(id)
                ])
            })
            .collect::<Vec<_>>();
        snapshots.push(json!({"active":monitor.active_count(),"timers":timers.lock().unwrap().timers.len(),"surfaces":state,"events":events.lock().unwrap().clone(),"warnings":warnings.lock().unwrap().clone(),"errors":errors.clone()}));
    }
    let _ = monitor.clear_for_tests();
    json!(snapshots)
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
async fn compare(actions: Vec<Value>) {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/bg-monitor")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let expected = internal_driver::call(
        &root(),
        &directory,
        json!({"version":1,"calls":[{"op":"nativebgmonitor.run","actions":actions}]}),
        &|| false,
    )
    .unwrap();
    let actual = native(&actions).await;
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
    fn numbers(v: &Value) -> Value {
        match v {
            Value::Number(n) => json!(n.as_f64().unwrap()),
            Value::Array(a) => Value::Array(a.iter().map(numbers).collect()),
            Value::Object(o) => {
                Value::Object(o.iter().map(|(k, v)| (k.clone(), numbers(v))).collect())
            }
            _ => v.clone(),
        }
    }
    let actual = numbers(&actual);
    let expected = numbers(&expected);
    for (i, (a, e)) in actual
        .as_array()
        .unwrap()
        .iter()
        .zip(expected[0].as_array().unwrap())
        .enumerate()
    {
        assert_eq!(a, e, "action {i}: {}", actions[i]);
    }
}
const TOKEN: &str = "__JAIT_BACKGROUND_DONE_abc-123__";
fn osc(code: &str) -> String {
    format!("\u{1b}]633;D;{code}\u{7}")
}
#[tokio::test]
async fn marker_chunks_sentinel_priority_grace_deadline_and_duplicate_suppression() {
    compare(vec![
        json!({"op":"track","token":TOKEN,"initial":"run\r\nbody\r\n","started":900}),
        json!({"op":"emit","data":osc("0")}),
        json!({"op":"advance","ms":249}),
        json!({"op":"emit","data":format!("{TOKEN}:-7\r\n")}),
        json!({"op":"emit","data":osc("9")}),
        json!({"op":"advance","ms":999}),
    ])
    .await;
    compare(vec![
        json!({"op":"track","token":TOKEN}),
        json!({"op":"emit","data":osc("3")}),
        json!({"op":"advance","ms":249}),
        json!({"op":"advance","ms":1}),
        json!({"op":"emit","data":format!("{TOKEN}:0")}),
    ])
    .await;
    for end in ["\u{7}", "\u{1b}\\"] {
        for code in ["", "-", "-4", "99999999999999999999999999999999"] {
            let marker = format!("\u{1b}]633;D;{code}{end}");
            let mut actions = vec![json!({"op":"track"})];
            actions.extend(
                marker
                    .chars()
                    .map(|c| json!({"op":"emit","data":c.to_string()})),
            );
            compare(actions).await;
        }
    }
    compare(vec![
        json!({"op":"track","token":"a.[b]+$"}),
        json!({"op":"emit","data":"aXb:9"}),
        json!({"op":"emit","data":"a.[b]+$:12"}),
    ])
    .await;
}
#[tokio::test]
async fn expiry_session_cancellation_suppression_and_callback_errors() {
    compare(vec![
        json!({"op":"track","id":"a","session":"s1","token":TOKEN,"max":200}),
        json!({"op":"track","id":"b","session":"s2"}),
        json!({"op":"emit","id":"a","data":osc("0")}),
        json!({"op":"advance","ms":200}),
        json!({"op":"advance","ms":100}),
        json!({"op":"stop","session":"s1"}),
        json!({"op":"emit","id":"b","data":osc("0")}),
    ])
    .await;
    compare(vec![
        json!({"op":"track","token":TOKEN}),
        json!({"op":"emit","data":osc("0")}),
        json!({"op":"stop"}),
        json!({"op":"stop"}),
        json!({"op":"advance","ms":300}),
    ])
    .await;
    for flag in [
        "notify",
        "completeError",
        "removeError",
        "stopError",
        "outputError",
    ] {
        let mut t = json!({"op":"track"});
        t[flag] = json!(flag != "notify");
        compare(vec![
            t,
            json!({"op":"emit","data":format!("run\r\nresult\r\n{}",osc("2"))}),
            json!({"op":"emit","data":osc("0")}),
            json!({"op":"stop"}),
        ])
        .await;
    }
    compare(vec![
        json!({"op":"track"}),
        json!({"op":"advance","ms":21_599_999}),
        json!({"op":"advance","ms":1}),
    ])
    .await;
}
#[tokio::test]
async fn external_success_rejection_cancellation_handler_lifetimes_and_missing_sink() {
    compare(vec![
        json!({"op":"external","id":"a","started":800}),
        json!({"op":"advance","ms":10}),
        json!({"op":"resolve","id":"a","code":null,"output":"native output 😀"}),
        json!({"op":"external","id":"b"}),
        json!({"op":"reject","id":"b"}),
        json!({"op":"external","id":"c"}),
        json!({"op":"stop"}),
        json!({"op":"resolve","id":"c","code":0}),
    ])
    .await;
    compare(vec![
        json!({"op":"external","notify":false}),
        json!({"op":"resolve","code":2}),
        json!({"op":"external","cancelError":true}),
        json!({"op":"stop"}),
        json!({"op":"stop"}),
    ])
    .await;
    compare(vec![
        json!({"op":"handler","id":"old"}),
        json!({"op":"handler","id":"new","fail":true}),
        json!({"op":"unsubscribe","id":"old"}),
        json!({"op":"report","code":4,"duration":33,"output":"hello"}),
        json!({"op":"unsubscribe","id":"new"}),
        json!({"op":"report","command":"🦀".repeat(50)}),
        json!({"op":"handler","id":"last"}),
        json!({"op":"clear"}),
        json!({"op":"report"}),
    ])
    .await;
}
#[tokio::test]
async fn shared_admission_cap_releases_slots_after_completion_cancel_and_rejection() {
    let mut actions = vec![];
    for i in 0..50 {
        actions.push(json!({"op":if i%2==0{"track"}else{"external"},"id":format!("t{i:02}"),"session":format!("s{i}")}));
    }
    actions.extend([
        json!({"op":"track","id":"overflow","command":"🦀".repeat(50)}),
        json!({"op":"external","id":"overflow-ext"}),
        json!({"op":"reject","id":"t01"}),
        json!({"op":"track","id":"replacement"}),
        json!({"op":"emit","id":"t00","data":osc("0")}),
        json!({"op":"external","id":"replacement-ext"}),
        json!({"op":"stop","session":"s2"}),
        json!({"op":"clear"}),
    ]);
    compare(actions).await;
}
#[tokio::test]
async fn dropping_owner_removes_listeners_and_timers() {
    let now = Arc::new(AtomicI64::new(0));
    let timers = Arc::new(Mutex::new(Timers::default()));
    let m = BackgroundCommandMonitor::with_options(
        Arc::new(|| 0),
        schedule(now, timers.clone()),
        Arc::new(|_| {}),
    );
    let s = Arc::new(Surface::default());
    assert!(m.track(TrackOptions {
        session_id: "s".into(),
        terminal_id: "t".into(),
        command: "run".into(),
        surface: s.clone(),
        execution_id: None,
        on_cancel: None,
        on_timeout: None,
        completion_token: None,
        shell: "".into(),
        max_watch_ms: None,
        initial_output: vec![],
        started_at: None,
        on_output: None,
        should_notify: None,
        on_complete: None,
        on_stop: None
    }));
    assert_eq!(s.listeners.lock().unwrap().len(), 1);
    drop(m);
    assert_eq!(s.listeners.lock().unwrap().len(), 0);
    assert!(timers.lock().unwrap().timers.is_empty());
}

#[tokio::test]
async fn cancellation_during_output_delivery_suppresses_completion_and_wakeup() {
    for token in [Value::Null, json!(TOKEN)] {
        let actions = vec![
            json!({"op":"track","stopOnOutput":true,"token":token}),
            json!({"op":"emit","data":osc("0")}),
        ];
        let result = native(&actions).await;
        let events = result[1]["events"].as_array().unwrap();
        assert!(
            !events
                .iter()
                .any(|e| e[0] == "complete" || e[0] == "handler"),
            "cancelled output must not complete or notify: {events:?}"
        );
        assert_eq!(result[1]["timers"], json!(0));
        compare(actions).await;
    }
}

#[tokio::test]
async fn cancellation_from_another_thread_wins_during_output_callback() {
    use std::sync::{Barrier, atomic::AtomicUsize};
    let entered = Arc::new(Barrier::new(2));
    let resume = Arc::new(Barrier::new(2));
    let completed = Arc::new(AtomicUsize::new(0));
    let notified = Arc::new(AtomicUsize::new(0));
    let timers = Arc::new(Mutex::new(Timers::default()));
    let m = BackgroundCommandMonitor::with_options(
        Arc::new(|| 0),
        schedule(Arc::new(AtomicI64::new(0)), timers.clone()),
        Arc::new(|_| {}),
    );
    let count = notified.clone();
    let _subscription = m.set_completion_handler(Arc::new(move |_| {
        count.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Ok(()) })
    }));
    let s = Arc::new(Surface::default());
    let c = completed.clone();
    let e = entered.clone();
    let r = resume.clone();
    assert!(m.track(TrackOptions {
        session_id: "s".into(),
        terminal_id: "t".into(),
        command: "run".into(),
        surface: s.clone(),
        execution_id: None,
        on_cancel: None,
        on_timeout: None,
        completion_token: Some(TOKEN.into()),
        shell: "".into(),
        max_watch_ms: None,
        initial_output: vec![],
        started_at: None,
        on_output: Some(Arc::new(move |_| {
            e.wait();
            r.wait();
            Ok(())
        })),
        should_notify: None,
        on_complete: Some(Arc::new(move |_| {
            c.fetch_add(1, Ordering::SeqCst);
            Ok(())
        })),
        on_stop: None
    }));
    let listener = s.listeners.lock().unwrap()[0].clone();
    let handle = tokio::runtime::Handle::current();
    let delivery = std::thread::spawn(move || {
        let _entered = handle.enter();
        listener(&units(&format!("{TOKEN}:0")))
    });
    entered.wait();
    m.stop_for_session("s").unwrap();
    resume.wait();
    delivery.join().unwrap().unwrap();
    m.drain_notifications().await;
    assert_eq!(completed.load(Ordering::SeqCst), 0);
    assert_eq!(notified.load(Ordering::SeqCst), 0);
    assert_eq!(m.active_count(), 0);
    assert!(s.listeners.lock().unwrap().is_empty());
    assert!(timers.lock().unwrap().timers.is_empty());
}

#[tokio::test]
async fn tracked_progress_cancellation_scope_stale_identity_and_completed_retention() {
    compare(vec![
        json!({"op":"track","execution":"one","cancel":true}),
        json!({"op":"emit","data":"stage one\r\n"}),
        json!({"op":"inspect","execution":"one"}),
        json!({"op":"cancelExecution","execution":"one","session":"foreign"}),
        json!({"op":"cancelExecution","execution":"stale"}),
        json!({"op":"inspect","execution":"one"}),
        json!({"op":"cancelExecution","execution":"one"}),
        json!({"op":"emit","data":osc("0")}),
        json!({"op":"inspect","execution":"one"}),
        json!({"op":"track","execution":"two"}),
        json!({"op":"cancelExecution","execution":"one"}),
        json!({"op":"emit","data":osc("7")}),
        json!({"op":"inspect","execution":"two"}),
    ])
    .await;
}
#[tokio::test]
async fn execution_deadline_stops_once_notifies_as_timeout_and_retains_partial_output() {
    compare(vec![
        json!({"op":"track","execution":"deadline","deadline":true,"max":50}),
        json!({"op":"emit","data":"partial result\r\n"}),
        json!({"op":"advance","ms":50}),
        json!({"op":"emit","data":osc("0")}),
        json!({"op":"inspect","execution":"deadline"}),
    ])
    .await;
}
#[tokio::test]
async fn external_execution_progress_cancellation_and_timeout_completion() {
    compare(vec![
        json!({"op":"external","execution":"a","partial":"working"}),
        json!({"op":"inspect","execution":"a"}),
        json!({"op":"cancelExecution","execution":"a","session":"foreign"}),
        json!({"op":"cancelExecution","execution":"a"}),
        json!({"op":"resolve","code":0,"output":"late"}),
        json!({"op":"inspect","execution":"a"}),
        json!({"op":"external","execution":"b"}),
        json!({"op":"resolve","code":124,"output":"partial","timedOut":true}),
        json!({"op":"inspect","execution":"b"}),
    ])
    .await;
}
#[tokio::test]
async fn initial_completion_marker_is_not_lost_at_foreground_handoff() {
    compare(vec![
        json!({"op":"track","initial":osc("0")}),
        json!({"op":"inspect"}),
    ])
    .await;
}

#[tokio::test]
async fn shell_exit_finishes_without_a_prompt_or_command_marker_and_detaches_once() {
    compare(vec![
        json!({"op":"track","execution":"shell-exit"}),
        json!({"op":"emit","data":"last output"}),
        json!({"op":"exit","code":7}),
        json!({"op":"exit","code":0}),
        json!({"op":"inspect","execution":"shell-exit"}),
    ])
    .await;
}
