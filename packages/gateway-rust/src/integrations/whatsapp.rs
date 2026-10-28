//! WhatsApp connector lifecycle around the established protocol/credential/QR
//! engines. Native code owns extraction, account aliases, inbound admission,
//! supervised reconnection, bounded event backpressure, send authority and stop.
//! No Baileys or WhatsApp wire/crypto stack is claimed here. The runtime must
//! implement the typed engine boundary for its configured owner/node and fixed
//! credential store; no request can select paths, hosts or account credentials.
use super::channel_contracts::{
    ChannelConfig, ChannelConnector, ChannelConnectorEvents, ChannelPairOptions, ChannelStatus,
    ChannelStatusDetail, InboundMessage, OutboundMessage,
};
use crate::time::Clock;
use futures_util::{FutureExt, future::BoxFuture};
use serde_json::Value;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{mpsc, oneshot, watch};

const EVENT_CAPACITY: usize = 128;
const MAX_BATCH: usize = 256;
const MAX_TEXT: usize = 65_536;
const EFFECT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Default)]
pub struct MessageKey {
    pub remote_jid: Option<String>,
    pub from_me: bool,
    pub participant: Option<String>,
    pub id: Option<String>,
}
#[derive(Clone)]
pub struct WhatsAppMessage {
    pub key: MessageKey,
    pub push_name: Option<String>,
    pub message: Value,
    /// The protocol engine converts Long.toNumber() before crossing this port.
    pub timestamp_seconds: Option<f64>,
}
pub enum WhatsAppEvent {
    CredentialsUpdated,
    Qr(String),
    Open {
        user_id: Option<String>,
        lid: Option<String>,
    },
    Closed {
        status_code: Option<u16>,
    },
    Messages {
        kind: Option<String>,
        messages: Vec<WhatsAppMessage>,
    },
}
pub struct AuthState {
    pub protocol_state: Value,
    /// Bound to exactly the loaded, runtime-owned credential state.
    pub save: Arc<dyn Fn() -> BoxFuture<'static, Result<(), String>> + Send + Sync>,
}
#[derive(Clone)]
pub struct SocketOptions {
    pub print_qr_in_terminal: bool,
    pub browser: [&'static str; 3],
    pub sync_full_history: bool,
}
pub trait WhatsAppSocket: Send + Sync {
    fn send_text(&self, conversation: String, text: String) -> BoxFuture<'_, Result<(), String>>;
    /// Must synchronously close both socket and protocol resources, without
    /// logout (normal stop must preserve saved pairing credentials).
    fn close(&self);
}
/// These are engine operations, not whole-connector delegates. Implementations
/// must honor cancellation and clean up a socket that finishes opening late.
/// Error messages crossing this boundary must exclude credentials/session keys.
pub trait WhatsAppEngine: Send + Sync {
    fn load_auth(&self) -> BoxFuture<'_, Result<AuthState, String>>;
    fn open(
        &self,
        auth: Value,
        options: SocketOptions,
        events: mpsc::Sender<WhatsAppEvent>,
        cancelled: watch::Receiver<bool>,
    ) -> BoxFuture<'_, Result<Arc<dyn WhatsAppSocket>, String>>;
    fn encode_qr(&self, text: String) -> BoxFuture<'_, Result<String, String>>;
    /// Operates only on this configured credential store, never a supplied path.
    fn clear_credentials(&self) -> BoxFuture<'_, Result<(), String>>;
}
#[derive(Clone)]
pub enum WhatsAppAction {
    /// Includes use, persistence and invalidated-state cleanup of the configured
    /// owner/node credential store. It grants no assessment target authority.
    Start,
    Send {
        conversation_id: String,
        text: String,
    },
}
/// Must apply existing owner/node, recipient and outbound-consent policy. No
/// inbound message, fromMe bit or self-chat alias may assert send authority.
pub type WhatsAppAuthorize =
    Arc<dyn Fn(WhatsAppAction) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;

struct State {
    generation: u64,
    status: ChannelStatus,
    qr: Option<String>,
    self_bares: HashSet<String>,
    events: Option<Arc<ChannelConnectorEvents>>,
    socket: Option<Arc<dyn WhatsAppSocket>>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            generation: 0,
            status: ChannelStatus::Stopped,
            qr: None,
            self_bares: HashSet::new(),
            events: None,
            socket: None,
        }
    }
}
struct Active {
    generation: u64,
    cancelled: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}
