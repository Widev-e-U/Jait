//! Native port of `packages/gateway/src/channels/manager.ts`.
//!
//! This module owns the *pipeline* the TypeScript manager implements on top of the
//! connector contract: admission and authorization of inbound messages, per
//! conversation FIFO ordering, cancellation, command interception, and the single
//! in-flight turn that produces and sends a reply.
//!
//! Scope and honesty about wiring:
//!
//! * Compiled as an internal module for review; no gateway runtime path calls it.
//! * Session persistence, history trimming, consent approval round-trips and progress
//!   streaming are *contracts* here (traits + explicit steps), not implementations.
//!   Their native homes are the `db` layer and the assistant runtime, which are not
//!   in this file's ownership.
//! * Transport-specific behavior such as live editing, typing indicators and
//!   command menus is not yet implemented by this draft. Busy notice sends are
//!   owned by a bounded task set so admission does not cancel a pending send.
//!   Its overload and shutdown behavior still require compatibility review.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Weak};

use futures_util::future::BoxFuture;

use crate::integrations::channel_contracts::{
    ChannelChoice, ChannelConfig, ChannelConnector, InboundMessage, OutboundMessage,
};
// The crate has no `tokio-util`, so this is the canonical `AbortSignal` stand-in.
use crate::providers::acp_provider::CancelToken;

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/// Where the message came from, as far as authorization is concerned.
///
/// The TypeScript manager derives this from the connector's conversation shape; a
/// connector is responsible for classifying its own conversations.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConversationScope {
    /// One-to-one chat with an external sender.
    Direct,
    /// The operator's own conversation with themselves; always answerable.
    SelfChat,
    /// Group conversation. Mentions do not grant authorization.
    Group { mentions_assistant: bool },
}

/// The authorization contract: *decide before doing any work*.
///
/// Every field is a plain decision so the rule set can be unit tested without a
/// connector, a database or an event loop.
#[derive(Clone, Debug, Default)]
pub struct AuthorizationPolicy {
    /// Senders permitted to talk to the assistant regardless of group mentions.
    allowed_senders: HashSet<String>,
    /// When true, any sender is answered. Mirrors `respondToAll` in the channel config.
    respond_to_all: bool,
}

impl AuthorizationPolicy {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_config(config: Option<&ChannelConfig>) -> Self {
        let mut policy = Self::new();
        if let Some(config) = config {
            policy.respond_to_all = config.respond_to_all.unwrap_or(false);
            if let Some(senders) = &config.allowed_senders {
                for sender in senders {
                    policy.allow_sender(sender);
                }
            }
        }
        policy
    }

    /// Allow one sender. Ids are normalized so an allowlist entry written by hand
    /// matches the id a connector reports.
    pub fn allow_sender(&mut self, sender_id: &str) -> &mut Self {
        let normalized = normalize_sender_id(sender_id);
        if !normalized.is_empty() {
            self.allowed_senders.insert(normalized);
        }
        self
    }

    pub fn respond_to_all(&mut self, respond_to_all: bool) -> &mut Self {
        self.respond_to_all = respond_to_all;
        self
    }

    /// Match the TypeScript manager's authorization order. Conversation scope is
    /// informational; only the message's self-chat flag grants the exception.
    pub fn should_respond(&self, message: &InboundMessage, _scope: ConversationScope) -> bool {
        if message.from_me && !message.is_self_chat {
            return false;
        }
        if message.is_self_chat {
            return true;
        }
        if self.respond_to_all {
            return !message.from_me;
        }
        self.allowed_senders
            .contains(&normalize_sender_id(&message.sender_id))
    }
}

/// Normalize a WhatsApp-style sender ID to the ASCII digits before `@` and `:`.
pub fn normalize_sender_id(sender_id: &str) -> String {
    sender_id
        .split('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .chars()
        .filter(char::is_ascii_digit)
        .collect()
}

// ---------------------------------------------------------------------------
// Ordering: per-conversation FIFO with one in-flight turn
// ---------------------------------------------------------------------------

/// Identifier of one admitted turn. Unique per pipeline instance.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TurnId(u64);

impl TurnId {
    pub fn value(self) -> u64 {
        self.0
    }
}

/// What the pipeline decided to do with an inbound message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Admission {
    /// The conversation was idle: run this turn immediately.
    Start(TurnId),
    /// The conversation was busy: the turn is queued FIFO behind the in-flight one,
    /// and the caller still owes the sender a "busy" notice.
    Queued(TurnId),
}

#[derive(Debug, Default)]
struct ConversationSlot {
    active: Option<TurnId>,
    waiting: VecDeque<TurnId>,
}

impl ConversationSlot {
    fn is_free(&self) -> bool {
        self.active.is_none()
    }
}

/// Per-conversation ordering state.
///
/// The contract the pipeline guarantees, matching the TypeScript manager:
///
/// 1. At most one turn per conversation is in flight at any time.
/// 2. Turns for the same conversation are dispatched in arrival order.
/// 3. Different conversations are independent: a slow turn in one never blocks
///    admission in another.
/// 4. Completing or abandoning a turn hands the slot to the oldest waiting turn, and
///    removing a cancelled turn never skips or stalls its successors.
///
/// The lock is never held across an `await`; it guards only these maps.
#[derive(Debug, Default)]
pub struct ConversationQueue {
    slots: Mutex<HashMap<String, ConversationSlot>>,
    next: Mutex<u64>,
}

impl ConversationQueue {
    pub fn new() -> Self {
        Self::default()
    }

