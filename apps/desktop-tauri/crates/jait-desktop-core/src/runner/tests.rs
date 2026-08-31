//! Tests for `crate::runner` — the claude-print + codex rpc engines.
//!
//! The engines spawn real child processes against **fake provider CLIs**
//! (tiny bash scripts implementing the same stdio contracts), so the whole
//! argv/spawn/stream/wait pipeline is exercised end-to-end.

use super::*;
use std::sync::Arc;

const CODEX_THREAD_FAKE_ID: &str = "thr-fake-1";

// ── Helpers ─────────────────────────────────────────────────────────────────

fn temp_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("jait-runner-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn bash_available() -> bool {
    !cfg!(target_os = "windows") && std::path::Path::new("/bin/bash").exists()
}

/// Fake claude --print: eats stdin, emits stream-json lines, exits with
/// $FAKE_EXIT (default 0), prints its cwd for propagation assertions.
fn write_fake_claude(dir: &std::path::Path) -> std::path::PathBuf {
    let script = dir.join("fake-claude.sh");
    std::fs::write(
        &script,
        r#"#!/usr/bin/env bash
cat > /dev/null
echo '{"type":"system","subtype":"init","session_id":"sess-fake"}'
echo "FAKE-CLAUDE-CWD:$(pwd)"
echo "FAKE-CLAUDE-RAN"
echo '{"type":"result","subtype":"success","is_error":false}'
exit ${FAKE_EXIT:-0}
"#,
    )
    .unwrap();
    script
}

/// Fake claude that always fails with a stderr message (exit 7).
fn write_fake_claude_fail(dir: &std::path::Path) -> std::path::PathBuf {
    let script = dir.join("fake-claude-fail.sh");
    std::fs::write(
        &script,
        r#"#!/usr/bin/env bash
cat > /dev/null
echo "fake-cli exploded" >&2
echo "second stderr line" >&2
exit 7
"#,
    )
    .unwrap();
    script
}

/// Fake claude that lingers briefly so concurrent-turn rejection can be tested.
fn write_fake_claude_slow(dir: &std::path::Path) -> std::path::PathBuf {
    let script = dir.join("fake-claude-slow.sh");
    std::fs::write(
        &script,
        r#"#!/usr/bin/env bash
cat > /dev/null
sleep 1
echo '{"type":"result","subtype":"success"}'
exit 0
"#,
    )
    .unwrap();
    script
}

/// Fake codex app-server: minimal JSON-RPC over stdio (id extraction via sed).
/// When `poison.flag` exists next to the script, `turn/start` replies with an
/// rpc error instead of running the turn.
fn write_fake_codex(dir: &std::path::Path) -> std::path::PathBuf {
    let script = dir.join("fake-codex.sh");
    std::fs::write(
        &script,
        r#"#!/usr/bin/env bash
# minimal codex app-server fake (no jq: sed-extract the numeric id + method)
POISON="$(dirname "$0")/poison.flag"
while IFS= read -r line; do
  [ -n "$line" ] || continue
  id=$(printf '%s' "$line" | sed -n 's/^{"id":\([0-9]*\).*/\1/p')
  method=$(printf '%s' "$line" | sed -n 's/.*"method":"\([^"]*\)".*/\1/p')
  case "$method" in
    initialize)
      printf '{"id":%s,"result":{"userAgent":{"name":"fake-codex","version":"0.0.0"}}}\n' "$id" ;;
    thread/start)
      printf '{"id":%s,"result":{"thread":{"id":"thr-fake-1"}}}\n' "$id" ;;
    turn/start)
      if [ -f "$POISON" ]; then
        printf '{"id":%s,"error":{"message":"rpc turn/start failed: poisoned"}}\n' "$id"
        continue
      fi
      printf '{"id":%s,"result":{"turnStatus":"inProgress"}}\n' "$id"
      printf '{"method":"turn/started","params":{"threadId":"thr-fake-1"}}\n'
      echo "FAKE-CODEX-NOTICE"
      printf '{"method":"turn/completed","params":{"threadId":"thr-fake-1"}}\n' ;;
    model/list)
      printf '{"id":%s,"result":{"models":[{"id":"fake-mini"}]}}\n' "$id" ;;
    *)
      printf '{"id":%s,"error":{"message":"rpc unknown method"}}\n' "$id" ;;
  esac
done
"#,
    )
    .unwrap();
    script
}

/// Resolves every provider to the given fixed argv (test double).
#[derive(Clone)]
struct StaticResolver {
    command: ResolvedCommand,
}

