//! Gateway websocket hub.
//!
//! Partial implementation of `packages/gateway/src/ws.ts`. This module is not
//! contract complete: resource subscriptions fail closed unless authorization is
//! integrated, and transport, node lifecycle and client parity remain open.
//! Dispatcher cancellation depends on the injected implementation honoring drop.
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    sync::{broadcast, mpsc, oneshot},
};

/// RFC 6455 handshake GUID.
pub const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
/// Close code used when a client fails authentication/authorisation (`4001`).
pub const CLOSE_UNAUTHORIZED: u16 = 4001;
/// Close code used when the gateway goes away (`1001`).
pub const CLOSE_GOING_AWAY: u16 = 1001;
/// Default heartbeat interval (`ws.ts`: 30 s ping sweep).
pub const DEFAULT_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
/// Default deadline for a pong before the socket is terminated.
pub const DEFAULT_HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);
/// Default maximum reassembled message size (8 MiB).
pub const DEFAULT_MAX_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
/// Default bound of the per-connection outbound queue.
pub const DEFAULT_OUTBOUND_CAPACITY: usize = 256;
/// Default timeout for a node terminal operation.
pub const DEFAULT_TERMINAL_OP_TIMEOUT: Duration = Duration::from_secs(15);
/// Default deadline for the HTTP upgrade request.
pub const DEFAULT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
/// Maximum time to attempt a close frame before dropping the transport.
const CLOSE_WRITE_TIMEOUT: Duration = Duration::from_secs(1);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Transport/protocol failure on a websocket connection.
#[derive(Debug)]
pub enum WsError {
    Io(std::io::Error),
    Protocol(String),
    TooLarge { len: u64, max: usize },
    Disconnected,
}

impl std::fmt::Display for WsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "io error: {error}"),
            Self::Protocol(message) => write!(f, "protocol error: {message}"),
            Self::TooLarge { len, max } => {
                write!(f, "websocket message of {len} bytes exceeds limit {max}")
            }
            Self::Disconnected => write!(f, "websocket disconnected"),
        }
    }
}

impl std::error::Error for WsError {}

impl From<std::io::Error> for WsError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

/// Parsed HTTP upgrade request.
#[derive(Clone, Debug)]
pub struct HandshakeRequest {
    pub method: String,
    pub target: String,
    pub headers: Vec<(String, String)>,
}

impl HandshakeRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    /// Request path without the query string.
    pub fn path(&self) -> &str {
        match self.target.split_once('?') {
            Some((path, _)) => path,
            None => &self.target,
        }
    }

    /// Select the first query token, then the bearer header, then the cookie.
    pub fn bearer_token(&self) -> Option<String> {
        let query_token = self.target.split_once('?').and_then(|(_, query)| {
            query.split('&').find_map(|pair| {
                let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
                (percent_decode(key) == "token").then(|| percent_decode(value))
            })
        });
        let header_token = || {
            self.header("authorization")
                .and_then(|value| value.strip_prefix("Bearer "))
                .map(str::to_owned)
        };
        let cookie_token = || {
            self.header("cookie").and_then(|value| {
                value
                    .split(';')
                    .map(str::trim)
                    .find_map(|part| part.strip_prefix("jait_token=").map(str::to_owned))
            })
        };
        query_token
            .or_else(header_token)
            .or_else(cookie_token)
            .filter(|token| !token.is_empty())
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(byte) => {
                        out.push(byte);
                        index += 3;
                    }
                    Err(_) => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Read (at most 16 KiB of) an HTTP upgrade request head.
pub async fn read_handshake<R>(reader: &mut R) -> Result<HandshakeRequest, WsError>
where
    R: AsyncRead + Unpin,
{
    const MAX_HEAD: usize = 16 * 1024;
    let mut buffer = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    loop {
        let read = reader.read(&mut byte).await?;
        if read == 0 {
            return Err(WsError::Disconnected);
        }
        buffer.push(byte[0]);
        if buffer.len() >= 4 && buffer.ends_with(b"\r\n\r\n") {
            break;
        }
        if buffer.len() > MAX_HEAD {
            return Err(WsError::TooLarge {
                len: buffer.len() as u64,
                max: MAX_HEAD,
            });
        }
    }
    let text = String::from_utf8_lossy(&buffer).into_owned();
    let mut lines = text.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();
    let mut headers = Vec::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_string(), value.trim().to_string()));
        }
    }
    Ok(HandshakeRequest {
        method,
        target,
        headers,
    })
}

/// Result of validating an upgrade request.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HandshakeOutcome {
    Accepted {
        accept_key: String,
    },
    Rejected {
        status: u16,
        reason: &'static str,
        body: String,
    },
}

impl HandshakeOutcome {
    pub fn accept_key(&self) -> Option<&str> {
        match self {
            Self::Accepted { accept_key } => Some(accept_key),
            Self::Rejected { .. } => None,
        }
    }

    pub fn status(&self) -> u16 {
        match self {
            Self::Accepted { .. } => 101,
            Self::Rejected { status, .. } => *status,
        }
    }
}

/// Validate the upgrade request against the hub path, mirroring the
/// `server.on("upgrade")` checks in `ws.ts` (method, path, version, key).
pub fn negotiate_handshake(request: &HandshakeRequest, expected_path: &str) -> HandshakeOutcome {
    let reject = |status: u16, reason: &'static str, body: &str| HandshakeOutcome::Rejected {
        status,
        reason,
        body: body.to_string(),
    };
    if !request.method.eq_ignore_ascii_case("GET") {
        return reject(405, "Method Not Allowed", "websocket upgrade requires GET");
    }
    if request.path() != expected_path {
        return reject(404, "Not Found", "unknown websocket endpoint");
    }
    let upgrade = request.header("upgrade").unwrap_or_default();
    if !upgrade.eq_ignore_ascii_case("websocket") {
        return reject(400, "Bad Request", "missing Upgrade: websocket");
    }
    let connection = request.header("connection").unwrap_or_default();
    if !connection
        .split(',')
        .any(|token| token.trim().eq_ignore_ascii_case("upgrade"))
    {
        return reject(400, "Bad Request", "missing Connection: Upgrade");
    }
    match request.header("sec-websocket-version") {
        Some("13") => {}
        Some(_) => {
            return reject(
                426,
                "Upgrade Required",
                "unsupported websocket version, expected 13",
            );
        }
        None => return reject(400, "Bad Request", "missing Sec-WebSocket-Version"),
    }
    let Some(key) = request.header("sec-websocket-key") else {
        return reject(400, "Bad Request", "missing Sec-WebSocket-Key");
    };
    match BASE64.decode(key.trim()) {
        Ok(decoded) if decoded.len() == 16 => HandshakeOutcome::Accepted {
            accept_key: sha1_accept_key(key.trim()),
        },
        _ => reject(400, "Bad Request", "invalid Sec-WebSocket-Key"),
    }
}

/// Encode a complete `101 Switching Protocols` response.
pub fn switching_protocols_response(accept_key: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {accept_key}\r\n\r\n"
    )
    .into_bytes()
}

/// Encode an HTTP rejection for a failed upgrade.
pub fn rejection_response(status: u16, reason: &str, body: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: text/plain; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{body}",
        body.len()
    )
    .into_bytes()
}

/// `Sec-WebSocket-Accept`: base64(SHA-1(key + GUID)).
pub fn sha1_accept_key(client_key: &str) -> String {
    let mut input = String::with_capacity(client_key.len() + WS_GUID.len());
    input.push_str(client_key);
    input.push_str(WS_GUID);
    BASE64.encode(sha1(input.as_bytes()))
}

/// Minimal SHA-1 (FIPS 180-4). Vendored because the crate has no `sha1`
/// dependency and RFC 6455 mandates SHA-1 for the accept key.
pub fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [
        0x6745_2301,
        0xEFCD_AB89,
        0x98BA_DCFE,
        0x1032_5476,
        0xC3D2_E1F0,
    ];
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut message = data.to_vec();
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in message.chunks(64) {
        let mut w = [0u32; 80];
        for index in 0..16 {
            w[index] = u32::from_be_bytes([
                chunk[index * 4],
                chunk[index * 4 + 1],
                chunk[index * 4 + 2],
                chunk[index * 4 + 3],
            ]);
        }
        for index in 16..80 {
            w[index] = (w[index - 3] ^ w[index - 8] ^ w[index - 14] ^ w[index - 16]).rotate_left(1);
        }
        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for (index, word) in w.iter().enumerate() {
            let (f, k) = match index {
                0..=19 => ((b & c) | ((!b) & d), 0x5A82_7999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9_EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1B_BCDC),
                _ => (b ^ c ^ d, 0xCA62_C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(*word);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (index, word) in h.iter().enumerate() {
        out[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/// Websocket opcode.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpCode {
    Continuation,
    Text,
    Binary,
    Close,
    Ping,
    Pong,
}

impl OpCode {
    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte & 0x0f {
            0x0 => Some(Self::Continuation),
            0x1 => Some(Self::Text),
            0x2 => Some(Self::Binary),
            0x8 => Some(Self::Close),
            0x9 => Some(Self::Ping),
            0xa => Some(Self::Pong),
            _ => None,
        }
    }

    pub fn as_byte(self) -> u8 {
        match self {
            Self::Continuation => 0x0,
            Self::Text => 0x1,
            Self::Binary => 0x2,
            Self::Close => 0x8,
            Self::Ping => 0x9,
            Self::Pong => 0xa,
        }
    }

    pub fn is_control(self) -> bool {
        matches!(self, Self::Close | Self::Ping | Self::Pong)
    }
}

/// A complete (reassembled) websocket message or control frame.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Frame {
    pub opcode: OpCode,
    pub payload: Vec<u8>,
    pub masked: bool,
}

impl Frame {
    pub fn text(&self) -> Option<&str> {
        if self.opcode == OpCode::Text {
            std::str::from_utf8(&self.payload).ok()
        } else {
            None
        }
    }

    pub fn close_code(&self) -> Option<u16> {
        if self.opcode != OpCode::Close || self.payload.len() < 2 {
            return None;
        }
        Some(u16::from_be_bytes([self.payload[0], self.payload[1]]))
    }
}

/// Serialise a server->client frame (never masked).
pub fn encode_frame(opcode: OpCode, payload: &[u8]) -> Vec<u8> {
    encode_frame_masked(opcode, payload, None)
}

fn encode_frame_masked(opcode: OpCode, payload: &[u8], mask: Option<[u8; 4]>) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 14);
    out.push(0x80 | opcode.as_byte());
    let mask_bit = if mask.is_some() { 0x80 } else { 0x00 };
    match payload.len() {
        len @ 0..=125 => out.push(mask_bit | len as u8),
        len @ 126..=65535 => {
            out.push(mask_bit | 126);
            out.extend_from_slice(&(len as u16).to_be_bytes());
        }
        len => {
            out.push(mask_bit | 127);
            out.extend_from_slice(&(len as u64).to_be_bytes());
        }
    }
    match mask {
        Some(key) => {
            out.extend_from_slice(&key);
            out.extend(
                payload
                    .iter()
                    .enumerate()
                    .map(|(index, byte)| byte ^ key[index % 4]),
            );
        }
        None => out.extend_from_slice(payload),
    }
    out
}

/// Write a server->client frame.
pub async fn write_frame<W>(writer: &mut W, opcode: OpCode, payload: &[u8]) -> Result<(), WsError>
where
    W: AsyncWrite + Unpin,
{
    tokio::time::timeout(Duration::from_secs(5), async {
        writer.write_all(&encode_frame(opcode, payload)).await?;
        writer.flush().await
    })
    .await
    .map_err(|_| WsError::Protocol("websocket write timed out".into()))??;
    Ok(())
}

/// Write a client->server frame; the RFC requires client frames to be masked.
pub async fn write_client_frame<W>(
    writer: &mut W,
    opcode: OpCode,
    payload: &[u8],
    mask: [u8; 4],
) -> Result<(), WsError>
where
    W: AsyncWrite + Unpin,
{
    writer
        .write_all(&encode_frame_masked(opcode, payload, Some(mask)))
        .await?;
    writer.flush().await?;
    Ok(())
}

/// Write a close frame carrying `code`/`reason` (server side, unmasked).
pub async fn write_close<W>(writer: &mut W, code: u16, reason: &str) -> Result<(), WsError>
where
    W: AsyncWrite + Unpin,
{
    let mut payload = Vec::with_capacity(2 + reason.len());
    payload.extend_from_slice(&code.to_be_bytes());
    payload.extend_from_slice(reason.as_bytes());
    write_frame(writer, OpCode::Close, &payload).await
}

/// Read one logical message, reassembling fragments. Returns `Ok(None)` on a
/// clean EOF before the first byte of a frame. This stateless helper rejects
/// control frames interleaved with fragments; the connection driver retains state.
pub async fn read_frame<R>(
    reader: &mut R,
    max_message_bytes: usize,
) -> Result<Option<Frame>, WsError>
where
    R: AsyncRead + Unpin,
{
    let mut fragmented = None;
    let frame = read_frame_inner(reader, max_message_bytes, false, &mut fragmented).await?;
    if fragmented.is_some() {
        return Err(WsError::Protocol(
            "interleaved control frame requires persistent reader state".into(),
        ));
    }
    Ok(frame)
}

async fn read_frame_inner<R: AsyncRead + Unpin>(
    reader: &mut R,
    max_message_bytes: usize,
    require_mask: bool,
    fragmented: &mut Option<(OpCode, Vec<u8>)>,
) -> Result<Option<Frame>, WsError> {
    loop {
        let mut head = [0u8; 2];
        match reader.read_exact(&mut head).await {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
            Err(error) => return Err(WsError::Io(error)),
        }
        let fin = head[0] & 0x80 != 0;
        let reserved = head[0] & 0x70;
        if reserved != 0 {
            return Err(WsError::Protocol(
                "reserved bits must be zero (no extensions negotiated)".into(),
            ));
        }
        let Some(opcode) = OpCode::from_byte(head[0]) else {
            return Err(WsError::Protocol(format!(
                "unknown opcode 0x{:x}",
                head[0] & 0x0f
            )));
        };
        let masked = head[1] & 0x80 != 0;
        if require_mask && !masked {
            return Err(WsError::Protocol("client frames must be masked".into()));
        }
        let length_marker = head[1] & 0x7f;
        let length = match length_marker {
            0..=125 => u64::from(length_marker),
            126 => {
                let mut bytes = [0u8; 2];
                reader.read_exact(&mut bytes).await?;
                u64::from(u16::from_be_bytes(bytes))
            }
            _ => {
                let mut bytes = [0u8; 8];
                reader.read_exact(&mut bytes).await?;
                u64::from_be_bytes(bytes)
            }
        };
        if (length_marker == 126 && length < 126)
            || (length_marker == 127 && (length < 65536 || length >> 63 != 0))
        {
            return Err(WsError::Protocol("invalid frame length encoding".into()));
        }
        if opcode.is_control() && (!fin || length > 125) {
            return Err(WsError::Protocol("invalid control frame".into()));
        }
        if length > max_message_bytes as u64 {
            return Err(WsError::TooLarge {
                len: length,
                max: max_message_bytes,
            });
        }
        let mask = if masked {
            let mut key = [0u8; 4];
            reader.read_exact(&mut key).await?;
            Some(key)
        } else {
            None
        };
        let mut payload = vec![0u8; length as usize];
        reader.read_exact(&mut payload).await?;
        if let Some(key) = mask {
            for (index, byte) in payload.iter_mut().enumerate() {
                *byte ^= key[index % 4];
            }
        }

        if opcode.is_control() {
            if !fin {
                return Err(WsError::Protocol(
                    "control frames must not be fragmented".into(),
                ));
            }
            if payload.len() > 125 {
                return Err(WsError::Protocol("control frame payload too long".into()));
            }
            return Ok(Some(Frame {
                opcode,
                payload,
                masked,
            }));
        }

        match (&mut *fragmented, opcode) {
            (None, OpCode::Continuation) => {
                return Err(WsError::Protocol(
                    "continuation frame without a start frame".into(),
                ));
            }
            (Some(_), OpCode::Text | OpCode::Binary) => {
                return Err(WsError::Protocol(
                    "new data frame while a fragmented message is open".into(),
                ));
            }
            (None, start) => {
                if fin {
                    return Ok(Some(Frame {
                        opcode: start,
                        payload,
                        masked,
                    }));
                }
                *fragmented = Some((start, payload));
            }
            (Some((start, buffer)), OpCode::Continuation) => {
                let combined = buffer.len().saturating_add(payload.len());
                if combined > max_message_bytes {
                    return Err(WsError::TooLarge {
                        len: combined as u64,
                        max: max_message_bytes,
                    });
                }
                buffer.extend_from_slice(&payload);
                if fin {
                    let (opcode, payload) = fragmented.take().expect("fragment state");
                    return Ok(Some(Frame {
                        opcode,
                        payload,
                        masked,
                    }));
                }
                let _ = start;
            }
            (Some(_), _) => unreachable!("control frames returned above"),
        }
    }
}

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn envelope(kind: &str, session_id: Option<&str>, payload: Value) -> Value {
    let mut map = Map::new();
    map.insert("type".into(), Value::String(kind.to_string()));
    map.insert(
        "sessionId".into(),
        session_id
            .map(|id| Value::String(id.to_string()))
            .unwrap_or(Value::Null),
    );
    map.insert("timestamp".into(), Value::String(now_iso8601()));
    map.insert("payload".into(), payload);
    Value::Object(map)
}

fn error_envelope(session_id: Option<&str>, code: &str, message: &str) -> Value {
    envelope(
        "error",
        session_id,
        json!({ "code": code, "message": message }),
    )
}

// ---------------------------------------------------------------------------
// Injected boundaries
// ---------------------------------------------------------------------------

/// Identity resolved from a token.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WsIdentity {
    pub user_id: String,
    pub session_id: Option<String>,
    /// Absolute Unix expiration time in seconds; verifiers must supply a trusted value.
    pub expires_at: u64,
}

