//! Remote terminal surface.
//!
//! Port of `packages/gateway/src/surfaces/remote-terminal.ts`. The TypeScript
//! class never spawns a process itself: it forwards every operation to the
//! owning node through the websocket control plane (`WsControlPlane`) and keeps
//! the gateway-side view (state machine, retained output chunks, shell
//! integration markers, snapshot metadata).
//!
//! Boundary: the node link is injected as [`WsControlPlane`], so the surface
//! holds no transport of its own. `crate::ws::WsHub` implements the trait over
//! its node dispatcher; tests inject a fake. This mirrors the TS contract where
//! `RemoteTerminalSurface` only ever calls `proxyTerminalOp`/`sendTerminalOp`.
//!
//! Output retention mirrors the TS buffer: chunks are appended verbatim,
//! trimmed to the last 5 000 entries once more than 10 000 accumulate, and
//! command slices are produced by the shared
//! [`terminal_output_slice`](super::terminal_output::terminal_output_slice)
//! helper (same module that backs the already-ported `terminal-output.ts`).
use serde_json::{Map, Value};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

use super::registry::{
    Surface, SurfaceFuture, SurfaceResult, SurfaceSnapshot, SurfaceStartInput, SurfaceState,
};
use super::terminal_output::terminal_output_slice;
use crate::ws::WsControlPlane;

/// Surface `type` reported in snapshots (`terminal`).
pub const REMOTE_TERMINAL_KIND: &str = "terminal";
/// OSC 633;B - first prompt-end marker emitted by the remote shell integration.
pub const SHELL_INTEGRATION_PROMPT_MARKER: &str = "\u{1b}]633;B";
/// OSC 633;D - "command finished" marker.
pub const SHELL_INTEGRATION_COMMAND_DONE_MARKER: &str = "\u{1b}]633;D";
/// CSI ?2004h - the shell's line editor enabled bracketed paste.
pub const BRACKETED_PASTE_MARKER: &str = "\u{1b}[?2004h";
/// Trim threshold for the retained output buffer.
pub const MAX_OUTPUT_CHUNKS: usize = 10_000;
/// Number of chunks kept when the buffer is trimmed.
pub const RETAINED_OUTPUT_CHUNKS: usize = 5_000;
/// Timeout for the node `start` operation.
pub const START_TIMEOUT: Duration = Duration::from_millis(15_000);
/// Timeout for the node `stop` operation.
pub const STOP_TIMEOUT: Duration = Duration::from_millis(5_000);
/// Default `waitForPrompt` timeout.
pub const DEFAULT_PROMPT_TIMEOUT: Duration = Duration::from_millis(5_000);
pub const DEFAULT_COLS: u32 = 120;
pub const DEFAULT_ROWS: u32 = 30;

/// `RemoteTerminalSurfaceOptions` from the TS module.
#[derive(Clone, Debug, Default)]
pub struct RemoteTerminalSurfaceOptions {
    pub shell: Option<String>,
    pub cols: Option<u32>,
    pub rows: Option<u32>,
    pub reuse_only: bool,
}

type OutputListener = Arc<dyn Fn(&str) + Send + Sync>;
type ExitListener = Arc<dyn Fn(Option<i32>) + Send + Sync>;
type StateListener = Arc<dyn Fn(SurfaceState) + Send + Sync>;

struct State {
    status: SurfaceState,
    shell: Option<String>,
    session_id: Option<String>,
    started_at: Option<String>,
    cwd: Option<String>,
    pid: Option<u32>,
    output: Vec<String>,
    output_chunk_count: usize,
    command_done_end_offset: usize,
    output_listeners: Vec<(u64, OutputListener)>,
    exit_listeners: Vec<(u64, ExitListener)>,
    state_listener: Option<StateListener>,
    bracketed_paste_seen: bool,
    shell_integration_ready: bool,
    ready_waiters: Vec<(u64, oneshot::Sender<()>)>,
    next_ready_waiter_id: u64,
    next_listener_id: u64,
    last_activity: Instant,
    cols: u32,
    rows: u32,
}

impl State {
    fn new() -> Self {
        Self {
            status: SurfaceState::Idle,
            shell: None,
            session_id: None,
            started_at: None,
            cwd: None,
            pid: None,
            output: Vec::new(),
            output_chunk_count: 0,
            command_done_end_offset: 0,
            output_listeners: Vec::new(),
            exit_listeners: Vec::new(),
            state_listener: None,
            bracketed_paste_seen: false,
            shell_integration_ready: false,
            ready_waiters: Vec::new(),
            next_ready_waiter_id: 0,
            next_listener_id: 0,
            last_activity: Instant::now(),
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
        }
    }
}

