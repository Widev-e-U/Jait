//! Native port of `packages/gateway/src/tools/thread-tools.ts`.
//!
//! `thread.control` is the single control surface for agent threads: list/get/
//! create/create_many/update/delete, running them (start/send/stop/interrupt/
//! approve), activity history, and pull-request publication.
//!
//! The TS tool is a thin adapter over the gateway's thread service, provider
//! registry, run engine, git service and GitHub App service. Every one of those
//! is a host port here: the adapter owns only argument validation, permission
//! checks, the call sequence and the operator-facing wording.
use super::{
    core_io::HostError,
    core_jait::JaitPort,
    validate::{ToolInput, validate_tool_input},
};
use crate::services::calendar::js_text;
use serde_json::{Map, Value, json};
use std::sync::LazyLock;

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> =
        LazyLock::new(|| serde_json::from_str(include_str!("thread-tools-metadata.json")).unwrap());
    &DATA
}

/// `PREVIEW_MAX_ITEMS` from `list-preview.ts`.
const PREVIEW_MAX_ITEMS: usize = 8;

fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}

fn fail_with_data(message: impl Into<String>, data: Value) -> Value {
    json!({"ok":false,"message":message.into(),"data":data})
}

fn success_with_data(message: impl Into<String>, data: Value) -> Value {
    json!({"ok":true,"message":message.into(),"data":data})
}

fn str_of(value: &Value) -> String {
    js_text(value).trim().to_string()
}

/// `normalizePrompt(message, prompt)` — first non-empty candidate wins.
fn normalize_prompt(message: &Value, prompt: &Value) -> Option<String> {
    let message = str_of(message);
    if !message.is_empty() {
        return Some(message);
    }
    let prompt = str_of(prompt);
    if prompt.is_empty() {
        None
    } else {
        Some(prompt)
    }
}

fn prompt_of(input: &Value) -> Option<String> {
    normalize_prompt(&input["message"], &input["prompt"])
}

/// `ellipsizeText`: collapse whitespace, clamp to `max_chars` with an ellipsis.
fn ellipsize_text(value: &str, max_chars: usize) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if max_chars == 0 {
        return String::new();
    }
    if clean.chars().count() <= max_chars {
        return clean;
    }
    let kept: String = clean.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{}…", kept.trim_end())
}

/// `formatEllipsedList`: cap the lines and note how many were dropped.
fn format_ellipsed_list(lines: &[String], max_items: usize) -> String {
    if lines.is_empty() {
        return String::new();
    }
    let shown = lines.len().min(max_items);
    let hidden = lines.len() - shown;
    let mut parts: Vec<String> = lines[..shown].to_vec();
    if hidden > 0 {
        parts.push(format!("… (+{hidden} more)"));
    }
    parts.join("\n")
}

/// `getAccessibleThread`: missing threads and other users' threads read as
/// absent, so the caller cannot tell the two apart.
async fn accessible_thread<C: Send + Sync>(
    port: &JaitPort<C>,
    thread_id: &str,
    user_id: &str,
    host: &C,
) -> Option<Value> {
    let thread = (*port)("getById", vec![json!(thread_id)], host)
        .await
        .ok()
        .flatten()?;
    if thread.is_null() {
        return None;
    }
    let owner = &thread["userId"];
    if owner.is_null() || owner == &json!(user_id) {
        Some(thread)
    } else {
        None
    }
}

pub struct ThreadTools<C> {
    /// `deps.threadService`
    pub threads: JaitPort<C>,
    /// `deps.providerRegistry`
    pub providers: Option<JaitPort<C>>,
    /// `deps.agentControl` — halt state for autonomous agents.
    pub agent_control: Option<JaitPort<C>>,
    /// The run engine behind `startThread` / waiting for completion.
    pub runner: Option<JaitPort<C>>,
    /// `gitService`
    pub git: Option<JaitPort<C>>,
    /// `deps.agentGithubAppService`
    pub agent_github: Option<JaitPort<C>>,
}