/// Token verification boundary (TS: `tokenService.verify`, a JWT check).
pub trait TokenVerifier: Send + Sync + 'static {
    fn verify(&self, token: &str) -> Result<WsIdentity, String>;
}

/// Token -> identity table. Real logic, used by embeddings/tests that do not
/// mint JWTs.
#[derive(Default)]
pub struct StaticTokenVerifier {
    tokens: HashMap<String, WsIdentity>,
}

impl StaticTokenVerifier {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_token(mut self, token: impl Into<String>, identity: WsIdentity) -> Self {
        self.tokens.insert(token.into(), identity);
        self
    }

    pub fn insert(&mut self, token: impl Into<String>, identity: WsIdentity) {
        self.tokens.insert(token.into(), identity);
    }
}

/// Verifier used when an embedder injects none: every token is rejected, exactly
/// like a gateway with an empty token store.
#[derive(Debug, Default, Clone, Copy)]
pub struct DenyAllTokens;

impl TokenVerifier for DenyAllTokens {
    fn verify(&self, _token: &str) -> Result<WsIdentity, String> {
        Err("invalid token".into())
    }
}

impl TokenVerifier for StaticTokenVerifier {
    fn verify(&self, token: &str) -> Result<WsIdentity, String> {
        self.tokens
            .get(token)
            .cloned()
            .ok_or_else(|| "invalid token".into())
    }
}

/// Synchronous, non-blocking authority consulted at binding, enqueue and dequeue.
/// Errors deny access. Resource keys are opaque and must be resolved by the
/// implementation against trusted canonical resource records.
pub trait WsAuthorizer: Send + Sync + 'static {
    fn can_access_session(&self, user_id: &str, session_id: &str) -> Result<bool, String>;
    fn can_access_resource(&self, user_id: &str, resource_key: &str) -> Result<bool, String>;
    /// Resolve this exact terminal ID in the trusted registry and check current ownership.
    fn can_access_terminal(&self, _user_id: &str, _terminal_id: &str) -> Result<bool, String> {
        Ok(false)
    }
}

#[derive(Clone)]
enum DeliveryScope {
    Unscoped {
        generation: u64,
        requires_auth: bool,
    },
    OwnerSessions {
        user_id: String,
        session_ids: Vec<String>,
        generation: u64,
    },
    Session {
        user_id: String,
        session_id: String,
        generation: u64,
    },
    Terminal {
        user_id: String,
        terminal_id: String,
        generation: u64,
    },
    Resource {
        user_id: String,
        key: String,
        generation: u64,
    },
}

struct OutboundMessage {
    value: Value,
    scope: DeliveryScope,
}

/// Future returned by [`TerminalOpDispatcher::dispatch`].
pub type OpFuture<'a> = Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;

/// Node message transport boundary (TS: `messenger.request` to the node
/// registry). Implementations own process/socket plumbing.
pub trait TerminalOpDispatcher: Send + Sync + 'static {
    fn dispatch<'a>(
        &'a self,
        node_id: &'a str,
        op: &str,
        args: Value,
        timeout: Duration,
    ) -> OpFuture<'a>;
}

/// Dispatcher used when the embedder injects none.
#[derive(Debug, Default, Clone, Copy)]
pub struct OfflineNodes;

impl TerminalOpDispatcher for OfflineNodes {
    fn dispatch<'a>(
        &'a self,
        node_id: &'a str,
        _op: &str,
        _args: Value,
        _timeout: Duration,
    ) -> OpFuture<'a> {
        Box::pin(async move { Err(format!("node {node_id} is not connected")) })
    }
}

/// Future returned by [`WsControlPlane::proxy_terminal_op`].
pub type TerminalOpFuture<'a> = Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;

/// What surfaces need from the hub (`WsControlPlane` in `ws.ts`).
pub trait WsControlPlane: Send + Sync {
    /// Round-trip a terminal op to a node and await its result.
    fn proxy_terminal_op<'a>(
        &'a self,
        node_id: &'a str,
        op: &'a str,
        args: Value,
        timeout: Duration,
    ) -> TerminalOpFuture<'a>;

    /// Fire-and-forget terminal op (`input`, `resize`).
    fn send_terminal_op(&self, node_id: &str, op: &str, args: Value) -> Result<(), String>;
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

/// Authoritative user-existence check used to admit and keep WebSocket identities.
///
/// Implemented by the database-backed [`crate::ws_user_authority::WsUserAuthority`]
/// and by test doubles. Implementations must fail closed: errors, timeouts and
/// overload all report `false`.
pub trait WsUserAuthorityCheck: Send + Sync {
    fn user_exists<'a>(
        &'a self,
        user_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = bool> + Send + 'a>>;
}

impl WsUserAuthorityCheck for crate::ws_user_authority::WsUserAuthority {
    fn user_exists<'a>(
        &'a self,
        user_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = bool> + Send + 'a>> {
        Box::pin(async move {
            crate::ws_user_authority::WsUserAuthority::user_exists(self, user_id).await
        })
    }
}

/// Hub configuration.
#[derive(Clone)]
pub struct WsHubConfig {
    /// Upgrade path served by the hub (`/ws`).
    pub path: String,
    pub heartbeat_interval: Duration,
    pub heartbeat_timeout: Duration,
    pub handshake_timeout: Duration,
    pub max_message_bytes: usize,
    pub outbound_capacity: usize,
    pub terminal_op_timeout: Duration,
    pub token_verifier: Arc<dyn TokenVerifier>,
    pub dispatcher: Arc<dyn TerminalOpDispatcher>,
    pub authorizer: Option<Arc<dyn WsAuthorizer>>,
    /// Database-backed existence check for authenticated users.
    ///
    /// When set, every authentication attempt and every protected message is
    /// revalidated against the shared runtime database; lookups that time out,
    /// fail, or report a missing user deny, and public denials keep the
    /// existing wording. When unset the hub stays in-memory only.
    pub user_authority: Option<Arc<dyn WsUserAuthorityCheck>>,
    pub questions: Option<crate::services::input_requests::UserQuestionService>,
    pub session_authority: Option<Arc<crate::ws_user_authority::WsUserAuthority>>,
}

impl std::fmt::Debug for WsHubConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WsHubConfig")
            .field("path", &self.path)
            .field("heartbeat_interval", &self.heartbeat_interval)
            .field("heartbeat_timeout", &self.heartbeat_timeout)
            .field("max_message_bytes", &self.max_message_bytes)
            .field("outbound_capacity", &self.outbound_capacity)
            .finish_non_exhaustive()
    }
}

impl Default for WsHubConfig {
    fn default() -> Self {
        Self {
            path: "/ws".into(),
            heartbeat_interval: DEFAULT_HEARTBEAT_INTERVAL,
            heartbeat_timeout: DEFAULT_HEARTBEAT_TIMEOUT,
            handshake_timeout: DEFAULT_HANDSHAKE_TIMEOUT,
            max_message_bytes: DEFAULT_MAX_MESSAGE_BYTES,
            outbound_capacity: DEFAULT_OUTBOUND_CAPACITY,
            terminal_op_timeout: DEFAULT_TERMINAL_OP_TIMEOUT,
            token_verifier: Arc::new(DenyAllTokens),
            dispatcher: Arc::new(OfflineNodes),
            authorizer: None,
            user_authority: None,
            questions: None,
            session_authority: None,
        }
    }
}

struct ClientEntry {
    id: String,
    user_id: Option<String>,
    session_id: Option<String>,
    authenticated: bool,
    expires_at: u64,
    subscriptions: HashSet<String>,
    terminals: HashSet<String>,
    generation: u64,
    outbound: mpsc::Sender<OutboundMessage>,
    _disconnect: oneshot::Sender<()>,
    dropped: u64,
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    connected_at: Instant,
}

/// Snapshot of one connected client (for tests/diagnostics).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WsClientSnapshot {
    pub id: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub authenticated: bool,
    pub subscriptions: Vec<String>,
    pub dropped: u64,
}

#[derive(Default)]
struct HubInner {
    clients: HashMap<String, ClientEntry>,
    stopped: bool,
}

/// The gateway websocket hub.
pub struct WsHub {
    config: WsHubConfig,
    inner: Mutex<HubInner>,
    shutdown: broadcast::Sender<String>,
    next_client_id: AtomicU64,
}

impl std::fmt::Debug for WsHub {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WsHub")
            .field("config", &self.config)
            .field("clients", &self.client_count())
            .finish()
    }
}

impl WsHub {
    pub fn new(config: WsHubConfig) -> Self {
        let (shutdown, _) = broadcast::channel(16);
        Self {
            config,
            inner: Mutex::new(HubInner::default()),
            shutdown,
            next_client_id: AtomicU64::new(1),
        }
    }

    pub fn config(&self) -> &WsHubConfig {
        &self.config
    }

    pub fn client_count(&self) -> usize {
        self.inner.lock().expect("hub state").clients.len()
    }

    pub fn is_stopped(&self) -> bool {
        self.inner.lock().expect("hub state").stopped
    }

    /// Sorted client snapshots.
    pub fn clients(&self) -> Vec<WsClientSnapshot> {
        let inner = self.inner.lock().expect("hub state");
        let mut clients: Vec<WsClientSnapshot> = inner
            .clients
            .values()
            .map(|client| {
                let mut subscriptions: Vec<String> = client.subscriptions.iter().cloned().collect();
                subscriptions.sort();
                WsClientSnapshot {
                    id: client.id.clone(),
                    user_id: client.user_id.clone(),
                    session_id: client.session_id.clone(),
                    authenticated: client.authenticated,
                    subscriptions,
                    dropped: client.dropped,
                }
            })
            .collect();
        clients.sort_by(|left, right| left.id.cmp(&right.id));
        clients
    }

    fn expiry_current(expires_at: u64) -> bool {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .is_ok_and(|now| now.as_secs() < expires_at)
    }

    fn identity_current(identity: &WsIdentity) -> bool {
        !identity.user_id.is_empty() && Self::expiry_current(identity.expires_at)
    }

    fn credential_current(client: &ClientEntry) -> bool {
        client.authenticated && Self::expiry_current(client.expires_at)
    }