/// Gateway-side handle for a terminal owned by a node.
pub struct RemoteTerminalSurface {
    id: String,
    ws: Arc<dyn WsControlPlane>,
    node_id: String,
    shell: Option<String>,
    reuse_only: bool,
    state: Mutex<State>,
}

impl std::fmt::Debug for RemoteTerminalSurface {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RemoteTerminalSurface")
            .field("id", &self.id)
            .field("node_id", &self.node_id)
            .finish_non_exhaustive()
    }
}

impl RemoteTerminalSurface {
    pub fn new(
        id: impl Into<String>,
        ws: Arc<dyn WsControlPlane>,
        node_id: impl Into<String>,
        options: RemoteTerminalSurfaceOptions,
    ) -> Self {
        let reuse_only = options.reuse_only;
        let mut initial = State::new();
        initial.shell = options.shell.clone();
        initial.cols = options.cols.unwrap_or(DEFAULT_COLS);
        initial.rows = options.rows.unwrap_or(DEFAULT_ROWS);
        let surface = Self {
            id: id.into(),
            ws,
            node_id: node_id.into(),
            shell: options.shell,
            reuse_only,
            state: Mutex::new(initial),
        };
        // A reattached terminal already sits at a prompt from an earlier
        // command, so it will not emit a fresh B marker until we write to it.
        if reuse_only {
            surface.mark_shell_integration_ready();
        }
        surface
    }

    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    pub fn cols(&self) -> u32 {
        self.state.lock().expect("terminal state").cols
    }

    pub fn rows(&self) -> u32 {
        self.state.lock().expect("terminal state").rows
    }

    pub fn reuse_only(&self) -> bool {
        self.reuse_only
    }

    /// Shell reported by the node on start, or the configured shell.
    pub fn shell(&self) -> Option<String> {
        self.state.lock().expect("terminal state").shell.clone()
    }

    pub fn pid(&self) -> Option<u32> {
        self.state.lock().expect("terminal state").pid
    }

    pub fn bracketed_paste_seen(&self) -> bool {
        self.state
            .lock()
            .expect("terminal state")
            .bracketed_paste_seen
    }

    pub fn shell_integration_ready(&self) -> bool {
        self.state
            .lock()
            .expect("terminal state")
            .shell_integration_ready
    }

    pub fn set_state_listener(&self, listener: Arc<dyn Fn(SurfaceState) + Send + Sync>) {
        self.state.lock().expect("terminal state").state_listener = Some(listener);
    }

    pub fn add_output_listener(&self, listener: Arc<dyn Fn(&str) + Send + Sync>) -> u64 {
        let mut state = self.state.lock().expect("terminal state");
        let id = state.next_listener_id;
        state.next_listener_id += 1;
        state.output_listeners.push((id, listener));
        id
    }

    /// Counterpart of the TS `removeOutputListener`; unknown ids are a no-op.
    pub fn remove_output_listener(&self, id: u64) {
        self.state
            .lock()
            .expect("terminal state")
            .output_listeners
            .retain(|(listener_id, _)| *listener_id != id);
    }

    pub fn add_exit_listener(&self, listener: Arc<dyn Fn(Option<i32>) + Send + Sync>) -> u64 {
        let mut state = self.state.lock().expect("terminal state");
        let id = state.next_listener_id;
        state.next_listener_id += 1;
        state.exit_listeners.push((id, listener));
        id
    }

    /// Counterpart of the TS `removeExitListener`; unknown ids are a no-op.
    pub fn remove_exit_listener(&self, id: u64) {
        self.state
            .lock()
            .expect("terminal state")
            .exit_listeners
            .retain(|(listener_id, _)| *listener_id != id);
    }

    fn mark_shell_integration_ready(&self) {
        let waiters = {
            let mut state = self.state.lock().expect("terminal state");
            if state.shell_integration_ready {
                return;
            }
            state.shell_integration_ready = true;
            std::mem::take(&mut state.ready_waiters)
        };
        for (_, waiter) in waiters {
            let _ = waiter.send(());
        }
    }

