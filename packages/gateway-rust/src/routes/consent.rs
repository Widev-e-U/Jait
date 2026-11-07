//! Opt-in consent presentation over the native queue. Ownership and audit adapters
//! are mandatory host inputs; all synchronous policy/storage work uses a bounded lane.
use super::auth::{self, AuthState, response};
use crate::{
    db::identifiers::uuidv7,
    runtime::blocking::BlockingLane,
    security::{
        consent_manager::{
            ConsentManager, ConsentQueueEvent, ConsentStatus, DecisionVia, ReconciledConsent,
        },
        tool_permissions::ToolPermission,
    },
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{get, post},
};
use serde_json::{Value, json};
use std::sync::Arc;

/// The host supplies ControlAccess::session, including owned thread fallback.
/// Missing stores must deny access, rather than infer ownership from reachability.
pub type ConsentOwnership = Arc<dyn Fn(&str, &str) -> Result<bool, String> + Send + Sync>;
pub type ConsentAudit = Arc<dyn Fn(Value) -> Result<(), String> + Send + Sync>;

/// Capture an ownership-filtered snapshot and its change subscription together.
/// The caller must authenticate the user and limit connection admission. A wakeup
/// or lag requires reconciliation of pending requests and missed decisions;
/// a pending snapshot alone cannot recover decisions.
/// Ownership errors fail the entire snapshot closed. Filtering runs in the bounded
/// blocking lane because the host ownership adapter may consult storage.
pub async fn subscribe_owned_pending(
    manager: ConsentManager,
    owns_session: ConsentOwnership,
    user: String,
    lane: BlockingLane,
) -> Result<
    (
        Vec<Value>,
        tokio::sync::broadcast::Receiver<ConsentQueueEvent>,
    ),
    String,
