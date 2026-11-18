//! Reminder storage on a caller-owned connection; invoke through a bounded DB
//! worker. Empty/omitted owner filters retain the source service's internal API;
//! authenticated adapters must supply their verified user ID.
use super::{
    storage::{Storage, json_text},
    users::Patch,
};
use crate::text::{js_trim, js_whitespace};
use rusqlite::{Connection, OptionalExtension, params, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashSet};
#[derive(Debug)]
pub enum ReminderError {
    Database(rusqlite::Error),
    Invalid(&'static str),
}
impl std::fmt::Display for ReminderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Database(e) => e.fmt(f),
            Self::Invalid(s) => f.write_str(s),
        }
    }
}
impl std::error::Error for ReminderError {}
impl From<rusqlite::Error> for ReminderError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Database(e)
    }
}
pub type Result<T> = std::result::Result<T, ReminderError>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderRow {
    pub id: String,
    pub user_id: Option<String>,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub content: String,
    pub source_type: String,
    pub source_id: Option<String>,
    pub source_surface: String,
    pub status: String,
    pub tags: String,
    pub usage_count: i64,
    pub last_retrieved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderParams {
    pub content: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub source_id: Option<String>,
    #[serde(default)]
    pub source_surface: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<Value>>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateReminderParams {
    pub content: Option<String>,
    pub project_id: Patch<Option<String>>,
    pub session_id: Patch<Option<String>>,
    pub status: Option<String>,
    pub tags: Patch<Option<Vec<Value>>>,
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListReminderOptions {
    pub user_id: Option<String>,
    pub status: Option<String>,
    pub project_id: Option<String>,
    pub session_id: Option<String>,
    pub limit: Option<f64>,
}
#[derive(Debug, Serialize)]
pub struct MemoryHygieneResult {
    pub archived: usize,
    pub flagged: usize,
}
#[derive(Debug, Serialize)]
pub struct OldChatMemoryScanResult {
    pub scanned: usize,
    pub created: usize,
}
const COLUMNS: &str = "id,user_id,project_id,session_id,content,source_type,source_id,source_surface,status,tags,usage_count,last_retrieved_at,created_at,updated_at";
fn record(r: &rusqlite::Row<'_>) -> rusqlite::Result<ReminderRow> {
    Ok(ReminderRow {
        id: r.get(0)?,
        user_id: r.get(1)?,
        project_id: r.get(2)?,
        session_id: r.get(3)?,
        content: r.get(4)?,
        source_type: r.get(5)?,
        source_id: r.get(6)?,
        source_surface: r.get(7)?,
        status: r.get(8)?,
        tags: r.get(9)?,
        usage_count: r.get(10)?,
        last_retrieved_at: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}
fn nonempty(s: Option<&str>) -> Option<&str> {
    s.filter(|s| !s.is_empty())
}
fn normalized_limit(limit: Option<f64>, fallback: i64) -> i64 {
    limit
        .filter(|v| v.is_finite() && *v >= 1.0)
        .map(|v| v.floor().min(500.0) as i64)
        .unwrap_or(fallback)
}
fn unique_ids(ids: &[String]) -> Vec<&str> {
    let mut seen = HashSet::new();
    ids.iter()
        .map(String::as_str)
        .filter(|s| !s.is_empty() && seen.insert(*s))
        .collect()
}
fn normalize_tags(tags: Option<Vec<Value>>) -> String {
    let mut seen = HashSet::new();
    let tags: Vec<_> = tags
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.as_str().map(|s| js_trim(s).to_lowercase()))
        .filter(|s| !s.is_empty() && seen.insert(s.clone()))
        .take(20)
        .collect();
    json_text(&json!(tags))
}
fn display_tags(tags: &str) -> Vec<String> {
    serde_json::from_str::<Value>(tags)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect()
}
fn compact(content: &str) -> String {
    content
        .split(js_whitespace)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
fn normalized_memory(content: &str) -> String {
    compact(&content.to_lowercase())
}
fn subject(content: &str) -> String {
    const STOP: &[&str] = &[
        "the", "and", "for", "with", "that", "this", "memory", "prefer", "always", "should", "use",
        "not", "don", "never",
    ];
    normalized_memory(content)
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .filter(|s| s.len() >= 3 && !STOP.contains(s))
        .take(5)
        .collect::<Vec<_>>()
        .join(" ")
}
fn candidate(content: &str) -> Option<String> {
    static MATCH: std::sync::LazyLock<regex::bytes::Regex> = std::sync::LazyLock::new(|| {
        regex::bytes::RegexBuilder::new(
            r"\b(remember|always|prefer|preference|use .+ by default|do not|don't|never)\b",
        )
        .case_insensitive(true)
        .unicode(false)
        .build()
        .unwrap()
    });
    let text = compact(content);
    let units: Vec<_> = text.encode_utf16().collect();
    if !(12..=600).contains(&units.len()) || !MATCH.is_match(text.as_bytes()) {
        return None;
    }
    Some(if units.len() <= 280 {
        text
    } else {
        let mut end = 279;
        // Match the reviewed scalar-safe reference clipping before SQLite.
        if (0xd800..=0xdbff).contains(&units[end - 1]) {
            end -= 1;
        }
        format!("{}…", String::from_utf16_lossy(&units[..end]))
    })
}
pub struct ReminderService<'a>(Storage<'a>, Option<&'a (dyn Fn() -> String + Send + Sync)>);
impl<'a> ReminderService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(Storage { db, time: None }, None)
    }
    pub fn with_time(db: &'a Connection, now: &'a str) -> Self {
        Self(
            Storage {
                db,
                time: Some(now),
            },
            None,
        )
    }
    /// Deterministic UUID boundary for isolated differential/replay fixtures.
    pub fn with_time_and_ids(
        db: &'a Connection,
        now: &'a str,
        ids: &'a (dyn Fn() -> String + Send + Sync),
    ) -> Self {
        Self(
            Storage {
                db,
                time: Some(now),
            },
            Some(ids),
        )
    }
    pub fn list(&self, options: ListReminderOptions) -> Result<Vec<ReminderRow>> {
        let mut conditions = vec![];
        let mut args: Vec<SqlValue> = vec![];
        for (column, value) in [
            ("user_id", options.user_id),
            ("status", options.status.filter(|s| s != "all")),
            ("project_id", options.project_id),
            ("session_id", options.session_id),
        ] {
            if let Some(value) = value.filter(|s| !s.is_empty()) {
                conditions.push(format!("{column}=?"));
                args.push(value.into());
            }
        }
        let filter = if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        };
        args.push(normalized_limit(options.limit, 100).into());
        Ok(self
            .0
            .db
            .prepare(&format!(
                "SELECT {COLUMNS} FROM reminders{filter} ORDER BY updated_at DESC LIMIT ?"
            ))?
            .query_map(params_from_iter(args), record)?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn list_by_ids(&self, ids: &[String]) -> Result<Vec<ReminderRow>> {
        let ids = unique_ids(ids);
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let marks = vec!["?"; ids.len()].join(",");
        Ok(self
            .0
            .db
            .prepare(&format!(
                "SELECT {COLUMNS} FROM reminders WHERE id IN ({marks})"
            ))?
            .query_map(params_from_iter(ids), record)?
            .collect::<rusqlite::Result<_>>()?)
    }
    pub fn get_by_id(&self, id: &str, user: Option<&str>) -> Result<Option<ReminderRow>> {
        let mut args = vec![id];
        let suffix = if let Some(user) = nonempty(user) {
            args.push(user);
            " AND user_id=?"
        } else {
            ""
        };
        Ok(self
            .0
            .db
            .query_row(
                &format!("SELECT {COLUMNS} FROM reminders WHERE id=?{suffix}"),
                params_from_iter(args),
                record,
            )
            .optional()?)
    }
    pub fn create(&self, p: CreateReminderParams) -> Result<ReminderRow> {
        let content = js_trim(&p.content);
        if content.is_empty() {
            return Err(ReminderError::Invalid("Reminder content is required"));
        }
        let id = self
            .1
            .map(|ids| ids())
            .unwrap_or_else(|| crate::db::identifiers::uuidv7().to_string());
        let now = self.0.now()?;
        let source_type = p
            .source_type
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("agent");
        let source_id = p
            .source_id
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty());
        let surface = p
            .source_surface
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("chat");
        self.0.db.execute("INSERT INTO reminders(id,user_id,project_id,session_id,content,source_type,source_id,source_surface,status,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",params![id,p.user_id,p.project_id,p.session_id,content,source_type,source_id,surface,p.status.as_deref().unwrap_or("active"),normalize_tags(p.tags),now,now])?;
        self.get_by_id(&id, None)?
            .ok_or(ReminderError::Invalid("Created reminder missing"))
    }
    pub fn update(
        &self,
        id: &str,
        p: UpdateReminderParams,
        user: Option<&str>,
    ) -> Result<Option<ReminderRow>> {
        let mut fields = vec![];
        if let Some(content) = p.content {
            let content = js_trim(&content);
            if content.is_empty() {
                return Err(ReminderError::Invalid("Reminder content must not be empty"));
            }
            fields.push(("content", SqlValue::Text(content.into())));
        }
        for (key, value) in [("project_id", p.project_id), ("session_id", p.session_id)] {
            if let Patch::Set(value) = value {
                fields.push((key, value.map(SqlValue::Text).unwrap_or(SqlValue::Null)));
            }
        }
        if let Some(status) = p.status {
            fields.push(("status", status.into()));
        }
        if let Patch::Set(tags) = p.tags {
            fields.push(("tags", normalize_tags(tags).into()));
        }
        self.update_fields(id, fields, user, None)?;
        self.get_by_id(id, user)
    }
    fn update_fields(
        &self,
        id: &str,
        fields: Vec<(&'static str, SqlValue)>,
        user: Option<&str>,
        now: Option<&str>,
    ) -> Result<()> {
        let mut set = vec!["updated_at=?".to_owned()];
        let now = match now {
            Some(now) => now.to_owned(),
            None => self.0.now()?,
        };
        let mut args = vec![SqlValue::Text(now)];
        for (name, value) in fields {
            set.push(format!("{name}=?"));
            args.push(value);
        }
        args.push(SqlValue::Text(id.into()));
        let suffix = if let Some(user) = nonempty(user) {
            args.push(SqlValue::Text(user.into()));
            " AND user_id=?"
        } else {
            ""
        };
        self.0.db.execute(
            &format!("UPDATE reminders SET {} WHERE id=?{suffix}", set.join(",")),
            params_from_iter(args),
        )?;
        Ok(())
    }
    pub fn delete(&self, id: &str, user: Option<&str>) -> Result<bool> {
        if self.get_by_id(id, user)?.is_none() {
            return Ok(false);
        }
        let mut args = vec![id];
        let suffix = if let Some(user) = nonempty(user) {
            args.push(user);
            " AND user_id=?"
        } else {
            ""
        };
        self.0.db.execute(
            &format!("DELETE FROM reminders WHERE id=?{suffix}"),
            params_from_iter(args),
        )?;
        Ok(true)
    }
    pub fn mark_retrieved(&self, ids: &[String], user: Option<&str>) -> Result<usize> {
        let now = self.0.now()?;
        let mut updated = 0;
        for id in unique_ids(ids) {
            if let Some(row) = self.get_by_id(id, user)? {
                let usage = row
                    .usage_count
                    .checked_add(1)
                    .ok_or(ReminderError::Invalid("Reminder usage counter overflow"))?;
                self.update_fields(
                    id,
                    vec![
                        ("usage_count", usage.into()),
                        ("last_retrieved_at", now.clone().into()),
                    ],
                    user,
                    Some(&now),
                )?;
                updated += 1;
            }
        }
        Ok(updated)
    }
    pub fn export_markdown(&self, mut options: ListReminderOptions) -> Result<String> {
        if options.status.is_none() {
            options.status = Some("all".into());
        }
        if options.limit.is_none() {
            options.limit = Some(500.0);
        }
        let mut lines = vec!["# Memory Export".to_owned(), String::new()];
        for row in self.list(options)? {
            let tags = display_tags(&row.tags);
            let mut meta = vec![
                row.status,
                format!(
                    "project={}",
                    nonempty(row.project_id.as_deref()).unwrap_or("none")
                ),
            ];
            if let Some(session) = nonempty(row.session_id.as_deref()) {
                meta.push(format!("session={session}"));
            }
            meta.extend([
                format!(
                    "source={}:{}@{}",
                    row.source_type,
                    row.source_id.as_deref().unwrap_or("none"),
                    row.source_surface
                ),
                format!("usage={}", row.usage_count),
            ]);
            if let Some(at) = nonempty(row.last_retrieved_at.as_deref()) {
                meta.push(format!("lastRetrieved={at}"));
            }
            if !tags.is_empty() {
                meta.push(format!("tags={}", tags.join(",")));
            }
            meta.push(format!("updated={}", row.updated_at));
            lines.push(format!("- {} ({})", row.content, meta.join("; ")));
        }
        lines.push(String::new());
        Ok(lines.join("\n"))
    }
    pub fn run_hygiene(&self, user: Option<&str>) -> Result<MemoryHygieneResult> {
        let active = self.list(ListReminderOptions {
            user_id: user.map(str::to_owned),
            status: Some("active".into()),
            limit: Some(500.0),
            ..Default::default()
        })?;
        let now = super::subscription_usage_fetchers::js_date_parse(&self.0.now()?)
            .ok_or(ReminderError::Invalid("Invalid reminder clock"))?;
        let mut archived = 0;
        for row in &active {
            let age = super::subscription_usage_fetchers::js_date_parse(&row.updated_at)
                .map(|at| (now as f64 - at as f64) / 86_400_000.0)
                .unwrap_or(0.0);
            if row.usage_count == 0 && age >= 180.0 && row.source_type != "user" {
                self.update(
                    &row.id,
                    UpdateReminderParams {
                        status: Some("archived".into()),
                        ..Default::default()
                    },
                    user,
                )?;
                archived += 1;
            }
        }
        let mut buckets: Vec<(String, Vec<&ReminderRow>)> = vec![];
        for row in &active {
            let key = subject(&row.content);
            if key.is_empty() {
                continue;
            }
            if let Some((_, rows)) = buckets.iter_mut().find(|(k, _)| *k == key) {
                rows.push(row);
            } else {
                buckets.push((key, vec![row]));
            }
        }
        let mut flagged = 0;
        for (_, rows) in buckets {
            let contents: HashSet<_> = rows.iter().map(|r| normalized_memory(&r.content)).collect();
            if contents.len() < 2 {
                continue;
            }
            for row in rows {
                let mut tags = display_tags(&row.tags);
                tags.extend(["review:conflict".into(), "memory:hygiene".into()]);
                self.update(
                    &row.id,
                    UpdateReminderParams {
                        tags: Patch::Set(Some(tags.into_iter().map(Value::String).collect())),
                        ..Default::default()
                    },
                    user,
                )?;
                flagged += 1;
            }
        }
        Ok(MemoryHygieneResult { archived, flagged })
    }
    pub fn scan_old_chats_for_memory(
        &self,
        user: Option<&str>,
        limit: Option<f64>,
    ) -> Result<OldChatMemoryScanResult> {
        let mut args = vec![];
        let suffix = if let Some(user) = nonempty(user) {
            args.push(SqlValue::Text(user.into()));
            " AND s.user_id=?"
        } else {
            ""
        };
        args.push(normalized_limit(limit, 200).into());
        let rows:Vec<(String,String,Option<String>,String)>=self.0.db.prepare(&format!("SELECT m.id,m.session_id,s.project_id,m.content FROM messages m INNER JOIN sessions s ON m.session_id=s.id WHERE m.role='user'{suffix} ORDER BY m.created_at DESC LIMIT ?"))?.query_map(params_from_iter(args),|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?.collect::<rusqlite::Result<_>>()?;
        let mut existing: HashSet<_> = self
            .list(ListReminderOptions {
                user_id: user.map(str::to_owned),
                status: Some("all".into()),
                limit: Some(500.0),
                ..Default::default()
            })?
            .iter()
            .map(|r| normalized_memory(&r.content))
            .collect();
        let mut created = 0;
        for (id, session, project, content) in &rows {
            let Some(content) = candidate(content) else {
                continue;
            };
            if !existing.insert(normalized_memory(&content)) {
                continue;
            }
            self.create(CreateReminderParams {
                user_id: user.map(str::to_owned),
                project_id: project.clone(),
                session_id: Some(session.clone()),
                content,
                source_type: Some("background_memory_scan".into()),
                source_id: Some(id.clone()),
                source_surface: Some("chat".into()),
                status: None,
                tags: Some(vec![json!("memory-scan")]),
            })?;
            created += 1;
        }
        Ok(OldChatMemoryScanResult {
            scanned: rows.len(),
            created,
        })
    }
    pub fn count_by_project(&self, user: &str) -> Result<BTreeMap<String, i64>> {
        let pairs:Vec<(Option<String>,i64)>=self.0.db.prepare("SELECT project_id,count(*) FROM reminders WHERE user_id=? AND status='active' GROUP BY project_id")?.query_map([user],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
        Ok(pairs
            .into_iter()
            .filter_map(|(p, n)| p.filter(|s| !s.is_empty()).map(|p| (p, n)))
            .collect())
    }
}