    /// Wait until the remote shell emitted its first prompt marker, or until
    /// `timeout` elapses. A timeout is not an error: the TS `waitForPrompt`
    /// races the readiness promise against a timer and always resolves.
    pub async fn wait_for_prompt(&self, timeout: Duration) {
        // Remove the sender even when this future is cancelled, not just when
        // the timeout completes. A shell may never emit a prompt marker.
        struct WaiterGuard<'a> {
            state: &'a Mutex<State>,
            id: u64,
        }
        impl Drop for WaiterGuard<'_> {
            fn drop(&mut self) {
                if let Ok(mut state) = self.state.lock() {
                    state.ready_waiters.retain(|(id, _)| *id != self.id);
                }
            }
        }
        let (receiver, _guard) = {
            let mut state = self.state.lock().expect("terminal state");
            if state.shell_integration_ready {
                return;
            }
            // Exhaustion is practically unreachable; refuse another waiter
            // rather than reusing an ID belonging to an active future.
            let Some(next) = state.next_ready_waiter_id.checked_add(1) else {
                return;
            };
            let id = state.next_ready_waiter_id;
            state.next_ready_waiter_id = next;
            let (tx, rx) = oneshot::channel();
            state.ready_waiters.push((id, tx));
            (
                rx,
                WaiterGuard {
                    state: &self.state,
                    id,
                },
            )
        };
        let _ = tokio::time::timeout(timeout, receiver).await;
    }

    /// Send operator keystrokes to the node (`write` op). Dropped unless the
    /// surface is running.
    pub fn write(&self, data: &str) {
        if Surface::state(self) != SurfaceState::Running {
            return;
        }
        self.state.lock().expect("terminal state").last_activity = Instant::now();
        let args = serde_json::json!({ "terminalId": self.id, "data": data });
        if let Err(message) = self.ws.send_terminal_op(&self.node_id, "input", args) {
            self.ingest_output(&format!("\r\nRemote terminal input failed: {message}\r\n"));
        }
    }

    /// Forward a resize to the node (`resize` op). Dimensions are remembered
    /// locally even when the surface is not running, so a later snapshot
    /// reports the requested geometry.
    pub fn resize(&self, cols: u32, rows: u32) {
        {
            let mut state = self.state.lock().expect("terminal state");
            state.cols = cols;
            state.rows = rows;
        }
        if Surface::state(self) != SurfaceState::Running {
            return;
        }
        let args = serde_json::json!({ "terminalId": self.id, "cols": cols, "rows": rows });
        let _ = self.ws.send_terminal_op(&self.node_id, "resize", args);
    }

    /// Append node PTY output, updating shell-integration markers exactly like
    /// the TS `ingestOutput`.
    pub fn ingest_output(&self, data: &str) {
        if data.is_empty() {
            return;
        }
        let (listeners, became_ready) = {
            let mut state = self.state.lock().expect("terminal state");
            state.last_activity = Instant::now();
            let became_ready = {
                let not_ready = !state.shell_integration_ready;
                not_ready && data.contains(SHELL_INTEGRATION_PROMPT_MARKER)
            };
            if became_ready {
                state.shell_integration_ready = true;
            }
            if !state.bracketed_paste_seen && data.contains(BRACKETED_PASTE_MARKER) {
                state.bracketed_paste_seen = true;
            }
            state.output_chunk_count += 1;
            state.output.push(data.to_string());
            // Pin the lower toolcard boundary at the OSC 633;D marker: shells
            // bundle that marker into the same PTY read as the next prompt
            // redraw, so a later settle-time boundary would leak it.
            if data.contains(SHELL_INTEGRATION_COMMAND_DONE_MARKER) {
                state.command_done_end_offset = state.output_chunk_count;
            }
            if state.output.len() > MAX_OUTPUT_CHUNKS {
                let keep_from = state.output.len() - RETAINED_OUTPUT_CHUNKS;
                state.output.drain(..keep_from);
            }
            let waiters = if became_ready {
                std::mem::take(&mut state.ready_waiters)
            } else {
                Vec::new()
            };
            let listeners = state.output_listeners.clone();
            (listeners, waiters)
        };
        for (_, waiter) in became_ready {
            let _ = waiter.send(());
        }
        for (_, listener) in listeners {
            listener(data);
        }
    }

    /// Record process exit: appends the human-readable banner, marks the
    /// surface stopped and notifies exit listeners.
    pub fn ingest_exit(&self, exit_code: Option<i32>, signal: Option<&str>) {
        let already_stopped = {
            let mut state = self.state.lock().expect("terminal state");
            state.pid = None;
            state.status == SurfaceState::Stopped
        };
        if !already_stopped {
            let mut banner = String::from("\r\n[remote terminal exited");
            if let Some(code) = exit_code {
                banner.push_str(&format!(" with code {code}"));
            }
            if let Some(signal) = signal.filter(|s| !s.is_empty()) {
                banner.push_str(&format!(", signal {signal}"));
            }
            banner.push_str("]\r\n");
            self.ingest_output(&banner);
        }
        self.set_status(SurfaceState::Stopped);
        let listeners = self
            .state
            .lock()
            .expect("terminal state")
            .exit_listeners
            .clone();
        for (_, listener) in listeners {
            // TS: `for (const listener of [...this.exitListeners]) { try { listener(...) } catch { /* observer */ } }`
            // Observers must not be able to abort delivery to the remaining
            // listeners or unwind through the caller.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| listener(exit_code)));
        }
    }

    pub fn output_offset(&self) -> usize {
        self.state
            .lock()
            .expect("terminal state")
            .output_chunk_count
    }

    /// Chunk boundary pinned at the last OSC 633;D marker (0 = none seen yet).
    pub fn command_done_end_offset(&self) -> usize {
        self.state
            .lock()
            .expect("terminal state")
            .command_done_end_offset
    }

    /// Command-local slice of retained output. An explicit `output_end_offset`
    /// always denotes a bounded command slice, so the trailing marker chunk is
    /// trimmed.
    pub fn recent_output_since(
        &self,
        output_offset: f64,
        output_end_offset: Option<f64>,
        lines: f64,
    ) -> String {
        let (buffer, chunk_count) = {
            let state = self.state.lock().expect("terminal state");
            (state.output.clone(), state.output_chunk_count)
        };
        terminal_output_slice(
            &buffer,
            chunk_count,
            output_offset,
            output_end_offset,
            lines,
            output_end_offset.is_some(),
        )
    }

    /// Unbounded-ish live tail: the last `lines` chunks concatenated.
    pub fn recent_output(&self, lines: usize) -> String {
        let state = self.state.lock().expect("terminal state");
        let start = state.output.len().saturating_sub(lines);
        state.output[start..].concat()
    }

    pub fn touch(&self) {
        self.state.lock().expect("terminal state").last_activity = Instant::now();
    }

    pub fn idle(&self) -> Duration {
        self.state
            .lock()
            .expect("terminal state")
            .last_activity
            .elapsed()
    }

    fn set_status(&self, status: SurfaceState) {
        let listener = {
            let mut state = self.state.lock().expect("terminal state");
            state.status = status;
            state.state_listener.clone()
        };
        if let Some(listener) = listener {
            listener(status);
        }
    }
}

