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
    collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque},
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
// Bound the number of session entries examined while holding the ownership lease.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
const MAX_LEASED_BATCH_SCAN: usize = 128;
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
const MAX_LEASED_BATCH_CLAIMS: usize = 128;
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
    for entry in state.pending.entries.values() {
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
    deadline: Instant,
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
        }
        // Publish only after recovery can observe the completed transition.
        let _ = state
            .pending_changes
            .send(ConsentQueueEvent::SnapshotRequired);
    }
}
/// Result for a previously observed pending request. Callers must authenticate
/// the session and authorize every result before making it visible.
#[derive(Clone, Debug)]
pub enum ReconciledConsent {
    Pending(PendingIdentity),
    Resolved {
        session_id: String,
        decision: Arc<ConsentDecision>,
    },
}

// Retain a bounded window; a missing identity fails recovery rather than
// guessing a verdict. Large events are deliberately not retained.
const MAX_RECENT_DECISIONS: usize = 64;
fn remember_decision(state: &mut State, session_id: &str, decision: &ConsentDecision) {
    if !event_fits(&(session_id, decision)) {
        return;
    }
    if state.recent_decisions.len() == MAX_RECENT_DECISIONS {
        state.recent_decisions.pop_front();
    }
    state
        .recent_decisions
        .push_back((session_id.to_owned(), Arc::new(decision.clone())));
}

