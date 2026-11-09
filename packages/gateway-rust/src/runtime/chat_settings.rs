//! Chat factory driven by the authenticated user's own saved settings.
//!
//! Credentials come only from the user's stored `api_keys` (never from the environment or the
//! request), and the model is exactly the one the user selected: a turn without a selected model
//! fails instead of falling back to a backend default. Only `file.read` and consent-gated `file.write` are mounted (see chat_tools).
use super::chat_turn::{TurnConfig, TurnProvider};
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::acp_provider::AcpProviderConfig,
    providers::openai_stream::{EventSink, OpenAiHttp, ParsedStream, StreamFailure},
    routes::auth::AuthState,
    routes::chat::{ChatFactory, PreparedChat},
    security::{consent_manager::ConsentManager, http_auth::AuthUser},
    services::{
        jait_llm::{JaitLlmConfig, ResolveJaitLlmOptions, resolve_jait_llm_config},
        jait_models::JaitBackend,
        sessions::SessionRecord,
        users::UserService,
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc, time::Duration};

const PROMPT: &str = "You are Jait, a coding and security workbench assistant. Be concise, distinguish observations from assumptions, and never claim tools ran without evidence.";

pub struct SettingsChatFactory {
    auth: AuthState,
    consent: ConsentManager,
    project_root: std::path::PathBuf,
    acp: Option<AcpProviderConfig>,
}

impl SettingsChatFactory {
    /// `consent` is the queue the consent routes serve, so approvals reach waiting tool calls.
    pub fn new(auth: AuthState, consent: ConsentManager, project_root: std::path::PathBuf) -> Self {
        Self {
            auth,
            consent,
            project_root,
            acp: None,
        }
    }

    /// Operator-chosen ACP agent. Users opt in with `JAIT_CHAT_PROVIDER=acp` in their saved
    /// settings but can never supply the command.
    pub fn with_acp(mut self, acp: Option<AcpProviderConfig>) -> Self {
        self.acp = acp;
        self
    }

    /// `JAIT_ACP_COMMAND`, optional `JAIT_ACP_ARGS` (JSON string array) and `JAIT_ACP_TYPE`.
    pub fn acp_from_env() -> Option<AcpProviderConfig> {
        let command = std::env::var("JAIT_ACP_COMMAND")
            .ok()
            .filter(|c| !c.is_empty())?;
        let args = std::env::var("JAIT_ACP_ARGS")
            .ok()
            .and_then(|a| serde_json::from_str(&a).ok())
            .unwrap_or_default();
        Some(AcpProviderConfig {
            id: "operator-acp".into(),
            command,
            args,
            provider_type: std::env::var("JAIT_ACP_TYPE").unwrap_or_default(),
            execution_node_id: None,
        })
    }
}

struct Model {
    http: OpenAiHttp,
}
impl TurnProvider for Model {
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
                .ok_or_else(|| StreamFailure::Other("Invalid model request".into()))?;
            messages.insert(0, json!({"role":"system","content":PROMPT}));
            self.http.stream(body, cancellation, sink).await
        })
    }
}

impl ChatFactory for SettingsChatFactory {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
    ) -> BoxFuture<'_, Result<PreparedChat, String>> {
        Box::pin(async move {
            let id = user.id.clone();
            let settings = self
                .auth
                .worker()
                .run(move |db| Ok(UserService::new(db).get_settings(&id)?))
                .await
                .map_err(|e| e.to_string())?;
            let api_keys: HashMap<String, String> = settings.api_keys.into_iter().collect();
            if api_keys.get("JAIT_CHAT_PROVIDER").map(String::as_str) == Some("acp") {
                let config = self
                    .acp
                    .clone()
                    .ok_or("ACP chat is not enabled by the gateway operator")?;
                let cwd = session
                    .project_path
                    .as_deref()
                    .map(std::path::PathBuf::from)
                    .filter(|p| p.is_absolute())
                    .unwrap_or_else(|| self.project_root.clone());
                let (tools, executor) =
                    super::chat_tools::project_tools(&user.id, &session.id, self.consent.clone())?;
                drop(tools);
                return Ok(PreparedChat {
                    config: TurnConfig {
                        model: "acp-agent".into(),
                        tools: Vec::new(),
                        max_rounds: 1,
                        max_tool_calls: 1,
                        max_history_bytes: 1024 * 1024,
                        max_tool_result_bytes: 16 * 1024,
                        timeout: Duration::from_secs(600),
                    },
                    provider: Arc::new(super::chat_acp::AcpModel {
                        config,
                        cwd,
                        consent: self.consent.clone(),
                        session_id: session.id.clone(),
                    }),
                    tools: executor,
                });
            }
            let resolved = resolve_jait_llm_config(ResolveJaitLlmOptions {
                config: &JaitLlmConfig::default(),
                api_keys: &api_keys,
                requested_model: settings.selected_model.as_deref(),
                jait_backend: JaitBackend::parse(&settings.jait_backend),
                strict_model: true,
            })?;
            let (tools, executor) =
                super::chat_tools::project_tools(&user.id, &session.id, self.consent.clone())?;
            Ok(PreparedChat {
                config: TurnConfig {
                    model: resolved.openai_model.clone(),
                    tools,
                    max_rounds: 4,
                    max_tool_calls: 4,
                    max_history_bytes: 1024 * 1024,
                    max_tool_result_bytes: 16 * 1024,
                    timeout: Duration::from_secs(180),
                },
                provider: Arc::new(Model {
                    http: OpenAiHttp::configured(
                        &resolved.openai_base_url,
                        &resolved.openai_api_key,
                        &session.id,
                    )?,
                }),
                tools: executor,
            })
        })
    }
}
