//! Repository registration and path deduplication. Route/tool callers enforce ownership.
use super::{
    storage::{Storage, patch_text},
    users::Patch,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub name: String,
    pub default_branch: String,
    pub local_path: String,
    pub github_url: Option<String>,
    pub strategy: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRepository {
    pub name: String,
    pub local_path: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub device_id: Option<String>,
    #[serde(default)]
    pub default_branch: Option<String>,
    #[serde(default)]
    pub github_url: Option<String>,
    #[serde(default)]
    pub forge_url: Option<String>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RepositoryPatch {
    pub name: Patch<Option<String>>,
    pub default_branch: Patch<Option<String>>,
    pub local_path: Patch<Option<String>>,
    pub device_id: Patch<Option<String>>,
    pub github_url: Patch<Option<String>>,
    pub forge_url: Patch<Option<String>>,
    pub strategy: Patch<Option<String>>,
}
const COLUMNS: &str =
    "id,user_id,device_id,name,default_branch,local_path,github_url,strategy,created_at,updated_at";
fn record(row: &rusqlite::Row<'_>) -> rusqlite::Result<RepositoryRecord> {
    Ok(RepositoryRecord {
        id: row.get(0)?,
        user_id: row.get(1)?,
        device_id: row.get(2)?,
        name: row.get(3)?,
        default_branch: row.get(4)?,
        local_path: row.get(5)?,
        github_url: row.get(6)?,
        strategy: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}
pub struct RepositoryService<'a>(Storage<'a>);
impl<'a> RepositoryService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(Storage { db, time: None })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(Storage {
            db,
            time: Some(now),
        })
    }
    pub fn get(&self, id: &str) -> rusqlite::Result<Option<RepositoryRecord>> {
        self.0
            .db
            .query_row(
                &format!("SELECT {COLUMNS} FROM automation_repositories WHERE id=?"),
                [id],
                record,
            )
            .optional()
    }
    pub fn list(&self, user: Option<&str>) -> rusqlite::Result<Vec<RepositoryRecord>> {
        let mut statement=self.0.db.prepare(&format!("SELECT {COLUMNS} FROM automation_repositories WHERE (?1 IS NULL OR user_id=?1) ORDER BY updated_at DESC"))?;
        statement
            .query_map([user.filter(|v| !v.is_empty())], record)?
            .collect()
    }
    pub fn find_by_path(
        &self,
        path: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<RepositoryRecord>> {
        self.0.db.query_row(&format!("SELECT {COLUMNS} FROM automation_repositories WHERE local_path=?1 AND (?2 IS NULL OR user_id=?2)"),params![path,user.filter(|v|!v.is_empty())],record).optional()
    }
    pub fn create(&self, data: CreateRepository) -> rusqlite::Result<RepositoryRecord> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.0.now()?;
        if let Err(error)=self.0.db.execute("INSERT INTO automation_repositories(id,user_id,device_id,name,default_branch,local_path,github_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",params![id,data.user_id,data.device_id,data.name,data.default_branch.as_deref().unwrap_or("main"),data.local_path,data.github_url.or(data.forge_url),now,now]) {
            // Match the reference's recovery after any failed insert, including a
            // concurrent winner of the (owner,path) unique index. Do not normalize paths.
            if let Some(existing)=self.find_by_path(&data.local_path,data.user_id.as_deref())? {return Ok(existing)}
            return Err(error)
        }
        self.get(&id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
    }
    pub fn update(
        &self,
        id: &str,
        data: RepositoryPatch,
    ) -> rusqlite::Result<Option<RepositoryRecord>> {
        let mut fields = vec![];
        patch_text(&mut fields, "name", data.name);
        patch_text(&mut fields, "default_branch", data.default_branch);
        patch_text(&mut fields, "local_path", data.local_path);
        patch_text(&mut fields, "device_id", data.device_id);
        let url = if matches!(data.github_url, Patch::Missing) {
            data.forge_url
        } else {
            data.github_url
        };
        patch_text(&mut fields, "github_url", url);
        patch_text(&mut fields, "strategy", data.strategy);
        self.0.update("automation_repositories", id, fields)?;
        self.get(id)
    }
    pub fn delete(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .db
            .execute("DELETE FROM automation_repositories WHERE id=?", [id])?;
        Ok(())
    }
}
