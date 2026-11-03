//! Consumer-level contract evidence for the NATIVE Rust port of the `(root)`
//! PTY broker pair:
//!
//!   * `packages/gateway/src/pty-broker-client.ts` (the client)
//!   * `packages/gateway/src/pty-broker.mjs`        (the wire protocol)
//!         -> `jait_gateway::pty_broker_client`
//!
//! The broker speaks newline-delimited JSON: `{"id", "cmd", ...}` requests on
//! stdin, `{id, ok, ...}` responses and `{event: "output" | "exit", ...}`
//! notifications on stdout. These tests drive the real client over a scripted
//! transport and pin the bytes the broker process would receive, the literal
//! timeout budgets, and the error text consumers see.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use jait_gateway::pty_broker_client::{
    BrokerError, BrokerIo, PtyBrokerClient, RPC_TIMEOUT, STARTUP_TIMEOUT, SpawnOptions,
};

/// Transport that records every payload and can answer with a canned line,
/// emulating the broker echoing a response while the request is in flight.
#[derive(Default)]
struct ScriptedIo {
    writes: Mutex<Vec<String>>,
    replies: Mutex<VecDeque<Option<String>>>,
    client: Mutex<Weak<PtyBrokerClient>>,
    terminates: AtomicUsize,
    write_error: Mutex<Option<String>>,
}

impl ScriptedIo {
    fn push_reply(&self, line: &str) {
        self.replies.lock().unwrap().push_back(Some(line.to_string()));
    }

    fn push_silence(&self) {
        self.replies.lock().unwrap().push_back(None);
    }

    fn writes(&self) -> Vec<String> {
        self.writes.lock().unwrap().clone()
    }
}

impl BrokerIo for ScriptedIo {
    fn write(&self, payload: &str) -> Result<(), String> {
        if let Some(message) = self.write_error.lock().unwrap().clone() {
            return Err(message);
        }
        self.writes.lock().unwrap().push(payload.to_string());
        let reply = self.replies.lock().unwrap().pop_front().flatten();
        if let Some(line) = reply {
            if let Some(client) = self.client.lock().unwrap().upgrade() {
                client.handle_line(&line);
            }
        }
        Ok(())
    }

    fn terminate(&self) {
        self.terminates.fetch_add(1, Ordering::SeqCst);
    }
}

fn client_with_io() -> (Arc<ScriptedIo>, Arc<PtyBrokerClient>) {
    let io = Arc::new(ScriptedIo::default());
    let client = Arc::new(PtyBrokerClient::new(io.clone()));
    *io.client.lock().unwrap() = Arc::downgrade(&client);
    (io, client)
}

// ===========================================================================
// (root) packages/gateway/src/pty-broker-client.ts + src/pty-broker.mjs
// ===========================================================================
mod pty_broker_client_ts {
    use super::*;

