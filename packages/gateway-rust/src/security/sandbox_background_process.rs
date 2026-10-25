//! Sandbox process lifetime policy over authorized, supervised process ports.
//! No ambient Docker execution or authorization is provided by this module.
use crate::{
    contracts::bounded_json::Utf16Text,
    services::background_command_monitor::{CancelTimer, OutputCallback, Schedule},
    tools::{
        core_io::HostError,
        sandbox_background_terminal::{SandboxCompletion, SandboxExecution, Subscription},
    },
};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::sync::Notify;

pub const MAX_OUTPUT_CHARS: usize = 16_000;
pub const MAX_BACKGROUND_PROCESSES: usize = 50;
#[derive(Clone, Debug, PartialEq)]
pub struct Launch {
    pub executable: String,
    pub arguments: Vec<String>,
    pub capture_output: bool,
    pub windows_hide: bool,
}
/// Hosts release event listeners after terminal delivery; callbacks are serialized
/// per execution, never invoked inline by spawn. kill targets the child handle,
/// never a caller-provided PID. Hosts retain/reap children after close/error.
pub trait Child: Send + Sync {
    fn kill(&self);
}
pub struct ProcessEvents {
    pub stdout: OutputCallback,
    pub stderr: OutputCallback,
    pub error: Arc<dyn Fn(String) + Send + Sync>,
    pub close: Arc<dyn Fn(Option<f64>) + Send + Sync>,
}
pub type Spawn =
    Arc<dyn Fn(Launch, ProcessEvents) -> Result<Arc<dyn Child>, HostError> + Send + Sync>;
