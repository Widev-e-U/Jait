//! Deny-by-default capability persistence. No node transport or consent bypass is exposed.
use super::storage::Storage;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeCapability {
    Terminal,
    Filesystem,
    Screen,
    Input,
    Voice,
    Browser,
    Camera,
    Network,
    Agent,
}
pub const NODE_CAPABILITIES: [NodeCapability; 9] = [
    NodeCapability::Terminal,
    NodeCapability::Filesystem,
    NodeCapability::Screen,
    NodeCapability::Input,
    NodeCapability::Voice,
    NodeCapability::Browser,
    NodeCapability::Camera,
    NodeCapability::Network,
    NodeCapability::Agent,
];
impl NodeCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Terminal => "terminal",
            Self::Filesystem => "filesystem",
            Self::Screen => "screen",
            Self::Input => "input",
            Self::Voice => "voice",
            Self::Browser => "browser",
            Self::Camera => "camera",
            Self::Network => "network",
            Self::Agent => "agent",
        }
    }
    pub fn parse(value: &str) -> Option<Self> {
        NODE_CAPABILITIES.into_iter().find(|c| c.as_str() == value)
    }
}
pub fn is_node_capability(value: &Value) -> bool {
    value.as_str().and_then(NodeCapability::parse).is_some()
}
pub type NodePermissions = BTreeMap<NodeCapability, bool>;
#[derive(Deserialize)]
pub struct NodeHello {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub platform: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePermissionRecord {
    pub node_id: String,
    pub name: Option<String>,
    pub platform: Option<String>,
    pub role: Option<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub permissions: NodePermissions,
}
pub struct NodePermissionsService<'a> {
    storage: Option<Storage<'a>>,
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64().is_some_and(|v| v != 0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
impl<'a> NodePermissionsService<'a> {
    pub fn new(db: Option<&'a Connection>) -> Self {
        Self {
            storage: db.map(|db| Storage { db, time: None }),
        }
    }
    pub fn with_time(db: Option<&'a Connection>, now: &'a str) -> Self {
        Self {
            storage: db.map(|db| Storage {
                db,
                time: Some(now),
            }),
        }
    }
    pub fn ensure_node_seen(&self, hello: &NodeHello, now: Option<&str>) {
        let Some(storage) = &self.storage else { return };
        let _ = (|| -> rusqlite::Result<()> {
            let now = now
                .map(String::from)
                .map(Ok)
                .unwrap_or_else(|| storage.now())?;
            let exists = storage
                .db
                .query_row(
                    "SELECT node_id FROM nodes WHERE node_id=?",
                    [&hello.id],
                    |r| r.get::<_, String>(0),
                )
                .optional()?
                .is_some();
            if !exists {
                storage.db.execute("INSERT INTO nodes(node_id,name,platform,role,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",params![hello.id,hello.name,hello.platform,hello.role.as_deref().unwrap_or("remote"),now,now,now,now])?;
                for capability in NODE_CAPABILITIES {
                    let _=storage.db.execute("INSERT INTO node_permissions(node_id,capability,granted,updated_at) VALUES(?,?,0,?)",params![hello.id,capability.as_str(),now]);
                }
            } else {
                storage.db.execute(
                    "UPDATE nodes SET last_seen_at=?,updated_at=? WHERE node_id=?",
                    params![now, now, hello.id],
                )?;
            }
            Ok(())
        })();
    }
    pub fn is_granted(&self, node: &str, capability: NodeCapability) -> bool {
        self.storage.as_ref().and_then(|s| {
            s.db.query_row(
                "SELECT granted FROM node_permissions WHERE node_id=? AND capability=?",
                params![node, capability.as_str()],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .ok()
            .flatten()
        }) == Some(1)
    }
    pub fn get_permissions(&self, node: &str) -> NodePermissions {
        NODE_CAPABILITIES
            .into_iter()
            .map(|c| (c, self.is_granted(node, c)))
            .collect()
    }
    pub fn list_node_permissions(&self) -> Vec<NodePermissionRecord> {
        let Some(storage) = &self.storage else {
            return vec![];
        };
        (|| -> rusqlite::Result<Vec<NodePermissionRecord>> {
            storage
                .db
                .prepare("SELECT node_id,name,platform,role,first_seen_at,last_seen_at FROM nodes")?
                .query_map([], |r| {
                    let id: String = r.get(0)?;
                    Ok(NodePermissionRecord {
                        permissions: self.get_permissions(&id),
                        node_id: id,
                        name: r.get(1)?,
                        platform: r.get(2)?,
                        role: r.get(3)?,
                        first_seen_at: r.get(4)?,
                        last_seen_at: r.get(5)?,
                    })
                })?
                .collect()
        })()
        .unwrap_or_default()
    }
    pub fn forget_node(&self, node: &str) -> rusqlite::Result<bool> {
        let Some(storage) = &self.storage else {
            return Ok(false);
        };
        let transaction = storage.db.unchecked_transaction()?;
        if transaction
            .query_row("SELECT node_id FROM nodes WHERE node_id=?", [node], |r| {
                r.get::<_, String>(0)
            })
            .optional()?
            .is_none()
        {
            return Ok(false);
        }
        transaction.execute("DELETE FROM node_permissions WHERE node_id=?", [node])?;
        transaction.execute("DELETE FROM nodes WHERE node_id=?", [node])?;
        transaction.commit()?;
        Ok(true)
    }
    pub fn update_permissions(
        &self,
        node: &str,
        grants: &Map<String, Value>,
        now: Option<&str>,
    ) -> NodePermissions {
        if let Some(storage) = &self.storage {
            let now = now
                .map(String::from)
                .map(Ok)
                .unwrap_or_else(|| storage.now());
            if let Ok(now) = now {
                for (key, value) in grants {
                    if NodeCapability::parse(key).is_some() {
                        let _=storage.db.execute("INSERT INTO node_permissions(node_id,capability,granted,updated_at) VALUES(?,?,?,?) ON CONFLICT(node_id,capability) DO UPDATE SET granted=excluded.granted,updated_at=excluded.updated_at",params![node,key,i64::from(truthy(value)),now]);
                    }
                }
            }
        }
        self.get_permissions(node)
    }
    pub fn log_denied(&self, node: &str, capability: NodeCapability, detail: &str) {
        let Some(storage) = &self.storage else { return };
        if let Ok(now) = storage.now() {
            let _=storage.db.execute("INSERT INTO consent_log(id,action_id,tool_name,decision,decided_at,decided_via) VALUES(?,?,?,'rejected',?,'auto')",params![crate::db::identifiers::uuidv7().to_string(),format!("node-permission:{node}:{}",capability.as_str()),format!("node.{}",capability.as_str()),now]);
        }
        eprintln!("[node-permissions] {detail}");
    }
}
