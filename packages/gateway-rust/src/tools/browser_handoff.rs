//! Native port of the pure half of `packages/gateway/src/tools/browser-handoff.ts`.
//!
//! # What was ported (transport-free)
//! - Input dispatch: `requestId` (truthy ⇒ resume) vs `message` (new handoff).
//! - Instruction validation (`js_trim`, 1..=2000 UTF-16 code units).
//! - The `pending` registry: session+user ownership, insertion-order dedupe/resume.
//! - The decision table after the user answers: `done` / `unable` / `cancelled` /
//!   `browser_changed`, including ownership-transfer bookkeeping.
//! - Cancellation: abort ⇒ cancel the pending question ⇒ `cancelled` result.
//! - The 15 s "still waiting" progress heartbeat.
//!
//! # What was NOT ported, and cannot be without a driver
//! The reference reads `preview.get(sessionId)` returning
//! `{status, browserId, url, createdAt}` and calls `getSessionByPreviewSessionId`.
//! The native preview service models a *dev-server preview*
//! (`OwnedPreview { session_id, generation, status, shared_with_agent, last_error, logs }`)
//! and carries no `browser_id`, `url` or `created_at`, because the native browser
//! surface has no production driver, no supervised Playwright transport and no
//! effect authority. Those reads are therefore injected as [`PreviewPort`] and are
//! deliberately **unimplemented** here — no stub returns a fake "ready" browser.
//! A host must supply a real port once a browser session record exists natively.
//!
//! Wiring that does exist: [`QuestionsPort`] is implemented for the real
//! [`UserQuestionService`], and `routes/user_questions.rs` already normalises client
//! answers into the exact shape read below (`{selected: [..], freeText, skipped}`).

use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Map, Value, json};
use tokio::sync::Notify;

use crate::services::input_requests::{QuestionInput, UserQuestionService, WaitOutcome};

pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;
pub type OutputFn = Arc<dyn Fn(&str) + Send + Sync>;

/// `setInterval(..., 15_000)`.
pub const PROGRESS_INTERVAL: Duration = Duration::from_millis(15_000);
pub const PROGRESS_MESSAGE: &str = "Waiting for your browser response…\n";
/// The reference limits on JS `String.prototype.length`, i.e. UTF-16 code units.
pub const MAX_MESSAGE_LEN: usize = 2000;
pub const MAX_REASON_LEN: usize = 2000;
pub const REQUESTED_BY: &str = "browser.handoff";
pub const HANDOFF_TITLE: &str = "Waiting for you in the browser";
pub const QUESTION_ID: &str = "browser";
pub const QUESTION_HEADER: &str = "Browser";
pub const DONE_LABEL: &str = "Done";
pub const UNABLE_LABEL: &str = "I'm not able to do it";
pub const DONE_DESCRIPTION: &str = "Return browser control to the agent and continue.";
pub const STATUS_READY: &str = "ready";

pub const MSG_NOT_FOUND: &str = "Browser handoff not found for this user and session.";
pub const MSG_RESUME_ONLY_REQUEST_ID: &str = "Resume with only requestId.";
pub const MSG_CANCELLED: &str = "Cancelled";
pub const MSG_INVALID_INSTRUCTIONS: &str =
    "Provide browser instructions between 1 and 2000 characters.";
pub const MSG_NO_LIVE_BROWSER: &str =
    "No live browser is available in this chat. Open a browser before handing control to the user.";
pub const MSG_CANCELLED_HANDOFF: &str =
    "Browser handoff cancelled. Browser control remains with the user.";
pub const MSG_UNABLE: &str = "The user is not able to complete the browser step. Browser control remains with the user. Help them or find another approach.";
pub const MSG_BROWSER_CHANGED: &str = "The user finished, but the browser changed or stopped. Control was not transferred. Open the current browser before continuing.";
pub const MSG_DONE: &str = "The user clicked Done and returned browser control to the agent. Verify the page before continuing.";

/// JS `String.prototype.trim`: Unicode whitespace plus `\u{FEFF}`, which Rust's
/// `str::trim` does not strip (the repo already needs this in `routes/user_questions.rs`).
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// JS `s.slice(0, max)` measured in UTF-16 code units. Where JS would keep a lone
/// surrogate, Rust `String` cannot, so it becomes U+FFFD.
fn utf16_truncate(s: &str, max: usize) -> String {
    let units: Vec<u16> = s.encode_utf16().take(max).collect();
    String::from_utf16_lossy(&units)
}

/// JS truthiness, used for `!answer?.skipped` and `!answer?.freeText`.
fn js_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn non_empty(v: &Option<String>) -> bool {
    matches!(v, Some(s) if !s.is_empty())
}

/// Cancellation seam. The reference uses `AbortSignal`; this is the equivalent
/// one-way token (`cancel()` is idempotent, the future resolves immediately if the
/// token was already cancelled).
#[derive(Clone, Default)]
pub struct CancelToken {
    inner: Arc<CancelInner>,
}

#[derive(Default)]
struct CancelInner {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.inner.cancelled.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.cancelled.load(Ordering::SeqCst)
    }

    pub fn cancelled(&self) -> BoxFuture<'static, ()> {
        let inner = self.inner.clone();
        Box::pin(async move {
            loop {
                if inner.cancelled.load(Ordering::SeqCst) {
                    return;
                }
                // Register before re-checking so a `cancel()` between the two cannot
                // be lost (`notify_waiters` only wakes already-registered waiters).
                let notified = inner.notify.notified();
                if inner.cancelled.load(Ordering::SeqCst) {
                    return;
                }
                notified.await;
            }
        })
    }
}

/// The live-browser record the reference reads off the preview service.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BrowserPreview {
    pub status: String,
    pub browser_id: Option<String>,
    pub url: Option<String>,
    pub created_at: String,
}

impl BrowserPreview {
    pub fn ready(browser_id: &str, url: &str, created_at: &str) -> Self {
        Self {
            status: STATUS_READY.to_string(),
            browser_id: Some(browser_id.to_string()),
            url: Some(url.to_string()),
            created_at: created_at.to_string(),
        }
    }