> {
    if user.trim().is_empty() {
        return Err("authenticated user required".into());
    }
    lane.run(move || {
        let (requests, changes) = manager
            .try_subscribe_pending_changes()
            .map_err(str::to_owned)?;
        let mut visible = Vec::new();
        for request in requests {
            if owns_session(&request.session_id, &user)? {
                visible.push(json!({"id":request.id,"sessionId":request.session_id}));
            }
        }
        Ok((visible, changes))
    })
    .await
    .map_err(|_| "consent snapshot unavailable".to_string())?
}
/// Refresh a live subscriber without consuming another admission slot. Keep the
/// receiver alive while calling this, and treat queued notifications as wakeups.
pub async fn refresh_owned_pending(
    manager: ConsentManager,
    owns_session: ConsentOwnership,
    user: String,
    lane: BlockingLane,
) -> Result<Vec<Value>, String> {
    if user.trim().is_empty() {
        return Err("authenticated user required".into());
    }
    lane.run(move || {
        let mut visible = Vec::new();
        for request in manager.pending_snapshot().map_err(str::to_owned)? {
            if owns_session(&request.session_id, &user)? {
                visible.push(json!({"id":request.id,"sessionId":request.session_id}));
            }
        }
        Ok(visible)
    })
    .await
    .map_err(|_| "consent snapshot unavailable".to_string())?
}
/// Recover only IDs previously delivered to this subscriber. The caller must
/// keep its subscription alive, serialize delivery with recovery, and recheck
/// ownership at delivery; this adapter alone does not establish wire ordering.
pub async fn reconcile_owned_observed(
    manager: ConsentManager,
    owns_session: ConsentOwnership,
    user: String,
    observed_ids: Vec<String>,
    lane: BlockingLane,
) -> Result<Vec<Value>, String> {
    if user.trim().is_empty() {
        return Err("authenticated user required".into());
    }
    lane.run(move || {
        let mut visible = Vec::new();
        for item in manager.reconcile_observed(&observed_ids).map_err(str::to_owned)? {
            match item {
                ReconciledConsent::Pending(identity) => {
                    if owns_session(&identity.session_id, &user)? {
                        visible.push(json!({"id": identity.id, "sessionId": identity.session_id, "status": "pending"}));
                    }
                }
                ReconciledConsent::Resolved { session_id, decision } => {
                    if owns_session(&session_id, &user)? {
                        visible.push(json!({"type": "consent.resolved", "sessionId": session_id, "payload": &*decision}));
                    }
                }
            }
        }
        Ok(visible)
    }).await.map_err(|_| "consent reconciliation unavailable".to_string())?
}
/// Filter each live transition against current ownership before delivery.
/// A recovery signal is an error, not a wire event: current clients do not
/// understand it. The caller must stop delivery and reconcile missed decisions
/// as well as pending requests; a pending-only snapshot cannot restore both.
/// Resolved payloads are provisional until queue reconciliation confirms them.
/// If reconciliation is in progress, the caller must retry recovery after a
/// queue change; recovery also fails closed after an unsuccessful transition.
pub async fn filter_owned_event(
    manager: ConsentManager,
    event: ConsentQueueEvent,
    owns_session: ConsentOwnership,
    user: String,
    lane: BlockingLane,
) -> Result<Option<Value>, String> {
    if user.trim().is_empty() {
        return Err("authenticated user required".into());
    }
    lane.run(move || {
        match event {
            ConsentQueueEvent::Required(request) => {
                if !owns_session(&request.session_id, &user)? {
                    return Ok(None);
                }
                let reconciled = manager.reconcile_observed(std::slice::from_ref(&request.id))
                    .map_err(|_| "consent event recovery required".to_string())?;
                match &reconciled[0] {
                    ReconciledConsent::Pending(current)
                        if current.id == request.id && current.session_id == request.session_id => {}
                    _ => return Err("consent event recovery required".into()),
                }
                // An identity match alone does not authenticate the prompt body.
                // Never forward a queued payload that differs from the current request.
                let current = manager.get_request(&request.id)
                    .ok_or_else(|| "consent event recovery required".to_string())?
                    .snapshot();
                if current != *request {
                    return Err("consent event recovery required".into());
                }
                Ok(Some(json!({"type":"consent.required", "sessionId":request.session_id, "payload":&*request})))
            }
            ConsentQueueEvent::Resolved { session_id, decision } => {
                if !owns_session(&session_id, &user)? {
                    return Ok(None);
                }
                let reconciled = manager.reconcile_observed(std::slice::from_ref(&decision.request_id))
                    .map_err(|_| "consent event recovery required".to_string())?;
                match &reconciled[0] {
                    ReconciledConsent::Resolved { session_id: current_session, decision: current }
                        if current_session == &session_id && **current == *decision => {}
                    _ => return Err("consent event recovery required".into()),
                }
                Ok(Some(json!({"type":"consent.resolved", "sessionId":session_id, "payload":&*decision})))
            }
            ConsentQueueEvent::SnapshotRequired => Err("consent event recovery required".into()),
        }
    }).await.map_err(|_| "consent event unavailable".to_string())?
}
#[derive(Clone)]
pub struct ConsentRoutes {
    pub auth: AuthState,
    pub manager: ConsentManager,
    pub owns_session: ConsentOwnership,
    pub audit: ConsentAudit,
    pub lane: BlockingLane,
    pub active_profile_name: Option<String>,
    /// Preserve the host permission map's insertion order.
    pub permissions: Vec<ToolPermission>,
}
impl ConsentRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/consent/policy", get(handle))
            .route("/api/consent/pending", get(handle))
            .route("/api/consent/pending/{session}", get(handle))
            // Fastify falls back to the ID action route by method; Axum's
            // static `pending` prefix otherwise shadows these POST requests.
            .route("/api/consent/pending/approve", get(handle).post(handle))
            .route("/api/consent/pending/reject", get(handle).post(handle))
            .route("/api/consent/pending/approve-all", get(handle).post(handle))
            .route(
                "/api/consent/pending/{session}/approve-all",
                get(handle).post(handle).delete(handle),
            )
            .route("/api/consent/count", get(handle))
            .route("/api/consent/{id}", get(handle))
            .route("/api/consent/{id}/approve", post(handle))
            .route("/api/consent/{id}/reject", post(handle))
            .route("/api/consent/{id}/approve-all", post(handle))
            .route("/api/trust", get(handle))
            .with_state(self)
    }
    fn run(
        &self,
        method: Method,
        parts: Vec<String>,
        user: String,
        body: Value,
    ) -> Result<(u16, Value), String> {
        let p: Vec<&str> = parts.iter().map(String::as_str).collect();
        let request_action = p.len() == 4 && method == Method::POST;
        let session = if p.get(2) == Some(&"pending") && !request_action {
            p.get(3).copied()
        } else {
            None
        };
        let id = if request_action
            || (p.len() == 3 && !matches!(p[2], "policy" | "pending" | "count"))
        {
            Some(p[2])
        } else {
            None
        };
        // Match the reference preHandler before reads, decisions, overrides or audit.
        if let Some(id) = id {
            let Some(req) = self.manager.get_request(id).map(|r| r.snapshot()) else {
                return Ok(not_found(None));
            };
            if req.status != ConsentStatus::Pending || !(self.owns_session)(&req.session_id, &user)?
            {
                return Ok(not_found(None));
            }
        }
        if let Some(session) = session
            && !(self.owns_session)(session, &user)?
        {
            return Ok(not_found(None));
        }
        let reason = body
            .get("reason")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let result = match p.as_slice() {
            ["api", "consent", "policy"] => {
                json!({"activeProfileName":self.active_profile_name,"toolCount":self.permissions.len(),"permissions":self.permissions,"unknownToolsRequireConsent":true})
            }
            ["api", "consent", "pending"] | ["api", "consent", "count"] => {
                let mut requests = vec![];
                for entry in self.manager.list_pending(None) {
                    let req = entry.snapshot();
                    if (self.owns_session)(&req.session_id, &user)? {
                        requests.push(req);
                    }
                }
                if p[2] == "count" {
                    json!({"count":requests.len()})
                } else {
                    json!({"requests":requests})
                }
            }
            ["api", "consent", "pending", session] if method == Method::GET => {
                json!({"requests":self.manager.list_pending(Some(session)).iter().map(|r| r.snapshot()).collect::<Vec<_>>()})
            }
            ["api", "consent", id] => {
                let Some(req) = self.manager.get_request(id) else {
                    return Ok(not_found(Some("Consent request not found")));
                };
                json!(req.snapshot())
            }
            ["api", "consent", id, action @ ("approve" | "reject")] => {
                let approve = *action == "approve";
                let reason = if approve {
                    reason
                } else {
                    Some(reason.unwrap_or_else(|| "User rejected".into()))
                };
                let ok = if approve {
                    self.manager
                        .approve(id, Some(DecisionVia::Click), reason.clone())?
                } else {
                    self.manager
                        .reject(id, Some(DecisionVia::Click), reason.clone())?
                };
                if !ok {
                    return Ok(not_found(Some(
                        "Consent request not found or already resolved",
                    )));
                }
                let mut inputs = json!({"requestId":id});
                if let Some(reason) = reason {
                    inputs["reason"] = json!(reason);
                }
                self.write_audit(None, &format!("consent.{action}"), inputs)?;
                json!({"ok":true,"decision":if approve { "approved" } else { "rejected" }})
            }
            ["api", "consent", id, "approve-all"] => {
                let Some(req) = self
                    .manager
                    .get_request(id)
                    .map(|r| r.snapshot())
                    .filter(|r| r.status == ConsentStatus::Pending)
                else {
                    return Ok(not_found(Some(
                        "Consent request not found or already resolved",
                    )));
                };
                let ids =
                    self.approve_pending(&req.session_id, Some("notification.approve-all".into()))?;
                json!({"ok":true,"sessionId":req.session_id,"approvedCount":ids.len(),"requestIds":ids})
            }
            ["api", "consent", "pending", session, "approve-all"] => {
                if method == Method::POST {
                    self.manager.enable_approve_all_for_session(session)?;
                    let ids = self.approve_pending(session, reason)?;
                    json!({"ok":true,"sessionId":session,"approveAllEnabled":true,"approvedCount":ids.len(),"requestIds":ids})
                } else if method == Method::DELETE {
                    self.manager.disable_approve_all_for_session(session)?;
                    self.write_audit(
                        Some(session),
                        "consent.approve_all.clear",
                        json!({"sessionId":session}),
                    )?;
                    json!({"ok":true,"sessionId":session,"approveAllEnabled":false})
                } else {
                    json!({"sessionId":session,"approveAllEnabled":self.manager.is_approve_all_enabled_for_session(session)})
                }
            }
            _ => unreachable!("registered consent route"),
        };
        Ok((200, result))
    }
    fn approve_pending(
        &self,
        session: &str,
        reason: Option<String>,
    ) -> Result<Vec<String>, String> {
        let mut ids = vec![];
        for entry in self.manager.list_pending(Some(session)) {
            let id = entry.snapshot().id;
            if self
                .manager
                .approve(&id, Some(DecisionVia::Click), reason.clone())?
            {
                ids.push(id.clone());
                let mut inputs = json!({"requestId":id,"bulk":true});
                if let Some(reason) = &reason {
                    inputs["reason"] = json!(reason);
                }
                self.write_audit(Some(session), "consent.approve", inputs)?;
            }
        }
        Ok(ids)
    }
    fn write_audit(
        &self,
        session: Option<&str>,
        action: &str,
        inputs: Value,
    ) -> Result<(), String> {
        let mut event = json!({"actionId":uuidv7().to_string(),"actionType":action,"status":"executed","inputs":inputs});
        if let Some(session) = session {
            event["sessionId"] = json!(session);
        }
        (self.audit)(event)
    }
}
fn not_found(details: Option<&str>) -> (u16, Value) {
    let mut body = json!({"error":"NOT_FOUND"});
    if let Some(details) = details {
        body["details"] = json!(details);
    }
    (404, body)
}
async fn handle(State(state): State<ConsentRoutes>, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let mut parts = vec![];
    for encoded in path.trim_start_matches('/').split('/') {
        let malformed = encoded.as_bytes().iter().enumerate().any(|(i, b)| {
            *b == b'%'
                && (encoded
                    .as_bytes()
                    .get(i + 1)
                    .is_none_or(|b| !b.is_ascii_hexdigit())
                    || encoded
                        .as_bytes()
                        .get(i + 2)
                        .is_none_or(|b| !b.is_ascii_hexdigit()))
        });
        match percent_encoding::percent_decode_str(encoded).decode_utf8() {
            Ok(s) if !malformed => parts.push(s.into_owned()),
            _ => {
                return response(
                    400,
                    json!({"error":"Bad Request","code":"FST_ERR_BAD_URL","message":format!("'{path}' is not a valid url component"),"statusCode":400}),
                );
            }
        }
    }
    let headers = request.headers().clone();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(v) => v,
        Err(e) => return *e,
    };
    // This registrar's legacy trust endpoint contains no state. The enclosing
    // server retains its independent authentication/origin policy.
    if path == "/api/trust" {
        return response(
            200,
            json!({"message":"Use GET /api/trust/levels for trust data"}),
        );
    }
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(u) => u,
        Err(e) => return *e,
    };
    let lane = state.lane.clone();
    match lane
        .run(move || state.run(method, parts, user.id, body))
        .await
    {
        Ok(Ok((status, body))) => response(status, body),
        result => {
            let message = match result {
                Ok(Err(e)) => e,
                Err(e) => e.to_string(),
                _ => unreachable!(),
            };
            response(
                500,
                json!({"statusCode":500,"error":"Internal Server Error","message":message}),
            )
        }
    }
}

