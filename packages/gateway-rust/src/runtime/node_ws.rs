//! Node capability grants over the WebSocket (`nodes.list`, `nodes.get`, `nodes.update-permissions`,
//! `nodes.forget`).
//!
//! The persisted nodes and their deny-by-default grants are overlaid with the live registry. Until the
//! WebSocket node transport exists the registry holds one node, the gateway itself, advertised with the
//! reference `Gateway (<hostname>)` identity. The gateway's grants can only be changed by the gateway's
//! owner (the first account); any other node can only be managed by the owner of its credential. A failed
//! lookup denies.
use crate::{
    db::worker::{DatabaseWorker, OperationError},
    services::{
        node_credentials::NodeCredentialsService,
        node_permissions::{NodePermissionRecord, NodePermissions, NodePermissionsService},
        node_state_manager::{
            CapabilityUpdate, NODE_PROTOCOL_VERSION, NodeLifecycle, NodePlatform, NodeRole,
            NodeState, NodeStateManager, NodeSurfaceType, UpsertNodeInput,
        },
        users::UserService,
    },
    ws::{NodeForget, WsNodeControl},
};
use rusqlite::Connection;
use serde_json::{Map, Value, json};
use std::sync::Mutex;
use tokio::runtime::Handle;

pub const GATEWAY_NODE_ID: &str = "gateway";

/// Capabilities the reference reports for a node that is not connected.
fn empty_capabilities() -> Value {
    json!({"providers": [], "surfaces": [], "tools": [], "screenShare": false, "voice": false, "preview": false})
}

pub struct ComposedNodes {
    worker: DatabaseWorker,
    runtime: Handle,
    registry: Mutex<NodeStateManager>,
}

impl ComposedNodes {
    /// `hostname` and `platform` are the gateway's own, as the filesystem routes advertise them.
    pub fn new(
        worker: DatabaseWorker,
        runtime: Handle,
        hostname: &str,
        platform: NodePlatform,
    ) -> Self {
        let mut registry = NodeStateManager::default();
        registry.upsert_node(UpsertNodeInput {
            id: GATEWAY_NODE_ID.into(),
            name: format!("Gateway ({hostname})"),
            platform,
            role: NodeRole::Gateway,
            client_id: GATEWAY_NODE_ID.into(),
            is_gateway: Some(true),
            protocol_version: None,
            capabilities: Some(CapabilityUpdate {
                providers: Some(Vec::new()),
                surfaces: Some(vec![NodeSurfaceType::Filesystem]),
                ..Default::default()
            }),
        });
        Self {
            worker,
            runtime,
            registry: Mutex::new(registry),
        }
    }

    /// Runs a job on the database worker from a blocking thread.
    fn database<T: Send + 'static>(
        &self,
        job: impl FnOnce(&Connection) -> Result<T, OperationError> + Send + 'static,
    ) -> Result<T, String> {
        self.runtime
            .block_on(self.worker.run(job))
            .map_err(|error| error.to_string())
    }

    pub(crate) fn live_nodes(&self) -> Result<Vec<NodeState>, String> {
        self.registry
            .lock()
            .map(|registry| registry.list_nodes())
            .map_err(|_| "node registry lock poisoned".to_owned())
    }
}

impl WsNodeControl for ComposedNodes {
    fn can_access(&self, user: &str, node_id: &str) -> bool {
        let (user, node_id) = (user.to_owned(), node_id.to_owned());
        self.database(move |db| {
            if node_id == GATEWAY_NODE_ID {
                return Ok(UserService::new(db).is_owner(&user)?);
            }
            Ok(NodeCredentialsService::new(Some(db))
                .owner(&node_id)?
                .is_some_and(|owner| owner == user))
        })
        .unwrap_or(false)
    }

    fn snapshot(&self) -> Result<Vec<Value>, String> {
        let live = self.live_nodes()?;
        let live_ids: Vec<String> = live.iter().map(|node| node.id.clone()).collect();
        let (stored, live_permissions) = self.database(move |db| {
            let service = NodePermissionsService::new(Some(db));
            let permissions: Vec<(String, NodePermissions)> = live_ids
                .into_iter()
                .map(|id| {
                    let grants = service.get_permissions(&id);
                    (id, grants)
                })
                .collect();
            Ok((service.list_node_permissions(), permissions))
        })?;
        Ok(merge_snapshot(stored, &live, &live_permissions))
    }

