//! Native persisted-conversation tool adapters. Run on the bounded database worker.
//! The caller supplies authenticated context; caller input cannot override it.
use super::list_preview::{ellipsize_text, format_ellipsed_list};
use crate::{
    contracts::bounded_json::Utf16Text,
    services::{
        chat_traces::{ChatTracesOptions, ChatTracesService},
        session_search::{SessionSearchOptions, SessionSearchResult, SessionSearchService},
    },
};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::LazyLock;
#[derive(Default)]
pub struct ToolContext {
    pub user_id: Option<String>,
}
#[derive(Serialize)]
pub struct ToolResult<T> {
    pub ok: bool,
    pub message: Utf16Text,
    pub data: T,
}
#[derive(Serialize)]
pub struct SearchData {
    pub results: Vec<SessionSearchResult>,
}
pub fn metadata() -> &'static Value {
    static DEFINITIONS: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("conversation-metadata.json"))
            .expect("embedded tool definitions")
    });
    &DEFINITIONS
}
fn units(value: &str) -> Utf16Text {
    Utf16Text(value.encode_utf16().collect())
}
fn text(value: &Value) -> String {
    value
        .as_str()
        .map(String::from)
        .unwrap_or_else(|| value.to_string())
}
fn nullish(value: Option<&Value>) -> Option<&Value> {
    value.filter(|v| !v.is_null())
}
pub fn session_search(
    db: &Connection,
    mut input: SessionSearchOptions,
    context: &ToolContext,
) -> rusqlite::Result<ToolResult<SearchData>> {
    input.user_id = context.user_id.clone();
    let results = SessionSearchService::new(db).search(&input)?;
    let lines = results
        .iter()
        .map(|r| {
            let (kind, title) = if r.source == "thread_activity" {
                (
                    "thread",
                    nullish(r.thread_title.as_ref())
                        .map(text)
                        .or_else(|| r.thread_id.clone())
                        .unwrap_or("?".into()),
                )
            } else {
                (
                    "chat",
                    nullish(r.session_name.as_ref())
                        .or_else(|| nullish(Some(&r.session_id)))
                        .map(text)
                        .unwrap_or("?".into()),
                )
            };
            let mut line = units(&format!("• [{kind} \"{title}\"] "));
            line.0.extend(ellipsize_text(&r.snippet.0, Some(120.0)).0);
            line
        })
        .collect::<Vec<_>>();
    let mut message = units(&format!(
        "Found {} prior conversation result(s)",
        results.len()
    ));
    if lines.is_empty() {
        message.0.push(46);
    } else {
        message.0.extend([58, 10]);
        message.0.extend(format_ellipsed_list(&lines, None).0);
    }
    Ok(ToolResult {
        ok: true,
        message,
        data: SearchData { results },
    })
}
pub fn chat_traces(
    db: &Connection,
    mut input: ChatTracesOptions,
    context: &ToolContext,
) -> rusqlite::Result<ToolResult<Value>> {
    input.user_id = context.user_id.clone();
    let result = ChatTracesService::new(db).traces(&input)?;
    if result["found"] != true {
        let suffix = if context.user_id.as_deref().is_some_and(|s| !s.is_empty()) {
            " accessible to this user"
        } else {
            ""
        };
        return Ok(ToolResult {
            ok: false,
            message: units(&format!(
                "No chat found for id '{}'{}.",
                input.chat_id, suffix
            )),
            data: json!({"chatId":input.chat_id,"found":false}),
        });
    }
    let lines = result["threads"]
        .as_array()
        .into_iter()
        .flatten()
        .take(6)
        .map(|t| {
            let model = t["model"]
                .as_str()
                .filter(|v| !v.is_empty())
                .map(|v| format!(" · {v}"))
                .unwrap_or_default();
            units(&format!(
                "• [{}] {}{model} — {}",
                text(&t["status"]),
                text(&t["kind"]),
                text(&t["title"])
            ))
        })
        .collect::<Vec<_>>();
    let counts = &result["counts"];
    let mut message = units(&format!(
        "Chat {}: {} message(s), {} thread(s), {} thread activit(ies).",
        input.chat_id, counts["messages"], counts["threads"], counts["threadActivities"]
    ));
    if !lines.is_empty() {
        message.0.extend("\nThreads:\n".encode_utf16());
        message.0.extend(format_ellipsed_list(&lines, None).0);
    }
    Ok(ToolResult {
        ok: true,
        message,
        data: result,
    })
}
