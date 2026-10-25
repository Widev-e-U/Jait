//! Assessment persistence on the existing bounded database worker. SQL text is
//! fixed; ownership predicates and record values are bound separately.
use crate::db::worker::{DatabaseError, DatabaseWorker, OperationError};
use futures_util::future::BoxFuture;
use rusqlite::Connection;
use serde_json::Value;
#[derive(Default)]
pub struct StoredHistory {
    pub scopes: Vec<Value>,
    pub runs: Vec<Value>,
}
/// Preserve database provenance for HTTP's uncaught storage error envelope.
#[derive(Debug)]
pub struct HistoryFailure {
    pub message: String,
    pub sqlite_code: Option<i32>,
}
impl From<String> for HistoryFailure {
    fn from(message: String) -> Self {
        Self {
            message,
            sqlite_code: None,
        }
    }
}
fn history_failure(error: DatabaseError) -> HistoryFailure {
    let sqlite_code = match &error {
        DatabaseError::Operation(inner) => match inner.downcast_ref::<rusqlite::Error>() {
            Some(rusqlite::Error::SqliteFailure(code, _)) => Some(code.extended_code),
            _ => None,
        },
        _ => None,
    };
    HistoryFailure {
        message: message(error),
        sqlite_code,
    }
}
pub trait AssessmentStore: Send + Sync {
    fn load(&self) -> BoxFuture<'static, Result<StoredHistory, String>>;
    fn history(&self, operator: String) -> BoxFuture<'static, Result<StoredHistory, String>>;
    fn history_detailed(
        &self,
        operator: String,
    ) -> BoxFuture<'static, Result<StoredHistory, HistoryFailure>> {
        let result = self.history(operator);
        Box::pin(async move { result.await.map_err(HistoryFailure::from) })
    }

    fn scope(
        &self,
        id: String,
        operator: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>>;
    fn run(
        &self,
        id: String,
        operator: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>>;
    fn save_scope(&self, scope: Value) -> BoxFuture<'static, Result<(), String>>;
    fn save_run(&self, run: Value) -> BoxFuture<'static, Result<(), String>>;
}
#[derive(Clone)]
pub struct SqliteAssessmentStore {
    database: DatabaseWorker,
}
impl SqliteAssessmentStore {
    pub fn new(database: DatabaseWorker) -> Self {
        Self { database }
    }
}
fn message(error: DatabaseError) -> String {
    match error {
        DatabaseError::Operation(error) => error.to_string(),
        other => other.to_string(),
    }
}
fn parse(text: String) -> Result<Value, OperationError> {
    serde_json::from_str(&text)
        .map_err(|_| std::io::Error::other("Invalid persisted assessment JSON").into())
}
fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str, OperationError> {
    value[key]
        .as_str()
        .ok_or_else(|| std::io::Error::other("Invalid assessment record").into())
}
fn rows(db: &Connection, sql: &str, operator: Option<&str>) -> Result<Vec<Value>, OperationError> {
    let mut stmt = db.prepare(sql)?;
    let mut reader = if let Some(operator) = operator {
        stmt.query([operator])?
    } else {
        stmt.query([])?
    };
    let mut records = vec![];
    while let Some(row) = reader.next()? {
        records.push(parse(row.get(0)?)?);
    }
    Ok(records)
}
impl AssessmentStore for SqliteAssessmentStore {
    fn load(&self) -> BoxFuture<'static, Result<StoredHistory, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(|db|Ok(StoredHistory{
            scopes:rows(db,"SELECT data FROM security_scopes ORDER BY created_at DESC LIMIT 50",None)?,
            runs:rows(db,"SELECT data FROM security_assessment_runs ORDER BY started_at DESC LIMIT 50",None)?,
        })).await.map_err(message)
        })
    }
    fn history(&self, operator: String) -> BoxFuture<'static, Result<StoredHistory, String>> {
        let result = self.history_detailed(operator);
        Box::pin(async move { result.await.map_err(|e| e.message) })
    }
    fn history_detailed(
        &self,
        operator: String,
    ) -> BoxFuture<'static, Result<StoredHistory, HistoryFailure>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|Ok(StoredHistory{
            scopes:rows(db,"SELECT data FROM security_scopes WHERE operator_id = ? ORDER BY created_at DESC LIMIT 50",Some(&operator))?,
            runs:rows(db,"SELECT data FROM security_assessment_runs WHERE operator_id = ? ORDER BY started_at DESC LIMIT 50",Some(&operator))?,
        })).await.map_err(history_failure)
        })
    }
    fn scope(
        &self,
        id: String,
        operator: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move |db| {
                let mut stmt = db
                    .prepare("SELECT data FROM security_scopes WHERE id = ? AND operator_id = ?")?;
                let mut reader = stmt.query([id, operator])?;
                reader.next()?.map(|row| parse(row.get(0)?)).transpose()
            })
            .await
            .map_err(message)
        })
    }
    fn run(
        &self,
        id: String,
        operator: String,
    ) -> BoxFuture<'static, Result<Option<Value>, String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move |db| {
                let mut stmt = db.prepare(
                    "SELECT data FROM security_assessment_runs WHERE id = ? AND operator_id = ?",
                )?;
                let mut reader = stmt.query([id, operator])?;
                reader.next()?.map(|row| parse(row.get(0)?)).transpose()
            })
            .await
            .map_err(message)
        })
    }
    fn save_scope(&self, scope: Value) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|{
            db.execute("INSERT INTO security_scopes (id, operator_id, created_at, data) VALUES (?, ?, ?, ?)",rusqlite::params![field(&scope,"id")?,field(&scope,"operatorId")?,field(&scope,"createdAt")?,scope.to_string()])?;Ok(())
        }).await.map_err(message)
        })
    }
    fn save_run(&self, run: Value) -> BoxFuture<'static, Result<(), String>> {
        let db = self.database.clone();
        Box::pin(async move {
            db.run(move|db|{
            db.execute("INSERT INTO security_assessment_runs (id, operator_id, started_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",rusqlite::params![field(&run,"id")?,field(&run,"operatorId")?,field(&run,"startedAt")?,run.to_string()])?;Ok(())
        }).await.map_err(message)
        })
    }
}
