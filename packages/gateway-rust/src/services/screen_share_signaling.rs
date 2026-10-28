//! Authorization for relaying screen-share signaling between connected devices.
//!
//! The caller must use an authenticated, currently authorized connection's
//! device ID, and obtain the session from the shared service by payload session
//! ID. This predicate does not authenticate connections, send messages, or make a
//! session snapshot current. Authorization and enqueue must be serialized with
//! stop/reject and connection revocation, or revalidated at delivery.

use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShareSignalKind {
    Offer,
    Answer,
    IceCandidate,
}

/// Whether one connected recipient may receive this signal. Missing or malformed
/// state is denied; a caller must also require the recipient connection to be
/// open and authorized. This function never forwards or inspects SDP/ICE data.
pub fn authorize_share_signal(
    session: Option<&Value>,
    sender_device_id: Option<&str>,
    recipient_device_id: Option<&str>,
    kind: ShareSignalKind,
    payload: &Value,
) -> bool {
    let Some(session) = session else { return false };
    let Some(sender) = sender_device_id.filter(|id| !id.is_empty()) else {
        return false;
    };
    let Some(recipient) = recipient_device_id.filter(|id| !id.is_empty()) else {
        return false;
    };
    let Some(id) = session
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
    else {
        return false;
    };
    let Some(host) = session
        .get("hostDeviceId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
    else {
        return false;
    };
    let Some(viewers) = session.get("viewers").and_then(Value::as_array) else {
        return false;
    };
    if session.get("status").and_then(Value::as_str) != Some("sharing")
        || session.get("pendingApproval").and_then(Value::as_bool) != Some(false)
        || payload.get("sessionId").and_then(Value::as_str) != Some(id)
        || sender == recipient
    {
        return false;
    }
    let is_viewer = |device: &str| {
        viewers
            .iter()
            .any(|v| v.get("deviceId").and_then(Value::as_str) == Some(device))
    };
    let sender_is_host = sender == host;
    if !sender_is_host && !is_viewer(sender) {
        return false;
    }
    match kind {
        ShareSignalKind::Offer => {
            sender_is_host
                && payload.get("hostDeviceId").and_then(Value::as_str) == Some(sender)
                && is_viewer(recipient)
        }
        ShareSignalKind::Answer => {
            !sender_is_host
                && payload.get("viewerDeviceId").and_then(Value::as_str) == Some(sender)
                && recipient == host
        }
        ShareSignalKind::IceCandidate => {
            payload.get("fromDeviceId").and_then(Value::as_str) == Some(sender)
                && (recipient == host || is_viewer(recipient))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn session() -> Value {
        json!({"id":"s", "hostDeviceId":"host", "viewers":[{"deviceId":"a"},{"deviceId":"b"}], "status":"sharing", "pendingApproval":false})
    }
    fn allowed(
        s: Option<&Value>,
        from: &str,
        to: &str,
        kind: ShareSignalKind,
        payload: Value,
    ) -> bool {
        authorize_share_signal(s, Some(from), Some(to), kind, &payload)
    }
    #[test]
    fn approved_signals_only_reach_correct_participants() {
        let s = session();
        let offer = json!({"sessionId":"s", "hostDeviceId":"host"});
        assert!(allowed(
            Some(&s),
            "host",
            "a",
            ShareSignalKind::Offer,
            offer.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "host",
            "outside",
            ShareSignalKind::Offer,
            offer.clone()
        ));
        assert!(!allowed(Some(&s), "a", "b", ShareSignalKind::Offer, offer));
        let answer = json!({"sessionId":"s", "viewerDeviceId":"a"});
        assert!(allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::Answer,
            answer.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "a",
            "b",
            ShareSignalKind::Answer,
            answer.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "b",
            "host",
            ShareSignalKind::Answer,
            answer
        ));
        let ice = json!({"sessionId":"s", "fromDeviceId":"a"});
        assert!(allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        assert!(allowed(
            Some(&s),
            "a",
            "b",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "a",
            "a",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "outside",
            "host",
            ShareSignalKind::IceCandidate,
            ice
        ));
    }
    #[test]
    fn rejects_pending_stopped_missing_and_spoofed_state() {
        let mut s = session();
        let ice = json!({"sessionId":"s", "fromDeviceId":"a"});
        assert!(!allowed(
            None,
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        s["pendingApproval"] = json!(true);
        assert!(!allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        s["pendingApproval"] = json!(false);
        s["status"] = json!("idle");
        assert!(!allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        s["status"] = json!("sharing");
        assert!(!allowed(
            Some(&s),
            "b",
            "host",
            ShareSignalKind::IceCandidate,
            ice.clone()
        ));
        assert!(!allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            json!({"sessionId":"other", "fromDeviceId":"a"})
        ));
        s.as_object_mut().unwrap().remove("pendingApproval");
        assert!(!allowed(
            Some(&s),
            "a",
            "host",
            ShareSignalKind::IceCandidate,
            ice
        ));
    }
}