/// Timestamp prepared outside the caller's route lock, bound to this manager.
pub(crate) struct PreparedDecisionTime {
    inner: Arc<Inner>,
    decided_at: String,
}
/// Claimed decision owns the transition until finalized. Dropping it fails
/// queue recovery closed; persistence and callbacks run only in `finalize`.
pub(crate) struct DecisionClaim {
    entry: Pending,
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    decision: ConsentDecision,
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    finalization: DecisionFinalization,
    started: bool,
}
impl Drop for DecisionClaim {
    fn drop(&mut self) {
        if let Some(send) = self.entry.send.take() {
            let message = if self.started {
                "consent decision finalization failed"
            } else {
                "consent decision claim abandoned"
            };
            let _ = send.send(Answer::Settled(Err(message.into())));
        }
    }
}
impl DecisionClaim {
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn finalize(mut self) -> Result<(), String> {
        self.started = true;
        let request = {
            let mut request = self.entry.request.0.lock().unwrap();
            request.status = if self.decision.approved {
                ConsentStatus::Approved
            } else {
                ConsentStatus::Rejected
            };
            request.clone()
        };
        let options = &self.finalization.inner.options;
        if let Some(store) = &options.store {
            let _ = store.persist_decision(&request, &self.decision);
        }
        if let Some(observe) = &options.on_decision {
            observe(self.decision.clone())?;
        }
        if let Some(send) = self.entry.send.take() {
            let _ = send.send(Answer::Settled(Ok(self.decision.clone())));
        }
        self.finalization.finalized = true;
        Ok(())
    }
}
/// Finalize every claimed decision even if an earlier observer fails. The
/// returned errors identify the failed claims; recovery remains fail-closed.
/// An observer panic is resumed after all remaining claims are attempted.
/// Call only after releasing the host authority lease.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
pub(crate) fn finalize_decision_batch(
    claims: Vec<(String, DecisionClaim)>,
) -> Vec<(String, String)> {
    let mut errors = Vec::new();
    let mut first_panic = None;
    for (id, claim) in claims {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| claim.finalize())) {
            Ok(Ok(())) => {}
            Ok(Err(error)) => errors.push((id, error)),
            Err(payload) => {
                if first_panic.is_none() {
                    first_panic = Some(payload);
                }
            }
        }
    }
    if let Some(payload) = first_panic {
        std::panic::resume_unwind(payload);
    }
    errors
}
#[derive(Default)]
struct PendingQueue {
    entries: BTreeMap<u64, Pending>,
    ids: HashMap<String, u64>,
    sessions: HashMap<String, BTreeSet<u64>>,
    scan_after: HashMap<String, u64>,
    next: u64,
}
impl PendingQueue {
    fn len(&self) -> usize {
        self.entries.len()
    }
    fn insert(&mut self, entry: Pending) -> Result<(), String> {
        let request = entry.request.snapshot();
        let Some(next) = self.next.checked_add(1) else {
            entry.timer.abort();
            return Err("consent sequence exhausted".into());
        };
        if self.ids.contains_key(&request.id) {
            entry.timer.abort();
            return Err("duplicate consent request id".into());
        }
        let seq = self.next;
        self.next = next;
        self.ids.insert(request.id, seq);
        self.sessions
            .entry(request.session_id)
            .or_default()
            .insert(seq);
        self.entries.insert(seq, entry);
        Ok(())
    }
    fn remove(&mut self, seq: u64) -> Pending {
        let entry = self.entries.remove(&seq).expect("pending sequence exists");
        let request = entry.request.snapshot();
        self.ids.remove(&request.id);
        let set = self
            .sessions
            .get_mut(&request.session_id)
            .expect("pending session exists");
        set.remove(&seq);
        if set.is_empty() {
            self.sessions.remove(&request.session_id);
            self.scan_after.remove(&request.session_id);
        }
        entry
    }
    fn seq(&self, id: &str) -> Option<u64> {
        self.ids.get(id).copied()
    }
}
struct State {
    recent_decisions: VecDeque<(String, Arc<ConsentDecision>)>,
    pending: PendingQueue,
    transitions_in_flight: usize,
    unrecoverable_transition: bool,
    pending_changes: broadcast::Sender<ConsentQueueEvent>,
    approve_all: HashSet<String>,
    // A failed durable clear must be retried before a subsequent enable.
    pending_override_clears: HashSet<String>,
}
/// Shared override authority for managers belonging to one host lifetime.
/// Persisted enables are deliberately not restored: a failed clear cannot be
/// durably recorded when the store is unavailable, so restart requires fresh consent.
pub struct SharedOverrideAuthority {
    store: Option<Arc<dyn ConsentPersistence>>,
    transition: Mutex<()>,
    state: Mutex<SharedOverrideState>,
}
#[derive(Default)]
struct SharedOverrideState {
    enabled: HashSet<String>,
    pending_clears: HashSet<String>,
}
impl SharedOverrideAuthority {
    pub fn new(store: Option<Arc<dyn ConsentPersistence>>) -> Self {
        Self {
            store,
            transition: Mutex::new(()),
            state: Mutex::new(SharedOverrideState::default()),
        }
    }
    fn set(&self, session: &str, enabled: bool, clock: &Clock) -> Result<(), String> {
        let _transition = self.transition.try_lock().map_err(|_| {
            "consent override transition already in progress or unavailable".to_string()
        })?;
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "consent override authority unavailable".to_string())?;
            if enabled && state.pending_clears.contains(session) {
                return Err("consent override clear must be retried before enabling".into());
            }
            if !enabled {
                state.enabled.remove(session);
                state.pending_clears.insert(session.into());
            }
        }
        if let Some(store) = &self.store {
            let at = iso(clock())?;
            store.persist_session_approve_all(session, enabled, &at)?;
        }
        let mut state = self
            .state
            .lock()
            .map_err(|_| "consent override authority unavailable".to_string())?;
        if enabled {
            state.enabled.insert(session.into());
        } else {
            state.pending_clears.remove(session);
        }
        Ok(())
    }
    fn is_enabled(&self, session: &str) -> bool {
        self.state
            .lock()
            .map(|state| state.enabled.contains(session))
            .unwrap_or(false)
    }
}
struct Inner {
    override_transition: Mutex<()>,
    shared_override_authority: Option<Arc<SharedOverrideAuthority>>,
    state: Mutex<State>,
    options: ConsentManagerOptions,
}
impl Drop for Inner {
    fn drop(&mut self) {
        for entry in self.state.get_mut().unwrap().pending.entries.values() {
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
        Self::new_inner(options, None)
    }
    /// Managers using the same host-owned authority share override state.
    pub fn new_with_shared_override_authority(
        options: ConsentManagerOptions,
        authority: Arc<SharedOverrideAuthority>,
    ) -> Self {
        Self::new_inner(options, Some(authority))
    }
    fn new_inner(
        options: ConsentManagerOptions,
        shared_override_authority: Option<Arc<SharedOverrideAuthority>>,
    ) -> Self {
        let approve_all = shared_override_authority
            .is_none()
            .then_some(&options)
            .and_then(|options| options.store.as_ref())
            .and_then(|store| store.hydrate_session_approve_all().ok())
            .unwrap_or_default()
            .into_iter()
            .collect();
        let (pending_changes, _) = broadcast::channel(64);
        Self {
            inner: Arc::new(Inner {
                override_transition: Mutex::new(()),
                shared_override_authority,
                state: Mutex::new(State {
                    recent_decisions: VecDeque::new(),
                    pending: PendingQueue::default(),
                    transitions_in_flight: 0,
                    unrecoverable_transition: false,
                    pending_changes,
                    approve_all,
                    pending_override_clears: HashSet::new(),
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
            state.pending.insert(Pending {
                request: request.clone(),
                send: Some(send),
                timer,
                deadline,
            })?;
            let _ = state.pending_changes.send(required_event(&request));
        }
        if let Some(observe) = &self.inner.options.on_request
            && let Err(error) = observe(request)
        {
            let mut state = self.inner.state.lock().unwrap();
            if let Some(seq) = state.pending.seq(&id)
                && let Some(entry) = state.pending.entries.get_mut(&seq)
                && let Some(send) = entry.send.take()
            {
                let _ = send.send(Answer::Settled(Err(error)));
            }
        }
        Ok(handle)
    }
    pub fn get_request(&self, id: &str) -> Option<SharedRequest> {
        let state = self.inner.state.lock().unwrap();
        state
            .pending
            .seq(id)
            .and_then(|seq| state.pending.entries.get(&seq))
            .map(|e| e.request.clone())
    }
    pub fn list_pending(&self, session: Option<&str>) -> Vec<SharedRequest> {
        self.inner
            .state
            .lock()
            .unwrap()
            .pending
            .entries
            .values()
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
    /// Reconcile previously observed IDs atomically against pending and the
    /// bounded recent-decision window. Unknown/evicted IDs fail the entire
    /// operation; they must never be interpreted as rejected or approved.
    pub fn reconcile_observed(
        &self,
        ids: &[String],
    ) -> Result<Vec<ReconciledConsent>, &'static str> {
        if ids.len() > MAX_SNAPSHOT_ITEMS
            || ids
                .iter()
                .try_fold(0usize, |n, id| n.checked_add(id.len()))
                .is_none_or(|n| n > MAX_SNAPSHOT_ID_BYTES)
        {
            return Err("consent reconciliation capacity exceeded");
        }
        let mut unique = HashSet::with_capacity(ids.len());
        if ids.iter().any(|id| !unique.insert(id)) {
            return Err("duplicate consent identity");
        }
        let state = self.inner.state.lock().unwrap();
        let pending = pending_identities(&state)?;
        let mut remaining = MAX_SNAPSHOT_ID_BYTES;
        ids.iter()
            .map(|id| {
                if let Some(identity) = pending.iter().find(|item| &item.id == id) {
                    return Ok(ReconciledConsent::Pending(identity.clone()));
                }
                let (session_id, decision) = state
                    .recent_decisions
                    .iter()
                    .find(|(_, decision)| &decision.request_id == id)
                    .ok_or("consent decision recovery unavailable")?;
                remaining = remaining
                    .checked_sub(session_id.len())
                    .ok_or("consent reconciliation capacity exceeded")?;
                Ok(ReconciledConsent::Resolved {
                    session_id: session_id.clone(),
                    decision: decision.clone(),
                })
            })
            .collect()
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
    /// Invoke the injected clock before acquiring any external route lock.
    pub(crate) fn prepare_decision_time(&self) -> Result<PreparedDecisionTime, String> {
        Ok(PreparedDecisionTime {
            inner: self.inner.clone(),
            decided_at: iso((self.inner.options.clock)())?,
        })
    }
    /// Claim a pending request only when its immutable session identity matches.
    /// The caller must authorize and hold its own route/session lease across this
    /// operation. Perform `finalize` after releasing any such external lock.
    pub(crate) fn claim_for_session(
        &self,
        id: &str,
        expected_session: &str,
        approved: bool,
        via: DecisionVia,
        reason: Option<String>,
        prepared: PreparedDecisionTime,
    ) -> Result<Option<DecisionClaim>, String> {
        if !Arc::ptr_eq(&self.inner, &prepared.inner) {
            return Err("prepared decision belongs to another manager".into());
        }
        let mut state = self.inner.state.lock().unwrap();
        let Some(index) = state.pending.seq(id) else {
            return Ok(None);
        };
        if state.pending.entries[&index].request.snapshot().session_id != expected_session {
            return Ok(None);
        }
        // Timer dispatch can be delayed by runtime or blocking-pool load. Never
        // claim an expired request just because its timeout task has not run yet.
        if Instant::now() >= state.pending.entries[&index].deadline {
            return Ok(None);
        }
        let decision = ConsentDecision {
            request_id: id.into(),
            action_id: state.pending.entries[&index].request.snapshot().action_id,
            approved,
            decided_at: prepared.decided_at,
            decided_via: via,
            reason,
        };
        let entry = state.pending.remove(index);
        entry.timer.abort();
        state.transitions_in_flight += 1;
        remember_decision(&mut state, expected_session, &decision);
        let _ = state
            .pending_changes
            .send(resolved_event(expected_session, &decision));
        Ok(Some(DecisionClaim {
            started: false,
            entry,
            decision,
            finalization: DecisionFinalization {
                inner: self.inner.clone(),
                finalized: false,
            },
        }))
    }
    /// Capture the exclusive sequence boundary for an operation while the caller
    /// holds its session/host authority lease. A boundary conveys no authority.
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn batch_boundary(&self) -> u64 {
        self.inner.state.lock().unwrap().pending.next
    }

    /// Claim one bounded, operation-owned window. The caller must authenticate
    /// and hold the same authority discipline used to capture the boundary.
    /// Cursors belong to the operation, never to a shared session.
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn claim_batch_window(
        &self,
        expected_session: &str,
        cursor: u64,
        boundary: u64,
        max_scan_entries: usize,
        reason: Option<String>,
        prepared: PreparedDecisionTime,
    ) -> Result<BatchWindow, String> {
        if !Arc::ptr_eq(&self.inner, &prepared.inner) {
            return Err("prepared decision belongs to another manager".into());
        }
        let mut state = self.inner.state.lock().unwrap();
        if cursor > boundary
            || boundary > state.pending.next
            || max_scan_entries == 0
            || max_scan_entries > MAX_LEASED_BATCH_SCAN
        {
            return Err("invalid consent batch window".into());
        }
        let mut next_cursor = cursor;
        let mut claims = Vec::new();
        let mut scanned = 0;
        while next_cursor < boundary && scanned < max_scan_entries {
            let next = state
                .pending
                .sessions
                .get(expected_session)
                .and_then(|set| set.range(next_cursor..boundary).next().copied());
            let Some(index) = next else {
                next_cursor = boundary;
                break;
            };
            next_cursor = index + 1; // index is strictly below the boundary.
            scanned += 1;
            if Instant::now() >= state.pending.entries[&index].deadline {
                continue;
            }
            let request = state.pending.entries[&index].request.snapshot();
            let decision = ConsentDecision {
                request_id: request.id.clone(),
                action_id: request.action_id,
                approved: true,
                decided_at: prepared.decided_at.clone(),
                decided_via: DecisionVia::Click,
                reason: reason.clone(),
            };
            let entry = state.pending.remove(index);
            entry.timer.abort();
            state.transitions_in_flight += 1;
            remember_decision(&mut state, expected_session, &decision);
            let _ = state
                .pending_changes
                .send(resolved_event(expected_session, &decision));
            claims.push((
                request.id,
                DecisionClaim {
                    started: false,
                    entry,
                    decision,
                    finalization: DecisionFinalization {
                        inner: self.inner.clone(),
                        finalized: false,
                    },
                },
            ));
        }
        Ok((next_cursor, scanned, claims))
    }

    /// Claim up to `limit` live requests for one authorized session in queue order.
    /// The caller must hold a host authority lease throughout this operation and
    /// release it before finalizing claims. A zero limit claims nothing; oversized
    /// limits fail before any claim. A scan containing only expired entries may
    /// return a retry-required error, retaining its position for the next call.
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn claim_batch_for_session(
        &self,
        expected_session: &str,
        limit: usize,
        reason: Option<String>,
        prepared: PreparedDecisionTime,
    ) -> Result<Vec<(String, DecisionClaim)>, String> {
        if !Arc::ptr_eq(&self.inner, &prepared.inner) {
            return Err("prepared decision belongs to another manager".into());
        }
        if limit > MAX_LEASED_BATCH_CLAIMS {
            return Err("consent batch limit exceeded".into());
        }
        let mut state = self.inner.state.lock().unwrap();
        let mut claims = Vec::new();
        let mut scanned = 0;
        while claims.len() < limit && scanned < MAX_LEASED_BATCH_SCAN {
            use std::ops::Bound::{Excluded, Unbounded};
            let after = state.pending.scan_after.get(expected_session).copied();
            let next = state
                .pending
                .sessions
                .get(expected_session)
                .and_then(|set| match after {
                    Some(seq) => set.range((Excluded(seq), Unbounded)).next().copied(),
                    None => set.iter().next().copied(),
                });
            let Some(index) = next else {
                state.pending.scan_after.remove(expected_session);
                break;
            };
            scanned += 1;
            let request = state.pending.entries[&index].request.snapshot();
            if Instant::now() >= state.pending.entries[&index].deadline {
                state
                    .pending
                    .scan_after
                    .insert(expected_session.to_owned(), index);
                continue;
            }
            let decision = ConsentDecision {
                request_id: request.id.clone(),
                action_id: request.action_id,
                approved: true,
                decided_at: prepared.decided_at.clone(),
                decided_via: DecisionVia::Click,
                reason: reason.clone(),
            };
            let entry = state.pending.remove(index);
            entry.timer.abort();
            state.transitions_in_flight += 1;
            remember_decision(&mut state, expected_session, &decision);
            let _ = state
                .pending_changes
                .send(resolved_event(expected_session, &decision));
            claims.push((
                request.id,
                DecisionClaim {
                    started: false,
                    entry,
                    decision,
                    finalization: DecisionFinalization {
                        inner: self.inner.clone(),
                        finalized: false,
                    },
                },
            ));
        }
        if claims.is_empty() && limit != 0 && scanned == MAX_LEASED_BATCH_SCAN {
            return Err("consent batch scan incomplete; retry required".into());
        }
        Ok(claims)
    }
    /// Claim cancellation under the queue lock before any deferred work can race approval.
    pub(crate) fn claim_cancelled(&self, id: &str) -> Option<CancellationClaim> {
        let mut state = self.inner.state.lock().unwrap();
        let index = state.pending.seq(id)?;
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
    pub(crate) fn finalize_cancelled(&self, claim: CancellationClaim) -> Result<(), String> {
        self.finalize_cancelled_with_reason(claim, "Cancelled")
    }

    fn finalize_cancelled_with_reason(
        &self,
        mut claim: CancellationClaim,
        reason: &str,
    ) -> Result<(), String> {
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
            reason: Some(reason.into()),
        };
        {
            let mut state = self.inner.state.lock().unwrap();
            remember_decision(&mut state, &request.session_id, &decision);
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
            let Some(index) = state.pending.seq(id) else {
                return Ok(false);
            };
            // Timeout dispatch may be delayed; an expired request must never
            // become an approval while its timeout task is waiting to run.
            if approved && Instant::now() >= state.pending.entries[&index].deadline {
                return Ok(false);
            }
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
                action_id: state.pending.entries[&index].request.snapshot().action_id,
                approved,
                decided_at,
                decided_via: via,
                reason,
            };
            let entry = state.pending.remove(index);
            entry.timer.abort();
            state.transitions_in_flight += 1;
            let session_id = entry.request.snapshot().session_id;
            remember_decision(&mut state, &session_id, &decision);
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
    pub fn enable_approve_all_for_session(&self, session: &str) -> Result<(), String> {
        self.set_approve_all(session, true)
    }
    pub fn disable_approve_all_for_session(&self, session: &str) -> Result<(), String> {
        self.set_approve_all(session, false)
    }
    fn set_approve_all(&self, session: &str, enabled: bool) -> Result<(), String> {
        if let Some(authority) = &self.inner.shared_override_authority {
            return authority.set(session, enabled, &self.inner.options.clock);
        }
        // Reject overlap rather than waiting: a persistence adapter may reenter this manager.
        let _transition = self.inner.override_transition.try_lock().map_err(|_| {
            "consent override transition already in progress or unavailable".to_string()
        })?;
        {
            let mut state = self.inner.state.lock().unwrap();
            if enabled && state.pending_override_clears.contains(session) {
                return Err("consent override clear must be retried before enabling".into());
            }
            if !enabled {
                state.approve_all.remove(session);
                // Record this before clock or storage callbacks can fail or unwind.
                state.pending_override_clears.insert(session.into());
            }
        }
        if let Some(store) = &self.inner.options.store {
            let at = iso((self.inner.options.clock)())?;
            store.persist_session_approve_all(session, enabled, &at)?;
        }
        let mut state = self.inner.state.lock().unwrap();
        if enabled {
            state.approve_all.insert(session.into());
        } else {
            state.pending_override_clears.remove(session);
        }
        Ok(())
    }
    pub fn is_approve_all_enabled_for_session(&self, session: &str) -> bool {
        if let Some(authority) = &self.inner.shared_override_authority {
            return authority.is_enabled(session);
        }
        self.inner
            .state
            .lock()
            .unwrap()
            .approve_all
            .contains(session)
    }
    pub fn cancel_all(&self, reason: Option<&str>) -> Result<(), String> {
        // Claim the entire snapshot before invoking fallible external callbacks.
        // Later admissions retain the existing snapshot semantics.
        let detached = {
            let mut state = self.inner.state.lock().unwrap();
            let detached = std::mem::take(&mut state.pending);
            // Keep sequence numbers monotonic across concurrent new admissions.
            state.pending.next = detached.next;
            state.transitions_in_flight += detached.len();
            if detached.len() != 0 {
                let _ = state
                    .pending_changes
                    .send(ConsentQueueEvent::SnapshotRequired);
            }
            detached
        };
        let mut first_error = None;
        for (_, entry) in detached.entries {
            entry.timer.abort();
            let claim = CancellationClaim {
                entry: Some(entry),
                inner: self.inner.clone(),
                finalized: false,
            };
            // Keep a sender for settling the waiter even if a callback panics or
            // fails after the claim has taken ownership of its entry.
            let send = claim.entry.as_ref().and_then(|entry| entry.send.clone());
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                self.finalize_cancelled_with_reason(claim, reason.unwrap_or("shutdown"))
            }));
            let error = match result {
                Ok(Ok(())) => None,
                Ok(Err(error)) => Some(error),
                Err(_) => Some("consent cancellation callback panicked".to_string()),
            };
            if let Some(error) = error {
                if let Some(send) = send {
                    let _ = send.send(Answer::Settled(Err(error.clone())));
                }
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
        first_error.map_or(Ok(()), Err)
    }
}

/// Unmounted host contract. The lease authorizes the complete binding, including
/// notification origin or override intent, and excludes revocation until release.
/// Authentication, intent-specific policy and actual override effects are host duties.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
pub(crate) trait ConsentBatchAuthority {
    type Lease<'a>
    where
        Self: 'a;
    fn acquire<'a>(
        &'a self,
        binding: &crate::security::consent_batch_operation::Binding,
    ) -> Result<Option<Self::Lease<'a>>, String>;
}

type BatchWindow = (u64, usize, Vec<(String, DecisionClaim)>);

/// Volatile operation coordinator. The host must execute these synchronous
/// methods on a supervised blocking lane and never reuse operation IDs.
#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
pub(crate) struct ConsentBatchCoordinator {
    manager: ConsentManager,
    operations: Arc<Mutex<crate::security::consent_batch_operation::ConsentBatchOperations>>,
}

#[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
struct InFlightBatch {
    operations: Arc<Mutex<crate::security::consent_batch_operation::ConsentBatchOperations>>,
    id: String,
    binding: crate::security::consent_batch_operation::Binding,
    step: u64,
    finished: bool,
}
impl Drop for InFlightBatch {
    fn drop(&mut self) {
        if !self.finished {
            let mut ops = self.operations.lock().unwrap_or_else(|e| e.into_inner());
            let _ = ops.mark_indeterminate(&self.id, &self.binding, self.step);
        }
    }
}
impl ConsentBatchCoordinator {
    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn new(manager: ConsentManager) -> Self {
        Self {
            manager,
            operations: Arc::new(Mutex::new(Default::default())),
        }
    }

    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn create<A: ConsentBatchAuthority>(
        &self,
        authority: &A,
        id: String,
        binding: crate::security::consent_batch_operation::Binding,
        now: std::time::Instant,
        lifetime: Duration,
    ) -> Result<bool, String> {
        let Some(lease) = authority.acquire(&binding)? else {
            return Ok(false);
        };
        let boundary = self.manager.batch_boundary();
        let result = self
            .operations
            .lock()
            .map_err(|_| "consent operations unavailable".to_string())?
            .create(id, binding, boundary, now, lifetime)
            .map_err(|e| format!("{e:?}"));
        drop(lease);
        result.map(|_| true)
    }

    #[allow(dead_code, reason = "Staged migration code has no runtime caller yet")]
    pub(crate) fn step<A: ConsentBatchAuthority>(
        &self,
        authority: &A,
        id: &str,
        binding: &crate::security::consent_batch_operation::Binding,
        step: u64,
        now: std::time::Instant,
    ) -> Result<Option<crate::security::consent_batch_operation::StepResult>, String> {
        use crate::security::consent_batch_operation::{Begin, StepResult};
        // Host-provided clock may execute code; do not call it under a lease.
        let prepared = self.manager.prepare_decision_time()?;
        let Some(lease) = authority.acquire(binding)? else {
            return Ok(None);
        };
        let begin = self
            .operations
            .lock()
            .map_err(|_| "consent operations unavailable".to_string())?
            .begin(id, binding, step, now)
            .map_err(|e| format!("{e:?}"))?;
        let window = match begin {
            Begin::Replay(result) => return Ok(Some(result)),
            Begin::Execute(window) => window,
        };
        let mut guard = InFlightBatch {
            operations: self.operations.clone(),
            id: id.into(),
            binding: binding.clone(),
            step,
            finished: false,
        };
        let (next_cursor, scanned_entries, claims) = self.manager.claim_batch_window(
            &binding.session,
            window.cursor,
            window.boundary,
            window.max_scan_entries,
            binding.reason.clone(),
            prepared,
        )?;
        drop(lease);
        let request_ids = claims.iter().map(|(id, _)| id.clone()).collect();
        let finalization = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            finalize_decision_batch(claims)
        }));
        match finalization {
            Ok(errors) if errors.is_empty() => {}
            Ok(_) => return Err("consent batch finalization failed".into()),
            Err(_) => return Err("consent batch finalization panicked".into()),
        }
        let result = StepResult {
            next_cursor,
            scanned_entries,
            request_ids,
            complete: next_cursor == window.boundary,
        };
        self.operations
            .lock()
            .map_err(|_| "consent operations unavailable".to_string())?
            .finish(id, binding, step, result.clone())
            .map_err(|e| format!("{e:?}"))?;
        guard.finished = true;
        Ok(Some(result))
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
    async fn owned_claim_requires_host_lease_and_releases_before_callback() {
        use crate::security::control_access::{ConsentOwnershipLease, claim_owned_consent};
        struct Host(Arc<Mutex<bool>>);
        impl ConsentOwnershipLease for Host {
            type Lease<'a> = std::sync::MutexGuard<'a, bool>;
            fn acquire<'a>(
                &'a self,
                session: &str,
                user: &str,
            ) -> Result<Option<Self::Lease<'a>>, String> {
                let guard = self.0.lock().map_err(|_| "host unavailable".to_string())?;
                if *guard && session == "session" && user == "owner" {
                    Ok(Some(guard))
                } else {
                    Ok(None)
                }
            }
        }
        let ownership = Arc::new(Mutex::new(true));
        let callback_ownership = ownership.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                assert!(
                    callback_ownership.try_lock().is_ok(),
                    "host lease held during callback"
                );
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let host = Host(ownership.clone());
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(
            claim_owned_consent(&host, &manager, "other", &handle.id, true, None)
                .unwrap()
                .is_none()
        );
        *ownership.lock().unwrap() = false;
        assert!(
            claim_owned_consent(&host, &manager, "owner", &handle.id, true, None)
                .unwrap()
                .is_none()
        );
        assert_eq!(manager.pending_count(), 1);
        *ownership.lock().unwrap() = true;
        let claim = claim_owned_consent(&host, &manager, "owner", &handle.id, true, None)
            .unwrap()
            .unwrap();
        *ownership.lock().unwrap() = false;
        claim.finalize().unwrap();
        assert!(handle.wait().await.unwrap().approved);
    }

    #[tokio::test]
    async fn cancel_all_callbacks_see_detached_snapshot_and_new_admission() {
        let manager_slot: Arc<Mutex<Option<ConsentManager>>> = Arc::new(Mutex::new(None));
        let slot = manager_slot.clone();
        let admitted: Arc<Mutex<Option<ConsentHandle>>> = Arc::new(Mutex::new(None));
        let new_handle = admitted.clone();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let observed = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                let manager = slot.lock().unwrap().as_ref().unwrap().clone();
                if observed.fetch_add(1, Ordering::SeqCst) == 0 {
                    assert_eq!(manager.pending_count(), 0);
                    *new_handle.lock().unwrap() =
                        Some(manager.request_consent(cancellation_request()).unwrap());
                } else {
                    assert_eq!(manager.pending_count(), 1);
                }
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        *manager_slot.lock().unwrap() = Some(manager.clone());
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        manager.cancel_all(None).unwrap();
        assert!(!first.wait().await.unwrap().approved);
        assert!(!second.wait().await.unwrap().approved);
        let new_id = admitted.lock().unwrap().as_ref().unwrap().id.clone();
        assert!(manager.get_request(&new_id).is_some());
        assert_eq!(manager.pending_count(), 1);
        *manager_slot.lock().unwrap() = None;
    }

    #[tokio::test]
    async fn cancel_all_claims_every_request_before_observer_failure() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let observed = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                if observed.fetch_add(1, Ordering::SeqCst) == 0 {
                    Err("observer failed".into())
                } else {
                    Ok(())
                }
            })),
            ..ConsentManagerOptions::default()
        });
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        assert_eq!(
            manager.cancel_all(Some("shutdown test")).unwrap_err(),
            "observer failed"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(manager.pending_count(), 0);
        assert!(!manager.approve(&first.id, None, None).unwrap());
        assert!(!manager.approve(&second.id, None, None).unwrap());
        assert_eq!(first.wait().await.unwrap_err(), "observer failed");
        let decision = second.wait().await.unwrap();
        assert!(!decision.approved);
        assert_eq!(decision.reason.as_deref(), Some("shutdown test"));
        assert!(manager.pending_snapshot().is_err());
    }

    #[tokio::test]
    async fn cancel_all_continues_and_settles_after_observer_panic() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let observed = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                if observed.fetch_add(1, Ordering::SeqCst) == 0 {
                    panic!("observer panic");
                }
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        assert_eq!(
            manager.cancel_all(None).unwrap_err(),
            "consent cancellation callback panicked"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(manager.pending_count(), 0);
        assert!(first.wait().await.is_err());
        assert!(!second.wait().await.unwrap().approved);
    }

    #[tokio::test]
    async fn cancel_all_settles_all_after_clock_failure() {
        let clock = Arc::new(AtomicI64::new(0));
        let current = clock.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            clock: Arc::new(move || current.load(Ordering::SeqCst)),
            ..ConsentManagerOptions::default()
        });
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        clock.store(i64::MAX, Ordering::SeqCst);
        assert!(manager.cancel_all(None).is_err());
        assert_eq!(manager.pending_count(), 0);
        assert!(first.wait().await.is_err());
        assert!(second.wait().await.is_err());
        assert!(!manager.approve(&first.id, None, None).unwrap());
        assert!(!manager.approve(&second.id, None, None).unwrap());
    }

    #[tokio::test]
    async fn public_approval_cannot_claim_expired_request_before_timeout_dispatch() {
        let manager = ConsentManager::default();
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        {
            let mut state = manager.inner.state.lock().unwrap();
            let seq = state.pending.seq(&handle.id).unwrap();
            state.pending.entries.get_mut(&seq).unwrap().deadline =
                Instant::now() - Duration::from_secs(1);
        }
        assert!(!manager.approve(&handle.id, None, None).unwrap());
        assert_eq!(manager.pending_count(), 1);
        assert!(handle.outcome().is_none());
        assert!(manager.timeout(&handle.id).unwrap());
        let decision = handle.wait().await.unwrap();
        assert!(!decision.approved);
        assert_eq!(decision.decided_via, DecisionVia::Timeout);
        assert_eq!(manager.pending_count(), 0);
    }

    struct BatchTestAuthority(Arc<Mutex<bool>>);
    impl ConsentBatchAuthority for BatchTestAuthority {
        type Lease<'a> = std::sync::MutexGuard<'a, bool>;
        fn acquire<'a>(
            &'a self,
            binding: &crate::security::consent_batch_operation::Binding,
        ) -> Result<Option<Self::Lease<'a>>, String> {
            let guard = self.0.lock().unwrap();
            if *guard
                && binding.principal == "owner"
                && binding.session == "session"
                && matches!(
                    binding.intent,
                    crate::security::consent_batch_operation::Intent::SessionOverride
                )
            {
                Ok(Some(guard))
            } else {
                Ok(None)
            }
        }
    }
    fn batch_binding() -> crate::security::consent_batch_operation::Binding {
        crate::security::consent_batch_operation::Binding {
            principal: "owner".into(),
            session: "session".into(),
            intent: crate::security::consent_batch_operation::Intent::SessionOverride,
            reason: None,
        }
    }

    #[tokio::test]
    async fn batch_coordinator_reauthorizes_replay_and_releases_before_callback() {
        let ownership = Arc::new(Mutex::new(true));
        let callback_ownership = ownership.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                assert!(callback_ownership.try_lock().is_ok());
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let coordinator = ConsentBatchCoordinator::new(manager.clone());
        let authority = BatchTestAuthority(ownership.clone());
        let binding = batch_binding();
        let now = std::time::Instant::now();
        assert!(
            coordinator
                .create(
                    &authority,
                    "operation".into(),
                    binding.clone(),
                    now,
                    Duration::from_secs(30)
                )
                .unwrap()
        );
        let later = manager.request_consent(cancellation_request()).unwrap();
        let result = coordinator
            .step(&authority, "operation", &binding, 0, now)
            .unwrap()
            .unwrap();
        assert!(result.complete);
        assert_eq!(result.request_ids, vec![first.id.clone()]);
        assert!(first.wait().await.unwrap().approved);
        assert!(manager.get_request(&later.id).is_some());
        *ownership.lock().unwrap() = false;
        assert!(
            coordinator
                .step(&authority, "operation", &binding, 0, now)
                .unwrap()
                .is_none()
        );
        *ownership.lock().unwrap() = true;
        assert_eq!(
            coordinator
                .step(&authority, "operation", &binding, 0, now)
                .unwrap(),
            Some(result)
        );
    }

    #[tokio::test]
    async fn batch_coordinator_failure_is_indeterminate_and_does_not_retry() {
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
            ..ConsentManagerOptions::default()
        });
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        let coordinator = ConsentBatchCoordinator::new(manager.clone());
        let authority = BatchTestAuthority(Arc::new(Mutex::new(true)));
        let binding = batch_binding();
        let now = std::time::Instant::now();
        coordinator
            .create(
                &authority,
                "operation".into(),
                binding.clone(),
                now,
                Duration::from_secs(30),
            )
            .unwrap();
        assert!(
            coordinator
                .step(&authority, "operation", &binding, 0, now)
                .is_err()
        );
        assert_eq!(
            coordinator
                .step(&authority, "operation", &binding, 0, now)
                .unwrap_err(),
            "Indeterminate"
        );
        assert!(!manager.approve(&handle.id, None, None).unwrap());
        assert_eq!(
            handle.wait().await.unwrap_err(),
            "consent decision finalization failed"
        );
    }

    #[test]
    fn abandoned_in_flight_batch_is_not_replayed() {
        use crate::security::consent_batch_operation::{Begin, ConsentBatchOperations, Error};
        let operations = Arc::new(Mutex::new(ConsentBatchOperations::default()));
        let binding = batch_binding();
        let now = std::time::Instant::now();
        operations
            .lock()
            .unwrap()
            .create(
                "abandoned".into(),
                binding.clone(),
                1,
                now,
                Duration::from_secs(30),
            )
            .unwrap();
        assert!(matches!(
            operations
                .lock()
                .unwrap()
                .begin("abandoned", &binding, 0, now),
            Ok(Begin::Execute(_))
        ));
        let guard = InFlightBatch {
            operations: operations.clone(),
            id: "abandoned".into(),
            binding: binding.clone(),
            step: 0,
            finished: false,
        };
        drop(guard);
        assert_eq!(
            operations
                .lock()
                .unwrap()
                .begin("abandoned", &binding, 0, now),
            Err(Error::Indeterminate)
        );
    }

    #[tokio::test]
    async fn batch_coordinator_panic_settles_claims_and_disallows_retry() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let observed = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                if observed.fetch_add(1, Ordering::SeqCst) == 0 {
                    panic!("observer panic");
                }
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        let coordinator = ConsentBatchCoordinator::new(manager.clone());
        let authority = BatchTestAuthority(Arc::new(Mutex::new(true)));
        let binding = batch_binding();
        let now = std::time::Instant::now();
        coordinator
            .create(
                &authority,
                "panic".into(),
                binding.clone(),
                now,
                Duration::from_secs(30),
            )
            .unwrap();
        assert_eq!(
            coordinator
                .step(&authority, "panic", &binding, 0, now)
                .unwrap_err(),
            "consent batch finalization panicked"
        );
        assert_eq!(
            coordinator
                .step(&authority, "panic", &binding, 0, now)
                .unwrap_err(),
            "Indeterminate"
        );
        assert_eq!(
            first.wait().await.unwrap_err(),
            "consent decision finalization failed"
        );
        assert!(second.wait().await.unwrap().approved);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert!(manager.pending_snapshot().is_err());
    }

    #[tokio::test]
    async fn operation_windows_bound_scan_and_exclude_later_admissions() {
        let manager = ConsentManager::default();
        let mut expired = Vec::new();
        for _ in 0..MAX_LEASED_BATCH_SCAN {
            expired.push(manager.request_consent(cancellation_request()).unwrap());
        }
        let mut original = manager.request_consent(cancellation_request()).unwrap();
        {
            let mut state = manager.inner.state.lock().unwrap();
            for handle in &expired {
                let seq = state.pending.seq(&handle.id).unwrap();
                state.pending.entries.get_mut(&seq).unwrap().deadline =
                    Instant::now() - Duration::from_secs(1);
            }
        }
        let boundary = manager.batch_boundary();
        let later = manager.request_consent(cancellation_request()).unwrap();
        let (cursor, scanned, claims) = manager
            .claim_batch_window(
                "session",
                0,
                boundary,
                MAX_LEASED_BATCH_SCAN,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap();
        assert_eq!(cursor, MAX_LEASED_BATCH_SCAN as u64);
        assert_eq!(scanned, MAX_LEASED_BATCH_SCAN);
        assert!(claims.is_empty());
        let (next, scanned, claims) = manager
            .claim_batch_window(
                "session",
                cursor,
                boundary,
                MAX_LEASED_BATCH_SCAN,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap();
        assert_eq!(next, boundary);
        assert_eq!(scanned, 1);
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].0, original.id);
        assert!(finalize_decision_batch(claims).is_empty());
        assert!(original.wait().await.unwrap().approved);
        assert!(manager.get_request(&later.id).is_some());
        assert!(
            manager
                .claim_batch_window(
                    "session",
                    boundary + 1,
                    boundary,
                    MAX_LEASED_BATCH_SCAN,
                    None,
                    manager.prepare_decision_time().unwrap()
                )
                .is_err()
        );
    }

    #[tokio::test]
    async fn leased_batch_limits_reject_without_claiming() {
        let manager = ConsentManager::default();
        let first = manager.request_consent(cancellation_request()).unwrap();
        let result = manager.claim_batch_for_session(
            "session",
            MAX_LEASED_BATCH_CLAIMS + 1,
            None,
            manager.prepare_decision_time().unwrap(),
        );
        assert!(matches!(result, Err(ref error) if error == "consent batch limit exceeded"));
        assert!(manager.get_request(&first.id).is_some());
    }

    #[tokio::test]
    async fn owned_batch_claim_requires_lease_and_releases_before_callbacks() {
        use crate::security::control_access::{ConsentOwnershipLease, claim_owned_consent_batch};
        struct Host(Arc<Mutex<bool>>);
        impl ConsentOwnershipLease for Host {
            type Lease<'a> = std::sync::MutexGuard<'a, bool>;
            fn acquire<'a>(
                &'a self,
                session: &str,
                user: &str,
            ) -> Result<Option<Self::Lease<'a>>, String> {
                let guard = self.0.lock().map_err(|_| "host unavailable".to_string())?;
                if *guard && session == "session" && user == "owner" {
                    Ok(Some(guard))
                } else {
                    Ok(None)
                }
            }
        }
        let ownership = Arc::new(Mutex::new(true));
        let callback_ownership = ownership.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                assert!(
                    callback_ownership.try_lock().is_ok(),
                    "host lease held during callback"
                );
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let host = Host(ownership.clone());
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let second = manager.request_consent(cancellation_request()).unwrap();
        let mut foreign = cancellation_request();
        foreign.session_id = "other".into();
        let _foreign = manager.request_consent(foreign).unwrap();
        assert!(
            claim_owned_consent_batch(&host, &manager, "other", "session", 2, None)
                .unwrap()
                .is_none()
        );
        *ownership.lock().unwrap() = false;
        assert!(
            claim_owned_consent_batch(&host, &manager, "owner", "session", 2, None)
                .unwrap()
                .is_none()
        );
        assert_eq!(manager.pending_count(), 3);
        *ownership.lock().unwrap() = true;
        let claims = claim_owned_consent_batch(&host, &manager, "owner", "session", 1, None)
            .unwrap()
            .unwrap();
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].0, first.id);
        *ownership.lock().unwrap() = false;
        for (_, claim) in claims {
            claim.finalize().unwrap();
        }
        assert!(first.wait().await.unwrap().approved);
        assert_eq!(manager.pending_count(), 2);
        assert!(manager.get_request(&second.id).is_some());
    }

    #[tokio::test]
    async fn session_claim_matches_atomically_and_finalizes_outside_queue_lock() {
        let holder = Arc::new(Mutex::new(None::<ConsentManager>));
        let callback_holder = holder.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                let m = callback_holder.lock().unwrap().clone().unwrap();
                assert_eq!(m.pending_count(), 0);
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        *holder.lock().unwrap() = Some(manager.clone());
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(
            manager
                .claim_for_session(
                    &handle.id,
                    "other",
                    true,
                    DecisionVia::Click,
                    None,
                    manager.prepare_decision_time().unwrap()
                )
                .unwrap()
                .is_none()
        );
        assert_eq!(manager.pending_count(), 1);
        let claim = manager
            .claim_for_session(
                &handle.id,
                "session",
                true,
                DecisionVia::Click,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap()
            .unwrap();
        assert!(!manager.reject(&handle.id, None, None).unwrap());
        assert!(manager.reconcile_observed(&[handle.id.clone()]).is_err());
        claim.finalize().unwrap();
        assert!(handle.wait().await.unwrap().approved);
        assert!(
            matches!(&manager.reconcile_observed(&[handle.id]).unwrap()[0], ReconciledConsent::Resolved { decision, .. } if decision.approved)
        );
    }

    #[tokio::test]
    async fn batch_claim_is_session_scoped_bounded_and_finalizes_after_unlock() {
        let manager = ConsentManager::default();
        let mut first = manager.request_consent(cancellation_request()).unwrap();
        let mut other_request = cancellation_request();
        other_request.session_id = "other".into();
        let _other = manager.request_consent(other_request).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        let foreign = ConsentManager::default().prepare_decision_time().unwrap();
        assert!(
            manager
                .claim_batch_for_session("session", 1, None, foreign)
                .is_err()
        );
        let claims = manager
            .claim_batch_for_session("session", 1, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].0, first.id);
        assert_eq!(manager.pending_count(), 2);
        for (_, claim) in claims {
            claim.finalize().unwrap();
        }
        assert!(first.wait().await.unwrap().approved);
        let claims = manager
            .claim_batch_for_session(
                "session",
                10,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap();
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].0, second.id);
        for (_, claim) in claims {
            claim.finalize().unwrap();
        }
        assert!(second.wait().await.unwrap().approved);
        assert_eq!(manager.pending_count(), 1);
    }

    #[tokio::test]
    async fn indexed_pending_preserves_order_across_removals() {
        let manager = ConsentManager::default();
        let first = manager.request_consent(cancellation_request()).unwrap();
        let mut foreign_request = cancellation_request();
        foreign_request.session_id = "foreign".into();
        let foreign = manager.request_consent(foreign_request).unwrap();
        let cancelled = manager.request_consent(cancellation_request()).unwrap();
        let timed_out = manager.request_consent(cancellation_request()).unwrap();
        let last = manager.request_consent(cancellation_request()).unwrap();
        let ids: Vec<_> = manager
            .pending_snapshot()
            .unwrap()
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(
            ids,
            vec![
                first.id.clone(),
                foreign.id.clone(),
                cancelled.id.clone(),
                timed_out.id.clone(),
                last.id.clone()
            ]
        );
        let claim = manager.claim_cancelled(&cancelled.id).unwrap();
        manager.finalize_cancelled(claim).unwrap();
        assert!(manager.timeout(&timed_out.id).unwrap());
        assert!(manager.get_request(&cancelled.id).is_none());
        assert!(manager.get_request(&timed_out.id).is_none());
        let claims = manager
            .claim_batch_for_session("session", 2, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        assert_eq!(
            claims.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>(),
            vec![first.id, last.id]
        );
        assert!(finalize_decision_batch(claims).is_empty());
        let ids: Vec<_> = manager
            .pending_snapshot()
            .unwrap()
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(ids, vec![foreign.id]);
    }

    #[tokio::test]
    async fn indexed_batch_retry_passes_expired_entries_without_losing_live() {
        let manager = ConsentManager::default();
        for _ in 0..MAX_LEASED_BATCH_SCAN {
            manager.request_consent(cancellation_request()).unwrap();
        }
        let live = manager.request_consent(cancellation_request()).unwrap();
        {
            let mut state = manager.inner.state.lock().unwrap();
            for entry in state
                .pending
                .entries
                .values_mut()
                .take(MAX_LEASED_BATCH_SCAN)
            {
                entry.deadline = Instant::now() - Duration::from_secs(1);
            }
        }
        let error = manager
            .claim_batch_for_session("session", 1, None, manager.prepare_decision_time().unwrap())
            .err()
            .unwrap();
        assert_eq!(error, "consent batch scan incomplete; retry required");
        assert_eq!(manager.pending_count(), MAX_LEASED_BATCH_SCAN + 1);
        let claims = manager
            .claim_batch_for_session("session", 1, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        assert_eq!(claims[0].0, live.id);
        assert!(finalize_decision_batch(claims).is_empty());
    }

    #[tokio::test]
    async fn batch_claim_skips_expired_entries_and_honors_zero_limit() {
        let manager = ConsentManager::default();
        let expired = manager.request_consent(cancellation_request()).unwrap();
        let mut live = manager.request_consent(cancellation_request()).unwrap();
        {
            let mut state = manager.inner.state.lock().unwrap();
            state.pending.entries.values_mut().next().unwrap().deadline =
                Instant::now() - std::time::Duration::from_secs(1);
        }
        let empty = manager
            .claim_batch_for_session("session", 0, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        assert!(empty.is_empty());
        assert_eq!(manager.pending_count(), 2);
        let claims = manager
            .claim_batch_for_session("session", 1, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        assert_eq!(claims.len(), 1);
        assert_eq!(claims[0].0, live.id);
        assert_eq!(manager.pending_count(), 1);
        assert!(expired.outcome().is_none());
        for (_, claim) in claims {
            claim.finalize().unwrap();
        }
        assert!(live.wait().await.unwrap().approved);
    }

    #[tokio::test]
    async fn batch_finalization_continues_after_observer_failure() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = Arc::new(AtomicUsize::new(0));
        let observer_calls = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                if observer_calls.fetch_add(1, Ordering::SeqCst) == 0 {
                    Err("observer failed".into())
                } else {
                    Ok(())
                }
            })),
            ..ConsentManagerOptions::default()
        });
        let first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        let claims = manager
            .claim_batch_for_session("session", 2, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        let errors = finalize_decision_batch(claims);
        assert_eq!(errors, vec![(first.id.clone(), "observer failed".into())]);
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(
            first.outcome(),
            Some(Err("consent decision finalization failed".into()))
        );
        assert!(second.wait().await.unwrap().approved);
        assert!(manager.reconcile_observed(&[first.id]).is_err());
    }

    #[tokio::test]
    async fn batch_finalization_attempts_remaining_claims_before_resuming_panic() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let calls = Arc::new(AtomicUsize::new(0));
        let observer_calls = calls.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(move |_| {
                if observer_calls.fetch_add(1, Ordering::SeqCst) == 0 {
                    panic!("observer panic");
                }
                Ok(())
            })),
            ..ConsentManagerOptions::default()
        });
        let first = manager.request_consent(cancellation_request()).unwrap();
        let mut second = manager.request_consent(cancellation_request()).unwrap();
        let claims = manager
            .claim_batch_for_session("session", 2, None, manager.prepare_decision_time().unwrap())
            .unwrap();
        let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            finalize_decision_batch(claims)
        }));
        assert!(panic.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert!(second.wait().await.unwrap().approved);
        assert!(manager.reconcile_observed(&[first.id]).is_err());
    }

    #[tokio::test]
    async fn finalized_session_claim_wakes_provisional_event_consumers() {
        let manager = ConsentManager::default();
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let (_, mut events) = manager.try_subscribe_pending_changes().unwrap();
        let claim = manager
            .claim_for_session(
                &handle.id,
                "session",
                true,
                DecisionVia::Click,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap()
            .unwrap();
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::Resolved { .. })
        ));
        assert!(
            manager
                .reconcile_observed(std::slice::from_ref(&handle.id))
                .is_err()
        );
        claim.finalize().unwrap();
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
        assert!(matches!(
            &manager.reconcile_observed(&[handle.id]).unwrap()[0],
            ReconciledConsent::Resolved { decision, .. } if decision.approved
        ));
    }

    #[tokio::test]
    async fn abandoned_session_claim_fails_recovery_closed() {
        let manager = ConsentManager::default();
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        let claim = manager
            .claim_for_session(
                &handle.id,
                "session",
                false,
                DecisionVia::Click,
                None,
                manager.prepare_decision_time().unwrap(),
            )
            .unwrap()
            .unwrap();
        drop(claim);
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(1), handle.wait())
                .await
                .unwrap()
                .unwrap_err(),
            "consent decision claim abandoned"
        );
        assert!(manager.reconcile_observed(&[handle.id.clone()]).is_err());
        assert!(!manager.approve(&handle.id, None, None).unwrap());
    }

    #[tokio::test]
    async fn reconciliation_recovers_timed_out_decision() {
        let manager = ConsentManager::default();
        let mut input = cancellation_request();
        input.timeout_ms = Some(5.0);
        let mut handle = manager.request_consent(input).unwrap();
        let decision = tokio::time::timeout(Duration::from_secs(2), handle.wait())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(decision.decided_via, DecisionVia::Timeout);
        assert!(!decision.approved);
        let recovered = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match manager.reconcile_observed(&[handle.id.clone()]) {
                    Ok(recovered) => break recovered,
                    Err("consent transition finalization in progress") => {
                        tokio::task::yield_now().await
                    }
                    Err(error) => panic!("unexpected reconciliation error: {error}"),
                }
            }
        })
        .await
        .unwrap();
        assert!(
            matches!(&recovered[0], ReconciledConsent::Resolved { session_id, decision } if session_id == "session" && decision.decided_via == DecisionVia::Timeout && !decision.approved)
        );
    }

    #[tokio::test]
    async fn regular_decision_wakes_recovery_after_finalization() {
        let manager = ConsentManager::default();
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let (_, mut events) = manager.try_subscribe_pending_changes().unwrap();
        assert!(manager.approve(&handle.id, None, None).unwrap());
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::Resolved { .. })
        ));
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
        assert!(
            matches!(&manager.reconcile_observed(&[handle.id]).unwrap()[0],
            ReconciledConsent::Resolved { decision, .. } if decision.approved)
        );
        assert!(events.try_recv().is_err());
    }

    #[tokio::test]
    async fn reconciliation_fails_closed_after_decision_observer_error() {
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
            ..ConsentManagerOptions::default()
        });
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let (_, mut events) = manager.try_subscribe_pending_changes().unwrap();
        assert!(manager.approve(&handle.id, None, None).is_err());
        assert!(manager.reconcile_observed(&[handle.id]).is_err());
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::Resolved { .. })
        ));
        assert!(matches!(
            events.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
    }

    #[tokio::test]
    async fn reconciliation_fails_closed_after_cancel_observer_error() {
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
            ..ConsentManagerOptions::default()
        });
        let handle = manager.request_consent(cancellation_request()).unwrap();
        let claim = manager.claim_cancelled(&handle.id).unwrap();
        assert!(manager.finalize_cancelled(claim).is_err());
        assert!(manager.reconcile_observed(&[handle.id]).is_err());
    }

    #[tokio::test]
    async fn observed_decisions_reconcile_and_eviction_fails_closed() {
        let manager = ConsentManager::default();
        let first = manager.request_consent(cancellation_request()).unwrap();
        let pending = manager.request_consent(cancellation_request()).unwrap();
        manager.approve(&first.id, None, None).unwrap();
        let recovered = manager
            .reconcile_observed(&[first.id.clone(), pending.id.clone()])
            .unwrap();
        assert!(
            matches!(&recovered[0], ReconciledConsent::Resolved { session_id, decision } if session_id == "session" && decision.approved)
        );
        assert!(
            matches!(&recovered[1], ReconciledConsent::Pending(identity) if identity.id == pending.id)
        );
        let claim = manager.claim_cancelled(&pending.id).unwrap();
        assert!(
            manager
                .reconcile_observed(std::slice::from_ref(&pending.id))
                .is_err()
        );
        manager.finalize_cancelled(claim).unwrap();
        assert!(
            matches!(&manager.reconcile_observed(std::slice::from_ref(&pending.id)).unwrap()[0], ReconciledConsent::Resolved { decision, .. } if !decision.approved)
        );
        for _ in 0..MAX_RECENT_DECISIONS {
            let item = manager.request_consent(cancellation_request()).unwrap();
            manager.reject(&item.id, None, None).unwrap();
        }
        assert!(manager.reconcile_observed(&[first.id]).is_err());
        assert!(manager.reconcile_observed(&["unknown".into()]).is_err());
        assert!(
            manager
                .reconcile_observed(&[pending.id.clone(), pending.id])
                .is_err()
        );
        assert!(
            manager
                .reconcile_observed(&vec![String::new(); MAX_SNAPSHOT_ITEMS + 1])
                .is_err()
        );
        assert!(
            manager
                .reconcile_observed(&["x".repeat(MAX_SNAPSHOT_ID_BYTES + 1)])
                .is_err()
        );
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
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::Resolved { .. })
        ));
        assert!(matches!(
            changes.try_recv(),
            Ok(ConsentQueueEvent::SnapshotRequired)
        ));
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
        let mut handle = manager.request_consent(cancellation_request()).unwrap();
        assert!(manager.approve(&handle.id, None, None).is_err());
        assert!(manager.pending_snapshot().is_err());
        assert!(manager.try_subscribe_pending_changes().is_err());
        // The TypeScript observer failure leaves the original promise pending.
        assert!(
            tokio::time::timeout(Duration::from_millis(20), handle.wait())
                .await
                .is_err()
        );

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

    #[test]
    fn concurrent_override_transition_is_rejected_and_can_be_retried() {
        use std::sync::mpsc;
        struct DelayedStore {
            entered: Mutex<mpsc::Sender<()>>,
            release: Mutex<mpsc::Receiver<()>>,
            persisted: Mutex<bool>,
        }
        impl ConsentPersistence for DelayedStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(if *self.persisted.lock().unwrap() {
                    vec!["session".into()]
                } else {
                    vec![]
                })
            }
            fn persist_session_approve_all(
                &self,
                _: &str,
                enabled: bool,
                _: &str,
            ) -> Result<(), String> {
                if enabled {
                    self.entered.lock().unwrap().send(()).unwrap();
                    self.release
                        .lock()
                        .unwrap()
                        .recv_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                }
                *self.persisted.lock().unwrap() = enabled;
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let store = Arc::new(DelayedStore {
            entered: Mutex::new(entered_tx),
            release: Mutex::new(release_rx),
            persisted: Mutex::new(false),
        });
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        let other = manager.clone();
        let enabling = std::thread::spawn(move || other.enable_approve_all_for_session("session"));
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(manager.disable_approve_all_for_session("session").is_err());
        release_tx.send(()).unwrap();
        enabling.join().unwrap().unwrap();
        manager.disable_approve_all_for_session("session").unwrap();
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        let restarted = ConsentManager::new(ConsentManagerOptions {
            store: Some(store),
            ..ConsentManagerOptions::default()
        });
        assert!(!restarted.is_approve_all_enabled_for_session("session"));
    }

    #[test]
    fn reentrant_override_persistence_is_rejected_without_deadlock() {
        struct ReentrantStore {
            manager: Mutex<Option<ConsentManager>>,
            nested_result: Mutex<Option<Result<(), String>>>,
        }
        impl ConsentPersistence for ReentrantStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(vec![])
            }
            fn persist_session_approve_all(
                &self,
                session: &str,
                _: bool,
                _: &str,
            ) -> Result<(), String> {
                let manager = self.manager.lock().unwrap().as_ref().unwrap().clone();
                *self.nested_result.lock().unwrap() =
                    Some(manager.disable_approve_all_for_session(session));
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let store = Arc::new(ReentrantStore {
            manager: Mutex::new(None),
            nested_result: Mutex::new(None),
        });
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        *store.manager.lock().unwrap() = Some(manager.clone());
        manager.enable_approve_all_for_session("session").unwrap();
        assert!(store.nested_result.lock().unwrap().take().unwrap().is_err());
        assert!(manager.is_approve_all_enabled_for_session("session"));
        // Break the test fixture's reference cycle.
        store.manager.lock().unwrap().take();
    }

    // Diagnostic: a failed durable clear can restore a revoked override on restart.
    #[test]
    fn failed_override_clear_can_reappear_after_restart() {
        struct FailedClear;
        impl ConsentPersistence for FailedClear {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(vec!["session".into()])
            }
            fn persist_session_approve_all(&self, _: &str, _: bool, _: &str) -> Result<(), String> {
                Err("storage unavailable".into())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let store = Arc::new(FailedClear);
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        assert!(manager.is_approve_all_enabled_for_session("session"));
        assert!(manager.disable_approve_all_for_session("session").is_err());
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        let restarted = ConsentManager::new(ConsentManagerOptions {
            store: Some(store),
            ..ConsentManagerOptions::default()
        });
        assert!(restarted.is_approve_all_enabled_for_session("session"));
    }

    #[test]
    fn shared_override_authority_fails_closed_on_restart_and_coordinates_managers() {
        struct Store {
            enabled: Mutex<bool>,
            fail_clear: std::sync::atomic::AtomicBool,
        }
        impl ConsentPersistence for Store {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(if *self.enabled.lock().unwrap() {
                    vec!["session".into()]
                } else {
                    vec![]
                })
            }
            fn persist_session_approve_all(
                &self,
                _: &str,
                enabled: bool,
                _: &str,
            ) -> Result<(), String> {
                if !enabled && self.fail_clear.load(Ordering::SeqCst) {
                    return Err("unavailable".into());
                }
                *self.enabled.lock().unwrap() = enabled;
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let store = Arc::new(Store {
            enabled: Mutex::new(true),
            fail_clear: std::sync::atomic::AtomicBool::new(false),
        });
        let authority = Arc::new(SharedOverrideAuthority::new(Some(store.clone())));
        let first = ConsentManager::new_with_shared_override_authority(
            ConsentManagerOptions::default(),
            authority.clone(),
        );
        let second = ConsentManager::new_with_shared_override_authority(
            ConsentManagerOptions::default(),
            authority,
        );
        assert!(!first.is_approve_all_enabled_for_session("session"));
        first.enable_approve_all_for_session("session").unwrap();
        assert!(second.is_approve_all_enabled_for_session("session"));
        second.disable_approve_all_for_session("session").unwrap();
        assert!(!first.is_approve_all_enabled_for_session("session"));
        first.enable_approve_all_for_session("session").unwrap();
        store.fail_clear.store(true, Ordering::SeqCst);
        assert!(second.disable_approve_all_for_session("session").is_err());
        assert!(!first.is_approve_all_enabled_for_session("session"));
        assert!(first.enable_approve_all_for_session("session").is_err());
        assert!(*store.enabled.lock().unwrap());
        let restarted = ConsentManager::new_with_shared_override_authority(
            ConsentManagerOptions::default(),
            Arc::new(SharedOverrideAuthority::new(Some(store.clone()))),
        );
        assert!(!restarted.is_approve_all_enabled_for_session("session"));
    }

    #[test]
    fn shared_authority_rejects_cross_manager_overlap_and_reentry() {
        use std::sync::mpsc;
        struct BlockingStore {
            entered: Mutex<mpsc::Sender<()>>,
            release: Mutex<mpsc::Receiver<()>>,
            nested: Mutex<Option<ConsentManager>>,
            nested_rejected: Mutex<bool>,
            persisted: Mutex<bool>,
        }
        impl ConsentPersistence for BlockingStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(vec![])
            }
            fn persist_session_approve_all(
                &self,
                _: &str,
                enabled: bool,
                _: &str,
            ) -> Result<(), String> {
                if enabled {
                    let nested = self.nested.lock().unwrap().clone().unwrap();
                    *self.nested_rejected.lock().unwrap() =
                        nested.disable_approve_all_for_session("session").is_err();
                    self.entered.lock().unwrap().send(()).unwrap();
                    self.release
                        .lock()
                        .unwrap()
                        .recv_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                }
                *self.persisted.lock().unwrap() = enabled;
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let store = Arc::new(BlockingStore {
            entered: Mutex::new(entered_tx),
            release: Mutex::new(release_rx),
            nested: Mutex::new(None),
            nested_rejected: Mutex::new(false),
            persisted: Mutex::new(false),
        });
        let authority = Arc::new(SharedOverrideAuthority::new(Some(store.clone())));
        let first = ConsentManager::new_with_shared_override_authority(
            ConsentManagerOptions::default(),
            authority.clone(),
        );
        let second = ConsentManager::new_with_shared_override_authority(
            ConsentManagerOptions::default(),
            authority,
        );
        *store.nested.lock().unwrap() = Some(second.clone());
        let enabling = std::thread::spawn(move || first.enable_approve_all_for_session("session"));
        entered_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert!(*store.nested_rejected.lock().unwrap());
        assert!(!second.is_approve_all_enabled_for_session("session"));
        assert!(second.disable_approve_all_for_session("session").is_err());
        release_tx.send(()).unwrap();
        enabling.join().unwrap().unwrap();
        assert!(second.is_approve_all_enabled_for_session("session"));
        second.disable_approve_all_for_session("session").unwrap();
        assert!(!second.is_approve_all_enabled_for_session("session"));
        assert!(!*store.persisted.lock().unwrap());
        *store.nested.lock().unwrap() = None;
    }

    // Diagnostic: separate managers retain independent authorization caches even after
    // a successful durable clear. This must become an acceptance test when the
    // shared host authority is integrated.
    #[test]
    fn independent_manager_retains_override_after_successful_clear_diagnostic() {
        struct SharedStore(Mutex<bool>);
        impl ConsentPersistence for SharedStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(if *self.0.lock().unwrap() {
                    vec!["session".into()]
                } else {
                    vec![]
                })
            }
            fn persist_session_approve_all(
                &self,
                _: &str,
                enabled: bool,
                _: &str,
            ) -> Result<(), String> {
                *self.0.lock().unwrap() = enabled;
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let store = Arc::new(SharedStore(Mutex::new(true)));
        let first = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        let second = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        first.disable_approve_all_for_session("session").unwrap();
        assert!(!*store.0.lock().unwrap());
        assert!(!first.is_approve_all_enabled_for_session("session"));
        assert!(second.is_approve_all_enabled_for_session("session"));
    }

    #[test]
    fn failed_override_clear_can_be_retried_after_storage_recovers() {
        struct RecoverableStore {
            enabled: Mutex<bool>,
            fail_clear: std::sync::atomic::AtomicBool,
        }
        impl ConsentPersistence for RecoverableStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(if *self.enabled.lock().unwrap() {
                    vec!["session".into()]
                } else {
                    vec![]
                })
            }
            fn persist_session_approve_all(
                &self,
                _: &str,
                enabled: bool,
                _: &str,
            ) -> Result<(), String> {
                if !enabled && self.fail_clear.load(Ordering::SeqCst) {
                    return Err("storage unavailable".into());
                }
                *self.enabled.lock().unwrap() = enabled;
                Ok(())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let store = Arc::new(RecoverableStore {
            enabled: Mutex::new(true),
            fail_clear: std::sync::atomic::AtomicBool::new(true),
        });
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(store.clone()),
            ..ConsentManagerOptions::default()
        });
        assert!(manager.disable_approve_all_for_session("session").is_err());
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        assert!(*store.enabled.lock().unwrap());
        assert!(manager.enable_approve_all_for_session("session").is_err());
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        store.fail_clear.store(false, Ordering::SeqCst);
        assert!(manager.enable_approve_all_for_session("session").is_err());
        manager.disable_approve_all_for_session("session").unwrap();
        let restarted = ConsentManager::new(ConsentManagerOptions {
            store: Some(store),
            ..ConsentManagerOptions::default()
        });
        assert!(!restarted.is_approve_all_enabled_for_session("session"));
        manager.enable_approve_all_for_session("session").unwrap();
        assert!(manager.is_approve_all_enabled_for_session("session"));
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
        assert!(manager.enable_approve_all_for_session("session").is_err());
        assert!(!manager.is_approve_all_enabled_for_session("session"));
        assert!(manager.disable_approve_all_for_session("session").is_err());
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
