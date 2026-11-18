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
    /// Identity used to associate the child with its prepared state.
    pub operation: String,
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
    /// Signals only after the host proves the child and every effect that can
    /// access its state have stopped. Direct-child exit, an error notification,
    /// or a closed control channel alone is not sufficient. Dropping the sender
    /// conveys an inconclusive outcome and must not authorize state removal.
    pub closed: oneshot::Receiver<()>,
    /// Carries the child `error` message, if the process could not run.
    pub error: mpsc::UnboundedReceiver<String>,
    pub control: Box<dyn ChildControl>,
}

/// A spawn error must describe whether a child may still exist. If a child
/// exists, its control and exit notification remain owned by the caller.
pub enum SpawnFailure {
    NoChild(EvalError),
    Child {
        error: EvalError,
        child: SpawnedChild,
    },
    Unknown(EvalError),
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
    /// Create state for an operation identity chosen before any side effect.
    /// Hosts implementing reconciliation must persist the association before
    /// creating state. The legacy default cannot reconcile uncertain outcomes.
    fn make_state_dir_for<'a>(
        &'a self,
        _operation: &'a str,
    ) -> HostFuture<'a, Result<PathBuf, EvalError>> {
        self.make_state_dir()
    }
    /// Confirm the operation has no remaining state, removing it if needed.
    /// An error or cancellation is inconclusive. Implementations must be safe
    /// to retry and must not remove state belonging to any other operation.
    fn reconcile_state_creation<'a>(
        &'a self,
        _operation: &'a str,
    ) -> HostFuture<'a, Result<(), EvalError>> {
        Box::pin(async {
            Err(EvalError::Child(
                "state creation reconciliation unavailable".into(),
            ))
        })
    }
    /// Reconcile an uncertain spawn and remove its state only after proving that
    /// the operation and every effect it could start have stopped. Success means
    /// both shutdown and removal are complete. Errors, panics and cancellation
    /// are inconclusive; implementations must be idempotent and must never act
    /// on state belonging to another operation. The default remains fail-closed.
    fn reconcile_unknown_spawn<'a>(
        &'a self,
        _operation: &'a str,
        _state: &'a Path,
    ) -> HostFuture<'a, Result<(), EvalError>> {
        Box::pin(async {
            Err(EvalError::Child(
                "unknown spawn reconciliation unavailable".into(),
            ))
        })
    }
    /// Recursively delete the state directory, ignoring absence.
    fn remove_state_dir(&self, dir: PathBuf) -> HostFuture<'_, Result<(), EvalError>>;
    /// Spawn the child gateway process, returning ownership on partial failure.
    /// Use `Unknown` if the host cannot prove that no child exists.
    fn spawn_child<'a>(
        &'a self,
        spec: &'a ChildSpec,
    ) -> HostFuture<'a, Result<SpawnedChild, SpawnFailure>>;
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
    exit_confirmed: bool,
    term_deadline: Option<tokio::time::Instant>,
    kill_sent: bool,
}

/// A dropped notification sender is not evidence that the process exited.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExitObservation {
    Confirmed,
    TimedOut,
    Lost,
}

async fn wait_closed(
    closed: &mut Option<oneshot::Receiver<()>>,
    grace: Duration,
) -> ExitObservation {
    let Some(rx) = closed.as_mut() else {
        return ExitObservation::Lost;
    };
    match tokio::time::timeout(grace, &mut *rx).await {
        Ok(result) => {
            *closed = None;
            if result.is_ok() {
                ExitObservation::Confirmed
            } else {
                ExitObservation::Lost
            }
        }
        Err(_) => ExitObservation::TimedOut,
    }
}

// A lost notification is not an exit. Preserve the TERM grace before
// escalating, even if the receiver disappeared or an earlier attempt was cancelled.
async fn wait_until_term_deadline(
    closed: &mut Option<oneshot::Receiver<()>>,
    deadline: tokio::time::Instant,
) -> ExitObservation {
    let result = wait_closed(
        closed,
        deadline.saturating_duration_since(tokio::time::Instant::now()),
    )
    .await;
    if result == ExitObservation::Lost {
        tokio::time::sleep_until(deadline).await;
        ExitObservation::TimedOut
    } else {
        result
    }
}

async fn closed_signal(closed: &mut Option<oneshot::Receiver<()>>) -> bool {
    match closed.as_mut() {
        Some(rx) => rx.await.is_ok(),
        None => std::future::pending::<bool>().await,
    }
}

impl IsolatedGateway {
    /// Returns false when exit or state removal cannot be confirmed. The state
    /// directory is retained unless a child exit has been explicitly observed.
    pub async fn stop(&mut self) -> bool {
        if self.stopped {
            return true;
        }
        if !self.exit_confirmed {
            let grace = Duration::from_millis(self.kill_grace_ms);
            let deadline = *self.term_deadline.get_or_insert_with(|| {
                self.control.kill(ChildSignal::Term);
                tokio::time::Instant::now() + grace
            });
            let mut observation = if self.kill_sent {
                ExitObservation::TimedOut
            } else {
                wait_until_term_deadline(&mut self.closed, deadline).await
            };
            if observation == ExitObservation::TimedOut {
                if !self.kill_sent {
                    self.control.kill(ChildSignal::Kill);
                    self.kill_sent = true;
                }
                observation = wait_closed(&mut self.closed, grace).await;
            }
            if observation != ExitObservation::Confirmed {
                return false;
            }
            self.exit_confirmed = true;
        }
        if self
            .host
            .remove_state_dir(self.state.clone())
            .await
            .is_err()
        {
            return false;
        }
        self.stopped = true;
        true
    }
}

