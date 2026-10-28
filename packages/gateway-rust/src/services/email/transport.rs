//! Bounded mail-provider HTTP using the canonical request/transport contract.
//! No redirects: bearer tokens and OAuth secrets must remain on fixed origins.
pub use crate::services::calendar::{Request, Response, Transport};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

pub const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
pub fn native_transport() -> Result<Transport, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(4)
        .build()
        .map_err(|_| "Cannot initialize email HTTP client")?;
    let admission = Arc::new(Semaphore::new(8));
    Ok(Arc::new(move |r| {
        let client = client.clone();
        let admission = admission.clone();
        Box::pin(async move {
            let _permit = admission
                .try_acquire_owned()
                .map_err(|_| "Email HTTP capacity exhausted")?;
            let url = url::Url::parse(&r.url).map_err(|_| "Invalid email URL")?;
            if url.scheme() != "https"
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some_and(|p| p != 443)
                || !matches!(
                    url.host_str(),
                    Some(
                        "gmail.googleapis.com"
                            | "graph.microsoft.com"
                            | "oauth2.googleapis.com"
                            | "login.microsoftonline.com"
                    )
                )
            {
                return Err("Email HTTP destination is not authorized".into());
            }
            if r.body.as_ref().is_some_and(|b| b.len() > 12 * 1024 * 1024) {
                return Err("Email request is too large".into());
            }
            let method = reqwest::Method::from_bytes(r.method.as_bytes())
                .map_err(|_| "Invalid email HTTP method")?;
            let mut request = client.request(method, url);
            for (key, value) in r.headers {
                request = request.header(key, value.as_str().ok_or("Invalid email header")?);
            }
            if let Some(body) = r.body {
                request = request.body(body);
            }
            // Dropping this future cancels the request; no detached tasks or retries.
            let mut response = request
                .send()
                .await
                .map_err(|_| "Email HTTP request failed")?;
            let status = response.status().as_u16();
            if response
                .content_length()
                .is_some_and(|n| n > MAX_RESPONSE_BYTES as u64)
            {
                return Err("Email response is too large".into());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "Email response read failed")?
            {
                if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                    return Err("Email response is too large".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            let data = if bytes.is_empty() {
                Ok(json!({}))
            } else {
                serde_json::from_slice(&bytes)
                    .map_err(|_| "Invalid email provider JSON".to_string())
            };
            Ok(Response { status, data })
        })
    }))
}

pub(crate) async fn api(
    http: &Transport,
    provider: &str,
    token: &str,
    path: &str,
    method: &str,
    body: Option<Value>,
    eventual: bool,
) -> Result<Value, String> {
    let base = match provider {
        "gmail" => "https://gmail.googleapis.com/gmail/v1/users/me",
        "outlook" => "https://graph.microsoft.com/v1.0",
        _ => return Err("Unknown email provider".into()),
    };
    if !path.starts_with('/') || path.starts_with("//") || path.len() > 16_384 {
        return Err("Invalid email API path".into());
    }
    let mut headers = json!({"Authorization":format!("Bearer {token}")})
        .as_object()
        .unwrap()
        .clone();
    if body.is_some() {
        headers.insert("Content-Type".into(), json!("application/json"));
    }
    if eventual {
        headers.insert("ConsistencyLevel".into(), json!("eventual"));
    }
    let response = tokio::time::timeout(
        Duration::from_secs(30),
        http(Request {
            url: format!("{base}{path}"),
            method: method.into(),
            headers,
            body: body.map(|v| v.to_string()),
        }),
    )
    .await
    .map_err(|_| "Email request timed out")??;
    let data = response.data?;
    if !(200..300).contains(&response.status) {
        let prefix = if provider == "gmail" {
            "Gmail API error"
        } else {
            "Microsoft Graph error"
        };
        // Do not put arbitrary provider response bodies in model/tool diagnostics.
        return Err(format!("{prefix}: HTTP {}", response.status));
    }
    if !data.is_object() {
        return Err("Invalid email provider response shape".into());
    }
    Ok(data)
}
pub(crate) fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}
pub(crate) fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or("").to_string()
}
pub(crate) fn array<'a>(v: &'a Value, key: &str) -> Result<&'a [Value], String> {
    match v.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(a)) if a.len() <= 1000 => Ok(a),
        _ => Err("Invalid or excessive email provider collection".into()),
    }
}
pub(crate) fn required(v: &Value, key: &str) -> Result<String, String> {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Email provider response missing {key}"))
}
pub(crate) fn limit(n: Option<f64>, default: usize, max: usize) -> usize {
    n.filter(|v| v.is_finite())
        .unwrap_or(default as f64)
        .clamp(1.0, max as f64) as usize
}

// Native socket transports share the existing HTTP adapter file to keep the
// canonical provider transport intact. Runtime must supply owner policy and cancel.
#[path = "mime.rs"]
mod mime;
use super::{connection::PinnedMailServer, imap::*};
use crate::runtime::blocking::BlockingLane;
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::future::BoxFuture;
use std::{
    collections::VecDeque,
    net::{IpAddr, SocketAddr},
    sync::atomic::{AtomicBool, Ordering},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader},
    net::TcpStream,
    sync::{OwnedSemaphorePermit, watch},
    time::Instant,
};
use tokio_rustls::{
    TlsConnector,
    rustls::{ClientConfig, RootCertStore, pki_types::ServerName},
};

/// Policy input contains no password, message body or arbitrary server response.
/// The runtime authorizer must check account ownership, effect consent, destination
/// and grant expiry. Instantiate once per owner, never as an ambient global host.
#[derive(Clone, Debug)]
pub struct MailEffect {
    pub owner: String,
    pub protocol: &'static str,
    pub operation: &'static str,
    pub servername: String,
    pub address: IpAddr,
    pub port: u16,
    pub user: String,
    pub sender: Option<String>,
    pub recipients: Vec<String>,
}
pub type MailAuthorization =
    Arc<dyn Fn(MailEffect) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;

