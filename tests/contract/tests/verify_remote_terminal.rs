//! Contract evidence for the native port of `packages/gateway/src/surfaces/remote-terminal.ts`.
//!
//! Expectations below are derived from the TypeScript module, not from the Rust
//! implementation: constructor defaults (`cols = 120`, `rows = 30`), the
//! `reuseOnly` pre-ready rule, the `terminal.start` / `terminal.stop` wire
//! payloads and their 15 s / 5 s budgets, the `pid`/`shell` adoption from the
//! node reply, fire-and-forget `input`/`resize`, and the snapshot shape.
//!
//! The control plane is faked so that every assertion is about what the
//! surface sends and how it reacts, with no dependence on a live node.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use jait_gateway::surfaces::registry::{Surface, SurfaceSnapshot, SurfaceStartInput, SurfaceState};
use jait_gateway::surfaces::remote_terminal::{
    DEFAULT_COLS, DEFAULT_ROWS, RemoteTerminalSurface, RemoteTerminalSurfaceOptions, START_TIMEOUT,
    STOP_TIMEOUT,
};
use jait_gateway::ws::{TerminalOpFuture, WsControlPlane};
use serde_json::{Value, json};

#[derive(Debug, Clone)]
struct Call {
    node_id: String,
    op: String,
    args: Value,
    timeout: Option<Duration>,
}

#[derive(Default)]
struct FakePlane {
    calls: Mutex<Vec<Call>>,
    start_reply: Mutex<Value>,
    fail_start: bool,
    fail_stop: bool,
}

impl FakePlane {
    fn new() -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            start_reply: Mutex::new(json!({})),
            fail_start: false,
            fail_stop: false,
        }
    }

    fn failing_start() -> Self {
        Self {
            fail_start: true,
            ..Self::new()
        }
    }

    fn failing_stop() -> Self {
        Self {
            fail_stop: true,
            ..Self::new()
        }
    }

    fn with_start_reply(reply: Value) -> Self {
        let plane = Self::new();
        *plane.start_reply.lock().unwrap() = reply;
        plane
    }

    fn take(&self) -> Vec<Call> {
        std::mem::take(&mut self.calls.lock().unwrap())
    }
}

impl WsControlPlane for FakePlane {
    fn proxy_terminal_op<'a>(
        &'a self,
        node_id: &'a str,
        op: &'a str,
        args: Value,
        timeout: Duration,
    ) -> TerminalOpFuture<'a> {
        self.calls.lock().unwrap().push(Call {
            node_id: node_id.to_string(),
            op: op.to_string(),
            args: args.clone(),
            timeout: Some(timeout),
        });
        let reply = self.start_reply.lock().unwrap().clone();
        let failure = match op {
            "start" => self.fail_start.then(|| "node unreachable".to_string()),
            "stop" => self.fail_stop.then(|| "node unreachable".to_string()),
            _ => None,
        };
        Box::pin(async move { failure.map_or(Ok(reply), Err) })
    }

    fn send_terminal_op(&self, node_id: &str, op: &str, args: Value) -> Result<(), String> {
        self.calls.lock().unwrap().push(Call {
            node_id: node_id.to_string(),
            op: op.to_string(),
            args,
            timeout: None,
        });
        Ok(())
    }
}

fn options(
    cols: Option<u32>,
    rows: Option<u32>,
    shell: Option<&str>,
    reuse_only: bool,
) -> RemoteTerminalSurfaceOptions {
    RemoteTerminalSurfaceOptions {
        shell: shell.map(str::to_string),
        cols,
        rows,
        reuse_only,
    }
}

fn start_input() -> SurfaceStartInput {
    SurfaceStartInput {
        session_id: "sess-1".to_string(),
        project_root: "/work/project".to_string(),
        node_id: None,
        properties: serde_json::Map::new(),
    }
}

fn surface(
    plane: &Arc<FakePlane>,
    options: RemoteTerminalSurfaceOptions,
) -> Arc<RemoteTerminalSurface> {
    Arc::new(RemoteTerminalSurface::new(
        "term-1",
        plane.clone(),
        "node-a",
        options,
    ))
}