impl CommandResolver for StaticResolver {
    fn resolve(&self, _provider: &str) -> Option<ResolvedCommand> {
        Some(self.command.clone())
    }
}

fn spec(provider: &str, dir: &std::path::Path) -> RunnerSpec {
    RunnerSpec {
        session_id: format!("sess-{}", uuid::Uuid::new_v4()),
        provider: provider.into(),
        working_directory: dir.to_string_lossy().into_owned(),
        mode: "default".into(),
        model: Some("fake-model".into()),
        reasoning_effort: Some("medium".into()),
        env: HashMap::new(),
    }
}

/// Shared event sink + polling helper.
#[derive(Clone, Default)]
struct EventSink(Arc<Mutex<Vec<ProviderEvent>>>);

impl EventSink {
    fn push(&self, event: ProviderEvent) {
        self.0.lock().push(event);
    }
    fn snapshot(&self) -> Vec<ProviderEvent> {
        self.0.lock().clone()
    }
    fn wait_for(&self, predicate: impl Fn(&[ProviderEvent]) -> bool, timeout: Duration) -> Vec<ProviderEvent> {
        let deadline = std::time::Instant::now() + timeout;
        loop {
            let events = self.snapshot();
            if predicate(&events) {
                return events;
            }
            if std::time::Instant::now() > deadline {
                return events;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

fn line_text(event: &ProviderEvent) -> Option<&str> {
    match event {
        ProviderEvent::Line { line, .. } => Some(line),
        _ => None,
    }
}

// ── Registry ────────────────────────────────────────────────────────────────

#[test]
fn registry_evicts_beyond_cap() {
    let registry = RunnerRegistry::new();
    for i in 0..(MAX_PROVIDER_SESSIONS as u32 + 1) {
        start(
            &registry,
            &PathCommandResolver,
            RunnerSpec {
                session_id: format!("sess-{i}"),
                provider: "codex".into(),
                working_directory: ".".into(),
                mode: "default".into(),
                model: None,
                reasoning_effort: None,
                env: HashMap::new(),
            },
            |_| {},
        )
        .unwrap();
    }
    assert_eq!(registry.alive_ids().len(), MAX_PROVIDER_SESSIONS);
    assert!(registry.get("sess-0").is_none(), "oldest evicted");
    assert!(registry.get("sess-16").is_some(), "newest kept");
}

// ── Argv / rpc-body parity with electron-main.ts ───────────────────────────

#[test]
fn claude_argv_matches_electron_flags() {
    let dir = temp_dir();
    let mut spec = spec("claude-code", &dir);
    spec.session_id = "abcdef01-2345-6789-abcd-ef0123456789".into();

    spec.mode = "default".into();
    let argv = claude_argv(&spec);
    let expected = [
        "--print",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--session-id",
        "abcdef01-2345-6789-abcd-ef0123456789",
        "--permission-mode",
        "default",
        "--model",
        "fake-model",
        "--effort",
        "medium",
    ];
    assert_eq!(argv, expected, "default-mode argv parity with runClaudeRemoteTurn");

    spec.mode = "full-access".into();
    let argv = claude_argv(&spec);
    assert!(argv.contains(&"--dangerously-skip-permissions".to_string()));
    assert!(!argv.contains(&"--permission-mode".to_string()));
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn codex_thread_body_maps_mode_like_resolveRemoteCodexThreadConfig() {
    let dir = temp_dir();
    let mut spec = spec("codex", &dir);
    spec.mode = "default".into();
    let body = codex_thread_body(&spec);
    assert_eq!(body["approvalPolicy"], "on-request");
    assert_eq!(body["sandbox"], "workspace-write");
    assert_eq!(body["model"], "fake-model");
    assert_eq!(body["cwd"], dir.to_string_lossy().as_ref() as &str);
    assert_eq!(body["experimentalRawEvents"], false);

    spec.mode = "full-access".into();
    let body = codex_thread_body(&spec);
    assert_eq!(body["approvalPolicy"], "never");
    assert_eq!(body["sandbox"], "danger-full-access");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn codex_handshake_body_shape() {
    let body = codex_handshake_body();
    assert_eq!(body["clientInfo"]["name"], "jait-remote");
    assert_eq!(body["capabilities"]["experimentalApi"], true);
}

// ── claude-print engine end-to-end ─────────────────────────────────────────

#[test]
fn claude_turn_streams_lines_and_completes() {
    if !bash_available() {
        return;
    }
    let dir = temp_dir();
    let script = write_fake_claude(&dir);
    let registry = RunnerRegistry::new();
    let sink = EventSink::default();
    let sink_clone = sink.clone();
    let handle = start(
        &registry,
        &StaticResolver {
            command: ResolvedCommand {
                program: "/bin/bash".into(),
                args: vec![script.to_string_lossy().into_owned()],
            },
        },
        spec("claude-code", &dir),
        move |e| sink_clone.push(e),
    )
    .unwrap();

    let result = handle.send_turn(&StaticResolver {
        command: ResolvedCommand {
            program: "/bin/bash".into(),
            args: vec![script.to_string_lossy().into_owned()],
        },
    }, "explain the streaming pipeline");
    assert!(result.is_ok(), "send_turn should succeed: {result:?}");

    let events = sink.wait_for(
        |events| {
            matches!(events.last(), Some(ProviderEvent::TurnCompleted { .. }))
                && events.iter().any(|e| line_text(e).unwrap_or("").contains("FAKE-CLAUDE-RAN"))
        },
        Duration::from_secs(10),
    );

    // Ordering: turn-started comes first, then streamed lines, then completed.
    assert!(
        matches!(events.first(), Some(ProviderEvent::TurnStarted { .. })),
        "first event should be turn-started: {events:?}"
    );
    assert!(
        matches!(events.last(), Some(ProviderEvent::TurnCompleted { .. })),
        "last event should be turn-completed: {events:?}"
    );
    assert!(
        events.len() >= 5,
        "expected init + cwd + ran + result lines, got: {events:?}"
    );
    // stdin propagation: the turn reached the fake CLI in the session cwd.
    let cwd_line = events
        .iter()
        .find_map(|e| {
            line_text(e)
                .and_then(|l| l.strip_prefix("FAKE-CLAUDE-CWD:"))
                .map(str::to_string)
        })
        .expect("fake claude should report its cwd");
    assert_eq!(cwd_line, dir.to_string_lossy(), "child ran in spec cwd");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn claude_turn_failure_carries_stderr_excerpt() {
    if !bash_available() {
        return;
    }
    let dir = temp_dir();
    let script = write_fake_claude_fail(&dir);
    let registry = RunnerRegistry::new();
    let sink = EventSink::default();
    let sink_clone = sink.clone();
    let handle = start(
        &registry,
        &StaticResolver {
            command: ResolvedCommand {
                program: "/bin/bash".into(),
                args: vec![script.to_string_lossy().into_owned()],
            },
        },
        spec("claude-code", &dir),
        move |e| sink_clone.push(e),
    )
    .unwrap();

    let err = handle
        .send_turn(
            &StaticResolver {
                command: ResolvedCommand {
                    program: "/bin/bash".into(),
                    args: vec![script.to_string_lossy().into_owned()],
                },
            },
            "break please",
        )
        .unwrap_err();
    assert!(err.contains("exited with code 7"), "err: {err}");
    assert!(err.contains("fake-cli exploded"), "stderr excerpt appended: {err}");
    // The event pump thread relays asynchronously — poll instead of asserting
    // immediately, otherwise the Error event may not have been delivered yet.
    let events = sink.wait_for(
        |evs| evs.iter().any(|e| matches!(e, ProviderEvent::Error { message, .. } if message.contains("fake-cli exploded"))),
        Duration::from_secs(5),
    );
    assert!(
        events.iter().any(|e| matches!(e, ProviderEvent::Error { message, .. } if message.contains("fake-cli exploded"))),
        "error event relayed: {:?}",
        events
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn claude_rejects_concurrent_turn() {
    if !bash_available() {
        return;
    }
    let dir = temp_dir();
    let script = write_fake_claude_slow(&dir);
    let registry = RunnerRegistry::new();
    let handle = start(
        &registry,
        &StaticResolver {
            command: ResolvedCommand {
                program: "/bin/bash".into(),
                args: vec![script.to_string_lossy().into_owned()],
            },
        },
        spec("claude-code", &dir),
        |_| {},
    )
    .unwrap();
    let resolver = StaticResolver {
        command: ResolvedCommand {
            program: "/bin/bash".into(),
            args: vec![script.to_string_lossy().into_owned()],
        },
    };
    let resolver_for_thread = resolver.clone();

    let h = handle.clone();
    let t = std::thread::spawn(move || h.send_turn(&resolver_for_thread, "slow turn"));
    std::thread::sleep(Duration::from_millis(150));
    let second = handle.send_turn(&resolver, "overlapping turn");
    assert!(
        second.err().unwrap_or_default().contains("turn already running"),
        "second concurrent turn must be rejected"
    );
    assert!(t.join().unwrap().is_ok(), "first turn completes");
    std::fs::remove_dir_all(&dir).ok();
}

// ── codex rpc engine end-to-end ─────────────────────────────────────────────

#[test]
fn codex_turn_handshakes_streams_and_reuses_session() {
    if !bash_available() {
        return;
    }
    let dir = temp_dir();
    let script = write_fake_codex(&dir);
    let registry = RunnerRegistry::new();
    let sink = EventSink::default();
    let sink_clone = sink.clone();
    let resolver = StaticResolver {
        command: ResolvedCommand {
            program: "/bin/bash".into(),
            args: vec![script.to_string_lossy().into_owned()],
        },
    };
    let session_spec = spec("codex", &dir);
    let handle = start(&registry, &resolver, session_spec, move |e| sink_clone.push(e)).unwrap();

    // Turn 1 — spawns app-server, handshakes, runs the turn.
    handle.send_turn(&resolver, "first hello").expect("turn 1 ok");
    // Turn 2 — must reuse the live app-server (no re-handshake events).
    handle.send_turn(&resolver, "second hello").expect("turn 2 ok");

    let events = sink.wait_for(
        |events| events.iter().filter(|e| matches!(e, ProviderEvent::TurnCompleted { .. })).count() >= 2,
        Duration::from_secs(10),
    );

    let lines: Vec<&str> = events.iter().filter_map(line_text).collect();
    assert!(
        lines.iter().any(|l| l.contains("turn/started")),
        "notifications relayed: {lines:?}"
    );
    assert!(
        lines.iter().any(|l| l.contains("FAKE-CODEX-NOTICE")),
        "non-JSON stdout still forwarded: {lines:?}"
    );
    assert!(
        events.iter().filter(|e| matches!(e, ProviderEvent::TurnCompleted { .. })).count() == 2,
        "exactly two completed turns: {events:?}"
    );
    // JSON-RPC *responses* (which carry "id") are settled internally, never
    // relayed as provider lines — only notifications/notifications-like output.
    assert!(
        !lines.iter().any(|l| l.contains("\"result\"")),
        "rpc responses are not echoed as provider lines: {lines:?}"
    );

    // Stop kills the app-server and emits provider.stopped. The relay is
    // async, so poll for it instead of snapshotting immediately.
    handle.stop();
    let events = sink.wait_for(
        |events| events.iter().any(|e| matches!(e, ProviderEvent::Stopped { .. })),
        Duration::from_secs(10),
    );
    assert!(
        matches!(events.last(), Some(ProviderEvent::Stopped { .. })),
        "stop should emit provider.stopped: {events:?}"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn codex_rpc_error_propagates_as_turn_failure() {
    if !bash_available() {
        return;
    }
    let dir = temp_dir();
    let script = write_fake_codex(&dir);
    let registry = RunnerRegistry::new();
    let sink = EventSink::default();
    let sink_clone = sink.clone();
    let resolver = StaticResolver {
        command: ResolvedCommand {
            program: "/bin/bash".into(),
            args: vec![script.to_string_lossy().into_owned()],
        },
    };
    let handle = start(&registry, &resolver, spec("codex", &dir), move |e| sink_clone.push(e)).unwrap();

    // First turn works…
    handle.send_turn(&resolver, "works").expect("first turn ok");

    // …then poison the fake so `turn/start` answers with an rpc error.
    let poison = dir.join("poison.flag");
    std::fs::write(&poison, b"1").unwrap();
    let err = handle.send_turn(&resolver, "should fail").unwrap_err();
    assert!(err.contains("rpc turn/start failed"), "err: {err}");
    // The Error event is relayed asynchronously; poll for it.
    let events = sink.wait_for(
        |events| events.iter().any(|e| matches!(e, ProviderEvent::Error { .. })),
        Duration::from_secs(10),
    );
    assert!(
        events.iter().any(|e| matches!(e, ProviderEvent::Error { .. })),
        "error event relayed: {events:?}"
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn provider_event_serializes_camel_snake_for_renderer() {
    let event = ProviderEvent::TurnStarted {
        session_id: "sess-1".into(),
    };
    let json = serde_json::to_value(&event).unwrap();
    assert_eq!(json["type"], "provider.turn-started");
    let back: ProviderEvent = serde_json::from_value(json).unwrap();
    assert_eq!(back, event);
}