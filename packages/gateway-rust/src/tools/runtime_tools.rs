//! Runtime tool adapters with explicit service/UI boundaries.
//! Authenticated execution context comes from the caller, never tool input.
use crate::{
    text::js_trim,
    time::{Clock, default_clock},
    tools::swarm_mailbox::{Messages, SwarmMailbox},
};
use serde::{Serialize, Serializer};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock, Mutex};
pub fn metadata() -> &'static Value {
    static DEFINITIONS: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("runtime-tools-metadata.json"))
            .expect("embedded runtime tools")
    });
    &DEFINITIONS
}
#[derive(Clone)]
pub enum MessageData {
    Messages(Messages),
    NoActiveRound,
}
impl Serialize for MessageData {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Messages(messages) => {
                json!({"messages":*messages.lock().unwrap()}).serialize(serializer)
            }
            Self::NoActiveRound => json!({"code":"no_active_swarm_round"}).serialize(serializer),
        }
    }
}
#[derive(Clone, Serialize)]
pub struct AgentMessageResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<MessageData>,
}
pub fn agent_message(
    input: &Value,
    round: Option<&str>,
    participant: Option<&str>,
    mailbox: &SwarmMailbox,
) -> Result<AgentMessageResult, String> {
    let Some(round) = round.filter(|s| !s.is_empty()) else {
        return Ok(AgentMessageResult{ok:false,message:"No active swarm round or mailbox. agent.message only works for specialists in the same concurrent swarm round. Use the available thread or team communication tool for other agents.".into(),data:Some(MessageData::NoActiveRound)});
    };
    let from = participant
        .map(js_trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("a specialist");
    let note = match input.get("note") {
        None | Some(Value::Null) => "",
        Some(Value::String(s)) => js_trim(s),
        _ => return Err("note.trim is not a function".into()),
    };
    let messages = if note.is_empty() {
        mailbox.peek(round)
    } else {
        mailbox.post(round, from, note)
    };
    let message = {
        let values = messages.lock().unwrap();
        (!values.is_empty()).then(|| {
            values
                .iter()
                .map(|m| format!("[{}] {}", m.from, m.content))
                .collect::<Vec<_>>()
                .join("\n")
        })
    };
    let (message, data) = if let Some(message) = message {
        (message, messages)
    } else {
        let count = mailbox.participant_count(round).saturating_sub(1);
        let message = if count > 0 {
            format!(
                "No messages yet from your {count} sibling specialist{}.",
                if count == 1 { "" } else { "s" }
            )
        } else {
            "No sibling specialists have posted anything yet.".into()
        };
        (message, Arc::new(Mutex::new(vec![])))
    };
    Ok(AgentMessageResult {
        ok: true,
        message,
        data: Some(MessageData::Messages(data)),
    })
}
pub type UiCommandSink<'a> = dyn FnMut(Value, &str) -> Result<(), String> + 'a;
pub fn project_editor_open(
    session: Option<&str>,
    project: Option<&str>,
    sink: Option<&mut UiCommandSink<'_>>,
) -> Result<Value, String> {
    let Some(session) = session.map(js_trim).filter(|s| !s.is_empty()) else {
        return Ok(
            json!({"ok":false,"message":"A session is required to open the project editor"}),
        );
    };
    let Some(project) = project.map(js_trim).filter(|s| !s.is_empty()) else {
        return Ok(
            json!({"ok":false,"message":"A project is required to open the project editor"}),
        );
    };
    let Some(sink) = sink else {
        return Ok(json!({"ok":false,"message":"The UI command channel is not available"}));
    };
    sink(
        json!({"command":"project.editor.open","data":{"projectRoot":project}}),
        session,
    )?;
    Ok(
        json!({"ok":true,"message":"Project editor opened intentionally","data":{"projectRoot":project}}),
    )
}
pub fn voice_speak(
    input: &Value,
    session: Option<&str>,
    speak: &mut dyn FnMut(Value) -> Result<Value, String>,
) -> Result<Value, String> {
    let Some(text) = input["text"]
        .as_str()
        .map(js_trim)
        .filter(|s| !s.is_empty())
    else {
        return Ok(json!({"ok":false,"message":"text is required"}));
    };
    let mut request = json!({"text":text});
    if let Some(session) = session {
        request["sessionId"] = json!(session);
    }
    let spoken = speak(request)?;
    let bytes = spoken["audioBase64"]
        .as_str()
        .ok_or("audioBase64 must be a string")?
        .encode_utf16()
        .count();
    let mut data = json!({"bytes":bytes});
    if let Some(mime) = spoken.get("mimeType") {
        data["mimeType"] = mime.clone();
    }
    Ok(json!({"ok":true,"message":"Spoken","data":data}))
}
pub trait StatusSources {
    fn active_session_count(&mut self) -> Result<usize, String>;
    fn surface_count(&mut self) -> Result<usize, String>;
    fn device_count(&mut self) -> Result<usize, String>;
    fn jobs(&mut self) -> Result<Option<Vec<Value>>, String>;
    fn hook_event_types(&mut self) -> Result<Option<Vec<String>>, String>;
    fn hook_listener_count(&mut self) -> Result<Option<usize>, String>;
}
pub fn gateway_status(
    sources: &mut dyn StatusSources,
    started_at: f64,
    clock: Option<Clock>,
) -> Result<Value, String> {
    let sessions = sources.active_session_count()?;
    let surfaces = sources.surface_count()?;
    let devices = sources.device_count()?;
    let jobs = sources.jobs()?.unwrap_or_default();
    let enabled_jobs = jobs
        .iter()
        .filter(|j| match &j["enabled"] {
            Value::Null => false,
            Value::Bool(b) => *b,
            Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
            Value::String(s) => !s.is_empty(),
            _ => true,
        })
        .count();
    let events = sources.hook_event_types()?.unwrap_or_default();
    let uptime = (((clock.unwrap_or_else(default_clock))() as f64 - started_at) / 1000.0).floor();
    let uptime = if uptime.is_finite() && uptime >= i64::MIN as f64 && uptime < i64::MAX as f64 {
        json!(uptime as i64)
    } else {
        json!(uptime)
    };
    let listeners = sources.hook_listener_count()?.unwrap_or(0);
    Ok(
        json!({"ok":true,"message":"Gateway status","data":{"healthy":true,"uptime":uptime,"sessions":sessions,"surfaces":surfaces,"devices":devices,
        "activeServices":["ws-control-plane","scheduler","consent-manager","hooks"],"scheduler":{"totalJobs":jobs.len(),"enabledJobs":enabled_jobs},
        "hooks":{"registeredEventTypes":events,"listeners":listeners}}}),
    )
}
