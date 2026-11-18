//! Persistent Agents-page tool policy over an explicit owner-scoped storage port.
//! The port owns reporting-line validation and detachment; this adapter never spawns workers.
use super::core_io::HostError;
use crate::{contracts::ecmascript_json::JsonDocument, db::identifiers::uuidv7};
use serde_json::{Value, json};
use std::sync::LazyLock;

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("persona-agent-metadata.json")).expect("persona metadata")
    });
    &DATA
}
/// Methods must enforce ownership, reporting-line integrity and deletion cleanup.
/// Caller still enforces registry consent; saving preferences schedules no execution.
pub trait PersonaPort {
    fn list(&mut self, user: &str) -> Result<Value, HostError>;
    fn get(&mut self, id: &str, user: &str) -> Result<Value, HostError>;
    fn delete(&mut self, id: &str, user: &str) -> Result<(), HostError>;
    fn save(&mut self, user: &str, profile: Value) -> Result<Value, HostError>;
    fn provider_available(&mut self, provider: &str, user: &str) -> Result<bool, HostError>;
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
pub fn execute(
    port: &mut impl PersonaPort,
    inspect: bool,
    input: &Value,
    user: Option<&str>,
) -> Result<Value, HostError> {
    execute_with_id(port, inspect, input, user, || uuidv7().to_string())
}
/// The identity source is injectable for deterministic contracts, never taken from tool input.
pub fn execute_with_id(
    port: &mut impl PersonaPort,
    inspect: bool,
    input: &Value,
    user: Option<&str>,
    id_source: impl FnOnce() -> String,
) -> Result<Value, HostError> {
    let action = input["action"].as_str().unwrap_or("");
    if inspect && action != "list" && action != "get" {
        return Ok(fail("Inspection supports only list and get."));
    }
    let Some(user) = user.filter(|u| !u.is_empty()) else {
        return Ok(fail(
            "Authenticated user required to manage agent profiles.",
        ));
    };
    if action == "list" {
        return Ok(
            json!({"ok":true,"message":"Persistent Jait agents.","data":{"agents":port.list(user)?}}),
        );
    }
    let id = input["id"].as_str().unwrap_or("");
    if action != "create" && (id.is_empty() || id.encode_utf16().count() > 100) {
        return Ok(fail("A valid agent profile id is required."));
    }
    let existing = if id.is_empty() {
        Value::Null
    } else {
        port.get(id, user)?
    };
    if action != "create" && existing.is_null() {
        return Ok(fail("Agent profile not found."));
    }
    if action == "get" {
        return Ok(
            json!({"ok":true,"message":format!("Agent: {}",existing["name"].as_str().unwrap_or("undefined")),"data":{"agent":existing}}),
        );
    }
    if action == "delete" {
        port.delete(id, user)?;
        return Ok(
            json!({"ok":true,"message":"Agent deleted; direct reports and thread references were detached.","data":{"id":id}}),
        );
    }
    let profile = &input["profile"];
    if !crate::services::calendar::truthy(profile) || profile.is_array() {
        return Ok(fail("Profile fields are required."));
    }
    let mut merged = json!({"persona":"","avatar":"Nova","role":"","reportsToId":null,"repositoryIds":[],"skillIds":[],"allowedTools":[],"requiresApproval":true,"paused":false,"schedule":{"kind":"adaptive","rules":""},"notificationChannels":[],"notificationEvents":["task_done","blocked","question"]});
    for source in [&existing, profile] {
        if let Some(fields) = source.as_object() {
            for (key, value) in fields {
                merged[key] = value.clone();
            }
        } else if let Some(text) = source.as_str() {
            // Inputs are schema-validated objects in normal dispatch. Preserve JS
            // enumerable string properties for direct callers with valid Unicode.
            for (i, unit) in text.encode_utf16().enumerate() {
                merged[i.to_string()] = json!(String::from_utf16_lossy(&[unit]));
            }
        }
    }
    merged["id"] = json!(if action == "create" {
        id_source()
    } else {
        id.into()
    });
    let parsed = match parse_profile(&merged) {
        Ok(v) => v,
        Err(error) => return Ok(fail(format!("Invalid agent profile: {error}"))),
    };
    if !port.provider_available(
        parsed["providerId"].as_str().expect("validated provider"),
        user,
    )? {
        return Ok(fail("Provider unavailable for this user."));
    }
    Ok(match port.save(user, parsed) {
        Ok(agent) => {
            json!({"ok":true,"message":format!("Agent {}: {}",if action == "create" {"created"} else {"updated"},agent["name"].as_str().unwrap_or("undefined")),"data":{"agent":agent}})
        }
        Err(HostError::Error(message)) => fail(message),
        Err(HostError::Thrown(_)) => fail("Unable to save agent profile."),
    })
}

// Native implementation of the shared profile validator. Issue ordering and
// nested object stripping are observable in factory errors and saved records.
#[derive(Clone)]
enum Rule {
    String(usize, usize),
    Bool,
    Enum(Vec<&'static str>),
    Array(Box<Rule>, usize),
    Object(Vec<Field>),
    Schedule,
}
#[derive(Clone)]
struct Field {
    key: &'static str,
    rule: Rule,
    optional: bool,
    nullable: bool,
}
fn field(key: &'static str, rule: Rule) -> Field {
    Field {
        key,
        rule,
        optional: false,
        nullable: false,
    }
}
impl Field {
    fn optional(mut self) -> Self {
        self.optional = true;
        self
    }
    fn nullable(mut self) -> Self {
        self.nullable = true;
        self
    }
}
fn string(max: usize) -> Rule {
    Rule::String(0, max)
}
fn nonempty(max: usize) -> Rule {
    Rule::String(1, max)
}
fn fields() -> Vec<Field> {
    let ids = || Rule::Array(Box::new(string(200)), 100);
    vec![
        field("id", nonempty(100)),
        field("name", string(200)),
        field("role", string(200)).optional(),
        field("reportsToId", nonempty(100)).nullable().optional(),
        field("persona", string(10_000)),
        field("avatar", string(40)),
        field("providerId", nonempty(100)),
        field("model", string(200)).nullable().optional(),
        field("repositoryIds", ids()),
        field("skillIds", ids()),
        field("usesAllSkills", Rule::Bool).optional(),
        field("allowedTools", ids()),
        field("requiresApproval", Rule::Bool),
        field("paused", Rule::Bool),
        field("schedule", Rule::Schedule),
        field("notificationChannels", ids()),
        field(
            "notificationEvents",
            Rule::Array(
                Box::new(Rule::Enum(vec!["task_done", "blocked", "question"])),
                3,
            ),
        ),
        field(
            "tasks",
            Rule::Array(
                Box::new(Rule::Object(vec![
                    field("id", nonempty(100)),
                    field("name", string(200)),
                    field("prompt", string(10_000)),
                    field("cron", string(200)),
                    field("jobId", string(100)).optional(),
                    field("repositoryId", string(200)).optional(),
                ])),
                100,
            ),
        )
        .optional(),
    ]
}
#[derive(Default)]
struct Validation {
    issues: Vec<String>,
    aborted: bool,
}
impl Validation {
    fn issue(&mut self, path: &str, message: impl AsRef<str>, aborted: bool) {
        self.issues.push(format!("{path}: {}", message.as_ref()));
        self.aborted |= aborted;
    }
    fn value(&mut self, rule: &Rule, value: Option<&Value>, path: &str) -> Value {
        let expected = match rule {
            Rule::String(..) => "string",
            Rule::Bool => "boolean",
            Rule::Array(..) => "array",
            Rule::Object(..) | Rule::Schedule => "object",
            Rule::Enum(_) => "string",
        };
        let correct = match rule {
            Rule::String(..) | Rule::Enum(_) => value.is_some_and(Value::is_string),
            Rule::Bool => value.is_some_and(Value::is_boolean),
            Rule::Array(..) => value.is_some_and(Value::is_array),
            Rule::Object(..) | Rule::Schedule => value.is_some_and(Value::is_object),
        };
        if !correct {
            let received = match value {
                None => "undefined",
                Some(Value::Null) => "null",
                Some(Value::Bool(_)) => "boolean",
                Some(Value::Number(_)) => "number",
                Some(Value::String(_)) => "string",
                Some(Value::Array(_)) => "array",
                Some(Value::Object(_)) => "object",
            };
            self.issue(
                path,
                if value.is_none() {
                    "Required".into()
                } else if let Rule::Enum(values) = rule {
                    format!("Expected {}, received {received}", enum_text(values))
                } else {
                    format!("Expected {expected}, received {received}")
                },
                true,
            );
            return Value::Null;
        }
        let v = value.unwrap();
        match rule {
            Rule::String(min, max) => {
                let len = v.as_str().unwrap().encode_utf16().count();
                if len < *min {
                    self.issue(
                        path,
                        format!("String must contain at least {min} character(s)"),
                        false,
                    );
                }
                if len > *max {
                    self.issue(
                        path,
                        format!("String must contain at most {max} character(s)"),
                        false,
                    );
                }
                v.clone()
            }
            Rule::Bool => v.clone(),
            Rule::Enum(values) => {
                if !values.contains(&v.as_str().unwrap()) {
                    self.issue(
                        path,
                        format!(
                            "Invalid enum value. Expected {}, received '{}'",
                            enum_text(values),
                            v.as_str().unwrap()
                        ),
                        true,
                    );
                }
                v.clone()
            }
            Rule::Array(item, max) => {
                let values = v.as_array().unwrap();
                if values.len() > *max {
                    self.issue(
                        path,
                        format!("Array must contain at most {max} element(s)"),
                        false,
                    );
                }
                json!(
                    values
                        .iter()
                        .enumerate()
                        .map(|(i, v)| self.value(item, Some(v), &format!("{path}.{i}")))
                        .collect::<Vec<_>>()
                )
            }
            Rule::Object(fields) => self.object(fields, v, path, false),
            Rule::Schedule => {
                let kind = v["kind"].as_str();
                match kind {
                    Some("adaptive") => self.object(
                        &[
                            field("kind", Rule::Enum(vec!["adaptive"])),
                            field("rules", string(10_000)),
                        ],
                        v,
                        path,
                        false,
                    ),
                    Some("cron") => self.object(
                        &[
                            field("kind", Rule::Enum(vec!["cron"])),
                            field("cron", nonempty(200)),
                        ],
                        v,
                        path,
                        false,
                    ),
                    _ => {
                        self.issue(
                            &format!("{path}.kind"),
                            "Invalid discriminator value. Expected 'adaptive' | 'cron'",
                            true,
                        );
                        Value::Null
                    }
                }
            }
        }
    }
    fn object(&mut self, fields: &[Field], v: &Value, path: &str, passthrough: bool) -> Value {
        let mut out = json!({});
        for f in fields {
            let p = if path.is_empty() {
                f.key.into()
            } else {
                format!("{path}.{}", f.key)
            };
            let value = v.get(f.key);
            if value.is_none() && f.optional {
                continue;
            }
            out[f.key] = if value.is_some_and(Value::is_null) && f.nullable {
                Value::Null
            } else {
                self.value(&f.rule, value, &p)
            };
        }
        if passthrough {
            for (key, value) in v.as_object().unwrap() {
                if key != "__proto__" && !fields.iter().any(|f| f.key == key) {
                    out[key] = value.clone();
                }
            }
        }
        out
    }
}
fn enum_text(values: &[&str]) -> String {
    values
        .iter()
        .map(|v| format!("'{v}'"))
        .collect::<Vec<_>>()
        .join(" | ")
}
pub fn parse_profile(value: &Value) -> Result<Value, String> {
    let mut validation = Validation::default();
    let out = if value.is_object() {
        validation.object(&fields(), value, "", true)
    } else {
        validation.value(&Rule::Object(fields()), Some(value), "")
    };
    if !validation.aborted {
        let serialized = JsonDocument::parse(&out.to_string())
            .expect("serialized profile")
            .stringify();
        if serialized.encode_utf16().count() > 30_000 {
            validation.issue("", "Agent profile is too large", false);
        }
    }
    if validation.issues.is_empty() {
        Ok(out)
    } else {
        Err(validation.issues.join("; "))
    }
}