    /// `status === "ready" && !!browserId && !!url` — empty strings are falsy in JS.
    fn is_live(&self) -> bool {
        self.status == STATUS_READY && non_empty(&self.browser_id) && non_empty(&self.url)
    }
}

/// Injected seam over the preview/browser session store.
///
/// No production implementation exists natively: the browser surface has no driver,
/// so nothing can answer `get()` with a real `{status, browserId, url, createdAt}`.
pub trait PreviewPort: Send + Sync {
    fn get(&self, session_id: &str) -> Option<BrowserPreview>;
    fn set_shared_with_agent(&self, session_id: &str, shared: bool);
    fn session_by_preview_session_id(&self, session_id: &str) -> Option<Value>;
}

/// Injected seam over the user-question service.
pub trait QuestionsPort: Send + Sync {
    fn start_resumable(&self, input: QuestionInput) -> String;
    fn cancel(&self, request_id: &str, user_id: Option<&str>) -> bool;
    fn wait_for_answer<'a>(
        &'a self,
        request_id: &'a str,
        session_id: &'a str,
        user_id: Option<&'a str>,
    ) -> BoxFuture<'a, WaitOutcome>;
}

/// The reference passes `{ yieldAfterMs: null }`: wait with **no** timeout.
impl QuestionsPort for UserQuestionService {
    fn start_resumable(&self, input: QuestionInput) -> String {
        UserQuestionService::start_resumable(self, input)
    }

    fn cancel(&self, request_id: &str, user_id: Option<&str>) -> bool {
        UserQuestionService::cancel(self, request_id, user_id)
    }

    fn wait_for_answer<'a>(
        &'a self,
        request_id: &'a str,
        session_id: &'a str,
        user_id: Option<&'a str>,
    ) -> BoxFuture<'a, WaitOutcome> {
        Box::pin(async move {
            self.wait_for_answer_with_timeout(request_id, session_id, user_id, None)
                .await
        })
    }
}

/// Injected progress clock, so the 15 s heartbeat is testable without real sleeps.
pub trait Ticker: Send + Sync {
    fn tick(&self) -> BoxFuture<'static, ()>;
}

pub struct IntervalTicker {
    pub period: Duration,
}

impl Default for IntervalTicker {
    fn default() -> Self {
        Self {
            period: PROGRESS_INTERVAL,
        }
    }
}

impl Ticker for IntervalTicker {
    fn tick(&self) -> BoxFuture<'static, ()> {
        let period = self.period;
        Box::pin(async move { tokio::time::sleep(period).await })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingHandoff {
    pub session_id: String,
    pub user_id: Option<String>,
    pub browser_id: String,
    pub created_at: String,
}

pub struct HandoffContext<'a> {
    pub session_id: &'a str,
    pub user_id: Option<&'a str>,
    pub cancel: CancelToken,
    pub output: Option<OutputFn>,
}

impl<'a> HandoffContext<'a> {
    pub fn new(session_id: &'a str, user_id: Option<&'a str>) -> Self {
        Self {
            session_id,
            user_id,
            cancel: CancelToken::new(),
            output: None,
        }
    }

    pub fn with_cancel(mut self, cancel: CancelToken) -> Self {
        self.cancel = cancel;
        self
    }

    pub fn with_output(mut self, output: OutputFn) -> Self {
        self.output = Some(output);
        self
    }
}

/// Mirrors the reference's `ToolResult` (`data` omitted entirely when absent, as
/// `JSON.stringify` drops `undefined`).
#[derive(Clone, Debug, PartialEq)]
pub struct HandoffOutcome {
    pub ok: bool,
    pub message: String,
    pub data: Map<String, Value>,
}

impl HandoffOutcome {
    fn error(message: &str) -> Self {
        Self {
            ok: false,
            message: message.to_string(),
            data: Map::new(),
        }
    }

    fn with_data(ok: bool, message: &str, data: Map<String, Value>) -> Self {
        Self {
            ok,
            message: message.to_string(),
            data,
        }
    }

    pub fn status(&self) -> Option<&str> {
        self.data.get("status").and_then(Value::as_str)
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.data.get(key)
    }

    pub fn to_value(&self) -> Value {
        let mut out = Map::new();
        out.insert("ok".into(), Value::Bool(self.ok));
        out.insert("message".into(), Value::String(self.message.clone()));
        if !self.data.is_empty() {
            out.insert("data".into(), Value::Object(self.data.clone()));
        }
        Value::Object(out)
    }
}

pub struct BrowserHandoffTool {
    preview: Arc<dyn PreviewPort>,
    questions: Arc<dyn QuestionsPort>,
    ticker: Arc<dyn Ticker>,
    /// Insertion-ordered, exactly like the JS `Map` iterated by the dedupe scan.
    pending: Mutex<Vec<(String, PendingHandoff)>>,
}

impl BrowserHandoffTool {
    pub fn new(
        preview: Arc<dyn PreviewPort>,
        questions: Arc<dyn QuestionsPort>,
        ticker: Arc<dyn Ticker>,
    ) -> Self {
        Self {
            preview,
            questions,
            ticker,
            pending: Mutex::new(Vec::new()),
        }
    }

    /// Production wiring: real 15 s heartbeat.
    pub fn with_default_ticker(
        preview: Arc<dyn PreviewPort>,
        questions: Arc<dyn QuestionsPort>,
    ) -> Self {
        Self::new(preview, questions, Arc::new(IntervalTicker::default()))
    }

    pub fn pending_len(&self) -> usize {
        self.pending.lock().unwrap().len()
    }

