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
#[derive(Default)]
pub struct LoopContext {
    pub session_id: String,
    pub user_id: Option<String>,
    pub thread_id: Option<String>,
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
            "loop.check" => service.check_unmonitored(id, input, user).map(Some),
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