pub struct NativeProtocolHost {
    owner: String,
    authorize: MailAuthorization,
    cancel: watch::Receiver<bool>,
    tls: TlsConnector,
    admission: Arc<Semaphore>,
    blocking: BlockingLane,
    sends: SendJournal,
}
/// Bounded local effect evidence. An outer timeout may drop the SMTP future;
/// Uncertain remains observable even when that caller cannot receive its error.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MailSendState {
    Uncertain,
    Accepted,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MailSendOutcome {
    pub message_id: String,
    pub state: MailSendState,
    pub started_at: String,
}
#[derive(Default)]
struct SendJournal(std::sync::Mutex<VecDeque<MailSendOutcome>>);
impl SendJournal {
    fn begin(&self, id: &str) -> Result<(), String> {
        let mut entries = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        // Never silently evict an uncertain effect; runtime must reconcile it.
        if entries.len() == 64 {
            let index = entries
                .iter()
                .position(|e| e.state == MailSendState::Accepted)
                .ok_or("Unresolved SMTP send evidence capacity exhausted")?;
            entries.remove(index);
        }
        entries.push_back(MailSendOutcome {
            message_id: id.into(),
            state: MailSendState::Uncertain,
            started_at: chrono::Utc::now().to_rfc3339(),
        });
        Ok(())
    }
    fn accepted(&self, id: &str) {
        let mut entries = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(entry) = entries.iter_mut().find(|e| e.message_id == id) {
            entry.state = MailSendState::Accepted;
        }
    }
    fn snapshot(&self) -> Vec<MailSendOutcome> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .cloned()
            .collect()
    }
}
impl NativeProtocolHost {
    /// Native system roots are loaded on the shared blocking lane. No insecure
    /// certificate bypass, proxy, fallback address or implicit retry exists.
    pub async fn new(
        owner: String,
        authorize: MailAuthorization,
        cancel: watch::Receiver<bool>,
        blocking: BlockingLane,
    ) -> Result<Self, String> {
        if owner.is_empty() || owner.len() > 512 {
            return Err("Invalid email owner".into());
        }
        let roots = control(
            &cancel,
            Instant::now() + Duration::from_secs(8),
            8000,
            blocking.run(|| {
                let native = rustls_native_certs::load_native_certs();
                let mut roots = RootCertStore::empty();
                for cert in native.certs {
                    roots.add(cert).map_err(|_| "Cannot load email TLS roots")?;
                }
                if roots.is_empty() {
                    return Err("No email TLS trust roots");
                }
                Ok(roots)
            }),
        )
        .await?
        .map_err(|_| "Email blocking capacity unavailable")?
        .map_err(str::to_string)?;
        let tls = TlsConnector::from(Arc::new(
            ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth(),
        ));
        Ok(Self {
            owner,
            authorize,
            cancel,
            tls,
            admission: Arc::new(Semaphore::new(8)),
            blocking,
            sends: SendJournal::default(),
        })
    }
    /// Caller-owned transport evidence, with no bodies, recipients or credentials.
    /// Persist/reconcile uncertain IDs before discarding this host on restart.
    pub fn send_outcomes(&self) -> Vec<MailSendOutcome> {
        self.sends.snapshot()
    }
    fn effect(
        &self,
        server: &PinnedMailServer,
        protocol: &'static str,
        operation: &'static str,
    ) -> Result<MailEffect, String> {
        let config = super::connection::validate_server(server.config.clone())?;
        if config.host != server.config.host || config.user != server.config.user {
            return Err("Mail destination and credentials must be canonical".into());
        }
        let address = config
            .host
            .parse::<IpAddr>()
            .map_err(|_| "Mail destination must be pinned")?;
        let target = match address {
            IpAddr::V4(a) => format!("https://{a}/"),
            IpAddr::V6(a) => format!("https://[{a}]/"),
        };
        crate::security::ssrf_guard::SsrfGuard::default()
            .validate(&target)
            .map_err(|_| "Mail destination is not public")?;
        ServerName::try_from(server.servername.clone())
            .map_err(|_| "Invalid mail TLS servername")?;
        Ok(MailEffect {
            owner: self.owner.clone(),
            protocol,
            operation,
            servername: server.servername.clone(),
            address,
            port: config.port as u16,
            user: config.user,
            sender: None,
            recipients: vec![],
        })
    }
    async fn open(
        &self,
        server: &PinnedMailServer,
        effect: MailEffect,
        limits: ProtocolLimits,
    ) -> Result<Wire, String> {
        let permit = self
            .admission
            .clone()
            .try_acquire_owned()
            .map_err(|_| "Mail socket capacity exhausted")?;
        let end = Instant::now() + Duration::from_millis(limits.operation_ms);
        control(
            &self.cancel,
            end,
            limits.socket_ms,
            (self.authorize)(effect.clone()),
        )
        .await?
        .map_err(|_| "Email operation is not authorized")?;
        let socket = control(
            &self.cancel,
            end,
            limits.connect_ms,
            TcpStream::connect(SocketAddr::new(effect.address, effect.port)),
        )
        .await?
        .map_err(|_| "Mail connection failed")?;
        let mut wire = Wire {
            io: BufReader::new(Box::new(socket) as Box<dyn MailSocket>),
            cancel: self.cancel.clone(),
            end,
            limits,
            _permit: Some(permit),
            bytes: 0,
        };
        if server.config.secure {
            wire = wire.upgrade(&self.tls, &server.servername).await?;
        }
        Ok(wire)
    }
}
fn limits(input: ProtocolLimits) -> ProtocolLimits {
    ProtocolLimits {
        connect_ms: input.connect_ms.clamp(1, 8000),
        greeting_ms: input.greeting_ms.clamp(1, 8000),
        socket_ms: input.socket_ms.clamp(1, 15_000),
        operation_ms: input.operation_ms.clamp(1, 30_000),
        max_message_bytes: input.max_message_bytes.clamp(1, mime::MAX_MAIL),
        max_items: input.max_items.clamp(1, 200),
    }
}
async fn control<T>(
    cancel: &watch::Receiver<bool>,
    end: Instant,
    ms: u64,
    future: impl std::future::Future<Output = T>,
) -> Result<T, String> {
    let mut cancel = cancel.clone();
    if *cancel.borrow() || cancel.has_changed().is_err() {
        return Err("Mail operation cancelled".into());
    }
    tokio::select! {
        biased;
        _ = cancel.wait_for(|v| *v) => Err("Mail operation cancelled".into()),
        value = tokio::time::timeout_at(end.min(Instant::now() + Duration::from_millis(ms)), future) => value.map_err(|_| "Mail operation timed out".into()),
    }
}
trait MailSocket: AsyncRead + AsyncWrite + Send + Unpin {}
impl<T: AsyncRead + AsyncWrite + Send + Unpin> MailSocket for T {}
struct Wire {
    io: BufReader<Box<dyn MailSocket>>,
    cancel: watch::Receiver<bool>,
    end: Instant,
    limits: ProtocolLimits,
    _permit: Option<OwnedSemaphorePermit>,
    bytes: usize,
}
impl Wire {
    async fn upgrade(self, tls: &TlsConnector, servername: &str) -> Result<Self, String> {
        if !self.io.buffer().is_empty() {
            return Err("Unexpected data before mail TLS handshake".into());
        }
        let name = ServerName::try_from(servername.to_string())
            .map_err(|_| "Invalid mail TLS servername")?;
        let socket = control(
            &self.cancel,
            self.end,
            self.limits.connect_ms,
            tls.connect(name, self.io.into_inner()),
        )
        .await?
        .map_err(|_| "Mail TLS verification failed")?;
        Ok(Self {
            io: BufReader::new(Box::new(socket)),
            cancel: self.cancel,
            end: self.end,
            limits: self.limits,
            _permit: self._permit,
            bytes: self.bytes,
        })
    }
    async fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("Mail command exceeds byte limit".into());
        }
        control(
            &self.cancel,
            self.end,
            self.limits.socket_ms,
            self.io.get_mut().write_all(bytes),
        )
        .await?
        .map_err(|_| "Mail write failed")?;
        control(
            &self.cancel,
            self.end,
            self.limits.socket_ms,
            self.io.get_mut().flush(),
        )
        .await?
        .map_err(|_| "Mail flush failed".to_string())
    }
    fn charge(&mut self, n: usize) -> Result<(), String> {
        self.bytes = self.bytes.saturating_add(n);
        if self.bytes > 16 * 1024 * 1024 {
            Err("Mail response exceeds byte limit".into())
        } else {
            Ok(())
        }
    }
    async fn line(&mut self, max: usize) -> Result<Vec<u8>, String> {
        let mut line = Vec::new();
        loop {
            let available = control(
                &self.cancel,
                self.end,
                self.limits.socket_ms,
                self.io.fill_buf(),
            )
            .await?
            .map_err(|_| "Mail read failed")?;
            if available.is_empty() {
                return Err("Mail connection closed".into());
            }
            let end = available.iter().position(|b| *b == b'\n').map(|n| n + 1);
            let count = end.unwrap_or(available.len());
            if line.len().saturating_add(count) > max {
                return Err("Mail response line exceeds limit".into());
            }
            line.extend_from_slice(&available[..count]);
            self.io.consume(count);
            self.charge(count)?;
            if end.is_some() {
                break;
            }
        }
        if !line.ends_with(b"\r\n") {
            return Err("Invalid mail line ending".into());
        }
        line.truncate(line.len() - 2);
        Ok(line)
    }
    async fn literal(&mut self, n: usize, max: usize) -> Result<Vec<u8>, String> {
        if n > max {
            return Err("Mail literal exceeds byte limit".into());
        }
        self.charge(n)?;
        let mut bytes = vec![0; n];
        control(
            &self.cancel,
            self.end,
            self.limits.socket_ms,
            self.io.read_exact(&mut bytes),
        )
        .await?
        .map_err(|_| "Truncated mail literal")?;
        Ok(bytes)
    }
    // SEARCH may contain millions of IDs. Retain only the caller's bounded tail;
    // no whole-line or complete result list is allocated.
    async fn words(
        &mut self,
        mut consume: impl FnMut(&[u8]) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut word = Vec::new();
        let mut cr = false;
        loop {
            let available = control(
                &self.cancel,
                self.end,
                self.limits.socket_ms,
                self.io.fill_buf(),
            )
            .await?
            .map_err(|_| "Mail read failed")?;
            if available.is_empty() {
                return Err("Mail connection closed".into());
            }
            let mut count = 0;
            let mut done = false;
            for &b in available {
                count += 1;
                if cr {
                    if b != b'\n' {
                        return Err("Invalid mail line ending".into());
                    }
                    done = true;
                    break;
                }
                if b == b'\n' {
                    return Err("Invalid mail line ending".into());
                }
                if b == b'\r' || b == b' ' || b == b'\t' {
                    if !word.is_empty() {
                        consume(&word)?;
                        word.clear();
                    }
                    if b == b'\r' {
                        cr = true;
                    }
                } else {
                    if word.len() >= 4096 {
                        return Err("IMAP search token limit exceeded".into());
                    }
                    word.push(b);
                }
            }
            self.io.consume(count);
            self.charge(count)?;
            if done {
                return Ok(());
            }
        }
    }
    fn begin(&mut self) {
        self.end = Instant::now() + Duration::from_millis(self.limits.operation_ms);
        self.bytes = 0;
    }
}
fn quote(s: &str) -> Result<String, String> {
    if s.len() > 8192 || s.contains(['\r', '\n', '\0']) {
        return Err("Invalid mail command value".into());
    }
    Ok(format!(
        "\"{}\"",
        s.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

// RFC 3501 tokens, including exact-sized literals; bounded before allocation.
#[derive(Clone, Debug, PartialEq)]
enum Token {
    Atom(String),
    List(Vec<Token>),
    Literal(Vec<u8>),
}
impl Token {
    fn text(&self) -> Option<&str> {
        match self {
            Self::Atom(s) => Some(s),
            Self::Literal(b) => std::str::from_utf8(b).ok(),
            _ => None,
        }
    }
    fn list(&self) -> Option<&[Token]> {
        if let Self::List(v) = self {
            Some(v)
        } else {
            None
        }
    }
}
fn tokens(line: &[u8], literals: &mut VecDeque<Vec<u8>>) -> Result<Vec<Token>, String> {
    fn parse(
        bytes: &[u8],
        index: &mut usize,
        depth: usize,
        count: &mut usize,
        literals: &mut VecDeque<Vec<u8>>,
        nested: bool,
    ) -> Result<Vec<Token>, String> {
        if depth > 32 {
            return Err("IMAP nesting limit exceeded".into());
        }
        let mut out = Vec::new();
        while *index < bytes.len() {
            let b = bytes[*index];
            if b.is_ascii_whitespace() {
                *index += 1;
                continue;
            }
            if b == b')' {
                if !nested {
                    return Err("Malformed IMAP response".into());
                }
                *index += 1;
                return Ok(out);
            }
            *count += 1;
            if *count > 20_000 {
                return Err("IMAP token limit exceeded".into());
            }
            if b == b'(' {
                *index += 1;
                out.push(Token::List(parse(
                    bytes,
                    index,
                    depth + 1,
                    count,
                    literals,
                    true,
                )?));
            } else if b == b'"' {
                *index += 1;
                let mut value = Vec::new();
                let mut closed = false;
                while *index < bytes.len() {
                    let c = bytes[*index];
                    *index += 1;
                    if c == b'"' {
                        closed = true;
                        break;
                    }
                    let c = if c == b'\\' {
                        let c = *bytes.get(*index).ok_or("Malformed IMAP string")?;
                        *index += 1;
                        c
                    } else {
                        c
                    };
                    value.push(c);
                }
                if !closed {
                    return Err("Malformed IMAP string".into());
                }
                out.push(Token::Atom(
                    String::from_utf8(value).map_err(|_| "Invalid IMAP text")?,
                ));
            } else {
                let start = *index;
                // BODY[HEADER.FIELDS (...)] is one attribute despite spaces/brackets.
                let mut bracket = false;
                while *index < bytes.len() {
                    let c = bytes[*index];
                    if c == b'[' {
                        bracket = true;
                    }
                    if c == b']' {
                        bracket = false;
                    }
                    if !bracket && (c.is_ascii_whitespace() || c == b'(' || c == b')') {
                        break;
                    }
                    *index += 1;
                }
                if *index == start || bracket {
                    return Err("Malformed IMAP atom".into());
                }
                let value =
                    std::str::from_utf8(&bytes[start..*index]).map_err(|_| "Invalid IMAP text")?;
                if value.starts_with('{') && value.ends_with('}') {
                    out.push(Token::Literal(
                        literals.pop_front().ok_or("Missing IMAP literal")?,
                    ));
                } else {
                    out.push(Token::Atom(value.into()));
                }
            }
        }
        if nested {
            return Err("Unclosed IMAP list".into());
        }
        Ok(out)
    }
    let result = parse(line, &mut 0, 0, &mut 0, literals, false)?;
    if !literals.is_empty() {
        return Err("Unexpected IMAP literal".into());
    }
    Ok(result)
}
async fn frame(wire: &mut Wire, max_literal: usize) -> Result<Vec<Token>, String> {
    let mut line = wire.line(65_536).await?;
    let mut literals = VecDeque::new();
    loop {
        if !line.ends_with(b"}") {
            break;
        }
        let Some(start) = line.iter().rposition(|b| *b == b'{') else {
            break;
        };
        let count = std::str::from_utf8(&line[start + 1..line.len() - 1])
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .ok_or("Invalid IMAP literal length")?;
        if literals.len() >= 64 {
            return Err("Too many IMAP literals".into());
        }
        literals.push_back(wire.literal(count, max_literal).await?);
        let tail = wire.line(65_536).await?;
        if line.len().saturating_add(tail.len()) > 1024 * 1024 {
            return Err("IMAP metadata exceeds limit".into());
        }
        line.push(b' ');
        line.extend(tail);
    }
    tokens(&line, &mut literals)
}
fn atom(token: Option<&Token>) -> &str {
    token.and_then(Token::text).unwrap_or("")
}
fn number(token: Option<&Token>) -> Result<u64, String> {
    atom(token)
        .parse::<u64>()
        .ok()
        .filter(|n| *n <= 4_294_967_295)
        .ok_or("Invalid IMAP number".into())
}
fn uid(n: u64) -> Result<String, String> {
    if n == 0 || n > 4_294_967_295 {
        Err("Invalid IMAP UID".into())
    } else {
        Ok(n.to_string())
    }
}
async fn command(
    wire: &mut Wire,
    command: &str,
    max_literal: usize,
    max_frames: usize,
) -> Result<Vec<Vec<Token>>, String> {
    wire.write(format!("J1 {command}\r\n").as_bytes()).await?;
    let mut frames = Vec::new();
    for _ in 0..max_frames.saturating_add(32).min(1024) {
        let f = frame(wire, max_literal).await?;
        if atom(f.first()) == "J1" {
            if atom(f.get(1)).eq_ignore_ascii_case("OK") {
                return Ok(frames);
            }
            return Err("IMAP command rejected".into());
        }
        if atom(f.first()) != "*" || atom(f.get(1)).eq_ignore_ascii_case("BYE") {
            return Err("Unexpected IMAP response".into());
        }
        if frames.len() >= max_frames {
            return Err("IMAP response item limit exceeded".into());
        }
        frames.push(f);
    }
    Err("IMAP response frame limit exceeded".into())
}
struct NativeImap {
    wire: Option<Wire>,
    effect: MailEffect,
    authorize: MailAuthorization,
    selected: Option<(String, bool)>,
}
impl NativeImap {
    async fn run(
        &mut self,
        cmd: String,
        action: &'static str,
        max_literal: usize,
        max_frames: usize,
    ) -> Result<Vec<Vec<Token>>, String> {
        // Taking the socket makes cancellation/error terminal for this connection.
        let mut wire = self.wire.take().ok_or("IMAP session is closed")?;
        wire.begin();
        let mut effect = self.effect.clone();
        effect.operation = action;
        control(
            &wire.cancel,
            wire.end,
            wire.limits.socket_ms,
            (self.authorize)(effect),
        )
        .await?
        .map_err(|_| "Email operation is not authorized")?;
        let frames = command(&mut wire, &cmd, max_literal, max_frames).await?;
        self.wire = Some(wire);
        Ok(frames)
    }
    fn writable(&self) -> Result<(), String> {
        match self.selected {
            Some((_, false)) => Ok(()),
            _ => Err("Mailbox is not selected for writing".into()),
        }
    }
}
// Modified UTF-7 is required for literal mailbox paths without UTF8=ACCEPT.
fn folder_encode(s: &str) -> Result<String, String> {
    if s.len() > 4096 || s.contains(['\r', '\n', '\0']) {
        return Err("Invalid mailbox folder".into());
    }
    let mut out = String::new();
    let mut wide = Vec::new();
    let flush = |out: &mut String, wide: &mut Vec<u8>| {
        if !wide.is_empty() {
            out.push('&');
            out.push_str(
                &STANDARD
                    .encode(&*wide)
                    .trim_end_matches('=')
                    .replace('/', ","),
            );
            out.push('-');
            wide.clear();
        }
    };
    for c in s.chars() {
        if (' '..='~').contains(&c) {
            flush(&mut out, &mut wide);
            if c == '&' {
                out.push_str("&-");
            } else {
                out.push(c);
            }
        } else {
            let mut buf = [0; 2];
            for unit in c.encode_utf16(&mut buf) {
                wide.extend_from_slice(&unit.to_be_bytes());
            }
        }
    }
    flush(&mut out, &mut wide);
    Ok(out)
}
fn folder_decode(s: &str) -> Result<String, String> {
    let mut rest = s;
    let mut out = String::new();
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let (encoded, suffix) = rest[pos + 1..]
            .split_once('-')
            .ok_or("Invalid IMAP folder encoding")?;
        if encoded.is_empty() {
            out.push('&');
        } else {
            let mut encoded = encoded.replace(',', "/");
            while encoded.len() % 4 != 0 {
                encoded.push('=');
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| "Invalid IMAP folder encoding")?;
            if bytes.len() % 2 != 0 {
                return Err("Invalid IMAP folder encoding".into());
            }
            let wide: Vec<u16> = bytes
                .as_chunks::<2>().0.iter()
                .map(|b| u16::from_be_bytes([b[0], b[1]]))
                .collect();
            out.push_str(&String::from_utf16(&wide).map_err(|_| "Invalid IMAP folder encoding")?);
        }
        rest = suffix;
    }
    out.push_str(rest);
    if out.len() > 4096 || out.contains(['\r', '\n', '\0']) {
        return Err("Invalid IMAP folder".into());
    }
    Ok(out)
}
impl ImapSession for NativeImap {
    fn select<'a>(
        &'a mut self,
        folder: &'a str,
        read_only: bool,
    ) -> BoxFuture<'a, Result<MailboxState, String>> {
        Box::pin(async move {
            let cmd = format!(
                "{} {}",
                if read_only { "EXAMINE" } else { "SELECT" },
                quote(&folder_encode(folder)?)?
            );
            let frames = self
                .run(cmd, if read_only { "read" } else { "write" }, 0, 64)
                .await?;
            let mut exists = None;
            let mut validity = None;
            for f in frames {
                if atom(f.get(2)).eq_ignore_ascii_case("EXISTS") {
                    exists = Some(number(f.get(1))?);
                }
                // UIDVALIDITY is a response code, tokenized as [UIDVALIDITY n].
                if let Some(code) = atom(f.get(2))
                    .strip_prefix('[')
                    .and_then(|v| v.strip_suffix(']'))
                    && let Some((key, value)) = code.split_once(' ')
                        && key.eq_ignore_ascii_case("UIDVALIDITY") {
                            validity = Some(
                                value
                                    .parse::<u64>()
                                    .ok()
                                    .filter(|n| *n > 0 && *n <= 4_294_967_295)
                                    .ok_or("Invalid UID validity")?
                                    .to_string(),
                            );
                        }
            }
            let state = MailboxState {
                path: folder.into(),
                exists: exists.ok_or("Missing mailbox count")?,
                uid_validity: validity.ok_or("Missing UID validity")?,
            };
            self.selected = Some((folder.into(), read_only));
            Ok(state)
        })
    }
    fn folders(&mut self, max: usize) -> BoxFuture<'_, Result<Vec<HostFolder>, String>> {
        Box::pin(async move {
            let max = max.min(
                self.wire
                    .as_ref()
                    .ok_or("IMAP session is closed")?
                    .limits
                    .max_items,
            );
            let frames = self
                .run("LIST \"\" \"*\"".into(), "read", 4096, max + 16)
                .await?;
            let mut result = Vec::new();
            for f in frames {
                if !atom(f.get(1)).eq_ignore_ascii_case("LIST") {
                    continue;
                }
                if result.len() >= max {
                    return Err("IMAP folder limit exceeded".into());
                }
                let flags = f
                    .get(2)
                    .and_then(Token::list)
                    .ok_or("Invalid IMAP LIST flags")?;
                let path = folder_decode(
                    f.get(4)
                        .and_then(Token::text)
                        .ok_or("Invalid IMAP folder")?,
                )?;
                if flags
                    .iter()
                    .any(|v| atom(Some(v)).eq_ignore_ascii_case("\\Noselect"))
                {
                    continue;
                }
                let special_use = flags.iter().find_map(|v| {
                    if atom(Some(v)).eq_ignore_ascii_case("\\Trash") {
                        Some("\\Trash".into())
                    } else {
                        None
                    }
                });
                let delimiter = atom(f.get(3));
                let name = if delimiter.chars().count() == 1 {
                    path.rsplit(delimiter).next().unwrap_or(&path).to_string()
                } else {
                    path.clone()
                };
                result.push(HostFolder {
                    path,
                    name,
                    special_use,
                });
            }
            Ok(result)
        })
    }
    fn search_tail<'a>(
        &'a mut self,
        query: &'a str,
        max: usize,
    ) -> BoxFuture<'a, Result<Vec<u64>, String>> {
        Box::pin(async move {
            if self.selected.is_none() || query.len() > 4096 {
                return Err("Invalid IMAP search".into());
            }
            let max = max.min(200);
            if max == 0 {
                return Err("Invalid IMAP search limit".into());
            }
            let mut wire = self.wire.take().ok_or("IMAP session is closed")?;
            wire.begin();
            let mut effect = self.effect.clone();
            effect.operation = "read";
            control(
                &wire.cancel,
                wire.end,
                wire.limits.socket_ms,
                (self.authorize)(effect),
            )
            .await?
            .map_err(|_| "Email operation is not authorized")?;
            wire.write(
                format!("J1 UID SEARCH CHARSET UTF-8 TEXT {}\r\n", quote(query)?).as_bytes(),
            )
            .await?;
            let mut ids = VecDeque::with_capacity(max);
            let mut completed = false;
            for _ in 0..32 {
                let mut prefix = Vec::new();
                let mut index = 0;
                wire.words(|word| {
                    if index < 2 {
                        prefix.push(
                            std::str::from_utf8(word)
                                .map_err(|_| "Invalid IMAP search response")?
                                .to_string(),
                        );
                    } else if prefix.first().is_some_and(|s| s == "*")
                        && prefix
                            .get(1)
                            .is_some_and(|s| s.eq_ignore_ascii_case("SEARCH"))
                    {
                        let n = std::str::from_utf8(word)
                            .ok()
                            .and_then(|s| s.parse::<u64>().ok())
                            .ok_or("Invalid IMAP search UID")?;
                        uid(n)?;
                        if ids.len() == max {
                            ids.pop_front();
                        }
                        ids.push_back(n);
                    }
                    index += 1;
                    Ok(())
                })
                .await?;
                if prefix.first().is_some_and(|s| s == "J1") {
                    if !prefix.get(1).is_some_and(|s| s.eq_ignore_ascii_case("OK")) {
                        return Err("IMAP search rejected".into());
                    }
                    completed = true;
                    break;
                }
                if !prefix.first().is_some_and(|s| s == "*")
                    || prefix.get(1).is_some_and(|s| s.eq_ignore_ascii_case("BYE"))
                {
                    return Err("Unexpected IMAP search response".into());
                }
            }
            if !completed {
                return Err("IMAP search frame limit exceeded".into());
            }
            self.wire = Some(wire);
            Ok(ids.into_iter().collect())
        })
    }
    fn fetch(
        &mut self,
        range: FetchRange,
        source: bool,
        max_items: usize,
        max_bytes: usize,
    ) -> BoxFuture<'_, Result<Vec<HostMessage>, String>> {
        Box::pin(async move {
            let limits = self.wire.as_ref().ok_or("IMAP session is closed")?.limits;
            if self.selected.is_none()
                || max_items == 0
                || max_items > limits.max_items
                || max_bytes == 0
                || max_bytes > limits.max_message_bytes
            {
                return Err("Invalid IMAP fetch limits".into());
            }
            let (prefix, set) = match range {
                FetchRange::Uids(ids) => {
                    if ids.is_empty() || ids.len() > max_items {
                        return Err("Invalid IMAP fetch range".into());
                    }
                    (
                        "UID ",
                        ids.into_iter()
                            .map(uid)
                            .collect::<Result<Vec<_>, _>>()?
                            .join(","),
                    )
                }
                FetchRange::Sequence { start } => ("", format!("{}:*", uid(start)?)),
            };
            let body = if source {
                "BODY.PEEK[]"
            } else {
                "BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)]"
            };
            let frames = self
                .run(
                    format!("{prefix}FETCH {set} (UID FLAGS RFC822.SIZE BODYSTRUCTURE {body})"),
                    "read",
                    if source { max_bytes } else { 65_536 },
                    max_items + 16,
                )
                .await?;
            let mut messages = Vec::new();
            let mut total = 0usize;
            for f in frames {
                if !atom(f.get(2)).eq_ignore_ascii_case("FETCH") {
                    continue;
                }
                if messages.len() >= max_items {
                    return Err("IMAP fetch item limit exceeded".into());
                }
                let values = f
                    .get(3)
                    .and_then(Token::list)
                    .ok_or("Malformed IMAP FETCH")?;
                if values.len() % 2 != 0 {
                    return Err("Malformed IMAP FETCH attributes".into());
                }
                let mut id = None;
                let mut size = None;
                let mut flags = Vec::new();
                let mut raw = None;
                let mut attachments = false;
                fn attachment(v: &Token) -> bool {
                    match v {
                        Token::Atom(s) => s.eq_ignore_ascii_case("ATTACHMENT"),
                        Token::List(v) => v.iter().any(attachment),
                        _ => false,
                    }
                }
                for pair in values.as_chunks::<2>().0 {
                    match atom(pair.first()).to_ascii_uppercase().as_str() {
                        "UID" => {
                            let n = number(pair.get(1))?;
                            uid(n)?;
                            id = Some(n);
                        }
                        "RFC822.SIZE" => {
                            size = Some(
                                usize::try_from(number(pair.get(1))?)
                                    .map_err(|_| "Invalid message size")?,
                            )
                        }
                        "FLAGS" => {
                            let list = pair[1].list().ok_or("Invalid IMAP flags")?;
                            if list.len() > 100 {
                                return Err("IMAP flag limit exceeded".into());
                            }
                            flags = list
                                .iter()
                                .map(|v| {
                                    v.text()
                                        .map(str::to_string)
                                        .ok_or("Invalid IMAP flag".into())
                                })
                                .collect::<Result<Vec<_>, String>>()?;
                        }
                        "BODYSTRUCTURE" => attachments = attachment(&pair[1]),
                        key if key.starts_with("BODY[") => {
                            if let Token::Literal(v) = &pair[1] {
                                raw = Some(v.clone());
                            } else {
                                return Err("Missing IMAP message literal".into());
                            }
                        }
                        _ => {}
                    }
                }
                let raw = raw.ok_or("Missing IMAP message data")?;
                total = total.saturating_add(raw.len());
                if total > max_bytes {
                    return Err("IMAP fetch byte limit exceeded".into());
                }
                let (fields, _) = mime::headers(&raw)?;
                let envelope = Envelope {
                    from: mime::decode_header(&mime::header(&fields, "from"))?,
                    to: mime::decode_header(&mime::header(&fields, "to"))?,
                    subject: mime::decode_header(&mime::header(&fields, "subject"))?,
                    date: mime::header(&fields, "date"),
                };
                messages.push(HostMessage {
                    uid: id.ok_or("Missing IMAP UID")?,
                    envelope,
                    flags,
                    size,
                    has_attachments: attachments,
                    source: source.then_some(raw),
                });
            }
            Ok(messages)
        })
    }
    fn flag<'a>(
        &'a mut self,
        id: u64,
        flag: &'a str,
        add: bool,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.writable()?;
            let value = flag.strip_prefix('\\').unwrap_or(flag);
            if value.is_empty()
                || value.len() > 64
                || !value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
            {
                return Err("Invalid IMAP flag".into());
            }
            self.run(
                format!(
                    "UID STORE {} {}FLAGS.SILENT ({flag})",
                    uid(id)?,
                    if add { "+" } else { "-" }
                ),
                "write",
                0,
                32,
            )
            .await?;
            Ok(())
        })
    }
    fn move_message<'a>(
        &'a mut self,
        id: u64,
        folder: &'a str,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.writable()?;
            // No COPY + EXPUNGE fallback: failures cannot delete unrelated messages.
            self.run(
                format!("UID MOVE {} {}", uid(id)?, quote(&folder_encode(folder)?)?),
                "write",
                0,
                32,
            )
            .await?;
            Ok(())
        })
    }
}

