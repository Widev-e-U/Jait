//! Native port of the thread-activity maintenance methods of `ThreadStore`
//! from `packages/gateway/src/services/threads.ts`.
//!
//! Reference spans (TypeScript):
//! - constants (L24-34):  `MAX_ACTIVITY_PAYLOAD_BYTES = 512_000`,
//!                        `MAX_ACTIVITY_SUMMARY_BYTES = 8_000`,
//!                        `TRANSIENT_ACTIVITY_KINDS`
//! - `isTransientActivityKind`  (L35)
//! - `appendActivity`           (L386-402)
//! - `updateAssistantCheckpoint`(L405-412)
//! - `deleteActivity`           (L413-417)
//!
//! Semantics preserved:
//! - the persisted summary is byte-bounded by `MAX_ACTIVITY_SUMMARY_BYTES`
//!   *before* the row is written, while the returned record still carries the
//!   untruncated payload exactly as the caller supplied it;
//! - a payload is only serialized when one is supplied (`? IS NULL`
//!   otherwise), and serialization is bounded by
//!   `MAX_ACTIVITY_PAYLOAD_BYTES` through the shared
//!   [`serialize_bounded_json`] contract helper rather than a second local
//!   implementation;
//! - `update_assistant_checkpoint` trims the content, keeps at most 500
//!   characters for the summary, stores the *full* content plus the `partial`
//!   flag in the payload, and is scoped by both `id` and `thread_id` so a
//!   mismatched pair is a no-op returning `None`;
//! - `delete_activity` is likewise scoped by `(thread_id, id)` and reports how
//!   many rows it removed instead of failing on a missing id.
//!
//! Documented gap (not stubbed): the reference also exposes
//! `logProviderEvent`, which maps ~50 provider event kinds onto activity rows.
//! The native provider-event ingestion surface does not exist in this crate
//! yet, so no dispatch table is fabricated here; the gap is recorded on the
//! component ledger instead.

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

use crate::contracts::bounded_json::{limit_utf8, serialize_bounded_json};

// Bun SQLite decodes malformed TEXT as replacement characters; rusqlite's
// String conversion instead rejects it. Keep SQLite type checking intact.
#[derive(Debug)]
pub(crate) struct ThreadText(pub String);

impl rusqlite::types::FromSql for ThreadText {
    fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
        match value {
            rusqlite::types::ValueRef::Text(bytes) => {
                Ok(Self(String::from_utf8_lossy(bytes).into_owned()))
            }
            _ => Err(rusqlite::types::FromSqlError::InvalidType),
        }
    }
}

/// Reference `MAX_ACTIVITY_SUMMARY_BYTES`.
pub const MAX_ACTIVITY_SUMMARY_BYTES: usize = 8_000;

/// Reference `MAX_ACTIVITY_PAYLOAD_BYTES`.
pub const MAX_ACTIVITY_PAYLOAD_BYTES: usize = 512_000;

/// Reference `content.trim().slice(0, 500)` inside `updateAssistantCheckpoint`.
pub const ASSISTANT_CHECKPOINT_SUMMARY_CHARS: usize = 500;

/// Reference `TRANSIENT_ACTIVITY_KINDS`.
pub const TRANSIENT_ACTIVITY_KINDS: &[&str] = &[
    "thinking",
    "agent_thought_chunk",
    "codex/event/agent_reasoning_delta",
    "codex/event/exec_command_output_delta",
    "codex/event/reasoning_content_delta",
];

/// Reference `isTransientActivityKind`.
pub fn is_transient_activity_kind(kind: &str) -> bool {
    TRANSIENT_ACTIVITY_KINDS.contains(&kind)
}

fn activity_json(
    id: &str,
    thread_id: &str,
    kind: &str,
    summary: &str,
    payload: Option<&Value>,
    created_at: &str,
) -> Value {
    json!({
        "id": id,
        "threadId": thread_id,
        "kind": kind,
        "summary": summary,
        "payload": payload,
        "createdAt": created_at,
    })
}

/// Reference `ThreadStore.appendActivity`.
pub fn append_activity(
    connection: &Connection,
    thread_id: &str,
    kind: &str,
    summary: &str,
    payload: Option<&Value>,
) -> rusqlite::Result<Value> {
    let id = crate::identifiers::uuidv7();
    let created_at = crate::security::protocols::now_iso8601();
    let persisted_summary = limit_utf8(summary, MAX_ACTIVITY_SUMMARY_BYTES, None);
    let payload_text =
        payload.map(|value| serialize_bounded_json(value, MAX_ACTIVITY_PAYLOAD_BYTES));
    connection.execute(
        "insert into agent_thread_activities (id, thread_id, kind, summary, payload, created_at) \
         values (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            thread_id,
            kind,
            persisted_summary,
            payload_text,
            created_at
        ],
    )?;
    Ok(activity_json(
        &id,
        thread_id,
        kind,
        &persisted_summary,
        payload,
        &created_at,
    ))
}

