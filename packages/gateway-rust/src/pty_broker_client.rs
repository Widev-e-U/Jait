//! Native port of `packages/gateway/src/pty-broker-client.ts`.
//!
//! The TypeScript original drives a Node.js helper subprocess (`pty-broker.mjs`)
//! over newline-delimited JSON: requests are `{"id": n, "cmd": ...}` objects
//! written to the child's stdin, responses/events arrive as JSON lines on
//! stdout, and readiness is announced as `pty-broker ready` on stderr.
//!
//! This port keeps every protocol rule of the original — request-id sequencing,
//! pending-call bookkeeping, event dispatch (`output` / `exit`), the 10s startup
//! timeout, the 15s RPC timeout and the exact error strings — while moving the
//! process I/O behind [`BrokerIo`] so the protocol is testable without spawning a
//! Node subprocess. The caller owns process launching and line pumping: feed
//! stdout lines to [`PtyBrokerClient::handle_line`] and stderr lines to
//! [`PtyBrokerClient::handle_stderr_line`].

use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::sync::oneshot;

/// How long the original waits for `pty-broker ready` on stderr.
pub const STARTUP_TIMEOUT: Duration = Duration::from_millis(10_000);
/// Default per-call RPC timeout (`rpc(cmd, timeoutMs = 15_000)`).
pub const RPC_TIMEOUT: Duration = Duration::from_millis(15_000);

/// Marker the broker prints on stderr once it can accept commands.
const READY_MARKER: &str = "pty-broker ready";

/// Callback invoked when a PTY produces output.
pub type OutputHandler = Arc<dyn Fn(&str, &str) + Send + Sync>;
/// Callback invoked when a PTY process exits, with the default exit code `-1`.
pub type ExitHandler = Arc<dyn Fn(&str, i64, Option<i64>) + Send + Sync>;

/// Transport used to talk to the broker subprocess.
///
/// The original calls `spawn("node", [brokerPath], {stdio: "pipe"})` and writes
/// to `proc.stdin`; the trait mirrors the two operations the protocol needs.
pub trait BrokerIo: Send + Sync {
    /// Write one newline-terminated JSON payload to the broker's stdin.
    fn write(&self, payload: &str) -> Result<(), String>;
    /// Ask the broker process to terminate (`proc.kill("SIGTERM")`).
    fn terminate(&self);
}

/// Errors surfaced by the client, with the original's message strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrokerError {
    /// `PTY broker RPC timeout: <cmd>`
    Timeout { cmd: String },
    /// `PTY broker startup timeout`
    StartupTimeout,
    /// Pending calls rejected by [`PtyBrokerClient::stop`]: `Broker stopping`.
    Stopped,
    /// `resp.error ?? "<cmd> failed"`
    Failure(String),
}

impl BrokerError {
    /// Message text, byte-identical to the TypeScript `Error.message` values.
    pub fn message(&self) -> String {
        match self {
            BrokerError::Timeout { cmd } => format!("PTY broker RPC timeout: {cmd}"),
            BrokerError::StartupTimeout => "PTY broker startup timeout".to_string(),
            BrokerError::Stopped => "Broker stopping".to_string(),
            BrokerError::Failure(message) => message.clone(),
        }
    }
}

impl fmt::Display for BrokerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message())
    }
}

impl std::error::Error for BrokerError {}

/// A message read from the broker: either an event or an RPC response.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrokerResponse {
    /// Present on RPC responses only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    /// `true` on success; absent/false on failure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ok: Option<bool>,
    /// Failure text, when the broker supplied one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// PTY handle assigned by the broker.
    #[serde(
        rename = "ptyId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub pty_id: Option<String>,
    /// OS process id of the spawned shell.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<i64>,
    /// `output` or `exit` for streamed events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    /// Output chunk for `output` events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    /// Exit status for `exit` events.
    #[serde(
        rename = "exitCode",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub exit_code: Option<i64>,
    /// Terminating signal number, when the process was signalled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal: Option<i64>,
}

/// Options accepted by [`PtyBrokerClient::spawn`].
///
/// Every field is optional and omitted from the payload when absent, matching
/// `JSON.stringify` dropping `undefined` properties in the original.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SpawnOptions {
    /// Shell binary to launch.
    pub shell: Option<String>,
    /// Initial terminal width.
    pub cols: Option<u32>,
    /// Initial terminal height.
    pub rows: Option<u32>,
    /// Working directory for the shell.
    pub cwd: Option<String>,
    /// Extra environment variables.
    pub env: Option<Vec<(String, String)>>,
}

