//! Pending consent queue with durable decisions and session overrides.
//! Routes/executors must authenticate callers and apply ownership/policy before use.
//! Synchronous persistence adapters run on the caller's database/blocking lane;
//! expiration always dispatches to a blocking task instead of blocking Tokio I/O.
use crate::{
    db::identifiers::uuidv7,
    security::{
        contracts::Risk,
        tool_permissions::{ConsentLevel, PolicySource},
    },
    time::{Clock, default_clock, iso},
};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::{broadcast, watch},
    task::AbortHandle,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConsentStatus {
    Pending,
    Approved,
    Rejected,
    Timeout,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DecisionVia {
    Click,
    Voice,
    Auto,
    Timeout,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequestPolicy {
    pub consent_level: ConsentLevel,
    pub description: String,
    pub known_tool: bool,
    pub source: PolicySource,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequest {
    pub id: String,
    pub action_id: String,
    pub tool_name: String,
    pub summary: String,
    pub preview: Map<String, Value>,
    pub risk: Risk,
    pub policy: ConsentRequestPolicy,
    pub session_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub status: ConsentStatus,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentDecision {
    pub request_id: String,
    pub action_id: String,
    pub approved: bool,
    pub decided_at: String,
    pub decided_via: DecisionVia,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConsent {
    pub action_id: String,
    pub tool_name: String,
    pub summary: String,
    pub preview: Map<String, Value>,
    pub risk: Risk,
    pub policy: ConsentRequestPolicy,
    pub session_id: String,
    pub timeout_ms: Option<f64>,
}
/// Shared request identity: a retained get/onRequest value observes terminal status.
#[derive(Clone, Debug)]
pub struct SharedRequest(Arc<Mutex<ConsentRequest>>);
impl SharedRequest {
    pub fn snapshot(&self) -> ConsentRequest {
        self.0.lock().unwrap().clone()
    }
}
pub trait ConsentPersistence: Send + Sync {
    fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String>;
    fn persist_session_approve_all(
        &self,
        session: &str,
        enabled: bool,
        at: &str,
    ) -> Result<(), String>;
    fn persist_decision(
        &self,
        request: &ConsentRequest,
        decision: &ConsentDecision,
    ) -> Result<(), String>;
}
/// Existing consent tables only; never opens the default/production database.
pub struct SqliteConsentStore {
    pub db: Arc<Mutex<Connection>>,
}
impl ConsentPersistence for SqliteConsentStore {
    fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
        let db = self.db.lock().unwrap();
        let mut query = db
            .prepare("SELECT session_id FROM consent_session_approvals WHERE approve_all=1")
            .map_err(|e| e.to_string())?;
        query
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    fn persist_session_approve_all(
        &self,
        session: &str,
        enabled: bool,
        at: &str,
    ) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        if enabled {
            db.execute("INSERT INTO consent_session_approvals(session_id,approve_all,updated_at) VALUES(?1,1,?2) ON CONFLICT(session_id) DO UPDATE SET approve_all=1,updated_at=excluded.updated_at",params![session,at])
        } else {db.execute("DELETE FROM consent_session_approvals WHERE session_id=?1",[session])}.map(|_|()).map_err(|e|e.to_string())
    }
    fn persist_decision(
        &self,
        request: &ConsentRequest,
        decision: &ConsentDecision,
    ) -> Result<(), String> {
        let status = if decision.approved {
            "approved"
        } else if decision.decided_via == DecisionVia::Timeout {
            "timeout"
        } else {
            "rejected"
        };
        let via = match decision.decided_via {
            DecisionVia::Click => "click",
            DecisionVia::Voice => "voice",
            DecisionVia::Auto => "auto",
            DecisionVia::Timeout => "timeout",
        };
        self.db.lock().unwrap().execute("INSERT INTO consent_log(id,action_id,tool_name,decision,decided_at,decided_via) VALUES(?1,?2,?3,?4,?5,?6)",params![uuidv7().to_string(),request.action_id,request.tool_name,status,decision.decided_at,via]).map(|_|()).map_err(|e|e.to_string())
    }
}
pub type RequestObserver = Arc<dyn Fn(SharedRequest) -> Result<(), String> + Send + Sync>;
pub type DecisionObserver = Arc<dyn Fn(ConsentDecision) -> Result<(), String> + Send + Sync>;
pub struct ConsentManagerOptions {
    pub default_timeout_ms: f64,
    pub store: Option<Arc<dyn ConsentPersistence>>,
    pub clock: Clock,
    pub on_request: Option<RequestObserver>,
    pub on_decision: Option<DecisionObserver>,
}
impl Default for ConsentManagerOptions {
    fn default() -> Self {
        Self {
            default_timeout_ms: 120_000.0,
            store: None,
            clock: default_clock(),
            on_request: None,
            on_decision: None,
        }
    }
}
#[derive(Clone, Debug)]
enum Answer {
    Waiting,
    Settled(Result<ConsentDecision, String>),
}
pub struct ConsentHandle {
    pub id: String,
    answer: watch::Receiver<Answer>,
    // Preserve a waiting promise when a decision observer throws, matching JS.
    _keepalive: watch::Sender<Answer>,
    _owner: Arc<Inner>,
}
impl ConsentHandle {
    pub fn outcome(&self) -> Option<Result<ConsentDecision, String>> {
        match self.answer.borrow().clone() {
            Answer::Waiting => None,
            Answer::Settled(result) => Some(result),
        }
    }
    pub async fn wait(&mut self) -> Result<ConsentDecision, String> {
        loop {
            if let Some(result) = self.outcome() {
                return result;
            }
            self.answer
                .changed()
                .await
                .map_err(|_| "consent answer channel closed".to_string())?;
        }
    }
}
/// Internal queue transitions. Consumers must authenticate and check current
/// session ownership before delivering either payload. Lag requires a snapshot.
#[derive(Clone, Debug)]
pub enum ConsentQueueEvent {
    Required(Arc<ConsentRequest>),
    Resolved {
        session_id: String,
        decision: Arc<ConsentDecision>,
    },
    SnapshotRequired,
}
// Bound each retained broadcast payload by its serialized size. The channel
// retains at most 64 events; oversize or unserializable transitions require
// recovery instead of silently dropping an event. Consumers must reconcile
// individual decisions too, since a pending-only snapshot cannot restore them.
const MAX_QUEUE_EVENT_BYTES: usize = 64 * 1024;

struct EventSizeBudget(usize);
impl std::io::Write for EventSizeBudget {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > self.0 {
            return Err(std::io::Error::other("consent event exceeds size budget"));
        }
        self.0 -= bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn event_fits(value: &impl Serialize) -> bool {
    serde_json::to_writer(EventSizeBudget(MAX_QUEUE_EVENT_BYTES), value).is_ok()
}

fn required_event(request: &SharedRequest) -> ConsentQueueEvent {
    let request = request.0.lock().unwrap();
    if event_fits(&*request) {
        ConsentQueueEvent::Required(Arc::new(request.clone()))
    } else {
        ConsentQueueEvent::SnapshotRequired
    }
}

fn resolved_event(session_id: &str, decision: &ConsentDecision) -> ConsentQueueEvent {
    if event_fits(&(session_id, decision)) {
        ConsentQueueEvent::Resolved {
            session_id: session_id.to_owned(),
            decision: Arc::new(decision.clone()),
        }
    } else {
        ConsentQueueEvent::SnapshotRequired
    }
}
/// Minimal data needed by the pending-approval reconnect snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingIdentity {
    pub id: String,
    pub session_id: String,
}

const MAX_SNAPSHOT_ITEMS: usize = 4096;
const MAX_SNAPSHOT_ID_BYTES: usize = 1024 * 1024;

fn pending_identities(state: &State) -> Result<Vec<PendingIdentity>, &'static str> {
    if state.unrecoverable_transition {
        return Err("consent transition recovery unavailable");
    }
    if state.transitions_in_flight != 0 {
        return Err("consent transition finalization in progress");
    }
    if state.pending.len() > MAX_SNAPSHOT_ITEMS {
        return Err("consent snapshot capacity exceeded");
    }
    let mut remaining = MAX_SNAPSHOT_ID_BYTES;
    let mut identities = Vec::with_capacity(state.pending.len());
    for entry in &state.pending {
        let request = entry.request.0.lock().unwrap();
        let size = request
            .id
            .len()
            .checked_add(request.session_id.len())
            .ok_or("consent snapshot capacity exceeded")?;
        remaining = remaining
            .checked_sub(size)
            .ok_or("consent snapshot capacity exceeded")?;
        identities.push(PendingIdentity {
            id: request.id.clone(),
            session_id: request.session_id.clone(),
        });
    }
    Ok(identities)
}
pub(crate) struct Pending {
    request: SharedRequest,
    send: Option<watch::Sender<Answer>>,
    timer: AbortHandle,
}
/// Keeps snapshots fail-closed even if a deferred finalizer is dropped.
pub(crate) struct CancellationClaim {
    entry: Option<Pending>,
    inner: Arc<Inner>,
    finalized: bool,
}
impl Drop for CancellationClaim {
    fn drop(&mut self) {
        let mut state = self.inner.state.lock().unwrap();
        state.transitions_in_flight -= 1;
        if !self.finalized {
            state.unrecoverable_transition = true;
        }
        // Wake subscribers also when finalization failed or was abandoned.
        let _ = state
            .pending_changes
            .send(ConsentQueueEvent::SnapshotRequired);
    }
}
// Holds recovery closed while a regular decision is being finalized. If a
// callback unwinds or fails, no pending-only snapshot can repair the transition.
struct DecisionFinalization {
    inner: Arc<Inner>,
    finalized: bool,
}
impl Drop for DecisionFinalization {
    fn drop(&mut self) {
        let mut state = self.inner.state.lock().unwrap();
        state.transitions_in_flight -= 1;
        if !self.finalized {
            state.unrecoverable_transition = true;
            let _ = state
                .pending_changes
                .send(ConsentQueueEvent::SnapshotRequired);
        }
    }
}
struct State {
    pending: Vec<Pending>,
    transitions_in_flight: usize,
    unrecoverable_transition: bool,
    pending_changes: broadcast::Sender<ConsentQueueEvent>,
    approve_all: HashSet<String>,
}
struct Inner {
    state: Mutex<State>,
    options: ConsentManagerOptions,
}
impl Drop for Inner {
    fn drop(&mut self) {
        for entry in &self.state.get_mut().unwrap().pending {
            entry.timer.abort();
        }
    }
}
#[derive(Clone)]
pub struct ConsentManager {
    inner: Arc<Inner>,
}
impl Default for ConsentManager {
    fn default() -> Self {
        Self::new(ConsentManagerOptions::default())
    }
}
impl ConsentManager {
    pub fn new(options: ConsentManagerOptions) -> Self {
        let approve_all = options
            .store
            .as_ref()
            .and_then(|store| store.hydrate_session_approve_all().ok())
            .unwrap_or_default()
            .into_iter()
            .collect();
        let (pending_changes, _) = broadcast::channel(64);
        Self {
            inner: Arc::new(Inner {
                state: Mutex::new(State {
                    pending: Vec::new(),
                    transitions_in_flight: 0,
                    unrecoverable_transition: false,
                    pending_changes,
                    approve_all,
                }),
                options,
            }),
        }
    }
    /// Register immediately, before observers run, like the JS Promise executor.
    /// `Err` means the request could not be constructed (invalid expiry).
    pub fn request_consent(&self, input: RequestConsent) -> Result<ConsentHandle, String> {
        let timeout = input
            .timeout_ms
            .unwrap_or(self.inner.options.default_timeout_ms);
        let now = (self.inner.options.clock)();
        let expires = (now as f64 + timeout).trunc();
        if !expires.is_finite() || expires.abs() > 8_640_000_000_000_000.0 {
            return Err("Invalid time value".into());
        }
        let request = SharedRequest(Arc::new(Mutex::new(ConsentRequest {
            id: uuidv7().to_string(),
            action_id: input.action_id,
            tool_name: input.tool_name,
            summary: input.summary,
            preview: input.preview,
            risk: input.risk,
            policy: input.policy,
            session_id: input.session_id,
            created_at: iso(now)?,
            expires_at: iso(expires as i64)?,
            status: ConsentStatus::Pending,
        })));
        let id = request.snapshot().id;
        let (send, answer) = watch::channel(Answer::Waiting);
        let handle = ConsentHandle {
            id: id.clone(),
            answer,
            _keepalive: send.clone(),
            _owner: self.inner.clone(),
        };
        // JS timers clamp non-positive/out-of-i32 delays to one millisecond.
        let delay = if !(1.0..=2_147_483_647.0).contains(&timeout) {
            1
        } else {
            timeout.trunc() as u64
        };
        let deadline = Instant::now() + Duration::from_millis(delay);
        {
            let mut state = self.inner.state.lock().unwrap();
            let weak = Arc::downgrade(&self.inner);
            let timer_id = id.clone();
            let timer = tokio::spawn(async move {
                tokio::time::sleep_until(deadline).await;
                if let Some(inner) = weak.upgrade() {
                    let _ = tokio::task::spawn_blocking(move || {
                        ConsentManager { inner }.timeout(&timer_id)
                    })
                    .await;
                }
            })
            .abort_handle();
            state.pending.push(Pending {
                request: request.clone(),
                send: Some(send),
                timer,
            });
            let _ = state.pending_changes.send(required_event(&request));
        }
        if let Some(observe) = &self.inner.options.on_request
            && let Err(error) = observe(request)
        {
            let mut state = self.inner.state.lock().unwrap();
            if let Some(entry) = state
                .pending
                .iter_mut()
                .find(|e| e.request.snapshot().id == id)
                && let Some(send) = entry.send.take()
            {
                let _ = send.send(Answer::Settled(Err(error)));
            }
        }
        Ok(handle)
    }
    pub fn get_request(&self, id: &str) -> Option<SharedRequest> {
        self.inner
            .state
            .lock()
            .unwrap()
            .pending
            .iter()
            .find(|e| e.request.snapshot().id == id)
            .map(|e| e.request.clone())
    }
    pub fn list_pending(&self, session: Option<&str>) -> Vec<SharedRequest> {
        self.inner
            .state
            .lock()
            .unwrap()
            .pending
            .iter()
            .filter(|e| {
                session
                    .filter(|s| !s.is_empty())
                    .is_none_or(|s| s == e.request.snapshot().session_id)
            })
            .map(|e| e.request.clone())
            .collect()
    }
    /// Subscribe and snapshot under the queue lock, enforcing a shared bound.
    /// Events are internal and require authorization before delivery. On lag or
    /// SnapshotRequired, stop delivery and reconcile both pending requests and
    /// missed decisions; a pending snapshot alone cannot recover decisions.
    /// Dropping a receiver releases its slot.
    pub fn try_subscribe_pending_changes(
        &self,
    ) -> Result<(Vec<PendingIdentity>, broadcast::Receiver<ConsentQueueEvent>), &'static str> {
        const MAX_SUBSCRIBERS: usize = 128;
        let state = self.inner.state.lock().unwrap();
        if state.pending_changes.receiver_count() >= MAX_SUBSCRIBERS {
            return Err("consent subscriber limit reached");
        }
        let receiver = state.pending_changes.subscribe();
        let requests = pending_identities(&state)?;
        Ok((requests, receiver))
    }
    /// Snapshot without allocating another subscription. A live receiver remains
    /// registered while this lock is held, so subsequent changes wake it normally.
    pub fn pending_snapshot(&self) -> Result<Vec<PendingIdentity>, &'static str> {
        let state = self.inner.state.lock().unwrap();
        pending_identities(&state)
    }
    pub fn pending_count(&self) -> usize {
        self.inner.state.lock().unwrap().pending.len()
    }
    pub fn approve(
        &self,
        id: &str,
        via: Option<DecisionVia>,
        reason: Option<String>,
    ) -> Result<bool, String> {
        self.decide(
            id,
            true,
            via.unwrap_or(DecisionVia::Click),
            reason,
            false,
            false,
        )
    }
    pub fn reject(
        &self,
        id: &str,
        via: Option<DecisionVia>,
        reason: Option<String>,
    ) -> Result<bool, String> {
        self.decide(
            id,
            false,
            via.unwrap_or(DecisionVia::Click),
            reason,
            false,
            false,
        )
    }
    /// Claim cancellation under the queue lock before any deferred work can race approval.
    pub(crate) fn claim_cancelled(&self, id: &str) -> Option<CancellationClaim> {
        let mut state = self.inner.state.lock().unwrap();
        let index = state
            .pending
            .iter()
            .position(|entry| entry.request.snapshot().id == id)?;
        let entry = state.pending.remove(index);
        entry.timer.abort();
        state.transitions_in_flight += 1;
        let _ = state
            .pending_changes
            .send(ConsentQueueEvent::SnapshotRequired);
        Some(CancellationClaim {
            entry: Some(entry),
            inner: self.inner.clone(),
            finalized: false,
        })
    }

    /// Finalize a claimed cancellation off the async worker; never invent a timestamp.
    pub(crate) fn finalize_cancelled(&self, mut claim: CancellationClaim) -> Result<(), String> {
        let entry = claim.entry.take().expect("cancellation claim has an entry");
        let request = {
            let mut request = entry.request.0.lock().unwrap();
            request.status = ConsentStatus::Rejected;
            request.clone()
        };
        let decided_at = match iso((self.inner.options.clock)()) {
            Ok(at) => at,
            Err(error) => {
                if let Some(send) = entry.send {
                    let _ = send.send(Answer::Settled(Err(error.clone())));
                }
                return Err(error);
            }
        };
        let decision = ConsentDecision {
            request_id: request.id.clone(),
            action_id: request.action_id.clone(),
            approved: false,
            decided_at,
            decided_via: DecisionVia::Auto,
            reason: Some("Cancelled".into()),
        };
        {
            let state = self.inner.state.lock().unwrap();
            let _ = state
                .pending_changes
                .send(resolved_event(&request.session_id, &decision));
        }
        if let Some(store) = &self.inner.options.store {
            let _ = store.persist_decision(&request, &decision);
        }
        if let Some(observe) = &self.inner.options.on_decision {
            observe(decision.clone())?;
        }
        if let Some(send) = entry.send {
            let _ = send.send(Answer::Settled(Ok(decision)));
        }
        claim.finalized = true;
        Ok(())
    }
    fn timeout(&self, id: &str) -> Result<bool, String> {
        self.decide(
            id,
            false,
            DecisionVia::Timeout,
            Some("Consent request timed out".into()),
            true,
            false,
        )
    }
    fn decide(
        &self,
        id: &str,
        approved: bool,
        via: DecisionVia,
        reason: Option<String>,
        timeout: bool,
        cancel_cleanup: bool,
    ) -> Result<bool, String> {
        let (entry, decision) = {
            let mut state = self.inner.state.lock().unwrap();
            let Some(index) = state
                .pending
                .iter()
                .position(|e| e.request.snapshot().id == id)
            else {
                return Ok(false);
            };
            let decided_at = match iso((self.inner.options.clock)()) {
                Ok(at) => at,
                Err(error) if timeout || cancel_cleanup => {
                    let entry = state.pending.remove(index);
                    entry.timer.abort();
                    // No decision can be reconstructed without a valid timestamp.
                    state.unrecoverable_transition = true;
                    let _ = state
                        .pending_changes
                        .send(ConsentQueueEvent::SnapshotRequired);
                    entry.request.0.lock().unwrap().status = if timeout {
                        ConsentStatus::Timeout
                    } else {
                        ConsentStatus::Rejected
                    };
                    if let Some(send) = entry.send {
                        let _ = send.send(Answer::Settled(Err(error.clone())));
                    }
                    return Err(error);
                }
                Err(error) => return Err(error),
            };
            let decision = ConsentDecision {
                request_id: id.into(),
                action_id: state.pending[index].request.snapshot().action_id,
                approved,
                decided_at,
                decided_via: via,
                reason,
            };
            let entry = state.pending.remove(index);
            entry.timer.abort();
            state.transitions_in_flight += 1;
            let session_id = entry.request.snapshot().session_id;
            let _ = state
                .pending_changes
                .send(resolved_event(&session_id, &decision));
            (entry, decision)
        };
        let mut finalization = DecisionFinalization {
            inner: self.inner.clone(),
            finalized: false,
        };
        let request = {
            let mut request = entry.request.0.lock().unwrap();
            request.status = if timeout {
                ConsentStatus::Timeout
            } else if approved {
                ConsentStatus::Approved
            } else {
                ConsentStatus::Rejected
            };
            request.clone()
        };
        if let Some(store) = &self.inner.options.store {
            let _ = store.persist_decision(&request, &decision);
        }
        if let Some(observe) = &self.inner.options.on_decision {
            observe(decision.clone())?;
        }
        if let Some(send) = entry.send {
            let _ = send.send(Answer::Settled(Ok(decision)));
        }
        finalization.finalized = true;
        Ok(true)
    }
    pub fn enable_approve_all_for_session(&self, session: &str) {
        self.set_approve_all(session, true)
    }
    pub fn disable_approve_all_for_session(&self, session: &str) {
        self.set_approve_all(session, false)
    }
    fn set_approve_all(&self, session: &str, enabled: bool) {
        {
            let mut state = self.inner.state.lock().unwrap();
            if enabled {
                state.approve_all.insert(session.into());
            } else {
                state.approve_all.remove(session);
            }
        }
        if let Some(store) = &self.inner.options.store
            && let Ok(at) = iso((self.inner.options.clock)())
        {
            let _ = store.persist_session_approve_all(session, enabled, &at);
        }
    }
    pub fn is_approve_all_enabled_for_session(&self, session: &str) -> bool {
        self.inner
            .state
            .lock()
            .unwrap()
            .approve_all
            .contains(session)
    }
    pub fn cancel_all(&self, reason: Option<&str>) -> Result<(), String> {
        let ids: Vec<_> = self
            .list_pending(None)
            .into_iter()
            .map(|r| r.snapshot().id)
            .collect();
        for id in ids {
            self.decide(
                &id,
                false,
                DecisionVia::Auto,
                Some(reason.unwrap_or("shutdown").into()),
                false,
                false,
            )?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod clock_failure_tests {
    use super::*;
    use std::sync::atomic::{AtomicI64, Ordering};

    fn cancellation_request() -> RequestConsent {
        RequestConsent {
            action_id: "action".into(),
            tool_name: "tool".into(),
            summary: "test".into(),
            preview: Map::new(),
            risk: Risk::High,
            policy: ConsentRequestPolicy {
                consent_level: ConsentLevel::Always,
                description: "test".into(),
                known_tool: true,
                source: PolicySource::Profile,
            },
            session_id: "session".into(),
            timeout_ms: Some(10_000.0),
        }
    }

    #[tokio::test]
    async fn pending_subscription_captures_transitions_and_cancellation() {
        let manager = ConsentManager::default();
        let first = manager.request_consent(cancellation_request()).unwrap();
        let (initial, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        assert_eq!(
            initial
                .iter()
                .map(|request| &request.id)
                .collect::<Vec<_>>(),
            vec![&first.id]
        );
        let second = manager.request_consent(cancellation_request()).unwrap();
        assert!(changes.try_recv().is_ok());
        assert!(manager.approve(&first.id, None, None).unwrap());
        assert!(changes.try_recv().is_ok());
        let claim = manager.claim_cancelled(&second.id).unwrap();
        assert!(changes.try_recv().is_ok());
        assert!(manager.try_subscribe_pending_changes().is_err());
        assert!(manager.pending_snapshot().is_err());
        manager.finalize_cancelled(claim).unwrap();
        assert!(manager.pending_snapshot().unwrap().is_empty());
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::Resolved { .. })
        ));
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
    }

    #[tokio::test]
    async fn snapshot_capacity_failure_releases_subscription_and_recovers() {
        let manager = ConsentManager::default();
        let mut request = cancellation_request();
        request.session_id = "s".repeat(MAX_SNAPSHOT_ID_BYTES + 1);
        let handle = manager.request_consent(request).unwrap();
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
        assert!(manager.approve(&handle.id, None, None).unwrap());
        let (snapshot, receiver) = manager.try_subscribe_pending_changes().unwrap();
        assert!(snapshot.is_empty());
        drop(receiver);
        let receivers: Vec<_> = (0..128)
            .map(|_| manager.try_subscribe_pending_changes().unwrap().1)
            .collect();
        assert!(manager.try_subscribe_pending_changes().is_err());
        drop(receivers);
    }

    #[tokio::test]
    async fn oversized_queue_events_signal_recovery_without_retaining_payload() {
        let manager = ConsentManager::default();
        let (_, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        let mut request = cancellation_request();
        request.summary = "x".repeat(MAX_QUEUE_EVENT_BYTES + 1);
        let handle = manager.request_consent(request).unwrap();
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
        assert!(
            manager
                .reject(
                    &handle.id,
                    None,
                    Some("x".repeat(MAX_QUEUE_EVENT_BYTES + 1))
                )
                .unwrap()
        );
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
        assert!(manager.pending_snapshot().unwrap().is_empty());
    }

    #[tokio::test]
    async fn queue_events_keep_request_before_associated_decision() {
        let manager = ConsentManager::default();
        let (_, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        let handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(manager.approve(&handle.id, None, None).unwrap());
        let required = changes.try_recv().unwrap();
        let resolved = changes.try_recv().unwrap();
        match required {
            ConsentQueueEvent::Required(request) => {
                assert_eq!(request.id, handle.id);
                assert_eq!(request.session_id, "session");
                assert_eq!(request.status, ConsentStatus::Pending);
            }
            _ => panic!("expected required first"),
        }
        match resolved {
            ConsentQueueEvent::Resolved {
                session_id,
                decision,
            } => {
                assert_eq!(session_id, "session");
                assert_eq!(decision.request_id, handle.id);
                assert!(decision.approved);
            }
            _ => panic!("expected resolved second"),
        }
    }

    #[tokio::test]
    async fn lagged_pending_subscription_requires_resnapshot() {
        let manager = ConsentManager::default();
        let (_, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        for _ in 0..65 {
            let handle = manager.request_consent(cancellation_request()).unwrap();
            assert!(manager.approve(&handle.id, None, None).unwrap());
        }
        assert!(matches!(
            changes.try_recv(),
            Err(broadcast::error::TryRecvError::Lagged(_))
        ));
        assert!(
            manager
                .try_subscribe_pending_changes()
                .unwrap()
                .0
                .is_empty()
        );
    }

    #[tokio::test]
    async fn pending_subscription_admission_releases_on_drop() {
        let manager = ConsentManager::default();
        let receivers: Vec<_> = (0..128)
            .map(|_| manager.try_subscribe_pending_changes().unwrap().1)
            .collect();
        assert!(manager.try_subscribe_pending_changes().is_err());
        drop(receivers);
        assert!(manager.try_subscribe_pending_changes().is_ok());
    }

    #[tokio::test]
    async fn cancellation_claim_precedes_deferred_finalization() {
        let manager = ConsentManager::default();
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        let claim = manager.claim_cancelled(&handle.id).unwrap();
        assert_eq!(manager.pending_count(), 0);
        assert!(!manager.approve(&handle.id, None, None).unwrap());
        assert!(handle.outcome().is_none());
        manager.finalize_cancelled(claim).unwrap();
        let decision = handle.wait().await.unwrap();
        assert!(!decision.approved);
        assert_eq!(decision.decided_via, DecisionVia::Auto);
    }

    #[tokio::test]
    async fn unrecoverable_transition_claim_fails_snapshots_closed() {
        let manager = ConsentManager::default();
        let (_, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let _ = changes.try_recv();
        let claim = manager.claim_cancelled(&handle.id).unwrap();
        assert!(manager.pending_snapshot().is_err());
        drop(claim);
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
    }

    #[tokio::test]
    async fn approval_before_cancellation_claim_wins() {
        let manager = ConsentManager::default();
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(manager.approve(&handle.id, None, None).unwrap());
        assert!(manager.claim_cancelled(&handle.id).is_none());
        assert!(handle.wait().await.unwrap().approved);
    }

    #[tokio::test]
    async fn snapshot_waits_for_in_flight_decision_observer() {
        use std::sync::mpsc;
        use std::time::Duration;

        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let release_rx = Mutex::new(release_rx);
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                entered_tx.send(()).map_err(|e| e.to_string())?;
                release_rx
                    .lock()
                    .unwrap()
                    .recv()
                    .map_err(|e| e.to_string())?;
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        let worker_manager = manager.clone();
        let id = handle.id.clone();
        let worker = std::thread::spawn(move || worker_manager.approve(&id, None, None));
        entered_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
        assert!(handle.outcome().is_none());
        release_tx.send(()).unwrap();
        assert!(worker.join().unwrap().unwrap());
        assert!(handle.wait().await.unwrap().approved);
        assert!(manager.pending_snapshot().unwrap().is_empty());
        assert!(manager.try_subscribe_pending_changes().is_ok());
    }

    #[tokio::test]
    async fn observer_failure_keeps_decision_recovery_closed() {
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
            ..ConsentManagerOptions::default()
        });
        let handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(manager.approve(&handle.id, None, None).is_err());
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());

        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
            ..ConsentManagerOptions::default()
        });
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let claim = manager.claim_cancelled(&handle.id).unwrap();
        assert!(manager.finalize_cancelled(claim).is_err());
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
    }

    struct FailingStore;
    impl ConsentPersistence for FailingStore {
        fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
            Err("hydrate failed".into())
        }
        fn persist_session_approve_all(&self, _: &str, _: bool, _: &str) -> Result<(), String> {
            Err("write failed".into())
        }
        fn persist_decision(&self, _: &ConsentRequest, _: &ConsentDecision) -> Result<(), String> {
            Err("audit failed".into())
        }
    }

    #[tokio::test]
    async fn persistence_failures_do_not_override_in_memory_consent() {
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(Arc::new(FailingStore)),
            ..ConsentManagerOptions::default()
        });
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        manager.enable_approve_all_for_session("session");
        assert!(manager.is_approve_all_enabled_for_session("session"));
        manager.disable_approve_all_for_session("session");
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        let mut handle = manager
            .request_consent(RequestConsent {
                action_id: "action".into(),
                tool_name: "tool".into(),
                summary: "test".into(),
                preview: Map::new(),
                risk: Risk::High,
                policy: ConsentRequestPolicy {
                    consent_level: ConsentLevel::Always,
                    description: "test".into(),
                    known_tool: true,
                    source: PolicySource::Profile,
                },
                session_id: "session".into(),
                timeout_ms: Some(10_000.0),
            })
            .unwrap();
        assert!(manager.approve(&handle.id, None, None).unwrap());
        let decision = tokio::time::timeout(Duration::from_secs(2), handle.wait())
            .await
            .unwrap()
            .unwrap();
        assert!(decision.approved);
        assert_eq!(manager.pending_count(), 0);
    }

    #[tokio::test]
    async fn failed_decision_timestamp_keeps_expiry_active() {
        let clock = Arc::new(AtomicI64::new(0));
        let current = clock.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            clock: Arc::new(move || current.load(Ordering::SeqCst)),
            ..ConsentManagerOptions::default()
        });
        let mut handle = manager
            .request_consent(RequestConsent {
                action_id: "action".into(),
                tool_name: "tool".into(),
                summary: "test".into(),
                preview: Map::new(),
                risk: Risk::High,
                policy: ConsentRequestPolicy {
                    consent_level: ConsentLevel::Always,
                    description: "test".into(),
                    known_tool: true,
                    source: PolicySource::Profile,
                },
                session_id: "session".into(),
                timeout_ms: Some(100.0),
            })
            .unwrap();
        clock.store(i64::MAX, Ordering::SeqCst);
        assert!(manager.approve(&handle.id, None, None).is_err());
        assert_eq!(manager.pending_count(), 1);
        clock.store(0, Ordering::SeqCst);
        let decision = tokio::time::timeout(Duration::from_secs(2), handle.wait())
            .await
            .unwrap()
            .unwrap();
        assert!(!decision.approved);
        assert_eq!(decision.decided_via, DecisionVia::Timeout);
        assert_eq!(manager.pending_count(), 0);
    }
    #[tokio::test]
    async fn invalid_clock_at_expiry_fails_closed_and_removes_request() {
        let clock = Arc::new(AtomicI64::new(0));
        let current = clock.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            clock: Arc::new(move || current.load(Ordering::SeqCst)),
            ..ConsentManagerOptions::default()
        });
        let mut handle = manager
            .request_consent(RequestConsent {
                action_id: "action".into(),
                tool_name: "tool".into(),
                summary: "test".into(),
                preview: Map::new(),
                risk: Risk::High,
                policy: ConsentRequestPolicy {
                    consent_level: ConsentLevel::Always,
                    description: "test".into(),
                    known_tool: true,
                    source: PolicySource::Profile,
                },
                session_id: "session".into(),
                timeout_ms: Some(50.0),
            })
            .unwrap();
        let request = manager.get_request(&handle.id).unwrap();
        clock.store(i64::MAX, Ordering::SeqCst);
        let result = tokio::time::timeout(Duration::from_secs(2), handle.wait())
            .await
            .unwrap();
        assert!(result.is_err());
        assert_eq!(manager.pending_count(), 0);
        assert_eq!(request.snapshot().status, ConsentStatus::Timeout);
        assert!(!manager.approve(&handle.id, None, None).unwrap());
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
    }
}