struct Inner {
    engine: Arc<dyn WhatsAppEngine>,
    authorize: WhatsAppAuthorize,
    clock: Clock,
    logged_out_code: u16,
    state: Mutex<State>,
    lifecycle: tokio::sync::Mutex<Option<Active>>,
}
#[derive(Clone)]
pub struct WhatsAppConnector(Arc<Inner>);

pub fn bare_jid(jid: Option<&str>) -> &str {
    jid.unwrap_or("")
        .split('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
}
/// Bounded wrapper traversal; protocol messages are untrusted. Normal text is
/// returned verbatim, preserving leading/trailing whitespace as the source does.
pub fn extract_text(message: &Value) -> String {
    let mut current = message;
    for _ in 0..32 {
        for path in [
            &["conversation"][..],
            &["extendedTextMessage", "text"][..],
            &["imageMessage", "caption"][..],
            &["videoMessage", "caption"][..],
        ] {
            let mut v = current;
            for key in path {
                v = v.get(*key).unwrap_or(&Value::Null);
            }
            if let Some(text) = v.as_str().filter(|s| !s.is_empty()) {
                return if text.len() <= MAX_TEXT {
                    text.into()
                } else {
                    String::new()
                };
            }
        }
        match current
            .get("ephemeralMessage")
            .and_then(|v| v.get("message"))
            .or_else(|| {
                current
                    .get("viewOnceMessage")
                    .and_then(|v| v.get("message"))
            }) {
            Some(next) => current = next,
            None => break,
        }
    }
    String::new()
}
pub fn message_to_inbound(
    message: &WhatsAppMessage,
    self_bares: &HashSet<String>,
    now: i64,
) -> Option<InboundMessage> {
    if message.message.to_string().len() > 262_144
        || message.push_name.as_ref().is_some_and(|s| s.len() > 1024)
    {
        return None;
    }
    let text = extract_text(&message.message);
    if crate::text::js_trim(&text).is_empty() {
        return None;
    }
    let conversation = message.key.remote_jid.as_deref().unwrap_or("");
    if conversation.is_empty()
        || conversation == "status@broadcast"
        || conversation.len() > 1024
        || message
            .key
            .participant
            .as_ref()
            .is_some_and(|s| s.len() > 1024)
    {
        return None;
    }
    Some(InboundMessage {
        channel_id: "whatsapp".into(),
        conversation_id: conversation.into(),
        sender_id: message
            .key
            .participant
            .clone()
            .unwrap_or_else(|| conversation.into()),
        sender_name: message.push_name.clone(),
        text,
        timestamp: message
            .timestamp_seconds
            .map(|s| s * 1000.0)
            .unwrap_or(now as f64),
        from_me: message.key.from_me,
        is_self_chat: self_bares.contains(bare_jid(Some(conversation))),
    })
}
async fn cancelled(rx: &mut watch::Receiver<bool>) {
    loop {
        if *rx.borrow_and_update() {
            return;
        }
        if rx.changed().await.is_err() {
            return;
        }
    }
}

impl WhatsAppConnector {
    pub fn new(
        engine: Arc<dyn WhatsAppEngine>,
        authorize: WhatsAppAuthorize,
        clock: Clock,
        logged_out_code: Option<u16>,
    ) -> Self {
        Self(Arc::new(Inner {
            engine,
            authorize,
            clock,
            logged_out_code: logged_out_code.unwrap_or(401),
            state: Mutex::new(State::default()),
            lifecycle: tokio::sync::Mutex::new(None),
        }))
    }
    fn publish(&self, generation: u64, status: ChannelStatus, detail: Option<ChannelStatusDetail>) {
        let events = {
            let mut state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
            if state.generation != generation {
                return;
            }
            state.status = status;
            if status == ChannelStatus::Qr
                && let Some(qr) = detail.as_ref().and_then(|d| d.qr.as_ref())
            {
                state.qr = Some(qr.clone());
            }
            if matches!(status, ChannelStatus::Connected | ChannelStatus::Stopped) {
                state.qr = None;
            }
            state.events.clone()
        };
        if let Some(events) = events {
            (events.on_status)(status, detail);
        }
    }
    fn error(&self, generation: u64, message: &str) {
        let error = message.chars().take(2048).collect::<String>();
        self.publish(
            generation,
            ChannelStatus::Error,
            Some(ChannelStatusDetail {
                error: Some(error),
                ..Default::default()
            }),
        );
    }
    fn detach_socket(&self, generation: u64) {
        let socket = {
            let mut state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
            if state.generation != generation {
                return;
            }
            state.socket.take()
        };
        if let Some(socket) = socket {
            socket.close();
        }
    }
    async fn stop_active(&self, active: Active) {
        let _ = active.cancelled.send(true);
        self.detach_socket(active.generation);
        let mut task = active.task;
        if tokio::time::timeout(Duration::from_secs(5), &mut task)
            .await
            .is_err()
        {
            task.abort();
            let _ = task.await;
        }
    }

    pub async fn start_connector(&self, events: Arc<ChannelConnectorEvents>) -> Result<(), String> {
        tokio::time::timeout(EFFECT_TIMEOUT, (self.0.authorize)(WhatsAppAction::Start))
            .await
            .map_err(|_| "WhatsApp authorization timed out")??;
        let mut lifecycle = self.0.lifecycle.lock().await;
        if let Some(active) = lifecycle.take() {
            self.stop_active(active).await;
        }
        let generation = {
            let mut state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
            state.generation = state.generation.wrapping_add(1);
            state.events = Some(events);
            state.self_bares.clear();
            state.generation
        };
        let (cancel, rx) = watch::channel(false);
        let (ready, received) = oneshot::channel();
        let this = self.clone();
        let task = tokio::spawn(async move {
            let result = std::panic::AssertUnwindSafe(this.run(generation, rx, ready))
                .catch_unwind()
                .await;
            if result.is_err() {
                this.detach_socket(generation);
                this.error(generation, "WhatsApp connector task failed");
            }
        });
        *lifecycle = Some(Active {
            generation,
            cancelled: cancel,
            task,
        });
        drop(lifecycle);
        match tokio::time::timeout(EFFECT_TIMEOUT + Duration::from_secs(1), received).await {
            Ok(Ok(result)) => result,
            _ => {
                let mut lifecycle = self.0.lifecycle.lock().await;
                if lifecycle
                    .as_ref()
                    .is_some_and(|a| a.generation == generation)
                    && let Some(active) = lifecycle.take()
                {
                    self.stop_active(active).await;
                }
                Err("WhatsApp connection did not become ready".into())
            }
        }
    }

    async fn run(
        &self,
        generation: u64,
        mut cancel: watch::Receiver<bool>,
        ready: oneshot::Sender<Result<(), String>>,
    ) {
        let mut ready = Some(ready);
        loop {
            if *cancel.borrow() {
                break;
            }
            self.publish(generation, ChannelStatus::Connecting, None);
            let (sender, mut receiver) = mpsc::channel(EVENT_CAPACITY);
            let open_cancel = cancel.clone();
            let connect = async {
                let auth = self.0.engine.load_auth().await?;
                let socket = self
                    .0
                    .engine
                    .open(
                        auth.protocol_state,
                        SocketOptions {
                            print_qr_in_terminal: false,
                            browser: ["Jait", "Chrome", "1.0.0"],
                            sync_full_history: false,
                        },
                        sender,
                        open_cancel,
                    )
                    .await?;
                Ok::<_, String>((socket, auth.save))
            };
            let connected = tokio::select! {
                biased;
                _=cancelled(&mut cancel)=>break,
                result=tokio::time::timeout(EFFECT_TIMEOUT,connect)=>result.unwrap_or_else(|_|Err("WhatsApp connection timed out".into())),
            };
            let (socket, save) = match connected {
                Ok(value) => value,
                Err(error) => {
                    if let Some(ready) = ready.take() {
                        let _ = ready.send(Err(error.clone()));
                    }
                    self.error(generation, &error);
                    break;
                }
            };
            if *cancel.borrow() {
                socket.close();
                break;
            }
            {
                let mut state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
                if state.generation != generation {
                    socket.close();
                    break;
                }
                state.socket = Some(socket);
            }
            if let Some(ready) = ready.take() {
                let _ = ready.send(Ok(()));
            }
            let mut reconnect = false;
            loop {
                let event = tokio::select! {biased;_=cancelled(&mut cancel)=>break,event=receiver.recv()=>event};
                let Some(event) = event else {
                    self.error(generation, "WhatsApp protocol event stream closed");
                    break;
                };
                let closed = matches!(&event, WhatsAppEvent::Closed { .. });
                let effect = async {
                    match event {
                        WhatsAppEvent::CredentialsUpdated => {
                            // Persistence is serialized; failures never leak keys through logs.
                            let _ = save().await;
                        }
                        WhatsAppEvent::Qr(raw) => {
                            if raw.len() > MAX_TEXT {
                                self.error(generation, "WhatsApp QR exceeds byte limit");
                                return;
                            }
                            if let Ok(qr) = self.0.engine.encode_qr(raw).await
                                && qr.len() <= 1_048_576
                            {
                                self.publish(
                                    generation,
                                    ChannelStatus::Qr,
                                    Some(ChannelStatusDetail {
                                        qr: Some(qr),
                                        ..Default::default()
                                    }),
                                );
                            }
                        }
                        WhatsAppEvent::Open { user_id, lid } => {
                            let mut state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
                            state.self_bares = [user_id, lid]
                                .into_iter()
                                .flatten()
                                .map(|s| bare_jid(Some(&s)).to_owned())
                                .filter(|s| !s.is_empty())
                                .collect();
                            drop(state);
                            self.publish(generation, ChannelStatus::Connected, None);
                        }
                        WhatsAppEvent::Closed { status_code } => {
                            if status_code == Some(self.0.logged_out_code) {
                                let _ = self.0.engine.clear_credentials().await;
                                self.error(generation, "Logged out. Re-link to reconnect.");
                            } else {
                                reconnect = true;
                            }
                        }
                        WhatsAppEvent::Messages { kind, messages } => {
                            if kind.as_deref().is_some_and(|s| s != "notify") {
                                return;
                            }
                            if messages.len() > MAX_BATCH {
                                self.error(generation, "WhatsApp message batch exceeds item limit");
                                return;
                            }
                            let (aliases, events) = {
                                let state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
                                (state.self_bares.clone(), state.events.clone())
                            };
                            if let Some(events) = events {
                                for message in messages {
                                    if let Some(inbound) =
                                        message_to_inbound(&message, &aliases, (self.0.clock)())
                                    {
                                        (events.on_inbound)(inbound);
                                    }
                                }
                            }
                        }
                    }
                };
                // Credential writes, QR work and event delivery are sequential
                // under this actor and are dropped when stop wins the select.
                let effect_result = tokio::select! {
                    biased;
                    _=cancelled(&mut cancel)=>break,
                    result=tokio::time::timeout(EFFECT_TIMEOUT,effect)=>result,
                };
                if effect_result.is_err() {
                    self.error(generation, "WhatsApp event effect timed out");
                    break;
                }
                if closed || reconnect || self.status() == ChannelStatus::Error {
                    break;
                }
            }
            self.detach_socket(generation);
            if !reconnect || *cancel.borrow() {
                break;
            }
            tokio::select! {biased;_=cancelled(&mut cancel)=>break,_=tokio::time::sleep(Duration::from_millis(250))=>{}}
        }
        self.detach_socket(generation);
        if *cancel.borrow() {
            self.publish(generation, ChannelStatus::Stopped, None);
        }
    }

    pub async fn stop_connector(&self) -> Result<(), String> {
        let mut lifecycle = self.0.lifecycle.lock().await;
        if let Some(active) = lifecycle.take() {
            self.stop_active(active).await;
        }
        let generation = self
            .0
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .generation;
        self.publish(generation, ChannelStatus::Stopped, None);
        Ok(())
    }

    pub async fn send_message(&self, message: OutboundMessage) -> Result<(), String> {
        if message.conversation_id.is_empty()
            || message.conversation_id.len() > 1024
            || message.text.len() > MAX_TEXT
        {
            return Err("Invalid or oversized WhatsApp message".into());
        }
        tokio::time::timeout(
            EFFECT_TIMEOUT,
            (self.0.authorize)(WhatsAppAction::Send {
                conversation_id: message.conversation_id.clone(),
                text: message.text.clone(),
            }),
        )
        .await
        .map_err(|_| "WhatsApp authorization timed out")??;
        let (generation, socket) = {
            let state = self.0.state.lock().unwrap_or_else(|e| e.into_inner());
            (
                state.generation,
                state.socket.clone().ok_or("WhatsApp is not connected")?,
            )
        };
        let mut cancel = {
            let lifecycle = self.0.lifecycle.lock().await;
            lifecycle
                .as_ref()
                .filter(|a| a.generation == generation)
                .ok_or("WhatsApp is not connected")?
                .cancelled
                .subscribe()
        };
        tokio::select! {
            biased;
            _=cancelled(&mut cancel)=>Err("WhatsApp send cancelled".into()),
            result=tokio::time::timeout(EFFECT_TIMEOUT,socket.send_text(message.conversation_id,message.text))=>result.map_err(|_|"WhatsApp send timed out".to_owned())?,
        }
    }
}
impl ChannelConnector for WhatsAppConnector {
    type Error = String;
    fn id(&self) -> &str {
        "whatsapp"
    }
    fn label(&self) -> &str {
        "WhatsApp"
    }
    fn start(
        &self,
        events: Arc<ChannelConnectorEvents>,
        _config: Option<ChannelConfig>,
        _options: Option<ChannelPairOptions>,
    ) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.start_connector(events))
    }
    fn stop(&self) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.stop_connector())
    }
    fn send(&self, message: OutboundMessage) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(self.send_message(message))
    }
    fn status(&self) -> ChannelStatus {
        self.0
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .status
    }
    fn current_qr(&self) -> Option<String> {
        self.0
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .qr
            .clone()
    }
}