async fn smtp_reply(wire: &mut Wire, expected: u16) -> Result<Vec<String>, String> {
    let mut lines = Vec::new();
    for _ in 0..64 {
        let bytes = wire.line(4096).await?;
        let line = std::str::from_utf8(&bytes).map_err(|_| "Invalid SMTP reply")?;
        let code = line
            .get(..3)
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or("Invalid SMTP reply")?;
        if code != expected {
            return Err(format!("SMTP command rejected ({code})"));
        }
        let separator = bytes.get(3).copied().ok_or("Invalid SMTP reply")?;
        if separator != b' ' && separator != b'-' {
            return Err("Invalid SMTP reply".into());
        }
        lines.push(line[4..].to_string());
        if separator == b' ' {
            return Ok(lines);
        }
    }
    Err("SMTP reply line limit exceeded".into())
}
async fn smtp_command(wire: &mut Wire, cmd: &str, code: u16) -> Result<Vec<String>, String> {
    wire.write(format!("{cmd}\r\n").as_bytes()).await?;
    smtp_reply(wire, code).await
}
async fn smtp_send(
    wire: &mut Wire,
    message: &SmtpMessage,
    data: &[u8],
    recipients: &[String],
    id: String,
    journal: &SendJournal,
) -> Result<Option<String>, String> {
    smtp_command(wire, &format!("MAIL FROM:<{}>", message.from_address), 250).await?;
    // Sequential RCPT, no pipelining or partial-recipient success.
    for recipient in recipients {
        smtp_command(wire, &format!("RCPT TO:<{recipient}>"), 250).await?;
    }
    smtp_command(wire, "DATA", 354).await?;
    // Once any DATA may leave this socket, a dropped connection/cancel/deadline
    // is uncertain. The base64 MIME body cannot contain SMTP dot lines.
    journal.begin(&id)?;
    let result = async {
        wire.write(data).await?;
        wire.write(b".\r\n").await?;
        smtp_reply(wire, 250).await?;
        Ok::<_, String>(())
    }
    .await;
    result.map_err(|_| {
        "SMTP send outcome is uncertain; message may have been delivered; do not retry".to_string()
    })?;
    journal.accepted(&id);
    Ok(Some(id))
}
async fn imap_auth(
    mut wire: Wire,
    server: &PinnedMailServer,
    tls: &TlsConnector,
) -> Result<Wire, String> {
    let greeting_ms = wire.limits.greeting_ms;
    let greeting = control(
        &wire.cancel.clone(),
        wire.end,
        greeting_ms,
        frame(&mut wire, 0),
    )
    .await??;
    // PREAUTH is not accepted: this host always verifies supplied account credentials.
    if atom(greeting.first()) != "*" || !atom(greeting.get(1)).eq_ignore_ascii_case("OK") {
        return Err("IMAP greeting rejected".into());
    }
    if !server.config.secure {
        command(&mut wire, "STARTTLS", 0, 16).await?;
        wire = wire.upgrade(tls, &server.servername).await?;
    }
    command(
        &mut wire,
        &format!(
            "LOGIN {} {}",
            quote(&server.config.user)?,
            quote(&server.config.password)?
        ),
        0,
        16,
    )
    .await?;
    Ok(wire)
}
async fn smtp_auth(
    mut wire: Wire,
    server: &PinnedMailServer,
    tls: &TlsConnector,
) -> Result<Wire, String> {
    let greeting_ms = wire.limits.greeting_ms;
    control(
        &wire.cancel.clone(),
        wire.end,
        greeting_ms,
        smtp_reply(&mut wire, 220),
    )
    .await??;
    let mut capabilities = smtp_command(&mut wire, "EHLO jait.local", 250).await?;
    if !server.config.secure {
        if !capabilities
            .iter()
            .any(|c| c.eq_ignore_ascii_case("STARTTLS"))
        {
            return Err("SMTP server requires STARTTLS support".into());
        }
        smtp_command(&mut wire, "STARTTLS", 220).await?;
        wire = wire.upgrade(tls, &server.servername).await?;
        capabilities = smtp_command(&mut wire, "EHLO jait.local", 250).await?;
    }
    if server.config.user.contains('\0') || server.config.password.contains('\0') {
        return Err("Invalid SMTP credentials".into());
    }
    let plain = capabilities.iter().any(|line| {
        line.split_whitespace()
            .next()
            .is_some_and(|v| v.eq_ignore_ascii_case("AUTH"))
            && line
                .split_whitespace()
                .skip(1)
                .any(|v| v.eq_ignore_ascii_case("PLAIN"))
    });
    if plain {
        // AUTH challenge form avoids exceeding SMTP's command line ceiling.
        smtp_command(&mut wire, "AUTH PLAIN", 334).await?;
        let credentials = STANDARD.encode(format!(
            "\0{}\0{}",
            server.config.user, server.config.password
        ));
        smtp_command(&mut wire, &credentials, 235).await?;
    } else {
        return Err("SMTP server does not support AUTH PLAIN".into());
    }
    Ok(wire)
}
impl MailProtocolHost for NativeProtocolHost {
    fn imap(
        &self,
        server: PinnedMailServer,
        input: ProtocolLimits,
    ) -> BoxFuture<'_, Result<Box<dyn ImapSession>, String>> {
        Box::pin(async move {
            let limits = limits(input);
            let effect = self.effect(&server, "imap", "connect")?;
            let wire = self.open(&server, effect.clone(), limits).await?;
            let wire = imap_auth(wire, &server, &self.tls).await?;
            Ok(Box::new(NativeImap {
                wire: Some(wire),
                effect,
                authorize: self.authorize.clone(),
                selected: None,
            }) as Box<dyn ImapSession>)
        })
    }
    fn smtp(
        &self,
        server: PinnedMailServer,
        input: ProtocolLimits,
        message: Option<SmtpMessage>,
    ) -> BoxFuture<'_, Result<Option<String>, String>> {
        Box::pin(async move {
            let limits = limits(input);
            let mut effect = self.effect(
                &server,
                "smtp",
                if message.is_some() { "send" } else { "verify" },
            )?;
            let to_compose = message.clone();
            let composed = control(
                &self.cancel,
                Instant::now() + Duration::from_secs(30),
                30_000,
                self.blocking
                    .run(move || to_compose.as_ref().map(mime::compose).transpose()),
            )
            .await?
            .map_err(|_| "Email MIME blocking capacity unavailable")??;
            if let (Some(m), Some((_, recipients, _))) = (&message, &composed) {
                effect.sender = Some(m.from_address.clone());
                effect.recipients = recipients.clone();
            }
            let wire = self.open(&server, effect.clone(), limits).await?;
            let mut wire = smtp_auth(wire, &server, &self.tls).await?;
            if let (Some(message), Some((data, recipients, id))) = (message, composed) {
                // Recheck after authentication, immediately before the external effect.
                control(
                    &wire.cancel,
                    wire.end,
                    limits.socket_ms,
                    (self.authorize)(effect),
                )
                .await?
                .map_err(|_| "Email operation is not authorized")?;
                smtp_send(&mut wire, &message, &data, &recipients, id, &self.sends).await
            } else {
                Ok(None)
            }
            // Socket is owned by this future and closes on every exit. QUIT failure
            // cannot turn an accepted SMTP send into an error and trigger a retry.
        })
    }
    fn parse_mime(
        &self,
        source: Vec<u8>,
        max_html_bytes: usize,
    ) -> BoxFuture<'_, Result<ParsedMime, String>> {
        Box::pin(async move {
            if source.len() > mime::MAX_MAIL || max_html_bytes > mime::MAX_MAIL {
                return Err("MIME message exceeds byte limit".into());
            }
            let stopped = Arc::new(AtomicBool::new(false));
            struct Stop(Arc<AtomicBool>);
            impl Drop for Stop {
                fn drop(&mut self) {
                    self.0.store(true, Ordering::Relaxed);
                }
            }
            let _stop = Stop(stopped.clone());
            control(
                &self.cancel,
                Instant::now() + Duration::from_secs(30),
                30_000,
                self.blocking
                    .run(move || mime::parse(&source, max_html_bytes, &stopped)),
            )
            .await?
            .map_err(|_| "Email MIME blocking capacity unavailable")?
        })
    }
}
#[cfg(test)]
#[path = "transport_tests.rs"]
mod transport_tests;
