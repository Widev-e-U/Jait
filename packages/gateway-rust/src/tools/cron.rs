//! Cron tool presentation and scheduler dispatch. Scheduling and authorization
//! remain owned by the explicitly supplied scheduler service.
use crate::{
    contracts::bounded_json::Utf16Text,
    services::calendar::{js_text, truthy},
    text::js_trim,
    tools::list_preview::format_ellipsed_list,
};
use serde_json::{Value, json};

pub trait CronScheduler {
    /// Receives the exact service operation and argument list. Errors propagate.
    fn call(&self, operation: &str, args: Vec<Value>) -> Result<Value, String>;
}

pub struct CronContext<'a> {
    pub user_id: Option<&'a str>,
    pub project_root: &'a str,
}

pub fn metadata(operation: &str) -> Option<Value> {
    let (description, parameters) = match operation {
        "add" => (
            "Add a scheduled cron job",
            json!({"type":"object","properties":{
                "name":{"type":"string"},"cron":{"type":"string"},"toolName":{"type":"string"},
                "input":{"type":"object"},"sessionId":{"type":"string"},"projectRoot":{"type":"string"}
            },"required":["name","cron","toolName"]}),
        ),
        "list" => (
            "List configured cron jobs",
            json!({"type":"object","properties":{}}),
        ),
        "remove" => (
            "Remove a cron job by id",
            json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}),
        ),
        "update" => (
            "Update cron job fields",
            json!({"type":"object","properties":{
                "id":{"type":"string"},"name":{"type":"string"},"cron":{"type":"string"},
                "enabled":{"type":"boolean"},"input":{"type":"object"}
            },"required":["id"]}),
        ),
        _ => return None,
    };
    Some(
        json!({"name":format!("cron.{operation}"),"description":description,"tier":"standard",
        "category":"scheduler","source":"builtin","parameters":parameters}),
    )
}

fn string(value: &Value, fallback: &str) -> String {
    value.as_str().unwrap_or(fallback).to_owned()
}
fn nullish_default(value: &Value) -> Value {
    if value.is_null() {
        json!({})
    } else {
        value.clone()
    }
}

pub fn execute(
    scheduler: &impl CronScheduler,
    operation: &str,
    input: &Value,
    context: CronContext<'_>,
) -> Result<Value, String> {
    match operation {
        "add" => {
            let raw = string(&input["toolName"], "");
            let raw = js_trim(&raw);
            let tool_name = raw.replacen('_', ".", 1);
            let mut request = json!({
                "name":string(&input["name"],""),"cron":string(&input["cron"],""),
                "toolName":tool_name,"input":nullish_default(&input["input"]),
                "sessionId":string(&input["sessionId"],"default"),
                "projectRoot":string(&input["projectRoot"],context.project_root)
            });
            if let Some(user_id) = context.user_id {
                request["userId"] = json!(user_id);
            }
            let job = scheduler.call("create", vec![request])?;
            Ok(json!({"ok":true,"message":"Cron job created","data":job}))
        }
        "list" => {
            let jobs = scheduler.call("list", vec![json!(context.user_id)])?;
            let rows = jobs.as_array().ok_or("scheduler list must return jobs")?;
            let lines: Vec<_> = rows
                .iter()
                .map(|job| {
                    let field =
                        |name: &str| job.get(name).map(js_text).unwrap_or("undefined".into());
                    Utf16Text(
                        format!(
                            "• {} — \"{}\" → {}{}",
                            field("name"),
                            field("cron"),
                            field("toolName"),
                            if truthy(&job["enabled"]) {
                                ""
                            } else {
                                " [disabled]"
                            }
                        )
                        .encode_utf16()
                        .collect(),
                    )
                })
                .collect();
            let preview = format_ellipsed_list(&lines, Some(25.0));
            // List previews do not truncate individual strings or UTF-16 units.
            let preview = String::from_utf16(&preview.0).map_err(|_| "invalid scheduler string")?;
            let message = format!(
                "{} cron job(s){}",
                rows.len(),
                if rows.is_empty() {
                    ".".into()
                } else {
                    format!(":\n{preview}")
                }
            );
            Ok(json!({"ok":true,"message":message,"data":{"jobs":jobs}}))
        }
        "remove" => {
            let removed = scheduler.call(
                "remove",
                vec![json!(string(&input["id"], "")), json!(context.user_id)],
            )?;
            Ok(
                json!({"ok":removed,"message":if truthy(&removed) {"Cron job removed"} else {"Cron job not found"},"data":{"removed":removed}}),
            )
        }
        "update" => {
            let id = string(&input["id"], "");
            let mut patch = serde_json::Map::new();
            for name in ["name", "cron"] {
                if let Some(v @ Value::String(_)) = input.get(name) {
                    patch.insert(name.into(), v.clone());
                }
            }
            if let Some(v @ Value::Bool(_)) = input.get("enabled") {
                patch.insert("enabled".into(), v.clone());
            }
            if let Some(v) = input.get("input") {
                patch.insert("input".into(), v.clone());
            }
            let updated = scheduler.call(
                "update",
                vec![json!(id), Value::Object(patch), json!(context.user_id)],
            )?;
            let ok = truthy(&updated);
            Ok(
                json!({"ok":ok,"message":if ok {"Cron job updated"} else {"Cron job not found"},"data":if updated.is_null(){json!({"id":id})}else{updated}}),
            )
        }
        _ => Err("unknown cron operation".into()),
    }
}
