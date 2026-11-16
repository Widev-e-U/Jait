//! Node ownership and hashed revocable credentials. No implicit database discovery.
//! Repository calls are synchronous and belong on DatabaseWorker in HTTP adapters.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeIdentity {
    pub user_id: String,
    pub node_id: String,
}
pub struct NodeCredentialsService<'a> {
    db: Option<&'a Connection>,
    owners: HashMap<String, String>,
    credentials: HashMap<String, NodeIdentity>,
}
fn digest(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
impl<'a> NodeCredentialsService<'a> {
    pub fn new(db: Option<&'a Connection>) -> Self {
        Self {
            db,
            owners: HashMap::new(),
            credentials: HashMap::new(),
        }
    }
    pub fn owner(&self, node_id: &str) -> rusqlite::Result<Option<String>> {
        match self.db {
            Some(db) => Ok(db
                .query_row(
                    "SELECT user_id FROM nodes WHERE node_id=?",
                    [node_id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .optional()?
                .flatten()),
            None => Ok(self.owners.get(node_id).cloned()),
        }
    }
    pub fn bind(&mut self, node_id: &str, user_id: &str) -> rusqlite::Result<bool> {
        if let Some(owner) = self.owner(node_id)?.filter(|v| !v.is_empty())
            && owner != user_id
        {
            return Ok(false);
        }
        if let Some(db) = self.db {
            db.execute(
                "UPDATE nodes SET user_id=? WHERE node_id=?",
                params![user_id, node_id],
            )?;
        }
        self.owners.insert(node_id.into(), user_id.into());
        Ok(true)
    }
    pub fn issue(&mut self, node_id: &str, user_id: &str) -> Result<Option<String>, Error> {
        let mut bytes = [0; 32];
        getrandom::fill(&mut bytes)?;
        let token = format!("jait-node-{}", URL_SAFE_NO_PAD.encode(bytes));
        let hash = digest(&token);
        if let Some(db) = self.db {
            // The owner check and insert must share one write-locked transaction:
            // another connection may otherwise transfer the node between them.
            let tx =
                rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)?;
            let owned: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM nodes WHERE node_id=? AND user_id=?)",
                params![node_id, user_id],
                |row| row.get(0),
            )?;
            if !owned {
                return Ok(None);
            }
            tx.execute("INSERT INTO node_credentials(token_hash,node_id,user_id,created_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",params![hash,node_id,user_id])?;
            tx.commit()?;
        } else {
            if self.owner(node_id)?.as_deref() != Some(user_id) {
                return Ok(None);
            }
            self.credentials.insert(
                hash,
                NodeIdentity {
                    node_id: node_id.into(),
                    user_id: user_id.into(),
                },
            );
        }
        Ok(Some(token))
    }
    pub fn resolve(&self, token: &str) -> rusqlite::Result<Option<NodeIdentity>> {
        let hash = digest(token);
        match self.db {
            // Resolve the credential and verify its owner in one SQLite snapshot.
            // Separate queries could accept a credential revoked between the reads.
            Some(db) => db
                .query_row(
                    "SELECT c.user_id,c.node_id FROM node_credentials c \
                     JOIN nodes n ON n.node_id=c.node_id AND n.user_id=c.user_id \
                     WHERE c.token_hash=?",
                    [hash],
                    |r| {
                        Ok(NodeIdentity {
                            user_id: r.get(0)?,
                            node_id: r.get(1)?,
                        })
                    },
                )
                .optional(),
            None => Ok(self
                .credentials
                .get(&hash)
                .filter(|identity| self.owners.get(&identity.node_id) == Some(&identity.user_id))
                .cloned()),
        }
    }

    pub fn revoke(&mut self, node_id: &str, user_id: &str) -> rusqlite::Result<bool> {
        if let Some(db) = self.db {
            let tx =
                rusqlite::Transaction::new_unchecked(db, rusqlite::TransactionBehavior::Immediate)?;
            let owned: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM nodes WHERE node_id=? AND user_id=?)",
                params![node_id, user_id],
                |row| row.get(0),
            )?;
            if !owned {
                return Ok(false);
            }
            tx.execute("DELETE FROM node_credentials WHERE node_id=?", [node_id])?;
            tx.commit()?;
        } else if self.owner(node_id)?.as_deref() != Some(user_id) {
            return Ok(false);
        }
        self.credentials
            .retain(|_, credential| credential.node_id != node_id);
        Ok(true)
    }
}
