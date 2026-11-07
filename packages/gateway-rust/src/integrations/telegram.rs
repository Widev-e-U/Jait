//! Native Telegram Bot API connector. The runtime supplies owner/node authority;
//! the default transport only reaches api.telegram.org over pinned public TLS.
//! It never starts from construction. Dropping the final connector owner cancels
//! polling and typing. No channel action grants assessment target authority.
use super::channel_contracts::*;
use crate::{
    text::js_trim,
    time::{Clock, default_clock},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::{StreamExt, future::BoxFuture};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, Weak},
    time::Duration,
};
use tokio::sync::{Semaphore, oneshot, watch};

const MAX_BODY: usize = 2 * 1024 * 1024;
const MAX_TEXT: usize = 65536;
const MAX_CHOICES: usize = 500;
const CALL_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Debug)]
pub enum TelegramAction {
    Start,
    Pair,
    Send {
        conversation_id: String,
        text: String,
    },
    Inbound {
        sender_id: String,
        conversation_id: String,
    },
}
pub type TelegramAuthority =
    Arc<dyn Fn(TelegramAction) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;
pub type QrEncoder =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<String, String>> + Send + Sync>;

/// Trusted injected transport, bound to this connector's owner and credentials.
/// The connector still bounds/cancels each call and validates response shapes.
pub trait TelegramTransport: Send + Sync {
    fn request(
        &self,
        token: String,
        method: &'static str,
        body: Option<Value>,
        budget: Duration,
    ) -> BoxFuture<'_, Result<Value, String>>;
}
pub struct TelegramHttpTransport;
impl TelegramTransport for TelegramHttpTransport {
    fn request(
        &self,
        token: String,
        method: &'static str,
        body: Option<Value>,
        budget: Duration,
    ) -> BoxFuture<'_, Result<Value, String>> {
        Box::pin(async move {
            // No caller-selected URL, credential path segments, redirects or proxies.
            if token.is_empty()
                || token.len() > 1024
                || !token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_:".contains(&b))
            {
                return Err("Invalid Telegram credential".into());
            }
            if !matches!(
                method,
                "getMe"
                    | "getUpdates"
                    | "sendMessage"
                    | "editMessageText"
                    | "setMyCommands"
                    | "sendChatAction"
                    | "answerCallbackQuery"
                    | "editMessageReplyMarkup"
            ) {
                return Err("Unsupported Telegram operation".into());
            }
            let host = "api.telegram.org";
            let addresses = tokio::net::lookup_host((host, 443))
                .await
                .map_err(|_| "Telegram DNS failed")?
                .take(33)
                .collect::<Vec<_>>();
            if addresses.is_empty() || addresses.len() > 32 {
                return Err("Invalid Telegram DNS answers".into());
            }
            let guard = crate::security::ssrf_guard::SsrfGuard::default();
            for addr in &addresses {
                if addr.port() != 443 || guard.validate(&format!("https://{addr}/")).is_err() {
                    return Err("Blocked Telegram DNS answer".into());
                }
            }
            let client = reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .retry(reqwest::retry::never())
                .connect_timeout(Duration::from_secs(3))
                .timeout(budget)
                .pool_max_idle_per_host(0)
                .resolve_to_addrs(host, &addresses)
                .build()
                .map_err(|_| "Telegram HTTP initialization failed")?;
            let url = format!("https://{host}/bot{token}/{method}");
            let request = if let Some(body) = body {
                client.post(url).json(&body)
            } else {
                client.get(url)
            };
            let response = request
                .send()
                .await
                .map_err(|_| "Telegram request failed")?;
            let mut stream = response.bytes_stream();
            let mut bytes = Vec::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|_| "Telegram response failed")?;
                if bytes.len().saturating_add(chunk.len()) > MAX_BODY {
                    return Err("Telegram response too large".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            serde_json::from_slice(&bytes).map_err(|_| "Invalid Telegram response".into())
        })
    }
}
#[derive(Clone)]
pub struct TelegramOptions {
    /// Explicit empty token overrides config and environment.
    pub token: Option<String>,
    pub poll_timeout_seconds: u64,
    pub pairing_ttl_ms: i64,
    pub retry_min_ms: u64,
    pub retry_max_ms: u64,
}
impl Default for TelegramOptions {
    fn default() -> Self {
        Self {
            token: None,
            poll_timeout_seconds: 25,
            pairing_ttl_ms: 300000,
            retry_min_ms: 1000,
            retry_max_ms: 30000,
        }
    }
}
#[derive(Clone, Debug)]
pub struct TelegramError {
    pub message: String,
    pub code: Option<u16>,
}
impl std::fmt::Display for TelegramError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.message.fmt(f)
    }
}
impl std::error::Error for TelegramError {}
impl From<&str> for TelegramError {
    fn from(s: &str) -> Self {
        Self {
            message: s.into(),
            code: None,
        }
    }
}
impl From<String> for TelegramError {
    fn from(message: String) -> Self {
        Self {
            message,
            code: None,
        }
    }
}
pub fn is_fatal_poll_error(code: Option<u16>) -> bool {
    matches!(code, Some(401 | 404))
}
pub fn poll_backoff_ms(attempt: u32, min: u64, max: u64) -> u64 {
    min.saturating_mul(
        1u64.checked_shl(attempt.saturating_sub(1).min(63))
            .unwrap_or(u64::MAX),
    )
    .min(max)
}
pub fn describe_poll_failure(message: &str, code: Option<u16>) -> String {
    if code == Some(409) {
        "Another instance is polling this bot — Telegram allows only one. Stop the other Jait gateway, or give this one its own bot token.".into()
    } else if is_fatal_poll_error(code) {
        format!(
            "{message} — the bot token was rejected. Check it in @BotFather and paste it again."
        )
    } else {
        message.into()
    }
}
pub fn parse_start_payload(text: &str) -> Option<String> {
    let text = js_trim(text);
    let re = regex::Regex::new(r"^/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?$").unwrap();
    re.captures(text)
        .map(|m| m.get(1).map(|v| v.as_str()).unwrap_or("").into())
}
pub fn extract_bot_token(text: &str) -> Option<String> {
    regex::Regex::new(r"\b([0-9]{6,}:[A-Za-z0-9_-]{30,})\b")
        .unwrap()
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|v| v.as_str().into())
}
pub fn sanitize_return_url(raw: Option<&str>) -> Option<String> {
    let url = url::Url::parse(js_trim(raw?)).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.to_string())
}
pub fn bot_father_setup_link() -> String {
    "https://t.me/BotFather?text=%2Fnewbot".into()
}
pub fn suggest_bot_username(seed: &str) -> String {
    format!("jait_{seed}_bot")
}
pub fn generate_username_slug(length: usize) -> Result<String, TelegramError> {
    if length > 1024 {
        return Err("Username seed too large".into());
    }
    let mut bytes = vec![0; length];
    getrandom::fill(&mut bytes)
        .map_err(|_| TelegramError::from("Telegram random source failed"))?;
    Ok(bytes
        .into_iter()
        .map(|b| b"abcdefghijklmnopqrstuvwxyz234567"[(b % 32) as usize] as char)
        .collect())
}
fn id_string(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
pub fn message_to_inbound(message: &Value, now_ms: i64) -> Option<InboundMessage> {
    let text = js_trim(message.get("text")?.as_str()?);
    if text.is_empty() || text.len() > MAX_TEXT {
        return None;
    }
    let conversation_id = id_string(&message["chat"]["id"])?;
    let sender_id = id_string(&message["from"]["id"]).unwrap_or_else(|| conversation_id.clone());
    let sender_name = message["from"]["username"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| format!("@{s}"))
        .or_else(|| message["from"]["first_name"].as_str().map(String::from));
    Some(InboundMessage {
        channel_id: "telegram".into(),
        conversation_id,
        sender_id,
        sender_name,
        text: text.into(),
        timestamp: message["date"]
            .as_f64()
            .unwrap_or((now_ms as f64 / 1000.0).floor())
            * 1000.0,
        from_me: false,
        is_self_chat: false,
    })
}
/// JS slice counts UTF-16 units. Lossy decoding preserves ordinary captions;
/// a split surrogate is replaced because native UTF-8 strings cannot encode it.
fn truncate_utf16(text: &str, max: usize) -> String {
    String::from_utf16_lossy(&text.encode_utf16().take(max).collect::<Vec<_>>())
}
pub fn to_telegram_commands(commands: &[ChannelCommandDescriptor]) -> Value {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entry in commands {
        let command = js_trim(&entry.name)
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .take(32)
            .collect::<String>();
        let description = truncate_utf16(js_trim(&entry.description), 256);
        if command.is_empty() || description.is_empty() || !seen.insert(command.clone()) {
            continue;
        }
        result.push(json!({"command":command,"description":description}));
        if result.len() == 100 {
            break;
        }
    }
    Value::Array(result)
}

#[derive(Clone)]
struct Run {
    generation: u64,
    token: String,
    cancel: watch::Receiver<bool>,
}
struct State {
    generation: u64,
    status: ChannelStatus,
    detail: Option<ChannelStatusDetail>,
    events: Option<Arc<ChannelConnectorEvents>>,
    cancel: Option<watch::Sender<bool>>,
    task: Option<tokio::task::JoinHandle<()>>,
    run: Option<Run>,
    config: ChannelConfig,
    offset: u64,
    pairing: Option<String>,
    expiry: i64,
    bot_username: Option<String>,
    return_url: Option<String>,
    last_poll_error: Option<String>,
    choices: VecDeque<(String, String, String)>,
    choice_seq: u64,
}
struct Inner {
    state: Mutex<State>,
    transport: Arc<dyn TelegramTransport>,
    authority: TelegramAuthority,
    qr: Option<QrEncoder>,
    options: TelegramOptions,
    clock: Clock,
    calls: Semaphore,
    effects: Arc<Semaphore>,
}
struct Owner(Weak<Inner>);
impl Drop for Owner {
    fn drop(&mut self) {
        if let Some(inner) = self.0.upgrade()
            && let Some(cancel) = &inner.state.lock().unwrap().cancel
        {
            cancel.send_replace(true);
        }
    }
}
#[derive(Clone)]
pub struct TelegramConnector {
    inner: Arc<Inner>,
    _owner: Arc<Owner>,
}
impl TelegramConnector {
    pub fn new(authority: TelegramAuthority) -> Self {
        Self::with_dependencies(
            Arc::new(TelegramHttpTransport),
            authority,
            TelegramOptions::default(),
            default_clock(),
            None,
        )
    }
    pub fn with_dependencies(
        transport: Arc<dyn TelegramTransport>,
        authority: TelegramAuthority,
        options: TelegramOptions,
        clock: Clock,
        qr: Option<QrEncoder>,
    ) -> Self {
        let inner = Arc::new(Inner {
            state: Mutex::new(State {
                generation: 0,
                status: ChannelStatus::Stopped,
                detail: None,
                events: None,
                cancel: None,
                task: None,
                run: None,
                config: ChannelConfig::default(),
                offset: 0,
                pairing: None,
                expiry: 0,
                bot_username: None,
                return_url: None,
                last_poll_error: None,
                choices: VecDeque::new(),
                choice_seq: 0,
            }),
            transport,
            authority,
            qr,
            options,
            clock,
            calls: Semaphore::new(8),
            effects: Arc::new(Semaphore::new(8)),
        });
        Self {
            _owner: Arc::new(Owner(Arc::downgrade(&inner))),
            inner,
        }
    }
    pub fn current_link(&self) -> Option<String> {
        self.inner
            .state
            .lock()
            .unwrap()
            .detail
            .as_ref()
            .and_then(|d| d.link.clone())
    }
    pub fn current_expiry(&self) -> Option<String> {
        let expiry = self.inner.state.lock().unwrap().expiry;
        (expiry != 0)
            .then(|| crate::time::iso(expiry).ok())
            .flatten()
    }
    fn run(&self) -> Result<Run, TelegramError> {
        self.inner
            .state
            .lock()
            .unwrap()
            .run
            .clone()
            .ok_or_else(|| "Telegram is not connected".into())
    }
    pub async fn start_connector(
        &self,
        events: Arc<ChannelConnectorEvents>,
        config: ChannelConfig,
        options: Option<ChannelPairOptions>,
    ) -> Result<(), TelegramError> {
        // Authorization is cancellable with caller cancellation and bounded before effects.
        tokio::time::timeout(CALL_TIMEOUT, (self.inner.authority)(TelegramAction::Start))
            .await
            .map_err(|_| TelegramError::from("Telegram authorization timed out"))?
            .map_err(|_| TelegramError::from("Telegram start denied"))?;
        let token = self.inner.options.token.clone().unwrap_or_else(|| {
            config
                .token
                .as_deref()
                .map(js_trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .unwrap_or_else(|| std::env::var("TELEGRAM_BOT_TOKEN").unwrap_or_default())
        });
        let token = js_trim(&token).to_string();
        let (tx, rx) = watch::channel(false);
        let (run, old_task) = {
            let mut s = self.inner.state.lock().unwrap();
            if let Some(old) = s.cancel.take() {
                old.send_replace(true);
            }
            s.generation = s.generation.wrapping_add(1);
            s.events = Some(events);
            s.config = config;
            s.cancel = Some(tx);
            s.return_url =
                sanitize_return_url(options.as_ref().and_then(|o| o.return_url.as_deref()));
            s.last_poll_error = None;
            s.pairing = None;
            s.expiry = 0;
            let run = Run {
                generation: s.generation,
                token,
                cancel: rx,
            };
            s.run = Some(run.clone());
            (run, s.task.take())
        };
        if let Some(task) = old_task {
            task.abort();
        }
        if run.token.is_empty() {
            self.inner.set_status(&run,ChannelStatus::Error,Some(ChannelStatusDetail {error:Some("No bot token configured. Create a bot with @BotFather and paste its token.".into()),..Default::default()}));
            return Ok(());
        }
        self.inner.set_status(&run, ChannelStatus::Connecting, None);
        let (ready_tx, ready_rx) = oneshot::channel();
        let inner = self.inner.clone();
        let other = run.clone();
        let task = tokio::spawn(async move {
            inner.supervise(other, ready_tx).await;
        });
        {
            let mut s = self.inner.state.lock().unwrap();
            if s.generation == run.generation {
                s.task = Some(task);
            } else {
                task.abort();
            }
        }
        ready_rx
            .await
            .map_err(|_| TelegramError::from("Telegram start cancelled"))
    }
    pub async fn stop_connector(&self) -> Result<(), TelegramError> {
        let (task, events) = {
            let mut s = self.inner.state.lock().unwrap();
            s.generation = s.generation.wrapping_add(1);
            if let Some(cancel) = s.cancel.take() {
                cancel.send_replace(true);
            }
            s.run = None;
            s.pairing = None;
            s.expiry = 0;
            s.last_poll_error = None;
            s.status = ChannelStatus::Stopped;
            s.detail = None;
            (s.task.take(), s.events.clone())
        };
        if let Some(task) = task {
            task.abort();
            let _ = task.await;
        }
        if let Some(events) = events {
            (events.on_status)(ChannelStatus::Stopped, None);
        }
        Ok(())
    }
    pub async fn pair_connector(
        &self,
        options: Option<ChannelPairOptions>,
    ) -> Result<(), TelegramError> {
        let run = self.run()?;
        if !matches!(self.status(), ChannelStatus::Connected | ChannelStatus::Qr) {
            return Err("Connect the channel before pairing".into());
        }
        self.inner.authorize(&run, TelegramAction::Pair).await?;
        if let Some(url) =
            sanitize_return_url(options.as_ref().and_then(|o| o.return_url.as_deref()))
        {
            self.inner.state.lock().unwrap().return_url = Some(url);
        }
        self.inner.begin_pairing(&run).await
    }
    pub async fn send_message(&self, message: OutboundMessage) -> Result<(), TelegramError> {
        if self.status() != ChannelStatus::Connected {
            return Err("Telegram is not connected".into());
        }
        let run = self.run()?;
        self.inner.send_raw(&run, message).await.map(|_| ())
    }
    pub async fn setup(&self) -> Result<ChannelSetupGuide, TelegramError> {
        let link = bot_father_setup_link();
        let qr = if let Some(encode) = &self.inner.qr {
            tokio::time::timeout(CALL_TIMEOUT, encode(link.clone()))
                .await
                .ok()
                .and_then(Result::ok)
        } else {
            None
        };
        Ok(ChannelSetupGuide {
            link,
            qr,
            suggested_name: "Jait Assistant".into(),
            suggested_username: suggest_bot_username(&generate_username_slug(16)?),
        })
    }
}
async fn cancelled(rx: &mut watch::Receiver<bool>) {
    while !*rx.borrow_and_update() {
        if rx.changed().await.is_err() {
            break;
        }
    }
}
impl Inner {
    fn active(&self, run: &Run) -> bool {
        !*run.cancel.borrow() && self.state.lock().unwrap().generation == run.generation
    }
    fn set_status(&self, run: &Run, status: ChannelStatus, detail: Option<ChannelStatusDetail>) {
        let events = {
            let mut s = self.state.lock().unwrap();
            if s.generation != run.generation || *run.cancel.borrow() {
                return;
            }
            s.status = status;
            if status == ChannelStatus::Qr {
                s.detail = detail.clone();
            }
            if matches!(
                status,
                ChannelStatus::Connected | ChannelStatus::Stopped | ChannelStatus::Error
            ) {
                s.detail = None;
                s.expiry = 0;
            }
            s.events.clone()
        };
        if let Some(events) = events {
            (events.on_status)(status, detail);
        }
    }
    async fn authorize(&self, run: &Run, action: TelegramAction) -> Result<(), TelegramError> {
        let mut rx = run.cancel.clone();
        tokio::select! {biased;
            _=cancelled(&mut rx)=>Err("Telegram cancelled".into()),
            result=tokio::time::timeout(CALL_TIMEOUT,(self.authority)(action))=>
                result.map_err(|_|TelegramError::from("Telegram authorization timed out"))?
                    .map_err(|_|TelegramError::from("Telegram authorization denied")),
        }
    }
    async fn api(
        &self,
        run: &Run,
        method: &'static str,
        body: Option<Value>,
        budget: Duration,
    ) -> Result<Value, TelegramError> {
        if !self.active(run) {
            return Err("Telegram cancelled".into());
        }
        if body
            .as_ref()
            .is_some_and(|b| serde_json::to_vec(b).map_or(true, |b| b.len() > MAX_BODY))
        {
            return Err("Telegram request too large".into());
        }
        let _permit = self
            .calls
            .try_acquire()
            .map_err(|_| TelegramError::from("Telegram busy"))?;
        let mut rx = run.cancel.clone();
        let value = tokio::select! {biased;
            _=cancelled(&mut rx)=>return Err("Telegram cancelled".into()),
            result=tokio::time::timeout(budget,self.transport.request(run.token.clone(),method,body,budget))=>
                result.map_err(|_|TelegramError::from("Telegram request timed out"))?
                    .map_err(|_|TelegramError::from("Telegram request failed"))?,
        };
        if !self.active(run) {
            return Err("Telegram cancelled".into());
        }
        if serde_json::to_vec(&value).map_or(true, |b| b.len() > MAX_BODY) {
            return Err("Telegram response too large".into());
        }
        match value["ok"].as_bool() {
            Some(true) => Ok(value.get("result").cloned().unwrap_or(Value::Null)),
            Some(false) => Err(TelegramError {
                message: value["description"]
                    .as_str()
                    .unwrap_or("Telegram API failed")
                    .replace(&run.token, "[redacted]")
                    .chars()
                    .take(4096)
                    .collect(),
                code: value["error_code"].as_u64().and_then(|n| n.try_into().ok()),
            }),
            None => Err("Invalid Telegram response".into()),
        }
    }
    async fn begin_pairing(&self, run: &Run) -> Result<(), TelegramError> {
        let username = self.state.lock().unwrap().bot_username.clone();
        let Some(username) = username else {
            self.set_status(
                run,
                ChannelStatus::Error,
                Some(ChannelStatusDetail {
                    error: Some(
                        "The bot has no username — set one in @BotFather, then reconnect.".into(),
                    ),
                    ..Default::default()
                }),
            );
            return Ok(());
        };
        if username.len() > 64
            || !username
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_')
        {
            return Err("Invalid Telegram bot username".into());
        }
        let mut random = [0; 12];
        getrandom::fill(&mut random)
            .map_err(|_| TelegramError::from("Telegram random source failed"))?;
        let code = URL_SAFE_NO_PAD.encode(random);
        let expiry = (self.clock)().saturating_add(self.options.pairing_ttl_ms.clamp(1, 86400000));
        let link = format!("https://t.me/{username}?start={code}");
        {
            let mut s = self.state.lock().unwrap();
            if s.generation != run.generation {
                return Err("Telegram cancelled".into());
            }
            s.pairing = Some(code);
            s.expiry = expiry;
        }
        let qr = if let Some(encode) = &self.qr {
            let mut rx = run.cancel.clone();
            tokio::select! {biased;_=cancelled(&mut rx)=>return Err("Telegram cancelled".into()),
            value=tokio::time::timeout(CALL_TIMEOUT,encode(link.clone()))=>value.ok().and_then(Result::ok)}
        } else {
            None
        };
        self.set_status(
            run,
            ChannelStatus::Qr,
            Some(ChannelStatusDetail {
                qr,
                link: Some(link),
                expires_at: crate::time::iso(expiry).ok(),
                error: None,
            }),
        );
        Ok(())
    }
    async fn wait(&self, run: &Run, millis: u64) -> bool {
        let mut rx = run.cancel.clone();
        tokio::select! {biased;_=cancelled(&mut rx)=>false,_=tokio::time::sleep(Duration::from_millis(millis.clamp(1,300000)))=>self.active(run)}
    }
    async fn supervise(self: Arc<Self>, run: Run, ready: oneshot::Sender<()>) {
        let mut ready = Some(ready);
        let mut attempts = 0u32;
        loop {
            let handshake = self.api(&run, "getMe", None, CALL_TIMEOUT).await;
            match handshake {
                Ok(me) => {
                    {
                        let mut s = self.state.lock().unwrap();
                        if s.generation != run.generation {
                            return;
                        }
                        s.bot_username = me["username"].as_str().map(String::from);
                    }
                    let paired = {
                        let s = self.state.lock().unwrap();
                        s.config.respond_to_all == Some(true)
                            || s.config
                                .allowed_senders
                                .as_ref()
                                .is_some_and(|v| !v.is_empty())
                    };
                    if paired {
                        self.set_status(&run, ChannelStatus::Connected, None);
                    } else if self.begin_pairing(&run).await.is_err() {
                        return;
                    }
                    if let Some(tx) = ready.take() {
                        let _ = tx.send(());
                    }
                    if self.state.lock().unwrap().status != ChannelStatus::Error {
                        self.poll_loop(&run).await;
                    }
                    return;
                }
                Err(error) => {
                    if !self.active(&run) {
                        return;
                    }
                    // TS start reports the first failed handshake. retryConnect
                    // remains silent on transient failures and reports a fatal
                    // rejected token through the deduplicating poll-error path.
                    if ready.is_some() {
                        self.set_status(
                            &run,
                            ChannelStatus::Error,
                            Some(ChannelStatusDetail {
                                error: Some(describe_poll_failure(&error.message, error.code)),
                                ..Default::default()
                            }),
                        );
                    } else if is_fatal_poll_error(error.code) {
                        self.poll_error(&run, &error);
                    }
                    if let Some(tx) = ready.take() {
                        let _ = tx.send(());
                    }
                    if is_fatal_poll_error(error.code) {
                        return;
                    }
                    attempts = attempts.saturating_add(1);
                    if !self
                        .wait(
                            &run,
                            poll_backoff_ms(
                                attempts,
                                self.options.retry_min_ms,
                                self.options.retry_max_ms,
                            ),
                        )
                        .await
                    {
                        return;
                    }
                }
            }
        }
    }
    fn poll_error(&self, run: &Run, error: &TelegramError) {
        let detail = describe_poll_failure(&error.message, error.code);
        {
            let mut s = self.state.lock().unwrap();
            if s.generation != run.generation
                || s.status == ChannelStatus::Qr
                || (s.status == ChannelStatus::Error && s.last_poll_error.as_ref() == Some(&detail))
            {
                return;
            }
            s.last_poll_error = Some(detail.clone());
        }
        self.set_status(
            run,
            ChannelStatus::Error,
            Some(ChannelStatusDetail {
                error: Some(detail),
                ..Default::default()
            }),
        );
    }
    async fn poll_loop(self: &Arc<Self>, run: &Run) {
        let mut failures = 0u32;
        while self.active(run) {
            let offset = self.state.lock().unwrap().offset;
            let seconds = self.options.poll_timeout_seconds.min(60);
            let result = self
                .api(
                    run,
                    "getUpdates",
                    Some(json!({"timeout":seconds,"offset":offset,
                "allowed_updates":["message","callback_query"]})),
                    Duration::from_secs(seconds + 15),
                )
                .await;
            match result {
                Ok(value) => {
                    let updates = if value.is_null() {
                        Vec::new()
                    } else if let Some(v) = value.as_array().filter(|v| v.len() <= 256) {
                        v.clone()
                    } else {
                        failures = failures.saturating_add(1);
                        self.poll_error(run, &"Invalid Telegram updates".into());
                        if !self.wait(run, self.options.retry_max_ms.min(300000)).await {
                            return;
                        }
                        continue;
                    };
                    if failures > 0 {
                        failures = 0;
                        let recover = {
                            let mut s = self.state.lock().unwrap();
                            s.last_poll_error = None;
                            s.status == ChannelStatus::Error
                        };
                        if recover {
                            self.set_status(run, ChannelStatus::Connected, None);
                        }
                    }
                    for update in updates {
                        if !self.active(run) {
                            return;
                        }
                        if let Some(id) = update["update_id"].as_u64() {
                            let mut s = self.state.lock().unwrap();
                            s.offset = s.offset.max(id.saturating_add(1));
                        } else {
                            continue;
                        }
                        if update.get("callback_query").is_some() {
                            self.handle_callback(run, &update["callback_query"]).await;
                            continue;
                        }
                        if let Some(message) = update.get("message") {
                            if let Some(payload) =
                                message["text"].as_str().and_then(parse_start_payload)
                            {
                                self.handle_start(run, message, &payload).await;
                            } else if let Some(inbound) =
                                message_to_inbound(message, (self.clock)())
                            {
                                self.dispatch(run, inbound).await;
                            }
                        }
                    }
                    // Prevent an empty injected/immediate poll from monopolizing a worker.
                    if !self.wait(run, 1).await {
                        return;
                    }
                }
                Err(error) => {
                    if !self.active(run) {
                        return;
                    }
                    failures = failures.saturating_add(1);
                    if is_fatal_poll_error(error.code) {
                        self.poll_error(run, &error);
                        return;
                    }
                    if error.code == Some(409) || failures >= 3 {
                        self.poll_error(run, &error);
                    }
                    let wait = if error.code == Some(409) {
                        self.options.retry_max_ms
                    } else {
                        poll_backoff_ms(
                            failures,
                            self.options.retry_min_ms,
                            self.options.retry_max_ms,
                        )
                    };
                    if !self.wait(run, wait).await {
                        return;
                    }
                }
            }
        }
    }
    async fn dispatch(&self, run: &Run, message: InboundMessage) {
        if self
            .authorize(
                run,
                TelegramAction::Inbound {
                    sender_id: message.sender_id.clone(),
                    conversation_id: message.conversation_id.clone(),
                },
            )
            .await
            .is_err()
        {
            return;
        }
        let events = {
            let s = self.state.lock().unwrap();
            if s.generation != run.generation {
                return;
            }
            s.events.clone()
        };
        if self.active(run)
            && let Some(events) = events
        {
            (events.on_inbound)(message);
        }
    }
    async fn send_raw(&self, run: &Run, message: OutboundMessage) -> Result<Value, TelegramError> {
        if message.text.len() > MAX_TEXT
            || message.conversation_id.len() > 1024
            || message.choices.as_ref().is_some_and(|v| {
                v.len() > MAX_CHOICES
                    || v.iter()
                        .any(|c| c.value.len() > MAX_TEXT || c.label.len() > MAX_TEXT)
            })
        {
            return Err("Telegram message too large".into());
        }
        self.authorize(
            run,
            TelegramAction::Send {
                conversation_id: message.conversation_id.clone(),
                text: message.text.clone(),
            },
        )
        .await?;
        let mut body = json!({"chat_id":message.conversation_id,"text":message.text});
        if let Some(choices) = message.choices.filter(|v| !v.is_empty()) {
            let mut s = self.state.lock().unwrap();
            let mut rows = Vec::new();
            for choice in choices {
                s.choice_seq = s.choice_seq.saturating_add(1);
                let token = format!("c{}", base36(s.choice_seq));
                s.choices
                    .push_back((token.clone(), message.conversation_id.clone(), choice.value));
                while s.choices.len() > MAX_CHOICES {
                    s.choices.pop_front();
                }
                rows.push(json!([{"text":truncate_utf16(&choice.label,64),"callback_data":token}]));
            }
            body["reply_markup"] = json!({"inline_keyboard":rows});
        }
        self.api(run, "sendMessage", Some(body), CALL_TIMEOUT).await
    }
    async fn handle_start(&self, run: &Run, message: &Value, payload: &str) {
        let Some(inbound) = message_to_inbound(message, (self.clock)()) else {
            return;
        };
        let (paired, pending, back, events) = {
            let mut s = self.state.lock().unwrap();
            if s.generation != run.generation {
                return;
            }
            if s.expiry > 0 && (self.clock)() > s.expiry {
                s.pairing = None;
            }
            let paired = s.pairing.as_deref() == Some(payload);
            if paired {
                s.pairing = None;
                s.expiry = 0;
            }
            (
                paired,
                s.pairing.is_some(),
                s.return_url.clone(),
                s.events.clone(),
            )
        };
        let text = if paired {
            if let Some(events) = events
                && let Some(callback) = &events.on_paired
            {
                callback(ChannelPairing {
                    sender_id: inbound.sender_id.clone(),
                    sender_name: inbound.sender_name,
                    conversation_id: inbound.conversation_id.clone(),
                });
            }
            self.set_status(run, ChannelStatus::Connected, None);
            format!(
                "✅ Linked to Jait. Send me a message and I'll get to work.{}",
                back.map(|b| format!("\n\n🔗 Back to Jait: {b}"))
                    .unwrap_or_default()
            )
        } else if pending {
            "That link has expired. Open Jait → Settings → Channels and scan the current QR code."
                .into()
        } else {
            "👋 I'm Jait. Just send me a message.".into()
        };
        let _ = self
            .send_raw(
                run,
                OutboundMessage {
                    conversation_id: inbound.conversation_id,
                    text,
                    choices: None,
                },
            )
            .await;
    }
    fn cosmetic(self: &Arc<Self>, run: &Run, method: &'static str, body: Value) {
        let Ok(permit) = self.effects.clone().try_acquire_owned() else {
            return;
        };
        let inner = self.clone();
        let run = run.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let _ = inner.api(&run, method, Some(body), CALL_TIMEOUT).await;
        });
    }
    async fn handle_callback(self: &Arc<Self>, run: &Run, query: &Value) {
        // Tokens are bound to their outbound conversation. A guessed c1 from a
        // different chat must not expose another chat's pending choice.
        let conversation = id_string(&query["message"]["chat"]["id"]);
        let value = query["data"].as_str().and_then(|token| {
            self.state
                .lock()
                .unwrap()
                .choices
                .iter()
                .find(|(key, chat, _)| key == token && Some(chat) == conversation.as_ref())
                .map(|(_, _, value)| value.clone())
        });
        let mut body = json!({"callback_query_id":query["id"]});
        if value.as_ref().is_none_or(|v| v.is_empty()) {
            body["text"] = json!("That menu has expired — send /model again.");
        }
        self.cosmetic(run, "answerCallbackQuery", body);
        let Some(value) = value.filter(|s| !s.is_empty()) else {
            return;
        };
        let Some(mut message) = query.get("message").filter(|m| m.is_object()).cloned() else {
            return;
        };
        self.cosmetic(
            run,
            "editMessageReplyMarkup",
            json!({"chat_id":message["chat"]["id"],"message_id":message["message_id"]}),
        );
        message["from"] = query["from"].clone();
        message["text"] = json!(value);
        if let Some(inbound) = message_to_inbound(&message, (self.clock)()) {
            self.dispatch(run, inbound).await;
        }
    }
}
fn base36(mut n: u64) -> String {
    let mut s = Vec::new();
    loop {
        s.push(b"0123456789abcdefghijklmnopqrstuvwxyz"[(n % 36) as usize] as char);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    s.into_iter().rev().collect()
}
impl ChannelConnector for TelegramConnector {
    type Error = TelegramError;
    fn id(&self) -> &str {
        "telegram"
    }
    fn label(&self) -> &str {
        "Telegram"
    }
    fn supports_choices(&self) -> Option<bool> {
        Some(true)
    }
    fn status(&self) -> ChannelStatus {
        self.inner.state.lock().unwrap().status
    }
    fn current_qr(&self) -> Option<String> {
        self.inner
            .state
            .lock()
            .unwrap()
            .detail
            .as_ref()
            .and_then(|d| d.qr.clone())
    }
    fn start(
        &self,
        events: Arc<ChannelConnectorEvents>,
        config: Option<ChannelConfig>,
        options: Option<ChannelPairOptions>,
    ) -> BoxFuture<'_, Result<(), Self::Error>> {
        Box::pin(self.start_connector(events, config.unwrap_or_default(), options))
    }
    fn stop(&self) -> BoxFuture<'_, Result<(), Self::Error>> {
        Box::pin(self.stop_connector())
    }
    fn send(&self, message: OutboundMessage) -> BoxFuture<'_, Result<(), Self::Error>> {
        Box::pin(self.send_message(message))
    }
    fn pair(
        &self,
        options: Option<ChannelPairOptions>,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        Some(Box::pin(self.pair_connector(options)))
    }
    fn setup_guide(&self) -> Option<BoxFuture<'_, Result<ChannelSetupGuide, Self::Error>>> {
        Some(Box::pin(self.setup()))
    }
    fn send_live(
        &self,
        conversation: String,
        text: String,
    ) -> Option<BoxFuture<'_, Result<Option<String>, Self::Error>>> {
        Some(Box::pin(async move {
            let Ok(run) = self.run() else {
                return Ok(None);
            };
            Ok(self
                .inner
                .send_raw(
                    &run,
                    OutboundMessage {
                        conversation_id: conversation,
                        text,
                        choices: None,
                    },
                )
                .await
                .ok()
                .and_then(|v| id_string(&v["message_id"])))
        }))
    }
    fn edit_live(
        &self,
        conversation: String,
        message: String,
        text: String,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        Some(Box::pin(async move {
            if text.len() > MAX_TEXT {
                return Ok(());
            }
            if let Ok(run) = self.run()
                && self
                    .inner
                    .authorize(
                        &run,
                        TelegramAction::Send {
                            conversation_id: conversation.clone(),
                            text: text.clone(),
                        },
                    )
                    .await
                    .is_ok()
            {
                let _=self.inner.api(&run,"editMessageText",Some(json!({"chat_id":conversation,"message_id":message.parse::<f64>().ok(),"text":text})),CALL_TIMEOUT).await;
            }
            Ok(())
        }))
    }
    fn set_command_menu(
        &self,
        commands: Vec<ChannelCommandDescriptor>,
    ) -> Option<BoxFuture<'_, Result<(), Self::Error>>> {
        Some(Box::pin(async move {
            let Ok(run) = self.run() else {
                return Ok(());
            };
            let commands = to_telegram_commands(&commands);
            if commands.as_array().is_none_or(|v| v.is_empty()) {
                return Ok(());
            }
            for scope in ["default", "all_private_chats", "all_group_chats"] {
                let _ = self
                    .inner
                    .api(
                        &run,
                        "setMyCommands",
                        Some(json!({"commands":commands,"scope":{"type":scope}})),
                        CALL_TIMEOUT,
                    )
                    .await;
            }
            Ok(())
        }))
    }
    fn start_typing(&self, conversation: &str) -> Option<TypingStop> {
        let Ok(run) = self.run() else {
            return Some(Arc::new(|| {}));
        };
        let Ok(permit) = self.inner.effects.clone().try_acquire_owned() else {
            return Some(Arc::new(|| {}));
        };
        let (tx, mut stop) = watch::channel(false);
        let inner = self.inner.clone();
        let conversation = conversation.to_string();
        tokio::spawn(async move {
            let _permit = permit;
            let mut interval = tokio::time::interval(Duration::from_secs(4));
            let mut cancel = run.cancel.clone();
            loop {
                tokio::select! {biased;
                    _=cancelled(&mut cancel)=>return,
                    _=cancelled(&mut stop)=>return,
                    _=interval.tick()=>{
                        let mut stopped=stop.clone();
                        tokio::select! {biased;
                            _=cancelled(&mut stopped)=>return,
                            _=async {
                                if inner.authorize(&run,TelegramAction::Send {conversation_id:conversation.clone(),text:String::new()}).await.is_ok() {
                                    let _=inner.api(&run,"sendChatAction",Some(json!({"chat_id":conversation,"action":"typing"})),CALL_TIMEOUT).await;
                                }
                            }=>{}
                        }
                    }
                }
            }
        });
        Some(Arc::new(move || {
            tx.send_replace(true);
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fatal_poll_error_flags_unauthorized_and_missing_bot_only() {
        assert!(is_fatal_poll_error(Some(401)));
        assert!(is_fatal_poll_error(Some(404)));
        assert!(!is_fatal_poll_error(Some(409)));
        assert!(!is_fatal_poll_error(Some(400)));
        assert!(!is_fatal_poll_error(Some(429)));
        assert!(!is_fatal_poll_error(None));
    }

    #[test]
    fn poll_backoff_grows_exponentially_from_min_and_clamps_to_max() {
        assert_eq!(poll_backoff_ms(0, 500, 30_000), 500);
        assert_eq!(poll_backoff_ms(1, 500, 30_000), 500);
        assert_eq!(poll_backoff_ms(2, 500, 30_000), 1_000);
        assert_eq!(poll_backoff_ms(3, 500, 30_000), 2_000);
        assert_eq!(poll_backoff_ms(4, 500, 30_000), 4_000);
        assert_eq!(poll_backoff_ms(5, 500, 30_000), 8_000);
        assert_eq!(poll_backoff_ms(64, 500, 30_000), 30_000);
        assert_eq!(poll_backoff_ms(u32::MAX, 500, 30_000), 30_000);
    }

    #[test]
    fn describe_poll_failure_replaces_conflict_and_annotates_rejected_token() {
        assert_eq!(
            describe_poll_failure("Conflict: terminated by other getUpdates", Some(409)),
            "Another instance is polling this bot — Telegram allows only one. Stop the other Jait gateway, or give this one its own bot token."
        );
        assert_eq!(
            describe_poll_failure("Unauthorized", Some(401)),
            "Unauthorized — the bot token was rejected. Check it in @BotFather and paste it again."
        );
        assert_eq!(
            describe_poll_failure("Not Found", Some(404)),
            "Not Found — the bot token was rejected. Check it in @BotFather and paste it again."
        );
        assert_eq!(describe_poll_failure("network down", None), "network down");
        assert_eq!(
            describe_poll_failure("Too Many Requests: retry after 3", Some(429)),
            "Too Many Requests: retry after 3"
        );
    }

    #[test]
    fn parse_start_payload_accepts_bare_argumented_and_suffixed_commands() {
        assert_eq!(parse_start_payload("/start").as_deref(), Some(""));
        assert_eq!(parse_start_payload("   /start   ").as_deref(), Some(""));
        assert_eq!(
            parse_start_payload("/start link_abc").as_deref(),
            Some("link_abc")
        );
        assert_eq!(
            parse_start_payload("/start@jait_bot link_abc").as_deref(),
            Some("link_abc")
        );
        assert_eq!(parse_start_payload("/start@jait_bot").as_deref(), Some(""));
        assert_eq!(parse_start_payload("/startle"), None);
        assert_eq!(parse_start_payload("/help"), None);
        assert_eq!(parse_start_payload(""), None);
    }

    #[test]
    fn extract_bot_token_requires_botfather_shaped_secret() {
        let token = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
        assert_eq!(extract_bot_token(token).as_deref(), Some(token));
        assert_eq!(
            extract_bot_token(&format!("/token {token}\n")).as_deref(),
            Some(token)
        );
        assert_eq!(extract_bot_token("12345:short"), None);
        assert_eq!(extract_bot_token("123456789:tooshort"), None);
        assert_eq!(extract_bot_token("not a token"), None);
    }

    #[test]
    fn sanitize_return_url_keeps_only_http_schemes() {
        assert_eq!(
            sanitize_return_url(Some("https://jait.example/app")).as_deref(),
            Some("https://jait.example/app")
        );
        assert_eq!(
            sanitize_return_url(Some("  http://localhost:3000/x  ")).as_deref(),
            Some("http://localhost:3000/x")
        );
        assert_eq!(sanitize_return_url(Some("ftp://jait.example/")), None);
        assert_eq!(sanitize_return_url(Some("javascript:alert(1)")), None);
        assert_eq!(sanitize_return_url(Some("   ")), None);
        assert_eq!(sanitize_return_url(None), None);
    }

    #[test]
    fn bot_father_setup_link_targets_newbot_command() {
        assert_eq!(
            bot_father_setup_link(),
            "https://t.me/BotFather?text=%2Fnewbot"
        );
    }

    #[test]
    fn suggest_bot_username_wraps_seed_between_prefix_and_suffix() {
        assert_eq!(suggest_bot_username("jait"), "jait_jait_bot");
        assert_eq!(suggest_bot_username("acme"), "jait_acme_bot");
    }

    #[test]
    fn generate_username_slug_is_lowercase_base32_and_length_bounded() {
        let slug = generate_username_slug(12).unwrap();
        assert_eq!(slug.chars().count(), 12);
        assert!(
            slug.chars()
                .all(|c| c.is_ascii_lowercase() || ('2'..='7').contains(&c))
        );
        assert_eq!(generate_username_slug(0).unwrap(), "");
        assert_ne!(
            generate_username_slug(16).unwrap(),
            generate_username_slug(16).unwrap()
        );
    }

    #[test]
    fn generate_username_slug_rejects_seed_above_byte_ceiling() {
        let err = generate_username_slug(1025).unwrap_err();
        assert_eq!(err.message, "Username seed too large");
        assert!(generate_username_slug(1024).is_ok());
    }

    #[test]
    fn message_to_inbound_normalises_identity_and_timestamp() {
        let message = json!({
            "text": "  hello  ",
            "chat": {"id": 42},
            "from": {"id": 7, "username": "alice"},
            "date": 1700000000
        });
        let inbound = message_to_inbound(&message, 0).expect("inbound");
        assert_eq!(inbound.channel_id, "telegram");
        assert_eq!(inbound.conversation_id, "42");
        assert_eq!(inbound.sender_id, "7");
        assert_eq!(inbound.sender_name.as_deref(), Some("@alice"));
        assert_eq!(inbound.text, "hello");
        assert_eq!(inbound.timestamp, 1_700_000_000_000.0);
        assert!(!inbound.from_me);
        assert!(!inbound.is_self_chat);
    }

    #[test]
    fn message_to_inbound_falls_back_to_chat_id_and_first_name() {
        let message = json!({
            "text": "hi",
            "chat": {"id": "chan-1"},
            "from": {"first_name": "Bob"},
            "date": 10
        });
        let inbound = message_to_inbound(&message, 0).expect("inbound");
        assert_eq!(inbound.conversation_id, "chan-1");
        assert_eq!(inbound.sender_id, "chan-1");
        assert_eq!(inbound.sender_name.as_deref(), Some("Bob"));
        assert_eq!(inbound.timestamp, 10_000.0);
    }

    #[test]
    fn message_to_inbound_uses_clock_seconds_when_date_is_absent() {
        let message = json!({"text": "hi", "chat": {"id": 1}});
        let inbound = message_to_inbound(&message, 1_700_000_123_456).expect("inbound");
        assert_eq!(inbound.timestamp, 1_700_000_123_000.0);
        assert_eq!(inbound.sender_id, "1");
        assert_eq!(inbound.sender_name, None);
    }

    #[test]
    fn message_to_inbound_rejects_blank_oversized_and_chatless_updates() {
        assert!(message_to_inbound(&json!({"text": "   ", "chat": {"id": 1}}), 0).is_none());
        assert!(message_to_inbound(&json!({"chat": {"id": 1}}), 0).is_none());
        assert!(message_to_inbound(&json!({"text": "hi"}), 0).is_none());
        assert!(message_to_inbound(&json!({"text": "hi", "chat": {}}), 0).is_none());
        let oversized = json!({"text": "a".repeat(MAX_TEXT + 1), "chat": {"id": 1}});
        assert!(message_to_inbound(&oversized, 0).is_none());
        let boundary = json!({"text": "a".repeat(MAX_TEXT), "chat": {"id": 1}});
        assert!(message_to_inbound(&boundary, 0).is_some());
    }

    #[test]
    fn truncate_utf16_counts_javascript_units_and_replaces_split_surrogate() {
        assert_eq!(truncate_utf16("hello", 10), "hello");
        assert_eq!(truncate_utf16("hello", 2), "he");
        // A code point outside the BMP occupies two UTF-16 units.
        assert_eq!(truncate_utf16("a😀b", 3), "a😀");
        assert_eq!(truncate_utf16("a😀b", 2), "a\u{FFFD}");
    }

    #[test]
    fn base36_encodes_callback_counters_in_lowercase() {
        assert_eq!(base36(0), "0");
        assert_eq!(base36(35), "z");
        assert_eq!(base36(36), "10");
        assert_eq!(base36(1295), "zz");
    }

    #[test]
    fn to_telegram_commands_sanitises_deduplicates_and_skips_blanks() {
        let commands = vec![
            ChannelCommandDescriptor {
                name: "  Help  ".into(),
                description: "Show help".into(),
            },
            ChannelCommandDescriptor {
                name: "Help".into(),
                description: "duplicate".into(),
            },
            ChannelCommandDescriptor {
                name: "New Chat!".into(),
                description: "Start fresh".into(),
            },
            ChannelCommandDescriptor {
                name: "   ".into(),
                description: "no name".into(),
            },
            ChannelCommandDescriptor {
                name: "silent".into(),
                description: "   ".into(),
            },
        ];
        assert_eq!(
            to_telegram_commands(&commands),
            json!([
                {"command": "help", "description": "Show help"},
                {"command": "new_chat_", "description": "Start fresh"},
            ])
        );
    }

    #[test]
    fn to_telegram_commands_truncates_command_and_description_limits() {
        let value = to_telegram_commands(&[ChannelCommandDescriptor {
            name: "A".repeat(40),
            description: "d".repeat(300),
        }]);
        assert_eq!(value[0]["command"].as_str().unwrap(), "a".repeat(32));
        assert_eq!(value[0]["description"].as_str().unwrap(), "d".repeat(256));
    }

    #[test]
    fn to_telegram_commands_stops_at_one_hundred_entries() {
        let commands: Vec<_> = (0..150)
            .map(|i| ChannelCommandDescriptor {
                name: format!("cmd{i}"),
                description: "x".into(),
            })
            .collect();
        assert_eq!(
            to_telegram_commands(&commands).as_array().unwrap().len(),
            100
        );
        assert!(to_telegram_commands(&[]).as_array().unwrap().is_empty());
    }
}
