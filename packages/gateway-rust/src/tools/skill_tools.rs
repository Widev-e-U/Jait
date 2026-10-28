//! Native port of `packages/gateway/src/tools/skill-tools.ts`.
//!
//! Two tools live here:
//!
//! * `skills.manage` — list / search / install / uninstall / enable / disable /
//!   create skills and install the tool a skill asks for.
//! * `extensions.manage` — list / sync / enable / disable / uninstall extensions
//!   and search ClawHub for installable packages.
//!
//! As in the TypeScript tool, the skill registry, the plugin manager and the
//! ClawHub client are *host dependencies* (`deps.skillRegistry`,
//! `deps.pluginRegistry`, `deps.clawhub`). This adapter therefore reaches them
//! through [`JaitPort`] calls and never touches the filesystem or the network
//! itself; the permission checks, cancellation and timeout semantics are the
//! host's.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use super::validate::{ToolInput, validate_tool_input};
use serde_json::{Value, json};
use std::sync::LazyLock;

/// Tool metadata for `skills.manage` and `extensions.manage`.
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("skill-tools-metadata.json"))
            .expect("skill-tools-metadata.json")
    });
    &DATA
}

/// The single-tool definition named `name`.
///
/// # Panics
/// Panics when `name` is not one of the tools in the metadata document.
pub fn definition(name: &str) -> &'static Value {
    metadata()
        .as_array()
        .expect("skill tool metadata array")
        .iter()
        .find(|entry| entry["name"] == name)
        .unwrap_or_else(|| panic!("unknown skill tool {name}"))
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