impl Drop for WhatsAppConnector {
    fn drop(&mut self) {
        // The supervisor retains one clone. Cancel when its last external owner
        // disappears; otherwise the JoinHandle/actor references form a cycle.
        if Arc::strong_count(&self.0) <= 2 {
            if let Ok(lifecycle) = self.0.lifecycle.try_lock()
                && let Some(active) = lifecycle.as_ref()
            {
                let _ = active.cancelled.send(true);
            }
            let socket = self
                .0
                .state
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .socket
                .take();
            if let Some(socket) = socket {
                socket.close();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[derive(Default)]
    struct Socket {
        closed: AtomicBool,
        sent: Mutex<Vec<(String, String)>>,
    }
    impl WhatsAppSocket for Socket {
        fn send_text(
            &self,
            conversation: String,
            text: String,
        ) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.closed.load(Ordering::SeqCst) {
                    return Err("closed".into());
                }
                self.sent.lock().unwrap().push((conversation, text));
                Ok(())
            })
        }
        fn close(&self) {
            self.closed.store(true, Ordering::SeqCst);
        }
    }
    #[derive(Default)]
    struct Engine {
        loaded: AtomicUsize,
        saved: Arc<AtomicUsize>,
        cleared: AtomicUsize,
        senders: Mutex<Vec<mpsc::Sender<WhatsAppEvent>>>,
        sockets: Mutex<Vec<Arc<Socket>>>,
        pending_load: bool,
    }
    impl WhatsAppEngine for Engine {
        fn load_auth(&self) -> BoxFuture<'_, Result<AuthState, String>> {
            Box::pin(async move {
                self.loaded.fetch_add(1, Ordering::SeqCst);
                if self.pending_load {
                    std::future::pending::<()>().await;
                }
                let saved = self.saved.clone();
                Ok(AuthState {
                    protocol_state: json!({"opaque":"secret"}),
                    save: Arc::new(move || {
                        let saved = saved.clone();
                        Box::pin(async move {
                            saved.fetch_add(1, Ordering::SeqCst);
                            Ok(())
                        })
                    }),
                })
            })
        }
        fn open(
            &self,
            auth: Value,
            options: SocketOptions,
            events: mpsc::Sender<WhatsAppEvent>,
            _cancelled: watch::Receiver<bool>,
        ) -> BoxFuture<'_, Result<Arc<dyn WhatsAppSocket>, String>> {
            Box::pin(async move {
                assert_eq!(auth["opaque"], "secret");
                assert!(!options.print_qr_in_terminal);
                assert!(!options.sync_full_history);
                assert_eq!(options.browser, ["Jait", "Chrome", "1.0.0"]);
                let socket = Arc::new(Socket::default());
                self.sockets.lock().unwrap().push(socket.clone());
                self.senders.lock().unwrap().push(events);
                Ok(socket as Arc<dyn WhatsAppSocket>)
            })
        }
        fn encode_qr(&self, text: String) -> BoxFuture<'_, Result<String, String>> {
            Box::pin(async move { Ok(format!("data:image/png;base64,{text}")) })
        }
        fn clear_credentials(&self) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                self.cleared.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
        }
    }
    impl Engine {
        async fn event(&self, event: WhatsAppEvent) {
            let sender = self.senders.lock().unwrap().last().unwrap().clone();
            sender.send(event).await.unwrap();
        }
    }
    fn message(jid: &str, text: &str) -> WhatsAppMessage {
        WhatsAppMessage {
            key: MessageKey {
                remote_jid: Some(jid.into()),
                ..Default::default()
            },
            push_name: None,
            message: json!({"conversation":text}),
            timestamp_seconds: Some(123.0),
        }
    }
    type Received = Arc<Mutex<Vec<InboundMessage>>>;
    fn events() -> (Arc<ChannelConnectorEvents>, Received) {
        let inbound = Arc::new(Mutex::new(Vec::new()));
        let out = inbound.clone();
        (
            Arc::new(ChannelConnectorEvents {
                on_inbound: Arc::new(move |v| out.lock().unwrap().push(v)),
                on_status: Arc::new(|_, _| {}),
                on_paired: None,
            }),
            inbound,
        )
    }
    fn connector(engine: Arc<Engine>) -> WhatsAppConnector {
        WhatsAppConnector::new(
            engine,
            Arc::new(|_| Box::pin(async { Ok(()) })),
            Arc::new(|| 456_000),
            None,
        )
    }
    async fn until(mut check: impl FnMut() -> bool) {
        tokio::time::timeout(Duration::from_secs(2), async {
            while !check() {
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await
        .unwrap();
    }

    #[test]
    fn extraction_precedence_wrappers_and_limits() {
        assert_eq!(
            extract_text(
                &json!({"conversation":"plain","extendedTextMessage":{"text":"extended"}})
            ),
            "plain"
        );
        assert_eq!(
            extract_text(
                &json!({"ephemeralMessage":{"message":{"viewOnceMessage":{"message":{"imageMessage":{"caption":" caption "}}}}}})
            ),
            " caption "
        );
        assert_eq!(
            extract_text(&json!({"videoMessage":{"caption":"video"}})),
            "video"
        );
        assert!(extract_text(&json!({"conversation":"x".repeat(MAX_TEXT+1)})).is_empty());
        let mut deep = json!({"conversation":"hidden"});
        for _ in 0..40 {
            deep = json!({"ephemeralMessage":{"message":deep}});
        }
        assert!(extract_text(&deep).is_empty());
    }
    #[test]
    fn message_conversion_matches_alias_sender_and_timestamp_rules() {
        let aliases = HashSet::from(["123".into(), "999".into()]);
        let mut msg = message("123:8@s.whatsapp.net", " hi ");
        msg.key.from_me = true;
        let inbound = message_to_inbound(&msg, &aliases, 0).unwrap();
        assert_eq!(inbound.text, " hi ");
        assert_eq!(inbound.timestamp, 123_000.0);
        assert!(inbound.is_self_chat && inbound.from_me);
        assert_eq!(bare_jid(Some("999:5@lid")), "999");
        msg.key.remote_jid = Some("room@g.us".into());
        msg.key.participant = Some("sender@s.whatsapp.net".into());
        msg.timestamp_seconds = None;
        let inbound = message_to_inbound(&msg, &aliases, 567).unwrap();
        assert_eq!(inbound.sender_id, "sender@s.whatsapp.net");
        assert_eq!(inbound.timestamp, 567.0);
        assert!(!inbound.is_self_chat);
        msg.key.remote_jid = Some("status@broadcast".into());
        assert!(message_to_inbound(&msg, &aliases, 0).is_none());
    }

    #[tokio::test]
    async fn actor_handles_qr_open_history_filter_creds_send_and_stop() {
        let engine = Arc::new(Engine::default());
        let connector = connector(engine.clone());
        let (events, inbound) = events();
        connector.start_connector(events).await.unwrap();
        engine.event(WhatsAppEvent::Qr("qr-data".into())).await;
        until(|| connector.status() == ChannelStatus::Qr).await;
        assert_eq!(
            connector.current_qr().as_deref(),
            Some("data:image/png;base64,qr-data")
        );
        engine
            .event(WhatsAppEvent::Open {
                user_id: Some("123:5@s.whatsapp.net".into()),
                lid: Some("999@lid".into()),
            })
            .await;
        until(|| connector.status() == ChannelStatus::Connected).await;
        assert!(connector.current_qr().is_none());
        engine
            .event(WhatsAppEvent::Messages {
                kind: Some("append".into()),
                messages: vec![message("123@s.whatsapp.net", "history")],
            })
            .await;
        engine
            .event(WhatsAppEvent::Messages {
                kind: Some("notify".into()),
                messages: vec![message("123@s.whatsapp.net", " hello ")],
            })
            .await;
        until(|| inbound.lock().unwrap().len() == 1).await;
        assert!(inbound.lock().unwrap()[0].is_self_chat);
        engine.event(WhatsAppEvent::CredentialsUpdated).await;
        until(|| engine.saved.load(Ordering::SeqCst) == 1).await;
        connector
            .send_message(OutboundMessage {
                conversation_id: "123@s.whatsapp.net".into(),
                text: "reply".into(),
                choices: None,
            })
            .await
            .unwrap();
        assert_eq!(
            engine.sockets.lock().unwrap()[0].sent.lock().unwrap()[0].1,
            "reply"
        );
        connector.stop_connector().await.unwrap();
        assert_eq!(connector.status(), ChannelStatus::Stopped);
        assert!(
            engine.sockets.lock().unwrap()[0]
                .closed
                .load(Ordering::SeqCst)
        );
        assert_eq!(engine.cleared.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn reconnect_closes_old_socket_and_logout_clears_only_owned_store() {
        let engine = Arc::new(Engine::default());
        let connector = connector(engine.clone());
        connector.start_connector(events().0).await.unwrap();
        engine
            .event(WhatsAppEvent::Closed {
                status_code: Some(500),
            })
            .await;
        until(|| engine.loaded.load(Ordering::SeqCst) == 2).await;
        until(|| engine.sockets.lock().unwrap().len() == 2).await;
        assert!(
            engine.sockets.lock().unwrap()[0]
                .closed
                .load(Ordering::SeqCst)
        );
        engine
            .event(WhatsAppEvent::Closed {
                status_code: Some(401),
            })
            .await;
        until(|| connector.status() == ChannelStatus::Error).await;
        assert_eq!(engine.cleared.load(Ordering::SeqCst), 1);
        assert_eq!(engine.loaded.load(Ordering::SeqCst), 2);
        assert!(
            engine.sockets.lock().unwrap()[1]
                .closed
                .load(Ordering::SeqCst)
        );
        connector.stop_connector().await.unwrap();
    }

    #[tokio::test]
    async fn stopping_during_auth_load_cancels_start_without_late_socket() {
        let engine = Arc::new(Engine {
            pending_load: true,
            ..Default::default()
        });
        let connector = connector(engine.clone());
        let starter = connector.clone();
        let start = tokio::spawn(async move { starter.start_connector(events().0).await });
        until(|| engine.loaded.load(Ordering::SeqCst) == 1).await;
        connector.stop_connector().await.unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(2), start)
                .await
                .unwrap()
                .unwrap()
                .is_err()
        );
        assert!(engine.sockets.lock().unwrap().is_empty());
        assert_eq!(connector.status(), ChannelStatus::Stopped);
    }

    #[tokio::test]
    async fn denied_send_never_reaches_socket_and_last_owner_drop_closes_it() {
        let engine = Arc::new(Engine::default());
        let connector = WhatsAppConnector::new(
            engine.clone(),
            Arc::new(|action| {
                Box::pin(async move {
                    match action {
                        WhatsAppAction::Start => Ok(()),
                        WhatsAppAction::Send { .. } => Err("recipient denied".into()),
                    }
                })
            }),
            Arc::new(|| 0),
            None,
        );
        connector.start_connector(events().0).await.unwrap();
        assert_eq!(
            connector
                .send_message(OutboundMessage {
                    conversation_id: "recipient".into(),
                    text: "text".into(),
                    choices: None
                })
                .await
                .unwrap_err(),
            "recipient denied"
        );
        assert!(
            engine.sockets.lock().unwrap()[0]
                .sent
                .lock()
                .unwrap()
                .is_empty()
        );
        drop(connector);
        until(|| {
            engine.sockets.lock().unwrap()[0]
                .closed
                .load(Ordering::SeqCst)
        })
        .await;
        until(|| engine.senders.lock().unwrap()[0].is_closed()).await;
    }
}
