//! Read-only FTS history search. Execute on the bounded database worker.
use super::chat_traces::{limit, rows};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::LazyLock;

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionSearchOptions {
    pub query: String,
    pub limit: Option<f64>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    pub include_messages: Option<bool>,
    pub include_thread_activities: Option<bool>,
}
// Retain code units through JSON serialization, including a sliced surrogate.
pub use crate::contracts::bounded_json::Utf16Text;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSearchResult {
    pub source: &'static str,
    pub id: String,
    pub session_id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_name: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_title: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub content: Utf16Text,
    pub snippet: Utf16Text,
    pub created_at: String,
    pub score: f64,
}
pub fn build_fts_query(query: &str) -> Option<String> {
    static TERMS: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new("[a-z0-9_]+").expect("static regex"));
    let lower = query.to_lowercase();
    let mut terms = vec![];
    for found in TERMS
        .find_iter(&lower)
        .filter(|m| m.as_str().len() >= 2)
        .take(12)
    {
        if !terms.contains(&found.as_str()) {
            terms.push(found.as_str());
        }
    }
    (!terms.is_empty()).then(|| {
        terms
            .iter()
            .map(|v| format!("\"{v}\""))
            .collect::<Vec<_>>()
            .join(" OR ")
    })
}
fn whitespace(c: char) -> bool {
    crate::text::js_whitespace(c)
}
fn normalize(text: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for c in text.chars() {
        if whitespace(c) {
            space = !out.is_empty();
        } else {
            if space {
                out.push(' ');
            }
            space = false;
            out.push(c);
        }
    }
    out
}
fn content(text: &str) -> Utf16Text {
    let mut units: Vec<_> = normalize(text).encode_utf16().collect();
    if units.len() > 2000 {
        units.truncate(1997);
        units.extend([46, 46, 46]);
    }
    Utf16Text(units)
}
fn snippet(text: Option<&str>, fallback: &str) -> Utf16Text {
    if let Some(text) = text {
        let text = normalize(text);
        if !text.is_empty() {
            return Utf16Text(text.encode_utf16().collect());
        }
    }
    let units: Vec<_> = fallback.encode_utf16().take(240).collect();
    // Trim ECMAScript whitespace without decoding an incomplete final pair.
    let is_space = |unit: &u16| char::from_u32(*unit as u32).is_some_and(whitespace);
    let start = units
        .iter()
        .position(|v| !is_space(v))
        .unwrap_or(units.len());
    let end = units
        .iter()
        .rposition(|v| !is_space(v))
        .map(|n| n + 1)
        .unwrap_or(start);
    Utf16Text(units[start..end].to_vec())
}
fn text<'a>(row: &'a Value, key: &str) -> &'a str {
    row[key].as_str().expect("non-null text column")
}
pub struct SessionSearchService<'a> {
    db: &'a Connection,
}
impl<'a> SessionSearchService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db }
    }
    pub fn search(
        &self,
        options: &SessionSearchOptions,
    ) -> rusqlite::Result<Vec<SessionSearchResult>> {
        let Some(query) = build_fts_query(&options.query) else {
            return Ok(vec![]);
        };
        let limit = limit(options.limit, 10, 50);
        let mut results = vec![];
        if options.include_messages != Some(false) {
            let messages = rows(
                self.db,
                "SELECT m.id,m.session_id AS sessionId,s.name AS sessionName,m.role,m.content,snippet(messages_fts,0,'[',']','...',24) AS snippet,m.created_at AS createdAt FROM messages_fts JOIN messages m ON m.id=messages_fts.message_id JOIN sessions s ON s.id=m.session_id WHERE messages_fts MATCH ?1 AND (?2 IS NULL OR s.user_id=?2) AND (?3 IS NULL OR m.session_id=?3) ORDER BY bm25(messages_fts),m.created_at DESC LIMIT ?4",
                params![query, options.user_id, options.session_id, limit],
            )?;
            for (index, row) in messages.into_iter().enumerate() {
                results.push(SessionSearchResult {
                    source: "message",
                    id: text(&row, "id").into(),
                    session_id: row["sessionId"].clone(),
                    session_name: Some(row["sessionName"].clone()),
                    thread_id: None,
                    thread_title: None,
                    role: Some(text(&row, "role").into()),
                    kind: None,
                    content: content(text(&row, "content")),
                    snippet: snippet(row["snippet"].as_str(), text(&row, "content")),
                    created_at: text(&row, "createdAt").into(),
                    score: 1.0 / (61.0 + index as f64),
                });
            }
        }
        if options.include_thread_activities != Some(false) {
            let activities = rows(
                self.db,
                "SELECT a.id,t.session_id AS sessionId,a.thread_id AS threadId,t.title AS threadTitle,a.kind,a.summary,a.payload,snippet(agent_thread_activities_fts,0,'[',']','...',24) AS snippet,a.created_at AS createdAt FROM agent_thread_activities_fts JOIN agent_thread_activities a ON a.id=agent_thread_activities_fts.activity_id JOIN agent_threads t ON t.id=a.thread_id WHERE agent_thread_activities_fts MATCH ?1 AND a.kind IN ('message','tool.result','tool.error','error') AND (?2 IS NULL OR t.user_id=?2) AND (?3 IS NULL OR t.session_id=?3) AND (?4 IS NULL OR a.thread_id=?4) ORDER BY bm25(agent_thread_activities_fts),a.created_at DESC LIMIT ?5",
                params![
                    query,
                    options.user_id,
                    options.session_id,
                    options.thread_id,
                    limit
                ],
            )?;
            for (index, row) in activities.into_iter().enumerate() {
                let summary = text(&row, "summary");
                let payload = row["payload"].as_str().filter(|v| !v.is_empty());
                let merged = payload
                    .map(|p| format!("{summary}\n{p}"))
                    .unwrap_or_else(|| summary.into());
                results.push(SessionSearchResult {
                    source: "thread_activity",
                    id: text(&row, "id").into(),
                    session_id: row["sessionId"].clone(),
                    session_name: None,
                    thread_id: Some(text(&row, "threadId").into()),
                    thread_title: Some(row["threadTitle"].clone()),
                    role: None,
                    kind: Some(text(&row, "kind").into()),
                    content: content(&merged),
                    snippet: snippet(row["snippet"].as_str(), &merged),
                    created_at: text(&row, "createdAt").into(),
                    score: 1.0 / (61.0 + index as f64),
                });
            }
        }
        // ISO database timestamps compare in the same order as localeCompare.
        // Stable sorting preserves message-before-activity ties from flatMap.
        results.sort_by(|a, b| {
            b.score
                .total_cmp(&a.score)
                .then_with(|| b.created_at.cmp(&a.created_at))
        });
        results.truncate(limit as usize);
        Ok(results)
    }
}