impl<C: Send + Sync> ThreadTools<C> {
    pub async fn execute(&self, input: &Value, context: &Value, host: &C) -> Value {
        let input = {
            let mut validated = ToolInput::new(input);
            let validation = validate_tool_input(&metadata()["parameters"], &mut validated)
                .expect("static thread.control schema");
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
        match self.dispatch(&input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(format!("thread.control failed: {message}")),
            Err(HostError::Thrown(_)) => fail("thread.control failed"),
        }
    }

    async fn dispatch(&self, input: &Value, context: &Value, host: &C) -> Result<Value, HostError> {
        let user_id = str_of(&context["userId"]);
        let action = str_of(&input["action"]);

        // Creating or driving threads is refused while agents are halted.
        if matches!(action.as_str(), "create" | "create_many" | "start" | "send")
            && self.is_halted(&user_id, host).await?
        {
            let state = self
                .optional_call(&self.agent_control, "getState", vec![json!(user_id)], host)
                .await?
                .unwrap_or(Value::Null);
            let message = match state["error"].as_str() {
                Some(error) if !error.is_empty() => error.to_string(),
                _ => "Autonomous agents are halted. Resume agents to continue.".to_string(),
            };
            let mut body = Map::new();
            body.insert("error".into(), json!(message));
            body.insert("halted".into(), json!(true));
            body.insert("action".into(), json!(action));
            return Ok(fail_with_data(message, Value::Object(body)));
        }

        // Saved-team agents may not open relay/helper threads of their own.
        if matches!(action.as_str(), "create" | "create_many") {
            let caller_id = {
                let thread_id = str_of(&context["threadId"]);
                if thread_id.is_empty() {
                    str_of(&context["sessionId"])
                } else {
                    thread_id
                }
            };
            if !caller_id.is_empty() {
                let caller = (*self.threads)("getById", vec![json!(caller_id)], host)
                    .await?
                    .unwrap_or(Value::Null);
                if !caller["personaAgentId"].is_null() && caller["userId"] == json!(user_id) {
                    return Ok(fail(
                        "Saved-team agents coordinate new work through addressed team.chat assignments. Post results directly; do not create relay/helper threads.",
                    ));
                }
            }
        }

        match action.as_str() {
            "list" => self.list(input, &user_id, host).await,
            "get" => self.get(input, &user_id, host).await,
            "create" => self.create(input, context, &user_id, host).await,
            "create_many" => self.create_many(input, context, &user_id, host).await,
            "update" => self.update(input, &user_id, host).await,
            "delete" => self.delete(input, &user_id, host).await,
            "start" => self.start(input, context, &user_id, host).await,
            "send" => self.send(input, context, &user_id, host).await,
            "stop" => self.stop(input, &user_id, host).await,
            "interrupt" => self.interrupt(input, &user_id, host).await,
            "approve" => self.approve(input, &user_id, host).await,
            "activities" => self.activities(input, &user_id, host).await,
            "create_pr" => self.create_pr(input, context, &user_id, host).await,
            _ => Ok(fail(format!("Unsupported action: {action}"))),
        }
    }

    async fn is_halted(&self, user_id: &str, host: &C) -> Result<bool, HostError> {
        let halted = self
            .optional_call(&self.agent_control, "isHalted", vec![json!(user_id)], host)
            .await?;
        Ok(matches!(halted, Some(Value::Bool(true))))
    }

    async fn list(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let threads = (*self.threads)(
            "list",
            vec![json!({"userId": user_id, "sessionId": input["sessionId"]})],
            host,
        )
        .await?
        .unwrap_or(json!([]));
        let threads: Vec<Value> = threads
            .as_array()
            .map(|rows| {
                rows.iter()
                    .filter(|t| t["userId"].is_null() || t["userId"] == json!(user_id))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let lines: Vec<String> = threads
            .iter()
            .map(|t| {
                let id: String = str_of(&t["id"]).chars().take(8).collect();
                let model = match str_of(&t["model"]) {
                    model if model.is_empty() => String::new(),
                    model => format!(" · {model}"),
                };
                let created = match str_of(&t["createdAt"]) {
                    created if created.is_empty() => String::new(),
                    created => format!(" · {created}"),
                };
                format!(
                    "• [{id} · {}] {}{model}{created}",
                    str_of(&t["kind"]),
                    str_of(&t["status"])
                )
            })
            .collect();
        let message = if lines.is_empty() {
            format!("{} thread(s).", threads.len())
        } else {
            format!(
                "{} thread(s):\n{}",
                threads.len(),
                format_ellipsed_list(&lines, PREVIEW_MAX_ITEMS)
            )
        };
        Ok(success_with_data(message, json!({ "threads": threads })))
    }

    async fn get(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("get requires `threadId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        Ok(success_with_data(
            "Thread loaded",
            json!({ "thread": thread }),
        ))
    }

    /// Shared front half of `create` / `create_many`: resolve the provider that
    /// the thread will run on, exactly one thread spec at a time.
    async fn resolve_provider(
        &self,
        context: &Value,
        provider_id: &Value,
        host: &C,
    ) -> Result<Result<String, Value>, HostError> {
        let resolved = self
            .optional_call(
                &self.providers,
                "resolve",
                vec![json!({"providerId": provider_id, "context": context})],
                host,
            )
            .await?
            .unwrap_or(Value::Null);
        let resolved_id = str_of(&resolved["providerId"]);
        if resolved_id.is_empty() {
            let message = match resolved["error"].as_str() {
                Some(error) if !error.is_empty() => error.to_string(),
                _ => "Unable to resolve a provider for this thread.".to_string(),
            };
            return Ok(Err(fail(message)));
        }
        Ok(Ok(resolved_id))
    }

    /// Fields shared by `create` and every `create_many` spec.
    async fn create_one(
        &self,
        context: &Value,
        user_id: &str,
        spec: &Value,
        prompt: &str,
        provider_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let defaults = self
            .call(&self.threads, "defaults", vec![json!(context)], host)
            .await?
            .unwrap_or(Value::Null);
        let title = match str_of(&spec["title"]) {
            title if !title.is_empty() => title,
            _ => {
                let generated = self
                    .call(
                        &self.threads,
                        "generateTitle",
                        vec![json!(prompt), json!("New Thread")],
                        host,
                    )
                    .await?
                    .unwrap_or(Value::Null);
                match str_of(&generated) {
                    generated if !generated.is_empty() => generated,
                    _ => "New Thread".to_string(),
                }
            }
        };
        let runtime_mode = match str_of(&spec["runtimeMode"]) {
            mode if !mode.is_empty() => mode,
            _ => match str_of(&defaults["runtimeMode"]) {
                mode if !mode.is_empty() => mode,
                _ => "full-access".to_string(),
            },
        };
        let model = if spec["model"].is_null() {
            defaults["model"].clone()
        } else {
            spec["model"].clone()
        };
        let thread = (*self.threads)(
            "create",
            vec![json!({
                "userId": user_id,
                "personaAgentId": spec["personaAgentId"],
                "sessionId": spec["sessionId"],
                "title": title,
                "providerId": provider_id,
                "model": model,
                "reasoningEffort": defaults["reasoningEffort"],
                "runtimeMode": runtime_mode,
                // Anything other than an explicit delivery thread is a
                // delegation thread.
                "kind": if str_of(&spec["kind"]) == "delivery" { "delivery" } else { "delegation" },
                "workingDirectory": spec["workingDirectory"],
                "skillIds": spec["skillIds"],
                "branch": spec["branch"],
            })],
            host,
        )
        .await?
        .unwrap_or(Value::Null);
        Ok(thread)
    }

    async fn create(
        &self,
        input: &Value,
        context: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let Some(prompt) = prompt_of(input) else {
            return Ok(fail("create requires non-empty `prompt`."));
        };
        let provider_id = match self
            .resolve_provider(context, &input["providerId"], host)
            .await?
        {
            Ok(provider_id) => provider_id,
            Err(error) => return Ok(error),
        };
        let persona_agent_id = str_of(&input["personaAgentId"]);
        if !persona_agent_id.is_empty() {
            let agent = self
                .call(
                    &self.threads,
                    "getPersonaAgent",
                    vec![json!(persona_agent_id), json!(user_id)],
                    host,
                )
                .await?;
            if agent.is_none_or(|agent| agent.is_null()) {
                return Ok(fail("Agent profile not found."));
            }
        }
        let thread = self
            .create_one(context, user_id, input, &prompt, &provider_id, host)
            .await?;

        if !self.truthy_field(input, "start") {
            self.call(
                &self.threads,
                "addActivity",
                vec![
                    thread["id"].clone(),
                    json!("message"),
                    json!(prompt.chars().take(500).collect::<String>()),
                    json!({"role": "user", "content": prompt}),
                ],
                host,
            )
            .await?;
            return Ok(success_with_data(
                "Thread created",
                json!({ "thread": thread }),
            ));
        }

        let started = self
            .start_thread(context, &thread, input, &prompt, host)
            .await?;
        if matches!(started["ok"], Value::Bool(true)) {
            let thread = if started["thread"].is_null() {
                thread
            } else {
                started["thread"].clone()
            };
            return Ok(success_with_data(
                "Thread created and started",
                json!({ "thread": thread }),
            ));
        }
        let message = str_of(&started["message"]);
        Ok(fail_with_data(
            format!("Thread created but failed to start: {message}"),
            json!({ "thread": thread }),
        ))
    }

    async fn create_many(
        &self,
        input: &Value,
        context: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let specs: Vec<Value> = input["threads"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|spec| spec.is_object())
            .collect();
        if specs.is_empty() {
            return Ok(fail("create_many requires non-empty `threads`."));
        }

        let mut created: Vec<Value> = Vec::new();
        let failures: Vec<Value> = Vec::new();
        for spec in &specs {
            let Some(prompt) = normalize_prompt(&spec["message"], &spec["prompt"]) else {
                return Ok(fail(format!(
                    "create_many requires non-empty prompt for thread '{}'.",
                    str_of(&spec["title"])
                )));
            };
            let provider_id = match self
                .resolve_provider(context, &spec["providerId"], host)
                .await?
            {
                Ok(provider_id) => provider_id,
                Err(_) => {
                    return Ok(fail(format!(
                        "Unable to resolve a provider for thread '{}'.",
                        str_of(&spec["title"])
                    )));
                }
            };
            let thread = self
                .create_one(context, user_id, spec, &prompt, &provider_id, host)
                .await?;
            created.push(json!({"thread": thread, "spec": spec, "prompt": prompt}));
        }

        // `start` is the batch default; `detach` threads run unsupervised.
        let should_start = self.truthy_field(input, "start");
        let wait = self.truthy_field(input, "wait");
        let mut failed_starts = 0usize;
        let mut terminal_failures = 0usize;
        if should_start {
            for entry in &mut created {
                let thread = entry["thread"].clone();
                let prompt = str_of(&entry["prompt"]);
                let started = self
                    .start_thread(context, &thread, input, &prompt, host)
                    .await?;
                if !matches!(started["ok"], Value::Bool(true)) {
                    failed_starts += 1;
                    continue;
                }
                if wait {
                    let finished = self
                        .optional_call(
                            &self.runner,
                            "waitForTerminal",
                            vec![json!({
                                "threadId": thread["id"],
                                "timeoutMinutes": input["timeoutMinutes"],
                            })],
                            host,
                        )
                        .await?
                        .unwrap_or(Value::Null);
                    if completed_ok(&finished) {
                        entry["thread"] = finished["thread"].clone();
                    } else {
                        terminal_failures += 1;
                    }
                } else if !started["thread"].is_null() {
                    entry["thread"] = started["thread"].clone();
                }
            }
        }

        let created_lines: Vec<String> = created
            .iter()
            .map(|entry| {
                format!(
                    "• {} [{}]",
                    ellipsize_text(&thread_title(&entry["thread"]), 60),
                    str_of(&entry["thread"]["kind"])
                )
            })
            .collect();
        let mut message = if failed_starts > 0 {
            format!(
                "Created {} thread(s), {failed_starts} failed to start.",
                created.len()
            )
        } else if terminal_failures > 0 {
            format!(
                "Created {} thread(s), {terminal_failures} did not complete successfully.",
                created.len()
            )
        } else if wait {
            format!(
                "Created {} thread(s) and waited for {} to finish.",
                created.len(),
                created.len()
            )
        } else {
            format!("Created {} thread(s).", created.len())
        };
        if !created_lines.is_empty() {
            message.push_str(&format!(
                "\nThreads:\n{}",
                format_ellipsed_list(&created_lines, PREVIEW_MAX_ITEMS)
            ));
        }
        Ok(success_with_data(
            message,
            json!({"threads": created, "failures": failures}),
        ))
    }

    async fn update(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("update requires `threadId`."));
        }
        if accessible_thread(&self.threads, &thread_id, user_id, host)
            .await
            .is_none()
        {
            return Ok(fail("Thread not found."));
        }
        let thread = (*self.threads)(
            "update",
            vec![
                json!(thread_id),
                json!({
                    "title": input["title"],
                    "model": input["model"],
                    "runtimeMode": input["runtimeMode"],
                    "kind": match str_of(&input["kind"]).as_str() {
                        "delegation" => json!("delegation"),
                        "delivery" => json!("delivery"),
                        _ => Value::Null,
                    },
                    "workingDirectory": input["workingDirectory"],
                    "branch": input["branch"],
                    "prUrl": patchable_string(&input["prUrl"]),
                    "prNumber": patchable_number(&input["prNumber"]),
                    "prTitle": patchable_string(&input["prTitle"]),
                    "prBaseBranch": patchable_string(&input["prBaseBranch"]),
                    "prState": match str_of(&input["prState"]).as_str() {
                        "creating" => json!("creating"),
                        "open" => json!("open"),
                        "closed" => json!("closed"),
                        "merged" => json!("merged"),
                        _ => Value::Null,
                    },
                }),
            ],
            host,
        )
        .await?
        .unwrap_or(Value::Null);
        if thread.is_null() {
            return Ok(fail("Thread not found after update."));
        }
        Ok(success_with_data(
            "Thread updated",
            json!({ "thread": thread }),
        ))
    }

