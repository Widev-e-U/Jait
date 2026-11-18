//! Extract full nested-agent payloads, retain lightweight message stubs, persist
//! independent history rows. Invoke persistence on the existing SQLite worker.
use crate::{
    contracts::{
        bounded_json::Utf16Text,
        ecmascript_json::{JsonDocument, JsonValue},
    },
    time::{Clock, default_clock, iso},
};
use rusqlite::{Connection, params};
use serde::{Serialize, Serializer};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct JsonFragment {
    document: Arc<JsonDocument>,
    root: usize,
}
impl JsonFragment {
    pub fn to_json(&self) -> String {
        self.document.stringify_value(self.root)
    }
}
impl Serialize for JsonFragment {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        raw(self.to_json(), serializer)
    }
}
#[derive(Clone, Debug)]
pub struct SubAgentPayload {
    pub sub_agent_id: Utf16Text,
    pub content: Option<Utf16Text>,
    pub performative: Option<Utf16Text>,
    pub rounds: Option<f64>,
    pub duration_ms: Option<f64>,
    pub segments: Option<JsonFragment>,
    pub tool_calls: Option<JsonFragment>,
}
fn quoted(text: &Utf16Text) -> String {
    serde_json::to_string(text).expect("UTF-16 quote")
}
fn number(value: f64) -> String {
    if !value.is_finite() {
        "null".into()
    } else if value == 0.0 {
        "0".into()
    } else {
        ryu_js::Buffer::new().format(value).into()
    }
}
fn raw<S: Serializer>(text: String, serializer: S) -> Result<S::Ok, S::Error> {
    serde_json::value::RawValue::from_string(text)
        .map_err(serde::ser::Error::custom)?
        .serialize(serializer)
}
impl SubAgentPayload {
    pub fn to_json(&self) -> String {
        let mut fields = vec![format!("\"subAgentId\":{}", quoted(&self.sub_agent_id))];
        for (name, value) in [
            ("content", self.content.as_ref()),
            ("performative", self.performative.as_ref()),
        ] {
            if let Some(value) = value {
                fields.push(format!("\"{name}\":{}", quoted(value)));
            }
        }
        for (name, value) in [("rounds", self.rounds), ("durationMs", self.duration_ms)] {
            if let Some(value) = value {
                fields.push(format!("\"{name}\":{}", number(value)));
            }
        }
        for (name, value) in [
            ("segments", self.segments.as_ref()),
            ("toolCalls", self.tool_calls.as_ref()),
        ] {
            if let Some(value) = value {
                fields.push(format!("\"{name}\":{}", value.to_json()));
            }
        }
        format!("{{{}}}", fields.join(","))
    }
}
impl Serialize for SubAgentPayload {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        raw(self.to_json(), serializer)
    }
}
fn entries(document: &JsonDocument) -> Vec<usize> {
    match &document.nodes[document.root] {
        JsonValue::Array(values) => values.clone(),
        _ => vec![document.root],
    }
}
fn valid_data(document: &JsonDocument, entry: usize) -> Option<usize> {
    let data = document.field(entry, "data")?;
    if !matches!(document.nodes[data], JsonValue::Object(_)) {
        return None;
    }
    let id = document.string(document.field(data, "subAgentId")?)?;
    (!id.0.is_empty()).then_some(data)
}
pub fn extract_sub_agent_payloads(input: Option<&str>) -> Vec<SubAgentPayload> {
    let Some(document) = input
        .filter(|s| !s.is_empty())
        .and_then(|s| JsonDocument::parse(s).ok())
        .map(Arc::new)
    else {
        return vec![];
    };
    entries(&document)
        .into_iter()
        .filter_map(|entry| {
            let data = valid_data(&document, entry)?;
            let text = |key| {
                document
                    .field(data, key)
                    .and_then(|id| document.string(id))
                    .cloned()
            };
            let numeric = |key| document.field(data, key).and_then(|id| document.number(id));
            let array = |key| {
                document
                    .field(data, key)
                    .filter(|&id| matches!(document.nodes[id], JsonValue::Array(_)))
                    .map(|root| JsonFragment {
                        document: document.clone(),
                        root,
                    })
            };
            Some(SubAgentPayload {
                sub_agent_id: text("subAgentId").unwrap(),
                content: text("content").or_else(|| text("partialContent")),
                performative: text("performative"),
                rounds: numeric("rounds"),
                duration_ms: numeric("durationMs"),
                segments: array("segments"),
                tool_calls: array("toolCalls"),
            })
        })
        .collect()
}
pub fn strip_sub_agent_payloads(input: Option<&str>) -> Option<String> {
    let mut document = JsonDocument::parse(input.filter(|s| !s.is_empty())?).ok()?;
    for entry in entries(&document) {
        let Some(data) = valid_data(&document, entry) else {
            continue;
        };
        let mut fields = vec![(
            "subAgentId".encode_utf16().collect(),
            document.field(data, "subAgentId").unwrap(),
        )];
        for key in ["performative", "rounds", "durationMs"] {
            if let Some(id) = document.field(data, key) {
                let include = if key == "performative" {
                    document.string(id).is_some()
                } else {
                    document.number(id).is_some()
                };
                if include {
                    fields.push((key.encode_utf16().collect(), id));
                }
            }
        }
        let stub = document.nodes.len();
        document.nodes.push(JsonValue::Object(fields));
        document.set_field(entry, "data", stub);
    }
    Some(document.stringify())
}
pub fn persist_sub_agent_histories(
    db: &Connection,
    session: &str,
    message: &str,
    input: Option<&str>,
) -> Result<(), String> {
    persist_sub_agent_histories_with_clock(db, session, message, input, &default_clock())
}
pub fn persist_sub_agent_histories_with_clock(
    db: &Connection,
    session: &str,
    message: &str,
    input: Option<&str>,
    clock: &Clock,
) -> Result<(), String> {
    let payloads = extract_sub_agent_payloads(input);
    if payloads.is_empty() {
        return Ok(());
    }
    let created_at = iso(clock())?;
    for payload in payloads {
        let content = payload
            .content
            .as_ref()
            .filter(|s| !s.0.is_empty())
            .map(quoted);
        let performative = payload
            .performative
            .as_ref()
            .map(|s| SqliteUtf16Text::new(&s.0));
        let segments = payload.segments.as_ref().map(JsonFragment::to_json);
        let calls = payload.tool_calls.as_ref().map(JsonFragment::to_json);
        // Every value is bound. A bad row is non-fatal and does not skip later rows.
        let _=db.execute("INSERT INTO sub_agent_history(sub_agent_id,session_id,message_id,content,performative,rounds,duration_ms,segments,tool_calls,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(sub_agent_id) DO UPDATE SET session_id=excluded.session_id,message_id=excluded.message_id,content=excluded.content,performative=excluded.performative,rounds=excluded.rounds,duration_ms=excluded.duration_ms,segments=excluded.segments,tool_calls=excluded.tool_calls",params![SqliteUtf16Text::new(&payload.sub_agent_id.0),session,message,content,performative,payload.rounds,payload.duration_ms,segments,calls,created_at]);
    }
    Ok(())
}

