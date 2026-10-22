//! Core platform dispatcher. Caller-supplied service ports retain memory privacy,
//! ownership, scheduling and consent; this adapter discovers no host state.
use super::{
    core_io::HostError,
    list_preview::{memory_line, summarize_with_preview},
};
use crate::{
    contracts::bounded_json::Utf16Text,
    services::calendar::{js_text, truthy},
    time::{Clock, default_clock},
};
use futures_util::future::BoxFuture;
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
pub type JaitPort<C> = Arc<
    dyn for<'a> Fn(&'a str, Vec<Value>, &'a C) -> BoxFuture<'a, Result<Option<Value>, HostError>>
        + Send
        + Sync,
>;
#[derive(Clone)]
pub struct CoreJaitContext {
    pub user_id: Option<String>,
    pub session_id: String,
    pub action_id: String,
}
#[derive(Serialize)]
pub struct JaitResult {
    pub ok: bool,
    pub message: Utf16Text,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}
fn result(ok: bool, message: impl Into<Utf16Text>, data: Option<Value>) -> JaitResult {
    JaitResult {
        ok,
        message: message.into(),
        data,
    }
}
fn fail(s: impl Into<String>) -> JaitResult {
    result(false, s.into(), None)
}
fn text(v: Option<&Value>) -> String {
    v.map(js_text).unwrap_or_else(|| "undefined".into())
}
fn nv(v: Option<&Value>, default: Value) -> Value {
    v.filter(|v| !v.is_null()).cloned().unwrap_or(default)
}
fn fields(input: &Value, names: &[&str]) -> Value {
    let mut out = json!({});
    for name in names {
        if let Some(v) = input.get(*name) {
            out[*name] = v.clone();
        }
    }
    out
}
fn array(value: Option<Value>) -> Result<Vec<Value>, HostError> {
    value
        .and_then(|v| v.as_array().cloned())
        .ok_or_else(|| HostError::Error("Invalid platform service list".into()))
}
fn preview(summary: String, lines: Vec<Utf16Text>, max: Option<f64>) -> Utf16Text {
    summarize_with_preview(&summary.encode_utf16().collect::<Vec<_>>(), &lines, max)
}
fn memory_preview(
    row: &Value,
    kind: Option<&str>,
    extra: Option<&str>,
) -> Result<Utf16Text, HostError> {
    let content = row["content"]
        .as_str()
        .ok_or_else(|| HostError::Error("Invalid platform memory record".into()))?;
    Ok(memory_line(
        &text(row.get("id")),
        &content.encode_utf16().collect::<Vec<_>>(),
        kind,
        extra,
    ))
}
pub struct CoreJait<C> {
    pub memory: Option<JaitPort<C>>,
    pub reminders: Option<JaitPort<C>>,
    pub scheduler: Option<JaitPort<C>>,
    pub sessions: Option<JaitPort<C>>,
    pub surfaces: Option<JaitPort<C>>,
    pub hooks: Option<JaitPort<C>>,
    pub client_count: Option<Arc<dyn Fn() -> usize + Send + Sync>>,
    pub started_at: Option<f64>,
    pub clock: Clock,
    pub cwd: String,
}
impl<C> CoreJait<C> {
    pub fn new(cwd: String) -> Self {
        Self {
            memory: None,
            reminders: None,
            scheduler: None,
            sessions: None,
            surfaces: None,
            hooks: None,
            client_count: None,
            started_at: None,
            clock: default_clock(),
            cwd,
        }
    }
    pub async fn execute(&self, input: &Value, context: &CoreJaitContext, host: &C) -> JaitResult {
        match self.inner(input, context, host).await {
            Ok(v) => v,
            Err(HostError::Error(e)) => fail(e),
            Err(HostError::Thrown(_)) => fail("Jait tool failed"),
        }
    }
    async fn inner(
        &self,
        input: &Value,
        c: &CoreJaitContext,
        host: &C,
    ) -> Result<JaitResult, HostError> {
        let action = input["action"].as_str().unwrap_or("");
        let owner = json!(c.user_id);
        let mut source = json!({"type":nv(input.get("sourceType"),json!("agent")),"id":nv(input.get("sourceId"),json!(c.action_id)),"surface":"chat"});
        match action {
            "memory.save" | "reminder.save"
                if action == "reminder.save" || truthy(&input["asReminder"]) =>
            {
                let Some(port) = &self.reminders else {
                    return Ok(fail("Reminder service not available."));
                };
                if !truthy(&input["content"]) {
                    return Ok(fail(if action == "memory.save" {
                        "memory.save with asReminder requires `content`."
                    } else {
                        "reminder.save requires `content`."
                    }));
                }
                let mut args = json!({"projectId":nv(input.get("projectId"),Value::Null),"sessionId":nv(input.get("sessionId"),json!(c.session_id)),"content":input["content"],"sourceType":source["type"],"sourceId":source["id"],"sourceSurface":"chat"});
                if c.user_id.is_some() {
                    args["userId"] = owner;
                }
                if let Some(tags) = input.get("tags") {
                    args["tags"] = tags.clone();
                }
                let row = port("create", vec![args], host)
                    .await?
                    .unwrap_or(Value::Null);
                Ok(result(
                    true,
                    format!("Saved reminder {}", text(row.get("id"))),
                    Some(row),
                ))
            }
            "memory.save" => {
                let Some(port) = &self.memory else {
                    return Ok(fail("Memory service not available."));
                };
                if !truthy(&input["content"]) {
                    return Ok(fail("memory.save requires `content`."));
                }
                let mut args = json!({"scope":nv(input.get("scope"),json!("project")),"content":input["content"],"source":source.take()});
                if truthy(&input["ttlSeconds"]) {
                    let ms = (self.clock)() as f64
                        + input["ttlSeconds"].as_f64().unwrap_or(f64::NAN) * 1000.0;
                    if !ms.is_finite() || ms.trunc().abs() > 8_640_000_000_000_000.0 {
                        return Ok(fail("Invalid Date"));
                    }
                    args["expiresAt"] =
                        json!(crate::time::iso(ms.trunc() as i64).map_err(HostError::Error)?);
                }
                let entry = port("save", vec![args], host).await?.unwrap_or(Value::Null);
                Ok(result(
                    true,
                    format!("Saved memory {}", text(entry.get("id"))),
                    Some(fields(&entry, &["id", "scope"])),
                ))
            }
            "memory.search" => {
                let Some(port) = &self.memory else {
                    return Ok(fail("Memory service not available."));
                };
                if !truthy(&input["query"]) {
                    return Ok(fail("memory.search requires `query`."));
                }
                let memories = array(
                    port(
                        "search",
                        vec![
                            input["query"].clone(),
                            nv(input.get("limit"), json!(5)),
                            input["scope"].clone(),
                        ],
                        host,
                    )
                    .await?,
                )?;
                let reminders = if let Some(port) = &self.reminders {
                    let mut args =
                        json!({"status":"active","limit":nv(input.get("limit"),json!(5))});
                    if c.user_id.is_some() {
                        args["userId"] = owner;
                    }
                    array(port("list", vec![args], host).await?)?
                } else {
                    vec![]
                };
                let mut lines = vec![];
                for row in &memories {
                    lines.push(memory_preview(row, row["source"]["type"].as_str(), None)?);
                }
                for row in &reminders {
                    lines.push(memory_preview(row, Some("reminder"), None)?);
                }
                Ok(result(
                    true,
                    preview(
                        format!(
                            "Found {} memories and {} reminders:",
                            memories.len(),
                            reminders.len()
                        ),
                        lines,
                        None,
                    ),
                    Some(json!({"memories":memories,"reminders":reminders})),
                ))
            }
            "reminder.list" => {
                let Some(port) = &self.reminders else {
                    return Ok(fail("Reminder service not available."));
                };
                let mut args = json!({"status":if matches!(input["status"].as_str(),Some("archived"|"all")){input["status"].clone()}else{json!("active")},"limit":nv(input.get("limit"),json!(50))});
                if c.user_id.is_some() {
                    args["userId"] = owner;
                }
                for key in ["projectId", "sessionId"] {
                    if let Some(v) = input.get(key).filter(|v| !v.is_null()) {
                        args[key] = v.clone();
                    }
                }
                let reminders = array(port("list", vec![args], host).await?)?;
                let mut lines = vec![];
                for row in &reminders {
                    let extra = row["status"]
                        .as_str()
                        .filter(|s| !s.is_empty() && *s != "active");
                    lines.push(memory_preview(row, Some("reminder"), extra)?);
                }
                Ok(result(
                    true,
                    preview(
                        format!("Loaded {} reminders:", reminders.len()),
                        lines,
                        None,
                    ),
                    Some(json!({"reminders":reminders})),
                ))
            }
            "reminder.update" => {
                let Some(port) = &self.reminders else {
                    return Ok(fail("Reminder service not available."));
                };
                let id = nv(input.get("reminderId"), input["memoryId"].clone());
                if !truthy(&id) {
                    return Ok(fail("reminder.update requires `reminderId`."));
                }
                if input.get("status").is_some()
                    && !matches!(input["status"].as_str(), Some("active" | "archived"))
                {
                    return Ok(fail("reminder.update status must be active or archived."));
                }
                let row = port(
                    "update",
                    vec![
                        id.clone(),
                        fields(
                            input,
                            &["content", "projectId", "sessionId", "status", "tags"],
                        ),
                        owner,
                    ],
                    host,
                )
                .await?;
                let ok = row.as_ref().is_some_and(truthy);
                Ok(result(
                    ok,
                    if ok {
                        format!("Updated reminder {}", js_text(&id))
                    } else {
                        format!("Reminder {} not found", js_text(&id))
                    },
                    row,
                ))
            }
            "memory.forget" => {
                if let Some(port) = &self.reminders
                    && truthy(&input["memoryId"])
                    && port("delete", vec![input["memoryId"].clone(), owner], host)
                        .await?
                        .as_ref()
                        .is_some_and(truthy)
                {
                    return Ok(result(
                        true,
                        format!("Forgot reminder {}", text(input.get("memoryId"))),
                        None,
                    ));
                }
                let Some(port) = &self.memory else {
                    return Ok(fail("Memory service not available."));
                };
                if !truthy(&input["memoryId"]) {
                    return Ok(fail("memory.forget requires `memoryId`."));
                }
                let ok = port("forget", vec![input["memoryId"].clone()], host)
                    .await?
                    .as_ref()
                    .is_some_and(truthy);
                Ok(result(
                    ok,
                    if ok {
                        format!("Forgot memory {}", text(input.get("memoryId")))
                    } else {
                        format!("Memory {} not found", text(input.get("memoryId")))
                    },
                    None,
                ))
            }
            "reminder.forget" => {
                let Some(port) = &self.reminders else {
                    return Ok(fail("Reminder service not available."));
                };
                let id = nv(input.get("reminderId"), input["memoryId"].clone());
                if !truthy(&id) {
                    return Ok(fail("reminder.forget requires `reminderId`."));
                }
                let ok = port("delete", vec![id.clone(), owner], host)
                    .await?
                    .as_ref()
                    .is_some_and(truthy);
                Ok(result(
                    ok,
                    if ok {
                        format!("Forgot reminder {}", js_text(&id))
                    } else {
                        format!("Reminder {} not found", js_text(&id))
                    },
                    None,
                ))
            }
            "cron.add" => {
                let Some(port) = &self.scheduler else {
                    return Ok(fail("Scheduler not available."));
                };
                if !truthy(&input["name"]) || !truthy(&input["cron"]) || !truthy(&input["toolName"])
                {
                    return Ok(fail("cron.add requires `name`, `cron`, and `toolName`."));
                }
                let name = input["toolName"]
                    .as_str()
                    .ok_or_else(|| HostError::Error("Invalid scheduled tool name".into()))?;
                let normalized = if name.contains('_') && !name.contains('.') {
                    name.replacen('_', ".", 1)
                } else {
                    name.into()
                };
                let mut args = json!({"name":input["name"],"cron":input["cron"],"toolName":normalized,"input":nv(input.get("input"),json!({})),"sessionId":c.session_id,"projectRoot":self.cwd});
                if c.user_id.is_some() {
                    args["userId"] = owner;
                }
                Ok(result(
                    true,
                    "Cron job created",
                    port("create", vec![args], host).await?,
                ))
            }
            "cron.list" => {
                let Some(port) = &self.scheduler else {
                    return Ok(fail("Scheduler not available."));
                };
                let jobs = array(port("list", vec![owner], host).await?)?;
                let lines = jobs
                    .iter()
                    .map(|job| {
                        Utf16Text::from(format!(
                            "• {} — \"{}\" → {}{}",
                            js_text(&nv(job.get("name"), job["id"].clone())),
                            text(job.get("cron")),
                            text(job.get("toolName")),
                            if truthy(&job["enabled"]) {
                                ""
                            } else {
                                " (disabled)"
                            }
                        ))
                    })
                    .collect();
                Ok(result(
                    true,
                    preview(format!("{} cron job(s):", jobs.len()), lines, None),
                    Some(json!({"jobs":jobs})),
                ))
            }
            "cron.update" => {
                let Some(port) = &self.scheduler else {
                    return Ok(fail("Scheduler not available."));
                };
                if !truthy(&input["jobId"]) {
                    return Ok(fail("cron.update requires `jobId`."));
                }
                let row = port(
                    "update",
                    vec![
                        input["jobId"].clone(),
                        fields(input, &["name", "cron", "enabled", "input"]),
                        owner,
                    ],
                    host,
                )
                .await?;
                let ok = row.as_ref().is_some_and(truthy);
                let data = row
                    .filter(|v| !v.is_null())
                    .unwrap_or_else(|| json!({"id":input["jobId"]}));
                Ok(result(
                    ok,
                    if ok {
                        "Cron job updated"
                    } else {
                        "Cron job not found"
                    },
                    Some(data),
                ))
            }
            "cron.remove" => {
                let Some(port) = &self.scheduler else {
                    return Ok(fail("Scheduler not available."));
                };
                if !truthy(&input["jobId"]) {
                    return Ok(fail("cron.remove requires `jobId`."));
                }
                let ok = port("remove", vec![input["jobId"].clone(), owner], host)
                    .await?
                    .as_ref()
                    .is_some_and(truthy);
                Ok(result(
                    ok,
                    if ok {
                        "Cron job removed"
                    } else {
                        "Cron job not found"
                    },
                    None,
                ))
            }
            "status" => {
                let sessions = if let Some(port) = &self.sessions {
                    array(port("list", vec![json!("active")], host).await?)?.len()
                } else {
                    0
                };
                let surfaces = if let Some(port) = &self.surfaces {
                    array(port("listSurfaces", vec![], host).await?)?.len()
                } else {
                    0
                };
                let devices = self.client_count.as_ref().map(|f| f()).unwrap_or(0);
                let jobs = if let Some(port) = &self.scheduler {
                    array(port("list", vec![], host).await?)?
                } else {
                    vec![]
                };
                let enabled: Vec<_> = jobs.iter().filter(|job| truthy(&job["enabled"])).collect();
                let events = if let Some(port) = &self.hooks {
                    array(port("registeredEventTypes", vec![], host).await?)?
                } else {
                    vec![]
                };
                let summary = format!(
                    "Gateway status — {sessions} active session(s), {surfaces} surface(s), {devices} device(s), {}/{} cron job(s) enabled, {} hook event type(s).",
                    enabled.len(),
                    jobs.len(),
                    events.len()
                );
                let mut lines: Vec<_> = enabled
                    .iter()
                    .map(|job| {
                        Utf16Text::from(format!(
                            "• cron: {} — \"{}\" → {}",
                            js_text(&nv(job.get("name"), job["id"].clone())),
                            text(job.get("cron")),
                            text(job.get("toolName"))
                        ))
                    })
                    .collect();
                lines.extend(
                    events
                        .iter()
                        .map(|event| Utf16Text::from(format!("• hook event: {}", js_text(event)))),
                );
                let message = preview(summary, lines, Some(12.0));
                let now = (self.clock)() as f64;
                let started = self.started_at.unwrap_or_else(|| (self.clock)() as f64);
                let uptime = ((now - started) / 1000.0).floor();
                let listeners = if let Some(port) = &self.hooks {
                    port("listenerCount", vec![], host)
                        .await?
                        .unwrap_or(json!(0))
                } else {
                    json!(0)
                };
                let uptime = if uptime.is_finite() && uptime.abs() < (i64::MAX as f64) {
                    json!(uptime as i64)
                } else {
                    Value::Null
                };
                Ok(result(
                    true,
                    message,
                    Some(
                        json!({"healthy":true,"uptime":uptime,"sessions":sessions,"surfaces":surfaces,"devices":devices,"scheduler":{"totalJobs":jobs.len(),"enabledJobs":enabled.len()},"hooks":{"registeredEventTypes":events,"listeners":listeners}}),
                    ),
                ))
            }
            _ => Ok(fail(format!(
                "Unknown action: \"{}\". Valid actions: memory.save, memory.search, memory.forget, reminder.save, reminder.list, reminder.update, reminder.forget, cron.add, cron.list, cron.update, cron.remove, status.",
                text(input.get("action"))
            ))),
        }
    }
}
pub fn metadata() -> &'static Value {
    static META: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("core-jait-metadata.json"))
            .expect("embedded core Jait metadata")
    });
    &META
}
