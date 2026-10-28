//! Native port of `packages/gateway/src/evaluation/isolated-gateway.ts`.
//!
//! Starts a throw-away gateway instance for evaluations: read the real
//! backend settings, create an isolated state directory, launch the child
//! gateway with an isolated database, wait for its `JAIT_EVAL_READY` handshake
//! on stdout, and tear everything down again.
//!
//! Every host side effect (HTTP fetch, process spawn, temp-dir creation,
//! clock, UUID) is reached through [`IsolatedGatewayHost`], so the lifecycle
//! logic and its exact error strings stay deterministic and testable.

use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use serde_json::{Map, Value};
use tokio::sync::{mpsc, oneshot, watch};

/// Prefix of the readiness handshake line printed by the child gateway.
pub const READY_PREFIX: &str = "JAIT_EVAL_READY ";
/// Grace period between `SIGTERM` and `SIGKILL` when stopping the child.
pub const DEFAULT_KILL_GRACE_MS: u64 = 5_000;
/// Default deadline for the child handshake (`60_000` in the TS source).
pub const DEFAULT_READY_TIMEOUT_MS: u64 = 60_000;
/// Upper bound for accumulated stderr kept for failure messages.
pub const STDERR_TAIL_CHARS: usize = 4_000;
/// Upper bound for the retained stdout buffer while scanning for a newline.
pub const STDOUT_BUFFER_TAIL_CHARS: usize = 64_000;
/// Database location relative to the isolated state directory.
pub const DB_RELATIVE_PATH: &str = "data/jait.db";
/// Fallback LLM provider when the backend settings do not name one.
pub const DEFAULT_LLM_PROVIDER: &str = "openai";
/// Argument used to boot the native child gateway in isolated-evaluation mode.
pub const CHILD_BOOTSTRAP_ARG: &str = "--evaluation-isolated-child";

pub type HostFuture<'a, T> = Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// Signal delivered to the child gateway.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChildSignal {
    Term,
    Kill,
}

/// Failures surfaced while starting or stopping an isolated gateway.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvalError {
    /// The settings request answered with a non-2xx status.
    SettingsHttp(u16),
    /// The child closed before the handshake arrived (includes stderr tail).
    NotStarted { stderr: String },
    /// The caller aborted before or during startup.
    Cancelled,
    /// The handshake line was present but malformed.
    InvalidReadiness,
    /// Child process error event or other host failure.
    Child(String),
}

impl EvalError {
    /// Message text, byte-identical to the TS implementation.
    pub fn message(&self) -> String {
        match self {
            EvalError::SettingsHttp(status) => {
                format!("Cannot read evaluation backend settings: HTTP {status}")
            }
            EvalError::NotStarted { stderr } => {
                format!("Isolated evaluation gateway did not start. {stderr}")
            }
            EvalError::Cancelled => {
                "Evaluation cancelled during isolated gateway startup".to_string()
            }
            EvalError::InvalidReadiness => "Invalid isolated gateway readiness".to_string(),
            EvalError::Child(message) => message.clone(),
        }
    }
}

impl std::fmt::Display for EvalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message())
    }
}

impl std::error::Error for EvalError {}

/// Successful handshake payload.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ready {
    pub port: u32,
    pub token: String,
}

/// Result of inspecting one stdout line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadyLine {
    /// Not a handshake line; keep reading.
    NotReady,
    /// Valid handshake.
    Ready(Ready),
    /// Handshake line with unusable content.
    Invalid,
}

/// Source gateway the evaluation settings are read from.
#[derive(Debug, Clone, Default)]
pub struct Source {
    pub gateway: String,
    pub token: String,
    /// `true` means the caller cancelled; mirrors `AbortSignal`.
    pub signal: Option<watch::Receiver<bool>>,
}

/// Tunables; defaults match the TS constants.
#[derive(Debug, Clone)]
pub struct IsolatedOptions {
    pub ready_timeout_ms: u64,
    pub kill_grace_ms: u64,
}

impl Default for IsolatedOptions {
    fn default() -> Self {
        Self {
            ready_timeout_ms: DEFAULT_READY_TIMEOUT_MS,
            kill_grace_ms: DEFAULT_KILL_GRACE_MS,
        }
    }
}

/// Everything the host needs to launch the child gateway.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChildSpec {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

/// Handle on the spawned child process.
pub trait ChildControl: Send {
    /// Write the settings payload and close stdin, as `child.stdin.end(data)`.
    fn end_stdin(&mut self, payload: &str);
    /// Deliver a termination signal.
    fn kill(&mut self, signal: ChildSignal);
}