#[cfg(test)]
mod owned_snapshot_tests {
    use super::*;
    use crate::security::{
        consent_manager::{ConsentRequestPolicy, RequestConsent},
        contracts::Risk,
        tool_permissions::{ConsentLevel, PolicySource},
    };
    use std::num::NonZeroU16;

    fn request(session: &str) -> RequestConsent {
        RequestConsent {
            action_id: "action".into(),
            tool_name: "tool".into(),
            summary: "test".into(),
            preview: Default::default(),
            risk: Risk::High,
            policy: ConsentRequestPolicy {
                consent_level: ConsentLevel::Always,
                description: "test".into(),
                known_tool: true,
                source: PolicySource::Profile,
            },
            session_id: session.into(),
            timeout_ms: Some(60_000.0),
        }
    }
    fn lane() -> BlockingLane {
        BlockingLane::new(NonZeroU16::new(2).unwrap())
    }

    #[tokio::test]
    async fn failed_override_enable_does_not_approve_pending_requests() {
        use crate::security::consent_manager::{
            ConsentDecision, ConsentManagerOptions, ConsentPersistence, ConsentRequest,
        };
        struct FailedStore;
        impl ConsentPersistence for FailedStore {
            fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
                Ok(vec![])
            }
            fn persist_session_approve_all(&self, _: &str, _: bool, _: &str) -> Result<(), String> {
                Err("write failed".into())
            }
            fn persist_decision(
                &self,
                _: &ConsentRequest,
                _: &ConsentDecision,
            ) -> Result<(), String> {
                Ok(())
            }
        }
        let manager = ConsentManager::new(ConsentManagerOptions {
            store: Some(Arc::new(FailedStore)),
            ..ConsentManagerOptions::default()
        });
        let handle = manager.request_consent(request("alice")).unwrap();
        let audit_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count = audit_count.clone();
        let routes = ConsentRoutes {
            auth: AuthState::new(
                rusqlite::Connection::open_in_memory().unwrap(),
                "consent-http-fixture".into(),
            )
            .unwrap(),
            manager: manager.clone(),
            owns_session: Arc::new(|session, user| Ok(session == user)),
            audit: Arc::new(move |_| {
                count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(())
            }),
            lane: lane(),
            active_profile_name: None,
            permissions: vec![],
        };
        let parts = vec![
            "api".into(),
            "consent".into(),
            "pending".into(),
            "alice".into(),
            "approve-all".into(),
        ];
        assert_eq!(
            routes
                .run(Method::POST, parts, "alice".into(), json!({}))
                .unwrap_err(),
            "write failed"
        );
        assert!(!manager.is_approve_all_enabled_for_session("alice"));
        assert_eq!(
            manager.get_request(&handle.id).unwrap().snapshot().status,
            ConsentStatus::Pending
        );
        assert_eq!(audit_count.load(std::sync::atomic::Ordering::SeqCst), 0);
    }

    // Diagnostic of the current opt-in route, not an acceptance test: the
    // callback returns its old observation after revocation has occurred.
    #[tokio::test]
    async fn ownership_observation_can_expire_before_route_mutation() {
        use std::sync::atomic::{AtomicBool, Ordering};
        for action in ["approve", "reject", "approve-all", "session-override"] {
            let manager = ConsentManager::default();
            let mut handle = manager.request_consent(request("alice")).unwrap();
            let authorized = Arc::new(AtomicBool::new(true));
            let observed = authorized.clone();
            let routes = ConsentRoutes {
                auth: AuthState::new(
                    rusqlite::Connection::open_in_memory().unwrap(),
                    "consent-http-fixture".into(),
                )
                .unwrap(),
                manager: manager.clone(),
                owns_session: Arc::new(move |_, _| Ok(observed.swap(false, Ordering::SeqCst))),
                audit: Arc::new(|_| Ok(())),
                lane: lane(),
                active_profile_name: None,
                permissions: vec![],
            };
            let parts = if action == "session-override" {
                vec![
                    "api".into(),
                    "consent".into(),
                    "pending".into(),
                    "alice".into(),
                    "approve-all".into(),
                ]
            } else {
                vec![
                    "api".into(),
                    "consent".into(),
                    handle.id.clone(),
                    action.into(),
                ]
            };
            let (status, _) = routes
                .run(Method::POST, parts, "alice".into(), json!({}))
                .unwrap();
            assert!(!authorized.load(Ordering::SeqCst));
            assert_eq!(status, 200, "{action}");
            let decision = handle.wait().await.unwrap();
            assert_eq!(decision.approved, action != "reject", "{action}");
            if action == "session-override" {
                assert!(manager.is_approve_all_enabled_for_session("alice"));
            }
        }
    }

    // Diagnostic only: clearing the persistent session override also races revocation.
    #[test]
    fn ownership_observation_can_expire_before_override_clear() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let manager = ConsentManager::default();
        manager.enable_approve_all_for_session("alice").unwrap();
        let authorized = Arc::new(AtomicBool::new(true));
        let observed = authorized.clone();
        let routes = ConsentRoutes {
            auth: AuthState::new(
                rusqlite::Connection::open_in_memory().unwrap(),
                "consent-http-fixture".into(),
            )
            .unwrap(),
            manager: manager.clone(),
            owns_session: Arc::new(move |_, _| Ok(observed.swap(false, Ordering::SeqCst))),
            audit: Arc::new(|_| Ok(())),
            lane: lane(),
            active_profile_name: None,
            permissions: vec![],
        };
        let parts = vec![
            "api".into(),
            "consent".into(),
            "pending".into(),
            "alice".into(),
            "approve-all".into(),
        ];
        let (status, _) = routes
            .run(Method::DELETE, parts, "alice".into(), json!({}))
            .unwrap();
        assert!(!authorized.load(Ordering::SeqCst));
        assert_eq!(status, 200);
        assert!(!manager.is_approve_all_enabled_for_session("alice"));
    }

    #[tokio::test]
    async fn owned_snapshot_isolated_and_reconnect_observes_changes() {
        let manager = ConsentManager::default();
        let alice = manager.request_consent(request("alice")).unwrap();
        let bob = manager.request_consent(request("bob")).unwrap();
        let owns: ConsentOwnership = Arc::new(|session, user| Ok(session == user));
        let (snapshot, mut changes) =
            subscribe_owned_pending(manager.clone(), owns.clone(), "alice".into(), lane())
                .await
                .unwrap();
        assert_eq!(
            snapshot,
            vec![json!({"id": alice.id, "sessionId": "alice"})]
        );
        manager.approve(&alice.id, None, None).unwrap();
        assert!(changes.try_recv().is_ok());
        let (snapshot, _) = subscribe_owned_pending(manager.clone(), owns, "alice".into(), lane())
            .await
            .unwrap();
        assert!(snapshot.is_empty());
        assert!(manager.get_request(&bob.id).is_some());
    }

    #[tokio::test]
    async fn refresh_works_at_subscription_limit_and_rechecks_ownership() {
        let manager = ConsentManager::default();
        let request = manager.request_consent(request("alice")).unwrap();
        let receivers: Vec<_> = (0..128)
            .map(|_| manager.try_subscribe_pending_changes().unwrap().1)
            .collect();
        assert!(manager.try_subscribe_pending_changes().is_err());
        let owns: ConsentOwnership = Arc::new(|session, user| Ok(session == user));
        let snapshot = refresh_owned_pending(manager.clone(), owns.clone(), "alice".into(), lane())
            .await
            .unwrap();
        assert_eq!(
            snapshot,
            vec![json!({"id": request.id, "sessionId": "alice"})]
        );
        let revoked: ConsentOwnership = Arc::new(|_, _| Ok(false));
        assert!(
            refresh_owned_pending(manager.clone(), revoked, "alice".into(), lane())
                .await
                .unwrap()
                .is_empty()
        );
        let failure: ConsentOwnership = Arc::new(|_, _| Err("lookup failed".into()));
        assert!(
            refresh_owned_pending(manager, failure, "alice".into(), lane())
                .await
                .is_err()
        );
        drop(receivers);
    }

    #[tokio::test]
    async fn live_events_recheck_ownership_and_fail_closed() {
        let manager = ConsentManager::default();
        let (_, mut changes) = manager.try_subscribe_pending_changes().unwrap();
        let handle = manager.request_consent(request("alice")).unwrap();
        let required = changes.try_recv().unwrap();
        let owns: ConsentOwnership = Arc::new(|session, user| Ok(session == user));
        let event = filter_owned_event(
            manager.clone(),
            required.clone(),
            owns.clone(),
            "alice".into(),
            lane(),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(event["type"], "consent.required");
        assert_eq!(event["payload"]["id"], handle.id);
        let ConsentQueueEvent::Required(original) = &required else {
            panic!("expected required event")
        };
        let mut altered = (**original).clone();
        altered.summary = "misleading consent prompt".into();
        let forged = ConsentQueueEvent::Required(Arc::new(altered));
        assert!(
            filter_owned_event(
                manager.clone(),
                forged,
                owns.clone(),
                "alice".into(),
                lane()
            )
            .await
            .is_err()
        );
        manager.approve(&handle.id, None, None).unwrap();
        let resolved = changes.try_recv().unwrap();
        assert!(
            filter_owned_event(
                manager.clone(),
                required.clone(),
                owns.clone(),
                "alice".into(),
                lane()
            )
            .await
            .is_err()
        );
        assert!(
            filter_owned_event(manager.clone(), required, owns, "bob".into(), lane())
                .await
                .unwrap()
                .is_none()
        );
        let revoked: ConsentOwnership = Arc::new(|_, _| Ok(false));
        assert!(
            filter_owned_event(
                manager.clone(),
                resolved.clone(),
                revoked,
                "alice".into(),
                lane()
            )
            .await
            .unwrap()
            .is_none()
        );
        let failure: ConsentOwnership = Arc::new(|_, _| Err("lookup failed".into()));
        assert!(
            filter_owned_event(manager.clone(), resolved, failure, "alice".into(), lane())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn observed_recovery_rechecks_ownership_and_fails_closed() {
        let manager = ConsentManager::default();
        let alice = manager.request_consent(request("alice")).unwrap();
        let bob = manager.request_consent(request("bob")).unwrap();
        manager.approve(&alice.id, None, None).unwrap();
        let owns: ConsentOwnership = Arc::new(|session, user| Ok(session == user));
        let ids = vec![alice.id.clone(), bob.id.clone()];
        let result = reconcile_owned_observed(
            manager.clone(),
            owns.clone(),
            "alice".into(),
            ids.clone(),
            lane(),
        )
        .await
        .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["type"], "consent.resolved");
        assert_eq!(result[0]["payload"]["requestId"], alice.id);
        let revoked: ConsentOwnership = Arc::new(|_, _| Ok(false));
        assert!(
            reconcile_owned_observed(
                manager.clone(),
                revoked,
                "alice".into(),
                ids.clone(),
                lane()
            )
            .await
            .unwrap()
            .is_empty()
        );
        let failure: ConsentOwnership = Arc::new(|_, _| Err("lookup failed".into()));
        assert!(
            reconcile_owned_observed(manager.clone(), failure, "alice".into(), ids, lane())
                .await
                .is_err()
        );
        assert!(
            reconcile_owned_observed(
                manager.clone(),
                owns.clone(),
                "alice".into(),
                vec!["unknown".into()],
                lane()
            )
            .await
            .is_err()
        );
        assert!(
            reconcile_owned_observed(manager, owns, " ".into(), vec![], lane())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn recovery_signal_is_not_sent_as_an_unknown_wire_event() {
        let owns: ConsentOwnership = Arc::new(|_, _| Ok(true));
        let result = filter_owned_event(
            ConsentManager::default(),
            ConsentQueueEvent::SnapshotRequired,
            owns,
            "alice".into(),
            lane(),
        )
        .await;
        assert_eq!(result.unwrap_err(), "consent event recovery required");
    }

    #[tokio::test]
    async fn owned_snapshot_fails_closed_on_lookup_error_and_empty_user() {
        let manager = ConsentManager::default();
        manager.request_consent(request("alice")).unwrap();
        let owns: ConsentOwnership = Arc::new(|_, _| Err("lookup failed".into()));
        assert!(
            subscribe_owned_pending(manager.clone(), owns.clone(), "alice".into(), lane())
                .await
                .is_err()
        );
        assert!(
            subscribe_owned_pending(manager, owns, " ".into(), lane())
                .await
                .is_err()
        );
    }
}
