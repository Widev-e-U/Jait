//! Port of `packages/gateway/src/tools/project-message-tool.ts`.
//!
//! `project.message` posts a message into a project's chat. When the call
//! carries a current chat session it reuses (and, if needed, moves) that chat;
//! without one it creates a fresh chat inside the project. Either way it then
//! starts an agent turn in that chat.
//!
//! # Input validation
//!
//! This tool does *not* validate `input` against `metadata().parameters`
//! itself: the TypeScript tool relies on `registry.ts` validating the schema
//! before `execute` runs, and the Rust registry (`src/tools/registry.rs`) does
//! the same. Validating again here would produce errors the TypeScript tool
//! never emits (e.g. `runtimeMode: "bogus"` is silently ignored below).
//!
//! # Host port surface
//!
//! Every capability is bound through [`JaitPort`], invoked as
//! `(service)(method, args, host).await -> Result<Option<Value>, HostError>`.
//! `None` means JS `undefined`; `undefined` and `null` are both nullish here.
//!
//! | method | args | returns |
//! | --- | --- | --- |
//! | `getProject` | `[projectId, userId]` | project row, or nullish |
//! | `getOrCreateProjectForRoot` | `[userId, rootPath\|null, "gateway"]` | project row, or nullish |
//! | `getSession` | `[sessionId, userId]` | chat session row, or nullish |
//! | `assignChatToProject` | `[sessionId, userId, projectId]` | `{"moved": bool, "viaRoute": bool}` |
//! | `postChatMessage` | `[userId, sessionId, message]` | `{"status": <http status>}`, or nullish when the in-process HTTP app / user / config is unavailable or the inject threw |
//! | `createSession` | `[userId, projectId, name, projectPath\|null]` | the created session row |
//! | `touchProject` | `[projectId]` | ignored |
//! | `broadcast` | `[userId, type, payload]` | ignored; the host stamps the `{type, sessionId, timestamp, payload}` envelope (TS uses `sessionId: ""` for `project.created` / `chat.created`) |
//! | `threadControlCreate` | `[payload, context]` | a `thread.control` result: `{"ok": bool, "message"?: string, "data"?: object}` |
//!
//! Call order matches the TypeScript source exactly: project lookup → chat
//! (re)assignment + `chat.moved` → `POST /api/chat` inject → `thread.control`;
//! and in the background path → `createSession` → `touchProject` →
//! `project.created` / `chat.created` → `thread.control`.
//!
//! Responsibilities the TypeScript source keeps internal, so the host must
//! supply them:
//!
//! * `assignChatToProject` tries the HTTP `POST /api/projects/:projectId/chats/:sessionId/move`
//!   route first (returning `viaRoute: true` because that route broadcasts
//!   `chat.moved` itself) and otherwise falls back to the service-level
//!   `moveToProject` plus a project `touch` (`viaRoute: false`); `moved` is
//!   only `true` after re-reading the session and confirming its `projectId`
//!   actually changed.
//! * `postChatMessage` signs a token for the user and injects `POST /api/chat`
//!   with `{sessionId, message}`.
//! * `threadControlCreate` runs the `thread.control` tool with the given
//!   payload and per-call context override.

use super::core_io::HostError;
use super::core_jait::JaitPort;
use crate::services::calendar::{js_text, truthy};
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

/// Tool metadata, transcoded verbatim from the TypeScript definition.
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("project-message-metadata.json"))
            .expect("project-message-metadata.json must be valid JSON")
    });
    &DATA
}

fn fail(message: impl Into<String>) -> Value {
    json!({ "ok": false, "message": message.into() })
}

fn fail_with_data(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": false, "message": message.into(), "data": data })
}

fn success(message: impl Into<String>, data: Value) -> Value {
    json!({ "ok": true, "message": message.into(), "data": data })
}

/// `value ?? fallback` over a `serde_json::Value`.
fn nullish(value: Option<&Value>) -> Option<Value> {
    value.filter(|value| !value.is_null()).cloned()
}

/// `map[key] = value` only when the value is defined (JSON has no `undefined`).
fn set_defined(map: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        map.insert(key.to_string(), value);
    }
}

/// JavaScript `String.prototype.trim()` — unlike Rust's `trim`, U+FEFF counts
/// as whitespace.
fn js_trim(value: &str) -> &str {
    value.trim_matches(|c: char| {
        matches!(
            c,
            '\u{9}'..='\u{d}'
                | ' '
                | '\u{a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
        )
    })
}

