//! In-memory user input lifecycles. Callbacks receive metadata, never secret values.
//! Remove under the registry lock, then notify outside it so callbacks may reenter.
use crate::{
    db::identifiers::uuidv7,
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tokio::{
    sync::{oneshot, watch},
    task::AbortHandle,
    time::Duration,
};

pub type Observer = Arc<dyn Fn(InputRequest) + Send + Sync>;
pub type InputResult = Option<Value>;
/// Production resumable wait deadline: TypeScript races the answer against a
/// 60 s timer and treats expiry as `pending`, retaining the request.
pub const RESUME_WAIT_MS: u64 = 60_000;
pub struct InputHandle {
    pub id: String,
    pub result: oneshot::Receiver<InputResult>,
}
/// Shared answer state. `watch` keeps the settled answer observable by every
/// concurrent waiter, like awaiting the same JS promise twice.
#[derive(Clone, Debug)]
pub enum Answer {
    Waiting,
    Settled(InputResult),
}
/// Result of one resumable wait, mirroring `UserQuestionWaitResult`.
#[derive(Clone, Debug, PartialEq)]
pub enum WaitOutcome {
    Pending,
    Missing,
    Answered(InputResult),
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequest {
    pub id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub status: String,
    #[serde(flatten)]
    pub details: serde_json::Map<String, Value>,
}
struct Pending {
    request: InputRequest,
    send: oneshot::Sender<InputResult>,
    timer: Option<AbortHandle>,
    resumable: Option<watch::Sender<Answer>>,
}
struct Registry {
    pending: Mutex<Vec<Pending>>,
    on_request: Observer,
    on_resolved: Observer,
}
impl Registry {
    fn insert(&self, request: InputRequest) -> InputHandle {
        self.insert_with(request, None)
    }
    fn insert_with(
        &self,
        request: InputRequest,
        resumable: Option<watch::Sender<Answer>>,
    ) -> InputHandle {
        let (send, result) = oneshot::channel();
        let id = request.id.clone();
        self.pending.lock().unwrap().push(Pending {
            request,
            send,
            timer: None,
            resumable,
        });
        InputHandle { id, result }
    }
    fn list(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .map(|entry| &entry.request)
            .filter(|r| {
                session
                    .filter(|s| !s.is_empty())
                    .is_none_or(|s| s == r.session_id)
            })
            .filter(|r| {
                user.filter(|s| !s.is_empty()).is_none_or(|u| {
                    r.user_id
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .is_none_or(|owner| owner == u)
                })
            })
            .cloned()
            .collect()
    }
    fn resolve(
        &self,
        id: &str,
        value: InputResult,
        status: &str,
        user: Option<&str>,
        timeout: bool,
    ) -> bool {
        let entry = {
            let mut pending = self.pending.lock().unwrap();
            let Some(index) = pending.iter().position(|e| e.request.id == id) else {
                return false;
            };
            if !timeout
                && pending[index]
                    .request
                    .user_id
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .is_some_and(|owner| Some(owner) != user)
            {
                return false;
            }
            pending.remove(index)
        };
        if let Some(timer) = entry.timer {
            timer.abort();
        }
        let mut request = entry.request;
        request.status = status.into();
        // JS promise reactions run after the synchronous onResolved callback.
        (self.on_resolved)(request);
        // Resumable waiters share one answer; the one-shot receiver may be gone
        // (resumable requests never await their own handle), so ignore its error.
        if let Some(answer) = entry.resumable {
            let _ = answer.send(Answer::Settled(value.clone()));
        }
        let _ = entry.send.send(value);
        true
    }
}
fn registry(on_request: Option<Observer>, on_resolved: Option<Observer>) -> Arc<Registry> {
    Arc::new(Registry {
        pending: Mutex::new(Vec::new()),
        on_request: on_request.unwrap_or_else(|| Arc::new(|_| {})),
        on_resolved: on_resolved.unwrap_or_else(|| Arc::new(|_| {})),
    })
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInput {
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: Option<String>,
    pub attention: Option<String>,
    pub questions: Vec<Value>,
}
struct Resumable {
    request_id: String,
    session_id: String,
    user_id: Option<String>,
    answer: watch::Receiver<Answer>,
    waiters: usize,
    yielded: bool,
}
struct QuestionWaitGuard {
    entries: Arc<Mutex<Vec<Resumable>>>,
    id: String,
}
impl Drop for QuestionWaitGuard {
    fn drop(&mut self) {
        if let Some(entry) = self
            .entries
            .lock()
            .unwrap()
            .iter_mut()
            .find(|e| e.request_id == self.id)
        {
            entry.waiters -= 1;
            entry.yielded = true;
        }
    }
}
#[derive(Clone)]
pub struct UserQuestionService {
    registry: Arc<Registry>,
    resumable: Arc<Mutex<Vec<Resumable>>>,
    clock: Clock,
    resume_wait: Duration,
    on_detached_resolved: Arc<Mutex<Option<Observer>>>,
}
impl Default for UserQuestionService {
    fn default() -> Self {
        Self::new(default_clock(), None, None)
    }
}
impl UserQuestionService {
    pub fn new(clock: Clock, on_request: Option<Observer>, on_resolved: Option<Observer>) -> Self {
        Self::new_with_resume_wait(
            clock,
            Duration::from_millis(RESUME_WAIT_MS),
            on_request,
            on_resolved,
        )
    }
    /// Test seam for the resumable deadline; production constructors always use
    /// [`RESUME_WAIT_MS`].
    pub fn new_with_resume_wait(
        clock: Clock,
        resume_wait: Duration,
        on_request: Option<Observer>,
        on_resolved: Option<Observer>,
    ) -> Self {
        let resumable: Arc<Mutex<Vec<Resumable>>> = Arc::new(Mutex::new(Vec::new()));
        let on_detached_resolved: Arc<Mutex<Option<Observer>>> = Arc::new(Mutex::new(None));
        let entries = resumable.clone();
        let detached = on_detached_resolved.clone();
        let resolved: Observer = Arc::new(move |request| {
            if let Some(callback) = &on_resolved {
                callback(request.clone());
            }
            let should_resume =
                entries.lock().unwrap().iter().any(|entry| {
                    entry.request_id == request.id && entry.yielded && entry.waiters == 0
                });
            let callback = detached.lock().unwrap().clone();
            if should_resume && let Some(callback) = callback {
                callback(request);
            }
        });
        Self {
            registry: registry(on_request, Some(resolved)),
            resumable,
            clock,
            resume_wait,
            on_detached_resolved,
        }
    }
    pub fn set_on_detached_resolved(&self, callback: Option<Observer>) {
        *self.on_detached_resolved.lock().unwrap() = callback;
    }
    pub fn resume_wait(&self) -> Duration {
        self.resume_wait
    }
    fn request(&self, input: QuestionInput) -> InputRequest {
        InputRequest {
            id: uuidv7().to_string(),
            session_id: input.session_id,
            user_id: input.user_id,
            requested_by: input.requested_by,
            title: input
                .title
                .as_deref()
                .map(js_trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("Input requested")
                .into(),
            created_at: iso((self.clock)()).expect("system time must be representable"),
            expires_at: None,
            status: "pending".into(),
            details: serde_json::json!({"attention":if input.attention.as_deref()==Some("urgent") {"urgent"} else {"normal"},
                "questions":input.questions}).as_object().unwrap().clone(),
        }
    }
    pub fn ask(&self, input: QuestionInput) -> InputHandle {
        let request = self.request(input);
        let handle = self.registry.insert(request.clone());
        (self.registry.on_request)(request);
        handle
    }
    /// Creates a request whose answer is retained for repeated waits. The entry
    /// is registered after `onRequest`, matching `createRequest` ordering, and
    /// is dropped only when a wait collects the answer.
    pub fn start_resumable(&self, input: QuestionInput) -> String {
        let request = self.request(input);
        let (answer_send, answer) = watch::channel(Answer::Waiting);
        let handle = self
            .registry
            .insert_with(request.clone(), Some(answer_send));
        (self.registry.on_request)(request.clone());
        self.resumable.lock().unwrap().push(Resumable {
            request_id: request.id,
            session_id: request.session_id,
            user_id: request.user_id,
            answer,
            waiters: 0,
            yielded: false,
        });
        handle.id
    }
    /// Mirrors `Promise.race([result, 60 s timer])`. Lookup binds the exact
    /// session and owner, an expiry keeps the entry, every concurrent waiter
    /// observes the same settled answer, and dropping this future (client
    /// cancellation) retains everything for the next call.
    pub async fn wait_for_answer(
        &self,
        request_id: &str,
        session_id: &str,
        user_id: Option<&str>,
    ) -> WaitOutcome {
        self.wait_for_answer_with_timeout(request_id, session_id, user_id, Some(self.resume_wait))
            .await
    }
    /// Explicit host override: None waits until answered; Some bounds this wait
    /// without expiring the underlying request or changing the default deadline.
    pub async fn wait_for_answer_with_timeout(
        &self,
        request_id: &str,
        session_id: &str,
        user_id: Option<&str>,
        yield_after: Option<Duration>,
    ) -> WaitOutcome {
        let mut answer = {
            let mut entries = self.resumable.lock().unwrap();
            match entries.iter_mut().find(|entry| {
                entry.request_id == request_id
                    && entry.session_id == session_id
                    && entry.user_id.as_deref() == user_id
            }) {
                Some(entry) => {
                    entry.waiters += 1;
                    entry.answer.clone()
                }
                None => return WaitOutcome::Missing,
            }
        };
        let _wait = QuestionWaitGuard {
            entries: self.resumable.clone(),
            id: request_id.into(),
        };
        // Answers that arrived between waits resolve without arming a timer.
        if let Answer::Settled(result) = &*answer.borrow() {
            let result = result.clone();
            self.collect(request_id);
            return WaitOutcome::Answered(result);
        }
        let changed = if let Some(duration) = yield_after {
            tokio::time::timeout(duration, answer.changed())
                .await
                .is_ok()
        } else {
            let _ = answer.changed().await;
            true
        };
        if !changed {
            return WaitOutcome::Pending;
        }
        let settled = match &*answer.borrow() {
            Answer::Settled(result) => Some(result.clone()),
            Answer::Waiting => None,
        };
        match settled {
            Some(result) => {
                self.collect(request_id);
                WaitOutcome::Answered(result)
            }
            None => WaitOutcome::Pending,
        }
    }
    fn collect(&self, request_id: &str) {
        self.resumable
            .lock()
            .unwrap()
            .retain(|entry| entry.request_id != request_id);
    }
    pub fn list_pending(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.registry.list(session, user)
    }
    pub fn submit(&self, id: &str, result: Value, user: Option<&str>) -> bool {
        self.registry
            .resolve(id, Some(result), "submitted", user, false)
    }
    pub fn cancel(&self, id: &str, user: Option<&str>) -> bool {
        self.registry.resolve(id, None, "cancelled", user, false)
    }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretInput {
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: String,
    pub prompt: String,
    pub command: Option<String>,
    pub rememberable: Option<bool>,
    pub remember_label: Option<String>,
    pub secret_type: Option<String>,
    pub secret_key: Option<String>,
    pub timeout_ms: Option<f64>,
}
#[derive(Clone)]
pub struct SecretInputService {
    registry: Arc<Registry>,
    clock: Clock,
    default_timeout_ms: f64,
}
impl Default for SecretInputService {
    fn default() -> Self {
        Self::new(default_clock(), 120_000.0, None, None)
    }
}
impl SecretInputService {
    pub fn new(
        clock: Clock,
        default_timeout_ms: f64,
        on_request: Option<Observer>,
        on_resolved: Option<Observer>,
    ) -> Self {
        Self {
            registry: registry(on_request, on_resolved),
            clock,
            default_timeout_ms,
        }
    }
    /// Must run inside a Tokio runtime. Nonpositive and overflowing delays follow
    /// the reference timer's one-millisecond scheduling; expiry retains the input.
    pub fn request_secret(&self, input: SecretInput) -> Result<InputHandle, String> {
        let now = (self.clock)();
        let delay = input.timeout_ms.unwrap_or(self.default_timeout_ms);
        let expires = now as f64 + delay;
        if !expires.is_finite() || expires.abs() > 8.64e15 {
            return Err("Invalid time value".into());
        }
        let mut details = serde_json::Map::new();
        details.insert("prompt".into(), Value::String(input.prompt));
        for (key, value) in [
            ("command", input.command.map(Value::String)),
            ("rememberable", input.rememberable.map(Value::Bool)),
            ("rememberLabel", input.remember_label.map(Value::String)),
            ("secretType", input.secret_type.map(Value::String)),
            ("secretKey", input.secret_key.map(Value::String)),
        ] {
            if let Some(value) = value {
                details.insert(key.into(), value);
            }
        }
        let request = InputRequest {
            id: uuidv7().to_string(),
            session_id: input.session_id,
            user_id: input.user_id,
            requested_by: input.requested_by,
            title: input.title,
            created_at: iso(now)?,
            expires_at: Some(iso(expires.trunc() as i64)?),
            status: "pending".into(),
            details,
        };
        let handle = self.registry.insert(request.clone());
        let registry = self.registry.clone();
        let id = request.id.clone();
        let milliseconds = if !(1.0..=2_147_483_647.0).contains(&delay) {
            1
        } else {
            delay.trunc() as u64
        };
        let deadline = tokio::time::Instant::now() + Duration::from_millis(milliseconds);
        (self.registry.on_request)(request.clone());
        let task = tokio::spawn(async move {
            tokio::time::sleep_until(deadline).await;
            registry.resolve(&id, None, "timeout", None, true);
        });
        {
            let mut pending = self.registry.pending.lock().unwrap();
            if let Some(entry) = pending.iter_mut().find(|e| e.request.id == request.id) {
                entry.timer = Some(task.abort_handle());
            } else {
                task.abort();
            }
        }
        Ok(handle)
    }
    pub fn list_pending(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.registry.list(session, user)
    }
    pub fn submit(&self, id: &str, secret: String, user: Option<&str>) -> bool {
        self.registry
            .resolve(id, Some(Value::String(secret)), "submitted", user, false)
    }
    pub fn cancel(&self, id: &str, user: Option<&str>) -> bool {
        self.registry.resolve(id, None, "cancelled", user, false)
    }
}

#[cfg(test)]
mod resume_tests {
    use super::*;
    fn input(owner: Option<&str>) -> QuestionInput {
        QuestionInput {
            session_id: "session".into(),
            user_id: owner.map(String::from),
            questions: vec![serde_json::json!({"id":"q","header":"H","question":"Q?"})],
            ..Default::default()
        }
    }
    #[tokio::test(start_paused = true)]
    async fn timeout_keeps_answer_addressable_between_calls_and_collects_once() {
        let service = UserQuestionService::default();
        assert_eq!(service.resume_wait(), Duration::from_millis(60_000));
        let id = service.start_resumable(input(Some("owner")));
        let worker = service.clone();
        let wait_id = id.clone();
        let task = tokio::spawn(async move {
            worker
                .wait_for_answer(&wait_id, "session", Some("owner"))
                .await
        });
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_millis(RESUME_WAIT_MS - 1)).await;
        assert!(!task.is_finished());
        tokio::time::advance(Duration::from_millis(1)).await;
        assert_eq!(task.await.unwrap(), WaitOutcome::Pending);
        assert_eq!(service.list_pending(None, None).len(), 1);
        let answer = serde_json::json!({"answers":[{"id":"q","value":"yes"}]});
        assert!(service.submit(&id, answer.clone(), Some("owner")));
        assert_eq!(
            service.wait_for_answer(&id, "session", Some("owner")).await,
            WaitOutcome::Answered(Some(answer))
        );
        assert_eq!(
            service.wait_for_answer(&id, "session", Some("owner")).await,
            WaitOutcome::Missing
        );
    }
    #[tokio::test(start_paused = true)]
    async fn wrong_owner_session_and_empty_owner_do_not_collect_an_answer() {
        let service = UserQuestionService::default();
        let id = service.start_resumable(input(None));
        assert_eq!(
            service.wait_for_answer(&id, "other", None).await,
            WaitOutcome::Missing
        );
        assert_eq!(
            service.wait_for_answer(&id, "session", Some("")).await,
            WaitOutcome::Missing
        );
        assert!(service.cancel(&id, None));
        assert_eq!(
            service.wait_for_answer(&id, "session", Some("owner")).await,
            WaitOutcome::Missing
        );
        assert_eq!(
            service.wait_for_answer(&id, "session", None).await,
            WaitOutcome::Answered(None)
        );
    }
    #[tokio::test(start_paused = true)]
    async fn cancelled_waiter_keeps_shared_answer_for_concurrent_waiters() {
        let service = UserQuestionService::default();
        let id = service.start_resumable(input(Some("owner")));
        let mut tasks = vec![];
        for _ in 0..3 {
            let worker = service.clone();
            let id = id.clone();
            tasks.push(tokio::spawn(async move {
                worker.wait_for_answer(&id, "session", Some("owner")).await
            }));
        }
        for _ in 0..8 {
            tokio::task::yield_now().await;
        }
        tasks.remove(0).abort();
        let answer = serde_json::json!({"answers":[]});
        assert!(service.submit(&id, answer.clone(), Some("owner")));
        for task in tasks {
            assert_eq!(
                task.await.unwrap(),
                WaitOutcome::Answered(Some(answer.clone()))
            );
        }
        assert_eq!(
            service.wait_for_answer(&id, "session", Some("owner")).await,
            WaitOutcome::Missing
        );
    }
}