    // A database lookup must never hold the hub mutex. Recheck the exact
    // connection and authentication generation after awaiting it so an old
    // answer cannot authorize a replacement or reauthenticated client.
    async fn current_user_with<F, Fut>(&self, client_id: &str, lookup: F) -> bool
    where
        F: FnOnce(String) -> Fut,
        Fut: std::future::Future<Output = bool>,
    {
        let (user_id, generation, sender) = {
            let inner = self.inner.lock().expect("hub state");
            let Some(client) = inner
                .clients
                .get(client_id)
                .filter(|c| Self::credential_current(c))
            else {
                return false;
            };
            let Some(user_id) = client.user_id.clone().filter(|id| !id.is_empty()) else {
                return false;
            };
            (user_id, client.generation, client.outbound.clone())
        };
        if !lookup(user_id.clone()).await {
            return false;
        }
        let inner = self.inner.lock().expect("hub state");
        inner.clients.get(client_id).is_some_and(|client| {
            Self::credential_current(client)
                && client.user_id.as_deref() == Some(user_id.as_str())
                && client.generation == generation
                && client.outbound.same_channel(&sender)
        })
    }

    async fn current_user(&self, client_id: &str, authority: &dyn WsUserAuthorityCheck) -> bool {
        self.current_user_with(client_id, |user_id| async move {
            authority.user_exists(&user_id).await
        })
        .await
    }

    pub fn has_authority(&self, client_id: &str) -> bool {
        self.inner
            .lock()
            .expect("hub state")
            .clients
            .get(client_id)
            .map(Self::credential_current)
            .unwrap_or(false)
    }

    pub fn subscriptions(&self, client_id: &str) -> Vec<String> {
        let inner = self.inner.lock().expect("hub state");
        let mut list: Vec<String> = inner
            .clients
            .get(client_id)
            .map(|client| client.subscriptions.iter().cloned().collect())
            .unwrap_or_default();
        list.sort();
        list
    }

    /// Directly enqueue an envelope for one client. Slow consumers are
    /// terminated once their bounded queue overflows (backpressure).
    fn send_to_client(&self, client_id: &str, envelope: Value) -> bool {
        let mut inner = self.inner.lock().expect("hub state");
        let Some(client) = inner.clients.get_mut(client_id) else {
            return false;
        };
        match client.outbound.try_send(OutboundMessage {
            value: envelope,
            scope: DeliveryScope::Unscoped {
                generation: client.generation,
                requires_auth: client.authenticated,
            },
        }) {
            Ok(()) => true,
            Err(mpsc::error::TrySendError::Full(_)) => {
                client.dropped = client.dropped.saturating_add(1);
                inner.clients.remove(client_id);
                false
            }
            Err(mpsc::error::TrySendError::Closed(_)) => {
                inner.clients.remove(client_id);
                false
            }
        }
    }

    /// Queue a session event only for currently authorized bound clients.
    pub fn broadcast_to_session(&self, session_id: &str, kind: &str, payload: Value) -> usize {
        self.fan_out_scoped(envelope(kind, Some(session_id), payload), |client| {
            let user_id = client.user_id.as_ref()?;
            if client.session_id.as_deref() != Some(session_id) {
                return None;
            }
            Some(DeliveryScope::Session {
                user_id: user_id.clone(),
                session_id: session_id.into(),
                generation: client.generation,
            })
        })
    }

    /// Mirror of `broadcastToUser`: every authorized client of one user,
    /// regardless of which session that client subscribed to.
    ///
    /// Divergence: the TS hub also skips `pairedNodeId` clients; the native hub
    /// has no paired-node concept yet, so only credential state gates delivery.
    pub fn broadcast_to_user(&self, user_id: &str, kind: &str, payload: Value) -> usize {
        self.fan_out_scoped(envelope(kind, None, payload), |client| {
            client
                .user_id
                .as_deref()
                .is_some_and(|bound| bound == user_id)
                .then_some(DeliveryScope::Unscoped {
                    generation: client.generation,
                    requires_auth: true,
                })
        })
    }

    /// Send a session-labelled event to the owning user, including clients not bound to that session.
    pub fn broadcast_to_user_session(
        &self,
        user_id: &str,
        session_id: &str,
        kind: &str,
        payload: Value,
    ) -> usize {
        self.fan_out_scoped(envelope(kind, Some(session_id), payload), |client| {
            (client.user_id.as_deref() == Some(user_id)).then(|| DeliveryScope::OwnerSessions {
                user_id: user_id.to_owned(),
                session_ids: vec![session_id.to_owned()],
                generation: client.generation,
            })
        })
    }

    /// Mirror of `broadcastAll`: every authorized client on the hub.
    ///
    /// `broadcastAll` additionally applies `canAccessSession` when the event
    /// names a session; this envelope carries no session, so that filter is
    /// trivially satisfied. Paired-node exclusion is not modeled (see
    /// [`Self::broadcast_to_user`]).
    pub fn broadcast_all(&self, kind: &str, payload: Value) -> usize {
        self.fan_out_scoped(envelope(kind, None, payload), |client| {
            Some(DeliveryScope::Unscoped {
                generation: client.generation,
                requires_auth: true,
            })
        })
    }

    /// Resource key must be supplied by trusted server code, not inferred from payload.
    pub fn broadcast_to_resource(&self, key: &str, kind: &str, payload: Value) -> usize {
        self.fan_out_scoped(envelope(kind, None, payload), |client| {
            let user_id = client.user_id.as_ref()?;
            if !client.subscriptions.contains(key) {
                return None;
            }
            Some(DeliveryScope::Resource {
                user_id: user_id.clone(),
                key: key.into(),
                generation: client.generation,
            })
        })
    }

    /// Terminal ID must come from the trusted terminal registry, never from event payloads.
    pub fn broadcast_to_terminal(&self, terminal_id: &str, kind: &str, payload: Value) -> usize {
        self.fan_out_scoped(envelope(kind, None, payload), |client| {
            let user_id = client.user_id.as_ref()?;
            client
                .terminals
                .contains(terminal_id)
                .then(|| DeliveryScope::Terminal {
                    user_id: user_id.clone(),
                    terminal_id: terminal_id.into(),
                    generation: client.generation,
                })
        })
    }

    fn matches_scope(client: &ClientEntry, scope: &DeliveryScope) -> bool {
        match scope {
            DeliveryScope::Unscoped {
                generation,
                requires_auth,
            } => {
                client.generation == *generation
                    && (!requires_auth || Self::credential_current(client))
            }
            DeliveryScope::OwnerSessions {
                user_id,
                generation,
                ..
            } => {
                Self::credential_current(client)
                    && client.generation == *generation
                    && client.user_id.as_ref() == Some(user_id)
            }
            DeliveryScope::Session {
                user_id,
                session_id,
                generation,
            } => {
                Self::credential_current(client)
                    && client.generation == *generation
                    && client.user_id.as_ref() == Some(user_id)
                    && client.session_id.as_ref() == Some(session_id)
            }
            DeliveryScope::Resource {
                user_id,
                key,
                generation,
            } => {
                Self::credential_current(client)
                    && client.generation == *generation
                    && client.user_id.as_ref() == Some(user_id)
                    && client.subscriptions.contains(key)
            }
            DeliveryScope::Terminal {
                user_id,
                terminal_id,
                generation,
            } => {
                Self::credential_current(client)
                    && client.generation == *generation
                    && client.user_id.as_ref() == Some(user_id)
                    && client.terminals.contains(terminal_id)
            }
        }
    }

    // Authority implementations must be local, bounded, non-blocking and non-panicking.
    // Calls are outside the hub mutex, but synchronous calls cannot be preempted here.
    //
    // An absent authorizer is *not* a denial: ws.ts consults `canAccess*` only when the
    // callback is configured (`client.accessCheck?.() !== false`), so a hub built without
    // one still delivers to every client whose scope matches. Treating "no authorizer" as
    // "deny" made every scoped fan-out deliver to zero clients.
    fn authorized(&self, scope: &DeliveryScope) -> bool {
        let Some(authorizer) = self.config.authorizer.as_ref() else {
            // Session binding retains the reference's optional callback behavior;
            // resource and terminal access require an explicit authority.
            return matches!(
                scope,
                DeliveryScope::Unscoped { .. }
                    | DeliveryScope::Session { .. }
                    | DeliveryScope::OwnerSessions { .. }
            );
        };
        match scope {
            DeliveryScope::Unscoped { .. } => true,
            DeliveryScope::OwnerSessions {
                user_id,
                session_ids,
                ..
            } => session_ids.iter().all(|session| {
                authorizer
                    .can_access_session(user_id, session)
                    .unwrap_or(false)
            }),
            DeliveryScope::Session {
                user_id,
                session_id,
                ..
            } => authorizer
                .can_access_session(user_id, session_id)
                .unwrap_or(false),
            DeliveryScope::Resource { user_id, key, .. } => authorizer
                .can_access_resource(user_id, key)
                .unwrap_or(false),
            DeliveryScope::Terminal {
                user_id,
                terminal_id,
                ..
            } => authorizer
                .can_access_terminal(user_id, terminal_id)
                .unwrap_or(false),
        }
    }

    fn fan_out_scoped(
        &self,
        value: Value,
        scope_for: impl Fn(&ClientEntry) -> Option<DeliveryScope>,
    ) -> usize {
        let candidates: Vec<_> = {
            let inner = self.inner.lock().expect("hub state");
            inner
                .clients
                .iter()
                .filter_map(|(id, c)| {
                    scope_for(c).map(|scope| (id.clone(), c.outbound.clone(), scope))
                })
                .collect()
        };
        let mut delivered = 0;
        for (id, sender, scope) in candidates {
            if !self.authorized(&scope) {
                continue;
            }
            let mut inner = self.inner.lock().expect("hub state");
            let Some(client) = inner.clients.get_mut(&id) else {
                continue;
            };
            if !client.outbound.same_channel(&sender) || !Self::matches_scope(client, &scope) {
                continue;
            }
            match client.outbound.try_send(OutboundMessage {
                value: value.clone(),
                scope,
            }) {
                Ok(()) => delivered += 1,
                Err(_) => {
                    client.dropped = client.dropped.saturating_add(1);
                    inner.clients.remove(&id);
                }
            }
        }
        delivered
    }

    fn may_deliver(&self, client_id: &str, scope: &DeliveryScope) -> bool {
        let sender = {
            let inner = self.inner.lock().expect("hub state");
            let Some(client) = inner.clients.get(client_id) else {
                return false;
            };
            if !Self::matches_scope(client, scope) {
                return false;
            }
            client.outbound.clone()
        };
        if !self.authorized(scope) {
            return false;
        }
        let inner = self.inner.lock().expect("hub state");
        inner
            .clients
            .get(client_id)
            .is_some_and(|c| c.outbound.same_channel(&sender) && Self::matches_scope(c, scope))
    }

    async fn may_deliver_with_session_authority(
        &self,
        client_id: &str,
        scope: &DeliveryScope,
    ) -> bool {
        if !self.may_deliver(client_id, scope) {
            return false;
        }
        if let Some(authority) = &self.config.session_authority {
            match scope {
                DeliveryScope::OwnerSessions {
                    user_id,
                    session_ids,
                    ..
                } => {
                    for session_id in session_ids {
                        if !authority.session_owned(user_id, session_id).await {
                            return false;
                        }
                    }
                }
                DeliveryScope::Session {
                    user_id,
                    session_id,
                    ..
                } if !authority.session_owned(user_id, session_id).await => return false,
                _ => {}
            }
        }
        self.may_deliver(client_id, scope)
    }

    /// `allow_when_unconfigured` mirrors ws.ts: binding a *session* from the `subscribe`
    /// control message refuses only when an access callback exists and denies
    /// (`canAccessSession && !canAccessSession(...)`, L501-513). Resource and terminal
    /// subscriptions, like delivery, keep the deny-by-default rule.
    fn bind_checked(
        &self,
        client_id: &str,
        id: &str,
        kind: u8,
        allow_when_unconfigured: bool,
    ) -> bool {
        if id.is_empty() {
            return false;
        }
        let (user_id, generation, sender) = {
            let inner = self.inner.lock().expect("hub state");
            let Some(c) = inner.clients.get(client_id) else {
                return false;
            };
            let Some(user) = c.user_id.as_ref().filter(|_| Self::credential_current(c)) else {
                return false;
            };
            (user.clone(), c.generation, c.outbound.clone())
        };
        let scope = match kind {
            0 => DeliveryScope::Session {
                user_id,
                session_id: id.into(),
                generation,
            },
            1 => DeliveryScope::Resource {
                user_id,
                key: id.into(),
                generation,
            },
            _ => DeliveryScope::Terminal {
                user_id,
                terminal_id: id.into(),
                generation,
            },
        };
        let permitted = match (&scope, allow_when_unconfigured) {
            (DeliveryScope::Session { .. }, true) if self.config.authorizer.is_none() => true,
            _ => self.authorized(&scope),
        };
        if !permitted {
            return false;
        }
        let mut inner = self.inner.lock().expect("hub state");
        let Some(c) = inner.clients.get_mut(client_id) else {
            return false;
        };
        if !Self::credential_current(c)
            || c.generation != generation
            || !c.outbound.same_channel(&sender)
        {
            return false;
        }
        c.generation = c.generation.wrapping_add(1);
        match kind {
            0 => c.session_id = Some(id.into()),
            1 => {
                c.subscriptions.insert(id.into());
            }
            _ => {
                c.terminals.insert(id.into());
            }
        }
        true
    }

    pub fn bind_session(&self, client_id: &str, session_id: &str) -> bool {
        self.bind_checked(client_id, session_id, 0, true)
    }
    async fn bind_session_with_authority(&self, client_id: &str, session_id: &str) -> bool {
        let Some(authority) = &self.config.session_authority else {
            return self.bind_session(client_id, session_id);
        };
        if session_id.is_empty() {
            return false;
        }
        let (user_id, generation, sender) = {
            let inner = self.inner.lock().expect("hub state");
            let Some(client) = inner.clients.get(client_id) else {
                return false;
            };
            let Some(user) = client
                .user_id
                .as_ref()
                .filter(|_| Self::credential_current(client))
            else {
                return false;
            };
            (user.clone(), client.generation, client.outbound.clone())
        };
        let scope = DeliveryScope::Session {
            user_id: user_id.clone(),
            session_id: session_id.into(),
            generation,
        };
        if !self.authorized(&scope) || !authority.session_owned(&user_id, session_id).await {
            return false;
        }
        let mut inner = self.inner.lock().expect("hub state");
        let Some(client) = inner.clients.get_mut(client_id) else {
            return false;
        };
        if !Self::credential_current(client)
            || client.generation != generation
            || client.user_id.as_deref() != Some(&user_id)
            || !client.outbound.same_channel(&sender)
        {
            return false;
        }
        client.generation = client.generation.wrapping_add(1);
        client.session_id = Some(session_id.into());
        true
    }
    pub fn subscribe(&self, client_id: &str, key: &str) -> bool {
        self.bind_checked(client_id, key, 1, false)
    }
    pub fn subscribe_terminal(&self, client_id: &str, id: &str) -> bool {
        self.bind_checked(client_id, id, 2, false)
    }
    pub fn unsubscribe_terminal(&self, client_id: &str, id: &str) -> bool {
        let mut inner = self.inner.lock().expect("hub state");
        let Some(c) = inner.clients.get_mut(client_id) else {
            return false;
        };
        let removed = c.terminals.remove(id);
        if removed {
            c.generation = c.generation.wrapping_add(1);
        }
        removed
    }

