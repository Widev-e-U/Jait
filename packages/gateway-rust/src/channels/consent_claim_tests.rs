use super::{
    consent_claim::claim_channel_decision,
    session_ownership::{ConversationTarget, SessionKey, SessionOwnership},
};
use crate::security::{
    consent_manager::{
        ConsentManager, ConsentManagerOptions, ConsentRequestPolicy, DecisionVia, RequestConsent,
    },
    contracts::Risk,
    tool_permissions::{ConsentLevel, PolicySource},
};
use std::sync::{Arc, mpsc};
use std::time::Duration;

fn key(owner: &str, session: &str) -> SessionKey {
    SessionKey {
        owner_id: owner.into(),
        session_id: session.into(),
    }
}
fn target() -> ConversationTarget {
    ConversationTarget {
        channel_id: "channel".into(),
        conversation_id: "conversation".into(),
    }
}
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
        timeout_ms: Some(10_000.0),
    }
}

#[tokio::test]
async fn stale_route_and_foreign_owner_or_session_cannot_claim() {
    let routes = SessionOwnership::default();
    let manager = ConsentManager::default();
    let owner = key("alice", "session");
    let target = target();
    let first = routes.register(owner.clone(), target.clone()).unwrap();
    let stale = routes.lookup(&owner).unwrap();
    let mut handle = manager.request_consent(request("session")).unwrap();
    drop(first);
    let _replacement = routes.register(owner.clone(), target.clone()).unwrap();
    let current = routes.lookup(&owner).unwrap();
    for (candidate, snapshot) in [
        (owner.clone(), &stale),
        (key("bob", "session"), &current),
        (key("alice", "other"), &current),
    ] {
        assert!(
            claim_channel_decision(
                &routes,
                &manager,
                &candidate,
                &target,
                snapshot,
                &handle.id,
                true,
                DecisionVia::Click,
                None
            )
            .unwrap()
            .is_none()
        );
    }
    let other_target = ConversationTarget {
        channel_id: "channel".into(),
        conversation_id: "other".into(),
    };
    assert!(
        claim_channel_decision(
            &routes,
            &manager,
            &owner,
            &other_target,
            &current,
            &handle.id,
            true,
            DecisionVia::Click,
            None
        )
        .unwrap()
        .is_none()
    );
    let other = manager.request_consent(request("other")).unwrap();
    assert!(
        claim_channel_decision(
            &routes,
            &manager,
            &owner,
            &target,
            &current,
            &other.id,
            true,
            DecisionVia::Click,
            None
        )
        .unwrap()
        .is_none()
    );
    assert_eq!(manager.pending_count(), 2);
    let claim = claim_channel_decision(
        &routes,
        &manager,
        &owner,
        &target,
        &current,
        &handle.id,
        true,
        DecisionVia::Click,
        None,
    )
    .unwrap()
    .unwrap();
    claim.finalize().unwrap();
    assert!(handle.wait().await.unwrap().approved);
}

#[tokio::test]
async fn queue_claim_serializes_with_route_teardown() {
    let routes = SessionOwnership::default();
    let manager = ConsentManager::default();
    let owner = key("alice", "session");
    let target = target();
    let lease = routes.register(owner.clone(), target.clone()).unwrap();
    let snapshot = routes.lookup(&owner).unwrap();
    let mut handle = manager.request_consent(request("session")).unwrap();
    let prepared = manager.prepare_decision_time().unwrap();
    let guard = routes.lock_for_claim(&owner, &snapshot).unwrap();
    let (started_tx, started_rx) = mpsc::channel();
    let (done_tx, done_rx) = mpsc::channel();
    let worker = std::thread::spawn(move || {
        started_tx.send(()).unwrap();
        drop(lease);
        done_tx.send(()).unwrap();
    });
    started_rx.recv().unwrap();
    assert!(done_rx.recv_timeout(Duration::from_millis(50)).is_err());
    let claim = manager
        .claim_for_session(
            &handle.id,
            &owner.session_id,
            true,
            DecisionVia::Click,
            None,
            prepared,
        )
        .unwrap()
        .unwrap();
    drop(guard);
    done_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    worker.join().unwrap();
    claim.finalize().unwrap();
    assert!(handle.wait().await.unwrap().approved);
    assert!(
        claim_channel_decision(
            &routes,
            &manager,
            &owner,
            &target,
            &snapshot,
            &handle.id,
            true,
            DecisionVia::Click,
            None
        )
        .unwrap()
        .is_none()
    );
}

