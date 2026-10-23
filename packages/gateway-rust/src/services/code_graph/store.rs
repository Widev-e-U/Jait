//! SQLite index state. Owner filtering is applied on every read and write.
//! This repository does not grant filesystem or process authorization.
use super::engine::GraphError;
use crate::{
    db::identifiers::uuidv7,
    time::{Clock, iso},
};
use rusqlite::{Connection, OptionalExtension, params_from_iter, types::Value as SqlValue};
use serde_json::{Value, json};

const FIELDS: &[(&str, &str)] = &[
    ("repositoryId", "repository_id"),
    ("status", "status"),
    ("graphPath", "graph_path"),
    ("graphVersion", "graph_version"),
    ("sourceRevision", "source_revision"),
    ("graphifyVersion", "graphify_version"),
    ("stats", "stats"),
    ("graphRagStatus", "graphrag_status"),
    ("graphRagPath", "graphrag_path"),
    ("error", "error"),
];
fn error(error: rusqlite::Error) -> GraphError {
    GraphError::error(error.to_string())
}
pub struct IndexStore<'a> {
    pub db: &'a Connection,
    pub clock: &'a Clock,
}
impl IndexStore<'_> {
    pub fn stored(&self, root: &str, user: Option<&str>) -> Result<Option<Value>, GraphError> {
        let columns = FIELDS.iter().map(|(_, c)| *c).collect::<Vec<_>>().join(",");
        self.db.query_row(&format!("SELECT id,project_root,created_at,updated_at,{columns} FROM code_graph_indexes WHERE project_root=?1 AND user_id IS ?2"),
            [Some(root),user.filter(|s|!s.is_empty())],|row| {
                let mut out=json!({"id":row.get::<_,String>(0)?,"projectRoot":row.get::<_,String>(1)?,"createdAt":row.get::<_,String>(2)?,"updatedAt":row.get::<_,String>(3)?,"provider":"graphify"});
                for (i,(key,_)) in FIELDS.iter().enumerate() {
                    let text:Option<String>=row.get(i+4)?;
                    out[*key]=if *key=="stats" {text.and_then(|s|serde_json::from_str(&s).ok()).unwrap_or(Value::Null)} else {json!(text)};
                }
                Ok(out)
            }).optional().map_err(error)
    }
    pub fn get(&self, root: &str, user: Option<&str>) -> Result<Value, GraphError> {
        if let Some(index) = self.stored(root, user)? {
            return Ok(index);
        }
        let now = iso((self.clock)()).map_err(GraphError::error)?;
        Ok(
            json!({"id":format!("missing:{root}"),"projectRoot":root,"provider":"graphify","status":"missing","graphRagStatus":"not-prepared","createdAt":now,"updatedAt":now}),
        )
    }
    /// Patch undefined preserves fields; explicit null clears nullable fields.
    /// repositoryId and graphRagStatus use the reference's nullish fallback.
    pub fn save(&self, root: &str, user: Option<&str>, patch: &Value) -> Result<Value, GraphError> {
        let existing = self.stored(root, user)?;
        let now = iso((self.clock)()).map_err(GraphError::error)?;
        let mut values = vec![];
        for (key, _) in FIELDS {
            let value = if *key == "error" {
                patch.get(*key).cloned().unwrap_or(Value::Null)
            } else if matches!(*key, "repositoryId" | "graphRagStatus") {
                patch
                    .get(*key)
                    .filter(|v| !v.is_null())
                    .or_else(|| existing.as_ref().and_then(|e| e.get(*key)))
                    .cloned()
                    .unwrap_or(if *key == "graphRagStatus" {
                        json!("not-prepared")
                    } else {
                        Value::Null
                    })
            } else {
                patch
                    .get(*key)
                    .or_else(|| existing.as_ref().and_then(|e| e.get(*key)))
                    .cloned()
                    .unwrap_or(Value::Null)
            };
            values.push(if value.is_null() {
                SqlValue::Null
            } else if *key == "stats" {
                SqlValue::Text(crate::services::storage::json_text(&value))
            } else {
                SqlValue::Text(value.as_str().unwrap_or("").into())
            });
        }
        values.push(SqlValue::Text(now.clone()));
        if let Some(existing) = existing {
            values.push(SqlValue::Text(existing["id"].as_str().unwrap().into()));
            let fields = FIELDS
                .iter()
                .map(|(_, c)| format!("{c}=?"))
                .chain(std::iter::once("updated_at=?".into()))
                .collect::<Vec<_>>()
                .join(",");
            self.db
                .execute(
                    &format!("UPDATE code_graph_indexes SET {fields} WHERE id=?"),
                    params_from_iter(values),
                )
                .map_err(error)?;
        } else {
            values.extend([
                SqlValue::Text(uuidv7().to_string()),
                user.map(|s| SqlValue::Text(s.into()))
                    .unwrap_or(SqlValue::Null),
                SqlValue::Text(root.into()),
                SqlValue::Text(now),
            ]);
            let columns = FIELDS
                .iter()
                .map(|(_, c)| *c)
                .chain(["updated_at", "id", "user_id", "project_root", "created_at"])
                .collect::<Vec<_>>()
                .join(",");
            let placeholders = vec!["?"; values.len()].join(",");
            self.db
                .execute(
                    &format!("INSERT INTO code_graph_indexes ({columns}) VALUES ({placeholders})"),
                    params_from_iter(values),
                )
                .map_err(error)?;
        }
        self.stored(root, user)?
            .ok_or_else(|| GraphError::error("Saved code graph index disappeared"))
    }
}