    pub fn unsubscribe(&self, client_id: &str, key: &str) -> bool {
        match self
            .inner
            .lock()
            .expect("hub state")
            .clients
            .get_mut(client_id)
        {
            Some(client) => {
                let removed = client.subscriptions.remove(key);
                if removed {
                    client.generation = client.generation.wrapping_add(1);
                }
                removed
            }
            None => false,
        }
    }

    /// Authenticate the identity without granting access to its claimed session.
    ///
    /// Integration requires an authorizer accepting `(user_id, session_id)` and
    /// `(user_id, resource_kind, resource_id)`, returning an explicit allow/deny
    /// (errors deny). Session binding and each resource delivery must consult it,
    /// including revocation; the caller must supply trusted resource identities.
    /// Reauthentication clears previous bindings and subscriptions.
    pub fn authenticate_client(&self, client_id: &str, identity: WsIdentity) -> Option<String> {
        let mut inner = self.inner.lock().expect("hub state");
        let client = inner.clients.get_mut(client_id)?;
        client.generation = client.generation.wrapping_add(1);
        client.authenticated = Self::identity_current(&identity);
        client.expires_at = identity.expires_at;
        client.session_id = None;
        client.subscriptions.clear();
        client.terminals.clear();
        client.user_id = Some(identity.user_id.clone());
        None
    }

    // Clear the old identity before awaiting authority, then bind only to the
    // same connection and generation. A stale lookup cannot mutate a new login.
    async fn authenticate_user_with<F, Fut>(
        &self,
        client_id: &str,
        identity: WsIdentity,
        lookup: F,
    ) -> bool
    where
        F: FnOnce(String) -> Fut,
        Fut: std::future::Future<Output = bool>,
    {
        let (generation, sender) = {
            let mut inner = self.inner.lock().expect("hub state");
            let Some(client) = inner.clients.get_mut(client_id) else {
                return false;
            };
            client.generation = client.generation.wrapping_add(1);
            client.authenticated = false;
            client.expires_at = 0;
            client.user_id = None;
            client.session_id = None;
            client.subscriptions.clear();
            client.terminals.clear();
            (client.generation, client.outbound.clone())
        };
        if !Self::identity_current(&identity) || !lookup(identity.user_id.clone()).await {
            return false;
        }
        let mut inner = self.inner.lock().expect("hub state");
        let Some(client) = inner.clients.get_mut(client_id) else {
            return false;
        };
        if client.generation != generation
            || !client.outbound.same_channel(&sender)
            || !Self::identity_current(&identity)
        {
            return false;
        }
        client.authenticated = true;
        client.expires_at = identity.expires_at;
        client.user_id = Some(identity.user_id);
        true
    }

    /// Bind `identity` only when the database-backed authority still knows the
    /// user. Without a configured authority this is the in-memory binding the
    /// tests and local (database-less) runtime use.
    async fn admit_identity(&self, client_id: &str, identity: WsIdentity) -> bool {
        match self.config.user_authority.clone() {
            Some(authority) => {
                self.authenticate_user_with(client_id, identity, move |user_id| {
                    let authority = authority.clone();
                    async move { authority.user_exists(&user_id).await }
                })
                .await
            }
            None => {
                let _ = self.authenticate_client(client_id, identity);
                true
            }
        }
    }

    /// Recheck the live identity before protected work.
    ///
    /// A revoked user, a failed lookup, a replaced connection or an expired
    /// credential all deny. Delivery that was already queued is blocked by the
    /// cleared credential, not by cancelling the queue.
    async fn revalidate_identity(&self, client_id: &str) -> bool {
        match self.config.user_authority.clone() {
            Some(authority) => self.current_user(client_id, authority.as_ref()).await,
            None => self.has_authority(client_id),
        }
    }

    fn session_binding(&self, client_id: &str) -> Option<String> {
        let inner = self.inner.lock().expect("hub state");
        inner
            .clients
            .get(client_id)
            .and_then(|client| client.session_id.clone())
    }

    fn clear_authentication(&self, client_id: &str, force_generation: bool) {
        let mut inner = self.inner.lock().expect("hub state");
        if let Some(client) = inner.clients.get_mut(client_id) {
            if force_generation || client.authenticated {
                client.generation = client.generation.wrapping_add(1);
            }
            client.authenticated = false;
            client.expires_at = 0;
            client.user_id = None;
            client.session_id = None;
            client.subscriptions.clear();
            client.terminals.clear();
        }
    }

    /// Shut the hub down: reject in-flight terminal ops and close every socket
    /// with `1001` (TS `stop()` -> `rejectPending` + `1001` close).
    pub fn stop(&self) {
        {
            let mut inner = self.inner.lock().expect("hub state");
            if inner.stopped {
                return;
            }
            inner.stopped = true;
        }
        let _ = self.shutdown.send("gateway shutting down".into());
    }

    /// Re-subscribe a connection task to shutdown notifications.
    pub fn shutdown_receiver(&self) -> broadcast::Receiver<String> {
        self.shutdown.subscribe()
    }

    fn register(&self, id: &str, outbound: mpsc::Sender<OutboundMessage>) -> oneshot::Receiver<()> {
        let (disconnect, receiver) = oneshot::channel();
        let mut inner = self.inner.lock().expect("hub state");
        inner.clients.insert(
            id.to_string(),
            ClientEntry {
                id: id.to_string(),
                user_id: None,
                session_id: None,
                authenticated: false,
                expires_at: 0,
                subscriptions: HashSet::new(),
                terminals: HashSet::new(),
                generation: 0,
                outbound,
                _disconnect: disconnect,
                dropped: 0,
                connected_at: Instant::now(),
            },
        );
        receiver
    }

    fn unregister(&self, id: &str) {
        self.inner.lock().expect("hub state").clients.remove(id);
    }

    fn next_id(&self) -> String {
        format!("ws-{}", self.next_client_id.fetch_add(1, Ordering::SeqCst))
    }

    /// Drive one upgraded socket to completion.
    pub async fn serve_connection<S>(self: &Arc<Self>, stream: S) -> Result<(), WsError>
    where
        S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    {
        let mut stream = stream;
        let mut shutdown = self.shutdown_receiver();
        if self.is_stopped() {
            let response = rejection_response(503, "Service Unavailable", "gateway shutting down");
            let _ =
                tokio::time::timeout(self.config.handshake_timeout, stream.write_all(&response))
                    .await;
            return Ok(());
        }
        let request = tokio::select! {
            result = tokio::time::timeout(self.config.handshake_timeout, read_handshake(&mut stream)) =>
                result.map_err(|_| WsError::Protocol("handshake timed out".into()))??,
            _ = shutdown.recv() => return Ok(()),
        };
        match negotiate_handshake(&request, &self.config.path) {
            HandshakeOutcome::Accepted { accept_key } => {
                let response = switching_protocols_response(&accept_key);
                tokio::select! {
                    result = tokio::time::timeout(self.config.handshake_timeout, async { stream.write_all(&response).await?; stream.flush().await }) =>
                        result.map_err(|_| WsError::Protocol("handshake write timed out".into()))??,
                    _ = shutdown.recv() => return Ok(()),
                }
            }
            HandshakeOutcome::Rejected {
                status,
                reason,
                body,
            } => {
                let response = rejection_response(status, reason, &body);
                tokio::select! {
                    result = tokio::time::timeout(self.config.handshake_timeout, async { stream.write_all(&response).await?; stream.flush().await }) =>
                        result.map_err(|_| WsError::Protocol("handshake write timed out".into()))??,
                    _ = shutdown.recv() => return Ok(()),
                }
                return Ok(());
            }
        }

        self.serve_upgraded(stream, request.bearer_token()).await
    }

    /// Drive a socket after the caller has validated and completed the HTTP upgrade.
    /// The caller must enforce the same handshake and path checks as `serve_connection`.
    pub async fn serve_upgraded<S>(
        self: &Arc<Self>,
        stream: S,
        token: Option<String>,
    ) -> Result<(), WsError>
    where
        S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
    {
        let mut shutdown = self.shutdown_receiver();
        if self.is_stopped() {
            return Ok(());
        }
        let identity = token
            .as_deref()
            .and_then(|token| self.config.token_verifier.verify(token).ok())
            .filter(Self::identity_current);
        let (reader, mut writer) = tokio::io::split(stream);
        let mut reader = reader;
        let client_id = self.next_id();
        let (outbound, mut outbound_rx) = mpsc::channel(self.config.outbound_capacity);
        let mut disconnected = self.register(&client_id, outbound);
        let guard = ClientGuard {
            hub: Arc::clone(self),
            id: client_id.clone(),
        };

        if token.is_some() && identity.is_none() {
            let response = error_envelope(Some(""), "UNAUTHORIZED", "Authentication failed");
            let text = serde_json::to_string(&response).unwrap_or_else(|_| "{}".into());
            let sent = tokio::select! {
                result = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_frame(&mut writer, OpCode::Text, text.as_bytes())) => matches!(result, Ok(Ok(()))),
                _ = shutdown.recv() => false,
                _ = &mut disconnected => false,
            };
            if sent {
                tokio::select! {
                    _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, CLOSE_UNAUTHORIZED, "Unauthorized")) => {},
                    _ = shutdown.recv() => {},
                    _ = &mut disconnected => {},
                }
            }
            return Ok(());
        }

        if let Some(identity) = identity {
            if !self.admit_identity(&client_id, identity).await {
                // Fail closed with the same public text used for an invalid token so
                // callers cannot tell a revoked user from a bad credential.
                let response = error_envelope(Some(""), "UNAUTHORIZED", "Authentication failed");
                let text = serde_json::to_string(&response).unwrap_or_else(|_| "{}".into());
                let sent = tokio::select! {
                    result = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_frame(&mut writer, OpCode::Text, text.as_bytes())) => matches!(result, Ok(Ok(()))),
                    _ = shutdown.recv() => false,
                    _ = &mut disconnected => false,
                };
                if sent {
                    tokio::select! {
                        _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, CLOSE_UNAUTHORIZED, "Unauthorized")) => {},
                        _ = shutdown.recv() => {},
                        _ = &mut disconnected => {},
                    }
                }
                return Ok(());
            }
            let _ = self.send_to_client(
                &client_id,
                envelope(
                    "session.created",
                    Some(""),
                    json!({ "clientId": client_id, "authenticated": true }),
                ),
            );
        } else {
            let _ = self.send_to_client(
                &client_id,
                envelope(
                    "session.created",
                    Some(""),
                    json!({ "clientId": client_id, "authenticated": false }),
                ),
            );
        }

        if self.is_stopped() {
            let _ = tokio::time::timeout(
                CLOSE_WRITE_TIMEOUT,
                write_close(&mut writer, CLOSE_GOING_AWAY, "gateway shutting down"),
            )
            .await;
            return Ok(());
        }
        let mut heartbeat = tokio::time::interval(self.config.heartbeat_interval);
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        heartbeat.tick().await; // first tick completes immediately
        let mut last_pong = Instant::now();
        let mut fragmented = None;

        'connection: loop {
            // Keep a partially read frame alive while handling outbound and timer events.
            let frame = {
                let read = read_frame_inner(
                    &mut reader,
                    self.config.max_message_bytes,
                    true,
                    &mut fragmented,
                );
                tokio::pin!(read);
                loop {
                    tokio::select! {
                            _ = &mut disconnected => break 'connection,
                            frame = &mut read => break frame,
                    message = outbound_rx.recv() => {
                        let Some(message) = message else { break 'connection; };
                        if !self.may_deliver_with_session_authority(&client_id, &message.scope).await { continue; }
                        let text = serde_json::to_string(&message.value).unwrap_or_else(|_| "{}".into());
                        if tokio::select! { result = write_frame(&mut writer, OpCode::Text, text.as_bytes()) => result.is_err(), _ = shutdown.recv() => true, _ = &mut disconnected => true } {
                            break 'connection;
                        }
                    }
                    _ = heartbeat.tick() => {
                        if last_pong.elapsed() > self.config.heartbeat_timeout {
                            // TS terminates the socket when a pong is missing.
                            break 'connection;
                        }
                        if tokio::select! { result = write_frame(&mut writer, OpCode::Ping, &[]) => result.is_err(), _ = shutdown.recv() => true, _ = &mut disconnected => true } {
                            break 'connection;
                        }
                    }
                    message = shutdown.recv() => {
                        let reason = message.unwrap_or_else(|_| "gateway shutting down".into());
                        tokio::select! { _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, CLOSE_GOING_AWAY, &reason)) => {}, _ = &mut disconnected => {} }
                        break 'connection;
                    }
                        }
                }
            };
            let Some(frame) = frame? else { break };
            match frame.opcode {
                OpCode::Close => {
                    tokio::select! { _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, frame.close_code().unwrap_or(1000), "")) => {}, _ = shutdown.recv() => {}, _ = &mut disconnected => {} }
                    break;
                }
                OpCode::Ping => {
                    tokio::select! { result = write_frame(&mut writer, OpCode::Pong, &frame.payload) => result?, _ = shutdown.recv() => break, _ = &mut disconnected => break };
                }
                OpCode::Pong => last_pong = Instant::now(),
                OpCode::Text | OpCode::Binary => {
                    let Some(text) = frame.text() else {
                        let _ = self.send_to_client(
                            &client_id,
                            error_envelope(
                                None,
                                "INVALID_MESSAGE",
                                "binary frames are not supported",
                            ),
                        );
                        continue;
                    };
                    let handled = tokio::select! {
                        result = handle_message(self, &client_id, text) => result,
                        message = shutdown.recv() => {
                            let reason = message.unwrap_or_else(|_| "gateway shutting down".into());
                            tokio::select! {
                                _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, CLOSE_GOING_AWAY, &reason)) => {},
                                _ = &mut disconnected => {},
                            }
                            break 'connection;
                        }
                        _ = &mut disconnected => break 'connection,
                    };
                    match handled {
                        Ok(Disposition::Continue) => {}
                        Ok(Disposition::Close {
                            code,
                            reason,
                            response,
                        }) => {
                            if let Some(response) = response {
                                let text = serde_json::to_string(&response)
                                    .unwrap_or_else(|_| "{}".into());
                                let sent = tokio::select! {
                                    result = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_frame(&mut writer, OpCode::Text, text.as_bytes())) => matches!(result, Ok(Ok(()))),
                                    _ = shutdown.recv() => false,
                                    _ = &mut disconnected => false,
                                };
                                if !sent {
                                    break;
                                }
                            }
                            tokio::select! { _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, code, &reason)) => {}, _ = shutdown.recv() => {}, _ = &mut disconnected => {} }
                            break;
                        }
                        Err(error) => {
                            tokio::select! { _ = tokio::time::timeout(CLOSE_WRITE_TIMEOUT, write_close(&mut writer, 1011, "internal error")) => {}, _ = shutdown.recv() => {}, _ = &mut disconnected => {} }
                            let _ = error;
                            break;
                        }
                    }
                }
                OpCode::Continuation => unreachable!("reassembled by read_frame"),
            }
        }

        drop(guard);
        let _ = tokio::time::timeout(Duration::from_secs(5), writer.shutdown()).await;
        Ok(())
    }
}