#[tokio::test]
async fn failed_observer_leaves_reconciliation_closed() {
    let routes = SessionOwnership::default();
    let manager = ConsentManager::new(ConsentManagerOptions {
        on_decision: Some(Arc::new(|_| Err("observer failed".into()))),
        ..Default::default()
    });
    let owner = key("alice", "session");
    let target = target();
    let _lease = routes.register(owner.clone(), target.clone()).unwrap();
    let snapshot = routes.lookup(&owner).unwrap();
    let handle = manager.request_consent(request("session")).unwrap();
    let claim = claim_channel_decision(
        &routes,
        &manager,
        &owner,
        &target,
        &snapshot,
        &handle.id,
        true,
        DecisionVia::Click,
        None,
    )
    .unwrap()
    .unwrap();
    assert!(
        manager
            .reconcile_observed(std::slice::from_ref(&handle.id))
            .is_err()
    );
    assert_eq!(claim.finalize().unwrap_err(), "observer failed");
    assert!(manager.reconcile_observed(&[handle.id]).is_err());
}

// Block the single-thread runtime past the deadline so its timeout task cannot
// run first; a pending queue entry must still not be claimable.
#[tokio::test(flavor = "current_thread")]
async fn elapsed_deadline_cannot_be_claimed_before_timeout_task_runs() {
    let routes = SessionOwnership::default();
    let manager = ConsentManager::default();
    let owner = key("alice", "session");
    let target = target();
    let _lease = routes.register(owner.clone(), target.clone()).unwrap();
    let snapshot = routes.lookup(&owner).unwrap();
    let mut input = request("session");
    input.timeout_ms = Some(5.0);
    let mut handle = manager.request_consent(input).unwrap();
    std::thread::sleep(Duration::from_millis(30));
    assert_eq!(manager.pending_count(), 1);
    assert!(
        claim_channel_decision(
            &routes,
            &manager,
            &owner,
            &target,
            &snapshot,
            &handle.id,
            true,
            DecisionVia::Click,
            None
        )
        .unwrap()
        .is_none()
    );
    let result = tokio::time::timeout(Duration::from_secs(2), handle.wait())
        .await
        .unwrap()
        .unwrap();
    assert!(!result.approved);
    assert_eq!(result.decided_via, DecisionVia::Timeout);
}

#[tokio::test]
async fn snapshot_from_another_registry_cannot_claim_a_decision() {
    let routes = SessionOwnership::default();
    let other_routes = SessionOwnership::default();
    let manager = ConsentManager::default();
    let owner = key("alice", "session");
    let target = target();
    let _lease = routes.register(owner.clone(), target.clone()).unwrap();
    let _other_lease = other_routes
        .register(owner.clone(), target.clone())
        .unwrap();
    let foreign = other_routes.lookup(&owner).unwrap();
    let local = routes.lookup(&owner).unwrap();
    let mut handle = manager.request_consent(request("session")).unwrap();
    assert!(
        claim_channel_decision(
            &routes,
            &manager,
            &owner,
            &target,
            &foreign,
            &handle.id,
            true,
            DecisionVia::Click,
            None
        )
        .unwrap()
        .is_none()
    );
    assert_eq!(manager.pending_count(), 1);
    let claim = claim_channel_decision(
        &routes,
        &manager,
        &owner,
        &target,
        &local,
        &handle.id,
        true,
        DecisionVia::Click,
        None,
    )
    .unwrap()
    .unwrap();
    claim.finalize().unwrap();
    assert!(handle.wait().await.unwrap().approved);
}

#[tokio::test]
async fn provisional_resolved_event_requires_finalization_before_delivery() {
    use crate::routes::consent::{ConsentOwnership, filter_owned_event};
    use crate::runtime::blocking::BlockingLane;
    let routes = SessionOwnership::default();
    let manager = ConsentManager::default();
    let owner = key("alice", "session");
    let target = target();
    let _lease = routes.register(owner.clone(), target.clone()).unwrap();
    let snapshot = routes.lookup(&owner).unwrap();
    let mut handle = manager.request_consent(request("session")).unwrap();
    let (_, mut events) = manager.try_subscribe_pending_changes().unwrap();
    let claim = claim_channel_decision(
        &routes,
        &manager,
        &owner,
        &target,
        &snapshot,
        &handle.id,
        true,
        DecisionVia::Click,
        None,
    )
    .unwrap()
    .unwrap();
    let event = events.try_recv().unwrap();
    let owns: ConsentOwnership = Arc::new(|_, _| Ok(true));
    let lane = BlockingLane::new(std::num::NonZeroU16::new(1).unwrap());
    assert!(
        filter_owned_event(
            manager.clone(),
            event.clone(),
            owns.clone(),
            "alice".into(),
            lane.clone()
        )
        .await
        .is_err()
    );
    claim.finalize().unwrap();
    assert!(matches!(
        events.try_recv(),
        Ok(crate::security::consent_manager::ConsentQueueEvent::SnapshotRequired)
    ));
    assert!(events.try_recv().is_err());
    assert!(handle.wait().await.unwrap().approved);
    let visible = filter_owned_event(manager, event, owns, "alice".into(), lane)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(visible["type"], "consent.resolved");
    assert_eq!(visible["payload"]["requestId"], handle.id);
}
