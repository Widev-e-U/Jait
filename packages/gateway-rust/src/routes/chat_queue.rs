//! Queued chat messages. A send that arrives while a chat turn runs waits in the session's
//! `queued_messages` state, and the next turn start picks it up. The consumed-id record keeps a
//! stale client snapshot from bringing back an entry that already ran. The reference is the
//! queue code in `packages/gateway/src/routes/chat.ts` (`parseQueuedChatMessages`, consumed ids).
use crate::{services::json_state::SessionStateService, text::js_trim};
use serde_json::{Map, Value, json};
use std::collections::HashSet;

/// Session-state key of the queue. Clients read and write it through the session state routes.
pub(crate) const QUEUE_KEY: &str = "queued_messages";
const CONSUMED_KEY: &str = "chat.consumedQueueIds";
/// Node keeps this many consumed ids per session.
const MAX_CONSUMED_IDS: usize = 100;

/// The entries Node keeps: objects whose `content` is a string that is not blank, unless the entry
/// carries attachments. A repeated id keeps only its first entry. Entries are kept as written.
pub(crate) fn parse(raw: Option<&Value>) -> Vec<Value> {
    let Some(entries) = raw.and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    entries
        .iter()
        .filter(|entry| {
            let Some(content) = entry.get("content").and_then(Value::as_str) else {
                return false;
            };
            if js_trim(content).is_empty() && !has_attachments(entry) {
                return false;
            }
            id_of(entry).is_none_or(|id| seen.insert(id.to_owned()))
        })
        .cloned()
        .collect()
}

pub(crate) fn has_attachments(entry: &Value) -> bool {
    entry
        .get("attachments")
        .and_then(Value::as_array)
        .is_some_and(|items| !items.is_empty())
}

pub(crate) fn id_of(entry: &Value) -> Option<&str> {
    entry
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
}

/// Node's dedupe rule for a send: the same text after trimming, and no uploads on the entry.
pub(crate) fn same_text(entry: &Value, content: &str) -> bool {
    !has_attachments(entry)
        && entry
            .get("content")
            .and_then(Value::as_str)
            .is_some_and(|text| js_trim(text) == js_trim(content))
}

/// Drops entries whose ids were already consumed. A stale client snapshot can re-introduce them.
pub(crate) fn without_consumed(queue: Vec<Value>, consumed: &[String]) -> Vec<Value> {
    queue
        .into_iter()
        .filter(|entry| id_of(entry).is_none_or(|id| !consumed.iter().any(|known| known == id)))
        .collect()
}

/// The consumed ids in arrival order; the oldest fall off past the limit.
pub(crate) fn consumed_ids(raw: Option<&Value>) -> Vec<String> {
    let mut ids: Vec<String> = raw
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let excess = ids.len().saturating_sub(MAX_CONSUMED_IDS);
    ids.drain(..excess);
    ids
}

pub(crate) fn remember(consumed: &mut Vec<String>, id: &str) {
    forget(consumed, id);
    consumed.push(id.to_owned());
    let excess = consumed.len().saturating_sub(MAX_CONSUMED_IDS);
    consumed.drain(..excess);
}

pub(crate) fn forget(consumed: &mut Vec<String>, id: &str) {
    consumed.retain(|known| known != id);
}

/// A new queue entry with Node's fields that this gateway uses: `id`, `content`, `queuedAt`.
pub(crate) fn new_entry(content: &str) -> Value {
    let queued_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64);
    json!({
        "id": format!("q-{}", uuid::Uuid::new_v4()),
        "content": content,
        "queuedAt": queued_at,
    })
}

/// The validated queue and the consumed ids of a session, read on the database worker.
pub(crate) fn read(
    db: &rusqlite::Connection,
    session: &str,
) -> rusqlite::Result<(Vec<Value>, Vec<String>)> {
    let state = SessionStateService::new(db).get(
        session,
        Some(&[QUEUE_KEY.to_owned(), CONSUMED_KEY.to_owned()]),
    )?;
    Ok((
        parse(state.get(QUEUE_KEY)),
        consumed_ids(state.get(CONSUMED_KEY)),
    ))
}

/// Writes the queue (cleared when empty) and the consumed ids in one state update.
pub(crate) fn store(
    db: &rusqlite::Connection,
    session: &str,
    queue: &[Value],
    consumed: &[String],
) -> rusqlite::Result<()> {
    let mut entries = Map::new();
    entries.insert(
        QUEUE_KEY.to_owned(),
        if queue.is_empty() {
            Value::Null
        } else {
            Value::Array(queue.to_vec())
        },
    );
    entries.insert(CONSUMED_KEY.to_owned(), json!(consumed));
    SessionStateService::new(db).set(session, &entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_keeps_node_entries_and_drops_blank_or_repeated_ones() {
        let raw = json!([
            {"id": "a", "content": "first"},
            {"id": "a", "content": "repeat"},
            {"id": "b", "content": "   "},
            "not an object",
            {"id": "d", "content": "with upload", "attachments": [{"name": "x"}]},
            {"content": "no id"},
        ]);
        let parsed = parse(Some(&raw));
        let contents: Vec<&str> = parsed
            .iter()
            .filter_map(|entry| entry["content"].as_str())
            .collect();
        assert_eq!(contents, ["first", "with upload", "no id"]);
    }

    #[test]
    fn a_send_matches_an_entry_by_trimmed_text_and_never_one_with_uploads() {
        let plain = json!({"id": "a", "content": " follow up "});
        let upload = json!({"id": "b", "content": "follow up", "attachments": [{"name": "x"}]});
        assert!(same_text(&plain, "follow up"));
        assert!(!same_text(&upload, "follow up"));
    }

    #[test]
    fn consumed_entries_are_filtered_out_of_a_stale_snapshot() {
        let queue = vec![
            json!({"id": "a", "content": "x"}),
            json!({"content": "no id"}),
        ];
        let kept = without_consumed(queue, &["a".to_owned()]);
        assert_eq!(kept, vec![json!({"content": "no id"})]);
    }

    #[test]
    fn consumed_ids_keep_the_newest_hundred_in_order() {
        let raw = json!((0..150).map(|i| i.to_string()).collect::<Vec<_>>());
        let ids = consumed_ids(Some(&raw));
        assert_eq!(ids.len(), 100);
        assert_eq!(ids.first().map(String::as_str), Some("50"));
        assert_eq!(ids.last().map(String::as_str), Some("149"));
        let mut consumed = ids;
        remember(&mut consumed, "50");
        assert_eq!(consumed.last().map(String::as_str), Some("50"));
        assert_eq!(consumed.len(), 100);
    }
}