struct ClientGuard {
    hub: Arc<WsHub>,
    id: String,
}

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.hub.unregister(&self.id);
    }
}

enum Disposition {
    Continue,
    Close {
        code: u16,
        reason: String,
        response: Option<Value>,
    },
}

fn message_type(value: &Value) -> Option<&str> {
    value.get("type").and_then(Value::as_str)
}

fn message_payload(value: &Value) -> Value {
    value.get("payload").cloned().unwrap_or(Value::Null)
}

fn session_of(value: &Value) -> Option<String> {
    value
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(|id| id.to_string())
}

fn subscription_key(payload: &Value) -> Option<String> {
    let resource = payload
        .get("resource")
        .or_else(|| payload.get("channel"))
        .or_else(|| payload.get("topic"))
        .and_then(Value::as_str)?;
    if resource.is_empty() || payload.get("id").is_some() {
        None
    } else {
        Some(resource.to_string())
    }
}

/// Reference error envelope that carries only a human message and no machine
/// code. The TypeScript control plane uses this shape for parse failures,
/// unknown message types and unknown resources.
fn error_message(session_id: Option<&str>, message: &str) -> Value {
    envelope(
        "error",
        Some(session_id.unwrap_or("")),
        json!({ "message": message }),
    )
}

/// Single denial text emitted by the reference `denyControl` helper for every
/// machine code (`UNAUTHORIZED`, `TERMINAL_FORBIDDEN`, ...).
const ACCESS_REQUIRED: &str = "Authentication or access required";

/// Reference literal from `authenticateClient`'s catch block in `ws.ts`; sent
/// with machine code `UNAUTHORIZED` immediately before `ws.close(4001)`.
const AUTH_FAILED: &str = "Authentication failed";

/// Reference `case "subscribe"` / `case "resource.subscribe"` gate in `ws.ts`:
/// `if (!client.authenticated) { send({ message: "Must authenticate before
/// subscribing", code: "UNAUTHORIZED" }) }` — a distinct text from the
/// `denyControl` helper, and sent without closing the socket.
///
/// Retained for provenance only: `ws.ts:416` short-circuits every
/// non-`authenticate` message from an unauthenticated client through
/// `denyControl` before dispatch, so the per-case literals at `ws.ts:496`
/// and `ws.ts:535` are unreachable on the wire.
#[allow(dead_code)]
const SUBSCRIBE_AUTH_REQUIRED: &str = "Must authenticate before subscribing";

async fn handle_message(
    hub: &Arc<WsHub>,
    client_id: &str,
    text: &str,
) -> Result<Disposition, WsError> {
    let parsed: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_error) => {
            let _ = hub.send_to_client(
                client_id,
                error_message(hub.session_binding(client_id).as_deref(), "Invalid JSON"),
            );
            return Ok(Disposition::Continue);
        }
    };
    let kind = message_type(&parsed);
    let session = session_of(&parsed);
    let payload = message_payload(&parsed);

    if kind == Some("authenticate") {
        let token = parsed
            .get("token")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let verified = hub
            .config
            .token_verifier
            .verify(token)
            .and_then(|identity| {
                if WsHub::identity_current(&identity) {
                    Ok(identity)
                } else {
                    Err("invalid identity".into())
                }
            });
        let admitted = match verified {
            Ok(identity) => {
                if hub.admit_identity(client_id, identity.clone()).await {
                    Ok(identity)
                } else {
                    Err("unauthorized".into())
                }
            }
            Err(error) => Err(error),
        };
        return Ok(match admitted {
            Ok(identity) => {
                let bound = hub.session_binding(client_id);
                let _ = hub.send_to_client(
                    client_id,
                    envelope(
                        "session.created",
                        Some(bound.as_deref().unwrap_or("")),
                        json!({ "authenticated": true, "userId": identity.user_id }),
                    ),
                );
                Disposition::Continue
            }
            Err(_error) => {
                // Reference `case "authenticate"` is `if (msg.token) { const ok =
                // await this.authenticateClient(...); if (ok) { ... } } break;`.
                // `authenticateClient`'s catch clears the identity and sends an
                // `error` frame before `ws.close(4001)`, so a present-but-rejected
                // token terminates the socket. Only the falsy-token case (missing
                // or empty) skips the call entirely and leaves the socket open.
                if token.is_empty() {
                    Disposition::Continue
                } else {
                    // The catch block clears the identity and subscriptions before
                    // closing. Capture the binding first so the terminal error frame
                    // still names the session the socket was using.
                    let bound = hub.session_binding(client_id);
                    hub.clear_authentication(client_id, false);
                    Disposition::Close {
                        code: CLOSE_UNAUTHORIZED,
                        reason: "Unauthorized".into(),
                        response: Some(error_envelope(
                            bound.as_deref(),
                            "UNAUTHORIZED",
                            AUTH_FAILED,
                        )),
                    }
                }
            }
        });
    }

    // `ws.ts:416-419` installs one global precheck ahead of dispatch:
    //   if (msg.type !== "authenticate" && !this.hasAuthority(client)) {
    //     this.denyControl(client, "UNAUTHORIZED"); return; }
    // Every unauthenticated control message therefore leaves through
    // `denyControl`, whose only literal is `ACCESS_REQUIRED` (`ws.ts:1518`).
    // The per-case `SUBSCRIBE_AUTH_REQUIRED` literals exist in the reference
    // but can never be observed, so the single denial text below is the exact
    // wire-observable behaviour. `denyControl` never closes the socket.
    let denial = ACCESS_REQUIRED;

    if !hub.has_authority(client_id) {
        // Invalidate any expired identity before queuing the public denial. This
        // also prevents messages queued under that identity from being delivered.
        hub.clear_authentication(client_id, false);
        let bound = hub.session_binding(client_id);
        let _ = hub.send_to_client(
            client_id,
            error_envelope(bound.as_deref(), "UNAUTHORIZED", denial),
        );
        return Ok(Disposition::Continue);
    }

    if !hub.revalidate_identity(client_id).await {
        // Revoked user, failed lookup or replaced connection. Clear first so
        // already-queued messages cannot reach the stale identity, then deny with
        // the public access-required text rather than close: the peer may present
        // a fresh credential on this connection.
        hub.clear_authentication(client_id, false);
        let bound = hub.session_binding(client_id);
        let _ = hub.send_to_client(
            client_id,
            error_envelope(bound.as_deref(), "UNAUTHORIZED", denial),
        );
        return Ok(Disposition::Continue);
    }

    // Reference default arm: bodies without `type` interpolate `undefined`, and
    // unimplemented types are reported here, i.e. only after the gates above.
    let kind = kind.unwrap_or("undefined");

    match kind {
        "subscribe" => {
            let permitted = match session.as_deref() {
                Some(id) => hub.bind_session_with_authority(client_id, id).await,
                None => true,
            };
            if permitted {
                let _ = hub.send_to_client(
                    client_id,
                    envelope(
                        "session.created",
                        Some(session.as_deref().unwrap_or("")),
                        json!({"subscribed": true}),
                    ),
                );
            } else {
                let _ = hub.send_to_client(
                    client_id,
                    error_envelope(
                        session.as_deref(),
                        "SESSION_FORBIDDEN",
                        "Session not found or access denied",
                    ),
                );
            }
        }
        "resource.subscribe" => {
            // Pending questions use the application's shared service. Other root
            // registry snapshots are not yet wired.
            let resource = payload
                .get("resource")
                .and_then(Value::as_str)
                .unwrap_or("undefined");
            if resource == "root:/pending-questions"
                && let Some(questions) = &hub.config.questions
            {
                // Bind the snapshot to the exact authenticated connection generation.
                let identity = {
                    let inner = hub.inner.lock().expect("hub state");
                    inner.clients.get(client_id).and_then(|client| {
                        if WsHub::credential_current(client) {
                            client.user_id.clone().map(|user| (user, client.generation))
                        } else {
                            None
                        }
                    })
                };
                if let Some((user, generation)) = identity {
                    let mut requests = Vec::new();
                    for request in questions.list_pending(None, Some(&user)) {
                        if request.user_id.as_deref() != Some(&user) {
                            continue;
                        }
                        let scope = DeliveryScope::OwnerSessions {
                            user_id: user.clone(),
                            session_ids: vec![request.session_id.clone()],
                            generation,
                        };
                        if !hub.authorized(&scope) {
                            continue;
                        }
                        if let Some(authority) = &hub.config.session_authority
                            && !authority.session_owned(&user, &request.session_id).await
                        {
                            continue;
                        }
                        requests.push(request);
                    }
                    let session_ids = requests
                        .iter()
                        .map(|request| request.session_id.clone())
                        .collect();
                    let mut inner = hub.inner.lock().expect("hub state");
                    if let Some(client) = inner.clients.get_mut(client_id)
                        && client.generation == generation
                        && WsHub::credential_current(client)
                        && client.user_id.as_deref() == Some(&user)
                    {
                        let result = client.outbound.try_send(OutboundMessage {
                            value: envelope(
                                "user-question.pending-snapshot",
                                Some(""),
                                json!({"requests": requests}),
                            ),
                            scope: DeliveryScope::OwnerSessions {
                                user_id: user.clone(),
                                session_ids,
                                generation,
                            },
                        });
                        if result.is_err() {
                            inner.clients.remove(client_id);
                        }
                    }
                }
            } else {
                let _ = hub.send_to_client(
                    client_id,
                    error_message(session.as_deref(), &format!("Unknown resource: {resource}")),
                );
            }
        }
        "terminal.subscribe" => {
            let id = parsed
                .get("terminalId")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty());
            if let Some(id) = id {
                hub.subscribe_terminal(client_id, id);
                let _ = hub.send_to_client(
                    client_id,
                    envelope(
                        "surface.connected",
                        session.as_deref(),
                        json!({"terminalId": id, "subscribed": true}),
                    ),
                );
            }
        }
        "terminal.unsubscribe" => {
            if let Some(id) = parsed.get("terminalId").and_then(Value::as_str) {
                hub.unsubscribe_terminal(client_id, id);
            }
        }
        "resource.unsubscribe" => {
            // Reference handling is bookkeeping only: it sends no acknowledgement.
            if let Some(key) = subscription_key(&payload) {
                hub.unsubscribe(client_id, &key);
            }
        }
        other => {
            // The reference reports unimplemented types from its default arm, i.e.
            // only after the authority gates above have passed.
            let _ = hub.send_to_client(
                client_id,
                error_message(
                    session.as_deref(),
                    &format!("Unknown message type: {other}"),
                ),
            );
        }
    }
    Ok(Disposition::Continue)
}

