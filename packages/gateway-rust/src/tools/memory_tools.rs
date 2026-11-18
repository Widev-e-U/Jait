//! Memory/reminder presentation over explicit service ports. The caller retains
//! storage, privacy and user scope. Preview text keeps UTF-16 through transport.
use super::{
    core_io::{HostError, HostPort},
    list_preview::{memory_line, summarize_with_preview},
};
use crate::{
    contracts::bounded_json::Utf16Text,
    services::calendar::{js_text, truthy},
    time::Clock,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::LazyLock;
#[derive(Debug, Serialize)]
pub struct MemoryToolResult {
    pub ok: Value,
    pub message: Utf16Text,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}
fn output(ok: bool, message: impl Into<String>, data: Option<Value>) -> MemoryToolResult {
    MemoryToolResult {
        ok: json!(ok),
        message: Utf16Text::from(message.into()),
        data,
    }
}
fn fields(input: &Value, names: &[&str]) -> Value {
    let mut out = json!({});
    for key in names {
        if let Some(v) = input.get(*key) {
            out[*key] = v.clone();
        }
    }
    out
}
fn coalesce<'a>(input: &'a Value, key: &str, default: &'a Value) -> &'a Value {
    input.get(key).filter(|v| !v.is_null()).unwrap_or(default)
}
fn id(value: &Value) -> String {
    value.get("id").map(js_text).unwrap_or("undefined".into())
}
pub fn metadata(kind: &str) -> Option<&'static Value> {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("memory-tools-metadata.json"))
            .expect("memory definitions")
    });
    DATA.get(kind)
}
pub struct MemoryTool {
    port: HostPort<Value>,
    clock: Clock,
    reminders: bool,
    mark_retrieved: bool,
    kind: &'static str,
}
macro_rules! factory {
    ($name:ident,$kind:literal) => {
        pub fn $name(
            port: HostPort<Value>,
            clock: Clock,
            reminders: bool,
            mark_retrieved: bool,
        ) -> MemoryTool {
            MemoryTool {
                port,
                clock,
                reminders,
                mark_retrieved,
                kind: $kind,
            }
        }
    };
}
factory!(create_memory_save_tool, "save");
factory!(create_memory_search_tool, "search");
factory!(create_memory_forget_tool, "forget");
factory!(create_memory_hygiene_tool, "hygiene");
factory!(create_memory_review_chats_tool, "review");
factory!(create_memory_list_tool, "list");
factory!(create_memory_update_tool, "update");
impl MemoryTool {
    pub fn definition(&self) -> &'static Value {
        metadata(self.kind).expect("memory factory")
    }
    async fn call(&self, op: &str, args: Value, ctx: &Value) -> Result<Value, HostError> {
        (self.port)(op, &args, ctx).await
    }
    pub async fn execute(&self, input: &Value, ctx: &Value) -> Result<MemoryToolResult, HostError> {
        let user = fields(ctx, &["userId"]);
        match self.kind {
            "save" => {
                if input["kind"] == "reminder" {
                    if !self.reminders {
                        return Ok(output(false, "Reminder service not available.", None));
                    }
                    let mut args = fields(
                        input,
                        &["content", "sourceType", "sourceId", "sourceSurface", "tags"],
                    );
                    if let Some(v) = ctx.get("userId") {
                        args["userId"] = v.clone();
                    }
                    args["projectId"] = coalesce(input, "projectId", &Value::Null).clone();
                    if let Some(v) = input
                        .get("sessionId")
                        .filter(|v| !v.is_null())
                        .or_else(|| ctx.get("sessionId"))
                    {
                        args["sessionId"] = v.clone();
                    }
                    let row = self.call("reminders.create", args, ctx).await?;
                    return Ok(output(
                        true,
                        format!("Saved reminder {}", id(&row)),
                        Some(row),
                    ));
                }
                let mut args = fields(input, &["scope", "content"]);
                args["source"] = json!({});
                for (key, out) in [
                    ("sourceType", "type"),
                    ("sourceId", "id"),
                    ("sourceSurface", "surface"),
                ] {
                    if let Some(v) = input.get(key) {
                        args["source"][out] = v.clone();
                    }
                }
                if truthy(&input["ttlSeconds"]) {
                    let ttl = input["ttlSeconds"].as_f64().unwrap_or(f64::NAN);
                    let ms = (self.clock)() as f64 + ttl * 1000.0;
                    if !ms.is_finite() || ms.abs() > 8_640_000_000_000_000.0 {
                        return Err(HostError::Error("Invalid Date".into()));
                    }
                    args["expiresAt"] =
                        json!(crate::time::iso(ms.trunc() as i64).map_err(HostError::Error)?);
                }
                let row = self.call("memory.save", args, ctx).await?;
                Ok(output(
                    true,
                    format!("Saved memory {}", id(&row)),
                    Some(row),
                ))
            }
            "search" => {
                let mut args = fields(input, &["query", "scope"]);
                args["limit"] = coalesce(input, "limit", &json!(5)).clone();
                let memories = self.call("memory.search", args, ctx).await?;
                let reminders = if input["includeReminders"] == false || !self.reminders {
                    json!([])
                } else {
                    let mut args = fields(input, &["projectId"]);
                    if let Some(v) = ctx.get("userId") {
                        args["userId"] = v.clone();
                    }
                    args["status"] = json!("active");
                    args["limit"] = coalesce(input, "limit", &json!(5)).clone();
                    let result = self.call("reminders.list", args, ctx).await?;
                    if result.is_null() { json!([]) } else { result }
                };
                let memories_array = memories
                    .as_array()
                    .ok_or_else(|| HostError::Error("memory results must be an array".into()))?;
                let reminder_array = reminders
                    .as_array()
                    .ok_or_else(|| HostError::Error("reminder results must be an array".into()))?;
                if !reminder_array.is_empty() && self.mark_retrieved {
                    let mut args = user;
                    args["ids"] = json!(
                        reminder_array
                            .iter()
                            .map(|r| r.get("id").cloned().unwrap_or(Value::Null))
                            .collect::<Vec<_>>()
                    );
                    self.call("reminders.markRetrieved", args, ctx).await?;
                }
                let mut lines = vec![];
                for row in memories_array {
                    lines.push(line(row, row["source"]["type"].as_str(), None));
                }
                for row in reminder_array {
                    lines.push(line(row, Some("reminder"), None));
                }
                let summary = format!(
                    "Found {} memories and {} reminders:",
                    memories_array.len(),
                    reminder_array.len()
                );
                Ok(MemoryToolResult {
                    ok: json!(true),
                    message: summarize_with_preview(
                        &summary.encode_utf16().collect::<Vec<_>>(),
                        &lines,
                        None,
                    ),
                    data: Some(json!({"memories":memories,"reminders":reminders})),
                })
            }
            "forget" => {
                let reminder_only = input["kind"] == "reminder";
                let removed = if self.reminders {
                    let mut args = fields(input, &["id"]);
                    if let Some(v) = ctx.get("userId") {
                        args["userId"] = v.clone();
                    }
                    self.call("reminders.delete", args, ctx).await?
                } else {
                    json!(false)
                };
                let input_id = input.get("id").map(js_text).unwrap_or("undefined".into());
                if reminder_only || truthy(&removed) {
                    let mut out = output(
                        truthy(&removed),
                        if truthy(&removed) {
                            format!("Forgot reminder {input_id}")
                        } else {
                            format!("Reminder {input_id} not found")
                        },
                        None,
                    );
                    out.ok = if removed.is_null() {
                        json!(false)
                    } else {
                        removed
                    };
                    return Ok(out);
                }
                let removed = self
                    .call("memory.forget", fields(input, &["id"]), ctx)
                    .await?;
                let mut out = output(
                    truthy(&removed),
                    if truthy(&removed) {
                        format!("Forgot memory {input_id}")
                    } else {
                        format!("Memory {input_id} not found")
                    },
                    None,
                );
                out.ok = removed;
                Ok(out)
            }
            "hygiene" | "review" => {
                let mut args = user;
                if self.kind == "review" {
                    args["limit"] = coalesce(input, "limit", &json!(200)).clone();
                }
                let row = self
                    .call(
                        if self.kind == "review" {
                            "reminders.scanOldChatsForMemory"
                        } else {
                            "reminders.runHygiene"
                        },
                        args,
                        ctx,
                    )
                    .await?;
                let value = |key| row.get(key).map(js_text).unwrap_or("undefined".into());
                let message = if self.kind == "review" {
                    format!(
                        "Scanned {} chat messages and created {} memories",
                        value("scanned"),
                        value("created")
                    )
                } else {
                    format!(
                        "Archived {} stale memories and flagged {} possible conflicts",
                        value("archived"),
                        value("flagged")
                    )
                };
                Ok(output(true, message, Some(row)))
            }
            "list" => {
                if !self.reminders {
                    return Ok(output(false, "Memory page service not available.", None));
                }
                let mut args = fields(input, &["projectId", "sessionId"]);
                if let Some(v) = ctx.get("userId") {
                    args["userId"] = v.clone();
                }
                args["status"] = coalesce(input, "status", &json!("active")).clone();
                args["limit"] = coalesce(input, "limit", &json!(50)).clone();
                let rows = self.call("reminders.list", args, ctx).await?;
                let array = rows
                    .as_array()
                    .ok_or_else(|| HostError::Error("reminder results must be an array".into()))?;
                let lines = array
                    .iter()
                    .map(|row| {
                        line(
                            row,
                            Some("memory"),
                            row["status"]
                                .as_str()
                                .filter(|s| !s.is_empty() && *s != "active"),
                        )
                    })
                    .collect::<Vec<_>>();
                let summary = format!("Loaded {} memory entries:", array.len());
                Ok(MemoryToolResult {
                    ok: json!(true),
                    message: summarize_with_preview(
                        &summary.encode_utf16().collect::<Vec<_>>(),
                        &lines,
                        None,
                    ),
                    data: Some(json!({"memories":rows})),
                })
            }
            "update" => {
                if !self.reminders {
                    return Ok(output(false, "Memory page service not available.", None));
                }
                let mut args = fields(input, &["id"]);
                if let Some(v) = ctx.get("userId") {
                    args["userId"] = v.clone();
                }
                args["patch"] = fields(
                    input,
                    &["content", "status", "projectId", "sessionId", "tags"],
                );
                let updated = self.call("reminders.update", args, ctx).await?;
                let input_id = input.get("id").map(js_text).unwrap_or("undefined".into());
                Ok(output(
                    truthy(&updated),
                    if truthy(&updated) {
                        format!("Updated memory {input_id}")
                    } else {
                        format!("Memory {input_id} not found")
                    },
                    Some(updated),
                ))
            }
            _ => unreachable!(),
        }
    }
}
fn line(row: &Value, kind: Option<&str>, extra: Option<&str>) -> Utf16Text {
    memory_line(
        &id(row),
        &row["content"]
            .as_str()
            .unwrap_or("")
            .encode_utf16()
            .collect::<Vec<_>>(),
        kind,
        extra,
    )
}
