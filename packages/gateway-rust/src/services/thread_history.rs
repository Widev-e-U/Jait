//! Replay prompt construction over a typed activity source. The source authorizes
//! access and supplies decoded timestamps; no provider or live state is opened here.
use crate::contracts::bounded_json::Utf16Text;
use serde::Deserialize;
use serde_json::Value;
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayActivity {
    pub kind: String,
    pub created_at_ms: i64,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub payload: Value,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskContext {
    pub original_task: Option<String>,
    pub latest_instruction: Option<String>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ThreadLocation {
    pub working_directory: Option<String>,
    pub branch: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCheckpoint {
    pub calls: u64,
    #[serde(default)]
    pub last_action: Option<String>,
    #[serde(default)]
    pub stop_reason: Option<String>,
}
pub trait ThreadHistorySource {
    type Error;
    fn activities(&self, thread_id: &str, limit: usize)
    -> Result<Vec<ReplayActivity>, Self::Error>;
    fn task_context(&self, _thread_id: &str) -> Result<Option<TaskContext>, Self::Error> {
        Ok(None)
    }
    fn location(&self, _thread_id: &str) -> Result<Option<ThreadLocation>, Self::Error> {
        Ok(None)
    }
    fn execution_checkpoint(
        &self,
        _thread_id: &str,
    ) -> Result<Option<ExecutionCheckpoint>, Self::Error> {
        Ok(None)
    }
}
fn text(value: &str) -> Vec<u16> {
    value.encode_utf16().collect()
}
fn prefixed(prefix: &str, value: &str, limit: usize) -> Vec<u16> {
    let mut output = text(prefix);
    output.extend(value.encode_utf16().take(limit));
    output
}
fn joined(parts: &[Vec<u16>], separator: &str) -> Vec<u16> {
    let separator = text(separator);
    let mut output = vec![];
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            output.extend_from_slice(&separator)
        }
        output.extend_from_slice(part)
    }
    output
}
struct Message {
    user: bool,
    content: Vec<u16>,
}
fn message(activity: &ReplayActivity) -> Option<Message> {
    if activity.kind != "message" {
        return None;
    }
    let role = activity.payload.get("role")?.as_str()?;
    if role != "user" && role != "assistant" {
        return None;
    }
    let content = activity
        .payload
        .get("fullContent")
        .and_then(Value::as_str)
        .or_else(|| activity.payload.get("content").and_then(Value::as_str))?;
    let content = crate::text::js_trim(content);
    if content.is_empty() {
        return None;
    }
    Some(Message {
        user: role == "user",
        content: text(content),
    })
}
pub fn build_thread_history_replay_prompt<S: ThreadHistorySource>(
    source: &S,
    thread_id: &str,
) -> Result<Option<Utf16Text>, S::Error> {
    let mut activities = source.activities(thread_id, 2000)?;
    activities.reverse();
    activities.sort_by_key(|a| a.created_at_ms);
    let messages = activities.iter().filter_map(message).collect::<Vec<_>>();
    let task = source.task_context(thread_id)?;
    let original_task = task
        .as_ref()
        .and_then(|t| t.original_task.as_deref())
        .filter(|v| !v.is_empty());
    if messages.is_empty() && original_task.is_none() {
        return Ok(None);
    }
    let start = messages.len().saturating_sub(24);
    let original_line = messages
        .iter()
        .position(|m| m.user)
        .filter(|i| *i < start)
        .map(|i| {
            let mut line = text("Original task: ");
            line.extend(messages[i].content.iter().copied().take(4000));
            line
        });
    let mut used = original_line.as_ref().map(Vec::len).unwrap_or(0);
    let mut lines = vec![];
    for message in messages[start..].iter().rev() {
        let content = if message.content.len() > 4000 {
            let mut value = message.content[..2000].to_vec();
            value.extend(text("\n[Middle of message omitted]\n"));
            value.extend_from_slice(&message.content[message.content.len() - 2000..]);
            value
        } else {
            message.content.clone()
        };
        let mut line = text(if message.user {
            "User: "
        } else {
            "Assistant: "
        });
        line.extend(content);
        if used + line.len() > 12000 {
            break;
        }
        used += line.len();
        lines.push(line);
    }
    lines.reverse();
    let location = source.location(thread_id)?.unwrap_or_default();
    let execution = source.execution_checkpoint(thread_id)?;
    let mut checkpoint = vec![text("<thread-checkpoint>")];
    if let Some(original) = original_task {
        checkpoint.push(prefixed("Original task: ", original, 4000))
    }
    if let Some(latest) = task
        .as_ref()
        .and_then(|t| t.latest_instruction.as_deref())
        .filter(|v| !v.is_empty())
    {
        checkpoint.push(prefixed("Latest instruction: ", latest, 4000))
    }
    checkpoint.push(text(&format!(
        "Workspace: {}; branch: {}",
        location.working_directory.as_deref().unwrap_or("unchanged"),
        location.branch.as_deref().unwrap_or("unchanged")
    )));
    if let Some(execution) = execution {
        checkpoint.push(text(&format!(
            "Execution: {} calls; last action: {}; {}",
            execution.calls,
            execution.last_action.as_deref().unwrap_or("unknown"),
            execution
                .stop_reason
                .as_deref()
                .unwrap_or("limits carry forward")
        )));
    }
    let outcomes = activities
        .iter()
        .filter(|a| a.kind == "tool.result" || a.kind == "tool.error")
        .collect::<Vec<_>>();
    for outcome in &outcomes[outcomes.len().saturating_sub(6)..] {
        checkpoint.push(prefixed("Recorded tool outcome: ", &outcome.summary, 240))
    }
    if let Some(todo) = activities.iter().rev().find(|a| a.kind == "todo") {
        checkpoint.push(prefixed(
            "Remaining plan: ",
            &super::storage::json_text(&todo.payload),
            1600,
        ))
    }
    checkpoint.push(text("Preserve completed work and the latest instruction. Verify ongoing commands before repeating them."));
    checkpoint.push(text("</thread-checkpoint>"));
    checkpoint.push(text("<thread-history>"));
    checkpoint.push(text("This thread is resuming in a fresh provider session."));
    checkpoint.push(text(
        "Use the prior conversation below as the thread history and continue from it.",
    ));
    checkpoint.push(text(if lines.len() < messages.len() {
        "Only the most recent portion is included here."
    } else {
        "The previous conversation is included below."
    }));
    checkpoint.push(vec![]);
    if let Some(original_line) = original_line {
        checkpoint.push(original_line);
        checkpoint.push(vec![])
    }
    checkpoint.push(joined(&lines, "\n\n"));
    checkpoint.push(text("</thread-history>"));
    Ok(Some(Utf16Text(joined(&checkpoint, "\n"))))
}
