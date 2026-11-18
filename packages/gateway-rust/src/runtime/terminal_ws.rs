//! Composed WebSocket terminal controls.
//!
//! The composed runtime mounts three pieces through `Application::mount_websocket`: an
//! authority that scopes terminals to their registry owner, a supervisor for socket input
//! and resize, and an output pump that sends each chunk once to the owner's subscribed
//! clients. None of them is an embedder hook.

use crate::routes::terminals::TerminalRoutes;
use crate::ws::{WsAuthorizer, WsHub, WsTerminalControl};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Output is polled, not pushed: the PTY reader thread only appends bytes, so the pump
/// observes them at a bounded cadence without coupling to the reader.
const OUTPUT_POLL: Duration = Duration::from_millis(25);

/// Terminal writes that may be in flight at once across the gateway. A write can park its
/// blocking thread until the child drains its input, so the bound protects the pool.
const MAX_INFLIGHT_WRITES: usize = 32;

/// Session delivery keeps its pre-mount behaviour: ownership is checked when a client
/// subscribes (the session authority's `session_owned`), not per delivery. Resources have
/// no trusted ACL yet and stay closed. Terminals resolve against the trusted registry.
pub(crate) struct ComposedWsAuthorizer {
    terminals: TerminalRoutes,
}

impl ComposedWsAuthorizer {
    pub(crate) fn new(terminals: TerminalRoutes) -> Self {
        Self { terminals }
    }
}

impl WsAuthorizer for ComposedWsAuthorizer {
    fn can_access_session(&self, _user_id: &str, _session_id: &str) -> Result<bool, String> {
        Ok(true)
    }

    fn can_access_resource(&self, _user_id: &str, _resource_key: &str) -> Result<bool, String> {
        Ok(false)
    }

    fn can_access_terminal(&self, user_id: &str, terminal_id: &str) -> Result<bool, String> {
        Ok(self.terminals.owns_terminal(user_id, terminal_id))
    }
}

/// Terminal input and resize from the socket. Ownership is checked before a write is
/// admitted, so a refused request never occupies a slot. Resize is a non-blocking ioctl.
pub(crate) struct SupervisedTerminalControl {
    terminals: TerminalRoutes,
    writes: WriteAdmission,
}

impl SupervisedTerminalControl {
    pub(crate) fn new(terminals: TerminalRoutes) -> Self {
        Self {
            terminals,
            writes: WriteAdmission::default(),
        }
    }
}

impl WsTerminalControl for SupervisedTerminalControl {
    fn write(&self, user_id: &str, terminal_id: &str, data: &str) -> Result<(), String> {
        if !self.terminals.owns_terminal(user_id, terminal_id) {
            return Err("terminal not found".into());
        }
        let _slot = self.writes.admit(terminal_id)?;
        self.terminals.write(user_id, terminal_id, data)
    }

    fn resize(&self, user_id: &str, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.terminals.resize(user_id, terminal_id, cols, rows)
    }
}

/// Admits blocking terminal writes: one at a time per terminal, and a gateway-wide cap.
#[derive(Default)]
struct WriteAdmission {
    inflight: Mutex<HashSet<String>>,
}

/// Held for the duration of one blocking write; releasing it frees the terminal and the
/// gateway-wide slot.
struct WriteSlot<'a> {
    admission: &'a WriteAdmission,
    terminal_id: String,
}

impl WriteAdmission {
    fn admit(&self, terminal_id: &str) -> Result<WriteSlot<'_>, String> {
        let mut inflight = self
            .inflight
            .lock()
            .map_err(|_| "terminal input state is poisoned".to_owned())?;
        if inflight.contains(terminal_id) {
            return Err("terminal input is busy".into());
        }
        if inflight.len() >= MAX_INFLIGHT_WRITES {
            return Err("terminal input is saturated".into());
        }
        inflight.insert(terminal_id.to_owned());
        Ok(WriteSlot {
            admission: self,
            terminal_id: terminal_id.to_owned(),
        })
    }
}

impl Drop for WriteSlot<'_> {
    fn drop(&mut self) {
        if let Ok(mut inflight) = self.admission.inflight.lock() {
            inflight.remove(&self.terminal_id);
        }
    }
}

