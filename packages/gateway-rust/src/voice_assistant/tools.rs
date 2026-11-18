//! Voice registry routing and connection-owned background state.
//! The host implements existing consent-aware executor and provider lifecycle.
use crate::voice::VoiceFuture;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolContext {
    pub session_id: String,
    pub action_id: String,
    pub project_root: String,
    pub requested_by: String,
    pub user_id: String,
    // Secrets intentionally omitted from Debug and tool result serialization.
    #[serde(skip)]
    pub api_keys: BTreeMap<String, String>,
}
pub struct ToolResult {
    pub ok: bool,
    pub message: String,
    pub data: Option<Value>,
}
pub trait ConsentExecutor: Send + Sync {
    /// Must retain consent, user/project scope, cancellation and execution limits.
    /// Dropping the future must cancel the owned effect, including child processes.
    fn execute<'a>(
        &'a self,
        name: &'a str,
        arguments: Value,
        context: ToolContext,
    ) -> VoiceFuture<'a, ToolResult>;
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolSchema {
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    pub description: String,
    pub parameters: Value,
}
pub struct RegistryTool {
    pub schema: ToolSchema,
    pub external: bool,
}
pub fn schemas(builtins: &[ToolSchema], registry: Vec<RegistryTool>) -> Vec<ToolSchema> {
    let mut result = builtins.to_vec();
    for tool in registry {
        if !tool.external && !builtins.iter().any(|b| b.name == tool.schema.name) {
            result.push(tool.schema);
        }
    }
    result
}
/// The per-connection owner supplies authenticated context, never model fields.
pub async fn execute_registry(
    host: &impl ConsentExecutor,
    name: &str,
    arguments: Value,
    context: ToolContext,
) -> String {
    if name.len() > 256 || arguments.to_string().len() > 256 * 1024 {
        return "Tool blocked: voice tool input too large".into();
    }
    if !arguments.is_object() {
        return "Tool blocked: arguments must be an object".into();
    }
    match tokio::time::timeout(
        Duration::from_secs(120),
        host.execute(name, arguments, context),
    )
    .await
    {
        Err(_) => "Tool error: voice tool timed out".into(),
        Ok(Err(e)) => format!("Tool error: {e}"),
        Ok(Ok(result)) => {
            if !result.ok {
                return format!("Tool blocked: {}", result.message);
            }
            let output = match result.data {
                Some(data) => format!("{}\n{}", result.message, data),
                None => result.message,
            };
            if output.len() > 256 * 1024 {
                "Tool error: voice tool result too large".into()
            } else {
                output
            }
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Running,
    Completed,
    Error,
    Cancelled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTask {
    pub id: String,
    pub title: String,
    pub thread_id: String,
    pub session_id: Option<String>,
    pub provider_id: String,
    pub status: TaskStatus,
    pub cancelled: bool,
    pub result: Option<String>,
    pub error: Option<String>,
    pub started_at: u64,
}
/// Drop synchronously signals each owned cancellation channel. The supervised
/// provider host remains responsible for bounded termination/reaping.
pub trait CancelTask: Send {
    fn cancel(&mut self);
}
struct TaskEntry {
    task: BackgroundTask,
    cancellation: Option<Box<dyn CancelTask>>,
}
pub struct BackgroundTasks {
    entries: BTreeMap<String, TaskEntry>,
    insertion_order: Vec<String>,
    capacity: usize,
}
impl BackgroundTasks {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: BTreeMap::new(),
            insertion_order: vec![],
            capacity,
        }
    }
    pub fn register(
        &mut self,
        task: BackgroundTask,
        cancellation: Option<Box<dyn CancelTask>>,
    ) -> Result<(), String> {
        if self.entries.contains_key(&task.id) {
            return Err("Duplicate background task".into());
        }
        if self.entries.len() >= self.capacity {
            return Err("Background task capacity reached".into());
        }
        if task.id.len() > 512 || task.title.len() > 8192 {
            return Err("Background task metadata too large".into());
        }
        self.insertion_order.push(task.id.clone());
        self.entries
            .insert(task.id.clone(), TaskEntry { task, cancellation });
        Ok(())
    }
    pub fn list(&self) -> Vec<&BackgroundTask> {
        self.insertion_order
            .iter()
            .filter_map(|id| self.get(id))
            .collect()
    }
    pub fn get(&self, id: &str) -> Option<&BackgroundTask> {
        self.entries.get(id).map(|e| &e.task)
    }
    pub fn cancel(&mut self, id: &str) -> bool {
        let Some(entry) = self.entries.get_mut(id) else {
            return false;
        };
        if entry.task.status != TaskStatus::Running {
            return false;
        }
        entry.task.status = TaskStatus::Cancelled;
        entry.task.cancelled = true;
        if let Some(mut cancel) = entry.cancellation.take() {
            cancel.cancel();
        }
        true
    }
    /// Late provider completion cannot resurrect a cancelled connection task.
    pub fn finish(&mut self, id: &str, result: Result<String, String>) -> Result<bool, String> {
        let Some(entry) = self.entries.get_mut(id) else {
            return Ok(false);
        };
        if entry.task.status != TaskStatus::Running {
            return Ok(false);
        }
        if result.as_ref().map_or_else(|e| e.len(), |r| r.len()) > 256 * 1024 {
            return Err("Background result too large".into());
        }
        match result {
            Ok(text) => {
                entry.task.result = Some(text);
                entry.task.status = TaskStatus::Completed;
            }
            Err(error) => {
                entry.task.error = Some(error);
                entry.task.status = TaskStatus::Error;
            }
        }
        entry.cancellation.take();
        Ok(true)
    }
    pub fn remove(&mut self, id: &str) {
        self.cancel(id);
        self.entries.remove(id);
        self.insertion_order.retain(|key| key != id);
    }
    pub fn clear(&mut self) {
        for entry in self.entries.values_mut() {
            if entry.task.status == TaskStatus::Running {
                entry.task.status = TaskStatus::Cancelled;
                entry.task.cancelled = true;
                if let Some(mut cancel) = entry.cancellation.take() {
                    cancel.cancel();
                }
            }
        }
        self.entries.clear();
        self.insertion_order.clear();
    }
}
impl Drop for BackgroundTasks {
    fn drop(&mut self) {
        self.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    struct Cancellation(Arc<AtomicUsize>);
    impl CancelTask for Cancellation {
        fn cancel(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    #[test]
    fn cancellation_is_once_and_late_completion_is_ignored() {
        let count = Arc::new(AtomicUsize::new(0));
        let mut tasks = BackgroundTasks::new(1);
        tasks
            .register(
                BackgroundTask {
                    id: "1".into(),
                    title: "task".into(),
                    thread_id: "t".into(),
                    session_id: None,
                    provider_id: "codex".into(),
                    status: TaskStatus::Running,
                    cancelled: false,
                    result: None,
                    error: None,
                    started_at: 0,
                },
                Some(Box::new(Cancellation(count.clone()))),
            )
            .unwrap();
        assert!(tasks.cancel("1"));
        assert!(!tasks.finish("1", Ok("late".into())).unwrap());
        tasks.clear();
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn builtin_schema_wins_and_external_is_filtered() {
        let schema = ToolSchema {
            kind: "function".into(),
            name: "stop_voice".into(),
            description: "stop".into(),
            parameters: serde_json::json!({}),
        };
        let actual = schemas(
            std::slice::from_ref(&schema),
            vec![
                RegistryTool {
                    schema: schema.clone(),
                    external: false,
                },
                RegistryTool {
                    schema: schema.clone(),
                    external: true,
                },
            ],
        );
        assert_eq!(actual.len(), 1);
    }
}
