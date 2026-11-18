//! Loopback Matrix protocol peer; the gateway uses its real HTTP, sync and Rust crypto code.
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub const ROOM: &str = "!shared:fixture";
const USER: &str = "@alice:fixture";
const DEVICE: &str = "JAIT_GATEWAY";
#[derive(Default)]
struct State {
    logins: usize,
    syncs: usize,
    device_keys: Value,
    events: Vec<Value>,
    sent_types: Vec<String>,
    logout: usize,
    history: Value,
    media: Vec<u8>,
}
pub struct MatrixPeer {
    pub origin: String,
    state: Arc<Mutex<State>>,
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}
impl MatrixPeer {
    pub fn start() -> Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let origin = format!("http://{}", listener.local_addr()?);
        let stop = Arc::new(AtomicBool::new(false));
        let cancelled = stop.clone();
        let state = Arc::new(Mutex::new(State::default()));
        let shared = state.clone();
        let worker = thread::spawn(move || {
            while !cancelled.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let shared = shared.clone();
                        thread::spawn(move || {
                            let _ = serve(stream, shared);
                        });
                    }
                    Err(_) => thread::sleep(Duration::from_millis(10)),
                }
            }
        });
        Ok(Self {
            origin,
            state,
            stop,
            worker: Some(worker),
        })
    }
    pub fn start_with_history() -> Result<(Self, String)> {
        let peer = Self::start()?;
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        let output = std::process::Command::new(
            std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()),
        )
        .arg(root.join("tests/contract/matrix-history-fixture.mjs"))
        .current_dir(&root)
        .output()?;
        ensure!(
            output.status.success(),
            "could not generate encrypted history protocol fixture"
        );
        let history: Value = serde_json::from_slice(&output.stdout)?;
        let key = history["recoveryKey"].as_str().unwrap().to_string();
        {
            let mut state = peer.state.lock().unwrap();
            state.events.push(history["event"].clone());
            state.history = history;
        }
        Ok((peer, key))
    }
    pub fn logins(&self) -> usize {
        self.state.lock().unwrap().logins
    }
    pub fn syncs(&self) -> usize {
        self.state.lock().unwrap().syncs
    }
    pub fn assert_encrypted_send(&self) -> Result<()> {
        let s = self.state.lock().unwrap();
        ensure!(
            s.sent_types == ["m.room.encrypted"],
            "encrypted room was sent with wrong event type: {:?}",
            s.sent_types
        );
        ensure!(
            !serde_json::to_string(&s.events)?.contains("gateway encrypted roundtrip"),
            "message leaked as plaintext to Matrix"
        );
        Ok(())
    }
}
impl Drop for MatrixPeer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
fn state_events() -> Vec<Value> {
    vec![
        json!({"type":"m.room.encryption","state_key":"","content":{"algorithm":"m.megolm.v1.aes-sha2"}}),
        json!({"type":"m.room.history_visibility","state_key":"","content":{"history_visibility":"shared"}}),
        json!({"type":"m.room.name","state_key":"","content":{"name":"Gateway encrypted fixture"}}),
        json!({"type":"m.room.member","state_key":USER,"sender":USER,"content":{"membership":"join","displayname":"Alice"}}),
    ]
}
fn serve(mut stream: TcpStream, shared: Arc<Mutex<State>>) -> Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut bytes = Vec::new();
    let mut buf = [0u8; 4096];
    let header_end = loop {
        let n = stream.read(&mut buf)?;
        ensure!(n > 0, "incomplete request");
        bytes.extend_from_slice(&buf[..n]);
        ensure!(bytes.len() < 2_000_000, "request too large");
        if let Some(p) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            break p + 4;
        }
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
    let path = headers
        .lines()
        .next()
        .unwrap_or("")
        .split_whitespace()
        .nth(1)
        .unwrap_or("");
    let length: usize = headers
        .lines()
        .find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.eq_ignore_ascii_case("content-length")
                .then(|| v.trim().parse().ok())
                .flatten()
        })
        .unwrap_or(0);
    while bytes.len() < header_end + length {
        let n = stream.read(&mut buf)?;
        ensure!(n > 0, "incomplete body");
        bytes.extend_from_slice(&buf[..n]);
    }
    let raw_body = bytes[header_end..header_end + length].to_vec();
    let body: Value =
        serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap_or(json!({}));
    // Bounded long polling avoids a busy sync loop and allows concurrent send requests.
    if path.starts_with("/_matrix/client/v3/sync") {
        thread::sleep(Duration::from_millis(100));
    }
    let mut s = shared.lock().unwrap();
    if path.contains("/media/download/") {
        let data = s.media.clone();
        drop(s);
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            data.len()
        )?;
        stream.write_all(&data)?;
        return Ok(());
    }
    let mut status = 200;
    let response = if path.starts_with("/_matrix/media/v3/upload") {
        s.media = raw_body;
        json!({"content_uri":"mxc://fixture/media"})
    } else if path.ends_with("/login") {
        s.logins += 1;
        json!({"user_id":USER,"device_id":DEVICE,"access_token":"fixture-matrix-token"})
    } else if path.ends_with("/account/whoami") {
        json!({"user_id":USER,"device_id":DEVICE})
    } else if path.ends_with("/logout") {
        s.logout += 1;
        json!({})
    } else if path.ends_with("/joined_rooms") {
        json!({"joined_rooms":[ROOM]})
    } else if path.ends_with("/state/m.room.encryption/") {
        json!({"algorithm":"m.megolm.v1.aes-sha2"})
    } else if path.ends_with("/state/m.room.history_visibility/") {
        json!({"history_visibility":"shared"})
    } else if path.ends_with("/state") {
        json!(state_events())
    } else if path.contains("/joined_members") {
        json!({"joined":{USER:{"display_name":"Alice"}}})
    } else if path.contains("/members") {
        json!({"chunk":state_events().into_iter().filter(|e| e["type"]=="m.room.member").collect::<Vec<_>>()})
    } else if path.ends_with("/keys/upload") {
        if body.get("device_keys").is_some() {
            s.device_keys = body["device_keys"].clone();
        }
        json!({"one_time_key_counts":{"signed_curve25519":50}})
    } else if path.ends_with("/keys/query") {
        json!({"device_keys":{USER:{DEVICE:s.device_keys}},"failures":{}})
    } else if path.ends_with("/keys/claim") {
        json!({"one_time_keys":{},"failures":{}})
    } else if path.contains("/send/") {
        let event_type = path
            .split("/send/")
            .nth(1)
            .unwrap()
            .split('/')
            .next()
            .unwrap()
            .to_string();
        let event_id = format!("$event{}", s.events.len());
        s.sent_types.push(event_type.clone());
        s.events.push(json!({"event_id":event_id,"type":event_type,"sender":USER,"origin_server_ts":1760000000000u64,"content":body}));
        json!({"event_id":event_id})
    } else if path.starts_with("/_matrix/client/v3/sync") {
        s.syncs += 1;
        json!({"next_batch":format!("batch{}",s.syncs),"device_one_time_keys_count":{"signed_curve25519":50},"device_unused_fallback_key_types":["signed_curve25519"],"to_device":{"events":[]},"rooms":{"join":{ROOM:{"state":{"events":state_events()},"timeline":{"events":s.events,"prev_batch":"before"},"unread_notifications":{"notification_count":0}}}}})
    } else if path.ends_with("/room_keys/version") {
        s.history["version"].clone()
    } else if path.contains("/room_keys/keys") {
        s.history["backup"].clone()
    } else if path.ends_with("/versions") {
        json!({"versions":["v1.11"],"unstable_features":{}})
    } else if path.contains("/account_data/") {
        json!({})
    } else {
        status = 404;
        json!({"errcode":"M_NOT_FOUND","error":"fixture endpoint not implemented"})
    };
    let body = response.to_string();
    drop(s);
    write!(
        stream,
        "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    Ok(())
}