/// Spawned child, observed through channels.
pub struct SpawnedChild {
    /// Decoded stdout lines.
    pub stdout: mpsc::UnboundedReceiver<String>,
    /// Raw stderr chunks.
    pub stderr: mpsc::UnboundedReceiver<String>,
    /// Fires once the process is gone (close or error).
    pub closed: oneshot::Receiver<()>,
    /// Carries the child `error` message, if the process could not run.
    pub error: mpsc::UnboundedReceiver<String>,
    pub control: Box<dyn ChildControl>,
}

/// Host boundary for the isolated-gateway lifecycle.
pub trait IsolatedGatewayHost: Send + Sync {
    /// GET `/api/auth/settings` on the source gateway and return the JSON body.
    fn fetch_settings<'a>(
        &'a self,
        gateway: &'a str,
        token: &'a str,
    ) -> HostFuture<'a, Result<Value, EvalError>>;
    /// Create a private (`0700`) temporary state directory.
    fn make_state_dir(&self) -> HostFuture<'_, Result<PathBuf, EvalError>>;
    /// Recursively delete the state directory, ignoring absence.
    fn remove_state_dir(&self, dir: PathBuf) -> HostFuture<'_, Result<(), EvalError>>;
    /// Spawn the child gateway process.
    fn spawn_child<'a>(&'a self, spec: &'a ChildSpec) -> HostFuture<'a, Result<SpawnedChild, EvalError>>;
    /// Inherited environment of the calling process.
    fn base_env(&self) -> Vec<(String, String)>;
    /// Fresh random token secret (UUID v4 in the TS source).
    fn new_uuid(&self) -> String;
}

/// Running isolated gateway.
pub struct IsolatedGateway {
    /// `http://127.0.0.1:{port}`.
    pub gateway: String,
    pub token: String,
    /// Isolated state directory; removed by [`IsolatedGateway::stop`].
    pub state: PathBuf,
    host: Arc<dyn IsolatedGatewayHost>,
    control: Box<dyn ChildControl>,
    closed: Option<oneshot::Receiver<()>>,
    kill_grace_ms: u64,
    stopped: bool,
}

/// Wait up to `grace` for the child-exit signal.
///
/// Returns `true` when the child is already gone. A oneshot receiver panics if
/// it is polled after completion, so a resolved receiver is dropped here.
async fn wait_closed(closed: &mut Option<oneshot::Receiver<()>>, grace: Duration) -> bool {
    let Some(rx) = closed.as_mut() else {
        return true;
    };
    let exited = tokio::time::timeout(grace, &mut *rx).await.is_ok();
    if exited {
        *closed = None;
    }
    exited
}

/// Resolve once the child is gone, staying pending when no receiver remains.
async fn closed_signal(closed: &mut Option<oneshot::Receiver<()>>) {
    match closed.as_mut() {
        Some(rx) => {
            let _ = rx.await;
        }
        None => std::future::pending::<()>().await,
    }
}

impl IsolatedGateway {
    /// Terminate the child and delete its state directory. Idempotent.
    pub async fn stop(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        self.control.kill(ChildSignal::Term);
        let grace = Duration::from_millis(self.kill_grace_ms);
        if !wait_closed(&mut self.closed, grace).await {
            self.control.kill(ChildSignal::Kill);
            // Even `SIGKILL` needs a moment to be reaped; never block teardown forever.
            let _ = wait_closed(&mut self.closed, grace).await;
        }
        let state = self.state.clone();
        let _ = self.host.remove_state_dir(state).await;
    }
}

impl Drop for IsolatedGateway {
    fn drop(&mut self) {
        // Best-effort, matching the TS `stop` being wired into teardown paths.
        if !self.stopped {
            self.control.kill(ChildSignal::Term);
        }
    }
}

/// Read `settings.jait_backend`, defaulting to [`DEFAULT_LLM_PROVIDER`].
pub fn backend_from_settings(settings: &Value) -> String {
    match settings.get("jait_backend") {
        Some(Value::String(value)) => value.clone(),
        _ => DEFAULT_LLM_PROVIDER.to_string(),
    }
}

/// Environment for the child gateway, mirroring the TS literal.
pub fn build_child_env(
    base: &[(String, String)],
    settings: &Value,
    state: &Path,
    jwt_secret: &str,
) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = Vec::with_capacity(base.len() + 12);
    for (key, value) in base {
        env.push((key.clone(), value.clone()));
    }
    let overrides: [(String, String); 12] = [
        ("__JAIT_CLI".to_string(), "1".to_string()),
        (
            "JAIT_STATE_DIR".to_string(),
            state.to_string_lossy().into_owned(),
        ),
        (
            "JAIT_DB_PATH".to_string(),
            state.join(DB_RELATIVE_PATH).to_string_lossy().into_owned(),
        ),
        ("PORT".to_string(), "0".to_string()),
        ("WS_PORT".to_string(), "0".to_string()),
        ("HOST".to_string(), "127.0.0.1".to_string()),
        ("JWT_SECRET".to_string(), jwt_secret.to_string()),
        ("LOG_LEVEL".to_string(), "warn".to_string()),
        (
            "LLM_PROVIDER".to_string(),
            backend_from_settings(settings),
        ),
        ("JAIT_PRIMARY_GATEWAY".to_string(), String::new()),
        ("JAIT_PRIMARY_TOKEN".to_string(), String::new()),
        ("JAIT_NODE_ONLY".to_string(), "false".to_string()),
    ];
    for (key, value) in overrides {
        set_env(&mut env, key, value);
    }
    env
}