/// Reference `ThreadStore.updateAssistantCheckpoint`.
///
/// The reference trims ECMAScript whitespace and slices to 500 UTF-16 units.
/// Bun's SQLite round trip decodes a split surrogate as three U+FFFDs.
pub fn update_assistant_checkpoint(
    connection: &Connection,
    thread_id: &str,
    activity_id: &str,
    content: &str,
    partial: bool,
) -> rusqlite::Result<Option<Value>> {
    let trimmed = content.trim_matches(|c: char| {
        matches!(c,
            '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
            '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
            '\u{205f}' | '\u{3000}' | '\u{feff}'
        )
    });
    let units: Vec<u16> = trimmed
        .encode_utf16()
        .take(ASSISTANT_CHECKPOINT_SUMMARY_CHARS)
        .collect();
    let split_surrogate = units
        .last()
        .copied()
        .filter(|unit| (0xd800..=0xdbff).contains(unit));
    let prefix = if split_surrogate.is_some() {
        &units[..units.len() - 1]
    } else {
        &units[..]
    };
    // A valid Rust input can only leave a high surrogate at the slice boundary.
    // SQLite accepts these Bun-compatible bytes as TEXT via CAST from a blob.
    let prefix = String::from_utf16(prefix).expect("valid UTF-16 prefix");
    let summary = if let Some(unit) = split_surrogate {
        let encoding: String = connection.pragma_query_value(None, "encoding", |row| row.get(0))?;
        if !encoding.eq_ignore_ascii_case("UTF-8") {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "split-surrogate checkpoint requires a UTF-8 SQLite database",
                ),
            )));
        }
        let mut summary = prefix.into_bytes();
        summary.extend_from_slice(&[
            0xe0 | ((unit >> 12) as u8),
            0x80 | (((unit >> 6) & 0x3f) as u8),
            0x80 | ((unit & 0x3f) as u8),
        ]);
        debug_assert!(summary.len() <= MAX_ACTIVITY_SUMMARY_BYTES);
        rusqlite::types::Value::Blob(summary)
    } else {
        debug_assert!(prefix.len() <= MAX_ACTIVITY_SUMMARY_BYTES);
        rusqlite::types::Value::Text(prefix)
    };
    let payload = json!({
        "role": "assistant",
        "content": content,
        "partial": partial,
    });
    let payload_text = serialize_bounded_json(&payload, MAX_ACTIVITY_PAYLOAD_BYTES);
    let updated = connection.execute(
        "update agent_thread_activities set summary = CAST(?1 AS TEXT), payload = ?2 \
         where id = ?3 and thread_id = ?4",
        params![summary, payload_text, activity_id, thread_id],
    )?;
    if updated == 0 {
        return Ok(None);
    }
    let row = connection
        .query_row(
            "select id, thread_id, kind, summary, payload, created_at \
             from agent_thread_activities where id = ?1 and thread_id = ?2",
            params![activity_id, thread_id],
            |row| {
                let id = row.get::<_, ThreadText>(0)?.0;
                let thread_id = row.get::<_, ThreadText>(1)?.0;
                let kind = row.get::<_, ThreadText>(2)?.0;
                let summary = row.get::<_, ThreadText>(3)?.0;
                let payload = row.get::<_, Option<ThreadText>>(4)?.map(|text| text.0);
                let created_at = row.get::<_, ThreadText>(5)?.0;
                Ok((id, thread_id, kind, summary, payload, created_at))
            },
        )
        .optional()?;
    Ok(
        row.map(|(id, thread_id, kind, summary, payload, created_at)| {
            let parsed = payload
                .as_deref()
                .and_then(|text| serde_json::from_str::<Value>(text).ok());
            activity_json(
                &id,
                &thread_id,
                &kind,
                &summary,
                parsed.as_ref(),
                &created_at,
            )
        }),
    )
}