/// `readString(record, key)` — trim a string field, treating blank as absent.
fn read_string(record: &Value, key: &str) -> Option<String> {
    let text = record.get(key)?.as_str()?;
    let trimmed = js_trim(text);
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// `deriveTitleFromMessage` — first line, hard-truncated to 60 UTF-16 code
/// units with a three-character ellipsis (indexed by code unit, like JS).
fn derive_title(message: &str) -> String {
    let first_line = message.split('\n').next().unwrap_or("");
    let trimmed = js_trim(first_line);
    if trimmed.is_empty() {
        return "New chat".to_string();
    }
    let units: Vec<u16> = trimmed.encode_utf16().collect();
    if units.len() > 60 {
        format!("{}...", String::from_utf16_lossy(&units[..57]))
    } else {
        trimmed.to_string()
    }
}

/// `a === b` for the only values this tool compares (strings, numbers, null,
/// undefined). Objects/arrays are never identical across a host boundary and so
/// compare as distinct.
fn js_strict_eq(left: Option<&Value>, right: Option<&Value>) -> bool {
    let is_nullish = |value: Option<&Value>| value.is_none_or(Value::is_null);
    if is_nullish(left) || is_nullish(right) {
        return is_nullish(left) && is_nullish(right);
    }
    match (left, right) {
        (Some(Value::String(a)), Some(Value::String(b))) => a == b,
        (Some(Value::Number(a)), Some(Value::Number(b))) => {
            matches!((a.as_f64(), b.as_f64()), (Some(a), Some(b)) if a == b)
        }
        (Some(Value::Bool(a)), Some(Value::Bool(b))) => a == b,
        _ => false,
    }
}

/// `Object.assign(target, source)` for object-shaped sources.
fn spread_into(target: &mut Map<String, Value>, source: Option<&Value>) {
    if let Some(map) = source.and_then(Value::as_object) {
        for (key, value) in map {
            target.insert(key.clone(), value.clone());
        }
    }
}

/// `record.a ?? record.b <template interpolation>`. A truly absent value renders
/// as `undefined` in a JS template literal (unreachable here: every session and
/// project row carries an id).
fn js_label(record: &Value, keys: &[&str]) -> String {
    match keys.iter().find_map(|key| nullish(record.get(key))) {
        Some(value) => js_text(&value),
        None => "undefined".to_string(),
    }
}

/// `{...context, sessionId: session.id, projectRoot: project.rootPath ?? context.projectRoot}`.
fn thread_context(context: &Value, session: &Value, project: &Value) -> Value {
    let mut map = match context.as_object() {
        Some(map) => map.clone(),
        None => Map::new(),
    };
    map.insert(
        "sessionId".to_string(),
        nullish(session.get("id")).unwrap_or(Value::Null),
    );
    match nullish(project.get("rootPath")) {
        Some(root) => {
            map.insert("projectRoot".to_string(), root);
        }
        None => match context.get("projectRoot") {
            Some(value) => {
                map.insert("projectRoot".to_string(), value.clone());
            }
            None => {
                map.remove("projectRoot");
            }
        },
    }
    Value::Object(map)
}

pub struct ProjectMessage<C> {
    pub service: JaitPort<C>,
}

impl<C: Send + Sync> ProjectMessage<C> {
    pub async fn execute(&self, input: &Value, context: &Value, host: &C) -> Value {
        match self.run(input, context, host).await {
            Ok(result) => result,
            Err(HostError::Error(message)) => fail(message),
            // The TypeScript tool has no local try/catch, so a thrown error
            // reaches the caller as the error's own message.
            Err(HostError::Thrown(value)) => fail(match value.as_str() {
                Some(message) => message.to_string(),
                None => "Unable to post project message.".to_string(),
            }),
        }
    }

    /// One host port call; `None` becomes JSON `null`.
    async fn call(&self, method: &str, args: Vec<Value>, host: &C) -> Result<Value, HostError> {
        Ok((self.service)(method, args, host)
            .await?
            .unwrap_or(Value::Null))
    }

    async fn run(&self, input: &Value, context: &Value, host: &C) -> Result<Value, HostError> {
        let body = if input.is_object() {
            input
        } else {
            &Value::Null
        };

        let message = match read_string(body, "message") {
            Some(message) => message,
            None => return Ok(fail("message is required.")),
        };

        // A tool call always runs in a user context — narrow it once so the
        // session service / auth calls below get a definite string.
        let user_id = match context.get("userId") {
            None => None,
            Some(Value::Null) => None,
            Some(Value::String(text)) => {
                let trimmed = js_trim(text);
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            // `context.userId?.trim()` on a non-string value throws a
            // TypeError whose message is reproduced here.
            Some(_) => return Ok(fail("context.userId?.trim is not a function")),
        };
        let user_id = match user_id {
            Some(user_id) => user_id,
            None => return Ok(fail("project.message requires a user context (userId).")),
        };

        let project_id = read_string(body, "projectId");
        let project_root = read_string(body, "projectRoot");
        if project_id.is_none() && project_root.is_none() {
            return Ok(fail("projectId or projectRoot is required."));
        }

        let project = match &project_id {
            Some(id) => {
                self.call("getProject", vec![json!(id), json!(user_id)], host)
                    .await?
            }
            None => {
                self.call(
                    "getOrCreateProjectForRoot",
                    vec![
                        json!(user_id),
                        project_root.clone().map_or(Value::Null, Value::String),
                        json!("gateway"),
                    ],
                    host,
                )
                .await?
            }
        };
        if !truthy(&project) {
            let label = project_id.as_deref().unwrap_or("undefined");
            return Ok(fail(format!("Project {label} not found.")));
        }

        let title = read_string(body, "title").unwrap_or_else(|| derive_title(&message));
        let current_session_id = match context.get("sessionId") {
            None => String::new(),
            Some(Value::Null) => String::new(),
            Some(Value::String(text)) => js_trim(text).to_string(),
            // Same TypeError as `context.sessionId?.trim()` on a non-string.
            Some(_) => return Ok(fail("context.sessionId?.trim is not a function")),
        };
        let current_session = if current_session_id.is_empty() {
            Value::Null
        } else {
            self.call(
                "getSession",
                vec![json!(current_session_id), json!(user_id)],
                host,
            )
            .await?
        };

        if truthy(&current_session) {
            // Preferred path: THIS chat is the project's chat — assign it and
            // run the turn through the normal chat pipeline (no new chat).
            self.in_current_chat(
                &current_session,
                &project,
                &message,
                &user_id,
                context,
                host,
            )
            .await
        } else {
            // Background/cron path: no current chat to reuse — create one.
            self.create_chat_and_start(&project, &message, &title, body, &user_id, host)
                .await
        }
    }

    async fn in_current_chat(
        &self,
        current_session: &Value,
        project: &Value,
        message: &str,
        user_id: &str,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let before_project_id = nullish(current_session.get("projectId"));
        let mut session = current_session.clone();
        let mut assigned = js_strict_eq(
            before_project_id.as_ref(),
            nullish(project.get("id")).as_ref(),
        );

        if !assigned {
            let assignment = self
                .call(
                    "assignChatToProject",
                    vec![
                        nullish(session.get("id")).unwrap_or(Value::Null),
                        json!(user_id),
                        nullish(project.get("id")).unwrap_or(Value::Null),
                    ],
                    host,
                )
                .await?;
            let moved_flag = assignment.get("moved").is_some_and(truthy);
            assigned = moved_flag;
            if moved_flag {
                let moved = self
                    .call(
                        "getSession",
                        vec![
                            nullish(session.get("id")).unwrap_or(Value::Null),
                            json!(user_id),
                        ],
                        host,
                    )
                    .await?;
                if truthy(&moved) {
                    // The HTTP route already broadcasts `chat.moved` itself —
                    // only the direct (service-level) move needs one here.
                    if !assignment.get("viaRoute").is_some_and(truthy) {
                        let payload = json!({
                            "fromProjectId": before_project_id,
                            "toProjectId": project.get("id"),
                            "projectId": project.get("id"),
                            "sessionId": moved.get("id"),
                            "session": moved,
                        });
                        self.call(
                            "broadcast",
                            vec![
                                context.get("userId").cloned().unwrap_or(Value::Null),
                                json!("chat.moved"),
                                payload,
                            ],
                            host,
                        )
                        .await?;
                    }
                    session = moved;
                }
            }
        }

        let name = js_label(&session, &["name", "id"]);
        let project_label = js_label(project, &["title", "id"]);

        // Preferred transport: inject `POST /api/chat` in-process so the turn
        // goes through the ordinary chat pipeline.
        let response = self
            .call(
                "postChatMessage",
                vec![
                    json!(user_id),
                    nullish(session.get("id")).unwrap_or(Value::Null),
                    json!(message),
                ],
                host,
            )
            .await?;
        let status = response.get("status").and_then(Value::as_f64);
        if status == Some(200.0) || status == Some(202.0) {
            let queued = status == Some(202.0);
            let suffix = if queued {
                " \u{2014} the turn starts as soon as the current turn finishes."
            } else {
                ""
            };
            return Ok(success(
                format!(
                    "Assigned chat \"{name}\" to project \"{project_label}\" and queued a message that starts the agent turn there.{suffix}"
                ),
                json!({
                    "project": project,
                    "session": session,
                    "assigned": assigned,
                    "queued": queued,
                }),
            ));
        }

        // Fallback: no HTTP app available (unit tests / cron without app) —
        // start the turn on this chat via `thread.control` instead.
        let payload = json!({
            "action": "create",
            "sessionId": session.get("id"),
            "message": message,
            "workingDirectory": project.get("rootPath"),
            "start": true,
        });
        let result = self
            .call(
                "threadControlCreate",
                vec![payload, thread_context(context, &session, project)],
                host,
            )
            .await?;

        let mut data = Map::new();
        data.insert("project".to_string(), project.clone());
        data.insert("session".to_string(), session.clone());
        data.insert("assigned".to_string(), json!(assigned));
        spread_into(&mut data, nullish(result.get("data")).as_ref());
        let data = Value::Object(data);

        if !result.get("ok").is_some_and(truthy) {
            return Ok(fail_with_data(
                format!(
                    "Assigned chat \"{name}\" to project \"{project_label}\" but failed to start the turn: {}",
                    js_text(&result["message"])
                ),
                data,
            ));
        }
        Ok(success(
            format!(
                "Assigned chat \"{name}\" to project \"{project_label}\" and started an agent turn there."
            ),
            data,
        ))
    }

    async fn create_chat_and_start(
        &self,
        project: &Value,
        message: &str,
        title: &str,
        body: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let session = self
            .call(
                "createSession",
                vec![
                    json!(user_id),
                    nullish(project.get("id")).unwrap_or(Value::Null),
                    json!(title),
                    nullish(project.get("rootPath")).unwrap_or(Value::Null),
                ],
                host,
            )
            .await?;
        self.call(
            "touchProject",
            vec![nullish(project.get("id")).unwrap_or(Value::Null)],
            host,
        )
        .await?;

        self.call(
            "broadcast",
            vec![
                json!(user_id),
                json!("project.created"),
                json!({ "project": project }),
            ],
            host,
        )
        .await?;
        self.call(
            "broadcast",
            vec![
                json!(user_id),
                json!("chat.created"),
                json!({ "projectId": project.get("id"), "session": session }),
            ],
            host,
        )
        .await?;

        let runtime_mode = match body.get("runtimeMode").and_then(Value::as_str) {
            Some("supervised") => Some(json!("supervised")),
            Some("full-access") => Some(json!("full-access")),
            _ => None,
        };

        let mut payload = Map::new();
        payload.insert("action".to_string(), json!("create"));
        payload.insert(
            "sessionId".to_string(),
            nullish(session.get("id")).unwrap_or(Value::Null),
        );
        payload.insert("title".to_string(), json!(title));
        payload.insert("message".to_string(), json!(message));
        set_defined(
            &mut payload,
            "workingDirectory",
            nullish(project.get("rootPath")),
        );
        set_defined(
            &mut payload,
            "providerId",
            read_string(body, "providerId").map(Value::String),
        );
        set_defined(
            &mut payload,
            "model",
            read_string(body, "model").map(Value::String),
        );
        set_defined(&mut payload, "runtimeMode", runtime_mode);
        payload.insert("start".to_string(), json!(true));

        let result = self
            .call(
                "threadControlCreate",
                vec![
                    Value::Object(payload),
                    thread_context(body, &session, project),
                ],
                host,
            )
            .await?;

        let project_label = js_label(project, &["title", "id"]);
        let mut data = Map::new();
        data.insert("project".to_string(), project.clone());
        data.insert("session".to_string(), session.clone());
        spread_into(&mut data, nullish(result.get("data")).as_ref());
        let data = Value::Object(data);

        if !result.get("ok").is_some_and(truthy) {
            return Ok(fail_with_data(
                format!(
                    "Created chat \"{title}\" in project \"{project_label}\" but failed to start it: {}",
                    js_text(&result["message"])
                ),
                data,
            ));
        }
        Ok(success(
            format!(
                "Created chat \"{title}\" in project \"{project_label}\" and started an agent turn there."
            ),
            data,
        ))
    }
}