fn set_env(env: &mut Vec<(String, String)>, key: String, value: String) {
    if let Some(slot) = env.iter_mut().find(|(existing, _)| *existing == key) {
        slot.1 = value;
    } else {
        env.push((key, value));
    }
}

/// Interpret an integer-valued JSON number (`Number.isInteger`).
fn json_integer(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                return Some(int);
            }
            let float = number.as_f64()?;
            if float.fract() != 0.0 || !float.is_finite() {
                return None;
            }
            Some(float as i64)
        }
        _ => None,
    }
}

/// Classify one stdout line from the child gateway.
pub fn parse_ready_line(line: &str) -> ReadyLine {
    let Some(payload) = line.strip_prefix(READY_PREFIX) else {
        return ReadyLine::NotReady;
    };
    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return ReadyLine::Invalid;
    };
    let Some(port) = value.get("port").and_then(json_integer) else {
        return ReadyLine::Invalid;
    };
    if port <= 0 {
        return ReadyLine::Invalid;
    }
    let Some(token) = value.get("token").and_then(Value::as_str) else {
        return ReadyLine::Invalid;
    };
    ReadyLine::Ready(Ready {
        port: port as u32,
        token: token.to_string(),
    })
}

/// Keep the last `max` characters (JS `slice(-max)` on a UTF-16 string).
pub fn tail_chars(text: &str, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text.to_string();
    }
    text.chars().skip(count - max).collect()
}

fn is_aborted(signal: &Option<watch::Receiver<bool>>) -> bool {
    signal.as_ref().is_some_and(|rx| *rx.borrow())
}

async fn wait_aborted(signal: &Option<watch::Receiver<bool>>) {
    if let Some(mut rx) = signal.clone() {
        loop {
            if *rx.borrow() {
                return;
            }
            if rx.changed().await.is_err() {
                // A dropped sender with a false value cannot signal cancellation.
                std::future::pending::<()>().await;
            }
        }
    } else {
        std::future::pending::<()>().await;
    }
}

async fn stop_child(
    host: &Arc<dyn IsolatedGatewayHost>,
    control: &mut Box<dyn ChildControl>,
    closed: &mut Option<oneshot::Receiver<()>>,
    already_closed: bool,
    state: &Path,
    kill_grace_ms: u64,
) {
    control.kill(ChildSignal::Term);
    if already_closed {
        *closed = None;
    } else if !wait_closed(closed, Duration::from_millis(kill_grace_ms)).await {
        control.kill(ChildSignal::Kill);
        if let Some(rx) = closed.as_mut() {
            let _ = rx.await;
        }
    }
    let _ = host.remove_state_dir(state.to_path_buf()).await;
}