    async fn delete(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("delete requires `threadId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        // Live provider sessions are stopped before the row disappears.
        let session_id = str_of(&thread["providerSessionId"]);
        if !session_id.is_empty() {
            self.optional_call(
                &self.providers,
                "stopSession",
                vec![json!(session_id), thread["providerId"].clone()],
                host,
            )
            .await?;
        }
        self.call(&self.threads, "delete", vec![thread["id"].clone()], host)
            .await?;
        Ok(success_with_data(
            "Thread deleted",
            json!({ "threadId": thread["id"] }),
        ))
    }

    /// Start a thread's first turn. The run engine owns the streaming, the
    /// history replay and the auto-stop/timeout policy.
    async fn start_thread(
        &self,
        context: &Value,
        thread: &Value,
        input: &Value,
        prompt: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let started = self
            .optional_call(
                &self.runner,
                "startThread",
                vec![json!({
                    "thread": thread,
                    "context": context,
                    "message": prompt,
                    "attachments": input["attachments"],
                    "detach": input["detach"],
                    "autoStopAfterTurn": input["autoStopAfterTurn"],
                    "timeoutMinutes": input["timeoutMinutes"],
                })],
                host,
            )
            .await?;
        Ok(started.unwrap_or(Value::Null))
    }

    async fn start(
        &self,
        input: &Value,
        context: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("start requires `threadId`."));
        }
        let Some(prompt) = prompt_of(input) else {
            return Ok(fail("start requires non-empty `prompt`."));
        };
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let started = self
            .start_thread(context, &thread, input, &prompt, host)
            .await?;
        if matches!(started["ok"], Value::Bool(true)) {
            let thread = if started["thread"].is_null() {
                thread
            } else {
                started["thread"].clone()
            };
            return Ok(success_with_data(
                str_of(&started["message"]),
                json!({ "thread": thread }),
            ));
        }
        Ok(fail(str_of(&started["message"])))
    }

    async fn send(
        &self,
        input: &Value,
        context: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("send requires `threadId`."));
        }
        let Some(prompt) = prompt_of(input) else {
            return Ok(fail("send requires non-empty `prompt`."));
        };
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let session_id = str_of(&thread["providerSessionId"]);
        if session_id.is_empty() {
            return Ok(fail("Thread has no active session."));
        }
        let provider_ok = self
            .optional_call(
                &self.providers,
                "get",
                vec![thread["providerId"].clone()],
                host,
            )
            .await?
            .is_some_and(|provider| !provider.is_null());
        if !provider_ok {
            return Ok(fail(format!(
                "Provider '{}' not found",
                str_of(&thread["providerId"])
            )));
        }
        self.call(
            &self.threads,
            "update",
            vec![
                thread["id"].clone(),
                json!({"status": "running", "error": null, "completedAt": null}),
            ],
            host,
        )
        .await?;
        self.optional_call(
            &self.providers,
            "sendTurn",
            vec![
                json!(session_id),
                json!(prompt),
                input["attachments"].clone(),
                json!({"context": context, "threadId": thread["id"]}),
            ],
            host,
        )
        .await?;
        self.call(
            &self.threads,
            "addActivity",
            vec![
                thread["id"].clone(),
                json!("message"),
                json!(prompt.chars().take(50).collect::<String>()),
                json!({"role": "user", "content": prompt}),
            ],
            host,
        )
        .await?;
        Ok(success_with_data(
            "Turn sent",
            json!({ "threadId": thread["id"] }),
        ))
    }

    async fn stop(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("stop requires `threadId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let session_id = str_of(&thread["providerSessionId"]);
        if !session_id.is_empty() {
            self.optional_call(
                &self.providers,
                "stopSession",
                vec![json!(session_id), thread["providerId"].clone()],
                host,
            )
            .await?;
        }
        self.call(
            &self.threads,
            "markInterrupted",
            vec![thread["id"].clone()],
            host,
        )
        .await?;
        let updated = self
            .call(&self.threads, "getById", vec![thread["id"].clone()], host)
            .await?
            .filter(|updated| !updated.is_null())
            .unwrap_or(thread);
        Ok(success_with_data(
            "Thread stopped",
            json!({ "thread": updated }),
        ))
    }

    async fn interrupt(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("interrupt requires `threadId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let session_id = str_of(&thread["providerSessionId"]);
        if session_id.is_empty() {
            return Ok(fail("Thread has no active session."));
        }
        let provider_ok = self
            .optional_call(
                &self.providers,
                "get",
                vec![thread["providerId"].clone()],
                host,
            )
            .await?
            .is_some_and(|provider| !provider.is_null());
        if !provider_ok {
            return Ok(fail(format!(
                "Provider '{}' not found",
                str_of(&thread["providerId"])
            )));
        }
        self.optional_call(
            &self.providers,
            "interruptTurn",
            vec![json!(session_id), thread["providerId"].clone()],
            host,
        )
        .await?;
        Ok(success_with_data(
            "Thread turn interrupted",
            json!({ "threadId": thread["id"] }),
        ))
    }

    async fn approve(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("approve requires `threadId`."));
        }
        let request_id = str_of(&input["requestId"]);
        if request_id.is_empty() {
            return Ok(fail("approve requires `requestId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let session_id = str_of(&thread["providerSessionId"]);
        if session_id.is_empty() {
            return Ok(fail("Thread has no active session."));
        }
        let provider_ok = self
            .optional_call(
                &self.providers,
                "get",
                vec![thread["providerId"].clone()],
                host,
            )
            .await?
            .is_some_and(|provider| !provider.is_null());
        if !provider_ok {
            return Ok(fail(format!(
                "Provider '{}' not found",
                str_of(&thread["providerId"])
            )));
        }
        self.optional_call(
            &self.providers,
            "respondToApproval",
            vec![
                json!(session_id),
                json!(request_id),
                input["approve"].clone(),
                thread["providerId"].clone(),
            ],
            host,
        )
        .await?;
        Ok(success_with_data(
            "Approval response sent",
            json!({ "threadId": thread["id"] }),
        ))
    }

    async fn activities(&self, input: &Value, user_id: &str, host: &C) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        if thread_id.is_empty() {
            return Ok(fail("activities requires `threadId`."));
        }
        let Some(thread) = accessible_thread(&self.threads, &thread_id, user_id, host).await else {
            return Ok(fail("Thread not found."));
        };
        let activities = (*self.threads)(
            "getActivities",
            vec![thread["id"].clone(), input["limit"].clone()],
            host,
        )
        .await?
        .unwrap_or(json!([]));
        let activities = activities.as_array().cloned().unwrap_or_default();
        let lines: Vec<String> = activities
            .iter()
            .map(|activity| {
                format!(
                    "• [{}] {}",
                    str_of(&activity["kind"]),
                    ellipsize_text(&str_of(&activity["summary"]), 100)
                )
            })
            .collect();
        let message = if lines.is_empty() {
            format!("{} activities", activities.len())
        } else {
            format!(
                "{} activit{}:\n{}",
                activities.len(),
                if activities.len() == 1 { "y" } else { "ies" },
                format_ellipsed_list(&lines, PREVIEW_MAX_ITEMS)
            )
        };
        Ok(success_with_data(
            message,
            json!({ "activities": activities }),
        ))
    }

    async fn create_pr(
        &self,
        input: &Value,
        context: &Value,
        user_id: &str,
        host: &C,
    ) -> Result<Value, HostError> {
        let thread_id = str_of(&input["threadId"]);
        let mut thread = Value::Null;
        if !thread_id.is_empty() {
            match accessible_thread(&self.threads, &thread_id, user_id, host).await {
                Some(found) => thread = found,
                None => return Ok(fail("Thread not found.")),
            }
            if str_of(&thread["status"]) != "completed" {
                return Ok(fail(
                    "Thread must be completed before creating a pull request.",
                ));
            }
            if str_of(&thread["kind"]) == "delegation" {
                return Ok(fail("Delegation threads do not support PR creation."));
            }
        }
        let cwd = {
            let explicit = str_of(&input["cwd"]);
            if explicit.is_empty() {
                str_of(&thread["workingDirectory"])
            } else {
                explicit
            }
        };
        if cwd.is_empty() {
            return Ok(fail(
                "create_pr requires `cwd` or a thread with `workingDirectory`.",
            ));
        }
        let action = match str_of(&input["gitAction"]).as_str() {
            "commit" => "commit".to_string(),
            "commit_push" => "commit_push".to_string(),
            _ => "commit_push_pr".to_string(),
        };

        // Agents publish under their own GitHub App identity, never a personal
        // credential, and only from their assigned worktree.
        let mut github_token = Value::Null;
        if thread.is_object() {
            let caller = {
                let caller_id = {
                    let context_thread = str_of(&context["threadId"]);
                    if context_thread.is_empty() {
                        str_of(&context["sessionId"])
                    } else {
                        context_thread
                    }
                };
                if caller_id.is_empty() {
                    Value::Null
                } else {
                    (*self.threads)("getById", vec![json!(caller_id)], host)
                        .await?
                        .unwrap_or(Value::Null)
                }
            };
            if str_of(&input["cwd"]) != str_of(&thread["workingDirectory"])
                && !str_of(&input["cwd"]).is_empty()
            {
                return Ok(fail(
                    "Agent publishing must use its assigned thread working directory.",
                ));
            }
            let caller_agent = str_of(&caller["personaAgentId"]);
            if !caller_agent.is_empty() && caller_agent != str_of(&thread["personaAgentId"]) {
                return Ok(fail(
                    "Agents must publish through their own GitHub App identity.",
                ));
            }
            if self.agent_github.is_none() {
                return Ok(fail(
                    "Agent GitHub App service unavailable; personal credentials cannot substitute.",
                ));
            }
            github_token = self
                .optional_call(
                    &self.agent_github,
                    "mintInstallationToken",
                    vec![
                        json!(user_id),
                        thread["personaAgentId"].clone(),
                        thread["id"].clone(),
                    ],
                    host,
                )
                .await?
                .unwrap_or(Value::Null);
            if github_token.is_null() || str_of(&github_token).is_empty() {
                return Ok(fail(
                    "Agent GitHub App token unavailable; personal credentials cannot substitute.",
                ));
            }
        }
        if self.git.is_none() {
            return Ok(fail("Git service unavailable on this gateway."));
        }

        let result = self
            .optional_call(
                &self.git,
                "runStackedAction",
                vec![json!({
                    "cwd": cwd,
                    "action": action,
                    "commitMessage": match str_of(&input["commitMessage"]) {
                        message if message.is_empty() => Value::Null,
                        message => json!(message),
                    },
                    "featureBranch": input["featureBranch"] == json!(true),
                    "baseBranch": input["baseBranch"],
                    "githubToken": github_token,
                })],
                host,
            )
            .await?
            .unwrap_or(Value::Null);
        let pr_url = {
            let url = str_of(&result["pr"]["url"]);
            if url.is_empty() {
                str_of(&result["push"]["createPrUrl"])
            } else {
                url
            }
        };

        let pr_base_branch = {
            let base = null_if_absent(&result["pr"]["baseBranch"]);
            if base.is_null() {
                input["baseBranch"].clone()
            } else {
                base
            }
        };

        let mut updated_thread = Value::Null;
        if thread.is_object() {
            updated_thread = self
                .call(
                    &self.threads,
                    "update",
                    vec![
                        thread["id"].clone(),
                        json!({
                            "branch": null_if_absent(&result["push"]["branch"]),
                            "prUrl": null_if_absent(&result["pr"]["url"]),
                            "prNumber": null_if_absent(&result["pr"]["number"]),
                            "prTitle": null_if_absent(&result["pr"]["title"]),
                            "prBaseBranch": pr_base_branch,
                            "prState": match str_of(&result["pr"]["status"]).as_str() {
                                "created" | "opened_existing" => json!("open"),
                                _ => Value::Null,
                            },
                        }),
                    ],
                    host,
                )
                .await?
                .unwrap_or(Value::Null);
            if !pr_url.is_empty() {
                let summary = if str_of(&result["pr"]["url"]).is_empty() {
                    format!("Open pull request: {pr_url}")
                } else {
                    format!("Pull request created: {pr_url}")
                };
                self.call(
                    &self.threads,
                    "addActivity",
                    vec![
                        thread["id"].clone(),
                        json!("activity"),
                        json!(summary),
                        json!({"action": action, "prUrl": pr_url, "result": result}),
                    ],
                    host,
                )
                .await?;
            }
        }

        let message = if !str_of(&result["pr"]["url"]).is_empty() {
            format!("Pull request ready: {}", str_of(&result["pr"]["url"]))
        } else if !pr_url.is_empty() {
            format!("Create pull request here: {pr_url}")
        } else {
            "Git action completed, but no pull request link is available.".to_string()
        };
        Ok(success_with_data(
            message,
            json!({
                "action": action,
                "prUrl": if pr_url.is_empty() { Value::Null } else { json!(pr_url) },
                "result": result,
                "thread": updated_thread,
            }),
        ))
    }

    fn truthy_field(&self, input: &Value, field: &str) -> bool {
        crate::services::calendar::truthy(&input[field])
    }

    /// Required port (e.g. `deps.threadService`): the TS code calls it directly.
    async fn call(
        &self,
        port: &JaitPort<C>,
        method: &str,
        args: Vec<Value>,
        host: &C,
    ) -> Result<Option<Value>, HostError> {
        (*port)(method, args, host).await
    }

    async fn optional_call(
        &self,
        port: &Option<JaitPort<C>>,
        method: &str,
        args: Vec<Value>,
        host: &C,
    ) -> Result<Option<Value>, HostError> {
        match port {
            Some(port) => (*port)(method, args, host).await,
            None => Ok(None),
        }
    }
}

fn thread_title(thread: &Value) -> String {
    match str_of(&thread["title"]) {
        title if title.is_empty() => "Untitled".to_string(),
        title => title,
    }
}

/// `undefined` (absent) and `null` are distinct in the TS update patch, so an
/// absent key is left out and an explicit `null` clears the column.
fn patchable_string(value: &Value) -> Value {
    match value {
        Value::String(_) => value.clone(),
        Value::Null => Value::Null,
        _ => Value::Null,
    }
}

fn patchable_number(value: &Value) -> Value {
    match value {
        Value::Number(_) => value.clone(),
        Value::Null => Value::Null,
        _ => Value::Null,
    }
}

fn null_if_absent(value: &Value) -> Value {
    if value.is_null() {
        Value::Null
    } else {
        value.clone()
    }
}

fn completed_ok(finished: &Value) -> bool {
    matches!(
        str_of(&finished["status"]).as_str(),
        "completed" | "complete"
    )
}
