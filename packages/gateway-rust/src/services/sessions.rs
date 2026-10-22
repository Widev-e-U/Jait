//! Session persistence. Call on the database worker; HTTP adapters authorize callers.
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json, value::RawValue};
// Preserve JSON.parse/Object.assign insertion order, including raw UTF-16
// strings; numeric property names are serialized first in ECMAScript order.
#[derive(Default)]
struct RawObject(Vec<(String, Box<RawValue>)>);
impl RawObject {
    fn new() -> Self {
        Self::default()
    }
    fn insert(&mut self, key: String, value: Box<RawValue>) {
        if let Some(entry) = self.0.iter_mut().find(|(k, _)| *k == key) {
            entry.1 = value;
        } else {
            self.0.push((key, value));
        }
    }
    fn remove(&mut self, key: &str) -> Option<Box<RawValue>> {
        self.0
            .iter()
            .position(|(k, _)| k == key)
            .map(|i| self.0.remove(i).1)
    }
}
impl FromIterator<(String, Box<RawValue>)> for RawObject {
    fn from_iter<T: IntoIterator<Item = (String, Box<RawValue>)>>(iter: T) -> Self {
        let mut object = Self::new();
        for (key, value) in iter {
            object.insert(key, value);
        }
        object
    }
}
impl Serialize for RawObject {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut fields = self.0.iter().collect::<Vec<_>>();
        fields.sort_by_key(|(key, _)| {
            key.parse::<u32>()
                .ok()
                .filter(|v| *v != u32::MAX && v.to_string() == *key)
                .map(|v| (0, v))
                .unwrap_or((1, 0))
        });
        let mut map = serializer.serialize_map(Some(fields.len()))?;
        for (key, value) in fields {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}
impl<'de> Deserialize<'de> for RawObject {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ObjectVisitor;
        impl<'de> serde::de::Visitor<'de> for ObjectVisitor {
            type Value = RawObject;
            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a JSON object")
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> Result<Self::Value, A::Error> {
                let mut object = RawObject::new();
                while let Some((key, value)) = map.next_entry::<String, Box<RawValue>>()? {
                    object.insert(key, value);
                }
                Ok(object)
            }
        }
        deserializer.deserialize_map(ObjectVisitor)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub user_id: Option<String>,
    pub project_id: Option<String>,
    pub name: Option<String>,
    pub project_path: Option<String>,
    pub created_at: String,
    pub last_active_at: String,
    pub viewed_at: Option<String>,
    pub status: Option<String>,
    pub metadata: Option<String>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CreateSession {
    pub user_id: Option<String>,
    pub project_id: Option<String>,
    pub name: Option<String>,
    pub project_path: Option<String>,
    pub metadata: Option<Map<String, Value>>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LiveSnapshot {
    pub persona: Option<String>,
    pub content: String,
    pub tool_calls: Option<String>,
    pub segments: Option<String>,
    pub thinking: Option<String>,
}
#[derive(Default)]
pub struct SessionFilter<'a> {
    pub status: Option<&'a str>,
    pub user_id: Option<&'a str>,
    pub project_id: Option<&'a str>,
    pub personal_only: bool,
    pub limit: Option<f64>,
}
pub(crate) const COLUMNS: &str =
    "id,user_id,project_id,name,project_path,created_at,last_active_at,viewed_at,status,metadata";
pub(crate) fn record(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRecord> {
    Ok(SessionRecord {
        id: row.get(0)?,
        user_id: row.get(1)?,
        project_id: row.get(2)?,
        name: row.get(3)?,
        project_path: row.get(4)?,
        created_at: row.get(5)?,
        last_active_at: row.get(6)?,
        viewed_at: row.get(7)?,
        status: row.get(8)?,
        metadata: row.get(9)?,
    })
}
fn nonempty(value: Option<&str>) -> Option<&str> {
    value.filter(|v| !v.is_empty())
}
pub struct SessionService<'a> {
    db: &'a Connection,
    time: Option<&'a str>,
}
impl<'a> SessionService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db, time: None }
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self {
            db,
            time: Some(now),
        }
    }
    fn now(&self) -> rusqlite::Result<String> {
        self.time.map(|v| Ok(v.to_owned())).unwrap_or_else(|| {
            self.db
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })
        })
    }
    fn millis(&self, value: &str) -> rusqlite::Result<Option<i64>> {
        Ok(crate::services::subscription_usage_fetchers::js_date_parse(
            value,
        ))
    }
    fn iso(&self, millis: i64) -> rusqlite::Result<String> {
        use chrono::Datelike;
        let date =
            chrono::DateTime::from_timestamp_millis(millis).ok_or(rusqlite::Error::InvalidQuery)?;
        let year = date.year();
        let year = if (0..=9999).contains(&year) {
            format!("{year:04}")
        } else {
            format!("{year:+07}")
        };
        Ok(format!("{year}{}", date.format("-%m-%dT%H:%M:%S%.3fZ")))
    }
    pub fn create(&self, data: CreateSession) -> rusqlite::Result<SessionRecord> {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.now()?;
        let metadata = data.metadata.map(|v| Value::Object(v).to_string());
        self.db.execute("INSERT INTO sessions(id,user_id,project_id,name,project_path,created_at,last_active_at,viewed_at,status,metadata) VALUES(?,?,?,?,?,?,?,?,'active',?)",
            params![id,data.user_id,data.project_id,data.name.unwrap_or_else(||"New Chat".into()),data.project_path,now,now,now,metadata])?;
        Ok(self.get(&id, None)?.expect("inserted session"))
    }
    pub fn get(&self, id: &str, user: Option<&str>) -> rusqlite::Result<Option<SessionRecord>> {
        self.db
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM sessions WHERE id=?1 AND (?2 IS NULL OR user_id=?2)"
                ),
                params![id, nonempty(user)],
                record,
            )
            .optional()
    }
    pub fn count(&self, status: Option<&str>) -> rusqlite::Result<u64> {
        self.db.query_row(
            "SELECT count(*) FROM sessions WHERE ?1 IS NULL OR status=?1",
            [nonempty(status)],
            |r| r.get::<_, i64>(0).map(|n| n as u64),
        )
    }
    pub fn list(&self, filter: SessionFilter<'_>) -> rusqlite::Result<Vec<SessionRecord>> {
        let limit = filter
            .limit
            .filter(|v| v.is_finite() && *v >= 1.0)
            .map(|v| v.floor() as i64)
            .unwrap_or(-1);
        let mut statement = self.db.prepare(&format!("SELECT {COLUMNS} FROM sessions WHERE (?1 IS NULL OR status=?1) AND (?2 IS NULL OR user_id=?2) AND (?3 IS NULL OR project_id=?3) AND (?4=0 OR project_id IS NULL) ORDER BY last_active_at DESC LIMIT ?5"))?;
        statement
            .query_map(
                params![
                    nonempty(filter.status),
                    nonempty(filter.user_id),
                    filter.project_id,
                    filter.personal_only,
                    limit
                ],
                record,
            )?
            .collect()
    }
    pub fn last_active(&self, user: Option<&str>) -> rusqlite::Result<Option<SessionRecord>> {
        Ok(self
            .list(SessionFilter {
                status: Some("active"),
                user_id: user,
                limit: Some(1.0),
                ..Default::default()
            })?
            .into_iter()
            .next())
    }
    pub fn touch(&self, id: &str) -> rusqlite::Result<()> {
        let previous = self.get(id, None)?;
        let now = self.millis(&self.now()?)?.expect("valid clock");
        let parsed = previous
            .as_ref()
            .map(|v| self.millis(&v.last_active_at))
            .transpose()?;
        if parsed == Some(None) {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let next = match parsed.flatten() {
            Some(last) if last >= now => last + 1,
            _ => now,
        };
        self.db.execute(
            "UPDATE sessions SET last_active_at=?1 WHERE id=?2",
            params![self.iso(next)?, id],
        )?;
        Ok(())
    }
    pub fn mark_viewed(
        &self,
        id: &str,
        user: Option<&str>,
        observed: Option<&str>,
    ) -> rusqlite::Result<()> {
        let Some(existing) = self.get(id, user)? else {
            return Ok(());
        };
        let Some(last) = self.millis(&existing.last_active_at)? else {
            return Err(rusqlite::Error::InvalidQuery);
        };
        let Some(observed) = observed
            .map(|v| self.millis(v))
            .transpose()?
            .unwrap_or(Some(last))
        else {
            return Ok(());
        };
        let next = last.min(observed);
        let previous = existing
            .viewed_at
            .as_deref()
            .map(|v| self.millis(v))
            .transpose()?
            .flatten();
        if previous.is_some_and(|v| v >= next) {
            return Ok(());
        }
        self.db.execute(
            "UPDATE sessions SET viewed_at=?1 WHERE id=?2 AND (?3 IS NULL OR user_id=?3)",
            params![self.iso(next)?, id, nonempty(user)],
        )?;
        Ok(())
    }
    pub fn set_status(&self, id: &str, status: &str, user: Option<&str>) -> rusqlite::Result<()> {
        self.db.execute(
            "UPDATE sessions SET status=?1 WHERE id=?2 AND (?3 IS NULL OR user_id=?3)",
            params![status, id, nonempty(user)],
        )?;
        Ok(())
    }
    pub fn project_status(
        &self,
        project: &str,
        operation: &str,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        let (next, condition) = match operation {
            "archive" => ("archived", "status='active'"),
            "restore" => ("active", "status='archived'"),
            "delete" => ("deleted", "status!='deleted'"),
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        self.db.execute(&format!("UPDATE sessions SET status=?1 WHERE project_id=?2 AND (?3 IS NULL OR user_id=?3) AND {condition}"),params![next,project,nonempty(user)])?;
        Ok(())
    }
    /// JSON object keys model omitted vs null patch fields without conflating them.
    pub fn update(
        &self,
        id: &str,
        data: &Map<String, Value>,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        let mut assignments = vec![];
        let mut values: Vec<rusqlite::types::Value> = vec![];
        for (key, column) in [
            ("name", "name"),
            ("metadata", "metadata"),
            ("projectPath", "project_path"),
            ("projectId", "project_id"),
        ] {
            if let Some(value) = data.get(key) {
                assignments.push(format!("{column}=?"));
                values.push(if key == "metadata" {
                    value.to_string().into()
                } else {
                    match value {
                        Value::Null => rusqlite::types::Value::Null,
                        Value::String(v) => v.clone().into(),
                        _ => return Err(rusqlite::Error::InvalidQuery),
                    }
                });
            }
        }
        if assignments.is_empty() {
            return Ok(());
        }
        values.push(id.to_string().into());
        values.push(
            nonempty(user)
                .map(|v| v.to_string().into())
                .unwrap_or(rusqlite::types::Value::Null),
        );
        let n = values.len();
        self.db.execute(
            &format!(
                "UPDATE sessions SET {} WHERE id=?{} AND (?{n} IS NULL OR user_id=?{n})",
                assignments.join(","),
                n - 1
            ),
            params_from_iter(values),
        )?;
        Ok(())
    }
    pub fn move_to_project(
        &self,
        id: &str,
        project: Option<&str>,
        path: Option<&str>,
        user: Option<&str>,
    ) -> rusqlite::Result<Option<SessionRecord>> {
        self.update(
            id,
            json!({"projectId":project,"projectPath":path})
                .as_object()
                .expect("object"),
            user,
        )?;
        self.get(id, user)
    }
    fn metadata(&self, id: &str, user: Option<&str>) -> rusqlite::Result<Option<Box<RawValue>>> {
        let Some(session) = self.get(id, user)? else {
            return Ok(None);
        };
        Ok(Some(
            session
                .metadata
                .as_deref()
                .and_then(|v| serde_json::from_str(v).ok())
                .unwrap_or_else(|| raw_json("{}")),
        ))
    }
    fn write_metadata(
        &self,
        id: &str,
        metadata: &RawValue,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.db.execute(
            "UPDATE sessions SET metadata=?1 WHERE id=?2 AND (?3 IS NULL OR user_id=?3)",
            params![metadata.get(), id, nonempty(user)],
        )?;
        Ok(())
    }
    pub fn update_chat_selection(
        &self,
        id: &str,
        selection: &Map<String, Value>,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        let Some(mut metadata) = self.metadata(id, user)? else {
            return Ok(());
        };
        let mut chat = raw_chat(&metadata)?;
        for key in ["provider", "model", "reasoningEffort", "nodeId"] {
            if let Some(value) = selection.get(key) {
                chat.insert(key.into(), raw_json(&value.to_string()));
            }
        }
        raw_property(
            &mut metadata,
            "chat",
            raw_json(&serde_json::to_string(&chat).expect("JSON object")),
        )?;
        self.write_metadata(id, &metadata, user)
    }
    pub fn update_chat_error(
        &self,
        id: &str,
        error: Option<&str>,
        user: Option<&str>,
    ) -> rusqlite::Result<()> {
        let Some(mut metadata) = self.metadata(id, user)? else {
            return Ok(());
        };
        let mut chat = raw_chat(&metadata)?;
        if let Some(error) = error.filter(|v| !v.is_empty()) {
            // JavaScript slices UTF-16 code units, including a possible lone surrogate.
            let units = error.encode_utf16().take(500).collect::<Vec<_>>();
            let mut encoded = String::from("\"");
            for ch in char::decode_utf16(units) {
                match ch {
                    Ok(ch) => {
                        let quoted = serde_json::to_string(&ch.to_string()).expect("string");
                        encoded.push_str(&quoted[1..quoted.len() - 1]);
                    }
                    Err(e) => encoded.push_str(&format!("\\u{:04x}", e.unpaired_surrogate())),
                }
            }
            encoded.push('"');
            chat.insert("lastError".into(), raw_json(&encoded));
            chat.insert(
                "lastErrorAt".into(),
                raw_json(&serde_json::to_string(&self.now()?).expect("time")),
            );
        } else {
            chat.remove("lastError");
            chat.remove("lastErrorAt");
        }
        raw_property(
            &mut metadata,
            "chat",
            raw_json(&serde_json::to_string(&chat).expect("JSON object")),
        )?;
        self.write_metadata(id, &metadata, user)
    }
    pub fn fork(
        &self,
        source_id: &str,
        user: &str,
        live: Option<&LiveSnapshot>,
    ) -> rusqlite::Result<Option<SessionRecord>> {
        let Some(source) = self.get(source_id, Some(user))? else {
            return Ok(None);
        };
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = self.now()?;
        let mut metadata = self
            .metadata(source_id, Some(user))?
            .expect("existing session");
        raw_property(
            &mut metadata,
            "branch",
            raw_json(
                &json!({"kind":"question","parentSessionId":source.id,"forkedAt":now}).to_string(),
            ),
        )?;
        // Capture before opening the write transaction, matching the immutable reference snapshot.
        let mut statement=self.db.prepare("SELECT role,content,tool_calls,segments,context_flow,thinking,persona,created_at FROM messages WHERE session_id=? ORDER BY created_at,id")?;
        let mut rows = statement
            .query_map([source_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, Option<String>>(6)?,
                    r.get::<_, String>(7)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if live.is_some()
            && let Some(index) = rows.iter().rposition(|r| r.0 != "system")
            && rows[index].0 == "assistant"
        {
            rows.remove(index);
        }
        let tx = self.db.unchecked_transaction()?;
        tx.execute("INSERT INTO sessions(id,user_id,project_id,name,project_path,created_at,last_active_at,viewed_at,status,metadata) VALUES(?,?,?,?,?,?,?,?,'active',?)",
            params![id,user,source.project_id,format!("Question · {}",{let s=crate::text::js_trim(source.name.as_deref().unwrap_or(""));if s.is_empty() {"Chat"} else {s}}),source.project_path,now,now,now,metadata.get()])?;
        for row in rows {
            let message_id = crate::db::identifiers::uuidv7().to_string();
            tx.execute("INSERT INTO messages(id,session_id,role,content,tool_calls,segments,context_flow,thinking,persona,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                params![message_id,id,row.0,row.1,row.2,row.3,row.4,row.5,row.6,row.7])?;
            if let Some(context) = row.4.filter(|v| !v.is_empty()) {
                tx.execute("INSERT INTO message_context_metadata(message_id,has_memory_provenance) VALUES(?,?)",params![message_id,context.contains("\"injectedIds\":[") && !context.contains("\"injectedIds\":[]")])?;
            }
        }
        if let Some(live) = live {
            tx.execute("INSERT INTO messages(id,session_id,role,content,created_at) VALUES(?,?,'system',?,?)",
                params![crate::db::identifiers::uuidv7().to_string(),id,"Forked while the parent response was still running. The following assistant progress is an incomplete snapshot.",now])?;
            if !live.content.is_empty()
                || live.thinking.as_ref().is_some_and(|v| !v.is_empty())
                || live.tool_calls.as_ref().is_some_and(|v| !v.is_empty())
                || live.segments.as_ref().is_some_and(|v| !v.is_empty())
            {
                let next = self.iso(self.millis(&now)?.expect("valid clock") + 1)?;
                tx.execute("INSERT INTO messages(id,session_id,role,content,tool_calls,segments,thinking,persona,created_at) VALUES(?,?,'assistant',?,?,?,?,?,?)",
                    params![crate::db::identifiers::uuidv7().to_string(),id,live.content,live.tool_calls,live.segments,live.thinking,live.persona,next])?;
            }
        }
        tx.commit()?;
        self.get(&id, Some(user))
    }
}
fn raw_json(text: &str) -> Box<RawValue> {
    RawValue::from_string(text.into()).expect("valid JSON text")
}
fn raw_property(
    value: &mut Box<RawValue>,
    key: &str,
    field: Box<RawValue>,
) -> rusqlite::Result<()> {
    match value.get().as_bytes().first() {
        Some(b'{') => {
            let mut object: RawObject =
                serde_json::from_str(value.get()).map_err(|_| rusqlite::Error::InvalidQuery)?;
            object.insert(key.into(), field);
            *value = raw_json(&serde_json::to_string(&object).expect("object"));
        }
        Some(b'[') => {} // JSON.stringify omits named properties of arrays.
        _ => return Err(rusqlite::Error::InvalidQuery),
    }
    Ok(())
}
fn raw_chat(metadata: &RawValue) -> rusqlite::Result<RawObject> {
    if !metadata.get().starts_with('{') {
        return Ok(RawObject::new());
    }
    let mut root: RawObject =
        serde_json::from_str(metadata.get()).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let Some(chat) = root.remove("chat") else {
        return Ok(RawObject::new());
    };
    match chat.get().as_bytes().first() {
        Some(b'{') => serde_json::from_str(chat.get()).map_err(|_| rusqlite::Error::InvalidQuery),
        Some(b'[') => {
            let values: Vec<Box<RawValue>> =
                serde_json::from_str(chat.get()).map_err(|_| rusqlite::Error::InvalidQuery)?;
            Ok(values
                .into_iter()
                .enumerate()
                .map(|(i, v)| (i.to_string(), v))
                .collect())
        }
        Some(b'"') => {
            let value: String =
                serde_json::from_str(chat.get()).map_err(|_| rusqlite::Error::InvalidQuery)?;
            // Object spread enumerates each UTF-16 code unit.
            Ok(value
                .encode_utf16()
                .enumerate()
                .map(|(i, u)| (i.to_string(), raw_json(&format!("\"\\u{u:04x}\""))))
                .collect())
        }
        _ => Ok(RawObject::new()),
    }
}