/// Retain and poll the future to completion, observe failure, and join it during
/// shutdown. Dropping an execution/stop observer must not cancel cleanup.
pub type Supervise = Arc<dyn Fn(BoxFuture<'static, Result<(), HostError>>) + Send + Sync>;
#[derive(Clone)]
pub struct Runtime {
    pub spawn: Spawn,
    pub schedule: Schedule,
    pub supervise: Supervise,
    pub uuid: Arc<dyn Fn() -> String + Send + Sync>,
}
/// One shared admission instance per gateway process factory; never per command.
#[derive(Clone, Default)]
pub struct Admission(Arc<AtomicUsize>);
impl Admission {
    pub fn active(&self) -> usize {
        self.0.load(Ordering::SeqCst)
    }
    fn acquire(&self) -> Result<Permit, HostError> {
        self.0
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
                (n < MAX_BACKGROUND_PROCESSES).then_some(n + 1)
            })
            .map(|_| Permit(self.0.clone()))
            .map_err(|_| HostError::Error("Too many background sandbox commands".into()))
    }
}
struct Permit(Arc<AtomicUsize>);
impl Drop for Permit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}
struct State {
    output: Vec<u16>,
    prefix: Vec<u16>,
    pid: Option<String>,
    stopped: bool,
    finished: bool,
    result: Option<SandboxCompletion>,
    listeners: BTreeMap<usize, OutputCallback>,
    next_listener: usize,
    child: Option<Arc<dyn Child>>,
    timer: Option<CancelTimer>,
    permit: Option<Permit>,
    stopping: Option<Shared<BoxFuture<'static, Result<(), HostError>>>>,
}
pub struct BackgroundProcess {
    state: Mutex<State>,
    ready: Notify,
    runtime: Runtime,
    executable: String,
    container: String,
    marker: String,
    remove_container: bool,
}
fn tail(value: &[u16]) -> Vec<u16> {
    value[value.len().saturating_sub(MAX_OUTPUT_CHARS)..].to_vec()
}
fn whitespace(v: u16) -> bool {
    char::from_u32(v as u32).is_some_and(crate::text::js_whitespace)
}
fn trim(value: &[u16]) -> Vec<u16> {
    let start = value
        .iter()
        .position(|v| !whitespace(*v))
        .unwrap_or(value.len());
    let end = value
        .iter()
        .rposition(|v| !whitespace(*v))
        .map_or(start, |i| i + 1);
    value[start..end].to_vec()
}
fn displayed(value: &[u16]) -> Utf16Text {
    let v = trim(value);
    if v.is_empty() {
        Utf16Text::from("(no output)")
    } else {
        Utf16Text(v)
    }
}
fn blank_state(permit: Option<Permit>) -> State {
    State {
        output: vec![],
        prefix: vec![],
        pid: None,
        stopped: false,
        result: None,
        finished: false,
        listeners: BTreeMap::new(),
        next_listener: 0,
        child: None,
        timer: None,
        permit,
        stopping: None,
    }
}
impl BackgroundProcess {
    pub fn start(
        runtime: Runtime,
        admission: &Admission,
        invocation: &[String],
        container: String,
        timeout_ms: f64,
        remove_container: bool,
    ) -> Result<Arc<Self>, HostError> {
        // Typed manager invocations have executable + launcher + command. Refuse
        // malformed internal invocations before any process effect.
        if invocation.len() < 4 {
            return Err(HostError::Error("Invalid sandbox invocation".into()));
        }
        let permit = admission.acquire()?;
        let marker = format!("__JAIT_SANDBOX_PID_{}__", (runtime.uuid)());
        let wrapper = format!(
            "printf '{marker}%s\\n' \"$$\"; exec timeout --signal=TERM --kill-after=2s \"$1\" bash -lc \"$2\""
        );
        let mut args = invocation[1..invocation.len() - 3].to_vec();
        args.extend([
            "setsid".into(),
            "--wait".into(),
            "bash".into(),
            "-c".into(),
            wrapper,
            "jait-background".into(),
            format!("{}s", timeout_ms.max(1000.0) / 1000.0),
            invocation.last().unwrap().clone(),
        ]);
        let execution = Arc::new(Self {
            state: Mutex::new(blank_state(Some(permit))),
            ready: Notify::new(),
            runtime: runtime.clone(),
            executable: invocation[0].clone(),
            container,
            marker,
            remove_container,
        });
        let out = execution.clone();
        let err = execution.clone();
        let fail = execution.clone();
        let close = execution.clone();
        let child = (runtime.spawn)(
            Launch {
                executable: invocation[0].clone(),
                arguments: args,
                capture_output: true,
                windows_hide: true,
            },
            ProcessEvents {
                stdout: Arc::new(move |v| {
                    out.stdout(v);
                    Ok(())
                }),
                stderr: Arc::new(move |v| {
                    err.append(v);
                    Ok(())
                }),
                error: Arc::new(move |v| fail.finish(None, Some(v))),
                close: Arc::new(move |v| close.finish(v, None)),
            },
        )?;
        execution.state.lock().unwrap().child = Some(child);
        let handle = execution.clone();
        let timer = (runtime.schedule)(
            timeout_ms.max(1000.0) + 5000.0,
            Box::new(move || {
                drop(handle.stop());
                Ok(())
            }),
        );
        execution.state.lock().unwrap().timer = Some(timer);
        Ok(execution)
    }
    fn append(&self, chunk: Utf16Text) {
        let listeners = {
            let mut s = self.state.lock().unwrap();
            s.output.extend_from_slice(&chunk.0);
            s.output = tail(&s.output);
            s.listeners.values().cloned().collect::<Vec<_>>()
        };
        let bounded = Utf16Text(tail(&chunk.0));
        for listener in listeners {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                listener(bounded.clone())
            }));
        }
    }
    fn stdout(self: &Arc<Self>, chunk: Utf16Text) {
        let (chunk, late_pid) = {
            let mut s = self.state.lock().unwrap();
            if s.pid.is_some() {
                (Some(chunk), false)
            } else {
                s.prefix.extend(chunk.0);
                let newline = s.prefix.iter().position(|v| *v == 10);
                if newline.is_none() && s.prefix.len() < 512 {
                    return;
                }
                let mut line = s.prefix[..newline.unwrap_or(s.prefix.len())].to_vec();
                while line.last().is_some_and(|v| whitespace(*v)) {
                    line.pop();
                }
                let line = String::from_utf16_lossy(&line);
                let pid = line.strip_prefix(&self.marker).unwrap_or("");
                if (1..=10).contains(&pid.len())
                    && pid.as_bytes()[0] != b'0'
                    && pid.bytes().all(|v| v.is_ascii_digit())
                {
                    s.pid = Some(pid.into());
                    // JS slice(newline + 1) returns the whole prefix if newline=-1.
                    let chunk = s.prefix[newline.map_or(0, |n| n + 1)..].to_vec();
                    s.prefix.clear();
                    (Some(Utf16Text(chunk)), s.stopped)
                } else {
                    (Some(Utf16Text(std::mem::take(&mut s.prefix))), false)
                }
            }
        };
        if let Some(chunk) = chunk {
            self.append(chunk);
        }
        if late_pid {
            let this = self.clone();
            (self.runtime.supervise)(async move { this.signal_group("TERM").await }.boxed());
        }
    }
    fn finish(&self, code: Option<f64>, error: Option<String>) {
        let (prefix, timer) = {
            let mut s = self.state.lock().unwrap();
            if s.finished {
                return;
            }
            s.finished = true;
            s.permit.take();
            (std::mem::take(&mut s.prefix), s.timer.take())
        };
        if let Some(timer) = timer {
            timer();
        }
        if !prefix.is_empty() {
            self.append(Utf16Text(prefix));
        }
        if let Some(error) = error {
            self.append(Utf16Text::from(format!("\n{error}")));
        }
        {
            let mut s = self.state.lock().unwrap();
            let timed_out = code == Some(124.0) || code == Some(137.0);
            s.result = Some(SandboxCompletion {
                ok: !s.stopped && !timed_out && code == Some(0.0),
                output: displayed(&s.output),
                exit_code: code,
                timed_out,
                container_name: self.container.clone(),
            });
            s.listeners.clear();
        }
        self.ready.notify_waiters();
    }
    async fn signal_group(&self, signal: &str) -> Result<(), HostError> {
        let pid = self.state.lock().unwrap().pid.clone();
        if let Some(pid) = pid {
            cleanup(
                &self.runtime,
                vec![
                    self.executable.clone(),
                    "exec".into(),
                    self.container.clone(),
                    "bash".into(),
                    "-c".into(),
                    format!("kill -{signal} -- -{pid} 2>/dev/null || true"),
                ],
            )
            .await?;
        }
        Ok(())
    }
    pub fn subscribe(self: &Arc<Self>, callback: OutputCallback) -> Subscription {
        let id = {
            let mut s = self.state.lock().unwrap();
            s.next_listener += 1;
            let id = s.next_listener;
            s.listeners.insert(id, callback);
            id
        };
        let this = self.clone();
        Subscription(Some(Box::new(move || {
            this.state.lock().unwrap().listeners.remove(&id);
        })))
    }
    pub fn completion(
        self: &Arc<Self>,
    ) -> BoxFuture<'static, Result<SandboxCompletion, HostError>> {
        let this = self.clone();
        async move {
            loop {
                let ready = this.ready.notified();
                if let Some(result) = this.state.lock().unwrap().result.clone() {
                    return Ok(result);
                }
                ready.await;
            }
        }
        .boxed()
    }
    pub fn stop(self: &Arc<Self>) -> BoxFuture<'static, Result<(), HostError>> {
        let mut s = self.state.lock().unwrap();
        if s.finished {
            return async { Ok(()) }.boxed();
        }
        s.stopped = true;
        if let Some(future) = &s.stopping {
            return future.clone().boxed();
        }
        let this = self.clone();
        let future = async move {
            if this.remove_container {
                cleanup(
                    &this.runtime,
                    vec![
                        this.executable.clone(),
                        "rm".into(),
                        "-f".into(),
                        this.container.clone(),
                    ],
                )
                .await?;
            } else {
                this.signal_group("TERM").await?;
                if !this.state.lock().unwrap().finished {
                    delay(&this.runtime.schedule, 2000.0).await;
                    if !this.state.lock().unwrap().finished {
                        this.signal_group("KILL").await?;
                    }
                }
            }
            let child = {
                let s = this.state.lock().unwrap();
                if !s.finished { s.child.clone() } else { None }
            };
            if let Some(child) = child {
                child.kill();
            }
            Ok(())
        }
        .boxed()
        .shared();
        s.stopping = Some(future.clone());
        drop(s);
        let supervised = future.clone();
        (self.runtime.supervise)(supervised.boxed());
        future.boxed()
    }
}
async fn delay(schedule: &Schedule, ms: f64) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    let cancel = schedule(
        ms,
        Box::new(move || {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(());
            }
            Ok(())
        }),
    );
    let _ = rx.await;
    cancel();
}
async fn cleanup(runtime: &Runtime, args: Vec<String>) -> Result<(), HostError> {
    let done = Arc::new(Notify::new());
    let finished = Arc::new(AtomicUsize::new(0));
    let notify = done.clone();
    let flag = finished.clone();
    let close: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
        flag.store(1, Ordering::SeqCst);
        notify.notify_one();
    });
    let error = close.clone();
    let terminal = close.clone();
    let child = (runtime.spawn)(
        Launch {
            executable: args[0].clone(),
            arguments: args[1..].to_vec(),
            capture_output: false,
            windows_hide: true,
        },
        ProcessEvents {
            stdout: Arc::new(|_| Ok(())),
            stderr: Arc::new(|_| Ok(())),
            error: Arc::new(move |_| error()),
            close: Arc::new(move |_| terminal()),
        },
    )?;
    let timer_done = close.clone();
    let cancel = (runtime.schedule)(
        5000.0,
        Box::new(move || {
            child.kill();
            timer_done();
            Ok(())
        }),
    );
    if finished.load(Ordering::SeqCst) == 0 {
        done.notified().await;
    }
    cancel();
    Ok(())
}
/// Injected command runners own their process lifetime; stop marks the result as
/// cancelled but cannot terminate an opaque runner. This preserves the reference
/// limitation and grants no native process-engine credit.
pub struct ExecutorExecution {
    state: Mutex<State>,
    ready: Notify,
    container: String,
}
pub type CommandRunner = Arc<
    dyn Fn(Vec<String>, f64) -> BoxFuture<'static, Result<RunnerResult, HostError>> + Send + Sync,
