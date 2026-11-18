//! Persist audit facts on the SQLite worker. Redact secrets before constructing entries.
use crate::contracts::bounded_json::serialize_bounded_json;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub session_id: Option<String>,
    pub surface_type: Option<String>,
    pub device_id: Option<String>,
    pub action_id: String,
    pub action_type: String,
    pub tool_name: Option<String>,
    pub inputs: Option<Value>,
    pub outputs: Option<Value>,
    pub side_effects: Option<Value>,
    pub parent_action_id: Option<String>,
    pub status: String,
    pub consent_method: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub id: String,
    pub timestamp: String,
    pub session_id: Option<String>,
    pub surface_type: Option<String>,
    pub device_id: Option<String>,
    pub action_id: String,
    pub action_type: String,
    pub tool_name: Option<String>,
    pub inputs: Option<String>,
    pub outputs: Option<String>,
    pub side_effects: Option<String>,
    pub signature: Option<String>,
    pub parent_action_id: Option<String>,
    pub status: String,
    pub consent_method: Option<String>,
}
pub struct AuditWriter<'a> {
    db: &'a Connection,
    time: Option<&'a str>,
}
impl<'a> AuditWriter<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db, time: None }
    }
    pub fn with_time(db: &'a Connection, time: &'a str) -> Self {
        Self {
            db,
            time: Some(time),
        }
    }
    pub fn write(&self, entry: AuditEntry) -> rusqlite::Result<String> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = match self.time {
            Some(time) => time.into(),
            None => self
                .db
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get::<_, String>(0)
                })?,
        };
        let bounded = |value: Option<Value>| {
            value
                .filter(|v| !v.is_null())
                .map(|v| serialize_bounded_json(&v, 128000))
        };
        self.db.execute("INSERT INTO audit_log(id,timestamp,session_id,surface_type,device_id,action_id,action_type,tool_name,inputs,outputs,side_effects,signature,parent_action_id,status,consent_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)",
            params![id,now,entry.session_id,entry.surface_type,entry.device_id,entry.action_id,entry.action_type,entry.tool_name,bounded(entry.inputs),bounded(entry.outputs),bounded(entry.side_effects),entry.parent_action_id,entry.status,entry.consent_method])?;
        Ok(id)
    }
    pub fn has_action(&self, action_id: &str) -> rusqlite::Result<bool> {
        Ok(self
            .db
            .query_row(
                "SELECT id FROM audit_log WHERE action_id=? LIMIT 1",
                [action_id],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .is_some())
    }
    pub fn get_by_session(&self, session_id: &str) -> rusqlite::Result<Vec<AuditRecord>> {
        self.records(Some(session_id))
    }
    pub fn get_all(&self) -> rusqlite::Result<Vec<AuditRecord>> {
        self.records(None)
    }
    fn records(&self, session_id: Option<&str>) -> rusqlite::Result<Vec<AuditRecord>> {
        let mut statement=self.db.prepare("SELECT id,timestamp,session_id,surface_type,device_id,action_id,action_type,tool_name,inputs,outputs,side_effects,signature,parent_action_id,status,consent_method FROM audit_log WHERE ?1 IS NULL OR session_id=?1 ORDER BY timestamp")?;
        statement
            .query_map([session_id], |r| {
                Ok(AuditRecord {
                    id: r.get(0)?,
                    timestamp: r.get(1)?,
                    session_id: r.get(2)?,
                    surface_type: r.get(3)?,
                    device_id: r.get(4)?,
                    action_id: r.get(5)?,
                    action_type: r.get(6)?,
                    tool_name: r.get(7)?,
                    inputs: r.get(8)?,
                    outputs: r.get(9)?,
                    side_effects: r.get(10)?,
                    signature: r.get(11)?,
                    parent_action_id: r.get(12)?,
                    status: r.get(13)?,
                    consent_method: r.get(14)?,
                })
            })?
            .collect()
    }
}