impl Drop for IsolatedGateway {
    fn drop(&mut self) {
        // Best-effort, matching the TS `stop` being wired into teardown paths.
        if !self.stopped && !self.exit_confirmed {
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
        ("LLM_PROVIDER".to_string(), backend_from_settings(settings)),
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

// Movable ownership of a failed startup. A supervisor must retain this value
// until cleanup succeeds; dropping it does not prove the child has exited.
struct StartupCleanup {
    host: Arc<dyn IsolatedGatewayHost>,
    control: Box<dyn ChildControl>,
    closed: Option<oneshot::Receiver<()>>,
    exit_confirmed: bool,
    state: PathBuf,
    kill_grace_ms: u64,
    term_deadline: Option<tokio::time::Instant>,
    kill_sent: bool,
}

impl StartupCleanup {
    async fn attempt(&mut self) -> bool {
        if !self.exit_confirmed {
            let grace = Duration::from_millis(self.kill_grace_ms);
            let deadline = *self.term_deadline.get_or_insert_with(|| {
                self.control.kill(ChildSignal::Term);
                tokio::time::Instant::now() + grace
            });
            let mut observation = if self.kill_sent {
                ExitObservation::TimedOut
            } else {
                wait_until_term_deadline(&mut self.closed, deadline).await
            };
            if observation == ExitObservation::TimedOut {
                if !self.kill_sent {
                    self.control.kill(ChildSignal::Kill);
                    self.kill_sent = true;
                }
                observation = wait_closed(&mut self.closed, grace).await;
            }
            self.exit_confirmed = observation == ExitObservation::Confirmed;
        }
        self.exit_confirmed && self.host.remove_state_dir(self.state.clone()).await.is_ok()
    }
}

/// Bounded storage for startup resources that still need reconciliation.
/// Slots are reserved before host side effects; an unknown child is never
/// treated as proof of exit. This registry is in-memory and must be owned by
/// the runtime, which is also responsible for recovery after runtime failure.
pub struct StartupRecoveryRegistry {
    slots: Vec<Arc<tokio::sync::Mutex<StartupRecoveryEntry>>>,
    next_retry: std::sync::atomic::AtomicUsize,
}

enum StartupRecoveryEntry {
    Free,
    Reserved,
    UnknownState {
        host: Arc<dyn IsolatedGatewayHost>,
        operation: String,
    },
    StateOnly {
        host: Arc<dyn IsolatedGatewayHost>,
        state: PathBuf,
    },
    Child(StartupCleanup),
    Unknown {
        state: PathBuf,
        host: Arc<dyn IsolatedGatewayHost>,
        operation: String,
    },
    Running {
        identity: Arc<()>,
        gateway: IsolatedGateway,
    },
    Recovering {
        identity: Arc<()>,
        gateway: IsolatedGateway,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupRecoveryStatus {
    /// A cleanup or transition currently holds this slot.
    Busy,
    Reserved,
    /// State creation may have had effects, but no path was returned.
    UnknownState,
    StateOnly(PathBuf),
    Child(PathBuf),
    Unknown(PathBuf),
    Running(PathBuf),
    Recovering(PathBuf),
}

impl StartupRecoveryRegistry {
    pub fn new(capacity: usize) -> Self {
        Self {
            slots: (0..capacity)
                .map(|_| Arc::new(tokio::sync::Mutex::new(StartupRecoveryEntry::Free)))
                .collect(),
            next_retry: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    // Never waits for a busy slot: exhaustion is reported before effects begin.
    fn reserve(&self) -> Option<Arc<tokio::sync::Mutex<StartupRecoveryEntry>>> {
        for slot in &self.slots {
            if let Ok(mut entry) = slot.try_lock()
                && matches!(*entry, StartupRecoveryEntry::Free)
            {
                *entry = StartupRecoveryEntry::Reserved;
                return Some(slot.clone());
            }
        }
        None
    }

    /// Snapshot retained resources without waiting for an in-flight operation.
    /// Busy slots are reported without their paths, which are private topology.
    pub async fn status(&self) -> Vec<StartupRecoveryStatus> {
        let mut result = Vec::new();
        for slot in &self.slots {
            let Ok(entry) = slot.try_lock() else {
                result.push(StartupRecoveryStatus::Busy);
                continue;
            };
            match &*entry {
                StartupRecoveryEntry::Free => {}
                StartupRecoveryEntry::Reserved => result.push(StartupRecoveryStatus::Reserved),
                StartupRecoveryEntry::UnknownState { .. } => {
                    result.push(StartupRecoveryStatus::UnknownState)
                }
                StartupRecoveryEntry::StateOnly { state, .. } => {
                    result.push(StartupRecoveryStatus::StateOnly(state.clone()))
                }
                StartupRecoveryEntry::Child(cleanup) => {
                    result.push(StartupRecoveryStatus::Child(cleanup.state.clone()))
                }
                StartupRecoveryEntry::Unknown { state, .. } => {
                    result.push(StartupRecoveryStatus::Unknown(state.clone()))
                }
                StartupRecoveryEntry::Running { gateway, .. } => {
                    result.push(StartupRecoveryStatus::Running(gateway.state.clone()))
                }
                StartupRecoveryEntry::Recovering { gateway, .. } => {
                    result.push(StartupRecoveryStatus::Recovering(gateway.state.clone()))
                }
            }
        }
        result
    }

    /// Retry known cleanup within both a per-slot limit and a total sweep budget.
    /// Timed-out entries are retained. Removal and reconciliation must be
    /// idempotent and safe to retry after cancellation of their futures.
    pub async fn retry_with_budget(&self, per_slot: Duration, total: Duration) {
        let count = self.slots.len();
        if count == 0 || total.is_zero() {
            return;
        }
        let start = self
            .next_retry
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            % count;
        let deadline = tokio::time::Instant::now() + total;
        for offset in 0..count {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            let slot = &self.slots[(start + offset) % count];
            let Ok(mut entry) = slot.try_lock() else {
                continue;
            };
            let attempt = async {
                match &mut *entry {
                    StartupRecoveryEntry::UnknownState { host, operation } => {
                        host.reconcile_state_creation(operation).await.is_ok()
                    }
                    StartupRecoveryEntry::Unknown {
                        host,
                        operation,
                        state,
                    } => host.reconcile_unknown_spawn(operation, state).await.is_ok(),
                    StartupRecoveryEntry::StateOnly { host, state } => {
                        host.remove_state_dir(state.clone()).await.is_ok()
                    }
                    StartupRecoveryEntry::Child(cleanup) => cleanup.attempt().await,
                    StartupRecoveryEntry::Recovering { gateway, .. } => gateway.stop().await,
                    _ => false,
                }
            };
            if matches!(
                tokio::time::timeout(per_slot.min(remaining), attempt).await,
                Ok(true)
            ) {
                *entry = StartupRecoveryEntry::Free;
            }
        }
    }

    /// Retain the per-slot API while bounding the whole sweep as well.
    pub async fn retry_with_timeout(&self, per_slot: Duration) {
        self.retry_with_budget(per_slot, per_slot).await;
    }

    /// Retry for at most 30 seconds in total. Busy and unknown entries remain.
    pub async fn retry(&self) {
        self.retry_with_timeout(Duration::from_secs(30)).await;
    }
}

/// Start an isolated evaluation gateway and wait for its readiness handshake.
pub async fn start_isolated_gateway(
    host: Arc<dyn IsolatedGatewayHost>,
    source: Source,
    options: IsolatedOptions,
) -> Result<IsolatedGateway, EvalError> {
    let mut entry = StartupRecoveryEntry::Reserved;
    start_isolated_gateway_owned(host, source, options, &mut entry).await
}

// The caller owns and retains the entry across all awaits. A future backed by a
// registry slot must keep that slot reserved until the returned lease is stored.
async fn start_isolated_gateway_owned(
    host: Arc<dyn IsolatedGatewayHost>,
    source: Source,
    options: IsolatedOptions,
    entry: &mut StartupRecoveryEntry,
) -> Result<IsolatedGateway, EvalError> {
    if is_aborted(&source.signal) {
        *entry = StartupRecoveryEntry::Free;
        return Err(EvalError::Cancelled);
    }
    // Settings retrieval precedes creation of locally owned resources. Catch
    // a host panic here so it cannot strand the reserved capacity indefinitely.
    let settings =
        match futures_util::FutureExt::catch_unwind(std::panic::AssertUnwindSafe(async {
            host.fetch_settings(&source.gateway, &source.token).await
        }))
        .await
        {
            Ok(Ok(settings)) => settings,
            Ok(Err(error)) => {
                *entry = StartupRecoveryEntry::Free;
                return Err(error);
            }
            Err(_) => {
                *entry = StartupRecoveryEntry::Free;
                return Err(EvalError::Child("settings retrieval panicked".into()));
            }
        };
    // A failed or interrupted host operation may have created a directory.
    // Retain the reservation until the host can reconcile that unknown effect.
    // Recovery identities must not consume the host's token-secret sequence.
    let operation = uuid::Uuid::new_v4().to_string();
    *entry = StartupRecoveryEntry::UnknownState {
        host: host.clone(),
        operation: operation.clone(),
    };
    let state = match host.make_state_dir_for(&operation).await {
        Ok(state) => state,
        Err(error) => {
            return Err(EvalError::Child(format!(
                "{}; state creation outcome unknown",
                error.message()
            )));
        }
    };
    // Before spawn begins, only the state directory needs cleanup, including
    // when preparing the child panics.
    *entry = StartupRecoveryEntry::StateOnly {
        host: host.clone(),
        state: state.clone(),
    };
    let jwt_secret = host.new_uuid();
    let env = build_child_env(&host.base_env(), &settings, &state, &jwt_secret);
    let spec = ChildSpec {
        operation,
        program: std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "jait-gateway".to_string()),
        args: vec![CHILD_BOOTSTRAP_ARG.to_string()],
        env,
    };
    // A dropped or panicking spawn future cannot prove that no child exists.
    *entry = StartupRecoveryEntry::Unknown {
        state: state.clone(),
        host: host.clone(),
        operation: spec.operation.clone(),
    };
    let child = match host.spawn_child(&spec).await {
        Ok(child) => child,
        Err(SpawnFailure::NoChild(error)) => {
            *entry = StartupRecoveryEntry::StateOnly {
                host: host.clone(),
                state: state.clone(),
            };
            return match host.remove_state_dir(state.clone()).await {
                Ok(()) => {
                    *entry = StartupRecoveryEntry::Free;
                    Err(error)
                }
                Err(_) => Err(EvalError::Child(format!(
                    "{}; state cleanup failed; retained {}",
                    error.message(),
                    state.display()
                ))),
            };
        }
        Err(SpawnFailure::Unknown(error)) => {
            return Err(EvalError::Child(format!(
                "{}; child ownership unconfirmed; retained {}",
                error.message(),
                state.display()
            )));
        }
        Err(SpawnFailure::Child { error, child }) => {
            *entry = StartupRecoveryEntry::Child(StartupCleanup {
                host,
                control: child.control,
                closed: Some(child.closed),
                exit_confirmed: false,
                state: state.clone(),
                kill_grace_ms: options.kill_grace_ms,
                term_deadline: None,
                kill_sent: false,
            });
            let StartupRecoveryEntry::Child(cleanup) = entry else {
                unreachable!()
            };
            let cleaned = cleanup.attempt().await;
            if cleaned {
                *entry = StartupRecoveryEntry::Free;
            }
            return if cleaned {
                Err(error)
            } else {
                Err(EvalError::Child(format!(
                    "{}; child exit or state cleanup unconfirmed; retained {}",
                    error.message(),
                    state.display()
                )))
            };
        }
    };
    let payload = serde_json::to_string(&settings).unwrap_or_else(|_| "null".to_string());
    *entry = StartupRecoveryEntry::Child(StartupCleanup {
        host: host.clone(),
        control: child.control,
        closed: Some(child.closed),
        exit_confirmed: false,
        state: state.clone(),
        kill_grace_ms: options.kill_grace_ms,
        term_deadline: None,
        kill_sent: false,
    });

    let deadline = Duration::from_millis(options.ready_timeout_ms);
    let mut stderr_tail = String::new();
    let mut buffer = String::new();
    let StartupRecoveryEntry::Child(cleanup) = entry else {
        unreachable!()
    };
    cleanup.control.end_stdin(&payload);
    let mut error = child.error;
    let mut error_open = true;
    let mut stdout = child.stdout;
    let mut stdout_open = true;
    let mut stderr = child.stderr;
    let mut stderr_open = true;

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
                    confirmed = closed_signal(&mut cleanup.closed) => {
                        cleanup.exit_confirmed = confirmed;
                        cleanup.closed = None;
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
        Ok(info) => {
            let StartupRecoveryEntry::Child(cleanup) =
                std::mem::replace(entry, StartupRecoveryEntry::Reserved)
            else {
                unreachable!()
            };
            Ok(IsolatedGateway {
                gateway: format!("http://127.0.0.1:{}", info.port),
                token: info.token,
                state,
                host: cleanup.host,
                control: cleanup.control,
                closed: cleanup.closed,
                kill_grace_ms: options.kill_grace_ms,
                stopped: false,
                exit_confirmed: cleanup.exit_confirmed,
                term_deadline: cleanup.term_deadline,
                kill_sent: cleanup.kill_sent,
            })
        }
        Err(error) => {
            let StartupRecoveryEntry::Child(cleanup) = entry else {
                unreachable!()
            };
            let cleaned = cleanup.attempt().await;
            if cleaned {
                *entry = StartupRecoveryEntry::Free;
            }
            if cleaned {
                Err(error)
            } else {
                Err(EvalError::Child(format!(
                    "{}; child exit or state cleanup unconfirmed; retained {}",
                    error.message(),
                    state.display()
                )))
            }
        }
    }
}

/// A registry-backed lease. The registry must outlive the lease and runtime.
pub struct RegistryGateway {
    slot: Arc<tokio::sync::Mutex<StartupRecoveryEntry>>,
    identity: Arc<()>,
    pub gateway: String,
    pub token: String,
    runtime: tokio::runtime::Handle,
}

async fn registry_shutdown(
    slot: Arc<tokio::sync::Mutex<StartupRecoveryEntry>>,
    identity: Arc<()>,
) -> bool {
    let mut entry = slot.lock().await;
    let owned = match &*entry {
        StartupRecoveryEntry::Running {
            identity: current, ..
        }
        | StartupRecoveryEntry::Recovering {
            identity: current, ..
        } => Arc::ptr_eq(current, &identity),
        _ => false,
    };
    if !owned {
        return true;
    }
    if matches!(*entry, StartupRecoveryEntry::Running { .. }) {
        let StartupRecoveryEntry::Running { identity, gateway } =
            std::mem::replace(&mut *entry, StartupRecoveryEntry::Reserved)
        else {
            unreachable!()
        };
        *entry = StartupRecoveryEntry::Recovering { identity, gateway };
    }
    let StartupRecoveryEntry::Recovering { gateway, .. } = &mut *entry else {
        unreachable!()
    };
    if gateway.stop().await {
        *entry = StartupRecoveryEntry::Free;
        true
    } else {
        false
    }
}

impl RegistryGateway {
    /// Spawn cleanup independently so cancellation of this waiter retains ownership.
    pub async fn stop(&mut self) -> bool {
        let slot = self.slot.clone();
        let identity = self.identity.clone();
        let task = self
            .runtime
            .spawn(async move { registry_shutdown(slot, identity).await });
        task.await.unwrap_or(false)
    }
}
impl Drop for RegistryGateway {
    fn drop(&mut self) {
        let slot = self.slot.clone();
        let identity = self.identity.clone();
        self.runtime.spawn(async move {
            registry_shutdown(slot, identity).await;
        });
    }
}

/// Reserve capacity before host effects; startup continues if the requester drops.
/// The owner must keep `registry` alive for the lifetime of any returned lease.
pub async fn start_registry_gateway(
    registry: Arc<StartupRecoveryRegistry>,
    host: Arc<dyn IsolatedGatewayHost>,
    source: Source,
    options: IsolatedOptions,
) -> Result<RegistryGateway, EvalError> {
    let slot = registry
        .reserve()
        .ok_or_else(|| EvalError::Child("isolated gateway recovery capacity exhausted".into()))?;
    let runtime = tokio::runtime::Handle::current();
    let (sender, receiver) = oneshot::channel();
    tokio::spawn(async move {
        let mut entry = slot.lock().await;
        let result = start_isolated_gateway_owned(host, source, options, &mut entry).await;
        let result = result.map(|gateway| {
            let identity = Arc::new(());
            let lease = RegistryGateway {
                slot: slot.clone(),
                identity: identity.clone(),
                gateway: gateway.gateway.clone(),
                token: gateway.token.clone(),
                runtime,
            };
            *entry = StartupRecoveryEntry::Running { identity, gateway };
            lease
        });
        drop(entry);
        let _ = sender.send(result);
        // Keep the registry alive until startup has handed off or retained failure.
        drop(registry);
    });
    receiver.await.unwrap_or_else(|_| {
        Err(EvalError::Child(
            "isolated gateway owner task failed".into(),
        ))
    })
}

/// A lifecycle lease whose cleanup task outlives a cancelled stop future.
/// The owner task requires a running Tokio runtime; runtime shutdown can still
/// interrupt cleanup, so retained state must be reconciled by the host.
pub struct SupervisedGateway {
    inner: Arc<tokio::sync::Mutex<IsolatedGateway>>,
    gateway: String,
    token: String,
    completion: Option<watch::Receiver<Option<bool>>>,
    runtime: tokio::runtime::Handle,
}

impl SupervisedGateway {
    pub fn gateway(&self) -> Option<&str> {
        self.completion.is_none().then_some(self.gateway.as_str())
    }

    pub fn token(&self) -> Option<&str> {
        self.completion.is_none().then_some(self.token.as_str())
    }

    fn begin_shutdown(&mut self) {
        if self.completion.is_none() {
            let inner = self.inner.clone();
            let (sender, receiver) = watch::channel(None);
            self.completion = Some(receiver);
            self.runtime.spawn(async move {
                let result = inner.lock().await.stop().await;
                let _ = sender.send(Some(result));
            });
        }
    }

    /// Request cleanup and await its result; cancelling the wait does not
    /// cancel cleanup. A later call retries an unsuccessful attempt.
    pub async fn stop(&mut self) -> bool {
        if self.completion.as_ref().is_some_and(|receiver| {
            *receiver.borrow() == Some(false)
                || receiver.has_changed().is_err() && receiver.borrow().is_none()
        }) {
            self.completion = None;
        }
        self.begin_shutdown();
        let receiver = self.completion.as_mut().expect("shutdown started");
        loop {
            if let Some(result) = *receiver.borrow_and_update() {
                return result;
            }
            if receiver.changed().await.is_err() {
                return false;
            }
        }
    }
}

impl Drop for SupervisedGateway {
    fn drop(&mut self) {
        // Queue a cleanup attempt even if another is in flight. The mutex
        // serializes it after that attempt, closing the result-send/drop race;
        // a successful previous stop is idempotent.
        let inner = self.inner.clone();
        self.runtime.spawn(async move {
            let _ = inner.lock().await.stop().await;
        });
    }
}

/// Starts the lifecycle in an owner task so dropping the requesting future does
/// not drop in-flight host side effects. A rejected or subsequently abandoned
/// result drops its lease and starts cleanup on the same runtime.
pub async fn start_supervised_gateway(
    host: Arc<dyn IsolatedGatewayHost>,
    source: Source,
    options: IsolatedOptions,
) -> Result<SupervisedGateway, EvalError> {
    let runtime = tokio::runtime::Handle::current();
    let (sender, receiver) = oneshot::channel();
    tokio::spawn(async move {
        let result = start_isolated_gateway(host, source, options)
            .await
            .map(|inner| SupervisedGateway {
                gateway: inner.gateway.clone(),
                token: inner.token.clone(),
                inner: Arc::new(tokio::sync::Mutex::new(inner)),
                completion: None,
                runtime,
            });
        let _ = sender.send(result);
    });
    receiver.await.unwrap_or_else(|_| {
        Err(EvalError::Child(
            "isolated gateway owner task failed".to_string(),
        ))
    })
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
    if state_dir.is_empty()
        || db_path
            != Path::new(state_dir)
                .join(DB_RELATIVE_PATH)
                .to_string_lossy()
    {
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

    type Script = Arc<dyn Fn() -> Result<SpawnedChild, SpawnFailure> + Send + Sync>;

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
        remove_failures: Arc<Mutex<usize>>,
        state_creation_fails: Arc<Mutex<bool>>,
        panic_uuid: Arc<Mutex<bool>>,
        panic_fetch: Arc<Mutex<bool>>,
        reconcile_enabled: Arc<Mutex<bool>>,
        state_operation: Arc<Mutex<Option<String>>>,
        remove_delay_ms: Arc<Mutex<u64>>,
        remove_attempts: Arc<Mutex<usize>>,
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
            let panic_fetch = *self.panic_fetch.lock().unwrap();
            let _ = (gateway, token);
            Box::pin(async move {
                *fetches.lock().unwrap() += 1;
                assert!(!panic_fetch, "settings retrieval failed");
                result
            })
        }

        fn make_state_dir(&self) -> HostFuture<'_, Result<PathBuf, EvalError>> {
            let dirs = self.dirs.clone();
            let fails = *self.state_creation_fails.lock().unwrap();
            Box::pin(async move {
                let dir = PathBuf::from("/tmp/jait-eval-state-test");
                dirs.lock().unwrap().push(dir.clone());
                if fails {
                    return Err(EvalError::Child(
                        "state creation failed after effect".into(),
                    ));
                }
                Ok(dir)
            })
        }

        fn make_state_dir_for<'a>(
            &'a self,
            operation: &'a str,
        ) -> HostFuture<'a, Result<PathBuf, EvalError>> {
            *self.state_operation.lock().unwrap() = Some(operation.to_owned());
            self.make_state_dir()
        }

        fn reconcile_state_creation<'a>(
            &'a self,
            operation: &'a str,
        ) -> HostFuture<'a, Result<(), EvalError>> {
            Box::pin(async move {
                if !*self.reconcile_enabled.lock().unwrap()
                    || self.state_operation.lock().unwrap().as_deref() != Some(operation)
                {
                    return Err(EvalError::Child("reconciliation unavailable".into()));
                }
                self.remove_state_dir(PathBuf::from("/tmp/jait-eval-state-test"))
                    .await
            })
        }

        fn reconcile_unknown_spawn<'a>(
            &'a self,
            operation: &'a str,
            state: &'a Path,
        ) -> HostFuture<'a, Result<(), EvalError>> {
            Box::pin(async move {
                // The test flag represents a supervisor's affirmative shutdown proof.
                if !*self.reconcile_enabled.lock().unwrap()
                    || self.state_operation.lock().unwrap().as_deref() != Some(operation)
                    || state != Path::new("/tmp/jait-eval-state-test")
                {
                    return Err(EvalError::Child("spawn reconciliation unavailable".into()));
                }
                self.remove_state_dir(state.to_owned()).await
            })
        }

        fn remove_state_dir(&self, dir: PathBuf) -> HostFuture<'_, Result<(), EvalError>> {
            let removed = self.removed.clone();
            let failures = self.remove_failures.clone();
            let delay = *self.remove_delay_ms.lock().unwrap();
            let attempts = self.remove_attempts.clone();
            Box::pin(async move {
                *attempts.lock().unwrap() += 1;
                if delay > 0 {
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                }
                let mut remaining = failures.lock().unwrap();
                if *remaining > 0 {
                    *remaining -= 1;
                    return Err(EvalError::Child("removal failed".into()));
                }
                removed.lock().unwrap().push(dir);
                Ok(())
            })
        }

        fn spawn_child<'a>(
            &'a self,
            spec: &'a ChildSpec,
        ) -> HostFuture<'a, Result<SpawnedChild, SpawnFailure>> {
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
            assert!(!*self.panic_uuid.lock().unwrap(), "token generation failed");
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
                remove_failures: Arc::new(Mutex::new(0)),
                state_creation_fails: Arc::new(Mutex::new(false)),
                panic_uuid: Arc::new(Mutex::new(false)),
                panic_fetch: Arc::new(Mutex::new(false)),
                reconcile_enabled: Arc::new(Mutex::new(false)),
                state_operation: Arc::new(Mutex::new(None)),
                remove_delay_ms: Arc::new(Mutex::new(0)),
                remove_attempts: Arc::new(Mutex::new(0)),
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
    async fn supervised_drop_during_failed_removal_retries() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.remove_failures.lock().unwrap() = 1;
        *h.host.remove_delay_ms.lock().unwrap() = 30;
        let mut gateway = start_supervised_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        gateway.begin_shutdown();
        tokio::time::timeout(Duration::from_millis(200), async {
            while *h.host.remove_attempts.lock().unwrap() == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        drop(gateway);
        tokio::time::timeout(Duration::from_millis(300), async {
            while h.removed.lock().unwrap().is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(*h.host.remove_attempts.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn supervised_stop_restarts_after_owner_channel_closes() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let mut gateway = start_supervised_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        let (sender, receiver) = watch::channel(None);
        drop(sender);
        gateway.completion = Some(receiver);
        assert!(gateway.stop().await);
        assert_eq!(h.removed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn supervised_stop_retries_failed_state_removal() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.remove_failures.lock().unwrap() = 1;
        let mut gateway = start_supervised_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        assert!(!gateway.stop().await);
        assert!(h.removed.lock().unwrap().is_empty());
        assert!(gateway.stop().await);
        assert_eq!(h.removed.lock().unwrap().len(), 1);
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
    }

    #[tokio::test]
    async fn supervised_successful_handoff_drop_cleans_up() {
        let h = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: vec![ready_line(8123, "token")],
                close_early: false,
                close_after_ms: Some(30),
            },
        );
        let options = IsolatedOptions {
            ready_timeout_ms: 100,
            kill_grace_ms: 100,
        };
        let gateway = start_supervised_gateway(h.host.clone(), source(), options)
            .await
            .unwrap();
        drop(gateway);
        tokio::time::timeout(Duration::from_millis(200), async {
            while h.removed.lock().unwrap().is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(h.removed.lock().unwrap().len(), 1);
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
    }

    #[tokio::test]
    async fn supervised_stop_retains_state_when_exit_unconfirmed() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let mut gateway = start_supervised_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        let (sender, receiver) = oneshot::channel();
        {
            let mut inner = gateway.inner.lock().await;
            inner.closed = Some(receiver);
            inner.kill_grace_ms = 2;
        }
        assert!(!gateway.stop().await);
        assert!(h.removed.lock().unwrap().is_empty());
        assert!(h.signals.lock().unwrap().contains(&ChildSignal::Kill));
        drop(sender);
    }

    #[tokio::test]
    async fn supervised_stop_outlives_cancelled_waiter() {
        let h = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: vec![ready_line(8123, "token")],
                close_early: false,
                close_after_ms: Some(40),
            },
        );
        let options = IsolatedOptions {
            ready_timeout_ms: 100,
            kill_grace_ms: 100,
        };
        let mut gateway = start_supervised_gateway(h.host.clone(), source(), options)
            .await
            .unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(5), gateway.stop())
                .await
                .is_err()
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(200), gateway.stop())
                .await
                .unwrap()
        );
        assert_eq!(h.removed.lock().unwrap().len(), 1);
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
    }

    #[tokio::test]
    async fn supervised_start_cleans_up_after_request_is_dropped() {
        let h = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: Vec::new(),
                close_early: false,
                close_after_ms: Some(50),
            },
        );
        let options = IsolatedOptions {
            ready_timeout_ms: 20,
            kill_grace_ms: 100,
        };
        let host = h.host.clone();
        let request =
            tokio::spawn(async move { start_supervised_gateway(host, source(), options).await });
        tokio::time::timeout(Duration::from_millis(200), async {
            while h.specs.lock().unwrap().is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        request.abort();
        tokio::time::timeout(Duration::from_millis(200), async {
            while h.removed.lock().unwrap().is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(h.signals.lock().unwrap().contains(&ChildSignal::Term));
    }

    #[tokio::test]
    async fn cleanup_retains_state_without_confirmed_exit() {
        for sender_lost in [true, false] {
            let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
            let mut gateway = start_isolated_gateway(h.host.clone(), source(), fast())
                .await
                .unwrap();
            let (sender, receiver) = oneshot::channel();
            gateway.closed = Some(receiver);
            gateway.kill_grace_ms = 2;
            let sender = if sender_lost {
                drop(sender);
                None
            } else {
                Some(sender)
            };
            assert!(!gateway.stop().await);
            assert!(h.removed.lock().unwrap().is_empty());
            if !sender_lost {
                assert!(h.signals.lock().unwrap().contains(&ChildSignal::Kill));
            }
            drop(sender);
        }
    }

    #[tokio::test]
    async fn interrupted_running_stop_preserves_termination_deadline() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let mut gateway = start_isolated_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        let (sender, receiver) = oneshot::channel();
        gateway.closed = Some(receiver);
        gateway.kill_grace_ms = 20;
        assert!(
            tokio::time::timeout(Duration::from_millis(2), gateway.stop())
                .await
                .is_err()
        );
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(
            tokio::time::timeout(Duration::from_millis(2), gateway.stop())
                .await
                .is_err()
        );
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        sender.send(()).unwrap();
        assert!(gateway.stop().await);
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
    }

    #[tokio::test]
    async fn lost_running_exit_notification_still_escalates() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let mut gateway = start_isolated_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        let (sender, receiver) = oneshot::channel();
        drop(sender);
        gateway.closed = Some(receiver);
        gateway.kill_grace_ms = 20;
        assert!(
            tokio::time::timeout(Duration::from_millis(2), gateway.stop())
                .await
                .is_err()
        );
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(!gateway.stop().await);
        assert!(!gateway.stop().await);
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
        assert!(h.removed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn cancelled_stop_keeps_drop_termination_armed() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let mut gateway = start_isolated_gateway(h.host.clone(), source(), fast())
            .await
            .unwrap();
        let (_sender, receiver) = oneshot::channel();
        gateway.closed = Some(receiver);
        gateway.kill_grace_ms = 1000;
        assert!(
            tokio::time::timeout(Duration::from_millis(5), gateway.stop())
                .await
                .is_err()
        );
        drop(gateway);
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Term]
        );
        assert!(h.removed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn startup_cleanup_retry_preserves_confirmed_exit() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.remove_failures.lock().unwrap() = 1;
        let (sender, receiver) = oneshot::channel();
        sender.send(()).unwrap();
        let mut cleanup = StartupCleanup {
            host: h.host.clone(),
            control: Box::new(FakeControl {
                stdin: h.stdin.clone(),
                signals: h.signals.clone(),
                killed: Arc::new(Notify::new()),
            }),
            closed: Some(receiver),
            exit_confirmed: false,
            state: PathBuf::from("/fake/state"),
            kill_grace_ms: 5,
            term_deadline: None,
            kill_sent: false,
        };
        assert!(!cleanup.attempt().await);
        assert!(cleanup.exit_confirmed);
        assert!(cleanup.attempt().await);
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        assert_eq!(*h.host.remove_attempts.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn registry_gateway_releases_capacity_after_fetch_panic() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.panic_fetch.lock().unwrap() = true;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        assert!(registry.status().await.is_empty());
        assert!(h.dirs.lock().unwrap().is_empty());
        *h.host.panic_fetch.lock().unwrap() = false;
        let mut lease = start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
            .await
            .unwrap();
        assert!(lease.stop().await);
    }

    #[tokio::test]
    async fn registry_gateway_recovers_pre_spawn_panic() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.panic_uuid.lock().unwrap() = true;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::StateOnly(PathBuf::from(
                "/tmp/jait-eval-state-test"
            ))]
        );
        assert!(h.specs.lock().unwrap().is_empty());
        registry.retry().await;
        assert!(registry.status().await.is_empty());
        assert_eq!(h.removed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn registry_gateway_retains_unknown_state_creation_failure() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.state_creation_fails.lock().unwrap() = true;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::UnknownState]
        );
        registry.retry().await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::UnknownState]
        );
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        assert_eq!(h.dirs.lock().unwrap().len(), 1);
        assert!(h.specs.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn registry_gateway_reconciles_unknown_state_before_reuse() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.state_creation_fails.lock().unwrap() = true;
        *h.host.reconcile_enabled.lock().unwrap() = true;
        *h.host.remove_failures.lock().unwrap() = 1;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        let first_operation = h.host.state_operation.lock().unwrap().clone().unwrap();
        assert_ne!(first_operation, h.host.new_uuid());
        registry.retry().await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::UnknownState]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        registry.retry().await;
        assert!(registry.status().await.is_empty());
        assert_eq!(h.removed.lock().unwrap().len(), 1);
        *h.host.state_creation_fails.lock().unwrap() = false;
        let mut lease = start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
            .await
            .unwrap();
        assert_ne!(
            h.host.state_operation.lock().unwrap().as_ref(),
            Some(&first_operation)
        );
        assert!(lease.stop().await);
    }

    #[tokio::test]
    async fn registry_gateway_stop_outlives_cancelled_waiter() {
        let h = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: vec![ready_line(8123, "token")],
                close_early: false,
                close_after_ms: Some(40),
            },
        );
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        let options = IsolatedOptions {
            ready_timeout_ms: 100,
            kill_grace_ms: 100,
        };
        let mut lease = start_registry_gateway(registry.clone(), h.host.clone(), source(), options)
            .await
            .unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(5), lease.stop())
                .await
                .is_err()
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(200), lease.stop())
                .await
                .unwrap()
        );
        assert!(registry.status().await.is_empty());
        assert_eq!(h.removed.lock().unwrap().len(), 1);
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
    }

    #[tokio::test]
    async fn registry_gateway_cancelled_request_retains_failed_cleanup() {
        let h = harness(
            Ok(json!({})),
            ChildScript {
                stderr: Vec::new(),
                lines: Vec::new(),
                close_early: false,
                close_after_ms: Some(50),
            },
        );
        *h.host.remove_failures.lock().unwrap() = 1;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        let host = h.host.clone();
        let owner = registry.clone();
        let options = IsolatedOptions {
            ready_timeout_ms: 20,
            kill_grace_ms: 100,
        };
        let request =
            tokio::spawn(
                async move { start_registry_gateway(owner, host, source(), options).await },
            );
        tokio::time::timeout(Duration::from_millis(200), async {
            while h.specs.lock().unwrap().is_empty() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        request.abort();
        tokio::time::timeout(Duration::from_millis(300), async {
            loop {
                if matches!(
                    registry.status().await.as_slice(),
                    [StartupRecoveryStatus::Child(_)]
                ) {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(h.removed.lock().unwrap().is_empty());
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        registry.retry().await;
        assert!(registry.status().await.is_empty());
        assert_eq!(h.removed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn registry_gateway_capacity_and_stale_lease_do_not_stop_replacement() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        let mut first = start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
            .await
            .unwrap();
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        assert_eq!(h.dirs.lock().unwrap().len(), 1);
        assert!(first.stop().await);
        let mut second = start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
            .await
            .unwrap();
        drop(first);
        tokio::task::yield_now().await;
        assert!(matches!(
            registry.status().await.as_slice(),
            [StartupRecoveryStatus::Running(_)]
        ));
        assert!(second.stop().await);
    }

    #[tokio::test]
    async fn registry_gateway_retains_failed_stop_for_retry() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        *h.host.remove_failures.lock().unwrap() = 1;
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        let mut lease = start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
            .await
            .unwrap();
        assert!(!lease.stop().await);
        assert!(matches!(
            registry.status().await.as_slice(),
            [StartupRecoveryStatus::Recovering(_)]
        ));
        registry.retry().await;
        assert!(registry.status().await.is_empty());
    }

    #[tokio::test]
    async fn recovery_registry_bounds_and_retries_known_state() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(1);
        let slot = registry.reserve().expect("first reservation");
        assert!(registry.reserve().is_none());
        *h.host.remove_failures.lock().unwrap() = 1;
        *slot.lock().await = StartupRecoveryEntry::StateOnly {
            host: h.host.clone(),
            state: PathBuf::from("/fake/state"),
        };
        registry.retry().await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::StateOnly(PathBuf::from(
                "/fake/state"
            ))]
        );
        assert!(registry.reserve().is_none());
        registry.retry().await;
        assert!(registry.status().await.is_empty());
        assert!(registry.reserve().is_some());
    }

    #[tokio::test]
    async fn recovery_registry_reports_busy_and_retries_other_slots() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(2);
        let busy = registry.reserve().unwrap();
        let other = registry.reserve().unwrap();
        *other.lock().await = StartupRecoveryEntry::StateOnly {
            host: h.host.clone(),
            state: PathBuf::from("/fake/state"),
        };
        let guard = busy.lock().await;
        assert_eq!(registry.status().await[0], StartupRecoveryStatus::Busy);
        registry.retry().await;
        assert_eq!(*h.host.remove_attempts.lock().unwrap(), 1);
        assert_eq!(registry.status().await, vec![StartupRecoveryStatus::Busy]);
        drop(guard);
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::Reserved]
        );
    }

    #[tokio::test]
    async fn recovery_registry_retains_timed_out_removal_for_retry() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(1);
        let slot = registry.reserve().unwrap();
        *slot.lock().await = StartupRecoveryEntry::StateOnly {
            host: h.host.clone(),
            state: PathBuf::from("/fake/state"),
        };
        *h.host.remove_delay_ms.lock().unwrap() = 100;
        registry.retry_with_timeout(Duration::from_millis(1)).await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::StateOnly(PathBuf::from(
                "/fake/state"
            ))]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        *h.host.remove_delay_ms.lock().unwrap() = 0;
        registry
            .retry_with_timeout(Duration::from_millis(100))
            .await;
        assert!(registry.status().await.is_empty());
        assert_eq!(*h.host.remove_attempts.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn recovery_sweep_budget_rotates_past_slow_slot() {
        let slow = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let fast = harness(Ok(json!({})), ChildScript::ready(8124, "token"));
        let registry = StartupRecoveryRegistry::new(2);
        let first = registry.reserve().unwrap();
        let second = registry.reserve().unwrap();
        *first.lock().await = StartupRecoveryEntry::StateOnly {
            host: slow.host.clone(),
            state: PathBuf::from("/fake/slow"),
        };
        *second.lock().await = StartupRecoveryEntry::StateOnly {
            host: fast.host.clone(),
            state: PathBuf::from("/fake/fast"),
        };
        *slow.host.remove_delay_ms.lock().unwrap() = 200;
        registry
            .retry_with_budget(Duration::from_secs(1), Duration::from_millis(10))
            .await;
        assert_eq!(registry.status().await.len(), 2);
        registry
            .retry_with_budget(Duration::from_secs(1), Duration::from_millis(10))
            .await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::StateOnly(PathBuf::from(
                "/fake/slow"
            ))]
        );
        assert_eq!(*fast.host.remove_attempts.lock().unwrap(), 1);
    }

    #[tokio::test]
    async fn interrupted_recovery_preserves_termination_deadline() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(1);
        let slot = registry.reserve().unwrap();
        let (sender, receiver) = oneshot::channel();
        *slot.lock().await = StartupRecoveryEntry::Child(StartupCleanup {
            host: h.host.clone(),
            control: Box::new(FakeControl {
                stdin: h.stdin.clone(),
                signals: h.signals.clone(),
                killed: Arc::new(Notify::new()),
            }),
            closed: Some(receiver),
            exit_confirmed: false,
            state: PathBuf::from("/fake/state"),
            kill_grace_ms: 20,
            term_deadline: None,
            kill_sent: false,
        });
        registry.retry_with_timeout(Duration::from_millis(2)).await;
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        tokio::time::sleep(Duration::from_millis(25)).await;
        registry.retry_with_timeout(Duration::from_millis(2)).await;
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        sender.send(()).unwrap();
        registry.retry_with_timeout(Duration::from_millis(20)).await;
        assert!(registry.status().await.is_empty());
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
    }

    #[tokio::test]
    async fn lost_recovery_exit_notification_still_escalates() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(1);
        let slot = registry.reserve().unwrap();
        let (sender, receiver) = oneshot::channel();
        drop(sender);
        *slot.lock().await = StartupRecoveryEntry::Child(StartupCleanup {
            host: h.host.clone(),
            control: Box::new(FakeControl {
                stdin: h.stdin.clone(),
                signals: h.signals.clone(),
                killed: Arc::new(Notify::new()),
            }),
            closed: Some(receiver),
            exit_confirmed: false,
            state: PathBuf::from("/fake/state"),
            kill_grace_ms: 20,
            term_deadline: None,
            kill_sent: false,
        });
        registry.retry_with_timeout(Duration::from_millis(2)).await;
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        tokio::time::sleep(Duration::from_millis(25)).await;
        registry.retry_with_timeout(Duration::from_millis(20)).await;
        registry.retry_with_timeout(Duration::from_millis(20)).await;
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::Child(PathBuf::from("/fake/state"))]
        );
        assert!(h.removed.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn recovery_registry_timeout_preserves_confirmed_child_exit() {
        let h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let registry = StartupRecoveryRegistry::new(1);
        let slot = registry.reserve().unwrap();
        let (sender, receiver) = oneshot::channel();
        sender.send(()).unwrap();
        *slot.lock().await = StartupRecoveryEntry::Child(StartupCleanup {
            host: h.host.clone(),
            control: Box::new(FakeControl {
                stdin: h.stdin.clone(),
                signals: h.signals.clone(),
                killed: Arc::new(Notify::new()),
            }),
            closed: Some(receiver),
            exit_confirmed: false,
            state: PathBuf::from("/fake/state"),
            kill_grace_ms: 5,
            term_deadline: None,
            kill_sent: false,
        });
        *h.host.remove_delay_ms.lock().unwrap() = 100;
        registry.retry_with_timeout(Duration::from_millis(1)).await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::Child(PathBuf::from("/fake/state"))]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        *h.host.remove_delay_ms.lock().unwrap() = 0;
        registry
            .retry_with_timeout(Duration::from_millis(100))
            .await;
        assert!(registry.status().await.is_empty());
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
    }

    #[tokio::test]
    async fn recovery_registry_never_removes_unknown_state() {
        let mut h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        Arc::get_mut(&mut h.host).unwrap().script = Arc::new(|| {
            Err(SpawnFailure::Unknown(EvalError::Child(
                "unknown spawn".into(),
            )))
        });
        let registry = Arc::new(StartupRecoveryRegistry::new(1));
        assert!(
            start_registry_gateway(registry.clone(), h.host.clone(), source(), fast())
                .await
                .is_err()
        );
        let operation = h.host.state_operation.lock().unwrap().clone().unwrap();
        {
            let entry = registry.slots[0].lock().await;
            let StartupRecoveryEntry::Unknown {
                host,
                operation: retained_operation,
                ..
            } = &*entry
            else {
                panic!("unknown spawn must be retained")
            };
            assert_eq!(retained_operation, &operation);
            let expected: Arc<dyn IsolatedGatewayHost> = h.host.clone();
            assert!(Arc::ptr_eq(host, &expected));
        }
        registry.retry().await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::Unknown(PathBuf::from(
                "/tmp/jait-eval-state-test"
            ))]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        assert!(registry.reserve().is_none());
        *h.host.reconcile_enabled.lock().unwrap() = true;
        *h.host.remove_delay_ms.lock().unwrap() = 100;
        registry.retry_with_timeout(Duration::from_millis(1)).await;
        assert_eq!(
            registry.status().await,
            vec![StartupRecoveryStatus::Unknown(PathBuf::from(
                "/tmp/jait-eval-state-test"
            ))]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        assert!(registry.reserve().is_none());
        *h.host.remove_delay_ms.lock().unwrap() = 0;
        registry.retry().await;
        assert!(registry.status().await.is_empty());
        assert_eq!(
            h.removed.lock().unwrap().as_slice(),
            [PathBuf::from("/tmp/jait-eval-state-test")]
        );
        assert!(registry.reserve().is_some());
    }

    #[tokio::test]
    async fn spawn_partial_failure_owns_child_until_exit_before_removal() {
        let mut h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let original = h.host.script.clone();
        Arc::get_mut(&mut h.host).unwrap().script = Arc::new(move || {
            let child = original().ok().unwrap();
            Err(SpawnFailure::Child {
                error: EvalError::Child("partial spawn".into()),
                child,
            })
        });
        let result = start_isolated_gateway(h.host.clone(), source(), fast()).await;
        assert!(matches!(result, Err(EvalError::Child(ref message)) if message == "partial spawn"));
        assert_eq!(h.signals.lock().unwrap().as_slice(), [ChildSignal::Term]);
        assert_eq!(h.removed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn spawn_partial_failure_retains_state_when_exit_unconfirmed() {
        let mut h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        let close_sender = Arc::new(Mutex::new(None));
        let held_sender = close_sender.clone();
        let signals = h.signals.clone();
        let stdin = h.stdin.clone();
        Arc::get_mut(&mut h.host).unwrap().script = Arc::new(move || {
            let (_, stdout) = mpsc::unbounded_channel();
            let (_, stderr) = mpsc::unbounded_channel();
            let (_, error_rx) = mpsc::unbounded_channel();
            let (tx, closed) = oneshot::channel();
            *held_sender.lock().unwrap() = Some(tx);
            let control = FakeControl {
                stdin: stdin.clone(),
                signals: signals.clone(),
                killed: Arc::new(Notify::new()),
            };
            Err(SpawnFailure::Child {
                error: EvalError::Child("partial spawn".into()),
                child: SpawnedChild {
                    stdout,
                    stderr,
                    closed,
                    error: error_rx,
                    control: Box::new(control),
                },
            })
        });
        let result = start_isolated_gateway(h.host.clone(), source(), fast()).await;
        assert!(
            matches!(result, Err(EvalError::Child(ref message)) if message.contains("child exit or state cleanup unconfirmed"))
        );
        assert_eq!(
            h.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term, ChildSignal::Kill]
        );
        assert!(h.removed.lock().unwrap().is_empty());
        drop(close_sender);
    }

    #[tokio::test]
    async fn spawn_unknown_failure_retains_state() {
        let mut h = harness(Ok(json!({})), ChildScript::ready(8123, "token"));
        Arc::get_mut(&mut h.host).unwrap().script = Arc::new(|| {
            Err(SpawnFailure::Unknown(EvalError::Child(
                "unknown spawn".into(),
            )))
        });
        let result = start_isolated_gateway(h.host.clone(), source(), fast()).await;
        assert!(
            matches!(result, Err(EvalError::Child(ref message)) if message.contains("child ownership unconfirmed"))
        );
        assert!(h.removed.lock().unwrap().is_empty());
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
        assert_eq!(
            Some(spec.operation.as_str()),
            harness.host.state_operation.lock().unwrap().as_deref()
        );
        assert_eq!(spec.args, vec![CHILD_BOOTSTRAP_ARG.to_string()]);
        assert!(
            spec.env
                .iter()
                .any(|(key, value)| key == "JWT_SECRET" && value == "test-uuid")
        );
        assert!(spec.env.iter().any(|(key, value)| key == "JAIT_DB_PATH"
            && value == "/tmp/jait-eval-state-test/data/jait.db"));

        gateway.stop().await;
        assert_eq!(
            harness.signals.lock().unwrap().as_slice(),
            [ChildSignal::Term]
        );
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
            IsolatedOptions {
                ready_timeout_ms: 30,
                kill_grace_ms: 20,
            },
        )
        .await
        .err()
        .expect("must time out");
        assert_eq!(
            error,
            EvalError::NotStarted {
                stderr: String::new()
            }
        );
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
