//! Chat factory driven by the authenticated user's own saved settings.
//!
//! Credentials come only from the user's stored `api_keys` (never from the environment or the
//! request), and the model is exactly the one the user selected: a turn without a selected model
//! fails instead of falling back to a backend default. Only `file.read` and consent-gated `file.write` are mounted (see chat_tools).
//!
//! A request may name a model, an effort or a registered provider. Each choice is checked against
//! this owner's configuration, and a choice that cannot be honored is refused, never replaced.
use super::chat_turn::{TurnConfig, TurnProvider};
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::{
        acp_adapter::AcpDefinition,
        acp_provider::AcpProviderConfig,
        openai_stream::{EventSink, OpenAiHttp, ParsedStream, StreamFailure},
        registry::ProviderRegistry,
    },
    routes::auth::AuthState,
    routes::chat::{ChatFactory, PrepareError, PreparedChat, TurnSelection},
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
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};

const PROMPT: &str = "You are Jait, a coding and security workbench assistant. Be concise, distinguish observations from assumptions, and never claim tools ran without evidence.";

pub struct SettingsChatFactory {
    auth: AuthState,
    consent: ConsentManager,
    project_root: std::path::PathBuf,
    acp: Option<AcpProviderConfig>,
    questions: Option<crate::services::input_requests::UserQuestionService>,
    providers: Option<ProviderRegistry>,
    acp_definitions: Vec<AcpDefinition>,
}

impl SettingsChatFactory {
    /// `consent` is the queue the consent routes serve, so approvals reach waiting tool calls.
    pub fn new(auth: AuthState, consent: ConsentManager, project_root: std::path::PathBuf) -> Self {
        Self {
            auth,
            consent,
            project_root,
            acp: None,
            questions: None,
            providers: None,
            acp_definitions: Vec::new(),
        }
    }

    pub fn with_questions(
        mut self,
        questions: crate::services::input_requests::UserQuestionService,
    ) -> Self {
        self.questions = Some(questions);
        self
    }

    /// Operator-chosen ACP agent. Users opt in with `JAIT_CHAT_PROVIDER=acp` in their saved
    /// settings but can never supply the command.
    pub fn with_acp(mut self, acp: Option<AcpProviderConfig>) -> Self {
        self.acp = acp;
        self
    }

    /// The gateway's provider registry and the ACP agents the operator defined. A request's provider
    /// is looked up here for the owner, and a request never supplies a command of its own.
    pub fn with_registered_acp(
        mut self,
        registry: ProviderRegistry,
        definitions: Vec<AcpDefinition>,
    ) -> Self {
        self.providers = Some(registry);
        self.acp_definitions = definitions;
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

    fn acp_turn(
        &self,
        user: &AuthUser,
        session: &SessionRecord,
        config: AcpProviderConfig,
        selection: &TurnSelection,
        disabled_tools: HashSet<String>,
    ) -> Result<PreparedChat, PrepareError> {
        let cwd = session
            .project_path
            .as_deref()
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| self.project_root.clone());
        let (tools, mut executor) = super::chat_tools::project_tools_with_policy(
            &user.id,
            &session.id,
            self.consent.clone(),
            self.questions.clone(),
            disabled_tools,
        )?;
        super::chat_tools::enforce_session_authority(
            &mut executor,
            self.auth.clone(),
            self.project_root.clone(),
        );
        drop(tools);
        Ok(PreparedChat {
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
                model: selection.model.clone(),
                reasoning_effort: selection.reasoning_effort.clone(),
            }),
            tools: executor,
        })
    }

    /// A provider the owner can use on this gateway, chosen by its id. It must be an ACP agent the
    /// operator defined, visible to this owner, and available now.
    async fn registered_acp_turn(
        &self,
        user: &AuthUser,
        session: &SessionRecord,
        provider: &str,
        selection: &TurnSelection,
        disabled_tools: HashSet<String>,
    ) -> Result<PreparedChat, PrepareError> {
        let not_configured = || PrepareError::refused(400, "PROVIDER_NOT_CONFIGURED");
        let definition = self
            .acp_definitions
            .iter()
            .find(|definition| definition.config.id == provider)
            .ok_or_else(not_configured)?;
        let adapter = self
            .providers
            .as_ref()
            .and_then(|registry| registry.get_for_user(provider, &user.id))
            .ok_or_else(not_configured)?;
        if adapter.check_availability().await.is_err() {
            return Err(PrepareError::refused(409, "PROVIDER_UNAVAILABLE"));
        }
        self.acp_turn(
            user,
            session,
            definition.config.clone(),
            selection,
            disabled_tools,
        )
    }
}

struct Model {
    http: OpenAiHttp,
    reasoning_effort: Option<String>,
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
            // Sent only when the user chose a level, as the Node gateway does.
            if let Some(effort) = &self.reasoning_effort {
                body["reasoning_effort"] = json!(effort);
            }
            self.http.stream(body, cancellation, sink).await
        })
    }
}

impl ChatFactory for SettingsChatFactory {
    fn prepare(
        &self,
        user: AuthUser,
        session: SessionRecord,
        selection: TurnSelection,
    ) -> BoxFuture<'_, Result<PreparedChat, PrepareError>> {
        Box::pin(async move {
            let id = user.id.clone();
            let settings = self
                .auth
                .worker()
                .run(move |db| Ok(UserService::new(db).get_settings(&id)?))
                .await
                .map_err(|e| e.to_string())?;
            let disabled_tools: HashSet<String> = settings.disabled_tools.into_iter().collect();
            let api_keys: HashMap<String, String> = settings.api_keys.into_iter().collect();
            if let Some(provider) = selection.provider.as_deref() {
                return self
                    .registered_acp_turn(&user, &session, provider, &selection, disabled_tools)
                    .await;
            }
            if api_keys.get("JAIT_CHAT_PROVIDER").map(String::as_str) == Some("acp") {
                let config = self
                    .acp
                    .clone()
                    .ok_or("ACP chat is not enabled by the gateway operator")?;
                return self.acp_turn(&user, &session, config, &selection, disabled_tools);
            }
            // A model the user picked for this turn replaces the saved one, and is refused when this
            // owner's backend cannot serve it.
            let resolved = resolve_jait_llm_config(ResolveJaitLlmOptions {
                config: &JaitLlmConfig::default(),
                api_keys: &api_keys,
                requested_model: selection
                    .model
                    .as_deref()
                    .or(settings.selected_model.as_deref()),
                jait_backend: JaitBackend::parse(&settings.jait_backend),
                strict_model: true,
            })
            .map_err(|error| {
                if selection.model.is_some() {
                    PrepareError::refused(400, "MODEL_NOT_CONFIGURED")
                } else {
                    PrepareError::from(error)
                }
            })?;
            let (tools, mut executor) = super::chat_tools::project_tools_with_policy(
                &user.id,
                &session.id,
                self.consent.clone(),
                self.questions.clone(),
                disabled_tools,
            )?;
            super::chat_tools::enforce_session_authority(
                &mut executor,
                self.auth.clone(),
                self.project_root.clone(),
            );
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
                    // Ollama's native endpoint rejects this field, so only other backends receive it.
                    reasoning_effort: (resolved.backend != JaitBackend::Ollama)
                        .then(|| selection.reasoning_effort.clone())
                        .flatten(),
                }),
                tools: executor,
            })
        })
    }
}