    fn allocate(&self) -> TurnId {
        let mut next = self.next.lock().expect("turn counter poisoned");
        let id = TurnId(*next);
        *next += 1;
        id
    }

    /// Admit an already-authorized message. Authorization happens first and stays
    /// outside this queue, so an unauthorized sender can never occupy a slot.
    pub fn admit(&self, conversation_id: &str) -> Admission {
        let id = self.allocate();
        let mut slots = self.slots.lock().expect("conversation queue poisoned");
        let slot = slots.entry(conversation_id.to_string()).or_default();
        if slot.is_free() {
            slot.active = Some(id);
            Admission::Start(id)
        } else {
            slot.waiting.push_back(id);
            Admission::Queued(id)
        }
    }

    /// Mark a turn finished and return the next turn that may start, if any.
    ///
    /// Returns `None` when the turn was not the active one (already finished or
    /// cancelled), so a duplicate completion is a no-op rather than a double start.
    pub fn finish(&self, conversation_id: &str, turn: TurnId) -> Option<TurnId> {
        let mut slots = self.slots.lock().expect("conversation queue poisoned");
        let slot = slots.get_mut(conversation_id)?;
        if slot.active != Some(turn) {
            return None;
        }
        let next = slot.waiting.pop_front();
        slot.active = next;
        if next.is_none() && slot.waiting.is_empty() {
            slots.remove(conversation_id);
        }
        next
    }

    /// Drop a turn that has not started yet. Returns true when it was still queued.
    ///
    /// An already-started turn is cancelled through its own [`CancelToken`] instead;
    /// this method never disturbs the active turn's slot.
    pub fn cancel_queued(&self, conversation_id: &str, turn: TurnId) -> bool {
        let mut slots = self.slots.lock().expect("conversation queue poisoned");
        let Some(slot) = slots.get_mut(conversation_id) else {
            return false;
        };
        let before = slot.waiting.len();
        slot.waiting.retain(|queued| *queued != turn);
        let removed = slot.waiting.len() != before;
        if slot.is_free() && slot.waiting.is_empty() {
            slots.remove(conversation_id);
        }
        removed
    }

    /// Release the active turn and drop every turn still waiting behind it.
    ///
    /// Used when the in-flight turn ends abnormally. The conversation is left clean and
    /// idle rather than holding a slot that no drain loop will ever service, and the
    /// dropped identifiers are returned so their retained payloads can be released too.
    pub fn abandon(&self, conversation_id: &str) -> Vec<TurnId> {
        let mut slots = self.slots.lock().expect("conversation queue poisoned");
        match slots.remove(conversation_id) {
            Some(slot) => slot.waiting.into_iter().collect(),
            None => Vec::new(),
        }
    }

    /// Number of turns queued behind the in-flight one. Test and observability hook.
    pub fn waiting_len(&self, conversation_id: &str) -> usize {
        let slots = self.slots.lock().expect("conversation queue poisoned");
        slots
            .get(conversation_id)
            .map(|slot| slot.waiting.len())
            .unwrap_or(0)
    }

    pub fn is_busy(&self, conversation_id: &str) -> bool {
        let slots = self.slots.lock().expect("conversation queue poisoned");
        slots
            .get(conversation_id)
            .map(|slot| !slot.is_free())
            .unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Turn execution contract
// ---------------------------------------------------------------------------

/// One conversational turn of context. History storage is owned by the host.
#[derive(Clone, Debug, Default)]
pub struct TurnRequest {
    pub channel_id: String,
    pub conversation_id: String,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub text: String,
    /// Prior turns, oldest first, already trimmed by the caller.
    pub history: Vec<HistoryTurn>,
    /// Tool names permitted for this channel, from `ChannelConfig::tools`.
    pub allowed_tools: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryTurn {
    pub role: HistoryRole,
    pub text: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HistoryRole {
    User,
    Assistant,
}

/// In-memory host history. The generator owns the system prompt;
/// entries here are only user and assistant messages. The caller must invoke load
/// and record under the pipeline's per-conversation lock. This is not durable storage.
pub struct ChannelHistory {
    entries: Mutex<HashMap<(String, String), Vec<HistoryTurn>>>,
    max_entries: usize,
}

impl ChannelHistory {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            max_entries,
        }
    }

    pub fn load(&self, channel: &str, conversation: &str) -> Vec<HistoryTurn> {
        self.entries
            .lock()
            .expect("channel history poisoned")
            .get(&(channel.to_owned(), conversation.to_owned()))
            .cloned()
            .unwrap_or_default()
    }

    pub fn record(&self, channel: &str, conversation: &str, turn: HistoryTurn) {
        let mut entries = self.entries.lock().expect("channel history poisoned");
        let history = entries
            .entry((channel.to_owned(), conversation.to_owned()))
            .or_default();
        let trim = turn.role == HistoryRole::Assistant;
        history.push(turn);
        if trim && history.len() > self.max_entries {
            history.drain(..history.len() - self.max_entries);
        }
    }
}

/// The generator's product. `None` for `text` is a legitimate "nothing to say"
/// result: the manager sends no message rather than an empty one.
#[derive(Clone, Debug, Default)]
pub struct GeneratedReply {
    pub text: Option<String>,
    /// Rendered choice buttons; only forwarded when the connector supports choices.
    pub choices: Option<Vec<ChannelChoice>>,
}

/// The assistant side of the pipeline.
pub trait ReplyGenerator: Send + Sync {
    fn generate<'a>(
        &'a self,
        request: TurnRequest,
    ) -> BoxFuture<'a, Result<GeneratedReply, String>>;
}

#[derive(Debug)]
pub enum PipelineError<E> {
    /// Generation failed. The manager still sends its fallback notice, so the error is
    /// reported for logging rather than swallowed.
    Generate(String),
    /// The connector rejected the outbound message.
    Send(E),
    /// The turn was cancelled. Nothing is sent and the slot is released.
    Cancelled,
}

impl<E: fmt::Display> fmt::Display for PipelineError<E> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Generate(message) => write!(f, "generation failed: {message}"),
            Self::Send(error) => write!(f, "send failed: {error}"),
            Self::Cancelled => f.write_str("turn cancelled"),
        }
    }
}

