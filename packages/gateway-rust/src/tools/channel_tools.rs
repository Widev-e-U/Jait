//! Native port of `packages/gateway/src/tools/channel-tools.ts`.
//!
//! `channel.send` delivers text or a prompt into a chat conversation;
//! `channel.remind` schedules that delivery through the scheduler port. Both
//! resolve their target from explicit ids or from the `channel:<channel>:<chat>`
//! session the turn belongs to. Delivery and scheduling are owned by the host
//! ports — this adapter neither implements nor validates them.
use super::{
    core_io::HostError,
    core_jait::JaitPort,
    validate::{ToolInput, validate_tool_input},
};
use crate::services::calendar::js_text;
use chrono::{Datelike, Local, Timelike};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("channel-tools-metadata.json")).unwrap()
    });
    &DATA
}

/// Look up one tool definition inside the shared module metadata array.
fn definition(name: &str) -> &'static Value {
    static EMPTY: LazyLock<Value> = LazyLock::new(|| json!({}));
    metadata()
        .as_array()
        .and_then(|tools| tools.iter().find(|tool| tool["name"] == json!(name)))
        .unwrap_or(&EMPTY)
}

fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({"ok":true,"message":message.into(),"data":data})
}

/// `str()` in the TS module: non-strings read as empty, everything is trimmed.
fn str_of(value: &Value) -> String {
    js_text(value).trim().to_string()
}

struct Target {
    channel_id: String,
    conversation_id: String,
}

impl Target {
    fn data(&self) -> Value {
        json!({
            "channelId": self.channel_id,
            "conversationId": self.conversation_id,
        })
    }
}

/// Parse a `channel:<channelId>:<conversationId>` session key.
fn parse_channel_session_id(session_id: Option<&str>) -> Option<Target> {
    let rest = session_id?.strip_prefix("channel:")?;
    let split = rest.find(':')?;
    if split == 0 || split == rest.len() - 1 {
        return None;
    }
    Some(Target {
        channel_id: rest[..split].to_string(),
        conversation_id: rest[split + 1..].to_string(),
    })
}

fn resolve_target(input: &Value, context: &Value) -> Option<Target> {
    let channel_id = str_of(&input["channelId"]);
    let conversation_id = str_of(&input["conversationId"]);
    if !channel_id.is_empty() && !conversation_id.is_empty() {
        return Some(Target {
            channel_id,
            conversation_id,
        });
    }
    parse_channel_session_id(context["sessionId"].as_str())
}

/// Local wall-clock stamp with minute resolution.
#[derive(Clone, Copy)]
struct LocalStamp {
    year: i64,
    month: i64,
    day: i64,
    hour: i64,
    minute: i64,
}

impl LocalStamp {
    /// Monotonic ordinal used for the "is this in the past?" comparison.
    fn value(self) -> i64 {
        ((((self.year * 12 + self.month) * 31 + self.day) * 24 + self.hour) * 60) + self.minute
    }
}

fn digits(part: &str, len: usize) -> Option<i64> {
    if part.len() != len || !part.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    part.parse().ok()
}

/// `YYYY-MM-DDTHH:mm` (seconds optional, `T` or space) with no offset.
fn parse_local_stamp(value: &str) -> Option<LocalStamp> {
    let text = value.trim();
    let split = text.char_indices().find(|(_, c)| *c == 'T' || *c == ' ')?.0;
    let date = &text[..split];
    let time = &text[split + 1..];

    let mut date_parts = date.split('-');
    let year = digits(date_parts.next()?, 4)?;
    let month = digits(date_parts.next()?, 2)?;
    let day = digits(date_parts.next()?, 2)?;
    if date_parts.next().is_some() {
        return None;
    }

    let mut time_parts = time.split(':');
    let hour = digits(time_parts.next()?, 2)?;
    let minute = digits(time_parts.next()?, 2)?;
    if let Some(seconds) = time_parts.next() {
        digits(seconds, 2)?;
        if time_parts.next().is_some() {
            return None;
        }
    }

    Some(LocalStamp {
        year,
        month,
        day,
        hour,
        minute,
    })
}

