//! Materialized UI messages for the explicitly enabled native turn log.
//! Rebuilds bounded records atomically with append; never overwrites foreign history.
use super::chat_turn::TurnEvent;
use crate::routes::auth::{AuthState, Error};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

const EVENT_TYPE: &str = "rust.chat.message";
const MAX_EVENTS: usize = 512;
const MAX_BYTES: usize = 8 * 1024 * 1024;
fn prefix(session: &str) -> String {
    format!("rust-chat:{session}:")
}

pub(crate) fn require_native_history(db: &Connection, session: &str) -> Result<(), Error> {
    let prefix = prefix(session);
    let foreign: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM messages WHERE session_id=? AND substr(id,1,length(?))<>?)",
        params![session, prefix, prefix],
        |row| row.get(0),
    )?;
    if foreign {
        return Err("Existing non-native model history requires an explicit importer".into());
    }
    Ok(())
}
struct Projected {
    id: String,
    role: &'static str,
    content: String,
    thinking: String,
    calls: Vec<Value>,
    segments: Vec<Value>,
    created_at: String,
}
impl Projected {
    fn new(id: String, role: &'static str, created_at: String) -> Self {
        Self {
            id,
            role,
            created_at,
            content: String::new(),
            thinking: String::new(),
            calls: vec![],
            segments: vec![],
        }
    }
}
// Stream starts carry the resolved tool name and arguments; the model record
// only has the provider-facing name. Results must already be durable.
fn apply_tool_frame(calls: &mut [Value], value: &Value) -> Result<bool, Error> {
    match value["type"].as_str() {
        Some("tool_start") => {
            let id = value["call_id"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Invalid tool start")?;
            let tool = value["tool"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Invalid tool start")?;
            if !value["args"].is_object() {
                return Err("Invalid tool start".into());
            }
            let call = calls
                .iter_mut()
                .find(|call| call["callId"] == id)
                .ok_or("Tool start has no matching call")?;
            if call["status"] != "pending" {
                return Err("Tool start is not pending".into());
            }
            if call["args"] != value["args"] {
                return Err("Tool start arguments do not match model record".into());
            }
            call["tool"] = json!(tool);
            call["status"] = json!("running");
            call["args"] = value["args"].clone();
            Ok(true)
        }
        Some("tool_result") => {
            let id = value["call_id"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Invalid tool result")?;
            let call = calls
                .iter()
                .find(|call| call["callId"] == id)
                .ok_or("Tool result has no matching call")?;
            if !value["ok"].is_boolean()
                || !value["tool"].is_string()
                || !value["message"].is_string()
                || call["status"]
                    != json!(if value["ok"] == true {
                        "success"
                    } else {
                        "error"
                    })
                || call["tool"] != value["tool"]
                || call["ok"] != value["ok"]
                || call["message"] != value["message"]
                || call.get("data") != value.get("data")
            {
                return Err("Tool result does not match durable record".into());
            }
            Ok(false)
        }
        _ => Err("Invalid tool frame".into()),
    }
}
// Reconstruct provisional provider fragments without treating them as authority
// for a durable tool call. Slot mapping keeps parallel calls distinct.
fn apply_call_delta(
    calls: &mut Vec<Value>,
    segments: &mut Vec<Value>,
    slots: &mut std::collections::HashMap<u64, String>,
    value: &Value,
    started_at: i64,
) -> Result<(), Error> {
    let id = value["call_id"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 512)
        .ok_or("Invalid tool delta")?;
    let index = value["index"]
        .as_u64()
        .filter(|i| *i <= 9_007_199_254_740_991)
        .ok_or("Invalid tool delta")?;
    let fragment = |key: &str| -> Result<&str, Error> {
        match value.get(key) {
            None => Ok(""),
            Some(v) => v.as_str().ok_or_else(|| "Invalid tool delta".into()),
        }
    };
    let name = fragment("name_delta")?;
    let args = fragment("args_delta")?;
    let provisional = match value.get("provisional") {
        Some(v) => v.as_bool().ok_or("Invalid tool delta provisional flag")?,
        None => id.starts_with("pending-"),
    };
    if slots
        .iter()
        .any(|(slot, existing)| *slot != index && existing == id)
    {
        return Err("Tool delta ID belongs to another slot".into());
    }
    if let Some(old) = slots.get(&index) {
        let was_provisional = calls
            .iter()
            .find(|call| call["callId"].as_str() == Some(old.as_str()))
            .and_then(|call| call["provisional"].as_bool())
            .unwrap_or_else(|| old.starts_with("pending-"));
        if old != id && !(was_provisional && !provisional) {
            return Err("Tool delta changed slot ID".into());
        }
        if old == id && !was_provisional && provisional {
            return Err("Tool delta reverted to provisional ID".into());
        }
    } else if calls.iter().any(|call| call["callId"] == id) {
        return Err("Duplicate tool delta ID".into());
    }
    if !provisional && let Some(old) = slots.get(&index).filter(|old| old.as_str() != id).cloned() {
        if calls.iter().any(|call| call["callId"] == id) {
            return Err("Duplicate tool delta ID".into());
        }
        let call = calls
            .iter_mut()
            .find(|call| call["callId"] == old)
            .ok_or("Missing provisional tool call")?;
        call["callId"] = json!(id);
        for segment in segments.iter_mut().filter(|s| s["type"] == "toolGroup") {
            if let Some(ids) = segment["callIds"].as_array_mut() {
                for item in ids {
                    if *item == old {
                        *item = json!(id);
                    }
                }
            }
        }
    }
    let pos = calls.iter().position(|call| call["callId"] == id);
    let call = if let Some(pos) = pos {
        &mut calls[pos]
    } else {
        if calls.len() >= 128 {
            return Err("Too many provisional tool calls".into());
        }
        if let Some(group) = segments
            .last_mut()
            .filter(|segment| segment["type"] == "toolGroup")
        {
            group["callIds"]
                .as_array_mut()
                .ok_or("Invalid tool group")?
                .push(json!(id));
        } else {
            segments.push(json!({"type":"toolGroup","callIds":[id]}));
        }
        calls.push(json!({"callId":id,"tool":"","args":{},"status":"pending","streamingArgs":"","streamIndex":index,"startedAt":started_at}));
        calls.last_mut().unwrap()
    };
    if call["status"] != "pending" {
        return Err("Tool delta is not pending".into());
    }
    let mut current_name = call["tool"]
        .as_str()
        .ok_or("Invalid tool delta")?
        .to_owned();
    let mut current_args = call["streamingArgs"]
        .as_str()
        .ok_or("Invalid tool delta")?
        .to_owned();
    if current_name.len() + name.len() > 512 || current_args.len() + args.len() > 128 * 1024 {
        return Err("Tool delta exceeds limits".into());
    }
    current_name.push_str(name);
    current_args.push_str(args);
    call["tool"] = json!(current_name);
    call["streamingArgs"] = json!(current_args);
    call["provisional"] = json!(provisional);
    slots.insert(index, id.to_owned());
    Ok(())
}
fn next_stamp(now: i64, last: &mut Option<i64>) -> Result<String, Error> {
    let value = if let Some(previous) = *last {
        now.max(
            previous
                .checked_add(1)
                .ok_or("Message timestamp overflow")?,
        )
    } else {
        now
    };
    let stamp = chrono::DateTime::from_timestamp_millis(value)
        .ok_or("Invalid message timestamp")?
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    *last = Some(value);
    Ok(stamp)
}

/// Caller holds a transaction and has checked owner/active status. No independent commit.
pub(crate) fn project_log(db: &Connection, session: &str) -> Result<(), Error> {
    require_native_history(db, session)?;
    let mut projected: Vec<Projected> = vec![];
    let mut assistant: Option<usize> = None;
    let mut user_log: Option<i64> = None;
    let mut bytes = 0;
    let mut last_visible_stamp: Option<i64> = None;
    let mut statement=db.prepare("SELECT log_id,payload,created_at,length(CAST(payload AS BLOB)) FROM session_events WHERE session_id=? AND type=? ORDER BY log_id LIMIT ?")?;
    let mut records = statement.query(params![session, EVENT_TYPE, (MAX_EVENTS + 1) as i64])?;
    let mut count = 0;
    while let Some(record) = records.next()? {
        count += 1;
        let size: i64 = record.get(3)?;
        if !(0..=1024 * 1024).contains(&size) {
            return Err("Turn projection event exceeds limits".into());
        }
        bytes += size as usize;
        if count > MAX_EVENTS || bytes > MAX_BYTES {
            return Err("Turn projection history exceeds limits".into());
        }
        let log: i64 = record.get(0)?;
        let payload: String = record.get(1)?;
        let now: i64 = record.get(2)?;
        let value: Value = serde_json::from_str(&payload)?;
        if value["version"] != 1 {
            return Err("Unsupported turn projection version".into());
        }
        let event: TurnEvent = serde_json::from_value(value["event"].clone())?;
        match event {
            TurnEvent::User { content } => {
                user_log = Some(log);
                assistant = None;
                let mut row = Projected::new(
                    format!("{}{log}:user", prefix(session)),
                    "user",
                    next_stamp(now, &mut last_visible_stamp)?,
                );
                row.content = content;
                projected.push(row);
            }
            TurnEvent::Assistant {
                content,
                thinking,
                tool_calls,
            } => {
                let turn = user_log.ok_or("Assistant has no user turn")?;
                let index = if let Some(index) = assistant {
                    index
                } else {
                    projected.push(Projected::new(
                        format!("{}{turn}:assistant", prefix(session)),
                        "assistant",
                        next_stamp(now, &mut last_visible_stamp)?,
                    ));
                    let index = projected.len() - 1;
                    assistant = Some(index);
                    index
                };
                let row = &mut projected[index];
                row.content.push_str(&content);
                row.thinking.push_str(&thinking);
                if !thinking.is_empty() {
                    row.segments
                        .push(json!({"type":"thinking","content":thinking}));
                }
                if !content.is_empty() {
                    row.segments.push(json!({"type":"text","content":content}));
                }
                let mut ids = vec![];
                for call in tool_calls {
                    if row.calls.iter().any(|prior| prior["callId"] == call.id) {
                        return Err("Duplicate projected tool identifier".into());
                    }
                    let args = serde_json::from_str::<Value>(&call.function.arguments)
                        .ok()
                        .filter(Value::is_object)
                        .unwrap_or_else(|| json!({}));
                    ids.push(call.id.clone());
                    row.calls.push(json!({"callId":call.id,"tool":call.function.name,"args":args,"ok":false,"message":"Awaiting tool completion","status":"pending","startedAt":now}));
                }
                if !ids.is_empty() {
                    row.segments.push(json!({"type":"toolGroup","callIds":ids}));
                }
            }
            TurnEvent::Tool {
                tool_call_id,
                name,
                result,
            } => {
                let row = &mut projected[assistant.ok_or("Tool result has no assistant")?];
                let call = row
                    .calls
                    .iter_mut()
                    .find(|call| call["callId"] == tool_call_id)
                    .ok_or("Tool result has no matching call")?;
                if call["status"] != "pending" {
                    return Err("Duplicate projected tool result".into());
                }
                call["tool"] = json!(name);
                call["ok"] = json!(result.ok);
                call["message"] = json!(result.message);
                call["status"] = json!(if result.ok { "success" } else { "error" });
                call["completedAt"] = json!(now);
                if let Some(data) = result.data {
                    call["data"] = data;
                }
            }
        }
    }
    drop(records);
    drop(statement);
    // Once another user turn exists, its model record moves the live tail past
    // the previous turn. Preserve that turn's unmaterialized display frames.
    let session_prefix = prefix(session);
    let users: Vec<i64> = projected
        .iter()
        .filter(|row| row.role == "user")
        .filter_map(|row| {
            row.id
                .strip_prefix(session_prefix.as_str())?
                .strip_suffix(":user")?
                .parse()
                .ok()
        })
        .collect();
    let mut historical = Vec::new();
    let mut stream_count = 0usize;
    let mut stream_bytes = 0usize;
    for pair in users.windows(2) {
        let assistant_id = format!("{}{turn}:assistant", prefix(session), turn = pair[0]);
        let assistant_index = projected.iter().position(|row| row.id == assistant_id);
        let last_model: i64 = db.query_row("SELECT MAX(log_id) FROM session_events WHERE session_id=? AND type=? AND log_id>=? AND log_id<?", params![session, EVENT_TYPE, pair[0], pair[1]], |r| r.get(0))?;
        let mut stmt = db.prepare("SELECT payload,length(CAST(payload AS BLOB)),created_at FROM session_events WHERE session_id=? AND type='rust.chat.stream' AND log_id>? AND log_id<? ORDER BY log_id LIMIT 8193")?;
        let mut rows = stmt.query(params![session, last_model, pair[1]])?;
        let (mut content, mut thinking, mut segments) = (String::new(), String::new(), Vec::new());
        let mut calls = assistant_index
            .map(|index| projected[index].calls.clone())
            .unwrap_or_default();
        let mut calls_changed = false;
        let mut slots = std::collections::HashMap::new();
        while let Some(row) = rows.next()? {
            let size: i64 = row.get(1)?;
            if !(0..=65536).contains(&size) {
                return Err("Stream frame exceeds limits".into());
            }
            stream_count += 1;
            stream_bytes += size as usize;
            if stream_count > 8192 || stream_bytes > 16 * 1024 * 1024 {
                return Err("Stream history exceeds limits".into());
            }
            let frame: Value = serde_json::from_str(&row.get::<_, String>(0)?)?;
            match frame["type"].as_str() {
                Some(kind @ ("token" | "thinking")) => {
                    let text = frame["content"].as_str().ok_or("Invalid display frame")?;
                    if content.len() + thinking.len() + text.len() > 128 * 1024 {
                        return Err("Partial response exceeds limits".into());
                    }
                    if kind == "token" {
                        content.push_str(text);
                    } else {
                        thinking.push_str(text);
                    }
                    segments.push(json!({"type":if kind == "token" {"text"} else {"thinking"},"content":text}));
                }
                Some("error") => {
                    let message = frame["message"].as_str().ok_or("Invalid error frame")?;
                    let segment = json!({"type":"error","content":message});
                    if !segments.contains(&segment) {
                        segments.push(segment);
                    }
                }
                Some("tool_call_delta") => {
                    apply_call_delta(&mut calls, &mut segments, &mut slots, &frame, row.get(2)?)?;
                    calls_changed = true;
                }
                Some("tool_start" | "tool_result") => {
                    calls_changed |= apply_tool_frame(&mut calls, &frame)?;
                }
                Some("request" | "done") => {}
                _ => return Err("Unprojected stream frame".into()),
            }
        }
        if !segments.is_empty() || calls_changed {
            historical.push((pair[0], content, thinking, segments, calls));
        }
    }
    for (turn, content, thinking, segments, calls) in historical {
        let id = format!("{}{turn}:assistant", prefix(session));
        let index = if let Some(index) = projected.iter().position(|row| row.id == id) {
            index
        } else {
            let user = projected
                .iter()
                .position(|row| row.id == format!("{}{turn}:user", prefix(session)))
                .ok_or("Stream has no user turn")?;
            let created_at = projected[user].created_at.clone();
            projected.insert(user + 1, Projected::new(id, "assistant", created_at));
            user + 1
        };
        let row = &mut projected[index];
        row.content.push_str(&content);
        row.thinking.push_str(&thinking);
        row.calls = calls;
        for segment in segments {
            if segment["type"] != "error" || !row.segments.contains(&segment) {
                row.segments.push(segment);
            }
        }
    }
    // Synthetic assistants must sort between their user and the next turn,
    // including when original events share the same millisecond.
    let mut last_stamp = None;
    for row in &mut projected {
        let millis = chrono::DateTime::parse_from_rfc3339(&row.created_at)?.timestamp_millis();
        row.created_at = next_stamp(millis, &mut last_stamp)?;
    }
    let prefix = prefix(session);
    db.execute(
        "DELETE FROM messages WHERE session_id=? AND substr(id,1,length(?))=?",
        params![session, prefix, prefix],
    )?;
    for row in projected {
        db.execute("INSERT INTO messages(id,session_id,role,content,tool_calls,segments,thinking,created_at) VALUES(?,?,?,?,?,?,?,?)",params![row.id,session,row.role,row.content,if row.calls.is_empty(){None}else{Some(serde_json::to_string(&row.calls)?)},if row.segments.is_empty(){None}else{Some(serde_json::to_string(&row.segments)?)},if row.thinking.is_empty(){None}else{Some(row.thinking)},row.created_at])?;
    }
    Ok(())
}

/// (model cursor, frame cursor, frames, segments) reconstructed from the event log.
type StreamTail = (String, String, Vec<Value>, Option<Vec<Value>>);

// Reconstruct displayable frames after the last durable model record. The
// transaction pins both this tail and the returned cursor to the same snapshot.
fn stream_tail(db: &Connection, session: &str) -> Result<StreamTail, Error> {
    let last_model: i64 = db.query_row(
        "SELECT COALESCE(MAX(log_id),0) FROM session_events WHERE session_id=? AND type=?",
        params![session, EVENT_TYPE],
        |r| r.get(0),
    )?;
    let mut statement = db.prepare("SELECT payload,length(CAST(payload AS BLOB)) FROM session_events WHERE session_id=? AND type='rust.chat.stream' ORDER BY log_id LIMIT 8193")?;
    let mut rows = statement.query([session])?;
    let mut count = 0usize;
    let mut bytes = 0usize;
    while let Some(row) = rows.next()? {
        count += 1;
        let size: i64 = row.get(1)?;
        if !(0..=65536).contains(&size) {
            return Err("Stream frame exceeds limits".into());
        }
        bytes += size as usize;
        if count > 8192 || bytes > 16 * 1024 * 1024 {
            return Err("Stream history exceeds limits".into());
        }
        let value: Value = serde_json::from_str(&row.get::<_, String>(0)?)?;
        match value["type"].as_str() {
            Some(_) => {}
            None => return Err("Invalid stream frame".into()),
        }
    }
    drop(rows);
    drop(statement);
    let mut statement = db.prepare("SELECT payload,created_at FROM session_events WHERE session_id=? AND type='rust.chat.stream' AND log_id>? ORDER BY log_id")?;
    let mut rows = statement.query(params![session, last_model])?;
    let (mut content, mut thinking, mut segments) = (String::new(), String::new(), Vec::new());
    let raw_calls: Option<String> = db.query_row("SELECT tool_calls FROM messages WHERE session_id=? AND role<>'tool' ORDER BY created_at DESC,id DESC LIMIT 1", [session], |r| r.get(0)).optional()?.flatten();
    let mut calls: Vec<Value> = match raw_calls {
        Some(raw) => serde_json::from_str(&raw)?,
        None => vec![],
    };
    let mut calls_changed = false;
    let mut slots = std::collections::HashMap::new();
    while let Some(row) = rows.next()? {
        let value: Value = serde_json::from_str(&row.get::<_, String>(0)?)?;
        match value["type"].as_str() {
            Some(kind @ ("token" | "thinking")) => {
                let text = value["content"].as_str().ok_or("Invalid display frame")?;
                if content.len() + thinking.len() + text.len() > 128 * 1024 {
                    return Err("Partial response exceeds limits".into());
                }
                if kind == "token" {
                    content.push_str(text);
                } else {
                    thinking.push_str(text);
                }
                segments.push(
                    json!({"type":if kind == "token" {"text"} else {"thinking"},"content":text}),
                );
            }
            Some("tool_call_delta") => {
                apply_call_delta(&mut calls, &mut segments, &mut slots, &value, row.get(1)?)?;
                calls_changed = true;
            }
            Some("tool_start" | "tool_result") => {
                calls_changed |= apply_tool_frame(&mut calls, &value)?;
            }
            Some("error") => {
                let message = value["message"].as_str().ok_or("Invalid error frame")?;
                let segment = json!({"type":"error","content":message});
                if !segments.contains(&segment) {
                    segments.push(segment);
                }
            }
            Some("request" | "done") => {}
            // Never advance past a frame whose UI effects we cannot reconstruct.
            _ => return Err("Unprojected stream frame".into()),
        }
    }
    Ok((content, thinking, segments, calls_changed.then_some(calls)))
}

pub async fn project_messages(
    auth: AuthState,
    owner: String,
    session: String,
    limit: Option<usize>,
    before: Option<String>,
) -> Result<Value, String> {
    let limit = limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err("Invalid message limit".into());
    }
    let before = before
        .map(|value| {
            if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err("Invalid message cursor".to_owned());
            }
            value
                .parse::<usize>()
                .map_err(|_| "Invalid message cursor".to_owned())
        })
        .transpose()?;
    auth.with_database(move|db|{
        let tx=db.unchecked_transaction()?;
        let active:Option<String>=tx.query_row("SELECT last_active_at FROM sessions WHERE id=? AND user_id=? AND status='active'",params![session,owner],|row|row.get(0)).optional()?;
        let active=active.ok_or("Active session is unavailable")?;
        let has_log:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM session_events WHERE session_id=? AND type=?)",params![session,EVENT_TYPE],|row|row.get(0))?;
        // Repair logs written before materialization existed; all writes are atomic.
        if has_log {project_log(&tx,&session)?;}
        let (partial_content, partial_thinking, partial_segments, partial_calls)=stream_tail(&tx,&session)?;
        let has_partial=!partial_segments.is_empty();
        let last_role:Option<String>=tx.query_row("SELECT role FROM messages WHERE session_id=? AND role<>'tool' ORDER BY created_at DESC,id DESC LIMIT 1",[&session],|row|row.get(0)).optional()?;
        let synthetic=has_partial && last_role.as_deref()!=Some("assistant");
        let total:i64=tx.query_row("SELECT count(*) FROM messages WHERE session_id=? AND role<>'tool'",[&session],|row|row.get(0))?;
        let total=usize::try_from(total).map_err(|_| "Invalid message count")? + usize::from(synthetic);
        let end=before.filter(|before|*before<total).unwrap_or(total);
        let start=end.saturating_sub(limit);
        let db_end=end.min(total-usize::from(synthetic));
        let db_start=start.min(db_end);
        let mut sizes=tx.prepare("SELECT length(CAST(content AS BLOB))+COALESCE(length(CAST(tool_calls AS BLOB)),0)+COALESCE(length(CAST(segments AS BLOB)),0)+COALESCE(length(CAST(thinking AS BLOB)),0) FROM messages WHERE session_id=? AND role<>'tool' ORDER BY created_at,id LIMIT ? OFFSET ?")?;
        let mut page_bytes=0usize;
        for size in sizes.query_map(params![session,(db_end-db_start) as i64,db_start as i64],|row|row.get::<_,i64>(0))? {
            let size=usize::try_from(size?).map_err(|_|"Invalid stored message length")?;
            page_bytes=page_bytes.checked_add(size).ok_or("Message size overflow")?;
            if page_bytes>MAX_BYTES{return Err("Message page exceeds output limits".into());}
        }
        drop(sizes);
        let mut statement=tx.prepare("SELECT role,content,tool_calls,segments,thinking FROM messages WHERE session_id=? AND role<>'tool' ORDER BY created_at,id LIMIT ? OFFSET ?")?;
        let messages=statement.query_map(params![session,(db_end-db_start) as i64,db_start as i64],|row|{
            let role:String=row.get(0)?;
            let mut value=json!({"role":role,"content":row.get::<_,String>(1)?});
            if role=="system"{value["systemNotice"]=json!(true);}
            for (index,key) in [(2,"toolCalls"),(3,"segments")] {
                if let Some(raw)=row.get::<_,Option<String>>(index)? && let Ok(data)=serde_json::from_str::<Value>(&raw){value[key]=data;}
            }
            if let Some(thinking)=row.get::<_,Option<String>>(4)?.filter(|v|!v.is_empty()){value["thinking"]=json!(thinking);}
            Ok(value)
        })?.collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);
        let mut messages:Vec<Value>=messages.into_iter().enumerate().map(|(offset,mut value)|{value["id"]=json!(format!("{session}-{}",db_start+offset));value}).collect();
        if has_partial && end == total {
            if synthetic { messages.push(json!({"id":format!("{session}-{}",total-1),"role":"assistant","content":""})); }
            if let Some(last)=messages.last_mut() {
                let existing=last["content"].as_str().unwrap_or("").to_owned();
                last["content"]=json!(existing+&partial_content);
                let existing=last["thinking"].as_str().unwrap_or("").to_owned();
                if !existing.is_empty() || !partial_thinking.is_empty() { last["thinking"]=json!(existing+&partial_thinking); }
                if !last["segments"].is_array() { last["segments"]=json!([]); }
                let existing_segments=last["segments"].as_array_mut().unwrap();
                for segment in partial_segments {
                    if segment["type"] != "error" || !existing_segments.contains(&segment) { existing_segments.push(segment); }
                }
            }
        }
        if end == total && let Some(calls) = partial_calls {
            let last = messages.last_mut().ok_or("Tool start has no assistant message")?;
            if last["role"] != "assistant" { return Err("Tool start has no assistant message".into()); }
            last["toolCalls"] = json!(calls);
        }
        let seq:i64=tx.query_row("SELECT COALESCE(MAX(log_id),0) FROM session_events WHERE session_id=?",[&session],|row|row.get(0))?;
        tx.commit()?;
        // Only the runtime route can establish live ownership; persisted frames cannot.
        let result=json!({"sessionId":session,"streaming":false,"seq":seq,"lastActiveAt":active,"total":total,"hasMore":start>0,"limit":limit,"messages":messages});
        if serde_json::to_writer(JsonBudget(0),&result).is_err(){return Err("Serialized message page exceeds output limits".into());}
        Ok(result)
    }).await.map_err(|_|"Messages could not be loaded".into())
}