    pub fn pending_request_ids(&self) -> Vec<String> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .map(|(id, _)| id.clone())
            .collect()
    }

    pub async fn execute(&self, input: &Value, ctx: &HandoffContext<'_>) -> HandoffOutcome {
        // `if (input.requestId)` — truthiness, so `requestId: ""` falls through to a
        // *new* handoff rather than a resume of the empty id.
        let request_id = input.get("requestId").and_then(Value::as_str).unwrap_or("");
        if !request_id.is_empty() {
            // `input.message !== undefined` — key presence, so an explicit `null`
            // still counts as "you supplied message".
            if input.get("message").is_some() {
                return HandoffOutcome::error(MSG_RESUME_ONLY_REQUEST_ID);
            }
            let owned = request_id.to_string();
            return self.wait(&owned, ctx).await;
        }

        if ctx.cancel.is_cancelled() {
            return HandoffOutcome::error(MSG_CANCELLED);
        }

        // `input.message?.trim()` — absent/null message is invalid, not a panic.
        let message = match input.get("message").and_then(Value::as_str) {
            Some(raw) => js_trim(raw).to_string(),
            None => String::new(),
        };
        if message.is_empty() || utf16_len(&message) > MAX_MESSAGE_LEN {
            return HandoffOutcome::error(MSG_INVALID_INSTRUCTIONS);
        }

        // One handoff per session+user: resume the first matching pending entry.
        let existing = {
            let pending = self.pending.lock().unwrap();
            pending
                .iter()
                .find(|(_, entry)| {
                    entry.session_id == ctx.session_id && entry.user_id.as_deref() == ctx.user_id
                })
                .map(|(id, _)| id.clone())
        };
        if let Some(existing) = existing {
            return self.wait(&existing, ctx).await;
        }

        // `browser?.status !== "ready" || !browser.browserId || !browser.url`
        let browser = match self.preview.get(ctx.session_id) {
            Some(browser) if browser.is_live() => browser,
            _ => return HandoffOutcome::error(MSG_NO_LIVE_BROWSER),
        };

        // Agent relinquishes control *before* the user is asked.
        self.preview.set_shared_with_agent(ctx.session_id, false);

        let request_id = self.questions.start_resumable(QuestionInput {
            session_id: ctx.session_id.to_string(),
            user_id: ctx.user_id.map(str::to_string),
            requested_by: Some(REQUESTED_BY.to_string()),
            title: Some(HANDOFF_TITLE.to_string()),
            attention: None,
            questions: vec![json!({
                "id": QUESTION_ID,
                "header": QUESTION_HEADER,
                "question": message,
                "allowFreeformInput": true,
                "options": [
                    { "label": DONE_LABEL, "description": DONE_DESCRIPTION },
                    { "label": UNABLE_LABEL }
                ]
            })],
        });

        self.pending.lock().unwrap().push((
            request_id.clone(),
            PendingHandoff {
                session_id: ctx.session_id.to_string(),
                user_id: ctx.user_id.map(str::to_string),
                browser_id: browser.browser_id.clone().unwrap_or_default(),
                created_at: browser.created_at.clone(),
            },
        ));

        self.wait(&request_id, ctx).await
    }

    async fn wait(&self, request_id: &str, ctx: &HandoffContext<'_>) -> HandoffOutcome {
        let entry = {
            let pending = self.pending.lock().unwrap();
            pending
                .iter()
                .find(|(id, _)| id == request_id)
                .map(|(_, entry)| entry.clone())
        };
        // Not-found returns *before* the entry is deleted (the reference behaves the
        // same way: `pending.delete` only runs after the answer has settled).
        let entry = match entry {
            Some(entry)
                if entry.session_id == ctx.session_id
                    && entry.user_id.as_deref() == ctx.user_id =>
            {
                entry
            }
            _ => return HandoffOutcome::error(MSG_NOT_FOUND),
        };

        let mut cancel_issued = false;
        let mut wait_fut = self
            .questions
            .wait_for_answer(request_id, ctx.session_id, ctx.user_id);

        let outcome = loop {
            tokio::select! {
                biased;
                // `if (signal.aborted) abort()` runs before the wait starts: because
                // this arm is polled first and resolves immediately when the token is
                // already cancelled, the question is cancelled before `wait_fut` is
                // ever polled.
                _ = cancel_arm(&ctx.cancel, cancel_issued) => {
                    self.questions.cancel(request_id, ctx.user_id);
                    cancel_issued = true;
                }
                settled = &mut wait_fut => break settled,
                _ = self.ticker.tick() => {
                    if let Some(output) = ctx.output.as_ref() {
                        output(PROGRESS_MESSAGE);
                    }
                }
            }
        };

        // `pending.delete(requestId)` — runs once the answer settled, before branching.
        self.pending
            .lock()
            .unwrap()
            .retain(|(id, _)| id != request_id);

        // `outcome.status !== "answered" || !outcome.result`
        let result = match outcome {
            WaitOutcome::Answered(Some(result)) => result,
            // `Missing`/`Pending`/`Answered(None)` all mean "no answer": the user's
            // cancel left control with the user.
            _ => {
                let mut data = Map::new();
                data.insert("status".into(), json!("cancelled"));
                data.insert("browserId".into(), json!(entry.browser_id));
                return HandoffOutcome::with_data(false, MSG_CANCELLED_HANDOFF, data);
            }
        };

        let answer = result
            .get("answers")
            .and_then(|answers| answers.get(QUESTION_ID));
        let selected: Vec<&str> = answer
            .and_then(|a| a.get("selected"))
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        let skipped = answer
            .and_then(|a| a.get("skipped"))
            .map(js_truthy)
            .unwrap_or(false);
        let free_text_truthy = answer
            .and_then(|a| a.get("freeText"))
            .map(js_truthy)
            .unwrap_or(false);

        // `!answer?.skipped && !answer?.freeText && selected.length === 1 && selected[0] === "Done"`
        let done =
            !skipped && !free_text_truthy && selected.len() == 1 && selected[0] == DONE_LABEL;

        if !done {
            let mut data = Map::new();
            data.insert("status".into(), json!("unable"));
            data.insert("browserId".into(), json!(entry.browser_id));
            // `answer?.freeText?.trim().slice(0, 2000) || undefined`
            let reason = answer
                .and_then(|a| a.get("freeText"))
                .and_then(Value::as_str)
                .map(js_trim)
                .filter(|s| !s.is_empty())
                .map(|s| utf16_truncate(s, MAX_REASON_LEN));
            if let Some(reason) = reason {
                data.insert("reason".into(), json!(reason));
            }
            return HandoffOutcome::with_data(true, MSG_UNABLE, data);
        }

        // Ownership transfer is only valid against *this* browser instance.
        let unchanged = match self.preview.get(ctx.session_id) {
            Some(current) => {
                current.status == STATUS_READY
                    && current.browser_id.as_deref() == Some(entry.browser_id.as_str())
                    && current.created_at == entry.created_at
            }
            None => false,
        };
        if !unchanged {
            let mut data = Map::new();
            data.insert("status".into(), json!("browser_changed"));
            return HandoffOutcome::with_data(false, MSG_BROWSER_CHANGED, data);
        }

        self.preview.set_shared_with_agent(ctx.session_id, true);

        let mut data = Map::new();
        data.insert("status".into(), json!("done"));
        data.insert("browserId".into(), json!(entry.browser_id));
        // `browserSession: preview.getSessionByPreviewSessionId(...)` — an undefined
        // value loses the key entirely under JSON.stringify.
        if let Some(session) = self.preview.session_by_preview_session_id(ctx.session_id) {
            data.insert("browserSession".into(), session);
        }
        HandoffOutcome::with_data(true, MSG_DONE, data)
    }
}