/// Starts the output pump. It holds the hub weakly and ends once the hub is gone.
///
/// Each terminal keeps a byte cursor, so a chunk is sent once. A client receives output
/// from the moment it subscribes; buffered history is not replayed.
pub(crate) fn spawn_output_pump(terminals: TerminalRoutes, hub: &Arc<WsHub>) {
    let weak_hub = Arc::downgrade(hub);
    tokio::spawn(async move {
        let mut streams: HashMap<String, Stream> = HashMap::new();
        let mut tick = tokio::time::interval(OUTPUT_POLL);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            let Some(hub) = weak_hub.upgrade() else {
                return;
            };
            let handles = terminals.terminal_handles();
            streams.retain(|id, _| handles.iter().any(|(live, _)| live == id));
            for (id, handle) in handles {
                let stream = streams.entry(id.clone()).or_default();
                if stream.exited {
                    continue;
                }
                let output = handle.output_since(stream.offset);
                stream.offset = output.next;
                let mut text = stream.utf8.push(&output.bytes);
                if output.closed {
                    text.push_str(&stream.utf8.finish());
                }
                if !text.is_empty() {
                    hub.broadcast_to_terminal(
                        &id,
                        "surface.connected",
                        json!({"type": "terminal.output", "terminalId": id, "data": text}),
                    );
                }
                if output.closed {
                    stream.exited = true;
                    hub.broadcast_to_terminal(
                        &id,
                        "surface.connected",
                        json!({
                            "type": "terminal.exit",
                            "terminalId": id,
                            "exitCode": output.exit_code,
                            "signal": null,
                        }),
                    );
                }
            }
        }
    });
}

#[derive(Default)]
struct Stream {
    offset: usize,
    utf8: Utf8Carry,
    exited: bool,
}

/// Turns a PTY byte stream into text, holding a trailing partial sequence until the next
/// chunk completes it. Invalid bytes become U+FFFD.
#[derive(Default)]
struct Utf8Carry {
    pending: Vec<u8>,
}

impl Utf8Carry {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut out = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    out.push_str(text);
                    self.pending.clear();
                    break;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    out.push_str(&String::from_utf8_lossy(&self.pending[..valid]));
                    match error.error_len() {
                        Some(len) => {
                            out.push('\u{FFFD}');
                            self.pending.drain(..valid + len);
                        }
                        None => {
                            self.pending.drain(..valid);
                            break;
                        }
                    }
                }
            }
        }
        out
    }

    /// Flushes whatever is still pending, lossily, when the stream ends.
    fn finish(&mut self) -> String {
        let rest = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        rest
    }
}

#[cfg(test)]
mod tests {
    use super::{MAX_INFLIGHT_WRITES, Utf8Carry, WriteAdmission};

    #[test]
    fn utf8_carry_holds_a_split_sequence_until_it_completes() {
        let mut carry = Utf8Carry::default();
        assert_eq!(carry.push(&[0xC3]), "");
        assert_eq!(carry.push(&[0xA9, b'!']), "é!");
        assert_eq!(carry.finish(), "");
    }

    #[test]
    fn utf8_carry_replaces_invalid_bytes_and_flushes_a_dangling_tail() {
        let mut carry = Utf8Carry::default();
        assert_eq!(carry.push(b"a\xFFb"), "a\u{FFFD}b");
        assert_eq!(carry.push(&[0xE2, 0x82]), "");
        assert_eq!(carry.finish(), "\u{FFFD}");
    }

    #[test]
    fn write_admission_is_one_per_terminal_and_bounded_across_terminals() {
        let admission = WriteAdmission::default();
        let first = admission.admit("a").unwrap();
        assert!(admission.admit("a").is_err());
        let mut held = vec![first];
        for index in 1..MAX_INFLIGHT_WRITES {
            held.push(admission.admit(&format!("t{index}")).unwrap());
        }
        assert_eq!(
            admission.admit("overflow").err().as_deref(),
            Some("terminal input is saturated")
        );
        drop(held.pop());
        assert!(admission.admit("overflow").is_ok());
    }
}