/// `String(value)` for the template literals the TS tool interpolates.
fn str_of(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn trimmed(value: &Value) -> String {
    str_of(value).trim().to_string()
}

fn bool_of(value: &Value) -> bool {
    value.as_bool().unwrap_or(false)
}

/// `Math.min(input.limit ?? default, max)`.
fn limit_of(value: &Value, default: f64, max: f64) -> f64 {
    value.as_f64().unwrap_or(default).min(max)
}

/// `formatEllipsedList(lines, max)` from `shared/...`: all lines, or the first
/// `max` followed by a `… and N more` tail.
fn format_ellipsed_list(lines: &[String], max_items: usize) -> String {
    if lines.len() <= max_items {
        return lines.join("\n");
    }
    format!(
        "{}\n… and {} more",
        lines[..max_items].join("\n"),
        lines.len() - max_items
    )
}

fn bullet(lines: &mut Vec<String>, line: String) {
    lines.push(line);
}

fn ok_or_fail(result: Result<Value, HostError>, fallback: &str) -> Value {
    match result {
        Ok(value) => value,
        Err(HostError::Error(message)) => fail(message),
        Err(HostError::Thrown(_)) => fail(fallback),
    }
}

/// Validated copy of `input`, or the failure result to return.
fn validated(tool: &str, input: &Value) -> Result<Value, Value> {
    let mut tool_input = ToolInput::new(input);
    let validation = validate_tool_input(&definition(tool)["parameters"], &mut tool_input)
        .expect("static tool schema");
    if validation.valid {
        Ok(tool_input.value())
    } else {
        Err(fail(format!(
            "Input validation failed: {}",
            validation
                .errors
                .iter()
                .map(|line| String::from_utf16_lossy(&line.0))
                .collect::<Vec<_>>()
                .join("; ")
        )))
    }
}

/// Skills registry + extension registry + optional ClawHub marketplace.
pub struct SkillTools<C> {
    /// `deps.skillRegistry`.
    pub skills: JaitPort<C>,
    /// `deps.pluginRegistry`.
    pub extensions: JaitPort<C>,
    /// `deps.clawhub`; `None` when the marketplace is not configured.
    pub clawhub: Option<JaitPort<C>>,
}

impl<C: Send + Sync> SkillTools<C> {
    async fn call(
        port: &JaitPort<C>,
        method: &str,
        args: Vec<Value>,
        host: &C,
    ) -> Result<Value, HostError> {
        Ok((*port)(method, args, host).await?.unwrap_or(Value::Null))
    }

    /// `skills.manage`.
    pub async fn skills_manage(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validated("skills.manage", input) {
            Ok(input) => input,
            Err(failure) => return failure,
        };
        ok_or_fail(
            self.skills_manage_inner(&input, context, host).await,
            "Skill tool failed.",
        )
    }

    async fn skills_manage_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let _ = context;
        let action = str_of(&input["action"]);

        match action.as_str() {
            "list" => {
                let listed = Self::call(&self.skills, "list", vec![], host).await?;
                let items = listed.as_array().cloned().unwrap_or_default();
                let mut skills: Vec<Value> = Vec::with_capacity(items.len());
                let mut lines: Vec<String> = Vec::new();
                let mut enabled = 0usize;
                for skill in &items {
                    let satisfied = skill["toolsSatisfied"].as_bool().unwrap_or(true);
                    let missing = skill["missingTools"]
                        .as_array()
                        .cloned()
                        .unwrap_or_default();
                    let is_enabled = bool_of(&skill["enabled"]);
                    if is_enabled {
                        enabled += 1;
                    }
                    let mut entry = json!({
                        "id": skill["id"],
                        "name": skill["name"],
                        "enabled": is_enabled,
                        "source": skill["source"],
                        "description": skill["description"],
                        "toolsSatisfied": satisfied,
                    });
                    if skill.get("requires").is_some_and(|value| !value.is_null()) {
                        entry["requires"] = skill["requires"].clone();
                    }
                    if !missing.is_empty() {
                        entry["missingTools"] = Value::Array(missing);
                    }
                    let mut line =
                        format!("• {} ({})", str_of(&skill["name"]), str_of(&skill["id"]));
                    if !is_enabled {
                        line.push_str(" [disabled]");
                    }
                    if !satisfied {
                        line.push_str(" [missing tools]");
                    }
                    let description = str_of(&skill["description"]);
                    if !description.is_empty() {
                        line.push_str(&format!(" — {}", description));
                    }
                    bullet(&mut lines, line);
                    skills.push(entry);
                }
                let mut message =
                    format!("{} skill(s) installed, {} enabled", skills.len(), enabled);
                if lines.is_empty() {
                    message.push('.');
                } else {
                    message.push_str(&format!(":\n{}", format_ellipsed_list(&lines, 25)));
                }
                Ok(success(message, json!({ "skills": skills })))
            }
            "search" => {
                let Some(clawhub) = &self.clawhub else {
                    return Ok(fail("ClawHub marketplace is not available."));
                };
                let query = trimmed(&input["query"]);
                if query.is_empty() {
                    return Ok(fail("A `query` is required for search."));
                }
                let installed = Self::call(&self.skills, "list", vec![], host).await?;
                let installed: Vec<String> = installed
                    .as_array()
                    .map(|items| items.iter().map(|entry| str_of(&entry["id"])).collect())
                    .unwrap_or_default();
                let limit = limit_of(&input["limit"], 25.0, 100.0);
                let results =
                    Self::call(clawhub, "search", vec![json!(query), json!(limit)], host).await?;
                let results = results.as_array().cloned().unwrap_or_default();
                let mut lines: Vec<String> = Vec::new();
                for result in &results {
                    let slug = str_of(&result["slug"]);
                    let mut line = format!("• {}", str_of(&result["name"]));
                    if installed.contains(&slug) {
                        line.push_str(" [installed]");
                    }
                    let summary = str_of(&result["summary"]);
                    if !summary.is_empty() {
                        line.push_str(&format!(" — {}", summary));
                    }
                    bullet(&mut lines, line);
                }
                let mut message = format!("Found {} skill(s) on ClawHub", results.len());
                if lines.is_empty() {
                    message.push('.');
                } else {
                    message.push_str(&format!(":\n{}", format_ellipsed_list(&lines, 25)));
                }
                Ok(success(message, json!({ "results": results })))
            }
            "install" => {
                let Some(clawhub) = &self.clawhub else {
                    return Ok(fail("ClawHub marketplace is not available."));
                };
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` (skill slug) is required."));
                }
                let skill = Self::call(
                    clawhub,
                    "install",
                    vec![json!(id), json!(str_of(&input["version"]))],
                    host,
                )
                .await?;
                Ok(success(
                    format!(
                        "Installed skill '{}'. Enable it to make it active.",
                        str_of(&skill["name"])
                    ),
                    json!({ "skill": skill }),
                ))
            }
            "uninstall" => {
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` (skill slug) is required."));
                }
                Self::call(&self.skills, "uninstall", vec![json!(id)], host).await?;
                Ok(success(format!("Uninstalled skill '{id}'."), Value::Null))
            }
            "enable" | "disable" => {
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` is required."));
                }
                let skill = Self::call(&self.skills, "get", vec![json!(id)], host).await?;
                if skill.is_null() {
                    return Ok(fail(format!("Skill '{id}' not found.")));
                }
                let enable = action == "enable";
                Self::call(
                    &self.skills,
                    "set_enabled",
                    vec![json!(id), json!(enable)],
                    host,
                )
                .await?;
                Ok(success(
                    format!(
                        "{} skill '{}'.",
                        if enable { "Enabled" } else { "Disabled" },
                        str_of(&skill["name"])
                    ),
                    Value::Null,
                ))
            }
            "create" => {
                let name = trimmed(&input["name"]);
                if name.is_empty() {
                    return Ok(fail("A `name` is required."));
                }
                let description = trimmed(&input["description"]);
                if description.is_empty() {
                    return Ok(fail(
                        "A `description` is required — it is how you find the skill later.",
                    ));
                }
                let body = str_of(&input["body"]);
                if body.trim().is_empty() {
                    return Ok(fail(
                        "A `body` is required — the instructions the skill teaches.",
                    ));
                }
                let written = Self::call(
                    &self.skills,
                    "write",
                    vec![json!({
                        "id": trimmed(&input["id"]),
                        "name": name,
                        "description": description,
                        "body": body,
                        "overwrite": bool_of(&input["overwrite"]),
                    })],
                    host,
                )
                .await?;
                Ok(success(
                    format!(
                        "{} skill '{}' — active from the next turn.",
                        if bool_of(&written["created"]) {
                            "Wrote"
                        } else {
                            "Replaced"
                        },
                        str_of(&written["id"])
                    ),
                    written,
                ))
            }
            "install_tool" => {
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` (skill id) is required."));
                }
                let skill = Self::call(&self.skills, "get", vec![json!(id)], host).await?;
                if skill.is_null() {
                    return Ok(fail(format!("Skill '{id}' not found.")));
                }
                let result = Self::call(
                    &self.skills,
                    "install_tool",
                    vec![json!({
                        "skill": skill,
                        "installId": str_of(&input["installId"]),
                    })],
                    host,
                )
                .await?;
                Ok(success(
                    format!(
                        "Installed tool '{}' for skill '{}'.",
                        str_of(&result["package"]),
                        str_of(&skill["name"])
                    ),
                    json!({ "package": result["package"], "output": result["output"] }),
                ))
            }
            other => Ok(fail(format!("Unknown action '{other}'."))),
        }
    }

    /// `extensions.manage`.
    pub async fn extensions_manage(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = match validated("extensions.manage", input) {
            Ok(input) => input,
            Err(failure) => return failure,
        };
        ok_or_fail(
            self.extensions_manage_inner(&input, context, host).await,
            "Extension tool failed.",
        )
    }

    async fn extensions_manage_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let _ = context;
        let action = str_of(&input["action"]);

        match action.as_str() {
            "list" | "sync" => {
                let method = if action == "list" { "list" } else { "sync" };
                let plugins = Self::call(&self.extensions, method, vec![], host).await?;
                let plugins = plugins.as_array().cloned().unwrap_or_default();
                let mut lines: Vec<String> = Vec::new();
                for plugin in &plugins {
                    let display = str_of(&plugin["displayName"]);
                    let display = if display.is_empty() {
                        str_of(&plugin["id"])
                    } else {
                        display
                    };
                    let mut line = format!("• {display}");
                    let version = str_of(&plugin["version"]);
                    if !version.is_empty() {
                        line.push_str(&format!(" v{version}"));
                    }
                    let status = str_of(&plugin["status"]);
                    if status == "disabled" || status == "error" {
                        line.push_str(&format!(" [{status}]"));
                    }
                    bullet(&mut lines, line);
                }
                let mut message = if action == "list" {
                    format!("{} extension(s) installed", plugins.len())
                } else {
                    format!("Scan complete — {} extension(s) known", plugins.len())
                };
                if lines.is_empty() {
                    message.push('.');
                } else {
                    message.push_str(&format!(":\n{}", format_ellipsed_list(&lines, 25)));
                }
                Ok(success(message, json!({ "plugins": plugins })))
            }
            "enable" | "disable" => {
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` is required."));
                }
                let enable = action == "enable";
                let result = Self::call(
                    &self.extensions,
                    if enable { "enable" } else { "disable" },
                    vec![json!(id)],
                    host,
                )
                .await?;
                let display = str_of(&result["displayName"]);
                if enable && str_of(&result["status"]) == "error" {
                    let error = str_of(&result["error"]);
                    let error = if error.is_empty() {
                        "unknown error".to_string()
                    } else {
                        error
                    };
                    return Ok(json!({
                        "ok": false,
                        "message": format!("Failed to enable extension '{display}': {error}."),
                        "data": { "plugin": result },
                    }));
                }
                Ok(success(
                    format!(
                        "{} extension '{display}'.",
                        if enable { "Enabled" } else { "Disabled" }
                    ),
                    json!({ "plugin": result }),
                ))
            }
            "uninstall" => {
                let id = trimmed(&input["id"]);
                if id.is_empty() {
                    return Ok(fail("An `id` is required."));
                }
                Self::call(&self.extensions, "uninstall", vec![json!(id)], host).await?;
                Ok(success(
                    format!("Uninstalled extension '{id}'."),
                    Value::Null,
                ))
            }
            "search" => {
                let Some(clawhub) = &self.clawhub else {
                    return Ok(fail("ClawHub marketplace is not available."));
                };
                let limit = limit_of(&input["limit"], 25.0, 100.0);
                let items = Self::call(clawhub, "list_packages", vec![json!(limit)], host).await?;
                let items = items.as_array().cloned().unwrap_or_default();
                let mut lines: Vec<String> = Vec::new();
                for item in &items {
                    let display = str_of(&item["displayName"]);
                    let display = if display.is_empty() {
                        str_of(&item["name"])
                    } else {
                        display
                    };
                    let mut line = format!("• {display}");
                    let version = str_of(&item["version"]);
                    if !version.is_empty() {
                        line.push_str(&format!(" v{version}"));
                    }
                    let summary = str_of(&item["summary"]);
                    if !summary.is_empty() {
                        line.push_str(&format!(" — {summary}"));
                    }
                    bullet(&mut lines, line);
                }
                let mut message = format!("Found {} plugin(s) on ClawHub", items.len());
                if lines.is_empty() {
                    message.push('.');
                } else {
                    message.push_str(&format!(":\n{}", format_ellipsed_list(&lines, 25)));
                }
                Ok(success(message, json!({ "items": items })))
            }
            other => Ok(fail(format!("Unknown action '{other}'."))),
        }
    }
}
