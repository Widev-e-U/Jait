//! Owner-wide durable emergency stop. Call from the authorized database worker.
//! The halt is committed before asynchronous teardown; only explicit resume clears it.
use crate::text::js_trim;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::Value;
use std::{future::Future, pin::Pin};

pub const AGENT_HALTED_CODE: &str = "agent_halted";
pub const DEFAULT_HALTED_MESSAGE: &str = "Autonomous agents are halted. Resume agents to continue.";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentControlState {
    pub halted: bool,
    pub reason: Option<String>,
    pub halted_at: Option<String>,
    pub updated_at: Option<String>,
}
pub const RUNNING_STATE: AgentControlState = AgentControlState {
    halted: false,
    reason: None,
    halted_at: None,
    updated_at: None,
};
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AgentHaltedError {
    pub name: &'static str,
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}
impl AgentHaltedError {
    pub fn new(message: Option<&str>, action: Option<&str>) -> Self {
        Self {
            name: "AgentHaltedError",
            code: AGENT_HALTED_CODE,
            message: message.unwrap_or(DEFAULT_HALTED_MESSAGE).into(),
            action: action.map(String::from),
        }
    }
}
impl std::fmt::Display for AgentHaltedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for AgentHaltedError {}
pub fn is_agent_halted_error(value: &Value) -> bool {
    value.is_object() && value.get("code").and_then(Value::as_str) == Some(AGENT_HALTED_CODE)
}
#[derive(Debug)]
pub enum AgentControlError {
    InvalidUser(&'static str),
    Database(rusqlite::Error),
    Halted(AgentHaltedError),
    OnChange(String),
}
impl std::fmt::Display for AgentControlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidUser(message) => f.write_str(message),
            Self::OnChange(message) => f.write_str(message),
            Self::Database(error) => error.fmt(f),
            Self::Halted(error) => error.fmt(f),
        }
    }
}
impl std::error::Error for AgentControlError {}
impl From<rusqlite::Error> for AgentControlError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHaltedBody {
    pub code: &'static str,
    pub halted: bool,
    pub reason: Option<String>,
    pub halted_at: Option<String>,
    pub action: Option<String>,
    pub error: String,
}
fn halted_message(reason: Option<&str>) -> String {
    let detail = reason
        .filter(|v| !v.is_empty())
        .map(|v| format!(" ({v})"))
        .unwrap_or_default();
    format!("Autonomous agents are halted{detail}. Resume agents to continue.")
}
pub fn agent_halted_body(state: &AgentControlState, action: Option<&str>) -> AgentHaltedBody {
    AgentHaltedBody {
        code: AGENT_HALTED_CODE,
        halted: true,
        reason: state.reason.clone(),
        halted_at: state.halted_at.clone(),
        action: action.map(String::from),
        error: halted_message(state.reason.as_deref()),
    }
}
#[derive(Debug, Clone)]
pub enum AgentStopResult {
    Count(f64),
    Details { stopped: f64, errors: Vec<String> },
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HaltResult {
    #[serde(serialize_with = "serialize_number")]
    pub stopped: f64,
    pub stop_error: Option<String>,
    pub state: AgentControlState,
}
fn serialize_number<S: serde::Serializer>(value: &f64, serializer: S) -> Result<S::Ok, S::Error> {
    let text = if value.is_finite() {
        ryu_js::Buffer::new().format(*value).to_owned()
    } else {
        "null".into()
    };
    serde::Serialize::serialize(
        &serde_json::value::RawValue::from_string(text).unwrap(),
        serializer,
    )
}
pub type StopFuture<'a> = Pin<Box<dyn Future<Output = Result<AgentStopResult, String>> + 'a>>;
pub trait AgentControlHooks {
    fn stop_running<'a>(&'a mut self, _user_id: &'a str) -> StopFuture<'a> {
        Box::pin(async { Ok(AgentStopResult::Count(0.0)) })
    }
    fn on_change(&mut self, _user_id: &str, _state: &AgentControlState) -> Result<(), String> {
        Ok(())
    }
}
pub struct NoHooks;
impl AgentControlHooks for NoHooks {}
fn sqlite_text(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Option<String>> {
    match row.get_ref(index)? {
        rusqlite::types::ValueRef::Null => Ok(None),
        rusqlite::types::ValueRef::Text(bytes) => {
            Ok(Some(String::from_utf8_lossy(bytes).into_owned()))
        }
        _ => row.get(index),
    }
}
pub struct AgentControlService<'a> {
    connection: &'a Connection,
    now: &'a dyn Fn() -> String,
}
impl<'a> AgentControlService<'a> {
    pub fn new(connection: &'a Connection, now: &'a dyn Fn() -> String) -> Self {
        Self { connection, now }
    }
    fn read_row(&self, user_id: &str) -> rusqlite::Result<Option<AgentControlState>> {
        self.connection
            .query_row(
                "SELECT halted,reason,halted_at,updated_at FROM agent_control WHERE user_id=?1",
                [user_id],
                |row| {
                    let halted: i64 = row.get(0)?;
                    // Drizzle's boolean mapper uses exact 1, not generic nonzero truthiness.
                    let halted = halted == 1;
                    Ok(AgentControlState {
                        halted,
                        reason: if halted { sqlite_text(row, 1)? } else { None },
                        halted_at: if halted { row.get(2)? } else { None },
                        updated_at: row.get(3)?,
                    })
                },
            )
            .optional()
    }
    pub fn get_state(&self, user_id: &str) -> rusqlite::Result<AgentControlState> {
        if user_id.is_empty() {
            return Ok(AgentControlState::default());
        }
        Ok(self.read_row(user_id)?.unwrap_or_default())
    }
    pub fn is_halted(&self, user_id: &str) -> rusqlite::Result<bool> {
        if user_id.is_empty() {
            return Ok(false);
        }
        Ok(self.read_row(user_id)?.is_some_and(|s| s.halted))
    }
    pub fn assert_can_run(
        &self,
        user_id: &str,
        action: Option<&str>,
    ) -> Result<(), AgentControlError> {
        if self.is_halted(user_id)? {
            let state = self.get_state(user_id)?;
            return Err(AgentControlError::Halted(AgentHaltedError::new(
                Some(&halted_message(state.reason.as_deref())),
                action,
            )));
        }
        Ok(())
    }
    pub async fn halt(
        &self,
        user_id: &str,
        reason: Option<&str>,
        hooks: &mut impl AgentControlHooks,
    ) -> Result<HaltResult, AgentControlError> {
        self.persist_halt(user_id, reason)?;
        let stop_result = hooks.stop_running(user_id).await;
        self.finish_halt(user_id, stop_result, hooks)
    }
    /// Commit before awaiting teardown. Async adapters must keep this ordering.
    pub fn persist_halt(
        &self,
        user_id: &str,
        reason: Option<&str>,
    ) -> Result<(), AgentControlError> {
        if user_id.is_empty() {
            return Err(AgentControlError::InvalidUser(
                "userId is required to halt agents",
            ));
        }
        let previous = self.get_state(user_id)?;
        let now = (self.now)();
        // Bun stores a sliced lone surrogate as its three WTF-8 bytes. Its text
        // reader (and SQLite-backed error messages) decodes each invalid byte.
        let reason = reason.map(js_trim).filter(|s| !s.is_empty()).map(|s| {
            let units: Vec<_> = s.encode_utf16().take(500).collect();
            let mut bytes = Vec::new();
            for ch in char::decode_utf16(units) {
                match ch {
                    Ok(ch) => bytes.extend_from_slice(ch.encode_utf8(&mut [0; 4]).as_bytes()),
                    Err(error) => {
                        let unit = error.unpaired_surrogate();
                        bytes.extend_from_slice(&[
                            0xe0 | (unit >> 12) as u8,
                            0x80 | ((unit >> 6) & 63) as u8,
                            0x80 | (unit & 63) as u8,
                        ]);
                    }
                }
            }
            bytes
        });
        self.connection.execute(
            "INSERT INTO agent_control(user_id,halted,reason,halted_at,updated_at) VALUES (?1,1,CAST(?2 AS TEXT),?3,?4) ON CONFLICT(user_id) DO UPDATE SET halted=1,reason=excluded.reason,halted_at=excluded.halted_at,updated_at=excluded.updated_at",
            params![user_id, reason, previous.halted_at.unwrap_or_else(|| now.clone()), now],
        )?;
        Ok(())
    }
    /// Re-read after teardown so a concurrent explicit resume remains observable.
    pub fn finish_halt(
        &self,
        user_id: &str,
        stop_result: Result<AgentStopResult, String>,
        hooks: &mut impl AgentControlHooks,
    ) -> Result<HaltResult, AgentControlError> {
        let (stopped, stop_error) = match stop_result {
            Ok(AgentStopResult::Count(count)) => (count, None),
            Ok(AgentStopResult::Details { stopped, errors }) => {
                (stopped, (!errors.is_empty()).then(|| errors.join("; ")))
            }
            Err(error) => (0.0, Some(error)),
        };
        // Re-read after await: a deliberate concurrent resume/halt is observable.
        let state = self.get_state(user_id)?;
        hooks
            .on_change(user_id, &state)
            .map_err(AgentControlError::OnChange)?;
        Ok(HaltResult {
            stopped,
            stop_error,
            state,
        })
    }
    pub fn resume(
        &self,
        user_id: &str,
        hooks: &mut impl AgentControlHooks,
    ) -> Result<AgentControlState, AgentControlError> {
        if user_id.is_empty() {
            return Err(AgentControlError::InvalidUser(
                "userId is required to resume agents",
            ));
        }
        self.connection.execute(
            "INSERT INTO agent_control(user_id,halted,reason,halted_at,updated_at) VALUES (?1,0,NULL,NULL,?2) ON CONFLICT(user_id) DO UPDATE SET halted=0,reason=NULL,halted_at=NULL,updated_at=excluded.updated_at",
            params![user_id, (self.now)()],
        )?;
        let state = self.get_state(user_id)?;
        hooks
            .on_change(user_id, &state)
            .map_err(AgentControlError::OnChange)?;
        Ok(state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE agent_control(user_id TEXT PRIMARY KEY,halted INTEGER NOT NULL DEFAULT 0,reason TEXT,halted_at TEXT,updated_at TEXT NOT NULL)").unwrap();
        db
    }
    #[tokio::test]
    async fn durable_stop_precedes_hook_failure_and_retains_first_timestamp() {
        struct Failure<'a> {
            db: &'a Connection,
            calls: usize,
        }
        impl AgentControlHooks for Failure<'_> {
            fn stop_running<'a>(&'a mut self, user: &'a str) -> StopFuture<'a> {
                Box::pin(async move {
                    assert_eq!(
                        self.db
                            .query_row(
                                "SELECT halted FROM agent_control WHERE user_id=?1",
                                [user],
                                |row| row.get::<_, i64>(0)
                            )
                            .unwrap(),
                        1
                    );
                    self.calls += 1;
                    Err("teardown failed".into())
                })
            }
        }
        let db = database();
        let time = RefCell::new("first".to_owned());
        let clock = || time.borrow().clone();
        let service = AgentControlService::new(&db, &clock);
        let mut hooks = Failure { db: &db, calls: 0 };
        let first = service
            .halt("owner", Some(" loop "), &mut hooks)
            .await
            .unwrap();
        assert_eq!(first.stop_error.as_deref(), Some("teardown failed"));
        assert!(first.state.halted);
        *time.borrow_mut() = "second".into();
        let second = service.halt("owner", None, &mut hooks).await.unwrap();
        assert_eq!(hooks.calls, 2);
        assert_eq!(second.state.halted_at.as_deref(), Some("first"));
        assert_eq!(second.state.updated_at.as_deref(), Some("second"));
        assert_eq!(second.state.reason, None);
        assert!(!service.is_halted("other").unwrap());
    }
    #[tokio::test]
    async fn explicit_resume_is_observable_during_teardown() {
        struct Resume<'a> {
            db: &'a Connection,
            changes: Vec<AgentControlState>,
        }
        impl AgentControlHooks for Resume<'_> {
            fn stop_running<'a>(&'a mut self, user: &'a str) -> StopFuture<'a> {
                Box::pin(async move {
                    tokio::task::yield_now().await;
                    AgentControlService::new(self.db, &|| "resumed".into())
                        .resume(user, &mut NoHooks)
                        .unwrap();
                    Ok(AgentStopResult::Details {
                        stopped: 2.0,
                        errors: vec!["one".into(), "two".into()],
                    })
                })
            }
            fn on_change(&mut self, _: &str, state: &AgentControlState) -> Result<(), String> {
                self.changes.push(state.clone());
                Ok(())
            }
        }
        let db = database();
        let mut hooks = Resume {
            db: &db,
            changes: vec![],
        };
        let result = AgentControlService::new(&db, &|| "halted".into())
            .halt("owner", None, &mut hooks)
            .await
            .unwrap();
        assert_eq!(result.stopped, 2.0);
        assert_eq!(result.stop_error.as_deref(), Some("one; two"));
        assert!(!result.state.halted);
        assert_eq!(result.state.updated_at.as_deref(), Some("resumed"));
        assert_eq!(hooks.changes, vec![result.state]);
    }
    #[tokio::test]
    async fn database_failure_never_calls_teardown() {
        struct Counter(usize);
        impl AgentControlHooks for Counter {
            fn stop_running<'a>(&'a mut self, _: &'a str) -> StopFuture<'a> {
                self.0 += 1;
                Box::pin(async { Ok(AgentStopResult::Count(0.0)) })
            }
        }
        let db = database();
        db.execute_batch("CREATE TRIGGER refuse_halt BEFORE INSERT ON agent_control BEGIN SELECT RAISE(FAIL,'no write'); END").unwrap();
        let mut hooks = Counter(0);
        let result = AgentControlService::new(&db, &|| "now".into())
            .halt("owner", None, &mut hooks)
            .await;
        assert!(matches!(result, Err(AgentControlError::Database(_))));
        assert_eq!(hooks.0, 0);
    }
    #[tokio::test]
    async fn aborted_teardown_future_leaves_durable_halt() {
        struct Pending;
        impl AgentControlHooks for Pending {
            fn stop_running<'a>(&'a mut self, _: &'a str) -> StopFuture<'a> {
                Box::pin(std::future::pending())
            }
        }
        let db = database();
        let now = || "now".into();
        let service = AgentControlService::new(&db, &now);
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(5),
                service.halt("u", None, &mut Pending)
            )
            .await
            .is_err()
        );
        assert!(service.is_halted("u").unwrap());
        assert!(matches!(
            service.assert_can_run("u", None),
            Err(AgentControlError::Halted(_))
        ));
    }
    #[tokio::test]
    async fn owned_file_reopen_preserves_halt_and_requires_explicit_resume() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/parallel-20261020/agent-control/persistence");
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(format!("{}.sqlite", uuid::Uuid::new_v4()));
        let clock = || "now".into();
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE TABLE agent_control(user_id TEXT PRIMARY KEY,halted INTEGER NOT NULL,reason TEXT,halted_at TEXT,updated_at TEXT NOT NULL)").unwrap();
            AgentControlService::new(&db, &clock)
                .halt("owner", Some("incident"), &mut NoHooks)
                .await
                .unwrap();
        }
        let db = Connection::open(&path).unwrap();
        let service = AgentControlService::new(&db, &clock);
        let error = service.assert_can_run("owner", Some("retry")).unwrap_err();
        assert!(matches!(
            error,
            AgentControlError::Halted(AgentHaltedError {
                action: Some(_),
                ..
            })
        ));
        assert!(service.get_state("owner").unwrap().halted);
        assert!(!service.resume("owner", &mut NoHooks).unwrap().halted);
        service.assert_can_run("owner", None).unwrap();
    }
}

#[cfg(test)]
mod text_tests {
    use super::*;
    #[tokio::test]
    async fn unicode_storage_and_error_action_are_exact() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE agent_control(user_id TEXT PRIMARY KEY,halted INTEGER NOT NULL,reason TEXT,halted_at TEXT,updated_at TEXT NOT NULL)").unwrap();
        let clock = || "now".into();
        let service = AgentControlService::new(&db, &clock);
        let reason = format!("{}😀tail", "a".repeat(499));
        let result = service
            .halt("u", Some(&reason), &mut NoHooks)
            .await
            .unwrap();
        assert_eq!(
            result.state.reason.as_deref(),
            Some(format!("{}���", "a".repeat(499)).as_str())
        );
        let Err(AgentControlError::Halted(error)) = service.assert_can_run("u", Some("send"))
        else {
            panic!("halt must deny work")
        };
        assert_eq!(error.action.as_deref(), Some("send"));
        assert_eq!(error.code, AGENT_HALTED_CODE);
        assert!(error.message.contains("���"));
        assert_eq!(
            db.query_row(
                "SELECT hex(substr(CAST(reason AS BLOB),500)) FROM agent_control",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "EDA0BD"
        );
    }
}
