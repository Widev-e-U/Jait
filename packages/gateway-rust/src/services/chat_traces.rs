//! Read-only persisted chat traces. Run on the bounded database worker.
//! Optional fields retain the reference's omission semantics for invalid JSON.
use rusqlite::{Connection, params};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChatTracesOptions {
    pub chat_id: String,
    pub user_id: Option<String>,
    pub include_messages: Option<bool>,
    pub include_threads: Option<bool>,
    pub include_tool_calls: Option<bool>,
    pub include_context_flow: Option<bool>,
    pub include_thinking: Option<bool>,
    pub message_limit: Option<f64>,
    pub activity_limit: Option<f64>,
}
pub(crate) fn limit(value: Option<f64>, default: u32, max: u32) -> u32 {
    value
        .filter(|v| v.is_finite() && *v > 0.0)
        .map(|v| v.floor().min(max as f64) as u32)
        .unwrap_or(default)
}
pub(crate) fn rows(
    db: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> rusqlite::Result<Vec<Value>> {
    let mut statement = db.prepare(sql)?;
    let names: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect();
    statement
        .query_map(params, |row| {
            let mut value = serde_json::Map::new();
            for (index, name) in names.iter().enumerate() {
                let cell = match row.get_ref(index)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Text(v) => {
                        json!(std::str::from_utf8(v).map_err(|_| rusqlite::Error::InvalidQuery)?)
                    }
                    rusqlite::types::ValueRef::Integer(v) => json!(v),
                    rusqlite::types::ValueRef::Real(v) => json!(v),
                    _ => return Err(rusqlite::Error::InvalidQuery),
                };
                value.insert(name.clone(), cell);
            }
            Ok(Value::Object(value))
        })?
        .collect()
}
fn parse_field(value: &mut Value, key: &str, include: bool) {
    let raw = value.as_object_mut().expect("row object").remove(key);
    if include
        && let Some(parsed) = raw.and_then(|v| {
            v.as_str()
                .and_then(|v| serde_json::from_str::<Value>(v).ok())
        })
    {
        value[key] = parsed;
    }
}
pub struct ChatTracesService<'a> {
    db: &'a Connection,
}
impl<'a> ChatTracesService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self { db }
    }
    pub fn traces(&self, options: &ChatTracesOptions) -> rusqlite::Result<Value> {
        let session = rows(self.db, "SELECT id,user_id AS userId,project_id AS projectId,name,project_path AS projectPath,status,created_at AS createdAt,last_active_at AS lastActiveAt FROM sessions WHERE id=?1 AND (?2 IS NULL OR user_id=?2) LIMIT 1", params![options.chat_id,options.user_id])?.into_iter().next();
        let mut messages = vec![];
        let mut threads = vec![];
        if session.is_some() && options.include_messages != Some(false) {
            messages = rows(
                self.db,
                "SELECT id,role,content,tool_calls AS toolCalls,segments,context_flow AS contextFlow,thinking,created_at AS createdAt FROM messages WHERE session_id=?1 ORDER BY created_at DESC LIMIT ?2",
                params![options.chat_id, limit(options.message_limit, 200, 1000)],
            )?;
            messages.reverse();
            for message in &mut messages {
                parse_field(
                    message,
                    "toolCalls",
                    options.include_tool_calls != Some(false),
                );
                parse_field(
                    message,
                    "segments",
                    options.include_tool_calls != Some(false),
                );
                parse_field(
                    message,
                    "contextFlow",
                    options.include_context_flow == Some(true),
                );
                if options.include_thinking != Some(true) {
                    message.as_object_mut().expect("row").remove("thinking");
                }
            }
        }
        if session.is_some() && options.include_threads != Some(false) {
            threads = rows(
                self.db,
                "SELECT id,title,provider_id AS providerId,model,runtime_mode AS runtimeMode,kind,status,error,working_directory AS workingDirectory,branch,pr_url AS prUrl,pr_state AS prState,execution_node_name AS executionNodeName,created_at AS createdAt,updated_at AS updatedAt,completed_at AS completedAt FROM agent_threads WHERE session_id=?1 AND (?2 IS NULL OR user_id=?2) ORDER BY created_at ASC",
                params![options.chat_id, options.user_id],
            )?;
            for thread in &mut threads {
                let mut activities = rows(
                    self.db,
                    "SELECT id,kind,summary,payload,created_at AS createdAt FROM agent_thread_activities WHERE thread_id=?1 ORDER BY created_at DESC LIMIT ?2",
                    params![
                        thread["id"].as_str(),
                        limit(options.activity_limit, 200, 2000)
                    ],
                )?;
                activities.reverse();
                for activity in &mut activities {
                    parse_field(activity, "payload", true);
                }
                thread["activities"] = json!(activities);
            }
        }
        let activities: usize = threads
            .iter()
            .map(|t| t["activities"].as_array().expect("activities").len())
            .sum();
        Ok(
            json!({"chatId":options.chat_id,"found":session.is_some(),"session":session,"counts":{"messages":messages.len(),"threads":threads.len(),"threadActivities":activities},"messages":messages,"threads":threads}),
        )
    }
}
