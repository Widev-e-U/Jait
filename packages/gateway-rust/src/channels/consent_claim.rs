//! Synchronous claim mechanism for a previously authorized channel decision.
//! This module does not authenticate a channel principal or authorize decisions.

use super::session_ownership::{ConversationTarget, RouteSnapshot, SessionKey, SessionOwnership};
use crate::security::consent_manager::{ConsentManager, DecisionClaim, DecisionVia};

/// The caller must authenticate the channel principal, authorize the decision for
/// `key`, and bind it to `target` at this boundary. This mechanism cannot supply
/// that authority. Do not expose it to untrusted channel input until an issuer and
/// revocation/expiry synchronization exist. The returned claim must be finalized
/// under supervision, outside the route lock and on an appropriate blocking lane.
#[allow(clippy::too_many_arguments)]
pub(crate) fn claim_channel_decision(
    routes: &SessionOwnership,
    manager: &ConsentManager,
    key: &SessionKey,
    target: &ConversationTarget,
    snapshot: &RouteSnapshot,
    request_id: &str,
    approved: bool,
    via: DecisionVia,
    reason: Option<String>,
) -> Result<Option<DecisionClaim>, String> {
    if &snapshot.target != target {
        return Ok(None);
    }
    // Clock callbacks may run arbitrary code and must not run under the route lock.
    let prepared = manager.prepare_decision_time()?;
    let Some(guard) = routes.lock_for_claim(key, snapshot) else {
        return Ok(None);
    };
    let claim =
        manager.claim_for_session(request_id, &key.session_id, approved, via, reason, prepared);
    drop(guard);
    claim
}