/// TS ctor: `this.cols = options.cols ?? 120; this.rows = options.rows ?? 30;`
#[test]
fn defaults_match_typescript_constructor() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));

    assert_eq!(DEFAULT_COLS, 120);
    assert_eq!(DEFAULT_ROWS, 30);
    assert_eq!(terminal.cols(), 120);
    assert_eq!(terminal.rows(), 30);
    assert_eq!(terminal.shell(), None);
    assert!(!terminal.reuse_only());
    assert_eq!(terminal.pid(), None);
    assert_eq!(terminal.state(), SurfaceState::Idle);
    assert!(!terminal.bracketed_paste_seen());
    assert_eq!(terminal.node_id(), "node-a");
}

#[test]
fn options_override_defaults() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(
        &plane,
        options(Some(100), Some(40), Some("/bin/zsh"), false),
    );

    assert_eq!(terminal.cols(), 100);
    assert_eq!(terminal.rows(), 40);
    assert_eq!(terminal.shell().as_deref(), Some("/bin/zsh"));
}

/// TS ctor: `if (this.reuseOnly) this._shellIntegrationReady = true;`
#[test]
fn reuse_only_is_shell_ready_before_start() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, true));

    assert!(terminal.reuse_only());
    assert!(terminal.shell_integration_ready());
}

#[tokio::test]
async fn start_proxies_terminal_start_with_dimensions() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));

    terminal.start(start_input()).await.expect("start");

    let calls = plane.take();
    assert_eq!(calls.len(), 1, "start performs exactly one node round-trip");
    let call = &calls[0];
    assert_eq!(call.node_id, "node-a");
    assert_eq!(call.op, "start");
    assert_eq!(call.timeout, Some(START_TIMEOUT));
    assert_eq!(call.timeout, Some(Duration::from_millis(15_000)));
    assert_eq!(call.args["terminalId"], json!("term-1"));
    assert_eq!(call.args["sessionId"], json!("sess-1"));
    assert_eq!(call.args["projectRoot"], json!("/work/project"));
    assert_eq!(call.args["cols"], json!(120));
    assert_eq!(call.args["rows"], json!(30));
    assert!(
        call.args.get("shell").is_none(),
        "an unset shell must not be sent at all"
    );
    assert!(
        call.args.get("reuseOnly").is_none(),
        "reuseOnly is only sent when requested"
    );
    assert_eq!(terminal.state(), SurfaceState::Running);
}

#[tokio::test]
async fn start_forwards_shell_and_reuse_only() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(Some(90), Some(25), Some("/bin/bash"), true));

    terminal.start(start_input()).await.expect("start");

    let call = plane.take().remove(0);
    assert_eq!(call.args["cols"], json!(90));
    assert_eq!(call.args["rows"], json!(25));
    assert_eq!(call.args["shell"], json!("/bin/bash"));
    assert_eq!(call.args["reuseOnly"], json!(true));
}

/// TS start handler adopts `pid` and a non-empty `shell` from the node reply.
#[tokio::test]
async fn start_adopts_pid_and_shell_from_reply() {
    let plane = Arc::new(FakePlane::with_start_reply(
        json!({ "pid": 4242, "shell": "/bin/fish" }),
    ));
    let terminal = surface(&plane, options(None, None, None, false));

    terminal.start(start_input()).await.expect("start");

    assert_eq!(terminal.pid(), Some(4242));
    assert_eq!(terminal.shell().as_deref(), Some("/bin/fish"));
    assert_eq!(terminal.state(), SurfaceState::Running);
}

#[tokio::test]
async fn start_failure_sets_error_state_and_propagates() {
    let plane = Arc::new(FakePlane::failing_start());
    let terminal = surface(&plane, options(None, None, None, false));

    let error = terminal
        .start(start_input())
        .await
        .expect_err("start must fail");
    assert_eq!(error, "node unreachable");
    assert_eq!(terminal.state(), SurfaceState::Error);
}