/// Start an isolated evaluation gateway and wait for its readiness handshake.
pub async fn start_isolated_gateway(
    host: Arc<dyn IsolatedGatewayHost>,
    source: Source,
    options: IsolatedOptions,
) -> Result<IsolatedGateway, EvalError> {
    if is_aborted(&source.signal) {
        return Err(EvalError::Cancelled);
    }
    let settings = host.fetch_settings(&source.gateway, &source.token).await?;
    let state = host.make_state_dir().await?;
    let jwt_secret = host.new_uuid();
    let env = build_child_env(&host.base_env(), &settings, &state, &jwt_secret);
    let spec = ChildSpec {
        program: std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "jait-gateway".to_string()),
        args: vec![CHILD_BOOTSTRAP_ARG.to_string()],
        env,
    };
    let mut child = match host.spawn_child(&spec).await {
        Ok(child) => child,
        Err(error) => {
            let _ = host.remove_state_dir(state).await;
            return Err(error);
        }
    };
    let payload = serde_json::to_string(&settings).unwrap_or_else(|_| "null".to_string());
    child.control.end_stdin(&payload);

    let deadline = Duration::from_millis(options.ready_timeout_ms);
    let mut stderr_tail = String::new();
    let mut buffer = String::new();
    let mut closed = Some(child.closed);
    let mut child_closed = false;
    let mut error = child.error;
    let mut error_open = true;
    let mut stdout = child.stdout;
    let mut stdout_open = true;
    let mut stderr = child.stderr;
    let mut stderr_open = true;
    let mut control = child.control;

    let readiness = {
        let signal = source.signal.clone();
        async {
            let sleep = tokio::time::sleep(deadline);
            tokio::pin!(sleep);
            loop {
                tokio::select! {
                    line = stdout.recv(), if stdout_open => {
                        match line {
                            Some(line) => {
                                buffer.push_str(&line);
                                buffer.push('\n');
                                let mut ready = None;
                                while let Some(index) = buffer.find('\n') {
                                    let current = buffer[..index].to_string();
                                    buffer.drain(..=index);
                                    match parse_ready_line(&current) {
                                        ReadyLine::NotReady => continue,
                                        ReadyLine::Ready(info) => {
                                            ready = Some(Ok(info));
                                            break;
                                        }
                                        ReadyLine::Invalid => {
                                            ready = Some(Err(EvalError::InvalidReadiness));
                                            break;
                                        }
                                    }
                                }
                                if buffer.chars().count() > STDOUT_BUFFER_TAIL_CHARS {
                                    buffer = tail_chars(&buffer, STDOUT_BUFFER_TAIL_CHARS);
                                }
                                if let Some(outcome) = ready {
                                    return outcome;
                                }
                            }
                            None => {
                                // EOF on stdout is not the process close event.
                                stdout_open = false;
                            }
                        }
                    }
                    chunk = stderr.recv(), if stderr_open => {
                        if let Some(chunk) = chunk {
                            stderr_tail.push_str(&chunk);
                            stderr_tail = tail_chars(&stderr_tail, STDERR_TAIL_CHARS);
                        } else {
                            stderr_open = false;
                        }
                    }
                    _ = closed_signal(&mut closed) => {
                        child_closed = true;
                        // A process flushes stderr before it closes; collect whatever is already
                        // buffered so the reported tail matches what the child actually wrote.
                        while let Ok(chunk) = stderr.try_recv() {
                            stderr_tail.push_str(&chunk);
                            stderr_tail = tail_chars(&stderr_tail, STDERR_TAIL_CHARS);
                        }
                        return Err(EvalError::NotStarted { stderr: stderr_tail.clone() });
                    }
                    message = error.recv(), if error_open => {
                        match message {
                            Some(message) => {
                                return Err(EvalError::Child(message));
                            }
                            None => {
                                error_open = false;
                            }
                        }
                    }
                    _ = wait_aborted(&signal) => {
                        return Err(EvalError::Cancelled);
                    }
                    _ = &mut sleep => {
                        return Err(EvalError::NotStarted { stderr: stderr_tail.clone() });
                    }
                }
            }
        }
        .await
    };

    match readiness {
        Ok(info) => Ok(IsolatedGateway {
            gateway: format!("http://127.0.0.1:{}", info.port),
            token: info.token,
            state,
            host,
            control,
            closed,
            kill_grace_ms: options.kill_grace_ms,
            stopped: false,
        }),
        Err(error) => {
            stop_child(
                &host,
                &mut control,
                &mut closed,
                child_closed,
                &state,
                options.kill_grace_ms,
            )
            .await;
            Err(error)
        }
    }
}

/// Shape of the child-side configuration payload, for the bootstrap half.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EvaluationSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_keys: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_tools: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jait_backend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl EvaluationSettings {
    /// Parse the stdin payload handed over by the parent process.
    pub fn parse(input: &str) -> Result<Self, String> {
        serde_json::from_str(input).map_err(|error| error.to_string())
    }
}

/// Child-side isolation guard: `JAIT_DB_PATH` must live inside `JAIT_STATE_DIR`.
pub fn validate_isolation(state_dir: &str, db_path: &str) -> Result<PathBuf, String> {
    if state_dir.is_empty() || db_path != Path::new(state_dir).join(DB_RELATIVE_PATH).to_string_lossy() {
        return Err("Evaluation database isolation required".to_string());
    }
    Ok(PathBuf::from(db_path))
}