impl<E: fmt::Debug + fmt::Display> std::error::Error for PipelineError<E> {}

/// What `handle_inbound` did, so the caller can log or surface it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PipelineOutcome {
    /// Not authorized, or echo of our own message. Nothing happened.
    Ignored,
    /// Consumed as a slash command; `name` is the verb without the prefix.
    Command { name: String, args: String },
    /// A busy notice was sent; the turn stayed queued.
    BusyQueued(TurnId),
    /// A turn ran to completion (with or without producing text).
    Replied(TurnId),
    /// A queued turn was cancelled before it started.
    Cancelled(TurnId),
}

/// Classify an in-band approval reply using the channel manager's accepted words.
/// Unknown replies must leave the pending request unresolved and trigger a reprompt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConsentReply {
    Approve,
    Reject,
    Unknown,
}

fn js_whitespace(c: char) -> bool {
    (c.is_whitespace() && c != '\u{0085}') || c == '\u{feff}'
}

/// Format the most recent progress steps using the channel manager's display limit.
pub fn format_progress(steps: &[String]) -> String {
    let omitted = steps.len().saturating_sub(8);
    let heading = if omitted == 0 {
        "🔧 Working…".to_string()
    } else {
        format!("🔧 Working… ({omitted} earlier steps)")
    };
    std::iter::once(heading)
        .chain(steps[omitted..].iter().cloned())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Preserve configured recipient IDs and order; respond-to-all is not a broadcast list.
pub fn notification_recipients(config: &ChannelConfig) -> Vec<String> {
    let mut seen = HashSet::new();
    config
        .allowed_senders
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|id| id.trim_matches(js_whitespace))
        .filter(|id| !id.is_empty() && seen.insert((*id).to_owned()))
        .map(str::to_owned)
        .collect()
}

