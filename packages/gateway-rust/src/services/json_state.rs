//! SQLite UI state. Ownership is enforced by the calling API, as in the reference.
//! Execute on the bounded database worker. Batch writes deliberately retain the
//! reference's per-entry persistence and partial-failure behavior.
use super::storage::{Storage, json_text};
use rusqlite::{Connection, OptionalExtension, params, params_from_iter, types::Value as SqlValue};
use serde_json::{Map, Value, json};

#[derive(Clone, Copy)]
enum Scope {
    Session,
    Project,
}
impl Scope {
    fn table(self) -> &'static str {
        match self {
            Self::Session => "session_state",
            Self::Project => "project_state",
        }
    }
    fn column(self) -> &'static str {
        match self {
            Self::Session => "session_id",
            Self::Project => "project_id",
        }
    }
}
struct StateStore<'a> {
    storage: Storage<'a>,
    scope: Scope,
}
#[derive(Clone, Default)]
struct StateRows {
    own: Map<String, Value>,
    inherited: Map<String, Value>,
}
impl StateRows {
    fn insert(&mut self, key: String, value: Value) {
        if key == "__proto__" && !self.own.contains_key(&key) && !self.inherited.contains_key(&key)
        {
            match value {
                Value::Object(map) => self.inherited = map,
                Value::Null | Value::Array(_) => self.inherited.clear(),
                _ => {}
            }
        } else {
            self.own.insert(key, value);
        }
    }
    fn get(&self, key: &str) -> Option<&Value> {
        self.own.get(key).or_else(|| self.inherited.get(key))
    }
    fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }
}
fn parse(raw: Option<String>) -> Value {
    match raw {
        Some(s) if !s.is_empty() => serde_json::from_str(&s).unwrap_or(Value::String(s)),
        _ => Value::Null,
    }
}
fn index(key: &str) -> Option<u32> {
    key.parse::<u32>()
        .ok()
        .filter(|v| *v != u32::MAX && v.to_string() == key)
}
fn ordered(entries: &Map<String, Value>) -> Vec<(&String, &Value)> {
    let mut entries: Vec<_> = entries.iter().collect();
    entries.sort_by_key(|(key, _)| index(key).map(|v| (0, v)).unwrap_or((1, 0)));
    entries
}
impl StateStore<'_> {
    fn rows(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<StateRows> {
        let mut sql = format!(
            "SELECT key,value FROM {} WHERE {}=?",
            self.scope.table(),
            self.scope.column()
        );
        let mut values = vec![SqlValue::Text(id.into())];
        if let Some(keys) = keys.filter(|k| !k.is_empty()) {
            sql.push_str(&format!(
                " AND key IN ({})",
                vec!["?"; keys.len()].join(",")
            ));
            values.extend(keys.iter().cloned().map(SqlValue::Text));
        }
        let mut query = self.storage.db.prepare(&sql)?;
        let rows = query.query_map(params_from_iter(values), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
        })?;
        let mut result = StateRows::default();
        for row in rows {
            let (key, raw) = row?;
            // Model ordinary-object own/prototype data without constructing
            // executable prototypes. Legacy project migration consults both.
            result.insert(key, parse(raw));
        }
        Ok(result)
    }
    fn delete(&self, id: &str, key: &str) -> rusqlite::Result<()> {
        self.storage.db.execute(
            &format!(
                "DELETE FROM {} WHERE {}=? AND key=?",
                self.scope.table(),
                self.scope.column()
            ),
            params![id, key],
        )?;
        Ok(())
    }
    fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        let now = self.storage.now()?;
        for (key, value) in ordered(entries) {
            if value.is_null() {
                self.delete(id, key)?;
                continue;
            }
            let exists = self
                .storage
                .db
                .query_row(
                    &format!(
                        "SELECT 1 FROM {} WHERE {}=? AND key=? LIMIT 1",
                        self.scope.table(),
                        self.scope.column()
                    ),
                    params![id, key],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            let raw = json_text(value);
            if exists {
                self.storage.db.execute(
                    &format!(
                        "UPDATE {} SET value=?,updated_at=? WHERE {}=? AND key=?",
                        self.scope.table(),
                        self.scope.column()
                    ),
                    params![raw, now, id, key],
                )?;
            } else {
                self.storage.db.execute(
                    &format!(
                        "INSERT INTO {}({},key,value,updated_at) VALUES(?,?,?,?)",
                        self.scope.table(),
                        self.scope.column()
                    ),
                    params![id, key, raw, now],
                )?;
            }
        }
        Ok(())
    }
}
pub struct SessionStateService<'a>(StateStore<'a>);
impl<'a> SessionStateService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(StateStore {
            storage: Storage { db, time: None },
            scope: Scope::Session,
        })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(StateStore {
            storage: Storage {
                db,
                time: Some(now),
            },
            scope: Scope::Session,
        })
    }
    pub fn get(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<Map<String, Value>> {
        Ok(self.0.rows(id, keys)?.own)
    }
    pub fn get_by_key(&self, key: &str) -> rusqlite::Result<Vec<Value>> {
        self.0
            .storage
            .db
            .prepare("SELECT session_id,value FROM session_state WHERE key=?")?
            .query_map([key], |r| {
                Ok(json!({"sessionId":r.get::<_,String>(0)?,"value":parse(r.get(1)?)}))
            })?
            .collect()
    }
    pub fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        self.0.set(id, entries)
    }
    pub fn delete_all(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .storage
            .db
            .execute("DELETE FROM session_state WHERE session_id=?", [id])?;
        Ok(())
    }
}
pub struct ProjectStateService<'a>(StateStore<'a>);
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
impl<'a> ProjectStateService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(StateStore {
            storage: Storage { db, time: None },
            scope: Scope::Project,
        })
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(StateStore {
            storage: Storage {
                db,
                time: Some(now),
            },
            scope: Scope::Project,
        })
    }
    pub fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        self.0.set(id, entries)
    }
    pub fn get(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<Map<String, Value>> {
        let mut result = self.0.rows(id, keys)?;
        if !result.get("project.ui").is_some_and(truthy)
            && keys.is_none_or(|k| k.iter().any(|k| k == "project.ui"))
        {
            let all = if keys.is_some_and(|k| !k.is_empty()) {
                self.0.rows(id, None)?
            } else {
                result.clone()
            };
            let legacy = [
                "project.panel",
                "project.tabs",
                "project.layout",
                "project.layout.mobile",
                "terminal.panel",
                "dev-preview.panel",
            ];
            if legacy.iter().any(|k| all.contains_key(k)) {
                let value = |k: &str| all.get(k).cloned().unwrap_or(Value::Null);
                let mut layout = value("project.layout");
                if layout.is_null() {
                    layout = value("project.layout.mobile");
                }
                let ui = json!({"panel":value("project.panel"),"tabs":value("project.tabs"),"layout":layout,"terminal":value("terminal.panel"),"preview":value("dev-preview.panel")});
                self.set(id, &Map::from_iter([("project.ui".into(), ui.clone())]))?;
                for key in legacy {
                    if all.contains_key(key) {
                        self.0.delete(id, key)?;
                    }
                }
                result.insert("project.ui".into(), ui);
            }
        }
        Ok(result.own)
    }
}