struct JsonBudget(usize);
impl std::io::Write for JsonBudget {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_BYTES.saturating_sub(self.0) {
            return Err(std::io::Error::other("message byte budget exceeded"));
        }
        self.0 += bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        providers::openai_stream::{OpenAiFunction, OpenAiToolCall},
        runtime::{chat_store::SqliteTurnStore, chat_turn::TurnPersistence},
        security::consent_executor::ToolResult,
    };
    fn setup() -> (AuthState, SqliteTurnStore) {
        let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
        db::migrate_database(&db).unwrap();
        db.execute("INSERT INTO sessions(id,user_id,created_at,last_active_at,status) VALUES('s','u','2026-10-21T00:00:00Z','2026-10-21T00:00:00Z','active')",[]).unwrap();
        let auth = AuthState::new(db, "fixture-secret".into()).unwrap();
        let store = SqliteTurnStore::new(auth.clone(), "u".into(), "s".into()).unwrap();
        (auth, store)
    }
    async fn page(auth: &AuthState, limit: usize, before: Option<&str>) -> Value {
        project_messages(
            auth.clone(),
            "u".into(),
            "s".into(),
            Some(limit),
            before.map(String::from),
        )
        .await
        .unwrap()
    }
    #[tokio::test]
    async fn native_events_materialize_compatible_rows_and_rebuild_idempotently() {
        let (auth, store) = setup();
        let call = OpenAiToolCall {
            id: "call".into(),
            kind: "function".into(),
            function: OpenAiFunction {
                name: "file_read".into(),
                arguments: r#"{"path":"owned"}"#.into(),
            },
        };
        for event in [
            TurnEvent::User {
                content: "Check".into(),
            },
            TurnEvent::Assistant {
                content: "Before".into(),
                thinking: "Think".into(),
                tool_calls: vec![call],
            },
            TurnEvent::Tool {
                tool_call_id: "call".into(),
                name: "file.read".into(),
                result: ToolResult {
                    ok: true,
                    message: "checked".into(),
                    data: Some(json!({"result":42})),
                },
            },
            TurnEvent::Assistant {
                content: "After".into(),
                thinking: String::new(),
                tool_calls: vec![],
            },
        ] {
            store.append(event).await.unwrap();
        }
        let result = page(&auth, 50, None).await;
        assert_eq!(result["total"], 2);
        assert_eq!(result["messages"][0]["role"], "user");
        let assistant = &result["messages"][1];
        assert_eq!(assistant["content"], "BeforeAfter");
        assert_eq!(assistant["thinking"], "Think");
        assert_eq!(assistant["toolCalls"][0]["status"], "success");
        assert_eq!(assistant["toolCalls"][0]["tool"], "file.read");
        assert_eq!(assistant["toolCalls"][0]["data"]["result"], 42);
        assert_eq!(
            assistant["segments"][2],
            json!({"type":"toolGroup","callIds":["call"]})
        );
        assert_eq!(page(&auth, 50, None).await, result);
        let rows = auth
            .with_database(|db| {
                Ok(db.query_row(
                    "SELECT count(*) FROM messages WHERE session_id='s'",
                    [],
                    |row| row.get::<_, i64>(0),
                )?)
            })
            .await
            .unwrap();
        assert_eq!(rows, 2);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn equal_clock_rows_keep_user_assistant_order_and_visible_pagination() {
        let (auth, _) = setup();
        auth.with_database(|db|{
            for (log,event) in [TurnEvent::User{content:"one".into()},TurnEvent::Assistant{content:"answer1".into(),thinking:String::new(),tool_calls:vec![]},TurnEvent::User{content:"two".into()},TurnEvent::Assistant{content:"answer2".into(),thinking:String::new(),tool_calls:vec![]}].into_iter().enumerate(){
                db.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('s',?,'rust.chat.message',?,0)",params![log as i64+1,json!({"version":1,"event":event}).to_string()])?;
            }Ok(())
        }).await.unwrap();
        let latest = page(&auth, 2, None).await;
        assert_eq!(latest["messages"][0]["id"], "s-2");
        assert_eq!(latest["messages"][0]["role"], "user");
        assert_eq!(latest["messages"][1]["role"], "assistant");
        assert_eq!(latest["hasMore"], true);
        let previous = page(&auth, 2, Some("2")).await;
        assert_eq!(previous["messages"][0]["content"], "one");
        assert_eq!(previous["messages"][1]["content"], "answer1");
        assert_eq!(previous["hasMore"], false);
        assert_eq!(page(&auth, 2, Some("0")).await["messages"], json!([]));
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn foreign_history_is_readable_but_never_silently_omitted_from_model_context() {
        let (auth, store) = setup();
        auth.with_database(|db|{db.execute("INSERT INTO messages(id,session_id,role,content,created_at) VALUES('legacy','s','user','old context','2026-10-21T00:00:00Z')",[])?;Ok(())}).await.unwrap();
        assert_eq!(
            page(&auth, 10, None).await["messages"][0]["content"],
            "old context"
        );
        assert!(store.load().await.is_err());
        assert!(
            store
                .append(TurnEvent::User {
                    content: "new".into()
                })
                .await
                .is_err()
        );
        assert_eq!(page(&auth, 10, None).await["total"], 1);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn projection_failure_rolls_back_event_and_activity_changes() {
        let (auth, store) = setup();
        assert!(
            store
                .append(TurnEvent::Tool {
                    tool_call_id: "orphan".into(),
                    name: "file.read".into(),
                    result: ToolResult::message(true, "must not persist")
                })
                .await
                .is_err()
        );
        assert!(store.load().await.unwrap().is_empty());
        assert_eq!(page(&auth, 10, None).await["total"], 0);
        let activity = auth
            .with_database(|db| {
                Ok(db.query_row(
                    "SELECT last_active_at FROM sessions WHERE id='s'",
                    [],
                    |row| row.get::<_, String>(0),
                )?)
            })
            .await
            .unwrap();
        assert_eq!(activity, "2026-10-21T00:00:00Z");
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn snapshot_includes_partial_frames_at_its_cursor_and_terminal_state() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "hello".into(),
            })
            .await
            .unwrap();
        store
            .append_stream_event(json!({"type":"thinking","content":"reason"}))
            .await
            .unwrap();
        store
            .append_stream_event(json!({"type":"token","content":"partial"}))
            .await
            .unwrap();
        let snapshot = page(&auth, 10, None).await;
        // An unfinished durable request alone cannot establish live authority.
        assert_eq!(snapshot["streaming"], false);
        assert_eq!(snapshot["messages"][1]["content"], "partial");
        assert_eq!(snapshot["messages"][1]["thinking"], "reason");
        assert_eq!(snapshot["seq"], 4);
        store
            .append(TurnEvent::Assistant {
                content: "partial".into(),
                thinking: "reason".into(),
                tool_calls: vec![],
            })
            .await
            .unwrap();
        store
            .append_stream_terminal(json!({"type":"done"}))
            .await
            .unwrap();
        let snapshot = page(&auth, 10, None).await;
        assert_eq!(snapshot["streaming"], false);
        assert_eq!(snapshot["messages"][1]["content"], "partial");
        assert_eq!(snapshot["seq"], 6);
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn restart_interruption_survives_later_turn_and_pagination() {
        let (auth, store) = setup();
        let first = store.with_turn();
        first
            .append(TurnEvent::User {
                content: "first".into(),
            })
            .await
            .unwrap();
        first
            .append_stream_event(json!({"type":"token","content":"partial"}))
            .await
            .unwrap();
        super::super::chat_store::reconcile_startup_owned(
            &auth,
            std::sync::Arc::new(
                std::fs::File::open(concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml")).unwrap(),
            ),
        )
        .await
        .unwrap();
        let snapshot = page(&auth, 10, None).await;
        assert_eq!(snapshot["messages"][1]["content"], "partial");
        assert_eq!(
            snapshot["messages"][1]["segments"],
            json!([{"type":"text","content":"partial"},{"type":"error","content":"Chat turn interrupted by gateway restart"}])
        );
        let seq = snapshot["seq"].as_i64().unwrap();
        let next = SqliteTurnStore::new(auth.clone(), "u".into(), "s".into())
            .unwrap()
            .with_turn();
        next.append(TurnEvent::User {
            content: "second".into(),
        })
        .await
        .unwrap();
        next.append_stream_terminal(json!({"type":"error","message":"ordinary failure"}))
            .await
            .unwrap();
        let latest = page(&auth, 2, None).await;
        assert!(latest["seq"].as_i64().unwrap() > seq);
        assert_eq!(latest["total"], 4);
        assert_eq!(latest["messages"][0]["content"], "second");
        assert_eq!(latest["messages"][1]["content"], "");
        assert_eq!(
            latest["messages"][1]["segments"],
            json!([{"type":"error","content":"ordinary failure"}])
        );
        let previous = page(&auth, 2, Some("2")).await;
        assert_eq!(previous["messages"][0]["content"], "first");
        assert_eq!(
            previous["messages"][1]["segments"],
            snapshot["messages"][1]["segments"]
        );
        assert_eq!(previous["seq"], latest["seq"]);
        assert_eq!(page(&auth, 2, Some("0")).await["messages"], json!([]));
        assert_eq!(page(&auth, 2, None).await, latest);
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn terminal_error_follows_durable_response_and_deduplicates_existing_segment() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "hello".into(),
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Assistant {
                content: "answer".into(),
                thinking: String::new(),
                tool_calls: vec![],
            })
            .await
            .unwrap();
        store
            .append_stream_terminal(json!({"type":"error","message":"failed"}))
            .await
            .unwrap();
        let snapshot = page(&auth, 10, None).await;
        assert_eq!(snapshot["messages"][1]["content"], "answer");
        assert_eq!(
            snapshot["messages"][1]["segments"],
            json!([{"type":"text","content":"answer"},{"type":"error","content":"failed"}])
        );
        auth.shutdown().await.unwrap();

        let (auth, _) = setup();
        auth.with_database(|db| {
            db.execute("INSERT INTO messages(id,session_id,role,content,segments,created_at) VALUES('legacy','s','assistant','','[{\"type\":\"error\",\"content\":\"failed\"}]','2026-10-21T00:00:00Z')", [])?;
            db.execute("INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES('s',1,'rust.chat.stream',?,0)", [json!({"type":"error","message":"failed"}).to_string()])?;
            Ok(())
        }).await.unwrap();
        assert_eq!(
            page(&auth, 10, None).await["messages"][0]["segments"],
            json!([{"type":"error","content":"failed"}])
        );
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn snapshot_recovers_parallel_provisional_tool_deltas() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "go".into(),
            })
            .await
            .unwrap();
        for frame in [
            json!({"type":"tool_call_delta","call_id":"pending-0","index":0,"name_delta":"file_","args_delta":"{\"p\":"}),
            json!({"type":"tool_call_delta","call_id":"pending-1","index":1,"name_delta":"other"}),
            json!({"type":"tool_call_delta","call_id":"real-a","index":0,"name_delta":"read","args_delta":"1}"}),
        ] {
            store.append_stream_event(frame).await.unwrap();
        }
        let snapshot = page(&auth, 10, None).await;
        let message = &snapshot["messages"][1];
        assert_eq!(message["toolCalls"][0]["callId"], "real-a");
        assert_eq!(message["toolCalls"][0]["tool"], "file_read");
        assert_eq!(message["toolCalls"][0]["streamingArgs"], "{\"p\":1}");
        assert_eq!(message["toolCalls"][1]["callId"], "pending-1");
        assert_eq!(
            message["segments"][0]["callIds"],
            json!(["real-a", "pending-1"])
        );
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn snapshot_recovers_durable_tool_start_and_result_at_cursor() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "check".into(),
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Assistant {
                content: String::new(),
                thinking: String::new(),
                tool_calls: vec![OpenAiToolCall {
                    id: "c".into(),
                    kind: "function".into(),
                    function: OpenAiFunction {
                        name: "file_read".into(),
                        arguments: r#"{"path":"a"}"#.into(),
                    },
                }],
            })
            .await
            .unwrap();
        store
            .append_stream_event(
                json!({"type":"tool_start","call_id":"c","tool":"file.read","args":{"path":"a"}}),
            )
            .await
            .unwrap();
        let snapshot = page(&auth, 10, None).await;
        let call = &snapshot["messages"][1]["toolCalls"][0];
        assert_eq!(call["status"], "running");
        assert_eq!(call["tool"], "file.read");
        assert_eq!(call["args"], json!({"path":"a"}));
        assert_eq!(
            snapshot["messages"][1]["segments"][0],
            json!({"type":"toolGroup","callIds":["c"]})
        );
        let start_seq = snapshot["seq"].as_i64().unwrap();
        store
            .append(TurnEvent::Tool {
                tool_call_id: "c".into(),
                name: "file.read".into(),
                result: ToolResult {
                    ok: true,
                    message: "read".into(),
                    data: Some(json!({"value":1})),
                },
            })
            .await
            .unwrap();
        store.append_stream_event(json!({"type":"tool_result","call_id":"c","tool":"file.read","ok":true,"message":"read","data":{"value":1}})).await.unwrap();
        let snapshot = page(&auth, 10, None).await;
        assert_eq!(snapshot["messages"][1]["toolCalls"][0]["status"], "success");
        assert_eq!(
            snapshot["messages"][1]["toolCalls"][0]["data"],
            json!({"value":1})
        );
        assert!(snapshot["seq"].as_i64().unwrap() > start_seq);
        assert_eq!(page(&auth, 10, None).await, snapshot);
        auth.shutdown().await.unwrap();
    }

    #[test]
    fn explicit_provisional_identity_distinguishes_pending_prefixed_ids() {
        let mut calls = vec![];
        let mut segments = vec![];
        let mut slots = std::collections::HashMap::new();
        apply_call_delta(
            &mut calls,
            &mut segments,
            &mut slots,
            &json!({"call_id":"pending-0","index":4,"provisional":true,"name_delta":"file_"}),
            1,
        )
        .unwrap();
        apply_call_delta(
            &mut calls,
            &mut segments,
            &mut slots,
            &json!({"call_id":"pending-3","index":4,"provisional":false,"name_delta":"read"}),
            1,
        )
        .unwrap();
        assert_eq!(calls[0]["callId"], "pending-3");
        assert_eq!(calls[0]["provisional"], false);
        assert_eq!(calls[0]["tool"], "file_read");
        assert_eq!(segments[0]["callIds"][0], "pending-3");
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"pending-3","index":4,"provisional":true}),
                1
            )
            .is_err()
        );
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"pending-3","index":4,"provisional":"false"}),
                1
            )
            .is_err()
        );
    }
    #[test]
    fn tool_deltas_reject_conflicting_slots_and_invalid_fragments() {
        let mut calls = vec![];
        let mut segments = vec![];
        let mut slots = std::collections::HashMap::new();
        apply_call_delta(
            &mut calls,
            &mut segments,
            &mut slots,
            &json!({"call_id":"pending-0","index":4,"name_delta":"a"}),
            1,
        )
        .unwrap();
        assert_eq!(calls[0]["streamIndex"], 4);
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"pending-0","index":7}),
                1
            )
            .is_err()
        );
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"pending-1","index":4}),
                1
            )
            .is_err()
        );
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"x","index":4,"args_delta":42}),
                1
            )
            .is_err()
        );
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"x","index":9007199254740992_u64}),
                1
            )
            .is_err()
        );
        apply_call_delta(
            &mut calls,
            &mut segments,
            &mut slots,
            &json!({"call_id":"real","index":4}),
            1,
        )
        .unwrap();
        assert!(
            apply_call_delta(
                &mut calls,
                &mut segments,
                &mut slots,
                &json!({"call_id":"other","index":4}),
                1
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn interrupted_provisional_calls_survive_later_turn_and_reprojection() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "first".into(),
            })
            .await
            .unwrap();
        store
            .append_stream_event(json!({"type":"token","content":"partial"}))
            .await
            .unwrap();
        store.append_stream_event(json!({"type":"tool_call_delta","call_id":"pending-0","index":0,"name_delta":"file_","args_delta":"{"})).await.unwrap();
        store.append_stream_event(json!({"type":"tool_call_delta","call_id":"pending-1","index":1,"name_delta":"other"})).await.unwrap();
        store.append_stream_event(json!({"type":"tool_call_delta","call_id":"real-a","index":0,"name_delta":"read","args_delta":"}"})).await.unwrap();
        store
            .append_stream_terminal(
                json!({"type":"error","message":"Chat turn interrupted by gateway restart"}),
            )
            .await
            .unwrap();
        let before = page(&auth, 10, None).await;
        store
            .append(TurnEvent::User {
                content: "second".into(),
            })
            .await
            .unwrap();
        let after = page(&auth, 10, None).await;
        assert_eq!(
            after["messages"][1]["toolCalls"],
            before["messages"][1]["toolCalls"]
        );
        assert_eq!(
            after["messages"][1]["segments"],
            before["messages"][1]["segments"]
        );
        assert_eq!(
            after["messages"][1]["segments"],
            json!([
                {"type":"text","content":"partial"},
                {"type":"toolGroup","callIds":["real-a","pending-1"]},
                {"type":"error","content":"Chat turn interrupted by gateway restart"}
            ])
        );
        assert_eq!(page(&auth, 10, None).await, after);
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn historical_tool_start_survives_later_turn_and_reprojection() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "first".into(),
            })
            .await
            .unwrap();
        let call = |id: &str| OpenAiToolCall {
            id: id.into(),
            kind: "function".into(),
            function: OpenAiFunction {
                name: "file_read".into(),
                arguments: format!(r#"{{"path":"{id}"}}"#),
            },
        };
        store
            .append(TurnEvent::Assistant {
                content: String::new(),
                thinking: String::new(),
                tool_calls: vec![call("a"), call("b")],
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Tool {
                tool_call_id: "a".into(),
                name: "file.read".into(),
                result: ToolResult {
                    ok: true,
                    message: "read".into(),
                    data: Some(json!({"value":1})),
                },
            })
            .await
            .unwrap();
        store.append_stream_event(json!({"type":"tool_result","call_id":"a","tool":"file.read","ok":true,"message":"read","data":{"value":1}})).await.unwrap();
        store
            .append_stream_event(
                json!({"type":"tool_start","call_id":"b","tool":"file.read","args":{"path":"b"}}),
            )
            .await
            .unwrap();
        store
            .append_stream_terminal(
                json!({"type":"error","message":"Chat turn interrupted by gateway restart"}),
            )
            .await
            .unwrap();
        let before = page(&auth, 10, None).await;
        store
            .append(TurnEvent::User {
                content: "second".into(),
            })
            .await
            .unwrap();
        let after = page(&auth, 10, None).await;
        let old = &after["messages"][1];
        assert_eq!(old["toolCalls"], before["messages"][1]["toolCalls"]);
        assert_eq!(old["toolCalls"][0]["status"], "success");
        assert_eq!(old["toolCalls"][0]["data"], json!({"value":1}));
        assert_eq!(old["toolCalls"][1]["status"], "running");
        assert_eq!(old["toolCalls"][1]["tool"], "file.read");
        assert_eq!(old["toolCalls"][1]["args"], json!({"path":"b"}));
        assert_eq!(
            old["segments"],
            json!([{"type":"toolGroup","callIds":["a","b"]},
            {"type":"error","content":"Chat turn interrupted by gateway restart"}])
        );
        assert_eq!(after["messages"][2]["content"], "second");
        assert_eq!(page(&auth, 10, None).await, after);
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn tool_start_cannot_replace_model_arguments() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "check".into(),
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Assistant {
                content: String::new(),
                thinking: String::new(),
                tool_calls: vec![OpenAiToolCall {
                    id: "a".into(),
                    kind: "function".into(),
                    function: OpenAiFunction {
                        name: "file_read".into(),
                        arguments: r#"{"path":"allowed"}"#.into(),
                    },
                }],
            })
            .await
            .unwrap();
        store.append_stream_event(json!({"type":"tool_start","call_id":"a","tool":"file.read","args":{"path":"different"}})).await.unwrap();
        assert!(
            project_messages(auth.clone(), "u".into(), "s".into(), None, None)
                .await
                .is_err()
        );
        assert!(
            store
                .append(TurnEvent::User {
                    content: "next".into()
                })
                .await
                .is_err()
        );
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn historical_result_must_match_durable_tool_record() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "first".into(),
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Assistant {
                content: String::new(),
                thinking: String::new(),
                tool_calls: vec![OpenAiToolCall {
                    id: "a".into(),
                    kind: "function".into(),
                    function: OpenAiFunction {
                        name: "file_read".into(),
                        arguments: "{}".into(),
                    },
                }],
            })
            .await
            .unwrap();
        store
            .append(TurnEvent::Tool {
                tool_call_id: "a".into(),
                name: "file.read".into(),
                result: ToolResult {
                    ok: true,
                    message: "read".into(),
                    data: None,
                },
            })
            .await
            .unwrap();
        store.append_stream_event(json!({"type":"tool_result","call_id":"a","tool":"file.read","ok":false,"message":"wrong"})).await.unwrap();
        assert!(
            store
                .append(TurnEvent::User {
                    content: "second".into()
                })
                .await
                .is_err()
        );
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn snapshot_rejects_unmatched_tool_frames() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "check".into(),
            })
            .await
            .unwrap();
        store
            .append_stream_event(
                json!({"type":"tool_start","call_id":"missing","tool":"file.read","args":{}}),
            )
            .await
            .unwrap();
        assert!(
            project_messages(auth.clone(), "u".into(), "s".into(), None, None)
                .await
                .is_err()
        );
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn owner_and_cursor_checks_precede_projection_effects() {
        let (auth, store) = setup();
        store
            .append(TurnEvent::User {
                content: "private".into(),
            })
            .await
            .unwrap();
        assert!(
            project_messages(auth.clone(), "other".into(), "s".into(), None, None)
                .await
                .is_err()
        );
        assert!(
            project_messages(auth.clone(), "u".into(), "s".into(), Some(0), None)
                .await
                .is_err()
        );
        assert!(
            project_messages(
                auth.clone(),
                "u".into(),
                "s".into(),
                None,
                Some("-1".into())
            )
            .await
            .is_err()
        );
        assert_eq!(page(&auth, 10, None).await["total"], 1);
        auth.shutdown().await.unwrap();
    }
    #[tokio::test]
    async fn foreign_message_byte_and_serialized_escape_limits_are_enforced() {
        let (auth, _) = setup();
        auth.with_database(|db|{db.execute("INSERT INTO messages(id,session_id,role,content,created_at) VALUES('large','s','user',CAST(zeroblob(?) AS TEXT),'2026-10-21T00:00:00Z')",[(MAX_BYTES+1) as i64])?;Ok(())}).await.unwrap();
        assert!(
            project_messages(auth.clone(), "u".into(), "s".into(), None, None)
                .await
                .is_err()
        );
        auth.with_database(|db| {
            db.execute(
                "UPDATE messages SET content=? WHERE id='large'",
                ["\0".repeat(1_500_000)],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(
            project_messages(auth.clone(), "u".into(), "s".into(), None, None)
                .await
                .is_err()
        );
        auth.shutdown().await.unwrap();
    }
}
