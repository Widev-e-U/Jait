//! Built-in voice formatting and dispatch. Host queries are typed, authenticated
//! service operations; mutating calls reuse the scoped executor.
use super::tools::{ConsentExecutor, TaskStatus, ToolContext, ToolSchema, execute_registry};
use crate::voice::VoiceFuture;
use serde_json::{Value, json};
pub enum Lookup {
    TimeAndDate,
    SystemInfo,
    Status,
    Sessions { limit: usize },
    Projects,
    Threads { limit: usize },
    Memory { query: String, limit: usize },
    Location,
    Weather { city: Option<String> },
    Project { id: String },
}
/// Lookup must enforce user visibility and existing network scope. Time returns
/// the locale-formatted TS phrase; system info returns existing host fields.
/// Arrays have native session/project/thread record shapes; memory returns
/// content records. Location/weather HTTP is deadline and response-byte bounded.
pub struct HelperDefaults {
    pub registered: Vec<String>,
    pub selection: Option<super::delegation::ProviderSelection>,
    pub working_directory: String,
}
pub trait BuiltinHost: Send + Sync {
    fn delegation(&self) -> Option<&dyn super::delegation::DelegationHost> {
        None
    }
    fn helper_defaults(&self, _user: &str) -> Option<HelperDefaults> {
        None
    }
    fn lookup(&self, query: Lookup, user: &str) -> VoiceFuture<'_, Value>;
}
pub struct ConnectionTools {
    pub active_project_id: Option<String>,
    pub background: super::background::BackgroundSupervisor,
}
impl ConnectionTools {
    pub fn new(max_background: usize) -> Self {
        Self {
            active_project_id: None,
            background: super::background::BackgroundSupervisor::new(max_background),
        }
    }
    pub fn announcements(&mut self) -> Vec<String> {
        self.background.poll().into_iter().map(|task| match task.status {
            TaskStatus::Completed=>format!("Background task \"{}\" finished. Tell the user the result in 1-2 short sentences: {}",task.title,cut(task.result.as_deref().unwrap_or(""),1500)),
            TaskStatus::Error=>format!("Background task \"{}\" failed. Tell the user it failed and briefly why: {}",task.title,cut(task.error.as_deref().unwrap_or(""),500)),
            _=>format!("Background task \"{}\" was cancelled.",task.title),
        }).collect()
    }
    pub async fn execute(
        &mut self,
        name: &str,
        args: &Value,
        host: &impl BuiltinHost,
        executor: &impl ConsentExecutor,
        mut context: ToolContext,
    ) -> String {
        if args.to_string().len() > 256 * 1024 {
            return "Tool error: voice input too large".into();
        }
        match name {
            "stop_voice" => "__STOP_VOICE__".into(),
            "ask_agent_about_request" => {
                let question = string(args, "question").trim().to_owned();
                if question.is_empty() {
                    return "No question provided.".into();
                }
                let Some(delegate) = host.delegation() else {
                    return "Agent handoff is not available.".into();
                };
                let Some(defaults) = host.helper_defaults(&context.user_id) else {
                    return "Agent handoff is not available.".into();
                };
                let requested = string(args, "provider");
                let selection = match super::delegation::resolve_provider(
                    Some(&requested),
                    &defaults.registered,
                    defaults.selection,
                ) {
                    Ok(s) => s,
                    Err(e) => return e,
                };
                let directory = string(args, "workingDirectory").trim().to_owned();
                let duration =
                    super::delegation::timeout_ms(args.get("timeoutMs").and_then(Value::as_f64));
                let acknowledgement = cut(&question, 120);
                let request = super::delegation::HelperRequest {
                    question,
                    working_directory: if directory.is_empty() {
                        defaults.working_directory
                    } else {
                        directory
                    },
                    selection,
                    context,
                };
                if args.get("background").and_then(Value::as_bool) == Some(true) {
                    return match self
                        .background
                        .start(
                            delegate,
                            request,
                            duration,
                            chrono::Utc::now().timestamp_millis().max(0) as u64,
                        )
                        .await
                    {
                        Ok(id) => format!(
                            "Started a background task ({id}) for: \"{acknowledgement}\". I'll update you when it's done."
                        ),
                        Err(error) => format!("Agent handoff failed: {error}"),
                    };
                }
                let (_cancel, receiver) = tokio::sync::watch::channel(false);
                match super::delegation::ask(delegate, request, duration, receiver).await {
                    Ok(answer) => cut(&answer, 4000),
                    Err(error) => format!("Agent handoff failed: {error}"),
                }
            }
            "send_to_agent" => {
                let message = string(args, "message");
                if message.is_empty() {
                    return "No task provided.".into();
                }
                let provider = args
                    .get("provider")
                    .filter(|v| !v.is_null())
                    .map(js_string)
                    .unwrap_or_else(|| "claude-code".into());
                execute_registry(
                    executor,
                    "thread.create",
                    json!({"title":cut(&message,80),"providerId":provider}),
                    context,
                )
                .await
            }
            "select_project" => {
                let id = string(args, "projectId").trim().to_owned();
                if id.is_empty() {
                    return "No projectId provided.".into();
                }
                if id.len() > 512 {
                    return "Tool error: project id too large".into();
                }
                // TS selection stores id without checking; actual root resolution
                // is user-scoped before each registry execution.
                self.active_project_id = Some(id.clone());
                format!("Selected project {id}.")
            }
            "list_background_tasks" => {
                let tasks = self.background.tasks.list();
                if tasks.is_empty() {
                    return "No background tasks running.".into();
                }
                tasks
                    .into_iter()
                    .map(|t| {
                        let status = match t.status {
                            TaskStatus::Running => "running",
                            TaskStatus::Completed => "completed",
                            TaskStatus::Error => "error",
                            TaskStatus::Cancelled => "cancelled",
                        };
                        let tail = match t.status {
                            TaskStatus::Completed => {
                                format!(" — {}", cut(t.result.as_deref().unwrap_or(""), 120))
                            }
                            TaskStatus::Error => {
                                format!(" — error: {}", cut(t.error.as_deref().unwrap_or(""), 120))
                            }
                            _ => String::new(),
                        };
                        format!(
                            "- [{status}] {} (id: {}, provider: {}){tail}",
                            t.title, t.id, t.provider_id
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            "cancel_background_task" => {
                let id = string(args, "taskId").trim().to_owned();
                let Some(task) = self.background.tasks.get(&id).cloned() else {
                    return "No background task with that id.".into();
                };
                if self.background.tasks.cancel(&id) {
                    format!("Cancelled background task \"{}\" ({id}).", task.title)
                } else {
                    let status = match task.status {
                        TaskStatus::Running => "running",
                        TaskStatus::Completed => "completed",
                        TaskStatus::Error => "error",
                        TaskStatus::Cancelled => "cancelled",
                    };
                    format!(
                        "Background task \"{}\" ({id}) is not running (status: {status}).",
                        task.title
                    )
                }
            }
            "get_time_and_date" => lookup_text(host, Lookup::TimeAndDate, &context.user_id).await,
            "get_system_info" => lookup_json(host, Lookup::SystemInfo, &context.user_id).await,
            "jait_system_status" => lookup_json(host, Lookup::Status, &context.user_id).await,
            "list_sessions" | "list_projects" | "list_threads" => {
                let query = match name {
                    "list_sessions" => Lookup::Sessions { limit: 10 },
                    "list_projects" => Lookup::Projects,
                    _ => Lookup::Threads { limit: 10 },
                };
                let rows = match bounded_lookup(host, query, &context.user_id).await {
                    Ok(Value::Array(rows)) => rows,
                    Ok(_) => vec![],
                    Err(e) => return format!("Tool error: {e}"),
                };
                if rows.is_empty() {
                    return match name {
                        "list_sessions" => "No active sessions found.",
                        "list_projects" => "No projects configured.",
                        _ => "No agent threads found.",
                    }
                    .into();
                }
                rows.iter()
                    .take(1024)
                    .map(|r| match name {
                        "list_sessions" => format!(
                            "- {} (id: {})",
                            field(r, "name", "Untitled"),
                            field(r, "id", "undefined")
                        ),
                        "list_projects" => format!(
                            "- {} (id: {})",
                            r.get("title")
                                .or_else(|| r.get("rootPath"))
                                .and_then(Value::as_str)
                                .unwrap_or("Unknown"),
                            field(r, "id", "undefined")
                        ),
                        _ => format!(
                            "- [{}] {} ({})",
                            field(r, "status", "undefined"),
                            field(r, "title", "Untitled"),
                            field(r, "providerId", "undefined")
                        ),
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            "search_memory" => {
                let query = string(args, "query");
                if query.is_empty() {
                    return "No search query provided.".into();
                }
                match bounded_lookup(
                    host,
                    Lookup::Memory {
                        query: query.clone(),
                        limit: 5,
                    },
                    &context.user_id,
                )
                .await
                {
                    Ok(Value::Array(rows)) if !rows.is_empty() => rows
                        .iter()
                        .take(5)
                        .map(|r| format!("- {}", cut(field(r, "content", ""), 200)))
                        .collect::<Vec<_>>()
                        .join("\n"),
                    Ok(_) => format!("No memories found about: {query}"),
                    Err(_) => "Memory search failed.".into(),
                }
            }
            "save_memory" => {
                let content = string(args, "content");
                if content.is_empty() {
                    return "Nothing to save.".into();
                }
                // Persistent mutation reuses existing memory tool consent/scope;
                // authenticated project context is retained.
                execute_registry(executor,"memory.save",json!({"scope":"project","content":content,"source":{"type":"voice-assistant","id":"voice","surface":"voice"}}),context).await
            }
            "search_web" => {
                let query = args
                    .get("query")
                    .or_else(|| args.get("q"))
                    .or_else(|| args.get("search"))
                    .map(js_string)
                    .unwrap_or_default()
                    .trim()
                    .to_owned();
                if query.is_empty() {
                    return "Search failed: no query provided. Please specify what to search for."
                        .into();
                }
                match tokio::time::timeout(
                    std::time::Duration::from_secs(15),
                    execute_registry(executor, "web.search", json!({"query":query}), context),
                )
                .await
                {
                    Ok(output) => cut(&output, 3000),
                    Err(_) => "Search timed out after 15 seconds. Try a simpler query.".into(),
                }
            }
            "get_location" => lookup_json(host, Lookup::Location, &context.user_id).await,
            "get_weather" => {
                let city = string(args, "city").trim().to_owned();
                lookup_text(
                    host,
                    Lookup::Weather {
                        city: (!city.is_empty()).then_some(city),
                    },
                    &context.user_id,
                )
                .await
            }
            _ => {
                context.project_root.clear();
                if let Some(id) = &self.active_project_id
                    && let Ok(record) =
                        bounded_lookup(host, Lookup::Project { id: id.clone() }, &context.user_id)
                            .await
                {
                    context.project_root = record
                        .get("rootPath")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .into();
                }
                execute_registry(executor, name, args.clone(), context).await
            }
        }
    }
}
async fn bounded_lookup(
    host: &impl BuiltinHost,
    query: Lookup,
    user: &str,
) -> Result<Value, String> {
    let result = tokio::time::timeout(std::time::Duration::from_secs(15), host.lookup(query, user))
        .await
        .map_err(|_| "Voice lookup timed out")??;
    if result.to_string().len() > 256 * 1024 {
        return Err("Voice lookup result too large".into());
    }
    Ok(result)
}
async fn lookup_text(host: &impl BuiltinHost, query: Lookup, user: &str) -> String {
    match bounded_lookup(host, query, user).await {
        Ok(v) => js_string(&v),
        Err(e) => format!("Tool error: {e}"),
    }
}
async fn lookup_json(host: &impl BuiltinHost, query: Lookup, user: &str) -> String {
    match bounded_lookup(host, query, user).await {
        Ok(v) => v.to_string(),
        Err(e) => format!("Tool error: {e}"),
    }
}
fn field<'a>(v: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or(fallback)
}
fn string(v: &Value, key: &str) -> String {
    v.get(key)
        .filter(|v| !v.is_null())
        .map(js_string)
        .unwrap_or_default()
}
fn js_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Object(_) => "[object Object]".into(),
        Value::Null => "null".into(),
        _ => v.to_string(),
    }
}
fn cut(s: &str, count: usize) -> String {
    s.chars().take(count).collect()
}
pub fn builtin_schemas() -> Vec<ToolSchema> {
    let definitions = [
        (
            "ask_agent_about_request",
            "Ask a regular agent for the exact question; defaults to foreground.",
            Some("question"),
        ),
        (
            "send_to_agent",
            "Create an agent thread for a task.",
            Some("message"),
        ),
        (
            "get_time_and_date",
            "Get the current date, time, and day of the week.",
            None,
        ),
        (
            "get_system_info",
            "Get host computer OS, CPU, and memory usage.",
            None,
        ),
        (
            "jait_system_status",
            "Get active sessions and running thread counts.",
            None,
        ),
        ("list_sessions", "List recent chat sessions.", None),
        ("list_projects", "List configured projects.", None),
        ("list_threads", "List recent agent threads.", None),
        ("search_memory", "Recall relevant context.", Some("query")),
        (
            "save_memory",
            "Remember user supplied information.",
            Some("content"),
        ),
        (
            "search_web",
            "Search current information with a nonempty query.",
            Some("query"),
        ),
        (
            "get_location",
            "Get approximate configured or IP location.",
            None,
        ),
        (
            "get_weather",
            "Get current weather for an optional city.",
            None,
        ),
        (
            "select_project",
            "Select project for subsequent tools.",
            Some("projectId"),
        ),
        ("stop_voice", "End this voice session.", None),
        (
            "list_background_tasks",
            "List running and recently completed tasks.",
            None,
        ),
        (
            "cancel_background_task",
            "Cancel a running task.",
            Some("taskId"),
        ),
    ];
    definitions.into_iter().map(|(name,description,required)|{
        let mut properties=serde_json::Map::new();
        if let Some(key)=required {properties.insert(key.into(),json!({"type":"string"}));}
        if name=="get_weather" {properties.insert("city".into(),json!({"type":"string"}));}
        if name=="ask_agent_about_request" {
            properties.insert("provider".into(),json!({"type":"string","enum":["jait","codex","claude-code"]}));
            properties.insert("workingDirectory".into(),json!({"type":"string"}));
            properties.insert("timeoutMs".into(),json!({"type":"number"}));
            properties.insert("background".into(),json!({"type":"boolean"}));
        }
        if name=="send_to_agent" {properties.insert("provider".into(),json!({"type":"string","enum":["claude-code","codex"]}));}
        ToolSchema{kind:"function".into(),name:name.into(),description:description.into(),parameters:json!({"type":"object","properties":properties,"required":required.into_iter().collect::<Vec<_>>()})}
    }).collect()
}