impl Surface for RemoteTerminalSurface {
    fn id(&self) -> &str {
        &self.id
    }

    fn kind(&self) -> &str {
        REMOTE_TERMINAL_KIND
    }

    fn state(&self) -> SurfaceState {
        self.state.lock().expect("terminal state").status
    }

    fn session_id(&self) -> Option<String> {
        self.state
            .lock()
            .expect("terminal state")
            .session_id
            .clone()
    }

    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            if self.state() == SurfaceState::Running {
                return Ok(());
            }
            self.set_status(SurfaceState::Starting);
            {
                let mut state = self.state.lock().expect("terminal state");
                state.session_id = Some(input.session_id.clone());
                state.cwd = Some(input.project_root.clone());
                state.started_at = Some(now_iso8601());
            }

            let mut args = Map::new();
            args.insert("terminalId".into(), Value::String(self.id.clone()));
            args.insert("sessionId".into(), Value::String(input.session_id.clone()));
            args.insert(
                "projectRoot".into(),
                Value::String(input.project_root.clone()),
            );
            args.insert("cols".into(), Value::from(self.cols()));
            args.insert("rows".into(), Value::from(self.rows()));
            if let Some(shell) = self.shell.clone() {
                args.insert("shell".into(), Value::String(shell));
            }
            if self.reuse_only {
                args.insert("reuseOnly".into(), Value::Bool(true));
            }

