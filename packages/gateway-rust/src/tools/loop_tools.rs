//! Chat loop presentation adapter. Context comes from authenticated dispatch;
//! workers cannot use a tool to create or control another chat's autorun state.
use crate::services::chat_loops::{ChatLoop, ChatLoopService};
use serde::Serialize;
use serde_json::Value;
use std::sync::LazyLock;
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("loop-tools-metadata.json")).expect("loop metadata")
    });
    &DATA
}
#[derive(Clone, Default)]
pub struct LoopContext {
    pub session_id: String,
    pub user_id: Option<String>,
    pub thread_id: Option<String>,
    /// Credentials from authenticated dispatch, never tool input.
    pub api_keys: Option<std::collections::HashMap<String, String>>,
}
#[derive(Serialize)]
pub struct LoopToolResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Option<ChatLoop>>,
}
pub fn execute(
    name: &str,
    input: &Value,
    context: &LoopContext,
    service: &ChatLoopService<'_>,
) -> LoopToolResult {
    let result = (|| {
        let user = context.user_id.as_deref().filter(|s| !s.is_empty());
        if user.is_none()
            || context
                .thread_id
                .as_deref()
                .is_some_and(|s| !s.is_empty() && s != context.session_id)
        {
            return Err(
                "Loop tools require an authenticated chat; thread workers cannot start chat loops"
                    .into(),
            );
        }
        let id = &context.session_id;
        match name {
            "loop.goal" => service
                .goal(id, input.get("goal"), input.get("criteria"), user)
                .map(Some),
            "loop.status" => service.get(id, user),
            "loop.check" => {
                if crate::services::system_one::system_one_enabled(context.api_keys.as_ref()) {
                    return Err("Configured loop review requires asynchronous dispatch".into());
                }
                service.check_unmonitored(id, input, user).map(Some)
            }
            "loop.pause" => service.control(id, "pause", user).map(Some),
            "loop.resume" => service.control(id, "resume", user).map(Some),
            _ => Err("Unknown loop tool".into()),
        }
    })();
    match result {
        Ok(data) => LoopToolResult {
            ok: true,
            message: "Chat loop updated.".into(),
            data: Some(data),
        },
        Err(message) => LoopToolResult {
            ok: false,
            message,
            data: None,
        },
    }
}

/// Host composition uses the shared database worker in two short phases. The
/// decision request never occupies the SQL mailbox, and stale reviews cannot
/// overwrite pause, replacement, answer or a competing checkpoint.
pub struct MonitoredLoopTools {
    pub database: crate::db::worker::DatabaseWorker,
    pub runtime: crate::services::chat_loops::LoopRuntime,
    pub engine: std::sync::Arc<crate::services::system_one::SystemOne>,
}
impl MonitoredLoopTools {
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &LoopContext,
        signal: Option<&crate::services::system_one::Cancellation>,
    ) -> LoopToolResult {
        if name != "loop.check" {
            let name = name.to_owned();
            let input = input.clone();
            let context = context.clone();
            let runtime = self.runtime.clone();
            return match self
                .database
                .run(move |db| {
                    Ok(execute(
                        &name,
                        &input,
                        &context,
                        &ChatLoopService::new(db, runtime),
                    ))
                })
                .await
            {
                Ok(value) => value,
                Err(error) => LoopToolResult {
                    ok: false,
                    message: error.to_string(),
                    data: None,
                },
            };
        }
        let result = self.check(input, context, signal).await;
        match result {
            Ok(state) => LoopToolResult {
                ok: true,
                message: "Chat loop updated.".into(),
                data: Some(Some(state)),
            },
            Err(message) => LoopToolResult {
                ok: false,
                message,
                data: None,
            },
        }
    }
    async fn check(
        &self,
        input: &Value,
        context: &LoopContext,
        signal: Option<&crate::services::system_one::Cancellation>,
    ) -> Result<ChatLoop, String> {
        if context.user_id.as_deref().is_none_or(str::is_empty)
            || context
                .thread_id
                .as_deref()
                .is_some_and(|s| !s.is_empty() && s != context.session_id)
        {
            return Err(
                "Loop tools require an authenticated chat; thread workers cannot start chat loops"
                    .into(),
            );
        }
        let id = context.session_id.clone();
        let user = context.user_id.clone();
        let input = input.clone();
        let runtime = self.runtime.clone();
        // Return domain errors as values so DatabaseError does not erase their text.
        let prepared = self
            .database
            .run(move |db| {
                Ok(ChatLoopService::new(db, runtime).prepare_review(&id, &input, user.as_deref()))
            })
            .await
            .map_err(|e| e.to_string())??;
        let reviewed = prepared
            .review(&self.engine, context.api_keys.as_ref(), signal)
            .await;
        let runtime = self.runtime.clone();
        self.database
            .run(move |db| Ok(ChatLoopService::new(db, runtime).commit_review(reviewed)))
            .await
            .map_err(|e| e.to_string())?
    }
}
