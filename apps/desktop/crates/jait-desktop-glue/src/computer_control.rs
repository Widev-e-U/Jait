//! Local desktop-control lease. The host owns this state; a remote request
//! cannot approve itself, outlive the lease, or race a local revocation.
use parking_lot::Mutex;

#[derive(Clone, Debug, PartialEq, Eq)]
struct Lease {
    id: String,
    owner: String,
    expires_ms: i64,
    generation: u64,
    approved: bool,
}

#[derive(Default)]
struct State {
    generation: u64,
    lease: Option<Lease>,
}

#[derive(Default)]
pub(crate) struct ComputerControl {
    state: Mutex<State>,
}

impl ComputerControl {
    /// Reserve the only desktop seat before showing a local approval prompt.
    pub(crate) fn begin(
        &self,
        id: &str,
        owner: &str,
        expires_ms: i64,
        now_ms: i64,
    ) -> Result<u64, &'static str> {
        if id.trim().is_empty() || owner.trim().is_empty() || id.len() > 256 || owner.len() > 256 {
            return Err("A session and owning chat are required");
        }
        if expires_ms <= now_ms || expires_ms.saturating_sub(now_ms) > 30 * 60 * 1000 {
            return Err("Control approval must expire within 30 minutes");
        }
        let mut state = self.state.lock();
        if state
            .lease
            .as_ref()
            .is_some_and(|lease| lease.expires_ms > now_ms)
        {
            return Err("This computer already has a control session or pending request");
        }
        state.generation = state.generation.wrapping_add(1);
        let generation = state.generation;
        state.lease = Some(Lease {
            id: id.into(),
            owner: owner.into(),
            expires_ms,
            generation,
            approved: false,
        });
        Ok(generation)
    }

    /// A late approval never revives a request that was stopped or expired.
    pub(crate) fn finish(
        &self,
        generation: u64,
        approved: bool,
        now_ms: i64,
    ) -> Result<(), &'static str> {
        let mut state = self.state.lock();
        let Some(lease) = state.lease.as_mut() else {
            return Err("Control request was cancelled");
        };
        if lease.generation != generation {
            return Err("Control request was cancelled");
        }
        if !approved || lease.expires_ms <= now_ms {
            state.lease = None;
            return Err(if approved {
                "Control request expired"
            } else {
                "Control request was denied"
            });
        }
        lease.approved = true;
        Ok(())
    }

    /// Hold the lease lock through the effect so stop cannot return while an
    /// already-authorized action is still being injected.
    pub(crate) fn with_active<T>(
        &self,
        id: &str,
        owner: &str,
        now_ms: i64,
        effect: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let mut state = self.state.lock();
        if state
            .lease
            .as_ref()
            .is_some_and(|lease| lease.expires_ms <= now_ms)
        {
            state.lease = None;
        }
        let valid = state
            .lease
            .as_ref()
            .is_some_and(|lease| lease.approved && lease.id == id && lease.owner == owner);
        if !valid {
            return Err("Computer control session is not active for this chat".into());
        }
        effect()
    }

    pub(crate) fn stop(&self, id: &str, owner: &str) {
        let mut state = self.state.lock();
        if state
            .lease
            .as_ref()
            .is_some_and(|lease| lease.id == id && lease.owner == owner)
        {
            state.lease = None;
        }
    }

    pub(crate) fn is_current(&self, generation: u64, now_ms: i64) -> bool {
        self.state.lock().lease.as_ref().is_some_and(|lease| {
            lease.generation == generation && lease.approved && lease.expires_ms > now_ms
        })
    }

    pub(crate) fn revoke_generation(&self, generation: u64) {
        let mut state = self.state.lock();
        if state
            .lease
            .as_ref()
            .is_some_and(|lease| lease.generation == generation)
        {
            state.lease = None;
        }
    }

    pub(crate) fn revoke(&self) {
        self.state.lock().lease = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_is_bound_to_owner_and_expiry() {
        let control = ComputerControl::default();
        let ticket = control.begin("control", "chat", 2_000, 1_000).unwrap();
        assert!(control
            .with_active("control", "chat", 1_001, || Ok(()))
            .is_err());
        control.finish(ticket, true, 1_002).unwrap();
        assert!(control
            .with_active("control", "other", 1_003, || Ok(()))
            .is_err());
        assert!(control
            .with_active("other", "chat", 1_003, || Ok(()))
            .is_err());
        assert!(control
            .with_active("control", "chat", 1_999, || Ok(()))
            .is_ok());
        assert!(control
            .with_active("control", "chat", 2_000, || Ok(()))
            .is_err());
    }

    #[test]
    fn cancellation_and_replacement_cannot_be_revived_by_late_approval() {
        let control = ComputerControl::default();
        let old = control.begin("old", "chat", 2_000, 1_000).unwrap();
        assert!(control.begin("other", "other-chat", 2_000, 1_000).is_err());
        control.stop("old", "other-chat");
        assert!(control.begin("other", "other-chat", 2_000, 1_000).is_err());
        control.stop("old", "chat");
        let new = control.begin("new", "other-chat", 2_000, 1_000).unwrap();
        assert!(control.finish(old, true, 1_001).is_err());
        control.finish(new, true, 1_001).unwrap();
        control.revoke();
        assert!(control
            .with_active("new", "other-chat", 1_002, || Ok(()))
            .is_err());
    }

    #[test]
    fn revocation_waits_for_an_in_flight_effect_and_prevents_later_effects() {
        use std::sync::{mpsc, Arc};
        use std::time::Duration;
        let control = Arc::new(ComputerControl::default());
        let ticket = control.begin("id", "chat", 2_000, 1_000).unwrap();
        control.finish(ticket, true, 1_001).unwrap();
        let (started_tx, started_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let acting = control.clone();
        let action = std::thread::spawn(move || {
            acting.with_active("id", "chat", 1_002, || {
                started_tx.send(()).unwrap();
                release_rx.recv_timeout(Duration::from_secs(2)).unwrap();
                Ok(())
            })
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let (stopped_tx, stopped_rx) = mpsc::channel();
        let stopping = control.clone();
        let stop = std::thread::spawn(move || {
            stopping.stop("id", "chat");
            stopped_tx.send(()).unwrap();
        });
        assert!(stopped_rx.recv_timeout(Duration::from_millis(50)).is_err());
        release_tx.send(()).unwrap();
        action.join().unwrap().unwrap();
        stopped_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        stop.join().unwrap();
        assert!(control.with_active("id", "chat", 1_003, || Ok(())).is_err());
    }

    #[test]
    fn denial_expiry_and_unbounded_leases_fail_closed() {
        let control = ComputerControl::default();
        assert!(control.begin("id", "chat", 1_000, 1_000).is_err());
        assert!(control.begin("id", "chat", 1_801_001, 1_000).is_err());
        let denied = control.begin("id", "chat", 2_000, 1_000).unwrap();
        assert!(control.finish(denied, false, 1_001).is_err());
        let expired = control.begin("id", "chat", 2_000, 1_000).unwrap();
        assert!(control.finish(expired, true, 2_000).is_err());
    }
}