            let result = self
                .ws
                .proxy_terminal_op(&self.node_id, "start", Value::Object(args), START_TIMEOUT)
                .await;
            match result {
                Ok(result) => {
                    let mut state = self.state.lock().expect("terminal state");
                    state.pid = result
                        .get("pid")
                        .and_then(Value::as_u64)
                        .map(|pid| pid as u32);
                    if let Some(shell) = result.get("shell").and_then(Value::as_str)
                        && !shell.is_empty()
                    {
                        state.shell = Some(shell.to_string());
                    }
                    drop(state);
                    self.set_status(SurfaceState::Running);
                    Ok(())
                }
                Err(error) => {
                    self.set_status(SurfaceState::Error);
                    Err(error)
                }
            }
        })
    }

    fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            if self.state() == SurfaceState::Stopped {
                return Ok(());
            }
            self.set_status(SurfaceState::Stopping);
            let args = serde_json::json!({ "terminalId": self.id });
            // The owning node may already be gone; the gateway surface still
            // has to close, so a failed node round-trip is not an error.
            let _ = self
                .ws
                .proxy_terminal_op(&self.node_id, "stop", args, STOP_TIMEOUT)
                .await;
            self.state.lock().expect("terminal state").pid = None;
            self.set_status(SurfaceState::Stopped);
            Ok(())
        })
    }

    fn snapshot(&self) -> SurfaceResult<SurfaceSnapshot> {
        let state = self.state.lock().expect("terminal state");
        let mut metadata = Map::new();
        metadata.insert(
            "shell".into(),
            state
                .shell
                .clone()
                .map(Value::String)
                .unwrap_or(Value::Null),
        );
        metadata.insert("cols".into(), Value::from(state.cols));
        metadata.insert("rows".into(), Value::from(state.rows));
        metadata.insert(
            "pid".into(),
            state.pid.map(Value::from).unwrap_or(Value::Null),
        );
        metadata.insert(
            "cwd".into(),
            state.cwd.clone().map(Value::String).unwrap_or(Value::Null),
        );
        metadata.insert("nodeId".into(), Value::String(self.node_id.clone()));
        metadata.insert("remote".into(), Value::Bool(true));
        Ok(SurfaceSnapshot {
            id: self.id.clone(),
            kind: REMOTE_TERMINAL_KIND.to_string(),
            state: state.status,
            session_id: state.session_id.clone().unwrap_or_default(),
            started_at: state.started_at.clone(),
            metadata,
        })
    }
}

