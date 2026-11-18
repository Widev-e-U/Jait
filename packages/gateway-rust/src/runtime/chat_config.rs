//! Explicit model-only migration activation. Tool registries/sandboxes stay separate.
use super::{
    application::ApplicationError,
    chat_turn::{TurnConfig, TurnProvider, TurnTools},
};
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::openai_stream::{EventSink, OpenAiHttp, ParsedStream, StreamFailure},
    routes::chat::{ChatFactory, PreparedChat},
    security::{
        consent_executor::{ToolExecutionContext, ToolResult},
        http_auth::AuthUser,
    },
    services::sessions::SessionRecord,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

/// Secrets are never Debug/Serialize or discovered from disk/user request data.
#[derive(Clone)]
pub struct ChatConfiguration {
    base_url: String,
    api_key: String,
    model: String,
    prompt: String,
}
impl ChatConfiguration {
    pub fn from_lookup(
        lookup: impl Fn(&str) -> Option<String>,
    ) -> Result<Option<Self>, ApplicationError> {
        match lookup("JAIT_RUST_CHAT").as_deref() {
            None | Some("") | Some("0") => return Ok(None),
            Some("1") => {}
            _ => return Err("JAIT_RUST_CHAT must be 0 or 1".into()),
        }
        if lookup("JAIT_RUST_APPLICATION").as_deref() != Some("1") {
            return Err("JAIT_RUST_CHAT requires JAIT_RUST_APPLICATION=1".into());
        }
        let base_url = lookup("JAIT_RUST_CHAT_BASE_URL")
            .filter(|value| !value.trim().is_empty())
            .ok_or("JAIT_RUST_CHAT_BASE_URL is required")?;
        let model = lookup("JAIT_RUST_CHAT_MODEL")
            .filter(|value| {
                !value.trim().is_empty()
                    && value.len() <= 256
                    && !value.chars().any(char::is_control)
            })
            .ok_or("JAIT_RUST_CHAT_MODEL is required and must be bounded text")?;
        let api_key = lookup("JAIT_RUST_CHAT_API_KEY").unwrap_or_default();
        if api_key.len() > 8192 || api_key.chars().any(char::is_control) {
            return Err("Invalid JAIT_RUST_CHAT_API_KEY".into());
        }
        // Validate before the application opens any database. No HTTP is sent.
        OpenAiHttp::configured(&base_url, &api_key, "configuration-check")
            .map_err(|_| "Invalid JAIT_RUST_CHAT_BASE_URL or model client configuration")?;
        Ok(Some(Self{base_url,api_key,model,prompt:"You are Jait, a coding and security workbench assistant. This migration runtime currently exposes text chat only. Be concise, distinguish observations from assumptions, and never claim tools ran without evidence.".into()}))
    }
    pub fn factory(self) -> Arc<dyn ChatFactory> {
        Arc::new(self)
    }
}
struct ConfiguredModel {
    http: OpenAiHttp,
    prompt: String,
}
impl TurnProvider for ConfiguredModel {
    fn stream<'a>(
        &'a self,
        mut body: Value,
        cancellation: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
        Box::pin(async move {
            let messages = body
                .get_mut("messages")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| StreamFailure::Other("Invalid configured model request".into()))?;
            messages.insert(0, json!({"role":"system","content":self.prompt}));
            self.http.stream(body, cancellation, sink).await
        })
    }
}
struct NoTools;
impl TurnTools for NoTools {
    fn execute<'a>(
        &'a self,
        _name: &'a str,
        _input: &'a Value,
        _context: &'a ToolExecutionContext,
    ) -> BoxFuture<'a, Result<ToolResult, String>> {
        Box::pin(async { Ok(ToolResult::message(false, "No execution tools are mounted")) })
    }
}
impl ChatFactory for ChatConfiguration {
    fn prepare(
        &self,
        _user: AuthUser,
        session: SessionRecord,
    ) -> BoxFuture<'_, Result<PreparedChat, String>> {
        Box::pin(async move {
            let provider = ConfiguredModel {
                http: OpenAiHttp::configured(&self.base_url, &self.api_key, &session.id)?,
                prompt: self.prompt.clone(),
            };
            Ok(PreparedChat {
                config: TurnConfig {
                    model: self.model.clone(),
                    tools: vec![],
                    max_rounds: 4,
                    max_tool_calls: 4,
                    max_history_bytes: 1024 * 1024,
                    max_tool_result_bytes: 16 * 1024,
                    timeout: Duration::from_secs(180),
                },
                provider: Arc::new(provider),
                tools: Arc::new(NoTools),
            })
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[test]
    fn activation_is_explicit_and_does_not_discover_other_credentials() {
        let values = HashMap::from([
            ("OPENAI_API_KEY", "not-discovered"),
            ("JAIT_RUST_APPLICATION", "1"),
        ]);
        assert!(
            ChatConfiguration::from_lookup(|key| values.get(key).map(|value| value.to_string()))
                .unwrap()
                .is_none()
        );
        assert!(
            ChatConfiguration::from_lookup(|key| if key == "JAIT_RUST_CHAT" {
                Some("1".into())
            } else {
                None
            })
            .is_err()
        );
    }
    #[test]
    fn explicit_model_configuration_validates_before_activation_and_errors_do_not_echo_secrets() {
        let values = HashMap::from([
            ("JAIT_RUST_CHAT", "1"),
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_CHAT_BASE_URL", "http://127.0.0.1:1/v1"),
            ("JAIT_RUST_CHAT_MODEL", "fixture"),
        ]);
        assert!(
            ChatConfiguration::from_lookup(|key| values.get(key).map(|value| value.to_string()))
                .unwrap()
                .is_some()
        );
        let error = ChatConfiguration::from_lookup(|key| {
            if key == "JAIT_RUST_CHAT_API_KEY" {
                Some("private\nsecret".into())
            } else {
                values.get(key).map(|value| value.to_string())
            }
        })
        .err()
        .unwrap();
        assert!(!error.to_string().contains("private"));
    }
}