/// Five-field cron that fires once, at the stamp's minute.
fn cron_for_local_stamp(stamp: LocalStamp) -> String {
    format!(
        "{} {} {} {} *",
        stamp.minute, stamp.hour, stamp.day, stamp.month
    )
}

/// The current minute in the gateway's local zone.
///
/// The TS module formats the current instant into the requested IANA zone via
/// `Intl.DateTimeFormat`. The crate carries no timezone database, so this reads
/// the host's local zone and ignores `time_zone` — documented approximation.
fn local_now() -> LocalStamp {
    let now = Local::now();
    LocalStamp {
        year: i64::from(now.year()),
        month: i64::from(now.month()),
        day: i64::from(now.day()),
        hour: i64::from(now.hour()),
        minute: i64::from(now.minute()),
    }
}

pub struct ChannelTools<C> {
    /// `deps.channels` — owns delivery policy for the connector.
    pub channels: JaitPort<C>,
    /// `deps.scheduler` — absent when the gateway has no scheduler.
    pub scheduler: Option<JaitPort<C>>,
    /// `deps.defaultTimeZone()`.
    pub default_time_zone: Arc<dyn Fn() -> String + Send + Sync>,
}

impl<C: Send + Sync> ChannelTools<C> {
    /// `channel.send`
    pub async fn send(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = {
            let mut validated = ToolInput::new(input);
            let validation =
                validate_tool_input(&definition("channel.send")["parameters"], &mut validated)
                    .expect("static channel send schema");
            if !validation.valid {
                return fail(format!(
                    "Input validation failed: {}",
                    validation
                        .errors
                        .iter()
                        .map(|s| String::from_utf16_lossy(&s.0))
                        .collect::<Vec<_>>()
                        .join("; ")
                ));
            }
            validated.value()
        };
        match self.send_inner(&input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(_)) => fail("Unable to send to channel."),
        }
    }

    async fn send_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let text = str_of(&input["text"]);
        let prompt = str_of(&input["prompt"]);
        if text.is_empty() && prompt.is_empty() {
            return Ok(fail("Nothing to send — give `text` or `prompt`."));
        }
        let Some(target) = resolve_target(input, context) else {
            return Ok(fail("No target chat — pass channelId and conversationId."));
        };

        let mut payload = serde_json::Map::new();
        payload.insert("channelId".into(), json!(target.channel_id));
        payload.insert("conversationId".into(), json!(target.conversation_id));
        if !text.is_empty() {
            payload.insert("text".into(), json!(text));
        }
        if !prompt.is_empty() {
            payload.insert("prompt".into(), json!(prompt));
        }
        match self
            .channels("deliver", vec![Value::Object(payload)], host)
            .await
        {
            Ok(_) => Ok(success(
                format!("Sent to {}", target.channel_id),
                target.data(),
            )),
            Err(HostError::Error(message)) => Ok(fail(format!("Delivery failed: {message}"))),
            Err(HostError::Thrown(_)) => Ok(fail("Delivery failed: non-Error thrown")),
        }
    }

    /// `channel.remind`
    pub async fn remind(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = {
            let mut validated = ToolInput::new(input);
            let validation =
                validate_tool_input(&definition("channel.remind")["parameters"], &mut validated)
                    .expect("static channel remind schema");
            if !validation.valid {
                return fail(format!(
                    "Input validation failed: {}",
                    validation
                        .errors
                        .iter()
                        .map(|s| String::from_utf16_lossy(&s.0))
                        .collect::<Vec<_>>()
                        .join("; ")
                ));
            }
            validated.value()
        };
        match self.remind_inner(&input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(_)) => fail("Unable to schedule reminder."),
        }
    }

    async fn remind_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let Some(scheduler) = self.scheduler.clone() else {
            return Ok(fail("The scheduler is not available on this gateway."));
        };
        let text = str_of(&input["text"]);
        let prompt = str_of(&input["prompt"]);
        if text.is_empty() && prompt.is_empty() {
            return Ok(fail("Nothing to deliver — give `text` or `prompt`."));
        }
        let Some(target) = resolve_target(input, context) else {
            return Ok(fail("No target chat — pass channelId and conversationId."));
        };

        let at = str_of(&input["at"]);
        let given_cron = str_of(&input["cron"]);
        if at.is_empty() && given_cron.is_empty() {
            return Ok(fail(
                "When? Give `at` for a one-off or `cron` for a routine.",
            ));
        }
        if !at.is_empty() && !given_cron.is_empty() {
            return Ok(fail("Give either `at` or `cron`, not both."));
        }

        let mut time_zone = str_of(&input["timeZone"]);
        if time_zone.is_empty() {
            time_zone = (self.default_time_zone)();
        }

        let mut once = false;
        let cron = if !at.is_empty() {
            let Some(stamp) = parse_local_stamp(&at) else {
                return Ok(fail(format!(
                    "Could not read \"{at}\" — use local \"YYYY-MM-DDTHH:mm\"."
                )));
            };
            if stamp.value() <= local_now().value() {
                return Ok(fail(format!(
                    "{at} is in the past for {time_zone} — pick a future time."
                )));
            }
            once = true;
            cron_for_local_stamp(stamp)
        } else {
            given_cron
        };

        let mut label = str_of(&input["name"]);
        if label.is_empty() {
            label = if !text.is_empty() {
                text.chars().take(60).collect()
            } else {
                prompt.chars().take(60).collect()
            };
        }
        if label.is_empty() {
            label = "Reminder".to_string();
        }

        let mut job_input = serde_json::Map::new();
        job_input.insert("channelId".into(), json!(target.channel_id));
        job_input.insert("conversationId".into(), json!(target.conversation_id));
        if !text.is_empty() {
            job_input.insert("text".into(), json!(text));
        }
        if !prompt.is_empty() {
            job_input.insert("prompt".into(), json!(prompt));
        }
        let mut job_meta = serde_json::Map::new();
        job_meta.insert("jobType".into(), json!("channel_reminder"));
        job_meta.insert("timeZone".into(), json!(time_zone));
        if once {
            job_meta.insert("once".into(), json!(true));
        }
        job_input.insert("__jaitJobMeta".into(), Value::Object(job_meta));

        let job = self
            .call(
                &scheduler,
                "create",
                vec![json!({
                    "userId": context["userId"],
                    "name": label,
                    "cron": cron,
                    "toolName": "channel.send",
                    "input": Value::Object(job_input),
                    // Runs as the chat's own session, so a delivery that needs the
                    // agent lands in the same conversation it was scheduled from.
                    "sessionId": format!("channel:{}:{}", target.channel_id, target.conversation_id),
                    "projectRoot": context["projectRoot"],
                })],
                host,
            )
            .await?;

        let message = if once {
            format!("Reminder set for {at} ({time_zone}).")
        } else {
            format!("Recurring reminder set ({cron}, {time_zone}).")
        };
        Ok(success(
            message,
            json!({
                "id": job["id"],
                "cron": cron,
                "once": once,
                "timeZone": time_zone,
                "channelId": target.channel_id,
                "conversationId": target.conversation_id,
            }),
        ))
    }

    async fn channels(&self, method: &str, args: Vec<Value>, host: &C) -> Result<Value, HostError> {
        self.call(&self.channels, method, args, host).await
    }

    async fn call(
        &self,
        port: &JaitPort<C>,
        method: &str,
        args: Vec<Value>,
        host: &C,
    ) -> Result<Value, HostError> {
        Ok((*port)(method, args, host).await?.unwrap_or(Value::Null))
    }
}
