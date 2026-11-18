//! Durable todo/proposal lifecycle. Caller authorizes the owning repository.
use super::{
    storage::{Storage, json_text, patch_text},
    users::Patch,
};
use rusqlite::{Connection, OptionalExtension, params, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalRecord {
    pub id: String,
    pub repo_id: String,
    pub user_id: Option<String>,
    pub message: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub tags: String,
    pub completed_at: Option<String>,
    pub completion_history: String,
    pub source_thread_id: Option<String>,
    pub source_thread_title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProposal {
    pub repo_id: String,
    pub message: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub source_thread_id: Option<String>,
    #[serde(default)]
    pub source_thread_title: Option<String>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProposalPatch {
    pub message: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Patch<Option<String>>,
    pub tags: Option<Vec<String>>,
}
const COLUMNS: &str = "id,repo_id,user_id,message,status,priority,due_date,tags,completed_at,completion_history,source_thread_id,source_thread_title,created_at,updated_at";
fn record(r: &rusqlite::Row<'_>) -> rusqlite::Result<ProposalRecord> {
    Ok(ProposalRecord {
        id: r.get(0)?,
        repo_id: r.get(1)?,
        user_id: r.get(2)?,
        message: r.get(3)?,
        status: r.get(4)?,
        priority: r.get(5)?,
        due_date: r.get(6)?,
        tags: r.get(7)?,
        completed_at: r.get(8)?,
        completion_history: r.get(9)?,
        source_thread_id: r.get(10)?,
        source_thread_title: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}
fn completion_history(raw: &str) -> Vec<Value> {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|v| {
            v["completedAt"].is_string()
                && (v["previousStatus"].is_string()
                    || v.get("previousStatus") == Some(&Value::Null))
        })
        .collect()
}
pub struct RepoProposalService<'a>(Storage<'a>);
impl<'a> RepoProposalService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(Storage { db, time: None })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(Storage {
            db,
            time: Some(now),
        })
    }
    pub fn get(&self, id: &str) -> rusqlite::Result<Option<ProposalRecord>> {
        self.0
            .db
            .query_row(
                &format!("SELECT {COLUMNS} FROM automation_repo_proposals WHERE id=?"),
                [id],
                record,
            )
            .optional()
    }
    pub fn list_by_repo(&self, repo: &str) -> rusqlite::Result<Vec<ProposalRecord>> {
        self.0.db.prepare(&format!("SELECT {COLUMNS} FROM automation_repo_proposals WHERE repo_id=? ORDER BY updated_at DESC"))?.query_map([repo],record)?.collect()
    }
    pub fn create(&self, data: CreateProposal) -> rusqlite::Result<ProposalRecord> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.0.now()?;
        let status = data.status.as_deref().unwrap_or("open");
        let history = if status == "done" {
            json_text(&json!([{"completedAt":now,"previousStatus":null}]))
        } else {
            "[]".into()
        };
        self.0.db.execute("INSERT INTO automation_repo_proposals(id,repo_id,user_id,message,status,priority,due_date,tags,completed_at,completion_history,source_thread_id,source_thread_title,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",params![id,data.repo_id,data.user_id,crate::text::js_trim(&data.message),status,data.priority.as_deref().unwrap_or("normal"),data.due_date,json_text(&json!(data.tags.unwrap_or_default())),if status=="done"{Some(&now)}else{None},history,data.source_thread_id,data.source_thread_title,now,now])?;
        self.get(&id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }
    pub fn update(
        &self,
        id: &str,
        data: ProposalPatch,
    ) -> rusqlite::Result<Option<ProposalRecord>> {
        let Some(existing) = self.get(id)? else {
            return Ok(None);
        };
        let now = self.0.now()?;
        let mut fields = vec![];
        if let Some(message) = data.message {
            fields.push((
                "message",
                SqlValue::Text(crate::text::js_trim(&message).into()),
            ))
        }
        if let Some(status) = data.status {
            if status == "done" && existing.status != "done" {
                let mut history = vec![json!({"completedAt":now,"previousStatus":existing.status})];
                history.extend(completion_history(&existing.completion_history));
                history.truncate(100);
                fields.push(("completed_at", SqlValue::Text(now.clone())));
                fields.push((
                    "completion_history",
                    SqlValue::Text(json_text(&json!(history))),
                ));
            } else if status != "done" && existing.status == "done" {
                fields.push(("completed_at", SqlValue::Null));
            }
            fields.push(("status", SqlValue::Text(status)));
        }
        if let Some(priority) = data.priority {
            fields.push(("priority", SqlValue::Text(priority)))
        }
        patch_text(&mut fields, "due_date", data.due_date);
        if let Some(tags) = data.tags {
            fields.push(("tags", SqlValue::Text(json_text(&json!(tags)))))
        }
        self.0
            .update_at("automation_repo_proposals", id, fields, &now)?;
        self.get(id)
    }
    pub fn delete(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .db
            .execute("DELETE FROM automation_repo_proposals WHERE id=?", [id])?;
        Ok(())
    }
}