>;
pub fn start_executor_backed_command(
    runtime: &Runtime,
    run: CommandRunner,
    invocation: Vec<String>,
    container: String,
    timeout_ms: f64,
) -> Arc<ExecutorExecution> {
    ExecutorExecution::start(runtime, run(invocation, timeout_ms), container)
}
impl ExecutorExecution {
    fn start(
        runtime: &Runtime,
        run: BoxFuture<'static, Result<RunnerResult, HostError>>,
        container: String,
    ) -> Arc<Self> {
        let execution = Arc::new(Self {
            state: Mutex::new(blank_state(None)),
            ready: Notify::new(),
            container,
        });
        let this = execution.clone();
        (runtime.supervise)(
            async move {
                this.finish(run.await);
                Ok(())
            }
            .boxed(),
        );
        execution
    }
    fn finish(&self, result: Result<RunnerResult, HostError>) {
        let (result, chunk, listeners) = {
            let mut s = self.state.lock().unwrap();
            let (result, chunk) = match result {
                Ok(r) => {
                    s.output = r.output.0;
                    let bounded = tail(&s.output);
                    let stopped = s.stopped;
                    (
                        SandboxCompletion {
                            ok: !stopped && !r.timed_out && r.exit_code == Some(0.0),
                            output: displayed(if stopped { &s.output } else { &bounded }),
                            exit_code: r.exit_code,
                            timed_out: !stopped && r.timed_out,
                            container_name: self.container.clone(),
                        },
                        if !stopped && !trim(&bounded).is_empty() {
                            Some(Utf16Text(bounded))
                        } else {
                            None
                        },
                    )
                }
                Err(e) => {
                    let message = match e {
                        HostError::Error(v) => v,
                        HostError::Thrown(v) => crate::services::calendar::js_text(&v),
                    };
                    s.output.extend(message.encode_utf16());
                    (
                        SandboxCompletion {
                            ok: false,
                            output: Utf16Text(tail(&s.output)),
                            exit_code: None,
                            timed_out: false,
                            container_name: self.container.clone(),
                        },
                        None,
                    )
                }
            };
            let listeners = s.listeners.values().cloned().collect::<Vec<_>>();
            (result, chunk, listeners)
        };
        if let Some(chunk) = chunk {
            for listener in listeners {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    listener(chunk.clone())
                }));
            }
        }
        {
            let mut s = self.state.lock().unwrap();
            s.result = Some(result);
            s.listeners.clear();
        }
        self.ready.notify_waiters();
    }
}
pub struct RunnerResult {
    pub output: Utf16Text,
    pub exit_code: Option<f64>,
    pub timed_out: bool,
}
impl SandboxExecution for Arc<ExecutorExecution> {
    fn container_name(&self) -> String {
        self.container.clone()
    }
    fn output(&self) -> Utf16Text {
        displayed(&tail(&self.state.lock().unwrap().output))
    }
    fn on_output(&self, callback: OutputCallback) -> Result<Subscription, HostError> {
        let id = {
            let mut s = self.state.lock().unwrap();
            s.next_listener += 1;
            let id = s.next_listener;
            s.listeners.insert(id, callback);
            id
        };
        let this = self.clone();
        Ok(Subscription(Some(Box::new(move || {
            this.state.lock().unwrap().listeners.remove(&id);
        }))))
    }
    fn completion(&self) -> BoxFuture<'static, Result<SandboxCompletion, HostError>> {
        let this = self.clone();
        async move {
            loop {
                let ready = this.ready.notified();
                if let Some(result) = this.state.lock().unwrap().result.clone() {
                    return Ok(result);
                }
                ready.await;
            }
        }
        .boxed()
    }
    fn stop(&self) -> BoxFuture<'static, Result<(), HostError>> {
        self.state.lock().unwrap().stopped = true;
        async { Ok(()) }.boxed()
    }
}
impl SandboxExecution for Arc<BackgroundProcess> {
    fn container_name(&self) -> String {
        self.container.clone()
    }
    fn output(&self) -> Utf16Text {
        displayed(&self.state.lock().unwrap().output)
    }
    fn on_output(&self, callback: OutputCallback) -> Result<Subscription, HostError> {
        Ok(self.subscribe(callback))
    }
    fn completion(&self) -> BoxFuture<'static, Result<SandboxCompletion, HostError>> {
        BackgroundProcess::completion(self)
    }
    fn stop(&self) -> BoxFuture<'static, Result<(), HostError>> {
        BackgroundProcess::stop(self)
    }
}