// The reference Bun SQLite adapter binds 16-bit JS text using SQLite's UTF-16
// path. Preserve the resulting database bytes (including its legacy malformed-
// surrogate behavior) instead of normalizing them through Rust's replacement
// decoder. This is restricted to raw string columns; JSON remains lossless.
struct SqliteUtf16Text(Vec<u8>);
impl SqliteUtf16Text {
    fn new(units: &[u16]) -> Self {
        let swap = units.first() == Some(&0xfffe);
        let units = &units[usize::from(matches!(units.first(), Some(0xfeff | 0xfffe)))..];
        let units: Vec<_> = units
            .iter()
            .map(|u| if swap { u.swap_bytes() } else { *u })
            .collect();
        let mut bytes = Vec::new();
        let mut i = 0;
        while i < units.len() {
            let mut code = u32::from(units[i]);
            i += 1;
            if (0xd800..0xe000).contains(&code) && i < units.len() {
                code = ((code & 0x3ff) << 10) + (u32::from(units[i]) & 0x3ff) + 0x10000;
                i += 1;
            }
            if code < 0x80 {
                bytes.push(code as u8)
            } else if code < 0x800 {
                bytes.extend([(0xc0 | (code >> 6)) as u8, (0x80 | (code & 0x3f)) as u8]);
            } else if code < 0x10000 {
                bytes.extend([
                    (0xe0 | (code >> 12)) as u8,
                    (0x80 | ((code >> 6) & 0x3f)) as u8,
                    (0x80 | (code & 0x3f)) as u8,
                ]);
            } else {
                bytes.extend([
                    (0xf0 | (code >> 18)) as u8,
                    (0x80 | ((code >> 12) & 0x3f)) as u8,
                    (0x80 | ((code >> 6) & 0x3f)) as u8,
                    (0x80 | (code & 0x3f)) as u8,
                ]);
            }
        }
        Self(bytes)
    }
}
impl rusqlite::types::ToSql for SqliteUtf16Text {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        Ok(rusqlite::types::ToSqlOutput::Borrowed(
            rusqlite::types::ValueRef::Text(&self.0),
        ))
    }
}
