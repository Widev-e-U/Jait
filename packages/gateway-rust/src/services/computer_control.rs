//! Chat-owned exclusive computer-control leases. Transport authorization is a caller boundary.
use crate::time::{self, Clock};
use serde::Serialize;
use std::collections::HashMap;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerControlSession {
    pub id: String,
    pub node_id: String,
    pub owner_session_id: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
}
pub struct ComputerControlSessionService {
    sessions: HashMap<String, (ComputerControlSession, i64)>,
    order: Vec<String>,
    clock: Clock,
    lease_ms: i64,
}
impl Default for ComputerControlSessionService {
    fn default() -> Self {
        Self::new(time::default_clock(), 30 * 60_000)
    }
}
impl ComputerControlSessionService {
    pub fn new(clock: Clock, lease_ms: i64) -> Self {
        Self {
            sessions: HashMap::new(),
            order: vec![],
            clock,
            lease_ms,
        }
    }
    fn remove_expired(&mut self) {
        let now = (self.clock)();
        self.sessions.retain(|_, (_, expires)| *expires > now);
        self.order.retain(|id| self.sessions.contains_key(id));
    }
    pub fn start(&mut self, owner: &str, node: &str) -> Result<ComputerControlSession, String> {
        self.remove_expired();
        if let Some(session) = self.find_by_node(node) {
            return Err(if session.owner_session_id == owner {
                format!(
                    "Computer session {} is already active on {node}",
                    session.id
                )
            } else {
                format!("Computer {node} is already controlled by another chat")
            });
        }
        let now = (self.clock)();
        let expires = now.checked_add(self.lease_ms).ok_or("Invalid time value")?;
        let session = ComputerControlSession {
            id: uuid::Uuid::new_v4().to_string(),
            node_id: node.into(),
            owner_session_id: owner.into(),
            status: "active".into(),
            created_at: time::iso(now)?,
            expires_at: time::iso(expires)?,
        };
        self.order.push(session.id.clone());
        self.sessions
            .insert(session.id.clone(), (session.clone(), expires));
        Ok(session)
    }
    pub fn get(&mut self, id: &str) -> Option<ComputerControlSession> {
        self.remove_expired();
        self.sessions.get(id).map(|(s, _)| s.clone())
    }
    // Mirrors the TS Map-insertion-order lookup: expire first, then take the
    // earliest-created session bound to the node.
    pub fn find_by_node(&mut self, node: &str) -> Option<ComputerControlSession> {
        self.remove_expired();
        self.order
            .iter()
            .filter_map(|id| self.sessions.get(id))
            .find(|(s, _)| s.node_id == node)
            .map(|(s, _)| s.clone())
    }
    pub fn require_owned(
        &mut self,
        id: &str,
        owner: &str,
    ) -> Result<ComputerControlSession, String> {
        let session = self
            .get(id)
            .ok_or_else(|| format!("Computer session {id} is not active"))?;
        if session.owner_session_id != owner {
            return Err(format!("Computer session {id} belongs to another chat"));
        }
        Ok(session)
    }
    pub fn list_for_owner(&mut self, owner: &str) -> Vec<ComputerControlSession> {
        self.remove_expired();
        self.order
            .iter()
            .filter_map(|id| self.sessions.get(id))
            .filter(|(s, _)| s.owner_session_id == owner)
            .map(|(s, _)| s.clone())
            .collect()
    }
    // Deliberately does not expire first: stopping a stored expired lease returns it.
    pub fn stop(&mut self, id: &str) -> Option<ComputerControlSession> {
        self.order.retain(|key| key != id);
        self.sessions.remove(id).map(|(s, _)| s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicI64, Ordering};
    use std::sync::Arc;

    fn manual_clock(start: i64) -> (Clock, Arc<AtomicI64>) {
        let now = Arc::new(AtomicI64::new(start));
        let handle = now.clone();
        (
            Arc::new(move || handle.load(Ordering::SeqCst)) as Clock,
            now,
        )
    }

    #[test]
    fn find_by_node_returns_session_bound_to_node() {
        let (clock, _now) = manual_clock(1_700_000_000_000);
        let mut service = ComputerControlSessionService::new(clock, 60_000);
        let alpha = service.start("chat-a", "node-1").unwrap();
        let beta = service.start("chat-a", "node-2").unwrap();

        assert_eq!(service.find_by_node("node-1").unwrap().id, alpha.id);
        assert_eq!(service.find_by_node("node-2").unwrap().id, beta.id);
        assert!(service.find_by_node("node-3").is_none());
    }

    #[test]
    fn find_by_node_ignores_stopped_leases() {
        let (clock, _now) = manual_clock(1_700_000_000_000);
        let mut service = ComputerControlSessionService::new(clock, 60_000);
        let first = service.start("chat-a", "node-1").unwrap();
        assert!(service.stop(&first.id).is_some());

        let second = service.start("chat-b", "node-1").unwrap();
        // The stopped lease must not linger in the insertion order and shadow the new one.
        assert_eq!(service.find_by_node("node-1").unwrap().id, second.id);
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn find_by_node_hides_expired_session() {
        let (clock, now) = manual_clock(1_700_000_000_000);
        let mut service = ComputerControlSessionService::new(clock, 1_000);
        let session = service.start("chat-a", "node-1").unwrap();
        assert_eq!(service.find_by_node("node-1").unwrap().id, session.id);

        now.fetch_add(2_000, Ordering::SeqCst);
        // Expiry must run before the lookup: an expired lease cannot block a new one.
        assert!(service.find_by_node("node-1").is_none());
        assert!(service.start("chat-b", "node-1").is_ok());
    }

    #[test]
    fn start_rejects_node_already_leased() {
        let (clock, _now) = manual_clock(1_700_000_000_000);
        let mut service = ComputerControlSessionService::new(clock, 60_000);
        let session = service.start("chat-a", "node-1").unwrap();

        let same_owner = service.start("chat-a", "node-1").unwrap_err();
        assert!(same_owner.contains(&format!(
            "Computer session {} is already active on node-1",
            session.id
        )));
        let other_owner = service.start("chat-b", "node-1").unwrap_err();
        assert_eq!(other_owner, "Computer node-1 is already controlled by another chat");
    }
}
