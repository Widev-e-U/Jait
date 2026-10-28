//! Per-connection Realtime relay state. One session owner calls these methods
//! sequentially; effects are applied in order by an authenticated WS host.
pub mod background;
pub mod builtins;
pub mod config;
pub mod delegation;
pub mod relay;
pub mod tools;
use serde_json::{Value, json};
use std::collections::{BTreeSet, VecDeque};
#[derive(Debug, PartialEq)]
pub enum Effect {
    Provider(Value),
    Client(Value),
    Tool {
        call_id: String,
        name: String,
        arguments: Value,
    },
    Close {
        code: u16,
        reason: &'static str,
    },
}
#[derive(Default)]
pub struct RealtimeSession {
    ready: bool,
    response_in_progress: bool,
    pending_tool_response: bool,
    suppress_audio: bool,
    closed: bool,
    announcements: VecDeque<String>,
    calls: BTreeSet<String>,
}
impl RealtimeSession {
    pub fn opened(&mut self, session_update: Value) -> Vec<Effect> {
        if self.closed || self.ready {
            return vec![];
        }
        self.ready = true;
        vec![
            Effect::Provider(session_update),
            Effect::Client(json!({"type":"session.started"})),
            status("listening"),
        ]
    }
    pub fn client(&mut self, event: &Value) -> Result<Vec<Effect>, String> {
        if !self.ready || self.closed {
            return Ok(vec![]);
        }
        let mut effects = vec![];
        match kind(event) {
            "audio" => {
                let audio = event
                    .get("data")
                    .and_then(Value::as_str)
                    .ok_or("Invalid audio")?;
                if audio.len() > 512 * 1024 {
                    return Err("Audio frame too large".into());
                }
                effects.push(Effect::Provider(
                    json!({"type":"input_audio_buffer.append","audio":audio}),
                ));
            }
            "commit" => effects.push(Effect::Provider(
                json!({"type":"input_audio_buffer.commit"}),
            )),
            "interrupt" => {
                if self.response_in_progress {
                    self.suppress_audio = true;
                    self.response_in_progress = false;
                    effects.push(Effect::Provider(json!({"type":"response.cancel"})));
                    effects.push(Effect::Client(json!({"type":"audio.interrupt"})));
                }
                effects.push(status("listening"));
            }
            "announce" => {
                let text = event
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                if !text.is_empty() {
                    if text.len() > 8192 || self.announcements.len() >= 32 {
                        return Err("Announcement capacity reached".into());
                    }
                    self.announcements.push_back(text.into());
                    self.flush(&mut effects);
                }
            }
            "stop" => {
                effects.push(Effect::Provider(json!({"type":"input_audio_buffer.clear"})));
                effects.extend(self.close("User ended session"));
            }
            _ => {}
        }
        Ok(effects)
    }
    pub fn provider(&mut self, event: &Value) -> Result<Vec<Effect>, String> {
        if self.closed {
            return Ok(vec![]);
        }
        if event.to_string().len() > 1024 * 1024 {
            return Err("Provider frame too large".into());
        }
        let mut effects = vec![];
        match kind(event) {
            "response.audio.delta" | "response.output_audio.delta" => {
                self.response_in_progress = true;
                if !self.suppress_audio {
                    effects.push(Effect::Client(
                        json!({"type":"audio","data":event.get("delta")}),
                    ));
                    effects.push(status("speaking"));
                }
            }
            "response.audio.done" | "response.output_audio.done" => {
                self.response_in_progress = false;
                self.suppress_audio = false;
                effects.push(Effect::Client(json!({"type":"audio.done"})));
                effects.push(status("listening"));
            }
            "conversation.item.input_audio_transcription.completed" => effects.push(transcript(
                "user",
                &crate::voice::normalize_transcript(
                    event
                        .get("transcript")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                ),
                true,
            )),
            "response.audio_transcript.delta" | "response.output_audio_transcript.delta" => effects
                .push(transcript(
                    "assistant",
                    event.get("delta").and_then(Value::as_str).unwrap_or(""),
                    false,
                )),
            "response.audio_transcript.done" | "response.output_audio_transcript.done" => effects
                .push(transcript(
                    "assistant",
                    event
                        .get("transcript")
                        .and_then(Value::as_str)
                        .unwrap_or(""),
                    true,
                )),
            "response.function_call_arguments.done" => {
                let call_id = event
                    .get("call_id")
                    .and_then(Value::as_str)
                    .ok_or("Missing call id")?;
                let name = event
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or("Missing tool name")?;
                if call_id.len() > 512 || name.len() > 256 {
                    return Err("Tool identifier too long".into());
                }
                if self.calls.contains(call_id) {
                    return Ok(vec![]);
                }
                // An entire connection has a bounded deduplication window. Once
                // exhausted the host must end/reconnect; never repeat a side effect.
                if self.calls.len() >= 4096 {
                    return Err("Tool call capacity reached".into());
                }
                self.calls.insert(call_id.into());
                let arguments = event
                    .get("arguments")
                    .and_then(Value::as_str)
                    .and_then(|s| serde_json::from_str::<Value>(s).ok())
                    .filter(Value::is_object)
                    .unwrap_or_else(|| json!({}));
                effects.push(Effect::Client(
                    json!({"type":"tool_call","name":name,"status":"running"}),
                ));
                effects.push(status("thinking"));
                effects.push(Effect::Tool {
                    call_id: call_id.into(),
                    name: name.into(),
                    arguments,
                });
            }
            "error" => {
                let message = event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("OpenAI error");
                if !message.contains("no active response") {
                    effects.push(Effect::Client(json!({"type":"error","message":message})));
                }
            }
            "input_audio_buffer.speech_started" => {
                self.suppress_audio = true;
                if self.response_in_progress {
                    effects.push(Effect::Provider(json!({"type":"response.cancel"})));
                }
                self.response_in_progress = false;
                effects.push(Effect::Client(json!({"type":"audio.interrupt"})));
                effects.push(status("listening"));
            }
            "response.done" => {
                self.response_in_progress = false;
                self.suppress_audio = false;
                if self.pending_tool_response {
                    self.pending_tool_response = false;
                    effects.push(Effect::Provider(json!({"type":"response.create"})));
                } else if !self.announcements.is_empty() {
                    self.flush(&mut effects);
                } else {
                    effects.push(status("listening"));
                }
            }
            _ => {}
        }
        Ok(effects)
    }
    pub fn tool_completed(
        &mut self,
        call_id: &str,
        name: &str,
        result: &str,
    ) -> Result<Vec<Effect>, String> {
        if self.closed {
            return Ok(vec![]);
        }
        if !self.calls.contains(call_id) {
            return Err("Unknown voice tool call".into());
        }
        if result.len() > 256 * 1024 {
            return Err("Tool result too large".into());
        }
        if result == "__STOP_VOICE__" {
            let mut effects = vec![
                Effect::Client(
                    json!({"type":"tool_call","name":name,"status":"completed","result":"Ending session."}),
                ),
                status("disconnected"),
            ];
            effects.extend(self.close("Voice stopped by assistant"));
            return Ok(effects);
        }
        let mut effects = vec![
            Effect::Client(
                json!({"type":"tool_call","name":name,"status":"completed","result":result}),
            ),
            Effect::Provider(
                json!({"type":"conversation.item.create","item":{"type":"function_call_output","call_id":call_id,"output":result}}),
            ),
        ];
        if self.response_in_progress {
            self.pending_tool_response = true;
        } else {
            effects.push(Effect::Provider(json!({"type":"response.create"})));
        }
        Ok(effects)
    }
    fn flush(&mut self, effects: &mut Vec<Effect>) {
        if self.response_in_progress {
            return;
        }
        if let Some(text) = self.announcements.pop_front() {
            effects.push(Effect::Provider(json!({"type":"conversation.item.create","item":{"type":"message","role":"user","content":[{"type":"input_text","text":format!("System update. Speak this update to the user in one short sentence: {text}")}]}})));
            effects.push(Effect::Provider(json!({"type":"response.create"})));
        }
    }
    /// Host must cancel owned tool/background futures and close both sockets.
    pub fn close(&mut self, reason: &'static str) -> Vec<Effect> {
        if self.closed {
            return vec![];
        }
        self.closed = true;
        self.announcements.clear();
        vec![Effect::Close { code: 1000, reason }]
    }
}
fn kind(event: &Value) -> &str {
    event.get("type").and_then(Value::as_str).unwrap_or("")
}
fn status(status: &str) -> Effect {
    Effect::Client(json!({"type":"status","status":status}))
}
fn transcript(role: &str, text: &str, final_text: bool) -> Effect {
    Effect::Client(json!({"type":"transcript","role":role,"text":text,"final":final_text}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn interrupt_suppresses_late_audio_and_close_is_terminal() {
        let mut session = RealtimeSession::default();
        session.opened(json!({}));
        assert_eq!(
            session
                .provider(&json!({"type":"response.audio.delta","delta":"a"}))
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            session.client(&json!({"type":"interrupt"})).unwrap().len(),
            3
        );
        assert!(
            session
                .provider(&json!({"type":"response.audio.delta","delta":"b"}))
                .unwrap()
                .is_empty()
        );
        session.close("disconnect");
        assert!(
            session
                .client(&json!({"type":"audio","data":"a"}))
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn tool_calls_are_deduplicated_and_response_is_deferred() {
        let mut session = RealtimeSession::default();
        session.opened(json!({}));
        let call = json!({"type":"response.function_call_arguments.done","call_id":"1","name":"tool","arguments":"{}"});
        assert_eq!(session.provider(&call).unwrap().len(), 3);
        assert!(session.provider(&call).unwrap().is_empty());
        session
            .provider(&json!({"type":"response.audio.delta","delta":"a"}))
            .unwrap();
        assert_eq!(session.tool_completed("1", "tool", "ok").unwrap().len(), 2);
        assert_eq!(
            session.provider(&json!({"type":"response.done"})).unwrap(),
            vec![Effect::Provider(json!({"type":"response.create"}))]
        );
    }
}
