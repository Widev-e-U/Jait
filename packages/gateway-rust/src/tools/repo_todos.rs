//! Repository todo factory over explicit owner-authorized service ports.
//! Persistence and thread lifecycle remain independently inventoried services.
use super::{
    core_io::HostError,
    list_preview::{ellipsize_text, summarize_with_preview},
    memory_tools::MemoryToolResult,
};
use crate::{
    contracts::bounded_json::Utf16Text,
    services::calendar::{js_text, truthy},
    text::js_trim,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::{Arc, OnceLock};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TodoService {
    Repositories,
    Todos,
    Threads,
}
impl TodoService {
    pub fn name(self) -> &'static str {
        match self {
            Self::Repositories => "repositories",
            Self::Todos => "todos",
            Self::Threads => "threads",
        }
    }
}
pub struct TodoContext<C> {
    pub fields: Value,
    pub capabilities: C,
}
pub type TodoPort<C> = Arc<
    dyn for<'a> Fn(
            TodoService,
            &'a str,
            Vec<Value>,
            &'a TodoContext<C>,
        ) -> BoxFuture<'a, Result<Value, HostError>>
        + Send
        + Sync,
>;
pub struct RepoTodoTool<C> {
    pub port: TodoPort<C>,
    pub threads: bool,
}
pub fn metadata() -> &'static Value {
    static META: OnceLock<Value> = OnceLock::new();
    META.get_or_init(|| {
        serde_json::from_str(include_str!("repo-todo-metadata.json")).expect("factory metadata")
    })
}
fn output(ok: bool, message: impl Into<Utf16Text>, data: Option<Value>) -> MemoryToolResult {
    MemoryToolResult {
        ok: json!(ok),
        message: message.into(),
        data,
    }
}
fn error(message: impl Into<Utf16Text>) -> MemoryToolResult {
    output(false, message, None)
}
fn read_string<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key)
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|s| !s.is_empty())
}
fn text(v: &Value, key: &str) -> String {
    v.get(key).map(js_text).unwrap_or("undefined".into())
}
fn tags(v: &Value) -> Option<Value> {
    let raw = v.get("tags")?;
    let mut tags = vec![];
    if let Some(values) = raw.as_array() {
        for s in values.iter().filter_map(Value::as_str) {
            let s = js_trim(s).to_lowercase();
            if !s.is_empty() && !tags.contains(&s) {
                tags.push(s);
            }
        }
    }
    tags.truncate(12);
    Some(json!(tags))
}
fn properties(v: &Value, include_message: bool) -> Value {
    let mut out = json!({});
    if include_message && let Some(message) = read_string(v, "message") {
        out["message"] = json!(message);
    }
    for (key, allowed) in [
        ("status", &["open", "in_progress", "done"][..]),
        ("priority", &["low", "normal", "high"][..]),
    ] {
        if let Some(value) = read_string(v, key).filter(|s| allowed.contains(s)) {
            out[key] = json!(value);
        }
    }
    if let Some(raw) = v.get("dueDate") {
        let due = raw.as_str().map(js_trim).filter(|s| !s.is_empty());
        out["dueDate"] = due
            .filter(|s| {
                let b = s.as_bytes();
                b.len() == 10
                    && b[4] == b'-'
                    && b[7] == b'-'
                    && b.iter()
                        .enumerate()
                        .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
            })
            .map(|s| json!(s))
            .unwrap_or(Value::Null);
    }
    if let Some(value) = tags(v) {
        out["tags"] = value;
    }
    out
}
impl<C: Send + Sync> RepoTodoTool<C> {
    pub async fn execute(
        &self,
        input: &Value,
        context: &TodoContext<C>,
    ) -> Result<MemoryToolResult, HostError> {
        let empty = json!({});
        let body = if input.is_object() { input } else { &empty };
        let Some(action) = read_string(body, "action") else {
            return Ok(error("action is required"));
        };
        let repositories = (self.port)(
            TodoService::Repositories,
            "list",
            vec![context.fields.get("userId").cloned().unwrap_or(Value::Null)],
            context,
        )
        .await?;
        let repositories = repositories.as_array().expect("typed repository list");
        let repo = if let Some(id) = read_string(body, "repoId") {
            repositories.iter().find(|r| r["id"] == id)
        } else {
            let root = context.fields["projectRoot"]
                .as_str()
                .expect("trusted project root");
            repositories
                .iter()
                .find(|r| root.starts_with(&text(r, "localPath")))
                .or_else(|| {
                    repositories
                        .iter()
                        .find(|r| root.contains(&text(r, "name")))
                })
        };
        let Some(repo) = repo else {
            return Ok(error(
                "Could not resolve a repository for this todo action.",
            ));
        };
        let repo_name = text(repo, "name");
        if action == "list" {
            let todos = (self.port)(
                TodoService::Todos,
                "listByRepo",
                vec![repo["id"].clone()],
                context,
            )
            .await?;
            let lines = todos
                .as_array()
                .expect("typed todo list")
                .iter()
                .enumerate()
                .map(|(i, todo)| {
                    let mut line = format!("{}. [{}] ", i + 1, text(todo, "status"))
                        .encode_utf16()
                        .collect::<Vec<_>>();
                    line.extend(
                        ellipsize_text(
                            &text(todo, "message").encode_utf16().collect::<Vec<_>>(),
                            None,
                        )
                        .0,
                    );
                    let mut details = vec![];
                    if truthy(&todo["priority"]) && todo["priority"] != "normal" {
                        details.push(text(todo, "priority"));
                    }
                    if truthy(&todo["dueDate"]) {
                        details.push(format!("due {}", text(todo, "dueDate")));
                    }
                    if !details.is_empty() {
                        line.extend(format!(" · {}", details.join(" · ")).encode_utf16());
                    }
                    Utf16Text(line)
                })
                .collect::<Vec<_>>();
            let n = todos.as_array().unwrap().len();
            let summary = format!(
                "Loaded {n} todo{} for {repo_name}:",
                if n == 1 { "" } else { "s" }
            );
            return Ok(output(
                true,
                summarize_with_preview(&summary.encode_utf16().collect::<Vec<_>>(), &lines, None),
                Some(json!({"repo":repo,"todos":todos})),
            ));
        }
        if action == "add" {
            let Some(message) = read_string(body, "message") else {
                return Ok(error("message is required for add"));
            };
            let thread = if self.threads {
                (self.port)(
                    TodoService::Threads,
                    "getById",
                    vec![
                        context
                            .fields
                            .get("sessionId")
                            .cloned()
                            .unwrap_or(Value::Null),
                    ],
                    context,
                )
                .await?
            } else {
                Value::Null
            };
            let mut create = properties(body, false);
            create["repoId"] = repo["id"].clone();
            create["userId"] = context.fields.get("userId").cloned().unwrap_or(Value::Null);
            create["message"] = json!(message);
            create["sourceThreadId"] = thread
                .get("id")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(Value::Null);
            create["sourceThreadTitle"] = thread
                .get("title")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or(Value::Null);
            // userId is an optional input property, whereas thread provenance is
            // explicitly nullable. Preserve omission for the native persistence adapter.
            if context.fields.get("userId").is_none() {
                create.as_object_mut().unwrap().remove("userId");
            }
            let todo = (self.port)(TodoService::Todos, "create", vec![create], context).await?;
            return Ok(output(
                true,
                format!("Saved a Jait todo for {repo_name}."),
                Some(json!({"repo":repo,"todo":todo})),
            ));
        }
        if action == "update" || action == "remove" {
            let Some(id) = read_string(body, "todoId") else {
                return Ok(error(format!("todoId is required for {action}")));
            };
            let todo = (self.port)(TodoService::Todos, "getById", vec![json!(id)], context).await?;
            if !truthy(&todo)
                || todo.get("repoId") != repo.get("id")
                || todo.get("userId")
                    != Some(
                        context
                            .fields
                            .get("userId")
                            .filter(|v| !v.is_null())
                            .unwrap_or(&Value::Null),
                    )
            {
                return Ok(error("Todo not found."));
            }
            if action == "update" {
                let value = (self.port)(
                    TodoService::Todos,
                    "update",
                    vec![todo["id"].clone(), properties(body, true)],
                    context,
                )
                .await?;
                return Ok(output(
                    true,
                    format!("Updated Jait todo for {repo_name}."),
                    Some(json!({"repo":repo,"todo":value})),
                ));
            }
            (self.port)(TodoService::Todos, "delete", vec![json!(id)], context).await?;
            return Ok(output(
                true,
                format!("Removed Jait todo from {repo_name}."),
                Some(json!({"repoId":repo["id"],"todoId":id})),
            ));
        }
        Ok(error(format!("Unsupported action: {action}")))
    }
}