#[tokio::test]
async fn stop_proxies_terminal_stop_and_clears_pid() {
    let plane = Arc::new(FakePlane::with_start_reply(json!({ "pid": 7 })));
    let terminal = surface(&plane, options(None, None, None, false));
    terminal.start(start_input()).await.expect("start");
    plane.take();

    terminal.stop(Some("user".to_string())).await.expect("stop");

    let call = plane.take().remove(0);
    assert_eq!(call.op, "stop");
    assert_eq!(call.timeout, Some(STOP_TIMEOUT));
    assert_eq!(call.timeout, Some(Duration::from_millis(5_000)));
    assert_eq!(call.args, json!({ "terminalId": "term-1" }));
    assert_eq!(terminal.state(), SurfaceState::Stopped);
    assert_eq!(terminal.pid(), None);

    // Already stopped: no further node round-trip.
    terminal.stop(None).await.expect("stop again");
    assert!(plane.take().is_empty());
}

/// TS stop tolerates a dead node: the gateway surface still closes.
#[tokio::test]
async fn stop_tolerates_node_failure() {
    let plane = Arc::new(FakePlane::failing_stop());
    let terminal = surface(&plane, options(None, None, None, false));
    terminal.start(start_input()).await.expect("start");
    plane.take();

    terminal.stop(None).await.expect("stop must not fail");
    assert_eq!(terminal.state(), SurfaceState::Stopped);
}

#[tokio::test]
async fn write_and_resize_are_fire_and_forget() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    terminal.start(start_input()).await.expect("start");
    plane.take();

    terminal.write("ls -la\r");
    terminal.resize(132, 43);

    let calls = plane.take();
    assert_eq!(calls.len(), 2);
    assert_eq!(calls[0].op, "input");
    assert_eq!(calls[0].timeout, None, "input is fire-and-forget");
    assert_eq!(calls[0].args["terminalId"], json!("term-1"));
    assert_eq!(calls[0].args["data"], json!("ls -la\r"));
    assert_eq!(calls[1].op, "resize");
    assert_eq!(
        calls[1].args,
        json!({ "terminalId": "term-1", "cols": 132, "rows": 43 })
    );
    assert_eq!(terminal.cols(), 132);
    assert_eq!(terminal.rows(), 43);
}

#[tokio::test]
async fn ingest_output_streams_to_listeners_and_buffer() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    terminal.add_output_listener(Arc::new(move |chunk: &str| {
        sink.lock().unwrap().push(chunk.to_string());
    }));

    terminal.ingest_output("hello ");
    terminal.ingest_output("world");

    assert_eq!(*seen.lock().unwrap(), vec!["hello ", "world"]);
    assert!(terminal.output_offset() > 0);
    let tail = terminal.recent_output_since(0.0, None, 2.0);
    assert!(tail.contains("world"), "tail was {tail:?}");
}

#[tokio::test]
async fn output_listener_removal_stops_delivery() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = seen.clone();
    let id = terminal.add_output_listener(Arc::new(move |chunk: &str| {
        sink.lock().unwrap().push(chunk.to_string());
    }));

    terminal.ingest_output("one");
    terminal.remove_output_listener(id);
    terminal.ingest_output("two");

    assert_eq!(*seen.lock().unwrap(), vec!["one"]);
    // Removing an unknown id is a no-op.
    terminal.remove_output_listener(id + 999);
}