impl WsControlPlane for WsHub {
    fn proxy_terminal_op<'a>(
        &'a self,
        node_id: &'a str,
        op: &'a str,
        args: Value,
        timeout: Duration,
    ) -> TerminalOpFuture<'a> {
        Box::pin(async move {
            if self.is_stopped() {
                return Err("gateway shutting down".into());
            }
            let mut shutdown = self.shutdown_receiver();
            if self.is_stopped() {
                return Err("gateway shutting down".into());
            }
            let dispatch = self.config.dispatcher.dispatch(node_id, op, args, timeout);
            tokio::select! {
                result = tokio::time::timeout(timeout, dispatch) => match result {
                    Ok(result) => result,
                    Err(_) => Err(format!("node operation {op} timed out after {}ms", timeout.as_millis())),
                },
                _ = shutdown.recv() => Err("gateway shutting down".into()),
            }
        })
    }

    fn send_terminal_op(&self, node_id: &str, op: &str, args: Value) -> Result<(), String> {
        if self.is_stopped() {
            return Err("gateway shutting down".into());
        }
        let dispatcher = Arc::clone(&self.config.dispatcher);
        let node_id = node_id.to_string();
        let op = op.to_string();
        let timeout = self.config.terminal_op_timeout;
        let mut shutdown = self.shutdown_receiver();
        if self.is_stopped() {
            return Err("gateway shutting down".into());
        }
        tokio::spawn(async move {
            tokio::select! {
                _ = tokio::time::timeout(timeout, dispatcher.dispatch(&node_id, &op, args, timeout)) => {},
                _ = shutdown.recv() => {},
            }
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn question_snapshot_and_events_are_owner_scoped() {
        use crate::services::input_requests::{QuestionInput, UserQuestionService};
        let questions = UserQuestionService::default();
        let alice_request = questions.ask(QuestionInput {
            session_id: "alice-session".into(),
            user_id: Some("alice".into()),
            ..Default::default()
        });
        let _bob_request = questions.ask(QuestionInput {
            session_id: "bob-session".into(),
            user_id: Some("bob".into()),
            ..Default::default()
        });
        let _unowned_request = questions.ask(QuestionInput {
            session_id: "unowned".into(),
            ..Default::default()
        });
        let hub = Arc::new(WsHub::new(WsHubConfig {
            questions: Some(questions),
            ..Default::default()
        }));
        let (alice_tx, mut alice_rx) = mpsc::channel(8);
        let (bob_tx, mut bob_rx) = mpsc::channel(8);
        hub.register("alice-client", alice_tx);
        hub.register("bob-client", bob_tx);
        for (client, user) in [("alice-client", "alice"), ("bob-client", "bob")] {
            hub.authenticate_client(
                client,
                WsIdentity {
                    user_id: user.into(),
                    session_id: None,
                    expires_at: u64::MAX,
                },
            );
        }
        handle_message(
            &hub,
            "alice-client",
            r#"{"type":"resource.subscribe","payload":{"resource":"root:/pending-questions"}}"#,
        )
        .await
        .unwrap();
        let snapshot = alice_rx.try_recv().unwrap();
        assert_eq!(snapshot.value["type"], "user-question.pending-snapshot");
        assert_eq!(
            snapshot.value["payload"]["requests"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            snapshot.value["payload"]["requests"][0]["id"],
            alice_request.id
        );
        assert_eq!(
            hub.broadcast_to_user_session(
                "alice",
                "alice-session",
                "user-question.requested",
                json!({"id":alice_request.id})
            ),
            1
        );
        let event = alice_rx.try_recv().unwrap();
        assert_eq!(event.value["sessionId"], "alice-session");
        assert!(hub.may_deliver("alice-client", &event.scope));
        assert!(bob_rx.try_recv().is_err());
        hub.authenticate_client(
            "alice-client",
            WsIdentity {
                user_id: "bob".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(!hub.may_deliver("alice-client", &event.scope));
    }

    #[tokio::test]
    async fn question_delivery_respects_session_denial_and_revocation() {
        use crate::services::input_requests::{QuestionInput, UserQuestionService};
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Authority(AtomicBool);
        impl WsAuthorizer for Authority {
            fn can_access_session(&self, user: &str, session: &str) -> Result<bool, String> {
                Ok(self.0.load(Ordering::SeqCst) && user == "alice" && session == "allowed")
            }
            fn can_access_resource(&self, _: &str, _: &str) -> Result<bool, String> {
                Ok(false)
            }
        }
        let authority = Arc::new(Authority(AtomicBool::new(true)));
        let questions = UserQuestionService::default();
        for session in ["allowed", "denied"] {
            questions.ask(QuestionInput {
                session_id: session.into(),
                user_id: Some("alice".into()),
                ..Default::default()
            });
        }
        let hub = Arc::new(WsHub::new(WsHubConfig {
            questions: Some(questions),
            authorizer: Some(authority.clone()),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("client", tx);
        hub.authenticate_client(
            "client",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        handle_message(
            &hub,
            "client",
            r#"{"type":"resource.subscribe","payload":{"resource":"root:/pending-questions"}}"#,
        )
        .await
        .unwrap();
        let snapshot = rx.try_recv().unwrap();
        let requests = snapshot.value["payload"]["requests"].as_array().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0]["sessionId"], "allowed");
        assert!(hub.may_deliver("client", &snapshot.scope));
        assert_eq!(
            hub.broadcast_to_user_session("alice", "denied", "user-question.requested", json!({})),
            0
        );
        assert_eq!(
            hub.broadcast_to_user_session("alice", "allowed", "user-question.requested", json!({})),
            1
        );
        let event = rx.try_recv().unwrap();
        assert!(hub.may_deliver("client", &event.scope));
        authority.0.store(false, Ordering::SeqCst);
        assert!(!hub.may_deliver("client", &snapshot.scope));
        assert!(!hub.may_deliver("client", &event.scope));
        assert_eq!(
            hub.broadcast_to_user_session("alice", "allowed", "user-question.resolved", json!({})),
            0
        );
    }

    #[tokio::test]
    async fn question_delivery_rechecks_database_ownership() {
        use crate::db::worker::DatabaseWorker;
        use crate::services::input_requests::{QuestionInput, UserQuestionService};
        use crate::ws_user_authority::WsUserAuthority;
        use std::num::NonZeroU16;
        use std::time::Duration;

        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, name TEXT, project_path TEXT, created_at TEXT, last_active_at TEXT, viewed_at TEXT, status TEXT, metadata TEXT); INSERT INTO sessions VALUES ('allowed', 'alice', NULL, 'chat', NULL, 'now', 'now', NULL, 'active', NULL); INSERT INTO sessions VALUES ('denied', 'bob', NULL, 'chat', NULL, 'now', 'now', NULL, 'active', NULL);").unwrap();
        let db = DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap();
        let questions = UserQuestionService::default();
        for session in ["allowed", "denied"] {
            questions.ask(QuestionInput {
                session_id: session.into(),
                user_id: Some("alice".into()),
                ..Default::default()
            });
        }
        let hub = Arc::new(WsHub::new(WsHubConfig {
            questions: Some(questions),
            session_authority: Some(Arc::new(WsUserAuthority::new(
                db.clone(),
                Duration::from_secs(2),
            ))),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("client", tx);
        hub.authenticate_client(
            "client",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        handle_message(
            &hub,
            "client",
            r#"{"type":"resource.subscribe","payload":{"resource":"root:/pending-questions"}}"#,
        )
        .await
        .unwrap();
        let snapshot = rx.try_recv().unwrap();
        let requests = snapshot.value["payload"]["requests"].as_array().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0]["sessionId"], "allowed");
        assert!(
            hub.may_deliver_with_session_authority("client", &snapshot.scope)
                .await
        );
        hub.broadcast_to_user_session("alice", "allowed", "user-question.requested", json!({}));
        let event = rx.try_recv().unwrap();
        assert!(
            hub.may_deliver_with_session_authority("client", &event.scope)
                .await
        );
        db.run(|db| {
            db.execute("DELETE FROM sessions WHERE id = ?1", ["allowed"])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(
            !hub.may_deliver_with_session_authority("client", &snapshot.scope)
                .await
        );
        assert!(
            !hub.may_deliver_with_session_authority("client", &event.scope)
                .await
        );
        db.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn session_binding_and_delivery_recheck_after_identity_change() {
        use crate::db::worker::DatabaseWorker;
        use crate::ws_user_authority::WsUserAuthority;
        use std::num::NonZeroU16;
        use std::time::Duration;

        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, name TEXT, project_path TEXT, created_at TEXT, last_active_at TEXT, viewed_at TEXT, status TEXT, metadata TEXT); INSERT INTO sessions VALUES ('s', 'alice', NULL, 'chat', NULL, 'now', 'now', NULL, 'active', NULL);").unwrap();
        let db = DatabaseWorker::new(connection, NonZeroU16::new(4).unwrap()).unwrap();
        let hub = Arc::new(WsHub::new(WsHubConfig {
            session_authority: Some(Arc::new(WsUserAuthority::new(
                db.clone(),
                Duration::from_secs(5),
            ))),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("client", tx);
        let identity = || WsIdentity {
            user_id: "alice".into(),
            session_id: None,
            expires_at: u64::MAX,
        };
        hub.authenticate_client("client", identity());
        assert!(hub.bind_session_with_authority("client", "s").await);
        hub.broadcast_to_session("s", "test", json!({}));
        let event = rx.try_recv().unwrap();
        assert!(
            hub.may_deliver_with_session_authority("client", &event.scope)
                .await
        );
        db.run(|db| {
            db.execute("DELETE FROM sessions WHERE id = 's'", [])?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(
            !hub.may_deliver_with_session_authority("client", &event.scope)
                .await
        );
        db.run(|db| { db.execute("INSERT INTO sessions VALUES ('s', 'alice', NULL, 'chat', NULL, 'now', 'now', NULL, 'active', NULL)", [])?; Ok(()) }).await.unwrap();

        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let worker = db.clone();
        let blocker = tokio::spawn(async move {
            worker
                .run(move |_| {
                    let _ = started_tx.send(());
                    release_rx.recv_timeout(Duration::from_secs(5))?;
                    Ok(())
                })
                .await
        });
        started_rx.await.unwrap();
        let binding = hub.bind_session_with_authority("client", "s");
        tokio::pin!(binding);
        assert!(
            std::future::poll_fn(|cx| std::task::Poll::Ready(
                binding.as_mut().poll(cx).is_pending()
            ))
            .await
        );
        hub.authenticate_client("client", identity());
        release_tx.send(()).unwrap();
        blocker.await.unwrap().unwrap();
        assert!(!binding.await);
        assert!(
            hub.inner.lock().unwrap().clients["client"]
                .session_id
                .is_none()
        );
        db.shutdown().await.unwrap();
    }

    #[test]
    fn focused_control_interleaves_with_fragmented_message() {
        futures_lite_block(async {
            let mut first = encode_frame_masked(OpCode::Text, b"hel", Some([1, 2, 3, 4]));
            first[0] &= 0x7f;
            first.extend(encode_frame_masked(OpCode::Ping, b"p", Some([1, 2, 3, 4])));
            first.extend(encode_frame_masked(
                OpCode::Continuation,
                b"lo",
                Some([1, 2, 3, 4]),
            ));
            let mut input = first.as_slice();
            let mut state = None;
            let ping = read_frame_inner(&mut input, 1024, true, &mut state)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(ping.opcode, OpCode::Ping);
            let text = read_frame_inner(&mut input, 1024, true, &mut state)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(text.payload, b"hello");
            assert!(state.is_none());
        });
    }

    #[test]
    fn focused_identity_does_not_grant_session_or_resource_access() {
        let hub = WsHub::new(WsHubConfig::default());
        let (tx, _rx) = mpsc::channel(2);
        hub.register("client", tx);
        hub.authenticate_client(
            "client",
            WsIdentity {
                user_id: "u".into(),
                session_id: Some("s".into()),
                expires_at: u64::MAX,
            },
        );
        assert_eq!(hub.broadcast_to_session("s", "secret", json!({})), 0);
        assert!(!hub.subscribe("client", "secret"));
    }

    #[test]
    fn focused_preupgraded_socket_uses_connection_loop() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(512);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_upgraded(server, None).await });
            let frame = tokio::time::timeout(Duration::from_secs(1), read_frame(&mut client, 1024))
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            let message: Value = serde_json::from_slice(&frame.payload).unwrap();
            assert_eq!(message["type"], "session.created");
            hub.stop();
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        });
    }

    #[test]
    fn focused_shutdown_interrupts_blocked_handshake_write() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(128);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            tokio::task::yield_now().await;
            hub.stop();
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .expect("shutdown stalled")
                .unwrap()
                .unwrap();
        });
    }

    #[test]
    fn focused_closed_outbound_terminates_connection() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(512);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            read_frame(&mut client, 1024).await.unwrap().unwrap();
            let id = hub.clients()[0].id.clone();
            // The same sender removal occurs when the outbound queue overflows.
            hub.unregister(&id);
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .expect("closed outbound left socket running")
                .unwrap()
                .unwrap();
        });
    }

    #[test]
    fn focused_blocked_close_frame_is_bounded() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(512);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            read_frame(&mut client, 1024).await.unwrap().unwrap();
            let id = hub.clients()[0].id.clone();
            let payload = json!({"data": "x".repeat(497)});
            assert_eq!(serde_json::to_string(&payload).unwrap().len(), 508);
            assert!(hub.send_to_client(&id, payload));
            tokio::time::timeout(Duration::from_secs(1), async {
                loop {
                    if hub
                        .inner
                        .lock()
                        .unwrap()
                        .clients
                        .get(&id)
                        .unwrap()
                        .outbound
                        .capacity()
                        == hub.config.outbound_capacity
                    {
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            client.write_all(&[0x88, 0x80, 0, 0, 0, 0]).await.unwrap();
            tokio::time::timeout(Duration::from_secs(3), task)
                .await
                .expect("close frame write stalled")
                .unwrap()
                .unwrap();
        });
    }

    #[test]
    fn focused_overflow_interrupts_blocked_frame_write() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig {
                outbound_capacity: 1,
                ..Default::default()
            }));
            let (server, mut client) = tokio::io::duplex(512);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            read_frame(&mut client, 1024).await.unwrap().unwrap();
            let id = hub.clients()[0].id.clone();
            assert!(hub.send_to_client(&id, json!({"data": "x".repeat(8192)})));
            tokio::time::timeout(Duration::from_secs(1), async {
                loop {
                    let ready = hub
                        .inner
                        .lock()
                        .unwrap()
                        .clients
                        .get(&id)
                        .unwrap()
                        .outbound
                        .capacity()
                        == 1;
                    if ready {
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .expect("large frame was not dequeued");
            assert!(!task.is_finished());
            assert!(hub.send_to_client(&id, json!({"queued": true})));
            assert!(!hub.send_to_client(&id, json!({"overflow": true})));
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .expect("overflow failed to interrupt write")
                .unwrap()
                .unwrap();
            assert_eq!(hub.client_count(), 0);
        });
    }

    #[test]
    fn focused_shutdown_interrupts_blocked_frame_write() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(512);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            read_frame(&mut client, 1024).await.unwrap().unwrap();
            let id = hub.clients()[0].id.clone();
            assert!(hub.send_to_client(&id, json!({"data": "x".repeat(8192)})));
            tokio::task::yield_now().await;
            hub.stop();
            tokio::time::timeout(Duration::from_secs(1), task)
                .await
                .expect("shutdown stalled")
                .unwrap()
                .unwrap();
            assert_eq!(hub.client_count(), 0);
        });
    }

    #[tokio::test]
    async fn focused_current_user_lookup_rechecks_expiry_after_await() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, _rx) = mpsc::channel(8);
        let _disconnect = hub.register("expiry-client", tx);
        hub.authenticate_client(
            "expiry-client",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let checking = {
            let hub = hub.clone();
            tokio::spawn(async move {
                hub.current_user_with("expiry-client", |_| async move {
                    let _ = started_tx.send(());
                    release_rx.await.unwrap()
                })
                .await
            })
        };
        started_rx.await.unwrap();
        hub.inner
            .lock()
            .unwrap()
            .clients
            .get_mut("expiry-client")
            .unwrap()
            .expires_at = 0;
        release_tx.send(true).unwrap();
        assert!(!checking.await.unwrap());
    }

    #[tokio::test]
    async fn focused_current_user_lookup_fences_reauthentication() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, _rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let checking = {
            let hub = hub.clone();
            tokio::spawn(async move {
                hub.current_user_with("c", |user| async move {
                    assert_eq!(user, "alice");
                    let _ = started_tx.send(());
                    release_rx.await.unwrap()
                })
                .await
            })
        };
        started_rx.await.unwrap();
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "bob".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        release_tx.send(true).unwrap();
        assert!(!checking.await.unwrap());
        assert!(
            hub.current_user_with("c", |user| async move { user == "bob" })
                .await
        );
        assert!(!hub.current_user_with("c", |_| async { false }).await);
    }

    #[tokio::test]
    async fn focused_pending_authentication_cannot_replace_new_identity() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, _rx) = mpsc::channel(8);
        let _disconnect = hub.register("c", tx);
        let identity = |user: &str| WsIdentity {
            user_id: user.into(),
            session_id: None,
            expires_at: u64::MAX,
        };
        hub.authenticate_client("c", identity("old"));
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let pending = {
            let hub = hub.clone();
            let alice = identity("alice");
            tokio::spawn(async move {
                hub.authenticate_user_with("c", alice, |_| async move {
                    let _ = started_tx.send(());
                    release_rx.await.unwrap()
                })
                .await
            })
        };
        started_rx.await.unwrap();
        assert!(!hub.has_authority("c"));
        hub.authenticate_client("c", identity("bob"));
        release_tx.send(true).unwrap();
        assert!(!pending.await.unwrap());
        assert!(
            hub.current_user_with("c", |user| async move { user == "bob" })
                .await
        );
        assert!(
            !hub.authenticate_user_with("c", identity("alice"), |_| async { false })
                .await
        );
        assert!(!hub.has_authority("c"));
    }

    #[tokio::test]
    async fn focused_pending_authentication_replacement_and_cancellation() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, _rx) = mpsc::channel(8);
        let _old = hub.register("c", tx);
        let identity = WsIdentity {
            user_id: "alice".into(),
            session_id: None,
            expires_at: u64::MAX,
        };
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let pending = {
            let hub = hub.clone();
            let identity = identity.clone();
            tokio::spawn(async move {
                hub.authenticate_user_with("c", identity, |_| async move {
                    let _ = started_tx.send(());
                    release_rx.await.unwrap()
                })
                .await
            })
        };
        started_rx.await.unwrap();
        let (tx, _rx2) = mpsc::channel(8);
        let _new = hub.register("c", tx);
        hub.authenticate_client("c", identity.clone());
        release_tx.send(true).unwrap();
        assert!(!pending.await.unwrap());
        assert!(hub.current_user_with("c", |_| async { true }).await);

        let (started_tx, started_rx) = oneshot::channel();
        let pending = {
            let hub = hub.clone();
            tokio::spawn(async move {
                hub.authenticate_user_with("c", identity, |_| async move {
                    let _ = started_tx.send(());
                    std::future::pending::<bool>().await
                })
                .await
            })
        };
        started_rx.await.unwrap();
        pending.abort();
        assert!(pending.await.unwrap_err().is_cancelled());
        assert!(!hub.has_authority("c"));
    }

    #[tokio::test]
    async fn focused_current_user_lookup_fences_connection_replacement() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, _rx) = mpsc::channel(8);
        let _old_disconnect = hub.register("c", tx);
        let identity = WsIdentity {
            user_id: "alice".into(),
            session_id: None,
            expires_at: u64::MAX,
        };
        hub.authenticate_client("c", identity.clone());
        let (started_tx, started_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let checking = {
            let hub = hub.clone();
            tokio::spawn(async move {
                hub.current_user_with("c", |_| async move {
                    let _ = started_tx.send(());
                    release_rx.await.unwrap()
                })
                .await
            })
        };
        started_rx.await.unwrap();
        let (replacement_tx, _replacement_rx) = mpsc::channel(8);
        let _new_disconnect = hub.register("c", replacement_tx);
        hub.authenticate_client("c", identity);
        release_tx.send(true).unwrap();
        assert!(!checking.await.unwrap());
    }

    #[test]
    fn focused_empty_user_identity_is_rejected() {
        let mut verifier = StaticTokenVerifier::default();
        verifier.insert(
            "empty",
            WsIdentity {
                user_id: String::new(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        let hub = Arc::new(WsHub::new(WsHubConfig {
            token_verifier: Arc::new(verifier),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: String::new(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(!hub.has_authority("c"));
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"authenticate","token":"empty"}"#,
            ))
            .unwrap();
        // A token that resolves to an unusable identity is present-but-rejected,
        // so the reference catch sends the UNAUTHORIZED frame and closes 4001.
        let Disposition::Close { code, response, .. } = disposition else {
            panic!("a rejected identity must close the socket");
        };
        assert_eq!(code, CLOSE_UNAUTHORIZED);
        let response = response.expect("a rejected token must carry an error envelope");
        assert_eq!(response["payload"]["code"], "UNAUTHORIZED");
        assert_eq!(response["payload"]["message"], "Authentication failed");
        assert!(rx.try_recv().is_err());
        assert!(!hub.has_authority("c"));
    }

    #[test]
    fn focused_expired_credential_denies_control_and_queued_delivery() {
        struct Allow;
        impl WsAuthorizer for Allow {
            fn can_access_session(&self, _: &str, _: &str) -> Result<bool, String> {
                Ok(true)
            }
            fn can_access_resource(&self, _: &str, _: &str) -> Result<bool, String> {
                Ok(true)
            }
        }
        let hub = WsHub::new(WsHubConfig {
            authorizer: Some(Arc::new(Allow)),
            ..Default::default()
        });
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(hub.bind_session("c", "s"));
        assert_eq!(hub.broadcast_to_session("s", "update", json!({})), 1);
        let queued = rx.try_recv().unwrap();
        hub.inner
            .lock()
            .unwrap()
            .clients
            .get_mut("c")
            .unwrap()
            .expires_at = 0;
        assert!(!hub.has_authority("c"));
        assert!(!hub.may_deliver("c", &queued.scope));
        assert_eq!(hub.broadcast_to_session("s", "update", json!({})), 0);
        assert!(!hub.bind_session("c", "s"));
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(hub.has_authority("c"));
        assert!(!hub.may_deliver("c", &queued.scope));
    }

    #[test]
    fn focused_expired_verifier_identity_is_rejected() {
        let verifier = StaticTokenVerifier::new().with_token(
            "expired",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: 0,
            },
        );
        let hub = Arc::new(WsHub::new(WsHubConfig {
            token_verifier: Arc::new(verifier),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"authenticate","token":"expired"}"#,
            ))
            .unwrap();
        // An expired credential is a rejected token, not a silent no-op: the
        // reference catch emits UNAUTHORIZED and closes 4001 without ever
        // emitting `session.created`.
        let Disposition::Close { code, response, .. } = disposition else {
            panic!("an expired credential must close the socket");
        };
        assert_eq!(code, CLOSE_UNAUTHORIZED);
        let response = response.expect("an expired credential must carry an error envelope");
        assert_eq!(response["payload"]["code"], "UNAUTHORIZED");
        assert_eq!(response["payload"]["message"], "Authentication failed");
        assert!(!hub.has_authority("c"));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn focused_unauthorized_control_keeps_connection_open() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(hub.send_to_client("c", json!({"private": true})));
        let old = rx.try_recv().unwrap();
        hub.inner
            .lock()
            .unwrap()
            .clients
            .get_mut("c")
            .unwrap()
            .expires_at = 0;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"subscribe","sessionId":"s"}"#,
            ))
            .unwrap();
        assert!(matches!(disposition, Disposition::Continue));
        assert!(!hub.may_deliver("c", &old.scope));
        let denial = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &denial.scope));
        assert_eq!(denial.value["payload"]["code"], "UNAUTHORIZED");
        assert_eq!(
            denial.value["payload"]["message"],
            "Authentication or access required"
        );
        let disposition = runtime
            .block_on(handle_message(&hub, "c", r#"{"type":"subscribe"}"#))
            .unwrap();
        assert!(matches!(disposition, Disposition::Continue));
        assert!(hub.may_deliver("c", &denial.scope));
        let second = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &second.scope));
    }

    /// Test double for the shared runtime user authority. Fails closed the same
    /// way the database-backed implementation does and records lookups.
    struct FakeUserDb {
        present: Mutex<HashSet<String>>,
        calls: AtomicU64,
    }

    impl FakeUserDb {
        fn new(users: &[&str]) -> Arc<Self> {
            Arc::new(Self {
                present: Mutex::new(users.iter().map(|user| (*user).to_string()).collect()),
                calls: AtomicU64::new(0),
            })
        }

        fn revoke(&self, user: &str) {
            self.present.lock().unwrap().remove(user);
        }

        fn grant(&self, user: &str) {
            self.present.lock().unwrap().insert(user.to_string());
        }

        fn calls(&self) -> u64 {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl WsUserAuthorityCheck for FakeUserDb {
        fn user_exists<'a>(
            &'a self,
            user_id: &'a str,
        ) -> Pin<Box<dyn Future<Output = bool> + Send + 'a>> {
            Box::pin(async move {
                self.calls.fetch_add(1, Ordering::SeqCst);
                self.present.lock().unwrap().contains(user_id)
            })
        }
    }

    fn verifier_with(identities: &[(&str, WsIdentity)]) -> Arc<StaticTokenVerifier> {
        let mut verifier = StaticTokenVerifier::default();
        for (token, identity) in identities {
            verifier.insert(*token, identity.clone());
        }
        Arc::new(verifier)
    }

    #[test]
    fn focused_authority_admits_known_user_at_upgrade() {
        futures_lite_block(async {
            let db = FakeUserDb::new(&["alice"]);
            let hub = Arc::new(WsHub::new(WsHubConfig {
                token_verifier: verifier_with(&[(
                    "good",
                    WsIdentity {
                        user_id: "alice".into(),
                        session_id: Some("s1".into()),
                        expires_at: u64::MAX,
                    },
                )]),
                user_authority: Some(db.clone()),
                ..Default::default()
            }));
            let (server, mut client) = tokio::io::duplex(4096);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer good\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            let created =
                tokio::time::timeout(Duration::from_secs(2), read_frame(&mut client, 4096))
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
            let payload: Value = serde_json::from_slice(&created.payload).unwrap();
            assert_eq!(payload["type"], "session.created");
            assert_eq!(payload["payload"]["authenticated"], true);
            // The upgrade envelope matches the pre-upgrade shape: clientId only. The
            // admitted identity is surfaced as `userId` on an authenticate reply.
            assert_eq!(payload["payload"]["clientId"], hub.clients()[0].id);
            assert!(payload["payload"].get("userId").is_none());
            assert_eq!(db.calls(), 1);
            assert!(hub.has_authority(&hub.clients()[0].id));
            client.shutdown().await.unwrap();
            let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
        });
    }

    #[test]
    fn focused_authority_denies_unknown_user_at_upgrade() {
        futures_lite_block(async {
            let db = FakeUserDb::new(&["alice"]);
            let hub = Arc::new(WsHub::new(WsHubConfig {
                token_verifier: verifier_with(&[(
                    "good",
                    WsIdentity {
                        user_id: "ghost".into(),
                        session_id: None,
                        expires_at: u64::MAX,
                    },
                )]),
                user_authority: Some(db.clone()),
                ..Default::default()
            }));
            let (server, mut client) = tokio::io::duplex(4096);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer good\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            let error = tokio::time::timeout(Duration::from_secs(2), read_frame(&mut client, 4096))
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(error.opcode, OpCode::Text);
            let payload: Value = serde_json::from_slice(&error.payload).unwrap();
            assert_eq!(payload["payload"]["code"], "UNAUTHORIZED");
            // Same public text as a bad credential: revocation is not disclosed.
            assert_eq!(payload["payload"]["message"], "Authentication failed");
            let close = read_frame(&mut client, 4096).await.unwrap().unwrap();
            assert_eq!(close.opcode, OpCode::Close);
            assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
            task.await.unwrap().unwrap();
            assert_eq!(db.calls(), 1);
        });
    }

    #[test]
    fn focused_authority_revocation_denies_protected_message() {
        let db = FakeUserDb::new(&["alice"]);
        let hub = Arc::new(WsHub::new(WsHubConfig {
            token_verifier: verifier_with(&[
                (
                    "good",
                    WsIdentity {
                        user_id: "alice".into(),
                        session_id: Some("s1".into()),
                        expires_at: u64::MAX,
                    },
                ),
                (
                    "good2",
                    WsIdentity {
                        user_id: "alice".into(),
                        session_id: Some("s1".into()),
                        expires_at: u64::MAX,
                    },
                ),
            ]),
            user_authority: Some(db.clone()),
            ..Default::default()
        }));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"authenticate","token":"good"}"#,
            ))
            .unwrap();
        assert!(matches!(disposition, Disposition::Continue));
        let created = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &created.scope));
        assert!(hub.has_authority("c"));
        assert!(hub.send_to_client("c", json!({ "private": true })));
        let queued = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &queued.scope));

        db.revoke("alice");
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"subscribe","sessionId":"s1"}"#,
            ))
            .unwrap();
        assert!(matches!(disposition, Disposition::Continue));
        // Queued private traffic from the revoked identity is no longer deliverable.
        assert!(!hub.may_deliver("c", &queued.scope));
        assert!(!hub.has_authority("c"));
        let denial = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &denial.scope));
        assert_eq!(denial.value["payload"]["code"], "UNAUTHORIZED");
        assert_eq!(
            denial.value["payload"]["message"],
            "Authentication or access required"
        );

        // Revocation is not a permanent ban: once the authority knows the user again a
        // fresh credential rebinds the same connection.
        db.grant("alice");
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"authenticate","token":"good2"}"#,
            ))
            .unwrap();
        assert!(matches!(disposition, Disposition::Continue));
        let rebound = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &rebound.scope));
        assert!(hub.has_authority("c"));
        assert!(db.calls() >= 2);
    }

    #[test]
    fn focused_invalid_initial_bearer_sends_error_before_close() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(4096);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer bad\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            let error = tokio::time::timeout(Duration::from_secs(2), read_frame(&mut client, 4096))
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(error.opcode, OpCode::Text);
            let payload: Value = serde_json::from_slice(&error.payload).unwrap();
            assert_eq!(payload["payload"]["code"], "UNAUTHORIZED");
            assert_eq!(payload["payload"]["message"], "Authentication failed");
            let close = read_frame(&mut client, 4096).await.unwrap().unwrap();
            assert_eq!(close.opcode, OpCode::Close);
            assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
            task.await.unwrap().unwrap();
        });
    }

    #[test]
    fn focused_empty_user_initial_bearer_sends_error_before_close() {
        futures_lite_block(async {
            let mut verifier = StaticTokenVerifier::default();
            verifier.insert(
                "bad",
                WsIdentity {
                    user_id: String::new(),
                    session_id: None,
                    expires_at: u64::MAX,
                },
            );
            let hub = Arc::new(WsHub::new(WsHubConfig {
                token_verifier: Arc::new(verifier),
                ..Default::default()
            }));
            let (server, mut client) = tokio::io::duplex(4096);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nAuthorization: Bearer bad\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            let error = tokio::time::timeout(Duration::from_secs(2), read_frame(&mut client, 4096))
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(error.opcode, OpCode::Text);
            let payload: Value = serde_json::from_slice(&error.payload).unwrap();
            assert_eq!(payload["payload"]["code"], "UNAUTHORIZED");
            assert_eq!(payload["payload"]["message"], "Authentication failed");
            let close = read_frame(&mut client, 4096).await.unwrap().unwrap();
            assert_eq!(close.opcode, OpCode::Close);
            assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
            task.await.unwrap().unwrap();
        });
    }

    #[test]
    fn focused_authentication_failure_sends_error_before_close() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (server, mut client) = tokio::io::duplex(4096);
            let task_hub = Arc::clone(&hub);
            let task = tokio::spawn(async move { task_hub.serve_connection(server).await });
            client.write_all(b"GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").await.unwrap();
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                response.push(client.read_u8().await.unwrap());
            }
            read_frame(&mut client, 4096).await.unwrap().unwrap();
            write_client_frame(
                &mut client,
                OpCode::Text,
                br#"{"type":"authenticate","token":"bad"}"#,
                [1, 2, 3, 4],
            )
            .await
            .unwrap();
            let error = tokio::time::timeout(Duration::from_secs(2), read_frame(&mut client, 4096))
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(error.opcode, OpCode::Text);
            let payload: Value = serde_json::from_slice(&error.payload).unwrap();
            assert_eq!(payload["type"], "error");
            assert_eq!(payload["payload"]["code"], "UNAUTHORIZED");
            assert_eq!(payload["payload"]["message"], "Authentication failed");
            let close = read_frame(&mut client, 4096).await.unwrap().unwrap();
            assert_eq!(close.opcode, OpCode::Close);
            assert_eq!(close.close_code(), Some(CLOSE_UNAUTHORIZED));
            task.await.unwrap().unwrap();
        });
    }

    #[test]
    fn focused_rejected_reauth_clears_identity_and_closes_unauthorized() {
        let hub = Arc::new(WsHub::new(WsHubConfig::default()));
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(hub.send_to_client("c", json!({"private": true})));
        let old = rx.try_recv().unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let disposition = runtime
            .block_on(handle_message(
                &hub,
                "c",
                r#"{"type":"authenticate","token":"bad"}"#,
            ))
            .unwrap();
        // Reference: a rejected late `authenticate` runs the same catch as the
        // handshake path, which clears the identity, emits the UNAUTHORIZED
        // error frame and then closes with 4001. Anything still queued for the
        // socket is dropped with the connection rather than delivered.
        let Disposition::Close { code, response, .. } = disposition else {
            panic!("a rejected late authenticate must close the socket");
        };
        assert_eq!(code, CLOSE_UNAUTHORIZED);
        let response = response.expect("a rejected late authenticate must carry an error envelope");
        assert_eq!(response["type"], "error");
        assert_eq!(response["payload"]["code"], "UNAUTHORIZED");
        assert_eq!(response["payload"]["message"], "Authentication failed");
        assert!(!hub.has_authority("c"));
        assert!(!hub.may_deliver("c", &old.scope));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn focused_injected_authority_revocation_and_rebinding() {
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Authority(AtomicBool);
        impl WsAuthorizer for Authority {
            fn can_access_session(&self, user: &str, session: &str) -> Result<bool, String> {
                Ok(self.0.load(Ordering::SeqCst) && user == "alice" && session == "s")
            }
            fn can_access_resource(&self, user: &str, key: &str) -> Result<bool, String> {
                if key == "error" {
                    return Err("offline".into());
                }
                Ok(self.0.load(Ordering::SeqCst) && user == "alice" && key == "root:/nodes")
            }
        }
        let authority = Arc::new(Authority(AtomicBool::new(true)));
        let hub = WsHub::new(WsHubConfig {
            authorizer: Some(authority.clone()),
            ..Default::default()
        });
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(!hub.bind_session("c", "other"));
        assert!(!hub.subscribe("c", "error"));
        assert!(hub.bind_session("c", "s"));
        assert!(hub.subscribe("c", "root:/nodes"));
        assert_eq!(hub.broadcast_to_session("s", "update", json!({})), 1);
        assert_eq!(
            hub.broadcast_to_resource("root:/nodes", "update", json!({})),
            1
        );
        let session = rx.try_recv().unwrap();
        let resource = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &session.scope));
        assert!(hub.may_deliver("c", &resource.scope));
        authority.0.store(false, Ordering::SeqCst);
        assert!(!hub.may_deliver("c", &session.scope));
        assert!(!hub.may_deliver("c", &resource.scope));
        assert_eq!(hub.broadcast_to_session("s", "update", json!({})), 0);
        assert_eq!(
            hub.broadcast_to_resource("root:/nodes", "update", json!({})),
            0
        );
        authority.0.store(true, Ordering::SeqCst);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "bob".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(!hub.may_deliver("c", &session.scope));
        assert!(!hub.may_deliver("c", &resource.scope));
    }

    #[test]
    fn focused_terminal_authority_revocation_and_reentrant_hub_access() {
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Authority {
            allowed: AtomicBool,
            hub: Mutex<std::sync::Weak<WsHub>>,
        }
        impl WsAuthorizer for Authority {
            fn can_access_session(&self, _: &str, _: &str) -> Result<bool, String> {
                Ok(false)
            }
            fn can_access_resource(&self, _: &str, _: &str) -> Result<bool, String> {
                Ok(false)
            }
            fn can_access_terminal(&self, user: &str, id: &str) -> Result<bool, String> {
                assert_eq!(
                    self.hub.lock().unwrap().upgrade().unwrap().client_count(),
                    1
                );
                Ok(self.allowed.load(Ordering::SeqCst) && user == "alice" && id == "owned")
            }
        }
        let authority = Arc::new(Authority {
            allowed: AtomicBool::new(true),
            hub: Mutex::new(std::sync::Weak::new()),
        });
        let hub = Arc::new(WsHub::new(WsHubConfig {
            authorizer: Some(authority.clone()),
            ..Default::default()
        }));
        *authority.hub.lock().unwrap() = Arc::downgrade(&hub);
        let (tx, mut rx) = mpsc::channel(8);
        hub.register("c", tx);
        hub.authenticate_client(
            "c",
            WsIdentity {
                user_id: "alice".into(),
                session_id: None,
                expires_at: u64::MAX,
            },
        );
        assert!(!hub.subscribe_terminal("c", "other"));
        assert!(!hub.subscribe("c", "owned"));
        assert!(hub.subscribe_terminal("c", "owned"));
        assert_eq!(
            hub.broadcast_to_terminal("owned", "surface.connected", json!({})),
            1
        );
        let queued = rx.try_recv().unwrap();
        assert!(hub.may_deliver("c", &queued.scope));
        authority.allowed.store(false, Ordering::SeqCst);
        assert!(!hub.may_deliver("c", &queued.scope));
        assert_eq!(
            hub.broadcast_to_terminal("owned", "surface.connected", json!({})),
            0
        );
        authority.allowed.store(true, Ordering::SeqCst);
        assert!(hub.unsubscribe_terminal("c", "owned"));
        assert!(!hub.may_deliver("c", &queued.scope));
    }

    #[test]
    fn repair_rejects_unmasked_and_noncanonical_client_frames() {
        let encoded = encode_frame(OpCode::Text, b"hello");
        assert!(matches!(
            futures_lite_block(read_frame_inner(
                &mut encoded.as_slice(),
                1024,
                true,
                &mut None
            )),
            Err(WsError::Protocol(_))
        ));
        let encoded = [0x81, 0xfe, 0, 1];
        assert!(matches!(
            futures_lite_block(read_frame_inner(
                &mut encoded.as_slice(),
                1024,
                true,
                &mut None
            )),
            Err(WsError::Protocol(_))
        ));
    }

    #[test]
    fn repair_rejects_unknown_resource_subscription() {
        futures_lite_block(async {
            let hub = Arc::new(WsHub::new(WsHubConfig::default()));
            let (tx, mut rx) = mpsc::channel(4);
            hub.register("client", tx);
            hub.authenticate_client(
                "client",
                WsIdentity {
                    user_id: "user".into(),
                    session_id: None,
                    expires_at: u64::MAX,
                },
            );
            handle_message(
                &hub,
                "client",
                r#"{"type":"resource.subscribe","payload":{"resource":"secret"}}"#,
            )
            .await
            .unwrap();
            let response = rx.recv().await.unwrap();
            assert_eq!(response.value["type"], "error");
            assert_eq!(
                response.value["payload"]["message"],
                "Unknown resource: secret"
            );
            assert!(response.value["payload"].get("code").is_none());
            assert!(
                hub.inner.lock().unwrap().clients["client"]
                    .subscriptions
                    .is_empty()
            );
        });
    }

    #[test]
    fn sha1_matches_reference_vectors() {
        assert_eq!(
            hex(&sha1(b"abc")),
            "a9993e364706816aba3e25717850c26c9cd0d89d"
        );
        assert_eq!(hex(&sha1(b"")), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
        assert_eq!(
            sha1_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn frame_round_trip_handles_all_length_classes() {
        for payload in [b"short".to_vec(), vec![b'x'; 126], vec![b'y'; 70_000]] {
            let encoded = encode_frame(OpCode::Text, &payload);
            let decoded = futures_lite_block(read_frame(&mut encoded.as_slice(), 1 << 20)).unwrap();
            let frame = decoded.expect("frame");
            assert_eq!(frame.opcode, OpCode::Text);
            assert_eq!(frame.payload, payload);
            assert!(!frame.masked);
        }
    }

    #[test]
    fn masked_client_frame_is_unmasked_on_read() {
        let encoded = encode_frame_masked(OpCode::Text, b"hello", Some([1, 2, 3, 4]));
        assert_eq!(encoded[1] & 0x80, 0x80);
        let frame = futures_lite_block(read_frame(&mut encoded.as_slice(), 1024))
            .unwrap()
            .expect("frame");
        assert_eq!(frame.payload, b"hello");
        assert!(frame.masked);
    }

    #[test]
    fn oversized_frame_is_rejected() {
        let encoded = encode_frame(OpCode::Binary, &vec![0u8; 4096]);
        let error = futures_lite_block(read_frame(&mut encoded.as_slice(), 1024)).unwrap_err();
        assert!(matches!(error, WsError::TooLarge { .. }));
    }

    /// Run a ready future to completion on a scratch runtime (unit tests only).
    fn futures_lite_block<F: Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(future)
    }

    fn upgrade_request() -> HandshakeRequest {
        HandshakeRequest {
            method: "GET".into(),
            target: "/ws?token=abc".into(),
            headers: vec![
                ("Host".into(), "localhost".into()),
                ("Upgrade".into(), "websocket".into()),
                ("Connection".into(), "Upgrade".into()),
                ("Sec-WebSocket-Version".into(), "13".into()),
                (
                    "Sec-WebSocket-Key".into(),
                    "dGhlIHNhbXBsZSBub25jZQ==".into(),
                ),
            ],
        }
    }

    #[test]
    fn handshake_accepts_valid_upgrade_and_exposes_token() {
        let request = upgrade_request();
        let outcome = negotiate_handshake(&request, "/ws");
        assert_eq!(
            outcome,
            HandshakeOutcome::Accepted {
                accept_key: "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=".into()
            }
        );
        assert_eq!(request.bearer_token().as_deref(), Some("abc"));
    }

    #[test]
    fn focused_initial_token_source_precedence() {
        let mut request = upgrade_request();
        request
            .headers
            .push(("Authorization".into(), "Bearer header".into()));
        request
            .headers
            .push(("Cookie".into(), "other=x; jait_token=cookie".into()));
        request.target = "/ws?token=first&token=second".into();
        assert_eq!(request.bearer_token().as_deref(), Some("first"));
        request.target = "/ws?token=".into();
        assert_eq!(request.bearer_token(), None);
        request.target = "/ws".into();
        assert_eq!(request.bearer_token().as_deref(), Some("header"));
        request.headers.retain(|(key, _)| key != "Authorization");
        assert_eq!(request.bearer_token().as_deref(), Some("cookie"));
    }

    #[test]
    fn handshake_rejects_wrong_path_version_and_key() {
        let mut request = upgrade_request();
        request.target = "/nope".into();
        assert_eq!(negotiate_handshake(&request, "/ws").status(), 404);

        let mut request = upgrade_request();
        for header in request.headers.iter_mut() {
            if header.0.eq_ignore_ascii_case("sec-websocket-version") {
                header.1 = "8".into();
            }
        }
        assert_eq!(negotiate_handshake(&request, "/ws").status(), 426);

        let mut request = upgrade_request();
        for header in request.headers.iter_mut() {
            if header.0.eq_ignore_ascii_case("sec-websocket-key") {
                header.1 = "not-a-key".into();
            }
        }
        assert_eq!(negotiate_handshake(&request, "/ws").status(), 400);
    }

    #[test]
    fn envelope_carries_type_session_timestamp_payload() {
        let value = envelope("subscribed", Some("sess-1"), json!({"k": 1}));
        assert_eq!(value["type"], "subscribed");
        assert_eq!(value["sessionId"], "sess-1");
        assert_eq!(value["payload"]["k"], 1);
        assert!(
            value["timestamp"]
                .as_str()
                .expect("timestamp")
                .ends_with('Z')
        );
    }
}