/// Reference `ThreadStore.deleteActivity`; returns the number of removed rows.
pub fn delete_activity(
    connection: &Connection,
    thread_id: &str,
    activity_id: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "delete from agent_thread_activities where id = ?1 and thread_id = ?2",
        params![activity_id, thread_id],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_database;
    use std::path::Path;

    fn database() -> Connection {
        let connection = open_database(Path::new(":memory:")).expect("open in-memory database");
        crate::db::migrate_database(&connection).expect("migrate");
        connection
            .execute(
                "insert into agent_threads \
                 (id, title, provider_id, status, created_at, updated_at) \
             values ('thread-1', 'thread-1', 'jait', 'running', 't0', 't0')",
                [],
            )
            .expect("insert thread");
        connection
    }

    fn count(connection: &Connection) -> i64 {
        connection
            .query_row("select count(*) from agent_thread_activities", [], |row| {
                row.get(0)
            })
            .expect("count activities")
    }

    #[test]
    fn split_checkpoint_preserves_bun_sqlite_text_bytes() {
        let connection = database();
        let first = append_activity(&connection, "thread-1", "message", "draft", None).unwrap();
        let id = first["id"].as_str().unwrap();
        let content = format!("{}😀tail", "a".repeat(499));
        let updated = update_assistant_checkpoint(&connection, "thread-1", id, &content, true)
            .unwrap()
            .unwrap();
        let (hex, kind): (String, String) = connection
            .query_row(
                "select hex(summary), typeof(summary) from agent_thread_activities where id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(hex, format!("{}EDA0BD", "61".repeat(499)));
        assert_eq!(kind, "text");
        assert_eq!(updated["summary"], format!("{}���", "a".repeat(499)));
    }

    #[test]
    #[ignore = "requires Bun; run explicitly for the cross-runtime differential"]
    fn bun_checkpoint_text_round_trips_with_matching_decoding() {
        let output = match std::process::Command::new("bun")
            .args([
                "-e",
                r#"import { Database } from 'bun:sqlite';
import { limitUtf8 } from '../gateway/src/lib/bounded-json.ts';
const db = new Database(':memory:');
db.run('create table x (value text)');
db.run("insert into x values ('initial')");
const contents = [
  'normal é 😀 text', 'a'.repeat(498) + '😀tail',
  'a'.repeat(499) + '😀tail', 'a'.repeat(500) + '😀tail',
  '\ufeff' + 'é'.repeat(499) + '🦊tail\ufeff', '', 'updated ✓'
];
const rows = contents.map(content => {
  db.query('update x set value = ?').run(limitUtf8(content.trim().slice(0, 500), 8000));
  return db.query('select hex(value) as hex, typeof(value) as type, value from x').get();
});
console.log(JSON.stringify(rows));"#,
            ])
            .output()
        {
            Ok(output) => output,
            Err(error) => panic!("run Bun: {error}"),
        };
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let bun: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
        let contents = [
            "normal é 😀 text".to_string(),
            format!("{}😀tail", "a".repeat(498)),
            format!("{}😀tail", "a".repeat(499)),
            format!("{}😀tail", "a".repeat(500)),
            format!("\u{feff}{}🦊tail\u{feff}", "é".repeat(499)),
            String::new(),
            "updated ✓".to_string(),
        ];
        let connection = database();
        let first = append_activity(&connection, "thread-1", "message", "draft", None).unwrap();
        let id = first["id"].as_str().unwrap();
        for (index, content) in contents.iter().enumerate() {
            let updated = update_assistant_checkpoint(&connection, "thread-1", id, content, true)
                .unwrap()
                .unwrap();
            let (hex, kind, decoded): (String, String, ThreadText) = connection.query_row(
                "select hex(summary), typeof(summary), summary from agent_thread_activities where id = ?1", [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            ).unwrap();
            assert_eq!(hex, bun[index]["hex"], "bytes for case {index}");
            assert_eq!(kind, bun[index]["type"], "SQLite type for case {index}");
            assert_eq!(decoded.0, bun[index]["value"], "read for case {index}");
            assert_eq!(
                updated["summary"], bun[index]["value"],
                "returned summary for case {index}"
            );
            assert_eq!(updated["payload"]["content"], *content);
        }
    }

    #[test]
    fn split_checkpoint_rejects_utf16_database_without_modifying_row() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA encoding = 'UTF-16le'; CREATE TABLE agent_thread_activities (id TEXT, thread_id TEXT, kind TEXT, summary TEXT, payload TEXT, created_at TEXT); INSERT INTO agent_thread_activities VALUES ('a', 'thread-1', 'message', 'old', NULL, 'now');").unwrap();
        let content = format!("{}😀", "a".repeat(499));
        assert!(update_assistant_checkpoint(&connection, "thread-1", "a", &content, true).is_err());
        let summary: String = connection
            .query_row("SELECT summary FROM agent_thread_activities", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(summary, "old");
        let updated = update_assistant_checkpoint(&connection, "thread-1", "a", "normal é", false)
            .unwrap()
            .unwrap();
        assert_eq!(updated["summary"], "normal é");
    }

    #[test]
    fn checkpoint_reads_existing_invalid_text() {
        let connection = database();
        connection.execute_batch("INSERT INTO agent_thread_activities (id, thread_id, kind, summary, created_at) VALUES ('a', 'thread-1', CAST(x'EDA0BD' AS TEXT), 'old', 'now')").unwrap();
        let activity = update_assistant_checkpoint(&connection, "thread-1", "a", "new", true)
            .unwrap()
            .unwrap();
        assert_eq!(activity["kind"], "\u{fffd}\u{fffd}\u{fffd}");
        assert_eq!(activity["summary"], "new");
    }

    #[test]
    fn transient_kinds_match_the_reference_set() {
        assert!(is_transient_activity_kind("thinking"));
        assert!(is_transient_activity_kind("agent_thought_chunk"));
        assert!(is_transient_activity_kind(
            "codex/event/reasoning_content_delta"
        ));
        assert!(!is_transient_activity_kind("message"));
        assert!(!is_transient_activity_kind("tool_call"));
        assert_eq!(TRANSIENT_ACTIVITY_KINDS.len(), 5);
    }

    #[test]
    fn summary_is_bounded_while_payload_is_echoed_untruncated() {
        let connection = database();
        let long = "é".repeat(MAX_ACTIVITY_SUMMARY_BYTES);
        let payload = json!({ "role": "user", "content": long });
        let activity = append_activity(&connection, "thread-1", "message", &long, Some(&payload))
            .expect("append activity");
        assert_eq!(
            activity["payload"], payload,
            "returned payload is untruncated"
        );
        let stored: String = connection
            .query_row("select summary from agent_thread_activities", [], |row| {
                row.get(0)
            })
            .expect("stored summary");
        assert!(stored.len() <= MAX_ACTIVITY_SUMMARY_BYTES);
        assert!(stored.is_char_boundary(stored.len()));
    }

    #[test]
    fn append_without_payload_stores_null() {
        let connection = database();
        append_activity(&connection, "thread-1", "session", "started", None).expect("append");
        let stored: Option<String> = connection
            .query_row("select payload from agent_thread_activities", [], |row| {
                row.get(0)
            })
            .expect("stored payload");
        assert!(stored.is_none());
    }

    #[test]
    fn assistant_checkpoint_replaces_summary_and_payload() {
        let connection = database();
        let first =
            append_activity(&connection, "thread-1", "message", "draft", None).expect("append");
        let id = first["id"].as_str().expect("id").to_string();
        let content = format!("  {}  ", "x".repeat(MAX_ACTIVITY_SUMMARY_BYTES));
        let updated = update_assistant_checkpoint(&connection, "thread-1", &id, &content, true)
            .expect("update checkpoint")
            .expect("row updated");
        assert_eq!(updated["kind"], "message");
        assert_eq!(updated["payload"]["role"], "assistant");
        assert_eq!(updated["payload"]["partial"], true);
        assert_eq!(
            updated["payload"]["content"].as_str().expect("content"),
            content.as_str(),
            "full content is preserved even when the summary is truncated"
        );
        let summary = updated["summary"].as_str().expect("summary");
        assert!(summary.len() <= MAX_ACTIVITY_SUMMARY_BYTES);
        assert!(!summary.starts_with(' '), "summary is trimmed");
    }

    #[test]
    fn checkpoint_uses_javascript_trim_and_utf16_slice() {
        let connection = database();
        let first = append_activity(&connection, "thread-1", "message", "draft", None).unwrap();
        let id = first["id"].as_str().unwrap();
        let content = format!("\u{feff}{}😀tail\u{feff}", "a".repeat(499));
        let updated = update_assistant_checkpoint(&connection, "thread-1", id, &content, false)
            .unwrap()
            .unwrap();
        assert_eq!(
            updated["summary"],
            format!("{}\u{fffd}\u{fffd}\u{fffd}", "a".repeat(499))
        );
        let control = "\u{0085}x\u{0085}";
        let updated = update_assistant_checkpoint(&connection, "thread-1", id, control, false)
            .unwrap()
            .unwrap();
        assert_eq!(updated["summary"], control);
    }

    #[test]
    fn assistant_checkpoint_is_scoped_by_thread() {
        let connection = database();
        let first =
            append_activity(&connection, "thread-1", "message", "draft", None).expect("append");
        let id = first["id"].as_str().expect("id").to_string();
        assert!(
            update_assistant_checkpoint(&connection, "thread-2", &id, "body", false)
                .expect("update")
                .is_none(),
            "a mismatched thread id must not update the row"
        );
    }

    #[test]
    fn delete_activity_is_scoped_and_reports_row_count() {
        let connection = database();
        let first =
            append_activity(&connection, "thread-1", "message", "draft", None).expect("append");
        let id = first["id"].as_str().expect("id").to_string();
        assert_eq!(
            delete_activity(&connection, "other-thread", &id).expect("delete"),
            0
        );
        assert_eq!(count(&connection), 1);
        assert_eq!(
            delete_activity(&connection, "thread-1", &id).expect("delete"),
            1
        );
        assert_eq!(count(&connection), 0);
        assert_eq!(
            delete_activity(&connection, "thread-1", &id).expect("delete"),
            0
        );
    }
}