/// Result of a successful [`PtyBrokerClient::spawn`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpawnedPty {
    /// Broker-assigned PTY handle.
    pub pty_id: String,
    /// OS process id, when the broker reported one.
    pub pid: Option<i64>,
}

struct Pending {
    sender: oneshot::Sender<BrokerResponse>,
}

struct Inner {
    next_id: u64,
    pending: HashMap<u64, Pending>,
    ready: bool,
    on_output: Option<OutputHandler>,
    on_exit: Option<ExitHandler>,
}

/// Client for the PTY broker subprocess (native port of `PtyBrokerClient`).
pub struct PtyBrokerClient {
    inner: Mutex<Inner>,
    io: Arc<dyn BrokerIo>,
    rpc_timeout: Duration,
}

impl fmt::Debug for PtyBrokerClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        f.debug_struct("PtyBrokerClient")
            .field("next_id", &inner.next_id)
            .field("pending", &inner.pending.len())
            .field("ready", &inner.ready)
            .field("rpc_timeout", &self.rpc_timeout)
            .finish()
    }
}

impl PtyBrokerClient {
    /// Create a client over `io`. The original starts with `nextId = 1`.
    pub fn new(io: Arc<dyn BrokerIo>) -> Self {
        Self {
            inner: Mutex::new(Inner {
                next_id: 1,
                pending: HashMap::new(),
                ready: false,
                on_output: None,
                on_exit: None,
            }),
            io,
            rpc_timeout: RPC_TIMEOUT,
        }
    }

    /// Override the per-call RPC timeout. The default is [`RPC_TIMEOUT`].
    pub fn with_rpc_timeout(mut self, timeout: Duration) -> Self {
        self.rpc_timeout = timeout;
        self
    }

    /// Install the PTY-output callback (`onOutput`).
    pub fn set_output_handler(&self, handler: OutputHandler) {
        self.lock().on_output = Some(handler);
    }

    /// Install the PTY-exit callback (`onExit`).
    pub fn set_exit_handler(&self, handler: ExitHandler) {
        self.lock().on_exit = Some(handler);
    }

    /// Whether the broker has announced readiness.
    pub fn is_ready(&self) -> bool {
        self.lock().ready
    }

    /// Handle one stderr line. Returns `true` when the line marked the broker
    /// ready (`line.includes("pty-broker ready")` in the original).
    pub fn handle_stderr_line(&self, line: &str) -> bool {
        if line.contains(READY_MARKER) {
            self.lock().ready = true;
            return true;
        }
        false
    }