    fn update_permissions(&self, node_id: &str, grants: &Map<String, Value>) -> Result<(), String> {
        let (node_id, grants) = (node_id.to_owned(), grants.clone());
        self.database(move |db| {
            NodePermissionsService::new(Some(db)).update_permissions(&node_id, &grants, None);
            Ok(())
        })
    }

    fn forget(&self, node_id: &str) -> Result<NodeForget, String> {
        if self
            .registry
            .lock()
            .map_err(|_| "node registry lock poisoned".to_owned())?
            .get_node(node_id)
            .is_some()
        {
            return Ok(NodeForget::Online);
        }
        let node_id = node_id.to_owned();
        let forgotten = self
            .database(move |db| Ok(NodePermissionsService::new(Some(db)).forget_node(&node_id)?))?;
        Ok(if forgotten {
            NodeForget::Forgotten
        } else {
            NodeForget::NotFound
        })
    }
}

fn state_value(state: &NodeState, permissions: &NodePermissions) -> Value {
    let mut node = serde_json::to_value(state).unwrap_or(Value::Null);
    node["permissions"] = json!(permissions);
    node
}

/// The reference `buildNodePermissionSnapshot`: persisted nodes first, overlaid with their live state,
/// then live nodes that were never persisted. Connected nodes sort first, then the most recently seen.
fn merge_snapshot(
    stored: Vec<NodePermissionRecord>,
    live: &[NodeState],
    live_permissions: &[(String, NodePermissions)],
) -> Vec<Value> {
    let mut nodes: Vec<Value> = Vec::new();
    for record in &stored {
        let state = live.iter().find(|node| node.id == record.node_id);
        let lifecycle = state.map_or(NodeLifecycle::Disconnected, |node| node.lifecycle.clone());
        let name = record
            .name
            .clone()
            .or_else(|| state.map(|node| node.name.clone()))
            .unwrap_or_else(|| record.node_id.clone());
        nodes.push(json!({
            "id": record.node_id,
            "name": name,
            "platform": record.platform.clone()
                .or_else(|| state.and_then(|node| serde_json::to_value(&node.platform).ok()?.as_str().map(str::to_owned)))
                .unwrap_or_else(|| "linux".to_owned()),
            "role": record.role.clone()
                .or_else(|| state.and_then(|node| serde_json::to_value(&node.role).ok()?.as_str().map(str::to_owned)))
                .unwrap_or_else(|| "remote".to_owned()),
            "lifecycle": lifecycle,
            "protocolVersion": state.map_or(f64::from(NODE_PROTOCOL_VERSION), |node| node.protocol_version),
            "capabilities": state.map_or_else(empty_capabilities, |node| json!(node.capabilities)),
            "connectedAt": state.map_or_else(|| record.last_seen_at.clone(), |node| node.connected_at.clone()),
            "lastSeenAt": state.map_or_else(|| record.last_seen_at.clone(), |node| node.last_seen_at.clone()),
            "firstSeenAt": record.first_seen_at,
            "permissions": record.permissions,
        }));
    }
    for state in live {
        if stored.iter().any(|record| record.node_id == state.id) {
            continue;
        }
        let permissions = live_permissions
            .iter()
            .find(|(id, _)| *id == state.id)
            .map(|(_, grants)| grants.clone())
            .unwrap_or_default();
        nodes.push(state_value(state, &permissions));
    }
    let ready = |node: &Value| node["lifecycle"] == "ready";
    let seen = |node: &Value| node["lastSeenAt"].as_str().unwrap_or_default().to_owned();
    nodes.sort_by(|a, b| {
        if ready(a) != ready(b) {
            return if ready(a) {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        seen(b).cmp(&seen(a))
    });
    nodes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::num::NonZeroU16;

    fn controls() -> ComposedNodes {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE users(id TEXT PRIMARY KEY, created_at TEXT);
             INSERT INTO users VALUES('owner','2026-01-01'),('guest','2026-02-01');
             CREATE TABLE nodes(node_id TEXT PRIMARY KEY, name TEXT, platform TEXT, role TEXT, first_seen_at TEXT, last_seen_at TEXT, created_at TEXT, updated_at TEXT, user_id TEXT);
             CREATE TABLE node_permissions(node_id TEXT NOT NULL, capability TEXT NOT NULL, granted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY(node_id, capability));
             INSERT INTO nodes VALUES('laptop','Laptop','macos','desktop','2026-03-01T00:00:00.000Z','2026-03-02T00:00:00.000Z','x','x','guest');
             INSERT INTO node_permissions VALUES('laptop','terminal',1,'x');",
        )
        .unwrap();
        ComposedNodes::new(
            DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap(),
            Handle::current(),
            "build-host",
            NodePlatform::Linux,
        )
    }

    /// The controls block on the database worker, so they run off the async runtime.
    async fn blocking<T: Send + 'static>(
        nodes: std::sync::Arc<ComposedNodes>,
        job: impl FnOnce(&ComposedNodes) -> T + Send + 'static,
    ) -> T {
        tokio::task::spawn_blocking(move || job(&nodes))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn the_gateway_belongs_to_its_owner_and_other_nodes_to_their_credential_owner() {
        let nodes = std::sync::Arc::new(controls());
        assert!(blocking(nodes.clone(), |n| n.can_access("owner", "gateway")).await);
        assert!(!blocking(nodes.clone(), |n| n.can_access("guest", "gateway")).await);
        assert!(blocking(nodes.clone(), |n| n.can_access("guest", "laptop")).await);
        assert!(!blocking(nodes.clone(), |n| n.can_access("owner", "laptop")).await);
        // An unknown node has no credential owner, so nobody may manage it.
        assert!(!blocking(nodes.clone(), |n| n.can_access("owner", "missing")).await);
    }

    #[tokio::test]
    async fn the_snapshot_lists_the_live_gateway_and_stored_nodes_with_deny_by_default_grants() {
        let nodes = std::sync::Arc::new(controls());
        let snapshot = blocking(nodes.clone(), |n| n.snapshot().unwrap()).await;
        let ids: Vec<&str> = snapshot.iter().map(|n| n["id"].as_str().unwrap()).collect();
        // Connected nodes first, then stored ones that are not connected.
        assert_eq!(ids, ["gateway", "laptop"]);
        let gateway = &snapshot[0];
        assert_eq!(gateway["name"], "Gateway (build-host)");
        assert_eq!(gateway["role"], "gateway");
        assert_eq!(gateway["lifecycle"], "ready");
        assert_eq!(gateway["capabilities"]["surfaces"], json!(["filesystem"]));
        assert!(
            gateway["permissions"]
                .as_object()
                .unwrap()
                .values()
                .all(|granted| granted == false),
            "{gateway}"
        );
        let laptop = &snapshot[1];
        assert_eq!(laptop["lifecycle"], "disconnected");
        assert_eq!(laptop["capabilities"], empty_capabilities());
        assert_eq!(laptop["firstSeenAt"], "2026-03-01T00:00:00.000Z");
        assert_eq!(laptop["permissions"]["terminal"], true);
        assert_eq!(laptop["permissions"]["filesystem"], false);
    }

    #[tokio::test]
    async fn grants_persist_and_only_a_disconnected_stored_node_can_be_forgotten() {
        let nodes = std::sync::Arc::new(controls());
        let grants = json!({"filesystem": true, "terminal": 0});
        let grants = grants.as_object().unwrap().clone();
        blocking(nodes.clone(), move |n| {
            n.update_permissions("gateway", &grants).unwrap()
        })
        .await;
        let snapshot = blocking(nodes.clone(), |n| n.snapshot().unwrap()).await;
        assert_eq!(snapshot[0]["permissions"]["filesystem"], true);
        assert_eq!(snapshot[0]["permissions"]["terminal"], false);
        assert_eq!(
            blocking(nodes.clone(), |n| n.forget("gateway").unwrap()).await,
            NodeForget::Online
        );
        assert_eq!(
            blocking(nodes.clone(), |n| n.forget("nope").unwrap()).await,
            NodeForget::NotFound
        );
        assert_eq!(
            blocking(nodes.clone(), |n| n.forget("laptop").unwrap()).await,
            NodeForget::Forgotten
        );
        let snapshot = blocking(nodes, |n| n.snapshot().unwrap()).await;
        assert_eq!(snapshot.len(), 1);
    }
}