/// TS `ingestExit`: `_pid = null`; a `\r\n[remote terminal exited with code N]\r\n`
/// banner is appended only when the surface was not already `stopped`; state
/// becomes `stopped`; every exit listener is called with `exitCode ?? null`
/// (no dedup guard — a repeated report notifies again but adds no banner).
#[tokio::test]
async fn ingest_exit_emits_banner_once_and_notifies_each_report() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    terminal.start(start_input()).await.expect("start");
    plane.take();

    let chunks: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let chunk_sink = chunks.clone();
    terminal.add_output_listener(Arc::new(move |chunk: &str| {
        chunk_sink.lock().unwrap().push(chunk.to_string());
    }));

    let codes: Arc<Mutex<Vec<Option<i32>>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = codes.clone();
    let id = terminal.add_exit_listener(Arc::new(move |code: Option<i32>| {
        sink.lock().unwrap().push(code);
    }));

    terminal.ingest_exit(Some(7), None);
    assert_eq!(*codes.lock().unwrap(), vec![Some(7)]);
    assert_eq!(terminal.state(), SurfaceState::Stopped);
    assert_eq!(terminal.pid(), None);
    let banner = "\r\n[remote terminal exited with code 7]\r\n";
    assert!(
        chunks
            .lock()
            .unwrap()
            .iter()
            .any(|chunk| chunk.contains(banner.trim())),
        "expected the TypeScript exit banner, saw {:?}",
        chunks.lock().unwrap()
    );

    // Repeated report: notifies again, no second banner, no node round-trip.
    let before = chunks.lock().unwrap().len();
    terminal.ingest_exit(Some(7), None);
    assert_eq!(*codes.lock().unwrap(), vec![Some(7), Some(7)]);
    assert_eq!(
        chunks.lock().unwrap().len(),
        before,
        "banner must not repeat"
    );
    assert!(plane.take().is_empty());

    terminal.remove_exit_listener(id);
    terminal.ingest_exit(Some(0), None);
    assert_eq!(codes.lock().unwrap().len(), 2);
}

/// A signal-only exit keeps the banner free of a code segment, matching TS.
#[tokio::test]
async fn ingest_exit_signal_banner_has_no_code() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    let chunks: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let chunk_sink = chunks.clone();
    terminal.add_output_listener(Arc::new(move |chunk: &str| {
        chunk_sink.lock().unwrap().push(chunk.to_string());
    }));

    terminal.ingest_exit(None, Some("15"));

    let seen = chunks.lock().unwrap().join("");
    assert!(seen.contains("remote terminal exited"), "saw {seen:?}");
    assert!(!seen.contains("with code"), "saw {seen:?}");
    assert!(seen.contains("signal 15"), "saw {seen:?}");
}

/// TS wraps every exit observer in `try { … } catch { /* observer */ }`, so a
/// throwing observer neither prevents the remaining observers from running nor
/// escapes into the caller.
#[tokio::test]
async fn exit_listener_panic_does_not_escape_or_block_others() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));

    let order: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
    let first = order.clone();
    terminal.add_exit_listener(Arc::new(move |_| {
        first.lock().unwrap().push("panicking");
        panic!("observer blew up");
    }));
    let second = order.clone();
    terminal.add_exit_listener(Arc::new(move |_| {
        second.lock().unwrap().push("survivor");
    }));

    terminal.ingest_exit(Some(0), None);

    assert_eq!(*order.lock().unwrap(), vec!["panicking", "survivor"]);
    assert_eq!(terminal.state(), SurfaceState::Stopped);
}

#[tokio::test]
async fn state_listener_observes_transitions() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(None, None, None, false));
    let states: Arc<Mutex<Vec<SurfaceState>>> = Arc::new(Mutex::new(Vec::new()));
    let sink = states.clone();
    terminal.set_state_listener(Arc::new(move |state: SurfaceState| {
        sink.lock().unwrap().push(state);
    }));

    terminal.start(start_input()).await.expect("start");
    terminal.stop(None).await.expect("stop");

    let states = states.lock().unwrap().clone();
    assert!(states.contains(&SurfaceState::Starting), "saw {states:?}");
    assert!(states.contains(&SurfaceState::Running), "saw {states:?}");
    assert_eq!(states.first(), Some(&SurfaceState::Starting));
    assert_eq!(states.last(), Some(&SurfaceState::Stopped));
}

#[tokio::test]
async fn snapshot_reports_terminal_metadata() {
    let plane = Arc::new(FakePlane::new());
    let terminal = surface(&plane, options(Some(88), Some(24), None, false));
    terminal.start(start_input()).await.expect("start");

    let snapshot: SurfaceSnapshot = terminal.snapshot().expect("snapshot");

    assert_eq!(snapshot.id, "term-1");
    assert_eq!(snapshot.kind, terminal.kind());
    assert_eq!(snapshot.state, SurfaceState::Running);
    assert_eq!(snapshot.session_id, "sess-1");
    assert!(snapshot.started_at.is_some());
    assert_eq!(snapshot.metadata["cols"], json!(88));
    assert_eq!(snapshot.metadata["rows"], json!(24));
}
