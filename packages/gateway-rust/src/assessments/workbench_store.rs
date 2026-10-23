//! Fixed SQL and owner predicates for expanded security checks. Raw artifacts
//! remain separate from normalized evidence and report exports.
use crate::db::worker::{DatabaseError, DatabaseWorker, OperationError};
use futures_util::future::BoxFuture;
use rusqlite::{Connection, params};
use serde_json::Value;
pub struct WorkbenchHistory {
    pub runs: Vec<Value>,
    pub findings: Vec<Value>,
}
pub struct RawArtifact {
    pub id: String,
    pub run: String,
    pub owner: String,
    pub sha256: String,
    pub content_type: String,
    pub raw: String,
}
pub trait WorkbenchStore: Send + Sync {
    fn load(&self) -> BoxFuture<'static, Result<Vec<Value>, String>>;
    fn history(&self, owner: String) -> BoxFuture<'static, Result<WorkbenchHistory, String>>;
    fn run(&self, id: String, owner: String) -> BoxFuture<'static, Result<Option<Value>, String>>;
    fn finding(
        &self,
        id: String,
        owner: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>>;
    fn save_run(&self, run: Value) -> BoxFuture<'static, Result<(), String>>;
    fn save_finding(&self, finding: Value, owner: String)
    -> BoxFuture<'static, Result<(), String>>;
    fn save_artifact(&self, artifact: RawArtifact) -> BoxFuture<'static, Result<(), String>>;
    fn delete_run(&self, id: String, owner: String) -> BoxFuture<'static, Result<(), String>>;
}
#[derive(Clone)]
pub struct SqliteWorkbenchStore {
    database: DatabaseWorker,
}
impl SqliteWorkbenchStore {
    pub fn new(database: DatabaseWorker) -> Self {
        Self { database }
    }
}
fn error(e: DatabaseError) -> String {
    match e {
        DatabaseError::Operation(e) => e.to_string(),
        e => e.to_string(),
    }
}
fn field<'a>(v: &'a Value, k: &str) -> Result<&'a str, OperationError> {
    v[k].as_str()
        .ok_or_else(|| std::io::Error::other("Invalid security workbench record").into())
}
fn parse(s: String) -> Result<Value, OperationError> {
    serde_json::from_str(&s)
        .map_err(|_| std::io::Error::other("Invalid persisted security workbench JSON").into())
}
fn wire(v: &Value) -> String {
    crate::contracts::ecmascript_json::JsonDocument::parse(&v.to_string())
        .expect("JSON workbench data")
        .stringify()
}
fn rows(db: &Connection, sql: &str, owner: Option<&str>) -> Result<Vec<Value>, OperationError> {
    let mut statement = db.prepare(sql)?;
    let mut reader = if let Some(owner) = owner {
        statement.query([owner])?
    } else {
        statement.query([])?
    };
    let mut values = vec![];
    while let Some(row) = reader.next()? {
        values.push(parse(row.get(0)?)?);
    }
    Ok(values)
}
impl WorkbenchStore for SqliteWorkbenchStore {
    fn load(&self) -> BoxFuture<'static, Result<Vec<Value>, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(|db| {
                rows(
                    db,
                    "SELECT data FROM security_check_runs ORDER BY started_at DESC LIMIT 50",
                    None,
                )
            })
            .await
            .map_err(error)
        })
    }
    fn history(&self, owner: String) -> BoxFuture<'static, Result<WorkbenchHistory, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|Ok(WorkbenchHistory{runs:rows(db,"SELECT data FROM security_check_runs WHERE operator_id = ? ORDER BY started_at DESC LIMIT 50",Some(&owner))?,findings:rows(db,"SELECT data FROM security_findings WHERE operator_id = ? ORDER BY updated_at DESC LIMIT 256",Some(&owner))?})).await.map_err(error)
        })
    }
    fn run(&self, id: String, owner: String) -> BoxFuture<'static, Result<Option<Value>, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move |db| {
                let mut statement = db.prepare(
                    "SELECT data FROM security_check_runs WHERE id = ? AND operator_id = ?",
                )?;
                let mut rows = statement.query([id, owner])?;
                rows.next()?.map(|row| parse(row.get(0)?)).transpose()
            })
            .await
            .map_err(error)
        })
    }
    fn finding(
        &self,
        id: String,
        owner: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move |db| {
                let mut statement = db.prepare(
                    "SELECT data FROM security_findings WHERE id = ? AND operator_id = ?",
                )?;
                let mut rows = statement.query([id, owner])?;
                rows.next()?.map(|row| parse(row.get(0)?)).transpose()
            })
            .await
            .map_err(error)
        })
    }
    fn save_run(&self, run: Value) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|{db.execute("INSERT INTO security_check_runs (id, operator_id, scope_id, started_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",params![field(&run,"id")?,field(&run,"operatorId")?,field(&run,"scopeId")?,field(&run,"startedAt")?,wire(&run)])?;Ok(())}).await.map_err(error)
        })
    }
    fn save_finding(
        &self,
        finding: Value,
        owner: String,
    ) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|{db.execute("INSERT INTO security_findings (id, operator_id, scope_id, updated_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data",params![field(&finding,"id")?,owner,field(&finding,"scopeId")?,field(&finding,"lastSeen")?,wire(&finding)])?;Ok(())}).await.map_err(error)
        })
    }
    fn save_artifact(&self, artifact: RawArtifact) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|{db.execute("INSERT INTO security_artifacts (id, run_id, operator_id, sha256, content_type, raw) VALUES (?, ?, ?, ?, ?, ?)",params![artifact.id,artifact.run,artifact.owner,artifact.sha256,artifact.content_type,artifact.raw])?;Ok(())}).await.map_err(error)
        })
    }
    fn delete_run(&self, id: String, owner: String) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move |db| {
                db.execute(
                    "DELETE FROM security_artifacts WHERE run_id = ? AND operator_id = ?",
                    params![id, owner],
                )?;
                db.execute(
                    "DELETE FROM security_check_runs WHERE id = ? AND operator_id = ?",
                    params![id, owner],
                )?;
                Ok(())
            })
            .await
            .map_err(error)
        })
    }
}