    /// `start()` waits 10s for the stderr readiness marker; `rpc()` defaults to
    /// a 15s per-call timeout, after which the exact TS message is surfaced and
    /// the pending entry is dropped so the client stays usable.
    #[tokio::test]
    async fn startup_and_rpc_timeouts_match_the_original_limits() {
        assert_eq!(STARTUP_TIMEOUT, Duration::from_secs(10));
        assert_eq!(RPC_TIMEOUT, Duration::from_secs(15));

        let io = Arc::new(ScriptedIo::default());
        let client = Arc::new(
            PtyBrokerClient::new(io.clone()).with_rpc_timeout(Duration::from_millis(20)),
        );
        *io.client.lock().unwrap() = Arc::downgrade(&client);

        io.push_silence();
        let error = client.write("pty-0", "x").await.unwrap_err();
        assert_eq!(
            error,
            BrokerError::Timeout {
                cmd: "write".to_string()
            }
        );
        assert_eq!(error.message(), "PTY broker RPC timeout: write");
        assert_eq!(error.to_string(), "PTY broker RPC timeout: write");
        assert_eq!(client.pending_len(), 0);

        // The client remains usable after a timeout; ids keep incrementing.
        io.push_reply(r#"{"id":2,"ok":true}"#);
        client.resize("pty-0", 80, 24).await.expect("post-timeout call");
        assert_eq!(
            io.writes(),
            vec![
                "{\"id\":1,\"cmd\":\"write\",\"ptyId\":\"pty-0\",\"data\":\"x\"}\n"
                    .to_string(),
                "{\"id\":2,\"cmd\":\"resize\",\"ptyId\":\"pty-0\",\"cols\":80,\"rows\":24}\n"
                    .to_string(),
            ]
        );
    }

    /// Every command is one newline-terminated JSON object with a monotonic
    /// `id`, and the response fields map onto `SpawnedPty`.
    #[tokio::test]
    async fn command_stream_is_ordered_ndjson_with_monotonic_ids() {
        let (io, client) = client_with_io();
        io.push_reply(r#"{"id":1,"ok":true,"ptyId":"pty-7","pid":4242}"#);
        io.push_reply(r#"{"id":2,"ok":true}"#);
        io.push_reply(r#"{"id":3,"ok":true}"#);
        io.push_reply(r#"{"id":4,"ok":true}"#);

        let spawned = client
            .spawn(&SpawnOptions {
                shell: Some("/bin/bash".to_string()),
                cols: Some(120),
                rows: Some(40),
                cwd: Some("/home/dev".to_string()),
                env: Some(vec![("TERM".to_string(), "xterm-256color".to_string())]),
            })
            .await
            .expect("spawn succeeds");
        assert_eq!(spawned.pty_id, "pty-7");
        assert_eq!(spawned.pid, Some(4242));

        client.write("pty-7", "echo hi\n").await.expect("write");
        client.resize("pty-7", 120, 40).await.expect("resize");
        client.kill("pty-7").await.expect("kill");
        assert_eq!(client.pending_len(), 0);

        assert_eq!(
            io.writes(),
            vec![
                "{\"id\":1,\"cmd\":\"spawn\",\"shell\":\"/bin/bash\",\"cols\":120,\"rows\":40,\
                 \"cwd\":\"/home/dev\",\"env\":{\"TERM\":\"xterm-256color\"}}\n"
                    .to_string(),
                "{\"id\":2,\"cmd\":\"write\",\"ptyId\":\"pty-7\",\"data\":\"echo hi\\n\"}\n"
                    .to_string(),
                "{\"id\":3,\"cmd\":\"resize\",\"ptyId\":\"pty-7\",\"cols\":120,\"rows\":40}\n"
                    .to_string(),
                "{\"id\":4,\"cmd\":\"kill\",\"ptyId\":\"pty-7\"}\n".to_string(),
            ]
        );

        // NDJSON framing: exactly one trailing newline, none embedded.
        for payload in io.writes() {
            assert!(payload.ends_with('\n'));
            assert_eq!(payload.matches('\n').count(), 1, "one record per line: {payload}");
        }
    }

    /// Failure text and defaults mirror `if (!resp.ok) throw new Error(...)`.
    #[tokio::test]
    async fn failure_responses_and_write_errors_surface_typescript_messages() {
        let (io, client) = client_with_io();
        io.push_reply(r#"{"id":1,"ok":false,"error":"shell not found"}"#);
        let error = client.spawn(&SpawnOptions::default()).await.unwrap_err();
        assert_eq!(error, BrokerError::Failure("shell not found".to_string()));
        assert_eq!(error.message(), "shell not found");
        assert_eq!(error.to_string(), "shell not found");
        assert_eq!(client.pending_len(), 0);

        // A response without `ok` is a failure with the command default text.
        io.push_reply(r#"{"id":2}"#);
        let error = client.resize("pty-1", 80, 24).await.unwrap_err();
        assert_eq!(error.to_string(), "resize failed");

        // `ok` but no `ptyId` is a spawn failure.
        io.push_reply(r#"{"id":3,"ok":true}"#);
        let error = client.spawn(&SpawnOptions::default()).await.unwrap_err();
        assert_eq!(error.to_string(), "spawn failed");

        // Transport write errors are reported verbatim and clear the pending id.
        *io.write_error.lock().unwrap() = Some("write EPIPE".to_string());
        let error = client.kill("pty-1").await.unwrap_err();
        assert_eq!(error.to_string(), "write EPIPE");
        assert_eq!(client.pending_len(), 0);
    }

    /// `start()` flips readiness only on the exact stderr marker; `stop()`
    /// rejects in-flight calls with `Broker stopping`, terminates the child once
    /// and leaves the client unready.
    #[tokio::test]
    async fn ready_marker_gating_and_stop_accounting() {
        let (io, client) = client_with_io();
        assert!(!client.is_ready());
        assert!(!client.handle_stderr_line("pty-broker read"));
        assert!(!client.is_ready());
        assert!(client.handle_stderr_line("[broker] pty-broker ready"));
        assert!(client.is_ready());

        // In-flight call with no reply, then stop.
        io.push_silence();
        let pending = tokio::spawn({
            let client = client.clone();
            async move { client.write("pty-9", "x").await }
        });
        for _ in 0..100 {
            if client.pending_len() == 1 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert_eq!(client.pending_len(), 1);

        client.stop();
        let error = pending.await.expect("task joins").unwrap_err();
        assert_eq!(error, BrokerError::Stopped);
        assert_eq!(error.to_string(), "Broker stopping");
        assert_eq!(io.terminates.load(Ordering::SeqCst), 1);
        assert!(!client.is_ready());
        assert_eq!(client.pending_len(), 0);
    }
}
