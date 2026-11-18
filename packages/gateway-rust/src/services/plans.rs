//! Repository plans with durable task JSON and per-task patching.
use super::storage::{Storage, json_text};
use rusqlite::{Connection, OptionalExtension, params, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanRecord {
    pub id: String,
    pub repo_id: String,
    pub user_id: Option<String>,
    pub title: String,
    pub status: String,
    pub tasks: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlan {
    pub repo_id: String,
    pub title: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub tasks: Option<Vec<Value>>,
}
#[derive(Default, Deserialize)]
#[serde(default)]
pub struct PlanPatch {
    pub title: Option<String>,
    pub status: Option<String>,
    pub tasks: Option<Vec<Value>>,
}
fn record(r: &rusqlite::Row<'_>) -> rusqlite::Result<PlanRecord> {
    let raw: String = r.get(5)?;
    let tasks = serde_json::from_str::<Value>(&raw)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    Ok(PlanRecord {
        id: r.get(0)?,
        repo_id: r.get(1)?,
        user_id: r.get(2)?,
        title: r.get(3)?,
        status: r.get(4)?,
        tasks,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}
const COLUMNS: &str = "id,repo_id,user_id,title,status,tasks,created_at,updated_at";
pub fn new_task_id() -> String {
    crate::db::identifiers::uuidv7().to_string()[28..].into()
}
pub struct PlanService<'a>(Storage<'a>);
impl<'a> PlanService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(Storage { db, time: None })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(Storage {
            db,
            time: Some(now),
        })
    }
    pub fn get(&self, id: &str) -> rusqlite::Result<Option<PlanRecord>> {
        self.0
            .db
            .query_row(
                &format!("SELECT {COLUMNS} FROM automation_plans WHERE id=?"),
                [id],
                record,
            )
            .optional()
    }
    fn list(&self, column: &'static str, value: &str) -> rusqlite::Result<Vec<PlanRecord>> {
        self.0
            .db
            .prepare(&format!(
                "SELECT {COLUMNS} FROM automation_plans WHERE {column}=? ORDER BY updated_at DESC"
            ))?
            .query_map([value], record)?
            .collect()
    }
    pub fn list_by_repo(&self, id: &str) -> rusqlite::Result<Vec<PlanRecord>> {
        self.list("repo_id", id)
    }
    pub fn list_by_user(&self, id: &str) -> rusqlite::Result<Vec<PlanRecord>> {
        self.list("user_id", id)
    }
    pub fn create(&self, data: CreatePlan) -> rusqlite::Result<PlanRecord> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.0.now()?;
        self.0.db.execute("INSERT INTO automation_plans(id,repo_id,user_id,title,status,tasks,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?,?)",params![id,data.repo_id,data.user_id,data.title,json_text(&json!(data.tasks.unwrap_or_default())),now,now])?;
        self.get(&id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }
    pub fn update(&self, id: &str, data: PlanPatch) -> rusqlite::Result<Option<PlanRecord>> {
        let mut fields = vec![];
        if let Some(title) = data.title {
            fields.push(("title", SqlValue::Text(title)))
        }
        if let Some(status) = data.status {
            fields.push(("status", SqlValue::Text(status)))
        }
        if let Some(tasks) = data.tasks {
            fields.push(("tasks", SqlValue::Text(json_text(&json!(tasks)))))
        }
        self.0.update("automation_plans", id, fields)?;
        self.get(id)
    }
    pub fn update_task(
        &self,
        id: &str,
        task_id: &str,
        patch: &Map<String, Value>,
    ) -> rusqlite::Result<Option<PlanRecord>> {
        let Some(plan) = self.get(id)? else {
            return Ok(None);
        };
        let mut tasks = plan.tasks;
        for task in &mut tasks {
            // The reference dereferences t.id and fails for a legacy null task.
            if task.is_null() {
                return Err(rusqlite::Error::InvalidQuery);
            }
            if task.get("id").and_then(Value::as_str) == Some(task_id)
                && let Some(task) = task.as_object_mut()
            {
                task.extend(patch.clone());
            }
        }
        self.update(
            id,
            PlanPatch {
                tasks: Some(tasks),
                ..Default::default()
            },
        )
    }
    pub fn delete(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .db
            .execute("DELETE FROM automation_plans WHERE id=?", [id])?;
        Ok(())
    }
}