/// RFC 3339 timestamp with millisecond precision, matching `Date#toISOString`.
fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ws::TerminalOpFuture;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct FakePlane {
        calls: Mutex<Vec<(String, String, Value)>>,
        start_result: Mutex<Result<Value, String>>,
        stop_result: Mutex<Result<Value, String>>,
    }

    impl Default for FakePlane {
        fn default() -> Self {
            Self {
                calls: Mutex::new(Vec::new()),
                start_result: Mutex::new(Ok(serde_json::json!({}))),
                stop_result: Mutex::new(Ok(serde_json::json!({}))),
            }
        }
    }

    impl WsControlPlane for FakePlane {
        fn proxy_terminal_op<'a>(
            &'a self,
            node_id: &'a str,
            op: &'a str,
            args: Value,
            _timeout: Duration,
        ) -> TerminalOpFuture<'a> {
            Box::pin(async move {
                self.calls.lock().unwrap().push((
                    node_id.to_string(),
                    op.to_string(),
                    args.clone(),
                ));
                match op {
                    "start" => self.start_result.lock().unwrap().clone(),
                    "stop" => self.stop_result.lock().unwrap().clone(),
                    other => Err(format!("unexpected op {other}")),
                }
            })
        }

        fn send_terminal_op(&self, node_id: &str, op: &str, args: Value) -> Result<(), String> {
            self.calls
                .lock()
                .unwrap()
                .push((node_id.to_string(), op.to_string(), args));
            Ok(())
        }
    }

    fn start_input() -> SurfaceStartInput {
        SurfaceStartInput {
            session_id: "sess-1".into(),
            project_root: "/tmp/project".into(),
            node_id: Some("node-1".into()),
            properties: Map::new(),
        }
    }

    fn surface(plane: Arc<FakePlane>) -> RemoteTerminalSurface {
        RemoteTerminalSurface::new(
            "term-1",
            plane,
            "node-1",
            RemoteTerminalSurfaceOptions::default(),
        )
    }

    #[tokio::test]
    async fn prompt_waiters_are_removed_after_timeout_and_cancellation() {
        let terminal = surface(Arc::new(FakePlane::default()));
        terminal.wait_for_prompt(Duration::from_millis(1)).await;
        assert!(terminal.state.lock().unwrap().ready_waiters.is_empty());

        {
            let wait = terminal.wait_for_prompt(Duration::from_secs(60));
            tokio::pin!(wait);
            tokio::select! {
                _ = &mut wait => panic!("wait resolved before prompt"),
                _ = tokio::task::yield_now() => {}
            }
            assert_eq!(terminal.state.lock().unwrap().ready_waiters.len(), 1);
            // Dropping the pinned future cancels the wait and removes its sender.
        }
        assert!(terminal.state.lock().unwrap().ready_waiters.is_empty());
    }

    #[tokio::test]
    async fn start_forwards_node_start_op_and_records_result() {
        let plane = Arc::new(FakePlane::default());
        *plane.start_result.lock().unwrap() =
            Ok(serde_json::json!({"pid": 4321, "shell": "/bin/zsh"}));
        let terminal = surface(plane.clone());

        terminal.start(start_input()).await.unwrap();

        assert_eq!(terminal.state(), SurfaceState::Running);
        assert_eq!(terminal.pid(), Some(4321));
        let calls = plane.calls.lock().unwrap();
        assert_eq!(calls[0].0, "node-1");
        assert_eq!(calls[0].1, "start");
        assert_eq!(calls[0].2["terminalId"], "term-1");
        assert_eq!(calls[0].2["cols"], 120);
        assert_eq!(calls[0].2["rows"], 30);
        assert_eq!(calls[0].2["projectRoot"], "/tmp/project");
        assert!(calls[0].2.get("reuseOnly").is_none());

        let snapshot = terminal.snapshot().unwrap();
        assert_eq!(snapshot.kind, "terminal");
        assert_eq!(snapshot.session_id, "sess-1");
        assert_eq!(snapshot.metadata["shell"], "/bin/zsh");
        assert_eq!(snapshot.metadata["pid"], 4321);
        assert_eq!(snapshot.metadata["nodeId"], "node-1");
        assert_eq!(snapshot.metadata["remote"], true);
    }

    #[tokio::test]
    async fn failed_start_marks_surface_error() {
        let plane = Arc::new(FakePlane::default());
        *plane.start_result.lock().unwrap() = Err("node offline".into());
        let terminal = surface(plane);
        let error = terminal.start(start_input()).await.unwrap_err();
        assert_eq!(error, "node offline");
        assert_eq!(terminal.state(), SurfaceState::Error);
    }

    #[tokio::test]
    async fn stop_tolerates_absent_node_and_clears_pid() {
        let plane = Arc::new(FakePlane::default());
        *plane.start_result.lock().unwrap() = Ok(serde_json::json!({"pid": 99}));
        *plane.stop_result.lock().unwrap() = Err("node gone".into());
        let terminal = surface(plane);
        terminal.start(start_input()).await.unwrap();
        terminal.stop(None).await.unwrap();
        assert_eq!(terminal.state(), SurfaceState::Stopped);
        assert_eq!(terminal.pid(), None);
    }

    #[tokio::test]
    async fn write_and_resize_are_dropped_unless_running() {
        let plane = Arc::new(FakePlane::default());
        let terminal = surface(plane.clone());
        terminal.write("ls\r");
        terminal.resize(100, 40);
        assert!(plane.calls.lock().unwrap().is_empty());

        *plane.start_result.lock().unwrap() = Ok(serde_json::json!({"pid": 1}));
        terminal.start(start_input()).await.unwrap();
        plane.calls.lock().unwrap().clear();
        terminal.write("ls\r");
        terminal.resize(100, 40);
        let calls = plane.calls.lock().unwrap();
        assert_eq!(calls[0].1, "input");
        assert_eq!(calls[0].2["data"], "ls\r");
        assert_eq!(calls[1].1, "resize");
        assert_eq!(calls[1].2["cols"], 100);
    }

    #[tokio::test]
    async fn output_marks_shell_integration_and_retains_bounded_chunks() {
        let plane = Arc::new(FakePlane::default());
        let terminal = surface(plane);
        let seen = Arc::new(AtomicUsize::new(0));
        let counter = seen.clone();
        terminal.add_output_listener(Arc::new(move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        }));

        terminal.ingest_output("hello");
        assert_eq!(seen.load(Ordering::SeqCst), 1);
        assert!(!terminal.shell_integration_ready());
        assert!(!terminal.bracketed_paste_seen());

        terminal.ingest_output("\u{1b}]633;B prompt\u{1b}[?2004h");
        assert!(terminal.shell_integration_ready());
        assert!(terminal.bracketed_paste_seen());
        terminal.wait_for_prompt(Duration::from_millis(1)).await;

        assert_eq!(terminal.output_offset(), 2);
        assert_eq!(
            terminal.recent_output(10),
            "hello\u{1b}]633;B prompt\u{1b}[?2004h"
        );

        for index in 0..MAX_OUTPUT_CHUNKS {
            terminal.ingest_output(&format!("chunk-{index}\n"));
        }
        // Buffer trimming keeps the newest 5 000 chunks; the chunk counter is
        // monotonic so absolute offsets stay stable across trims.
        assert_eq!(terminal.output_offset(), 2 + MAX_OUTPUT_CHUNKS);
        let tail = terminal.recent_output(RETAINED_OUTPUT_CHUNKS);
        assert!(tail.starts_with(&format!(
            "chunk-{}\n",
            MAX_OUTPUT_CHUNKS - RETAINED_OUTPUT_CHUNKS
        )));
        assert!(tail.ends_with(&format!("chunk-{}\n", MAX_OUTPUT_CHUNKS - 1)));
        assert!(
            !terminal
                .recent_output(RETAINED_OUTPUT_CHUNKS + 1)
                .contains("hello")
        );
    }

    #[tokio::test]
    async fn command_done_marker_pins_slice_boundary() {
        let plane = Arc::new(FakePlane::default());
        let terminal = surface(plane);
        terminal.ingest_output("$ run\r\n");
        terminal.ingest_output("output line\r\n\u{1b}]633;D;0\u{1b}\\$ ");
        terminal.ingest_output("next prompt\r\n");

        assert_eq!(terminal.command_done_end_offset(), 2);
        let slice = terminal.recent_output_since(0.0, Some(2.0), 100.0);
        assert!(slice.contains("output line"), "slice: {slice:?}");
        assert!(
            !slice.contains("\u{1b}]633;D"),
            "marker chunk must be trimmed: {slice:?}"
        );
        assert!(!slice.contains("next prompt"));
    }

    #[tokio::test]
    async fn exit_banner_and_listeners_match_ts_format() {
        let plane = Arc::new(FakePlane::default());
        let terminal = surface(plane);
        let exits = Arc::new(Mutex::new(Vec::new()));
        let sink = exits.clone();
        terminal.add_exit_listener(Arc::new(move |code| sink.lock().unwrap().push(code)));

        terminal.ingest_exit(Some(137), Some("SIGKILL"));

        assert_eq!(terminal.state(), SurfaceState::Stopped);
        assert_eq!(*exits.lock().unwrap(), vec![Some(137)]);
        let tail = terminal.recent_output(10);
        assert!(tail.contains("[remote terminal exited with code 137, signal SIGKILL]"));
    }

    #[tokio::test]
    async fn reuse_only_skips_prompt_wait() {
        let plane = Arc::new(FakePlane::default());
        let plane_handle: Arc<dyn WsControlPlane> = plane.clone();
        let terminal = RemoteTerminalSurface::new(
            "term-2",
            plane_handle,
            "node-1",
            RemoteTerminalSurfaceOptions {
                reuse_only: true,
                shell: Some("/bin/bash".into()),
                cols: Some(80),
                rows: Some(24),
            },
        );
        assert!(terminal.shell_integration_ready());
        terminal.wait_for_prompt(Duration::from_millis(1)).await;
        *plane.start_result.lock().unwrap() = Ok(serde_json::json!({}));
        terminal.start(start_input()).await.unwrap();
        let calls = plane.calls.lock().unwrap();
        assert_eq!(calls[0].2["reuseOnly"], true);
        assert_eq!(calls[0].2["shell"], "/bin/bash");
        assert_eq!(calls[0].2["cols"], 80);
    }

    #[tokio::test]
    async fn idle_clock_advances_with_activity() {
        let plane = Arc::new(FakePlane::default());
        let terminal = surface(plane);
        terminal.ingest_output("x");
        let idle_after_output = terminal.idle();
        terminal.touch();
        assert!(terminal.idle() <= idle_after_output);
    }
}
