//! SQLite memory persistence. The caller selects the project/contact database and
//! authorizes access; storage does not broaden scope or inject records into prompts.
use super::entries::{MemoryBackend, MemoryEntry, MemoryScope, MemorySource};
use crate::services::storage::Storage;
use rusqlite::{Connection, OptionalExtension, params};
pub struct SqliteMemoryBackend<'a>(Storage<'a>);
fn entry(r: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryEntry> {
    let scope: String = r.get(1)?;
    Ok(MemoryEntry {
        id: r.get(0)?,
        scope: match scope.as_str() {
            "project" => MemoryScope::Project,
            "contact" => MemoryScope::Contact,
            _ => MemoryScope::Other(scope),
        },
        content: r.get(2)?,
        source: MemorySource {
            kind: r.get(3)?,
            id: r.get(4)?,
            surface: r.get(5)?,
        },
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
        expires_at: r.get(8)?,
    })
}
impl<'a> SqliteMemoryBackend<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(Storage { db, time: None })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(Storage {
            db,
            time: Some(now),
        })
    }
}
impl MemoryBackend for SqliteMemoryBackend<'_> {
    type Error = rusqlite::Error;
    fn save(&self, value: &MemoryEntry) -> rusqlite::Result<()> {
        self.0.db.execute("INSERT INTO memories(id,scope,content,source_type,source_id,source_surface,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",params![value.id,value.scope.as_str(),value.content,value.source.kind,value.source.id,value.source.surface,value.created_at,value.updated_at,value.expires_at])?;
        Ok(())
    }
    fn update(&self, value: &MemoryEntry) -> rusqlite::Result<()> {
        self.0.db.execute("UPDATE memories SET scope=?,content=?,source_type=?,source_id=?,source_surface=?,updated_at=?,expires_at=? WHERE id=?",params![value.scope.as_str(),value.content,value.source.kind,value.source.id,value.source.surface,value.updated_at,value.expires_at,value.id])?;
        Ok(())
    }
    fn list(&self, scope: Option<&MemoryScope>) -> rusqlite::Result<Vec<MemoryEntry>> {
        let now = self.0.now()?;
        let columns = "id,scope,content,source_type,source_id,source_surface,created_at,updated_at,expires_at";
        if let Some(scope) = scope.filter(|v| !v.as_str().is_empty()) {
            self.0.db.prepare(&format!("SELECT {columns} FROM memories WHERE scope=?1 AND (expires_at IS NULL OR NOT(expires_at<=?2)) ORDER BY created_at"))?.query_map(params![scope.as_str(),now],entry)?.collect()
        } else {
            self.0.db.prepare(&format!("SELECT {columns} FROM memories WHERE expires_at IS NULL OR NOT(expires_at<=?1) ORDER BY created_at"))?.query_map([now],entry)?.collect()
        }
    }
    fn forget(&self, id: &str) -> rusqlite::Result<bool> {
        if self
            .0
            .db
            .query_row("SELECT id FROM memories WHERE id=?", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()?
            .is_none()
        {
            return Ok(false);
        }
        self.0.db.execute("DELETE FROM memories WHERE id=?", [id])?;
        Ok(true)
    }
    fn forget_expired(&self, now: Option<&str>) -> rusqlite::Result<usize> {
        let now = now
            .map(String::from)
            .map(Ok)
            .unwrap_or_else(|| self.0.now())?;
        let count: i64 = self.0.db.query_row(
            "SELECT count(*) FROM memories WHERE expires_at IS NOT NULL AND expires_at<=?",
            [&now],
            |r| r.get(0),
        )?;
        if count > 0 {
            self.0.db.execute(
                "DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at<=?",
                [now],
            )?;
        }
        usize::try_from(count).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, count))
    }
}