/// Handshake line emitted by the child once the server is listening.
pub fn ready_line(port: u32, token: &str) -> String {
    let payload = serde_json::json!({ "port": port, "token": token });
    format!("{READY_PREFIX}{payload}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;
    use tokio::sync::Notify;

    type Script = Arc<dyn Fn() -> Result<SpawnedChild, EvalError> + Send + Sync>;

    struct FakeControl {
        stdin: Arc<Mutex<Vec<String>>>,
        signals: Arc<Mutex<Vec<ChildSignal>>>,
        killed: Arc<Notify>,
    }

    impl ChildControl for FakeControl {
        fn end_stdin(&mut self, payload: &str) {
            self.stdin.lock().unwrap().push(payload.to_string());
        }

        fn kill(&mut self, signal: ChildSignal) {
            self.signals.lock().unwrap().push(signal);
            // A fake child ignores `SIGTERM` but always dies on `SIGKILL`, mirroring a real
            // process that has to be escalated to.
            if signal == ChildSignal::Kill {
                self.killed.notify_waiters();
            }
        }
    }

    struct FakeHost {
        settings: Result<Value, EvalError>,
        script: Script,
        dirs: Arc<Mutex<Vec<PathBuf>>>,
        removed: Arc<Mutex<Vec<PathBuf>>>,
        specs: Arc<Mutex<Vec<ChildSpec>>>,
        fetches: Arc<Mutex<u32>>,
    }

    impl IsolatedGatewayHost for FakeHost {
        fn fetch_settings<'a>(
            &'a self,
            gateway: &'a str,
            token: &'a str,
        ) -> HostFuture<'a, Result<Value, EvalError>> {
            let result = self.settings.clone();
            let fetches = self.fetches.clone();
            let _ = (gateway, token);
            Box::pin(async move {
                *fetches.lock().unwrap() += 1;
                result
            })
        }

        fn make_state_dir(&self) -> HostFuture<'_, Result<PathBuf, EvalError>> {
            let dirs = self.dirs.clone();
            Box::pin(async move {
                let dir = PathBuf::from("/tmp/jait-eval-state-test");
                dirs.lock().unwrap().push(dir.clone());
                Ok(dir)
            })
        }

        fn remove_state_dir(&self, dir: PathBuf) -> HostFuture<'_, Result<(), EvalError>> {
            let removed = self.removed.clone();
            Box::pin(async move {
                removed.lock().unwrap().push(dir);
                Ok(())
            })
        }

        fn spawn_child<'a>(
            &'a self,
            spec: &'a ChildSpec,
        ) -> HostFuture<'a, Result<SpawnedChild, EvalError>> {
            self.specs.lock().unwrap().push(spec.clone());
            let script = self.script.clone();
            Box::pin(async move { script() })
        }

        fn base_env(&self) -> Vec<(String, String)> {
            vec![
                ("PATH".to_string(), "/usr/bin".to_string()),
                ("LLM_PROVIDER".to_string(), "stale".to_string()),
                ("PORT".to_string(), "8000".to_string()),
            ]
        }

        fn new_uuid(&self) -> String {
            "test-uuid".to_string()
        }
    }

    /// Child behaviour script used by the fake host.
    struct ChildScript {
        stderr: Vec<String>,
        lines: Vec<String>,
        close_early: bool,
        close_after_ms: Option<u64>,
    }

    impl ChildScript {
        fn ready(port: u32, token: &str) -> Self {
            Self {
                stderr: Vec::new(),
                lines: vec![ready_line(port, token)],
                close_early: false,
                close_after_ms: Some(1),
            }
        }
    }

    struct Harness {
        host: Arc<FakeHost>,
        stdin: Arc<Mutex<Vec<String>>>,
        signals: Arc<Mutex<Vec<ChildSignal>>>,
        removed: Arc<Mutex<Vec<PathBuf>>>,
        specs: Arc<Mutex<Vec<ChildSpec>>>,
        fetches: Arc<Mutex<u32>>,
        dirs: Arc<Mutex<Vec<PathBuf>>>,
    }

    fn harness(settings: Result<Value, EvalError>, script: ChildScript) -> Harness {
        let stdin = Arc::new(Mutex::new(Vec::new()));
        let signals = Arc::new(Mutex::new(Vec::new()));
        let removed = Arc::new(Mutex::new(Vec::new()));
        let specs = Arc::new(Mutex::new(Vec::new()));
        let fetches = Arc::new(Mutex::new(0));
        let dirs = Arc::new(Mutex::new(Vec::new()));
        let child_stdin = stdin.clone();
        let child_signals = signals.clone();
        let factory: Script = Arc::new(move || {
            let stdin = child_stdin.clone();
            let signals = child_signals.clone();
            let ChildScript {
                stderr,
                lines,
                close_early,
                close_after_ms,
            } = ChildScript {
                stderr: script.stderr.clone(),
                lines: script.lines.clone(),
                close_early: script.close_early,
                close_after_ms: script.close_after_ms,
            };
            let (out_tx, out_rx) = mpsc::unbounded_channel();
            let (err_tx, err_rx) = mpsc::unbounded_channel();
            let (closed_tx, closed_rx) = oneshot::channel();
            let (fail_tx, fail_rx) = mpsc::unbounded_channel();
            let killed = Arc::new(Notify::new());
            let child_killed = killed.clone();
            tokio::spawn(async move {
                let closed_tx = closed_tx;
                for chunk in stderr {
                    let _ = err_tx.send(chunk);
                }
                for line in lines {
                    let _ = out_tx.send(line);
                }
                drop(out_tx);
                if close_early {
                    let _ = closed_tx.send(());
                    drop(fail_tx);
                    return;
                }
                drop(fail_tx);
                match close_after_ms {
                    Some(ms) => {
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_millis(ms)) => {}
                            _ = child_killed.notified() => {}
                        }
                    }
                    None => child_killed.notified().await,
                }
                let _ = closed_tx.send(());
            });
            Ok(SpawnedChild {
                stdout: out_rx,
                stderr: err_rx,
                closed: closed_rx,
                error: fail_rx,
                control: Box::new(FakeControl {
                    stdin,
                    signals,
                    killed,
                }),
            })
        });
        Harness {
            host: Arc::new(FakeHost {
                settings,
                script: factory,
                dirs: dirs.clone(),
                removed: removed.clone(),
                specs: specs.clone(),
                fetches: fetches.clone(),
            }),
            stdin,
            signals,
            removed,
            specs,
            fetches,
            dirs,
        }
    }

    fn fast() -> IsolatedOptions {
        IsolatedOptions {
            ready_timeout_ms: 250,
            kill_grace_ms: 20,
        }
    }

    fn source() -> Source {
        Source {
            gateway: "http://127.0.0.1:1".to_string(),
            token: "source-token".to_string(),
            signal: None,
        }
    }

    #[test]
    fn env_overrides_every_isolation_variable() {
        let state = Path::new("/tmp/jait-eval-state-abc");
        let settings = json!({ "jait_backend": "anthropic" });
        let env = build_child_env(
            &[
                ("PATH".to_string(), "/usr/bin".to_string()),
                ("PORT".to_string(), "8000".to_string()),
                ("LLM_PROVIDER".to_string(), "stale".to_string()),
            ],
            &settings,
            state,
            "uuid-1",
        );
        let lookup = |key: &str| {
            env.iter()
                .find(|(name, _)| name == key)
                .map(|(_, value)| value.clone())
        };
        assert_eq!(lookup("PATH").as_deref(), Some("/usr/bin"));
        assert_eq!(lookup("__JAIT_CLI").as_deref(), Some("1"));
        assert_eq!(
            lookup("JAIT_STATE_DIR").as_deref(),
            Some("/tmp/jait-eval-state-abc")
        );
        assert_eq!(
            lookup("JAIT_DB_PATH").as_deref(),
            Some("/tmp/jait-eval-state-abc/data/jait.db")
        );
        assert_eq!(lookup("PORT").as_deref(), Some("0"));
        assert_eq!(lookup("WS_PORT").as_deref(), Some("0"));
        assert_eq!(lookup("HOST").as_deref(), Some("127.0.0.1"));
        assert_eq!(lookup("JWT_SECRET").as_deref(), Some("uuid-1"));
        assert_eq!(lookup("LOG_LEVEL").as_deref(), Some("warn"));
        assert_eq!(lookup("LLM_PROVIDER").as_deref(), Some("anthropic"));
        assert_eq!(lookup("JAIT_PRIMARY_GATEWAY").as_deref(), Some(""));
        assert_eq!(lookup("JAIT_PRIMARY_TOKEN").as_deref(), Some(""));
        assert_eq!(lookup("JAIT_NODE_ONLY").as_deref(), Some("false"));
        for key in ["PORT", "LLM_PROVIDER"] {
            assert_eq!(
                env.iter().filter(|(name, _)| name == key).count(),
                1,
                "{key} duplicated"
            );
        }
    }

    #[test]
    fn provider_defaults_to_openai_when_absent() {
        assert_eq!(backend_from_settings(&json!({})), "openai");
        assert_eq!(
            backend_from_settings(&json!({ "jait_backend": null })),
            "openai"
        );
        assert_eq!(
            backend_from_settings(&json!({ "jait_backend": "gemini" })),
            "gemini"
        );
    }

    #[test]
    fn ready_line_parsing_matches_ts_rules() {
        assert_eq!(parse_ready_line("booting"), ReadyLine::NotReady);
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":8000,\"token\":\"abc\"}"),
            ReadyLine::Ready(Ready {
                port: 8000,
                token: "abc".to_string()
            })
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":8000.0,\"token\":\"abc\"}"),
            ReadyLine::Ready(Ready {
                port: 8000,
                token: "abc".to_string()
            })
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY not-json"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":0,\"token\":\"abc\"}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":\"8000\",\"token\":\"abc\"}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":8000}"),
            ReadyLine::Invalid
        );
        assert_eq!(
            parse_ready_line("JAIT_EVAL_READY {\"port\":8000.5,\"token\":\"abc\"}"),
            ReadyLine::Invalid
        );
    }

    #[test]
    fn ready_line_round_trips() {
        let line = ready_line(4321, "tok");
        assert_eq!(
            parse_ready_line(&line),
            ReadyLine::Ready(Ready {
                port: 4321,
                token: "tok".to_string()
            })
        );
    }

    #[test]
    fn tails_are_character_bounded() {
        assert_eq!(tail_chars("abcdef", 4), "cdef");
        assert_eq!(tail_chars("abc", 4), "abc");
        assert_eq!(tail_chars("äöüß", 2), "üß");
    }

    #[test]
    fn error_messages_are_byte_identical() {
        assert_eq!(
            EvalError::SettingsHttp(503).message(),
            "Cannot read evaluation backend settings: HTTP 503"
        );
        assert_eq!(
            EvalError::NotStarted {
                stderr: "boom\n".to_string()
            }
            .message(),
            "Isolated evaluation gateway did not start. boom\n"
        );
        assert_eq!(
            EvalError::Cancelled.message(),
            "Evaluation cancelled during isolated gateway startup"
        );
        assert_eq!(
            EvalError::InvalidReadiness.message(),
            "Invalid isolated gateway readiness"
        );
    }

    #[test]
    fn isolation_guard_requires_matching_paths() {
        assert!(validate_isolation("/tmp/x", "/tmp/x/data/jait.db").is_ok());
        assert_eq!(
            validate_isolation("/tmp/x", "/tmp/y/data/jait.db").unwrap_err(),
            "Evaluation database isolation required"
        );
        assert_eq!(
            validate_isolation("", "/tmp/x/data/jait.db").unwrap_err(),
            "Evaluation database isolation required"
        );
    }

    #[test]
    fn settings_payload_round_trips_through_child_parser() {
        let payload = json!({
            "jait_backend": "anthropic",
            "selected_model": "claude",
            "api_keys": { "anthropic": "k" },
            "extra_flag": true
        });
        let parsed = EvaluationSettings::parse(&payload.to_string()).expect("parses");
        assert_eq!(parsed.jait_backend.as_deref(), Some("anthropic"));
        assert_eq!(parsed.selected_model.as_deref(), Some("claude"));
        assert!(parsed.extra.contains_key("extra_flag"));
        assert!(EvaluationSettings::parse("{not json").is_err());
    }

    #[tokio::test]
    async fn start_writes_settings_and_returns_ready_gateway() {
        let harness = harness(
            Ok(json!({ "jait_backend": "openai", "selected_model": "gpt" })),
            ChildScript::ready(8123, "eval-token"),
        );
        let mut gateway = start_isolated_gateway(harness.host.clone(), source(), fast())
            .await
            .expect("start should succeed");
        assert_eq!(gateway.gateway, "http://127.0.0.1:8123");
        assert_eq!(gateway.token, "eval-token");
        assert_eq!(gateway.state, PathBuf::from("/tmp/jait-eval-state-test"));
        assert_eq!(*harness.fetches.lock().unwrap(), 1);
        assert_eq!(
            harness.stdin.lock().unwrap().as_slice(),
            ["{\"jait_backend\":\"openai\",\"selected_model\":\"gpt\"}".to_string()]
        );
        let spec = harness.specs.lock().unwrap()[0].clone();
        assert_eq!(spec.args, vec![CHILD_BOOTSTRAP_ARG.to_string()]);
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "JWT_SECRET" && value == "test-uuid"));
        assert!(spec
            .env
            .iter()
            .any(|(key, value)| key == "JAIT_DB_PATH"
                && value == "/tmp/jait-eval-state-test/data/jait.db"));

        gateway.stop().await;
        assert_eq!(harness.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        assert_eq!(
            harness.removed.lock().unwrap().as_slice(),
            [PathBuf::from("/tmp/jait-eval-state-test")]
        );
        gateway.stop().await;
        assert_eq!(harness.signals.lock().unwrap().len(), 1);
        assert_eq!(harness.removed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn invalid_readiness_is_reported_and_cleaned_up() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: vec!["noisy\n".to_string()],
                lines: vec!["JAIT_EVAL_READY {oops".to_string()],
                close_early: false,
                close_after_ms: Some(1),
            },
        );
        let error = start_isolated_gateway(harness.host.clone(), source(), fast())
            .await
            .err()
            .expect("must fail");
        assert_eq!(error, EvalError::InvalidReadiness);
        assert!(harness.signals.lock().unwrap().contains(&ChildSignal::Term));
        assert_eq!(
            harness.removed.lock().unwrap().as_slice(),
            [PathBuf::from("/tmp/jait-eval-state-test")]
        );
    }

    #[tokio::test]
    async fn early_exit_reports_stderr_tail() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: vec!["booting\n".to_string(), "fatal: no db\n".to_string()],
                lines: vec!["starting".to_string()],
                close_early: true,
                close_after_ms: None,
            },
        );
        let error = start_isolated_gateway(harness.host.clone(), source(), fast())
            .await
            .err()
            .expect("must fail");
        match &error {
            EvalError::NotStarted { stderr } => assert_eq!(stderr, "booting\nfatal: no db\n"),
            other => panic!("unexpected error: {other:?}"),
        }
        assert_eq!(
            error.message(),
            "Isolated evaluation gateway did not start. booting\nfatal: no db\n"
        );
    }

    #[tokio::test]
    async fn readiness_timeout_is_reported() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: Vec::new(),
                close_early: false,
                close_after_ms: Some(200),
            },
        );
        let options = IsolatedOptions {
            ready_timeout_ms: 30,
            kill_grace_ms: 20,
        };
        let error = start_isolated_gateway(harness.host.clone(), source(), options)
            .await
            .err()
            .expect("must fail");
        assert_eq!(
            error,
            EvalError::NotStarted {
                stderr: String::new()
            }
        );
        assert!(harness.signals.lock().unwrap().contains(&ChildSignal::Term));
    }

    #[tokio::test]
    async fn settings_failure_aborts_before_state_is_created() {
        let harness = harness(
            Err(EvalError::SettingsHttp(401)),
            ChildScript::ready(1, "unused"),
        );
        let error = start_isolated_gateway(harness.host.clone(), source(), fast())
            .await
            .err()
            .expect("must fail");
        assert_eq!(error, EvalError::SettingsHttp(401));
        assert!(harness.dirs.lock().unwrap().is_empty());
        assert!(harness.specs.lock().unwrap().is_empty());
        assert!(harness.removed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn abort_signal_short_circuits_startup() {
        let harness = harness(Ok(json!({})), ChildScript::ready(1, "unused"));
        let (tx, rx) = watch::channel(true);
        let error = start_isolated_gateway(
            harness.host.clone(),
            Source {
                gateway: "http://127.0.0.1:1".to_string(),
                token: "t".to_string(),
                signal: Some(rx),
            },
            fast(),
        )
        .await
        .err()
        .expect("must fail");
        assert_eq!(error, EvalError::Cancelled);
        assert_eq!(*harness.fetches.lock().unwrap(), 0);
        drop(tx);
    }

    #[tokio::test]
    async fn dropped_unaborted_sender_does_not_cancel_startup() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: Vec::new(),
                close_early: false,
                close_after_ms: None,
            },
        );
        let (tx, rx) = watch::channel(false);
        drop(tx);
        let error = start_isolated_gateway(
            harness.host.clone(),
            Source {
                gateway: "http://127.0.0.1:1".to_string(),
                token: "t".to_string(),
                signal: Some(rx),
            },
            IsolatedOptions { ready_timeout_ms: 30, kill_grace_ms: 20 },
        )
        .await
        .err()
        .expect("must time out");
        assert_eq!(error, EvalError::NotStarted { stderr: String::new() });
    }

    #[tokio::test]
    async fn abort_signal_during_startup_cancels_and_cleans_up() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: Vec::new(),
                close_early: false,
                close_after_ms: None,
            },
        );
        let (tx, rx) = watch::channel(false);
        let handle = {
            let host = harness.host.clone();
            tokio::spawn(async move {
                start_isolated_gateway(
                    host,
                    Source {
                        gateway: "http://127.0.0.1:1".to_string(),
                        token: "t".to_string(),
                        signal: Some(rx),
                    },
                    IsolatedOptions {
                        ready_timeout_ms: 5_000,
                        kill_grace_ms: 20,
                    },
                )
                .await
                .err()
            })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;
        let _ = tx.send(true);
        let error = handle.await.expect("join").expect("must fail");
        assert_eq!(error, EvalError::Cancelled);
        assert!(harness.signals.lock().unwrap().contains(&ChildSignal::Term));
        assert_eq!(
            harness.removed.lock().unwrap().as_slice(),
            [PathBuf::from("/tmp/jait-eval-state-test")]
        );
    }

    #[tokio::test]
    async fn stop_escalates_to_sigkill_when_child_lingers() {
        let harness = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: vec![ready_line(9000, "tok")],
                close_early: false,
                close_after_ms: Some(60),
            },
        );
        let options = IsolatedOptions {
            ready_timeout_ms: 500,
            kill_grace_ms: 5,
        };
        let mut gateway = start_isolated_gateway(harness.host.clone(), source(), options)
            .await
            .expect("starts");
        gateway.stop().await;
        assert_eq!(
            harness.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
    }
}