    /// Handle one stdout line: malformed JSON is ignored, as in the original.
    pub fn handle_line(&self, line: &str) {
        let Ok(message) = serde_json::from_str::<BrokerResponse>(line) else {
            return;
        };

        let is_event = message.event.as_deref().is_some_and(|event| !event.is_empty());
        if is_event {
            let event = message.event.clone().unwrap_or_default();
            let pty_id = message
                .pty_id
                .as_deref()
                .filter(|pty_id| !pty_id.is_empty())
                .map(str::to_string);

            if event == "output" {
                if let (Some(pty_id), Some(data)) = (pty_id, message.data.as_deref()) {
                    let handler = self.lock().on_output.clone();
                    if let Some(handler) = handler {
                        handler(&pty_id, data);
                    }
                }
            } else if event == "exit" {
                if let Some(pty_id) = pty_id {
                    let handler = self.lock().on_exit.clone();
                    if let Some(handler) = handler {
                        handler(&pty_id, message.exit_code.unwrap_or(-1), message.signal);
                    }
                }
            }
            return;
        }

        if let Some(id) = message.id {
            let pending = self.lock().pending.remove(&id);
            if let Some(pending) = pending {
                // The caller may already have timed out; the value is dropped.
                let _ = pending.sender.send(message);
            }
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Send one command and await its response.
    async fn rpc(
        &self,
        cmd: &str,
        fields: Vec<(&str, Value)>,
    ) -> Result<BrokerResponse, BrokerError> {
        let (id, receiver, payload) = {
            let mut inner = self.lock();
            let id = inner.next_id;
            inner.next_id += 1;

            let (sender, receiver) = oneshot::channel();
            inner.pending.insert(id, Pending { sender });

            // Key order mirrors `JSON.stringify({ id, ...cmd })`.
            let mut object = Map::new();
            object.insert("id".to_string(), Value::from(id));
            object.insert("cmd".to_string(), Value::from(cmd));
            for (key, value) in fields {
                object.insert(key.to_string(), value);
            }
            let payload = serde_json::to_string(&Value::Object(object))
                .expect("broker payload is always serialisable");
            (id, receiver, format!("{payload}\n"))
        };

        if let Err(message) = self.io.write(&payload) {
            self.lock().pending.remove(&id);
            return Err(BrokerError::Failure(message));
        }

        match tokio::time::timeout(self.rpc_timeout, receiver).await {
            Ok(Ok(response)) => Ok(response),
            // The pending entry was rejected by `stop` (sender dropped).
            Ok(Err(_)) => Err(BrokerError::Stopped),
            Err(_) => {
                self.lock().pending.remove(&id);
                Err(BrokerError::Timeout {
                    cmd: cmd.to_string(),
                })
            }
        }
    }

    /// Check `ok`/`error` on a response, mirroring `if (!resp.ok) throw ...`.
    fn check(response: BrokerResponse, cmd: &str) -> Result<BrokerResponse, BrokerError> {
        if response.ok != Some(true) {
            let message = response
                .error
                .unwrap_or_else(|| format!("{cmd} failed"));
            return Err(BrokerError::Failure(message));
        }
        Ok(response)
    }

    /// Spawn a new PTY process.
    pub async fn spawn(&self, options: &SpawnOptions) -> Result<SpawnedPty, BrokerError> {
        let mut fields: Vec<(&str, Value)> = Vec::new();
        if let Some(shell) = options.shell.as_ref() {
            fields.push(("shell", Value::from(shell.clone())));
        }
        if let Some(cols) = options.cols {
            fields.push(("cols", Value::from(cols)));
        }
        if let Some(rows) = options.rows {
            fields.push(("rows", Value::from(rows)));
        }
        if let Some(cwd) = options.cwd.as_ref() {
            fields.push(("cwd", Value::from(cwd.clone())));
        }
        if let Some(env) = options.env.as_ref() {
            let mut object = Map::new();
            for (key, value) in env {
                object.insert(key.clone(), Value::from(value.clone()));
            }
            fields.push(("env", Value::Object(object)));
        }

        let response = Self::check(self.rpc("spawn", fields).await?, "spawn")?;
        let pty_id = response
            .pty_id
            .filter(|pty_id| !pty_id.is_empty())
            .ok_or_else(|| BrokerError::Failure("spawn failed".to_string()))?;
        Ok(SpawnedPty {
            pty_id,
            pid: response.pid,
        })
    }

    /// Write data to a PTY.
    pub async fn write(&self, pty_id: &str, data: &str) -> Result<(), BrokerError> {
        let fields = vec![
            ("ptyId", Value::from(pty_id.to_string())),
            ("data", Value::from(data.to_string())),
        ];
        Self::check(self.rpc("write", fields).await?, "write")?;
        Ok(())
    }

    /// Resize a PTY.
    pub async fn resize(&self, pty_id: &str, cols: u32, rows: u32) -> Result<(), BrokerError> {
        let fields = vec![
            ("ptyId", Value::from(pty_id.to_string())),
            ("cols", Value::from(cols)),
            ("rows", Value::from(rows)),
        ];
        Self::check(self.rpc("resize", fields).await?, "resize")?;
        Ok(())
    }

    /// Kill a PTY.
    pub async fn kill(&self, pty_id: &str) -> Result<(), BrokerError> {
        let fields = vec![("ptyId", Value::from(pty_id.to_string()))];
        Self::check(self.rpc("kill", fields).await?, "kill")?;
        Ok(())
    }

    /// Stop the broker: reject every pending call and terminate the process.
    pub fn stop(&self) {
        let pending: Vec<Pending> = {
            let mut inner = self.lock();
            inner.ready = false;
            inner.pending.drain().map(|(_, pending)| pending).collect()
        };
        // Dropping the senders rejects each waiter with `Broker stopping`.
        drop(pending);
        self.io.terminate();
    }

    /// Number of calls currently awaiting a response.
    pub fn pending_len(&self) -> usize {
        self.lock().pending.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct RecordingIo {
        payloads: Mutex<Vec<String>>,
        terminated: AtomicUsize,
        failure: Option<String>,
    }

    impl RecordingIo {
        fn failing(message: &str) -> Self {
            Self {
                payloads: Mutex::new(Vec::new()),
                terminated: AtomicUsize::new(0),
                failure: Some(message.to_string()),
            }
        }

        fn payloads(&self) -> Vec<String> {
            self.payloads.lock().unwrap().clone()
        }
    }

    impl BrokerIo for RecordingIo {
        fn write(&self, payload: &str) -> Result<(), String> {
            if let Some(failure) = self.failure.as_ref() {
                return Err(failure.clone());
            }
            self.payloads.lock().unwrap().push(payload.to_string());
            Ok(())
        }

        fn terminate(&self) {
            self.terminated.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn client_with_io(timeout: Option<Duration>) -> (Arc<RecordingIo>, PtyBrokerClient) {
        let io = Arc::new(RecordingIo::default());
        let mut client = PtyBrokerClient::new(io.clone());
        if let Some(timeout) = timeout {
            client = client.with_rpc_timeout(timeout);
        }
        (io, client)
    }

    #[test]
    fn ready_marker_is_detected_from_stderr() {
        let (_, client) = client_with_io(None);
        assert!(!client.is_ready());
        assert!(!client.handle_stderr_line("booting"));
        assert!(client.handle_stderr_line("pty-broker ready"));
        assert!(client.is_ready());
    }

    #[test]
    fn spawn_payload_omits_absent_options() {
        let (io, client) = client_with_io(None);
        let options = SpawnOptions::default();

        let (result, ()) = futures_join(
            client.spawn(&options),
            deliver(&client, r#"{"id":1,"ok":true,"ptyId":"pty-1","pid":7}"#),
        );

        assert_eq!(
            result,
            Ok(SpawnedPty {
                pty_id: "pty-1".to_string(),
                pid: Some(7)
            })
        );
        assert_eq!(io.payloads(), vec!["{\"id\":1,\"cmd\":\"spawn\"}\n"]);
    }

    #[test]
    fn spawn_payload_serialises_every_option_in_order() {
        let (io, client) = client_with_io(None);
        let options = SpawnOptions {
            shell: Some("/bin/bash".to_string()),
            cols: Some(80),
            rows: Some(24),
            cwd: Some("/tmp".to_string()),
            env: Some(vec![
                ("FOO".to_string(), "bar".to_string()),
                ("BAZ".to_string(), "qux".to_string()),
            ]),
        };

        let (result, ()) = futures_join(
            client.spawn(&options),
            deliver(&client, r#"{"id":1,"ok":true,"ptyId":"pty-1","pid":9}"#),
        );

        assert!(result.is_ok());
        assert_eq!(
            io.payloads(),
            vec![
                "{\"id\":1,\"cmd\":\"spawn\",\"shell\":\"/bin/bash\",\"cols\":80,\"rows\":24,\
                 \"cwd\":\"/tmp\",\"env\":{\"FOO\":\"bar\",\"BAZ\":\"qux\"}}\n"
            ]
        );
    }

    #[test]
    fn request_ids_increment_from_one() {
        let (io, client) = client_with_io(None);

        let (first, ()) = futures_join(
            client.kill("pty-1"),
            deliver(&client, r#"{"id":1,"ok":true}"#),
        );
        let (second, ()) = futures_join(
            client.kill("pty-1"),
            deliver(&client, r#"{"id":2,"ok":true}"#),
        );

        assert_eq!(first, Ok(()));
        assert_eq!(second, Ok(()));
        assert_eq!(
            io.payloads(),
            vec![
                "{\"id\":1,\"cmd\":\"kill\",\"ptyId\":\"pty-1\"}\n",
                "{\"id\":2,\"cmd\":\"kill\",\"ptyId\":\"pty-1\"}\n",
            ]
        );
        assert_eq!(client.pending_len(), 0);
    }

    #[test]
    fn output_and_exit_events_reach_handlers() {
        let (_, client) = client_with_io(None);
        let output: Arc<Mutex<Vec<(String, String)>>> = Arc::new(Mutex::new(Vec::new()));
        let exits: Arc<Mutex<Vec<(String, i64, Option<i64>)>>> = Arc::new(Mutex::new(Vec::new()));

        let output_sink = output.clone();
        client.set_output_handler(Arc::new(move |pty_id, data| {
            output_sink
                .lock()
                .unwrap()
                .push((pty_id.to_string(), data.to_string()));
        }));
        let exit_sink = exits.clone();
        client.set_exit_handler(Arc::new(move |pty_id, code, signal| {
            exit_sink
                .lock()
                .unwrap()
                .push((pty_id.to_string(), code, signal));
        }));

        client.handle_line(r#"{"event":"output","ptyId":"pty-1","data":"hi\n"}"#);
        client.handle_line(r#"{"event":"exit","ptyId":"pty-1","signal":15}"#);
        client.handle_line(r#"{"event":"exit","ptyId":"pty-1","exitCode":0}"#);

        assert_eq!(
            *output.lock().unwrap(),
            vec![("pty-1".to_string(), "hi\n".to_string())]
        );
        assert_eq!(
            *exits.lock().unwrap(),
            vec![
                ("pty-1".to_string(), -1, Some(15)),
                ("pty-1".to_string(), 0, None),
            ]
        );
    }

    #[test]
    fn events_without_pty_id_or_data_are_ignored() {
        let (_, client) = client_with_io(None);
        let seen = Arc::new(Mutex::new(0usize));
        let sink = seen.clone();
        client.set_output_handler(Arc::new(move |_, _| {
            *sink.lock().unwrap() += 1;
        }));

        client.handle_line(r#"{"event":"output","data":"orphan"}"#);
        client.handle_line(r#"{"event":"output","ptyId":"","data":"orphan"}"#);
        client.handle_line(r#"{"event":"output","ptyId":"pty-1","data":null}"#);
        client.handle_line(r#"{"event":"output","ptyId":"pty-1"}"#);

        assert_eq!(*seen.lock().unwrap(), 0);
    }

    #[test]
    fn malformed_and_unknown_id_lines_are_ignored() {
        let (_, client) = client_with_io(None);
        client.handle_line("not json");
        client.handle_line("");
        client.handle_line(r#"{"id":99,"ok":true}"#);
        assert_eq!(client.pending_len(), 0);
    }

    #[test]
    fn failure_responses_surface_broker_error_or_command_default() {
        let (_, client) = client_with_io(None);
        let (explicit, ()) = futures_join(
            client.write("pty-1", "x"),
            deliver(&client, r#"{"id":1,"ok":false,"error":"no such pty"}"#),
        );
        assert_eq!(
            explicit,
            Err(BrokerError::Failure("no such pty".to_string()))
        );

        let (fallback, ()) = futures_join(
            client.resize("pty-1", 10, 4),
            deliver(&client, r#"{"id":2,"ok":false}"#),
        );
        assert_eq!(
            fallback,
            Err(BrokerError::Failure("resize failed".to_string()))
        );
        assert_eq!(fallback.unwrap_err().message(), "resize failed");
    }

    #[test]
    fn spawn_without_pty_id_fails() {
        let (_, client) = client_with_io(None);
        let (result, ()) = futures_join(
            client.spawn(&SpawnOptions::default()),
            deliver(&client, r#"{"id":1,"ok":true}"#),
        );
        assert_eq!(result, Err(BrokerError::Failure("spawn failed".to_string())));
    }

    #[tokio::test]
    async fn rpc_timeout_reports_exact_message_and_clears_pending() {
        let (_, client) = client_with_io(Some(Duration::from_millis(5)));
        let error = client.write("pty-1", "data").await.unwrap_err();
        assert_eq!(
            error.message(),
            "PTY broker RPC timeout: write".to_string()
        );
        assert_eq!(client.pending_len(), 0);
    }

    #[test]
    fn stop_rejects_pending_calls_and_terminates_process() {
        let (io, client) = client_with_io(None);

        let (result, ()) = futures_join(client.kill("pty-1"), async {
            tokio::task::yield_now().await;
            client.stop();
        });

        assert_eq!(result, Err(BrokerError::Stopped));
        assert_eq!(result.unwrap_err().message(), "Broker stopping");
        assert_eq!(io.terminated.load(Ordering::SeqCst), 1);
        assert_eq!(client.pending_len(), 0);
        assert!(!client.is_ready());
    }

    #[tokio::test]
    async fn write_failures_are_reported_and_pending_is_cleared() {
        let io = Arc::new(RecordingIo::failing("stdin closed"));
        let client = PtyBrokerClient::new(io);
        let error = client.write("pty-1", "data").await.unwrap_err();
        assert_eq!(error, BrokerError::Failure("stdin closed".to_string()));
        assert_eq!(client.pending_len(), 0);
    }

    /// Poll `call` and then deliver one broker line, without needing a runtime
    /// spawn: `join!` polls both futures deterministically in order.
    fn futures_join<T>(
        call: impl std::future::Future<Output = T>,
        delivery: impl std::future::Future<Output = ()>,
    ) -> (T, ()) {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(async move { tokio::join!(call, delivery) })
    }

    async fn deliver(client: &PtyBrokerClient, line: &str) {
        tokio::task::yield_now().await;
        client.handle_line(line);
    }
}