/// The cancel arm: once handled it must stop firing, or the loop would spin.
async fn cancel_arm(token: &CancelToken, already_handled: bool) {
    if already_handled {
        std::future::pending::<()>().await;
    } else {
        token.cancelled().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    type Log = Arc<Mutex<Vec<String>>>;

    #[derive(Default)]
    struct Gate {
        opened: AtomicBool,
        notify: Notify,
    }

    impl Gate {
        fn open(&self) {
            self.opened.store(true, Ordering::SeqCst);
            self.notify.notify_waiters();
        }

        async fn wait(&self) {
            loop {
                if self.opened.load(Ordering::SeqCst) {
                    return;
                }
                let notified = self.notify.notified();
                if self.opened.load(Ordering::SeqCst) {
                    return;
                }
                notified.await;
            }
        }
    }

    struct FakePreview {
        current: Mutex<Option<BrowserPreview>>,
        shared: Mutex<Vec<(String, bool)>>,
        session: Mutex<Option<Value>>,
        log: Log,
    }

    impl FakePreview {
        fn new(current: Option<BrowserPreview>, log: Log) -> Self {
            Self {
                current: Mutex::new(current),
                shared: Mutex::new(Vec::new()),
                session: Mutex::new(Some(Value::String("pw-session-1".into()))),
                log,
            }
        }

        fn shared_calls(&self) -> Vec<(String, bool)> {
            self.shared.lock().unwrap().clone()
        }
    }

    impl PreviewPort for FakePreview {
        fn get(&self, _session_id: &str) -> Option<BrowserPreview> {
            self.current.lock().unwrap().clone()
        }

        fn set_shared_with_agent(&self, session_id: &str, shared: bool) {
            self.log.lock().unwrap().push(format!("shared:{shared}"));
            self.shared
                .lock()
                .unwrap()
                .push((session_id.to_string(), shared));
        }

        fn session_by_preview_session_id(&self, _session_id: &str) -> Option<Value> {
            self.session.lock().unwrap().clone()
        }
    }

    #[derive(Clone)]
    enum Behavior {
        /// Resolve immediately with this answer object.
        Answer(Value),
        /// Resolve immediately as `Answered(None)` (settled without a result).
        SettledNull,
        Missing,
        /// Stay pending until the gate opens, then resolve with this answer.
        Gate(Option<Value>),
    }

    struct FakeQuestions {
        behavior: Behavior,
        gate: Arc<Gate>,
        started: Mutex<Vec<QuestionInput>>,
        cancels: Mutex<Vec<(String, Option<String>)>>,
        waits: Mutex<Vec<String>>,
        next: AtomicUsize,
        log: Log,
    }

    impl FakeQuestions {
        fn new(behavior: Behavior, gate: Arc<Gate>, log: Log) -> Self {
            Self {
                behavior,
                gate,
                started: Mutex::new(Vec::new()),
                cancels: Mutex::new(Vec::new()),
                waits: Mutex::new(Vec::new()),
                next: AtomicUsize::new(0),
                log,
            }
        }

        fn started(&self) -> std::sync::MutexGuard<'_, Vec<QuestionInput>> {
            self.started.lock().unwrap()
        }

        fn cancels(&self) -> Vec<(String, Option<String>)> {
            self.cancels.lock().unwrap().clone()
        }

        fn waits(&self) -> Vec<String> {
            self.waits.lock().unwrap().clone()
        }
    }

    impl QuestionsPort for FakeQuestions {
        fn start_resumable(&self, input: QuestionInput) -> String {
            self.log.lock().unwrap().push("start_resumable".into());
            self.started.lock().unwrap().push(input);
            let n = self.next.fetch_add(1, Ordering::SeqCst) + 1;
            format!("req-{n}")
        }

        fn cancel(&self, request_id: &str, user_id: Option<&str>) -> bool {
            self.log.lock().unwrap().push("cancel".into());
            self.cancels
                .lock()
                .unwrap()
                .push((request_id.to_string(), user_id.map(str::to_string)));
            self.gate.open();
            true
        }

        fn wait_for_answer<'a>(
            &'a self,
            request_id: &'a str,
            _session_id: &'a str,
            _user_id: Option<&'a str>,
        ) -> BoxFuture<'a, WaitOutcome> {
            self.waits.lock().unwrap().push(request_id.to_string());
            let behavior = self.behavior.clone();
            let gate = self.gate.clone();
            Box::pin(async move {
                match behavior {
                    Behavior::Answer(value) => WaitOutcome::Answered(Some(value)),
                    Behavior::SettledNull => WaitOutcome::Answered(None),
                    Behavior::Missing => WaitOutcome::Missing,
                    Behavior::Gate(value) => {
                        gate.wait().await;
                        WaitOutcome::Answered(value)
                    }
                }
            })
        }
    }

    struct NeverTicker;

    impl Ticker for NeverTicker {
        fn tick(&self) -> BoxFuture<'static, ()> {
            Box::pin(std::future::pending())
        }
    }

    struct OnceTicker {
        fired: AtomicBool,
    }

    impl OnceTicker {
        fn new() -> Self {
            Self {
                fired: AtomicBool::new(false),
            }
        }
    }

    impl Ticker for OnceTicker {
        fn tick(&self) -> BoxFuture<'static, ()> {
            if self.fired.swap(true, Ordering::SeqCst) {
                Box::pin(std::future::pending())
            } else {
                Box::pin(async {})
            }
        }
    }

    /// Cancels the handoff on the first tick, then stays pending forever. This lets a
    /// test drive cancellation from inside the wait loop with no spawned task and no
    /// timer, so the ordering against `wait_for_answer` is deterministic.
    struct CancelTickTicker {
        token: CancelToken,
        fired: AtomicBool,
    }

    impl Ticker for CancelTickTicker {
        fn tick(&self) -> BoxFuture<'static, ()> {
            if self.fired.swap(true, Ordering::SeqCst) {
                Box::pin(std::future::pending())
            } else {
                self.token.cancel();
                Box::pin(async {})
            }
        }
    }

    struct Harness {
        tool: BrowserHandoffTool,
        preview: Arc<FakePreview>,
        questions: Arc<FakeQuestions>,
        gate: Arc<Gate>,
        log: Log,
    }

    fn harness(browser: Option<BrowserPreview>, behavior: Behavior) -> Harness {
        harness_with_ticker(browser, behavior, Arc::new(NeverTicker))
    }

    fn harness_with_ticker(
        browser: Option<BrowserPreview>,
        behavior: Behavior,
        ticker: Arc<dyn Ticker>,
    ) -> Harness {
        let log: Log = Arc::new(Mutex::new(Vec::new()));
        let gate = Arc::new(Gate::default());
        let preview = Arc::new(FakePreview::new(browser, log.clone()));
        let questions = Arc::new(FakeQuestions::new(behavior, gate.clone(), log.clone()));
        let tool = BrowserHandoffTool::new(preview.clone(), questions.clone(), ticker);
        Harness {
            tool,
            preview,
            questions,
            gate,
            log,
        }
    }

    fn live_browser() -> Option<BrowserPreview> {
        Some(BrowserPreview::ready(
            "browser-1",
            "http://localhost:3000",
            "2024-01-01T00:00:00Z",
        ))
    }

    fn answer(selected: &[&str], free_text: Option<&str>, skipped: bool) -> Value {
        json!({
            "answers": {
                (QUESTION_ID): {
                    "selected": selected,
                    "freeText": free_text,
                    "skipped": skipped,
                }
            }
        })
    }

    fn done_answer() -> Value {
        answer(&[DONE_LABEL], None, false)
    }

    fn seed(tool: &BrowserHandoffTool, id: &str, session: &str, user: Option<&str>) {
        tool.pending.lock().unwrap().push((
            id.to_string(),
            PendingHandoff {
                session_id: session.to_string(),
                user_id: user.map(str::to_string),
                browser_id: "browser-1".into(),
                created_at: "2024-01-01T00:00:00Z".into(),
            },
        ));
    }

    #[tokio::test]
    async fn rejects_missing_blank_and_whitespace_instructions() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));

        for input in [
            json!({}),
            json!({ "message": null }),
            json!({ "message": 42 }),
            json!({ "message": "" }),
            json!({ "message": "   " }),
            json!({ "message": " \n\t\u{feff}\u{a0} " }),
        ] {
            let outcome = h.tool.execute(&input, &ctx).await;
            assert!(!outcome.ok, "expected rejection for {input}");
            assert_eq!(outcome.message, MSG_INVALID_INSTRUCTIONS);
            assert!(outcome.data.is_empty(), "error results carry no data");
        }
        assert_eq!(h.questions.started().len(), 0);
        assert_eq!(h.preview.shared_calls().len(), 0);
    }

    #[tokio::test]
    async fn instruction_length_is_measured_in_utf16_units() {
        // 2000 ASCII chars is the inclusive upper bound: accepted, then rejected only
        // because there is no live browser.
        let h = harness(None, Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));

        let ok = h
            .tool
            .execute(&json!({ "message": "a".repeat(2000) }), &ctx)
            .await;
        assert_eq!(ok.message, MSG_NO_LIVE_BROWSER);

        let long = h
            .tool
            .execute(&json!({ "message": "a".repeat(2001) }), &ctx)
            .await;
        assert_eq!(long.message, MSG_INVALID_INSTRUCTIONS);

        // Trimming happens before measuring: padding does not consume budget.
        let padded = h
            .tool
            .execute(
                &json!({ "message": format!("  {}  ", "a".repeat(2000)) }),
                &ctx,
            )
            .await;
        assert_eq!(padded.message, MSG_NO_LIVE_BROWSER);

        // An emoji is two UTF-16 units, so 1000 emoji == 2000 units and 1001 > 2000.
        let emoji_ok = h
            .tool
            .execute(&json!({ "message": "🙂".repeat(1000) }), &ctx)
            .await;
        assert_eq!(emoji_ok.message, MSG_NO_LIVE_BROWSER);
        let emoji_long = h
            .tool
            .execute(&json!({ "message": "🙂".repeat(1001) }), &ctx)
            .await;
        assert_eq!(emoji_long.message, MSG_INVALID_INSTRUCTIONS);
    }

    #[tokio::test]
    async fn resume_rejects_a_message_key_even_when_null() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));
        seed(&h.tool, "req-existing", "s1", Some("u1"));

        // `!== undefined`: an explicit null still counts as "you supplied message".
        let outcome = h
            .tool
            .execute(
                &json!({ "requestId": "req-existing", "message": null }),
                &ctx,
            )
            .await;
        assert!(!outcome.ok);
        assert_eq!(outcome.message, MSG_RESUME_ONLY_REQUEST_ID);
        assert_eq!(h.questions.waits().len(), 0);

        // Omitting the key resumes.
        let resumed = h
            .tool
            .execute(&json!({ "requestId": "req-existing" }), &ctx)
            .await;
        assert!(resumed.ok);
        assert_eq!(resumed.status(), Some("done"));
        assert_eq!(h.questions.waits(), vec!["req-existing".to_string()]);
    }

    #[tokio::test]
    async fn empty_request_id_falls_through_to_a_new_handoff() {
        let h = harness(None, Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));

        // JS truthiness: "" is falsy, so this is *not* a resume; it fails on message.
        let outcome = h.tool.execute(&json!({ "requestId": "" }), &ctx).await;
        assert_eq!(outcome.message, MSG_INVALID_INSTRUCTIONS);

        let outcome = h.tool.execute(&json!({ "requestId": "" }), &ctx).await;
        assert_eq!(outcome.message, MSG_INVALID_INSTRUCTIONS);
    }

    #[tokio::test]
    async fn requires_a_live_browser_before_relinquishing_control() {
        let ctx = HandoffContext::new("s1", Some("u1"));
        let input = json!({ "message": "open the cart" });

        let missing = harness(None, Behavior::Answer(done_answer()));
        let not_ready = harness(
            Some(BrowserPreview {
                status: "starting".into(),
                ..BrowserPreview::ready("browser-1", "http://x", "t0")
            }),
            Behavior::Answer(done_answer()),
        );
        let no_id = harness(
            Some(BrowserPreview {
                browser_id: Some(String::new()),
                ..BrowserPreview::ready("browser-1", "http://x", "t0")
            }),
            Behavior::Answer(done_answer()),
        );
        let no_url = harness(
            Some(BrowserPreview {
                url: None,
                ..BrowserPreview::ready("browser-1", "http://x", "t0")
            }),
            Behavior::Answer(done_answer()),
        );

        for h in [&missing, &not_ready, &no_id, &no_url] {
            let outcome = h.tool.execute(&input, &ctx).await;
            assert!(!outcome.ok);
            assert_eq!(outcome.message, MSG_NO_LIVE_BROWSER);
            // Control is only relinquished for a genuinely live browser.
            assert_eq!(h.preview.shared_calls().len(), 0);
            assert_eq!(h.questions.started().len(), 0);
        }
    }

    #[tokio::test]
    async fn new_handoff_relinquishes_control_then_asks_the_user() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));

        let outcome = h
            .tool
            .execute(&json!({ "message": "  open the cart  " }), &ctx)
            .await;

        // Ordering: control is relinquished before the question is created, and only
        // handed back once the user answers "Done" (reference line 47).
        assert_eq!(
            h.log.lock().unwrap().clone(),
            vec![
                "shared:false".to_string(),
                "start_resumable".to_string(),
                "shared:true".to_string()
            ]
        );
        assert_eq!(
            h.preview.shared_calls(),
            vec![("s1".to_string(), false), ("s1".to_string(), true)]
        );

        let started = h.questions.started();
        assert_eq!(started.len(), 1);
        assert_eq!(started[0].session_id, "s1");
        assert_eq!(started[0].user_id.as_deref(), Some("u1"));
        assert_eq!(started[0].requested_by.as_deref(), Some(REQUESTED_BY));
        assert_eq!(started[0].title.as_deref(), Some(HANDOFF_TITLE));

        let question = &started[0].questions[0];
        assert_eq!(question["id"], json!(QUESTION_ID));
        assert_eq!(question["header"], json!(QUESTION_HEADER));
        assert_eq!(question["question"], json!("open the cart"));
        assert_eq!(question["allowFreeformInput"], json!(true));
        assert_eq!(
            question["options"],
            json!([
                { "label": DONE_LABEL, "description": DONE_DESCRIPTION },
                { "label": UNABLE_LABEL }
            ])
        );

        // A granted handoff transfers control back and reports the browser session.
        assert!(outcome.ok);
        assert_eq!(outcome.message, MSG_DONE);
        assert_eq!(outcome.to_value()["data"]["status"], json!("done"));
        assert_eq!(outcome.to_value()["data"]["browserId"], json!("browser-1"));
        assert_eq!(
            outcome.to_value()["data"]["browserSession"],
            json!("pw-session-1")
        );
        assert_eq!(
            h.preview.shared_calls(),
            vec![("s1".to_string(), false), ("s1".to_string(), true)]
        );
        // The request is not tracked any more.
        assert_eq!(h.tool.pending_len(), 0);
    }

    #[tokio::test]
    async fn unanswered_question_leaves_control_with_the_user() {
        let h = harness(
            live_browser(),
            Behavior::Answer(answer(&[UNABLE_LABEL], None, false)),
        );
        let ctx = HandoffContext::new("s1", Some("u1"));

        let outcome = h
            .tool
            .execute(&json!({ "message": "open the cart" }), &ctx)
            .await;

        assert!(outcome.ok);
        assert_eq!(outcome.message, MSG_UNABLE);
        assert_eq!(outcome.status(), Some("unable"));
        assert_eq!(outcome.get("browserId"), Some(&json!("browser-1")));
        // No free text => `reason` stays `undefined` and the key is dropped.
        assert!(outcome.get("reason").is_none());
        assert!(
            !outcome.to_value()["data"]
                .as_object()
                .unwrap()
                .contains_key("reason")
        );
        // Control is NOT taken back.
        assert_eq!(h.preview.shared_calls(), vec![("s1".to_string(), false)]);
        assert_eq!(h.tool.pending_len(), 0);
    }

    #[tokio::test]
    async fn unable_reason_is_trimmed_truncated_and_omitted_when_blank() {
        let ctx = HandoffContext::new("s1", Some("u1"));

        let trimmed = harness(
            live_browser(),
            Behavior::Answer(answer(
                &[UNABLE_LABEL],
                Some("  the button is disabled  "),
                false,
            )),
        );
        let outcome = trimmed
            .tool
            .execute(&json!({ "message": "go" }), &ctx)
            .await;
        assert_eq!(
            outcome.get("reason"),
            Some(&json!("the button is disabled"))
        );

        let long = harness(
            live_browser(),
            Behavior::Answer(answer(&[UNABLE_LABEL], Some(&"x".repeat(2500)), false)),
        );
        let outcome = long.tool.execute(&json!({ "message": "go" }), &ctx).await;
        assert_eq!(outcome.get("reason").unwrap().as_str().unwrap().len(), 2000);

        let blank = harness(
            live_browser(),
            Behavior::Answer(answer(&[UNABLE_LABEL], Some("   "), false)),
        );
        let outcome = blank.tool.execute(&json!({ "message": "go" }), &ctx).await;
        assert_eq!(outcome.status(), Some("unable"));
        assert!(outcome.get("reason").is_none());
    }

    #[tokio::test]
    async fn done_is_only_done_for_a_single_bare_done_selection() {
        let ctx = HandoffContext::new("s1", Some("u1"));
        let cases = [
            answer(&[DONE_LABEL], Some("but I also typed this"), false),
            answer(&[DONE_LABEL, DONE_LABEL], None, false),
            answer(&[], None, false),
            answer(&[DONE_LABEL], None, true),
            answer(&["done"], None, false),
        ];

        for case in cases {
            let h = harness(live_browser(), Behavior::Answer(case.clone()));
            let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;
            assert!(outcome.ok, "unable is still a successful tool call");
            assert_eq!(outcome.status(), Some("unable"), "case: {case}");
            // Control was never taken back.
            assert_eq!(h.preview.shared_calls(), vec![("s1".to_string(), false)]);
        }
    }

    #[tokio::test]
    async fn done_after_the_browser_changed_does_not_transfer_control() {
        let ctx = HandoffContext::new("s1", Some("u1"));

        let replacements = [
            None,
            Some(BrowserPreview {
                status: "closed".into(),
                ..BrowserPreview::ready(
                    "browser-1",
                    "http://localhost:3000",
                    "2024-01-01T00:00:00Z",
                )
            }),
            Some(BrowserPreview::ready(
                "browser-2",
                "http://localhost:3000",
                "2024-01-01T00:00:00Z",
            )),
            Some(BrowserPreview::ready(
                "browser-1",
                "http://localhost:3000",
                "2024-01-01T00:00:01Z",
            )),
        ];

        for replacement in replacements {
            // The browser changes while the handoff is pending (reload, second tab,
            // closed). Resuming keeps the recorded browser-1 / t0 and re-reads the live
            // browser only when the user answers "Done".
            let h = harness(replacement.clone(), Behavior::Answer(done_answer()));
            seed(&h.tool, "req-existing", "s1", Some("u1"));
            let outcome = h
                .tool
                .execute(&json!({ "requestId": "req-existing" }), &ctx)
                .await;
            assert!(!outcome.ok, "case: {replacement:?}");
            assert_eq!(outcome.message, MSG_BROWSER_CHANGED);
            assert_eq!(outcome.status(), Some("browser_changed"));
            // Resuming never relinquishes again and never transfers control.
            assert_eq!(h.preview.shared_calls().len(), 0, "case: {replacement:?}");
            assert_eq!(h.tool.pending_len(), 0);
        }
    }

    #[tokio::test]
    async fn already_cancelled_request_returns_plain_cancelled_without_side_effects() {
        let h = harness(live_browser(), Behavior::Gate(None));
        let token = CancelToken::new();
        token.cancel();
        let ctx = HandoffContext::new("s1", Some("u1")).with_cancel(token);

        let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;

        // The reference bails out before starting a question, so this is the plain
        // "Cancelled" error rather than the waiting path's handoff-cancelled shape.
        assert!(!outcome.ok);
        assert_eq!(outcome.message, MSG_CANCELLED);
        assert_eq!(outcome.status(), None);
        assert!(outcome.data.is_empty());
        assert_eq!(outcome.get("browserId"), None);
        assert_eq!(h.preview.shared_calls().len(), 0);
        assert!(h.questions.cancels().is_empty());
        assert!(h.questions.started().is_empty());
        assert_eq!(h.tool.pending_len(), 0);
    }

    #[tokio::test]
    async fn cancellation_during_wait_settles_as_cancelled() {
        let token = CancelToken::new();
        // The heartbeat seam doubles as the cancel trigger: it fires exactly once,
        // after the wait has been registered, and never again.
        let ticker = Arc::new(CancelTickTicker {
            token: token.clone(),
            fired: AtomicBool::new(false),
        });
        let h = harness_with_ticker(live_browser(), Behavior::Gate(None), ticker);
        let ctx = HandoffContext::new("s1", Some("u1")).with_cancel(token);

        let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;

        assert!(!outcome.ok);
        assert_eq!(outcome.status(), Some("cancelled"));
        assert_eq!(
            h.questions.cancels(),
            vec![("req-1".to_string(), Some("u1".to_string()))]
        );
        assert_eq!(h.tool.pending_len(), 0);
    }

    #[tokio::test]
    async fn a_settled_request_without_a_result_is_a_cancellation() {
        let ctx = HandoffContext::new("s1", Some("u1"));

        for behavior in [Behavior::SettledNull, Behavior::Missing] {
            let h = harness(live_browser(), behavior);
            let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;
            assert!(!outcome.ok);
            assert_eq!(outcome.message, MSG_CANCELLED_HANDOFF);
            assert_eq!(outcome.status(), Some("cancelled"));
            // A user-driven settle is not a tool cancellation.
            assert_eq!(h.questions.cancels().len(), 0);
            assert_eq!(h.tool.pending_len(), 0);
        }
    }

    #[tokio::test]
    async fn heartbeat_emits_the_waiting_message_and_is_idempotent_per_tick() {
        let h = harness_with_ticker(
            live_browser(),
            Behavior::Gate(Some(done_answer())),
            Arc::new(OnceTicker::new()),
        );
        let messages: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let gate = h.gate.clone();
        let sink = messages.clone();
        let output: OutputFn = Arc::new(move |text: &str| {
            sink.lock().unwrap().push(text.to_string());
            // Unblock the answer only after the heartbeat was observed.
            gate.open();
        });
        let ctx = HandoffContext::new("s1", Some("u1")).with_output(output);

        let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;

        assert!(outcome.ok);
        assert_eq!(outcome.status(), Some("done"));
        assert_eq!(
            messages.lock().unwrap().clone(),
            vec![PROGRESS_MESSAGE.to_string()]
        );
        assert_eq!(PROGRESS_MESSAGE, "Waiting for your browser response…\n");
    }

    #[tokio::test]
    async fn unknown_or_foreign_request_ids_are_not_found_and_are_kept() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));
        seed(&h.tool, "req-1", "s1", Some("u1"));
        seed(&h.tool, "req-2", "s2", Some("u1"));
        seed(&h.tool, "req-3", "s1", Some("u2"));

        let unknown = h
            .tool
            .execute(&json!({ "requestId": "req-404" }), &ctx)
            .await;
        assert!(!unknown.ok);
        assert_eq!(unknown.message, MSG_NOT_FOUND);

        // Same session, different user: not visible.
        let foreign_user = h.tool.execute(&json!({ "requestId": "req-3" }), &ctx).await;
        assert_eq!(foreign_user.message, MSG_NOT_FOUND);

        // Same user, different session: not visible.
        let foreign_session = h.tool.execute(&json!({ "requestId": "req-2" }), &ctx).await;
        assert_eq!(foreign_session.message, MSG_NOT_FOUND);

        // A not-found lookup must not drop the entry.
        assert_eq!(h.tool.pending_len(), 3);
        assert_eq!(h.questions.waits().len(), 0);
    }

    #[tokio::test]
    async fn a_second_message_resumes_the_existing_handoff_instead_of_asking_again() {
        // No preview at all: resuming must reach the dedupe scan without consulting the
        // browser at entry, so the only objection is the Done-time browser re-check.
        let h = harness(None, Behavior::Answer(done_answer()));
        let ctx = HandoffContext::new("s1", Some("u1"));
        seed(&h.tool, "req-existing", "s1", Some("u1"));

        let outcome = h
            .tool
            .execute(
                &json!({ "message": "actually click the second link" }),
                &ctx,
            )
            .await;

        assert_eq!(h.questions.started().len(), 0, "no second question");
        assert_eq!(h.questions.waits(), vec!["req-existing".to_string()]);
        assert_eq!(outcome.message, MSG_BROWSER_CHANGED);
        assert_eq!(
            h.preview.shared_calls().len(),
            0,
            "resume never relinquishes"
        );
        assert_eq!(h.tool.pending_len(), 0);

        // The same resume against a live browser settles as a real Done transfer.
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        seed(&h.tool, "req-existing", "s1", Some("u1"));

        let outcome = h
            .tool
            .execute(
                &json!({ "message": "actually click the second link" }),
                &ctx,
            )
            .await;

        assert_eq!(h.questions.started().len(), 0, "no second question");
        assert_eq!(h.questions.waits(), vec!["req-existing".to_string()]);
        assert_eq!(outcome.status(), Some("done"));
        assert_eq!(outcome.message, MSG_DONE);
        assert_eq!(
            h.preview.shared_calls(),
            vec![("s1".to_string(), true)],
            "Done hands control back without re-relinquishing"
        );
        assert_eq!(h.tool.pending_len(), 0);
    }

    #[tokio::test]
    async fn dedupe_is_scoped_by_session_and_user() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        seed(&h.tool, "req-other-user", "s1", Some("u2"));

        let ctx = HandoffContext::new("s1", Some("u1"));
        let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;

        // A handoff owned by another user does not block u1 from starting one.
        assert_eq!(h.questions.started().len(), 1);
        assert_eq!(outcome.status(), Some("done"));
        assert_eq!(
            h.tool.pending_request_ids(),
            vec!["req-other-user".to_string()]
        );
    }

    #[tokio::test]
    async fn a_user_with_no_user_id_is_matched_by_absence() {
        let h = harness(live_browser(), Behavior::Answer(done_answer()));
        seed(&h.tool, "req-anon", "s1", None);

        let ctx = HandoffContext::new("s1", None);
        let outcome = h.tool.execute(&json!({ "message": "go" }), &ctx).await;

        assert_eq!(h.questions.started().len(), 0);
        assert_eq!(h.questions.waits(), vec!["req-anon".to_string()]);
        assert_eq!(outcome.status(), Some("done"));
    }

    #[test]
    fn trim_truncate_and_length_helpers_match_javascript() {
        assert_eq!(js_trim("  a  "), "a");
        assert_eq!(js_trim("\u{feff}a\u{a0}"), "a");
        assert_eq!(js_trim("\u{2003}a\u{2028}"), "a");
        assert_eq!(utf16_len("a"), 1);
        assert_eq!(utf16_len("🙂"), 2);
        assert_eq!(utf16_len("a🙂"), 3);
        assert_eq!(utf16_truncate("abcdef", 3), "abc");
        assert_eq!(utf16_truncate("abc", 10), "abc");
        // Slice lands mid-surrogate-pair: JS keeps a lone surrogate, Rust cannot.
        assert_eq!(utf16_truncate("a🙂", 2), "a\u{fffd}");
        assert!(js_truthy(&json!("x")));
        assert!(!js_truthy(&json!("")));
        assert!(!js_truthy(&Value::Null));
        assert!(!js_truthy(&json!(false)));
        assert!(js_truthy(&json!([])));
        assert!(!js_truthy(&json!(0)));
    }
}