pub fn parse_consent_reply(text: &str) -> ConsentReply {
    // ECMAScript trim includes BOM and excludes NEXT LINE, unlike Rust's trim.
    let normalized = text.trim_matches(js_whitespace).to_lowercase();
    let normalized = normalized.trim_end_matches(['!', '.', ',']);
    match normalized {
        "y" | "yes" | "yeah" | "yep" | "yup" | "ok" | "okay" | "sure" | "go" | "do it"
        | "proceed" | "approve" | "approved" | "ja" | "👍" | "✅" => ConsentReply::Approve,
        "n" | "no" | "nope" | "nah" | "stop" | "cancel" | "skip" | "deny" | "denied" | "dont"
        | "don't" | "nein" | "👎" | "🚫" | "❌" => ConsentReply::Reject,
        _ => ConsentReply::Unknown,
    }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

type ConversationLocks = Mutex<HashMap<(String, String), Weak<tokio::sync::Mutex<()>>>>;

/// The channel manager pipeline: authorization, admission, ordering, cancellation
/// and the single in-flight turn.
pub struct ManagerPipeline<G: ReplyGenerator> {
    // Each caller retains its own request and cancellation token while waiting.
    // Weak entries avoid retaining idle conversations indefinitely.
    locks: ConversationLocks,
    notice_tasks: Mutex<(bool, tokio::task::JoinSet<()>)>,
    notice_shutdown: tokio::sync::Mutex<Option<tokio::task::JoinSet<()>>>,
    next_turn: AtomicU64,
    policy: AuthorizationPolicy,
    generator: Arc<G>,
    tools: Vec<String>,
    fallback_notice: String,
    busy_notice: String,
    command_prefix: char,
}

impl<G: ReplyGenerator> ManagerPipeline<G> {
    pub fn new(generator: Arc<G>) -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
            notice_tasks: Mutex::new((false, tokio::task::JoinSet::new())),
            notice_shutdown: tokio::sync::Mutex::new(None),
            next_turn: AtomicU64::new(0),
            policy: AuthorizationPolicy::new(),
            generator,
            tools: Vec::new(),
            fallback_notice: "⚠️ Sorry — I hit an error generating a reply.".to_string(),
            busy_notice: "⏳ Still working on the previous message — I'll get to this next."
                .to_string(),
            command_prefix: '/',
        }
    }

    pub fn with_policy(mut self, policy: AuthorizationPolicy) -> Self {
        self.policy = policy;
        self
    }

    pub fn with_tools(mut self, tools: Vec<String>) -> Self {
        self.tools = tools;
        self
    }

    /// Serialize each channel/conversation independently. Each waiting caller owns
    /// its request and token, and reports the result of its own turn. History must
    /// be loaded after acquiring the lock, so queued turns see earlier updates.
    /// The host records each entry while this lock is held. It trims after an
    /// assistant entry according to the channel history limit.
    pub async fn handle_inbound<C, E, H, P>(
        &self,
        connector: Arc<C>,
        message: InboundMessage,
        scope: ConversationScope,
        load_history: H,
        mut record_history: P,
        cancel: CancelToken,
    ) -> Result<PipelineOutcome, PipelineError<E>>
    where
        C: ChannelConnector<Error = E> + ?Sized + 'static,
        E: fmt::Display,
        H: FnOnce() -> Vec<HistoryTurn>,
        P: FnMut(HistoryTurn),
    {
        if message.text.trim_matches(js_whitespace).is_empty()
            || !self.policy.should_respond(&message, scope)
        {
            return Ok(PipelineOutcome::Ignored);
        }
        let turn = TurnId(self.next_turn.fetch_add(1, Ordering::Relaxed));
        if cancel.is_cancelled() {
            return Ok(PipelineOutcome::Cancelled(turn));
        }
        // Command dispatch and in-band consent require their native runtime; this
        // draft is not registered until those paths are implemented.
        if let Some((name, args)) = self.parse_command(&message.text) {
            return Ok(PipelineOutcome::Command { name, args });
        }
        let key = (message.channel_id.clone(), message.conversation_id.clone());
        let lock = {
            let mut locks = self.locks.lock().expect("conversation locks poisoned");
            locks.retain(|_, lock| lock.strong_count() > 0);
            if let Some(existing) = locks.get(&key).and_then(Weak::upgrade) {
                existing
            } else {
                let created = Arc::new(tokio::sync::Mutex::new(()));
                locks.insert(key, Arc::downgrade(&created));
                created
            }
        };
        let acquisition = lock.lock();
        tokio::pin!(acquisition);
        // Poll the lock before the best-effort notice, preserving FIFO registration.
        let guard = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Ok(PipelineOutcome::Cancelled(turn)),
            guard = &mut acquisition => guard,
            _ = std::future::ready(()) => {
                self.start_busy_notice(connector.clone(), message.conversation_id.clone());
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => return Ok(PipelineOutcome::Cancelled(turn)),
                    guard = &mut acquisition => guard,
                }
            }
        };
        let request = self.build_request(&message, &message.conversation_id, load_history());
        if cancel.is_cancelled() {
            return Ok(PipelineOutcome::Cancelled(turn));
        }
        record_history(HistoryTurn {
            role: HistoryRole::User,
            text: request.text.clone(),
        });
        let result = self
            .run_turn(connector.as_ref(), &request, &cancel, &mut record_history)
            .await;
        drop(guard);
        match result {
            Ok(()) => Ok(PipelineOutcome::Replied(turn)),
            Err(PipelineError::Cancelled) => Ok(PipelineOutcome::Cancelled(turn)),
            Err(error) => Err(error),
        }
    }

    // Best-effort notices must not retain an unbounded number of stalled sends.
    // The limit and timeout are provisional compatibility decisions, not parity.
    fn start_busy_notice<C>(&self, connector: Arc<C>, conversation_id: String)
    where
        C: ChannelConnector + ?Sized + 'static,
    {
        let mut state = self.notice_tasks.lock().expect("notice tasks poisoned");
        if state.0 {
            return;
        }
        let tasks = &mut state.1;
        while tasks.try_join_next().is_some() {}
        if tasks.len() >= 128 {
            return;
        }
        let text = self.busy_notice.clone();
        tasks.spawn(async move {
            let message = OutboundMessage {
                conversation_id,
                text,
                choices: None,
            };
            let _ =
                tokio::time::timeout(std::time::Duration::from_secs(30), connector.send(message))
                    .await;
        });
    }

    /// Abort and join pending notice sends during manager shutdown.
    pub async fn shutdown_notices(&self) {
        // Keep the set in shared state across awaits: a cancelled shutdown caller
        // must not discard ownership before another caller can finish joining.
        let mut shutdown = self.notice_shutdown.lock().await;
        if shutdown.is_none() {
            let mut owned = self.notice_tasks.lock().expect("notice tasks poisoned");
            owned.0 = true;
            *shutdown = Some(std::mem::take(&mut owned.1));
        }
        let tasks = shutdown.as_mut().expect("notice shutdown initialized");
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
    }

    fn build_request(
        &self,
        message: &InboundMessage,
        conversation_id: &str,
        history: Vec<HistoryTurn>,
    ) -> TurnRequest {
        TurnRequest {
            channel_id: message.channel_id.clone(),
            conversation_id: conversation_id.to_string(),
            sender_id: message.sender_id.clone(),
            sender_name: message.sender_name.clone(),
            text: message.text.clone(),
            history,
            allowed_tools: self.tools.clone(),
        }
    }

    fn parse_command(&self, text: &str) -> Option<(String, String)> {
        let trimmed = text.trim_matches(js_whitespace);
        let rest = trimmed.strip_prefix(self.command_prefix)?;
        let end = rest.find(js_whitespace).unwrap_or(rest.len());
        let token = &rest[..end];
        let args = rest[end..].trim_start_matches(js_whitespace).to_owned();
        let (name, suffix) = match token.split_once('@') {
            Some((name, suffix)) if !suffix.is_empty() => (name, Some(suffix)),
            Some(_) => return None,
            None => (token, None),
        };
        if name.is_empty() || !name.bytes().all(|c| c.is_ascii_alphabetic()) {
            return None;
        }
        // The TypeScript suffix is any non-whitespace text after the first '@'.
        let _ = suffix;
        let name = name.to_ascii_lowercase();
        matches!(
            name.as_str(),
            "model" | "notifications" | "approvals" | "progress" | "status" | "help"
        )
        .then_some((name, args))
    }

    /// One turn: generate, then send, then release. Every await is raced against the
    /// token so cancellation is observed promptly and never after output is sent
    /// beyond a completed step.
    async fn run_turn<C, E, P>(
        &self,
        connector: &C,
        request: &TurnRequest,
        cancel: &CancelToken,
        record_history: &mut P,
    ) -> Result<(), PipelineError<E>>
    where
        C: ChannelConnector<Error = E> + ?Sized,
        E: fmt::Display,
        P: FnMut(HistoryTurn),
    {
        if cancel.is_cancelled() {
            return Err(PipelineError::Cancelled);
        }

        let conversation_id = request.conversation_id.clone();

        let generated = {
            let generation = self.generator.generate(request.clone());
            tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(PipelineError::Cancelled),
                result = generation => result,
            }
        };

        let reply = match generated {
            Ok(reply) => reply,
            Err(_error) => {
                // The reference logs failures and attempts a best-effort fallback.
                tokio::select! {
                    biased;
                    _ = cancel.cancelled() => return Err(PipelineError::Cancelled),
                    result = self.send_notice(connector, &conversation_id, &self.fallback_notice) => {
                        let _ = result;
                    }
                }
                return Ok(());
            }
        };

        let Some(text) = reply
            .text
            .map(|text| text.trim_matches(js_whitespace).to_owned())
            .filter(|text| !text.is_empty())
        else {
            return Ok(());
        };

        record_history(HistoryTurn {
            role: HistoryRole::Assistant,
            text: text.clone(),
        });

        // Choices are only forwarded when the transport can render them, matching the
        // optional `supports_choices` capability on the connector contract.
        let choices = match connector.supports_choices() {
            Some(true) => reply.choices,
            _ => None,
        };

        let outbound = OutboundMessage {
            conversation_id: conversation_id.to_string(),
            text,
            choices,
        };

        tokio::select! {
            biased;
            _ = cancel.cancelled() => Err(PipelineError::Cancelled),
            result = connector.send(outbound) => match result {
                Ok(()) => Ok(()),
                Err(_) => tokio::select! {
                    biased;
                    _ = cancel.cancelled() => Err(PipelineError::Cancelled),
                    _ = self.send_notice(connector, &conversation_id, &self.fallback_notice) => Ok(()),
                },
            },
        }
    }

    async fn send_notice<C, E>(
        &self,
        connector: &C,
        conversation_id: &str,
        text: &str,
    ) -> Result<(), E>
    where
        C: ChannelConnector<Error = E> + ?Sized,
    {
        connector
            .send(OutboundMessage {
                conversation_id: conversation_id.to_string(),
                text: text.to_string(),
                choices: None,
            })
            .await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrations::channel_contracts::{
        ChannelConnectorEvents, ChannelPairOptions, ChannelStatus,
    };
    use std::sync::atomic::{AtomicBool, AtomicUsize};
    use std::time::Duration;

    fn message(sender: &str, text: &str) -> InboundMessage {
        InboundMessage {
            channel_id: "telegram".to_string(),
            conversation_id: "conv-1".to_string(),
            sender_id: sender.to_string(),
            sender_name: None,
            text: text.to_string(),
            timestamp: 1.0,
            from_me: false,
            is_self_chat: false,
        }
    }

    struct NoopGenerator;
    impl ReplyGenerator for NoopGenerator {
        fn generate<'a>(&'a self, _: TurnRequest) -> BoxFuture<'a, Result<GeneratedReply, String>> {
            Box::pin(async { Ok(GeneratedReply::default()) })
        }
    }

    #[test]
    fn host_history_trims_only_after_assistant_and_isolates_conversations() {
        let history = ChannelHistory::new(2);
        let turn = |role, text: &str| HistoryTurn {
            role,
            text: text.to_owned(),
        };
        history.record("a", "one", turn(HistoryRole::User, "first"));
        history.record("a", "one", turn(HistoryRole::Assistant, "reply"));
        history.record("a", "one", turn(HistoryRole::User, "failed"));
        assert_eq!(history.load("a", "one").len(), 3);
        history.record("a", "two", turn(HistoryRole::User, "separate"));
        history.record("a", "one", turn(HistoryRole::Assistant, "answer"));
        assert_eq!(
            history.load("a", "one"),
            vec![
                turn(HistoryRole::User, "failed"),
                turn(HistoryRole::Assistant, "answer")
            ]
        );
        assert_eq!(
            history.load("a", "two"),
            vec![turn(HistoryRole::User, "separate")]
        );
        assert!(history.load("b", "one").is_empty());
    }

    #[test]
    fn zero_history_limit_clears_only_after_assistant_reply() {
        let history = ChannelHistory::new(0);
        let turn = |role, text: &str| HistoryTurn {
            role,
            text: text.to_owned(),
        };
        history.record("a", "one", turn(HistoryRole::User, "failed"));
        assert_eq!(
            history.load("a", "one"),
            vec![turn(HistoryRole::User, "failed")]
        );
        history.record("a", "one", turn(HistoryRole::Assistant, "reply"));
        assert!(history.load("a", "one").is_empty());
    }

    fn permissive_policy() -> AuthorizationPolicy {
        let mut policy = AuthorizationPolicy::new();
        policy.respond_to_all(true);
        policy
    }

    /// A connector that records the text of every successful send and can be
    /// told to fail all sends, so failure paths need no timing tricks.
    #[derive(Default)]
    struct RecordingConnector {
        sent: Mutex<Vec<String>>,
        fail: AtomicBool,
    }

    impl RecordingConnector {
        fn texts(&self) -> Vec<String> {
            self.sent.lock().expect("sent poisoned").clone()
        }
    }

    impl ChannelConnector for RecordingConnector {
        type Error = String;
        fn id(&self) -> &str {
            "telegram"
        }
        fn label(&self) -> &str {
            "Telegram"
        }
        fn start(
            &self,
            _events: Arc<ChannelConnectorEvents>,
            _config: Option<ChannelConfig>,
            _options: Option<ChannelPairOptions>,
        ) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn stop(&self) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async { Ok(()) })
        }
        fn send(&self, message: OutboundMessage) -> BoxFuture<'_, Result<(), String>> {
            if self.fail.load(Ordering::SeqCst) {
                return Box::pin(async { Err("send failed".to_string()) });
            }
            self.sent.lock().expect("sent poisoned").push(message.text);
            Box::pin(async { Ok(()) })
        }
        fn status(&self) -> ChannelStatus {
            ChannelStatus::Connected
        }
        fn current_qr(&self) -> Option<String> {
            None
        }
    }

    type SharedHistory = Arc<Mutex<Vec<HistoryTurn>>>;

    fn spawn_turn<G: ReplyGenerator + 'static>(
        manager: Arc<ManagerPipeline<G>>,
        connector: Arc<RecordingConnector>,
        text: &str,
        history: SharedHistory,
    ) -> tokio::task::JoinHandle<PipelineOutcome> {
        let text = text.to_owned();
        tokio::spawn(async move {
            let load = {
                let history = history.clone();
                move || history.lock().expect("history poisoned").clone()
            };
            let record = {
                let history = history.clone();
                move |turn| history.lock().expect("history poisoned").push(turn)
            };
            manager
                .handle_inbound(
                    connector,
                    message("123", &text),
                    ConversationScope::Direct,
                    load,
                    record,
                    CancelToken::new(),
                )
                .await
                .expect("turn should not fail")
        })
    }

    /// First call blocks until the test releases it, so the second turn provably
    /// queues behind the first while it owns the conversation lock.
    struct GatedGenerator {
        calls: AtomicUsize,
        gate: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
        release: tokio::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
        entered: tokio::sync::Notify,
        seen: Mutex<Vec<Vec<HistoryTurn>>>,
    }

    impl GatedGenerator {
        fn gated() -> Self {
            let (tx, rx) = tokio::sync::oneshot::channel();
            Self {
                calls: AtomicUsize::new(0),
                gate: tokio::sync::Mutex::new(Some(rx)),
                release: tokio::sync::Mutex::new(Some(tx)),
                entered: tokio::sync::Notify::new(),
                seen: Mutex::new(Vec::new()),
            }
        }

        async fn release(&self) {
            if let Some(tx) = self.release.lock().await.take() {
                let _ = tx.send(());
            }
        }
    }

    impl ReplyGenerator for GatedGenerator {
        fn generate<'a>(
            &'a self,
            request: TurnRequest,
        ) -> BoxFuture<'a, Result<GeneratedReply, String>> {
            Box::pin(async move {
                let call = self.calls.fetch_add(1, Ordering::SeqCst);
                self.seen
                    .lock()
                    .expect("seen poisoned")
                    .push(request.history.clone());
                if call == 0 {
                    self.entered.notify_one();
                    if let Some(wait) = self.gate.lock().await.take() {
                        let _ = wait.await;
                    }
                }
                Ok(GeneratedReply {
                    text: Some(format!("reply {call}")),
                    choices: None,
                })
            })
        }
    }

    struct FixedGenerator(&'static str);

    impl ReplyGenerator for FixedGenerator {
        fn generate<'a>(&'a self, _: TurnRequest) -> BoxFuture<'a, Result<GeneratedReply, String>> {
            let text = self.0.to_string();
            Box::pin(async move {
                Ok(GeneratedReply {
                    text: Some(text),
                    choices: None,
                })
            })
        }
    }

    struct FailingGenerator;

    impl ReplyGenerator for FailingGenerator {
        fn generate<'a>(&'a self, _: TurnRequest) -> BoxFuture<'a, Result<GeneratedReply, String>> {
            Box::pin(async { Err("provider unavailable".to_string()) })
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn queued_turn_loads_history_after_prior_turn_completes() {
        let generator = Arc::new(GatedGenerator::gated());
        let connector = Arc::new(RecordingConnector::default());
        let manager =
            Arc::new(ManagerPipeline::new(generator.clone()).with_policy(permissive_policy()));
        let history: SharedHistory = Arc::new(Mutex::new(Vec::new()));

        let entered = generator.entered.notified();
        tokio::pin!(entered);
        let first = spawn_turn(manager.clone(), connector.clone(), "first", history.clone());
        tokio::time::timeout(Duration::from_secs(5), &mut entered)
            .await
            .expect("first generation should start");

        let second = spawn_turn(
            manager.clone(),
            connector.clone(),
            "second",
            history.clone(),
        );
        let busy = manager.busy_notice.clone();
        tokio::time::timeout(Duration::from_secs(5), async {
            while !connector.texts().contains(&busy) {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("the queued turn should announce that it is waiting");

        generator.release().await;
        assert!(matches!(
            first.await.expect("first turn joins"),
            PipelineOutcome::Replied(_)
        ));
        assert!(matches!(
            second.await.expect("second turn joins"),
            PipelineOutcome::Replied(_)
        ));

        let seen = generator.seen.lock().expect("seen poisoned").clone();
        let turn = |role, text: &str| HistoryTurn {
            role,
            text: text.to_owned(),
        };
        assert_eq!(seen.len(), 2);
        assert!(seen[0].is_empty(), "the first turn starts without history");
        assert_eq!(
            seen[1],
            vec![
                turn(HistoryRole::User, "first"),
                turn(HistoryRole::Assistant, "reply 0")
            ],
            "the queued turn must observe the reply of the turn it waited for"
        );
        assert_eq!(
            history.lock().expect("history poisoned").clone(),
            vec![
                turn(HistoryRole::User, "first"),
                turn(HistoryRole::Assistant, "reply 0"),
                turn(HistoryRole::User, "second"),
                turn(HistoryRole::Assistant, "reply 1"),
            ]
        );
        assert_eq!(connector.texts().last(), Some(&"reply 1".to_string()));
    }

    #[tokio::test]
    async fn generation_failure_keeps_user_turn_and_sends_fallback() {
        let connector = Arc::new(RecordingConnector::default());
        let manager = Arc::new(
            ManagerPipeline::new(Arc::new(FailingGenerator)).with_policy(permissive_policy()),
        );
        let fallback = manager.fallback_notice.clone();
        let history: SharedHistory = Arc::new(Mutex::new(Vec::new()));

        let outcome = spawn_turn(manager, connector.clone(), "hello", history.clone())
            .await
            .expect("turn joins");
        assert!(matches!(outcome, PipelineOutcome::Replied(_)));
        assert_eq!(connector.texts(), vec![fallback]);
        assert_eq!(
            history.lock().expect("history poisoned").clone(),
            vec![HistoryTurn {
                role: HistoryRole::User,
                text: "hello".to_string()
            }],
            "a failed generation keeps the user turn and records no assistant turn"
        );
    }

    #[tokio::test]
    async fn send_failure_records_assistant_turn_and_swallows_fallback_error() {
        let connector = Arc::new(RecordingConnector::default());
        connector.fail.store(true, Ordering::SeqCst);
        let manager = Arc::new(
            ManagerPipeline::new(Arc::new(FixedGenerator("answer")))
                .with_policy(permissive_policy()),
        );
        let history: SharedHistory = Arc::new(Mutex::new(Vec::new()));

        let outcome = spawn_turn(manager, connector.clone(), "hello", history.clone())
            .await
            .expect("a failed send must not fail the turn");
        assert!(matches!(outcome, PipelineOutcome::Replied(_)));
        assert!(connector.texts().is_empty());
        assert_eq!(
            history.lock().expect("history poisoned").clone(),
            vec![
                HistoryTurn {
                    role: HistoryRole::User,
                    text: "hello".to_string()
                },
                HistoryTurn {
                    role: HistoryRole::Assistant,
                    text: "answer".to_string()
                },
            ],
            "the assistant turn is recorded before the send is attempted"
        );
    }

    #[tokio::test]
    async fn cancelled_before_the_lock_touches_no_history_and_sends_nothing() {
        let connector = Arc::new(RecordingConnector::default());
        let manager = Arc::new(
            ManagerPipeline::new(Arc::new(FixedGenerator("answer")))
                .with_policy(permissive_policy()),
        );
        let history: SharedHistory = Arc::new(Mutex::new(Vec::new()));
        let cancel = CancelToken::new();
        cancel.cancel();

        let outcome = manager
            .handle_inbound(
                connector.clone(),
                message("123", "hello"),
                ConversationScope::Direct,
                {
                    let history = history.clone();
                    move || history.lock().expect("history poisoned").clone()
                },
                {
                    let history = history.clone();
                    move |turn| history.lock().expect("history poisoned").push(turn)
                },
                cancel,
            )
            .await
            .expect("cancellation is not an error");
        assert!(matches!(outcome, PipelineOutcome::Cancelled(_)));
        assert!(history.lock().expect("history poisoned").is_empty());
        assert!(connector.texts().is_empty());
    }

    #[test]
    fn progress_keeps_only_latest_eight_steps() {
        let steps: Vec<String> = (0..10).map(|n| format!("step {n}")).collect();
        assert_eq!(format_progress(&[]), "🔧 Working…");
        assert_eq!(
            format_progress(&steps),
            "🔧 Working… (2 earlier steps)\nstep 2\nstep 3\nstep 4\nstep 5\nstep 6\nstep 7\nstep 8\nstep 9"
        );
    }

    #[test]
    fn notification_recipients_are_trimmed_deduplicated_and_not_broadcast() {
        let config = ChannelConfig {
            respond_to_all: Some(true),
            allowed_senders: Some(vec![
                " 123 ".into(),
                "123".into(),
                "\u{feff}456\u{feff}".into(),
                " ".into(),
            ]),
            ..ChannelConfig::default()
        };
        assert_eq!(notification_recipients(&config), vec!["123", "456"]);
        assert!(
            notification_recipients(&ChannelConfig {
                respond_to_all: Some(true),
                ..ChannelConfig::default()
            })
            .is_empty()
        );
    }

    #[test]
    fn command_parser_uses_javascript_whitespace() {
        let manager = ManagerPipeline::new(Arc::new(NoopGenerator));
        assert_eq!(
            manager.parse_command("\u{feff}/model\u{feff}abc\u{feff}"),
            Some(("model".into(), "abc".into()))
        );
        assert_eq!(manager.parse_command("/model\u{0085}abc"), None);
        assert_eq!(manager.parse_command("\u{0085}/help"), None);
        assert_eq!(
            manager.parse_command("/help@bot\u{feff}x"),
            Some(("help".into(), "x".into()))
        );
    }

    #[test]
    fn consent_reply_requires_an_exact_known_verdict() {
        for text in [" YES!!! ", "Do it.", "👍,", "\u{feff}yes\u{feff}"] {
            assert_eq!(parse_consent_reply(text), ConsentReply::Approve);
        }
        for text in [" Don't! ", "NEIN", "❌."] {
            assert_eq!(parse_consent_reply(text), ConsentReply::Reject);
        }
        for text in ["yes please", "/status", "yes !", "", "\u{0085}yes"] {
            assert_eq!(parse_consent_reply(text), ConsentReply::Unknown);
        }
    }

    #[test]
    fn own_messages_are_never_answered() {
        let policy = AuthorizationPolicy::new().respond_to_all(true).clone();
        let mut inbound = message("@Jakob", "hi");
        inbound.from_me = true;
        assert!(!policy.should_respond(&inbound, ConversationScope::Direct));
    }

    #[test]
    fn self_chat_is_always_answerable_even_when_from_me() {
        let policy = AuthorizationPolicy::new();
        let mut inbound = message("me", "remind me");
        inbound.is_self_chat = true;
        inbound.from_me = true;
        assert!(policy.should_respond(&inbound, ConversationScope::Direct));
    }

    #[test]
    fn allowlist_matches_whatsapp_numbers_and_ignores_empty_normalization() {
        let policy = AuthorizationPolicy::new()
            .allow_sender("+1 (234) 567")
            .allow_sender("alice")
            .clone();
        assert!(policy.should_respond(
            &message("1234567:2@s.whatsapp.net", "hi"),
            ConversationScope::Direct
        ));
        assert!(!policy.should_respond(&message("alice", "hi"), ConversationScope::Direct));
        assert!(!policy.should_respond(&message("7654321", "hi"), ConversationScope::Direct));
    }

    #[test]
    fn mentions_and_scope_do_not_bypass_authorization() {
        let policy = AuthorizationPolicy::new().allow_sender("123").clone();
        let inbound = message("456", "hello");
        assert!(!policy.should_respond(
            &inbound,
            ConversationScope::Group {
                mentions_assistant: true
            }
        ));
        assert!(!policy.should_respond(&inbound, ConversationScope::SelfChat));
        assert!(
            AuthorizationPolicy::new()
                .respond_to_all(true)
                .should_respond(&inbound, ConversationScope::Direct)
        );
    }

    #[test]
    fn policy_is_built_from_channel_config() {
        let config = ChannelConfig {
            allowed_senders: Some(vec!["+123".to_string()]),
            ..ChannelConfig::default()
        };
        let policy = AuthorizationPolicy::from_config(Some(&config));
        assert!(policy.should_respond(
            &message("123@s.whatsapp.net", "hi"),
            ConversationScope::Direct
        ));
        assert!(!policy.should_respond(&message("456", "hi"), ConversationScope::Direct));
    }

    #[test]
    fn second_turn_queues_behind_the_first_and_drains_fifo() {
        let queue = ConversationQueue::new();
        let Admission::Start(first) = queue.admit("conv-1") else {
            panic!("first turn must start");
        };
        let Admission::Queued(second) = queue.admit("conv-1") else {
            panic!("second turn must queue");
        };
        let Admission::Queued(third) = queue.admit("conv-1") else {
            panic!("third turn must queue");
        };
        assert_eq!(queue.waiting_len("conv-1"), 2);
        assert!(queue.is_busy("conv-1"));

        assert_eq!(queue.finish("conv-1", first), Some(second));
        assert_eq!(queue.finish("conv-1", second), Some(third));
        assert_eq!(queue.finish("conv-1", third), None);
        assert!(!queue.is_busy("conv-1"));
    }

    #[test]
    fn conversations_are_independent() {
        let queue = ConversationQueue::new();
        let Admission::Start(_) = queue.admit("conv-1") else {
            panic!("conv-1 must start");
        };
        let Admission::Start(_) = queue.admit("conv-2") else {
            panic!("a busy conversation must not block another");
        };
    }

    #[test]
    fn cancelling_a_queued_turn_does_not_skip_or_stall_successors() {
        let queue = ConversationQueue::new();
        let Admission::Start(first) = queue.admit("conv-1") else {
            panic!("first turn must start");
        };
        let Admission::Queued(second) = queue.admit("conv-1") else {
            panic!("second turn must queue");
        };
        let Admission::Queued(third) = queue.admit("conv-1") else {
            panic!("third turn must queue");
        };

        assert!(queue.cancel_queued("conv-1", second));
        assert!(
            !queue.cancel_queued("conv-1", second),
            "cancel is idempotent"
        );
        assert_eq!(queue.waiting_len("conv-1"), 1);

        assert_eq!(queue.finish("conv-1", first), Some(third));
        assert_eq!(queue.finish("conv-1", third), None);
    }

    #[test]
    fn cancelling_the_active_turn_is_not_a_queue_operation() {
        let queue = ConversationQueue::new();
        let Admission::Start(first) = queue.admit("conv-1") else {
            panic!("first turn must start");
        };
        assert!(!queue.cancel_queued("conv-1", first));
        assert!(queue.is_busy("conv-1"));
        assert_eq!(queue.finish("conv-1", first), None);
    }

    #[test]
    fn duplicate_completion_does_not_start_a_second_turn() {
        let queue = ConversationQueue::new();
        let Admission::Start(first) = queue.admit("conv-1") else {
            panic!("first turn must start");
        };
        let Admission::Queued(second) = queue.admit("conv-1") else {
            panic!("second turn must queue");
        };
        assert_eq!(queue.finish("conv-1", first), Some(second));
        assert_eq!(
            queue.finish("conv-1", first),
            None,
            "a stale completion must be a no-op"
        );
    }

    #[test]
    fn cancellation_after_start_is_level_triggered() {
        let token = CancelToken::new();
        token.cancel();
        assert!(token.is_cancelled());
        // Re-cancelling stays cancelled rather than toggling.
        token.cancel();
        assert!(token.is_cancelled());
    }
}
