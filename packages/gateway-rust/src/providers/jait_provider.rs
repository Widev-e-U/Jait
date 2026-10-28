//! Built-in provider session lifecycle composed with the canonical native turn
//! manager. This candidate is not registered or activated by this module.
#[cfg(test)]
mod orchestration_tests {
    use super::*;
    #[test]
    fn provider_orchestration_retired_turn_cannot_modify_replacement() {
        let provider = JaitProvider::new(NonZeroU16::new(1).unwrap(), 2).unwrap();
        let old = ProcessCancellation::default();
        let new = ProcessCancellation::default();
        provider.sessions.lock().unwrap().insert(
            "same".into(),
            Session {
                owner: "owner".into(),
                model: "m".into(),
                route: "r".into(),
                generation: "new".into(),
                status: "running".into(),
                error: None,
                active: Some(new.clone()),
            },
        );
        let retired = ActiveTurn {
            sessions: provider.sessions.clone(),
            id: "same".into(),
            generation: "old".into(),
            cancel: old.clone(),
            finished: false,
            settled: provider.settled.clone(),
        };
        drop(retired);
        assert!(old.is_cancelled());
        assert!(!new.is_cancelled());
        let sessions = provider.sessions.lock().unwrap();
        assert_eq!(sessions["same"].status, "running");
        assert!(sessions["same"].active.is_some());
    }
    #[tokio::test]
    async fn provider_orchestration_stop_retains_handle_until_turn_settles() {
        let provider = JaitProvider::new(NonZeroU16::new(1).unwrap(), 2).unwrap();
        let cancel = ProcessCancellation::default();
        provider.sessions.lock().unwrap().insert(
            "s".into(),
            Session {
                owner: "owner".into(),
                model: "m".into(),
                route: "r".into(),
                generation: "g".into(),
                status: "running".into(),
                error: None,
                active: Some(cancel.clone()),
            },
        );
        let guard = ActiveTurn {
            sessions: provider.sessions.clone(),
            id: "s".into(),
            generation: "g".into(),
            cancel: cancel.clone(),
            finished: false,
            settled: provider.settled.clone(),
        };
        assert!(provider.stop_session("owner", "s"));
        assert!(cancel.is_cancelled());
        assert!(provider.get_session("owner", "s").is_none());
        assert!(provider.sessions.lock().unwrap().contains_key("s"));
        let cleanup = provider.shutdown_and_wait();
        tokio::pin!(cleanup);
        assert!(futures_util::poll!(cleanup.as_mut()).is_pending());
        guard.finish(None);
        cleanup.await.unwrap();
        assert!(provider.sessions.lock().unwrap().is_empty());
    }
    #[test]
    fn provider_orchestration_event_protocol_hides_internal_deltas() {
        let event = provider_event(
            json!({"type":"tool_start","call_id":"c","tool":"file.read","args":{}}),
            "s",
        )
        .unwrap();
        assert_eq!(event["type"], "tool.start");
        assert_eq!(event["callId"], "c");
        assert_eq!(event["sessionId"], "s");
        assert!(event.get("call_id").is_none());
        assert!(
            provider_event(json!({"type":"tool_call_delta","arguments":"private"}), "s").is_none()
        );
        assert!(provider_event(json!({"type":"thinking","content":"private"}), "s").is_none());
    }
    #[test]
    fn provider_orchestration_owner_controls_and_disposal() {
        let provider = JaitProvider::new(NonZeroU16::new(1).unwrap(), 2).unwrap();
        let cancel = ProcessCancellation::default();
        provider.sessions.lock().unwrap().insert(
            "s".into(),
            Session {
                owner: "owner".into(),
                model: "m".into(),
                route: "r".into(),
                generation: "g".into(),
                status: "running".into(),
                error: None,
                active: Some(cancel.clone()),
            },
        );
        assert!(!provider.cancel_turn("other", "s"));
        assert!(!provider.stop_session("other", "s"));
        assert!(provider.get_session("other", "s").is_none());
        assert!(!cancel.is_cancelled());
        provider.shutdown();
        assert!(cancel.is_cancelled());
        assert!(provider.get_session("owner", "s").is_none());
    }
}
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::{
        openai_stream::{EventSink, OpenAiHttp},
        registry::ProviderAdapter,
    },
    runtime::{
        chat_sessions::{SessionTurn, SessionTurnError, SessionTurnManager},
        chat_store::SqliteTurnStore,
        chat_turn::{TurnConfig, TurnOutcome},
    },
    security::consent_executor::{ConsentAwareExecutor, ToolExecutionContext},
    services::{
        jait_llm::{ResolveJaitLlmOptions, resolve_jait_llm_config},
        jait_models::JaitBackend,
    },
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    num::NonZeroU16,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

#[derive(Clone)]
struct Session {
    owner: String,
    model: String,
    route: String,
    generation: String,
    status: String,
    error: Option<String>,
    active: Option<ProcessCancellation>,
}
#[derive(Clone)]
pub struct JaitProvider {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    manager: SessionTurnManager,
    disposed: Arc<AtomicBool>,
    max_sessions: usize,
    settled: Arc<tokio::sync::Notify>,
}
impl JaitProvider {
    pub fn new(max_active: NonZeroU16, max_sessions: usize) -> Result<Self, String> {
        if max_sessions == 0 || max_sessions > 10000 {
            return Err("Invalid session capacity".into());
        }
        Ok(Self {
            sessions: Default::default(),
            manager: SessionTurnManager::new(max_active),
            disposed: Default::default(),
            max_sessions,
            settled: Arc::new(tokio::sync::Notify::new()),
        })
    }
    /// The authenticated thread owner must be resolved by the entrypoint. Model
    /// resolution happens before creating a session, so invalid selections cannot bill.
    pub fn start_session(
        &self,
        user: &str,
        session_id: &str,
        options: ResolveJaitLlmOptions<'_>,
    ) -> Result<Value, String> {
        if user.is_empty() || session_id.is_empty() {
            return Err("Authenticated owner and session are required".into());
        }
        let llm = resolve_jait_llm_config(options)?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Provider state unavailable")?;
        if self.disposed.load(Ordering::Acquire) {
            return Err("Jait provider has shut down.".into());
        }
        if sessions.contains_key(session_id) {
            return Err("Jait session already exists".into());
        }
        if sessions.len() >= self.max_sessions {
            return Err("Jait session capacity reached".into());
        }
        sessions.insert(
            session_id.into(),
            Session {
                owner: user.into(),
                route: format!("{}:{}", llm.backend.as_str(), llm.openai_base_url),
                generation: uuid::Uuid::new_v4().to_string(),
                model: llm.openai_model,
                status: "running".into(),
                error: None,
                active: None,
            },
        );
        Ok(
            json!({"id":session_id,"providerId":"jait","status":"running","startedAt":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true)}),
        )
    }
    pub fn get_session(&self, user: &str, id: &str) -> Option<Value> {
        self.sessions
            .lock()
            .ok()?
            .get(id)
            .filter(|s| s.owner == user && s.status != "stopped")
            .map(|s| json!({"id":id,"providerId":"jait","status":s.status,"error":s.error}))
    }
    /// The same late-bound source supplies advertised schemas and executing tools.
    /// Require the canonical consent executor; a raw tool delegate cannot bypass
    /// permissions through this boundary. Its delegate retains sandbox/node scope.
    /// Ownership is checked here and again inside SessionTurnManager/storage.
    #[allow(clippy::too_many_arguments)]
    pub async fn send_turn(
        &self,
        context: &ToolExecutionContext,
        store: &SqliteTurnStore,
        mut config: TurnConfig,
        tools: &ConsentAwareExecutor,
        mut options: ResolveJaitLlmOptions<'_>,
        message: String,
        sink: EventSink,
    ) -> Result<TurnOutcome, String> {
        options.strict_model = true;
        let llm = resolve_jait_llm_config(options)?;
        // Go Messages/Responses streaming still requires protocol composition.
        // Fail before persistence/effects for unsupported protocols.
        if llm.backend == JaitBackend::OpenCodeGo
            && crate::services::opencode_go_fetch::go_protocol(&llm.openai_model)
                != crate::services::opencode_go_fetch::Protocol::ChatCompletions
        {
            return Err(
                "Native OpenCode Go streaming translation is not integrated for this model".into(),
            );
        }
        let provider: Box<dyn crate::runtime::chat_turn::TurnProvider> =
            if llm.backend == JaitBackend::Ollama {
                Box::new(super::ollama_stream::OllamaHttp::configured(
                    &llm.openai_base_url,
                    &llm.openai_api_key,
                    &context.session_id,
                    llm.num_ctx.unwrap_or(llm.context_window),
                )?)
            } else {
                Box::new(OpenAiHttp::configured(
                    &llm.openai_base_url,
                    &llm.openai_api_key,
                    &context.session_id,
                )?)
            };
        let guard = {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "Provider state unavailable")?;
            if self.disposed.load(Ordering::Acquire) {
                return Err("Jait provider has shut down.".into());
            }
            let state = sessions
                .get_mut(&context.session_id)
                .filter(|s| s.owner == context.user_id && s.status != "stopped")
                .ok_or("Unknown Jait session")?;
            if state.active.is_some() {
                return Err("A turn is already in progress for this Jait session.".into());
            }
            if state.model != llm.openai_model
                || state.route != format!("{}:{}", llm.backend.as_str(), llm.openai_base_url)
            {
                return Err("Jait session model selection changed; start a new session".into());
            }
            if context.cancellation.is_cancelled() {
                return Err("Execution interrupted before completion.".into());
            }
            state.active = Some(context.cancellation.clone());
            state.status = "running".into();
            state.error = None;
            ActiveTurn {
                sessions: self.sessions.clone(),
                id: context.session_id.clone(),
                generation: state.generation.clone(),
                cancel: context.cancellation.clone(),
                finished: false,
                settled: self.settled.clone(),
            }
        };
        config.model = llm.openai_model;
        let message_buffer = Arc::new(Mutex::new(String::new()));
        let buffered = message_buffer.clone();
        let output_limit = config.max_history_bytes;
        let id = context.session_id.clone();
        let sessions = self.sessions.clone();
        let downstream = sink.clone();
        let generation = guard.generation.clone();
        let mapped: EventSink = Arc::new(move |event| {
            let id = id.clone();
            let sessions = sessions.clone();
            let sink = downstream.clone();
            let generation = generation.clone();
            let buffered = buffered.clone();
            Box::pin(async move {
                let visible = sessions
                    .lock()
                    .map_err(|_| "Provider state unavailable")?
                    .get(&id)
                    .is_some_and(|s| s.generation == generation && s.status != "stopped");
                if visible {
                    let Some(event) = provider_event(event, &id) else {
                        return Ok(());
                    };
                    let message = {
                        let mut buffer =
                            buffered.lock().map_err(|_| "Provider output unavailable")?;
                        if event["type"] == "token"
                            && let Some(content) = event["content"].as_str()
                        {
                            if buffer.len().saturating_add(content.len()) > output_limit {
                                return Err("Provider output exceeded byte limit".into());
                            }
                            buffer.push_str(content);
                        }
                        (event["type"] == "tool.start" && !buffer.is_empty())
                            .then(|| std::mem::take(&mut *buffer))
                    };
                    if let Some(content) = message {
                        sink(json!({"type":"message","sessionId":id,"role":"assistant","content":content})).await?;
                    }
                    sink(event).await?;
                }
                Ok(())
            })
        });
        emit(
            &sink,
            json!({"type":"turn.started","sessionId":context.session_id}),
            &context.cancellation,
        )
        .await?;
        let result = self
            .manager
            .run(SessionTurn {
                config,
                provider: provider.as_ref(),
                tools,
                store,
                context,
                user_content: message,
                sink: mapped,
            })
            .await;
        let result = result.map_err(turn_error);
        let event = match &result {
            Ok(_) => json!({"type":"turn.completed","sessionId":context.session_id}),
            Err(error) => {
                json!({"type":"session.error","sessionId":context.session_id,"error":error})
            }
        };
        // Publish completion only while the handle is still live. Retired turns cannot
        // resurrect sessions or emit late completion after stop.
        let completion = if self
            .sessions
            .lock()
            .map_err(|_| "Provider state unavailable")?
            .get(&context.session_id)
            .is_some_and(|s| s.generation == guard.generation && s.status != "stopped")
        {
            let content = std::mem::take(
                &mut *message_buffer
                    .lock()
                    .map_err(|_| "Provider output unavailable")?,
            );
            tokio::time::timeout(Duration::from_secs(5), async {
                if !content.is_empty() {
                    sink(json!({"type":"message","sessionId":context.session_id,"role":"assistant","content":content})).await?;
                }
                sink(event).await
            }).await.map_err(|_| "Provider event consumer timed out".to_string())
                .and_then(|result| result)
        } else {
            Ok(())
        };
        guard.finish(result.as_ref().err().cloned());
        completion?;
        result
    }
    pub fn cancel_turn(&self, user: &str, id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        if let Some(state) = sessions.get(id).filter(|s| s.owner == user)
            && let Some(cancel) = &state.active
        {
            cancel.cancel();
            return true;
        }
        false
    }
    pub fn stop_session(&self, user: &str, id: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.get(id).is_none_or(|s| s.owner != user) {
            return false;
        }
        let state = sessions.get_mut(id).expect("owner checked");
        state.status = "stopped".into();
        if let Some(cancel) = &state.active {
            cancel.cancel();
        } else {
            sessions.remove(id);
        }
        true
    }
    pub fn shutdown(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        self.disposed.store(true, Ordering::Release);
        sessions.retain(|_, state| {
            state.status = "stopped".into();
            if let Some(cancel) = &state.active {
                cancel.cancel();
                true
            } else {
                false
            }
        });
    }
    /// Retain admission until active borrowed turns have completed their cleanup.
    /// A deadline reports unsettled work; it does not claim successful disposal.
    pub async fn shutdown_and_wait(&self) -> Result<(), String> {
        self.shutdown();
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let notified = self.settled.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();
                if self
                    .sessions
                    .lock()
                    .map_err(|_| "Provider state unavailable")?
                    .is_empty()
                {
                    return Ok(());
                }
                notified.await;
            }
        })
        .await
        .map_err(|_| "Jait provider cleanup deadline exceeded".to_string())?
    }
}
/// Translate the canonical loop protocol to the existing provider wire events.
/// Reasoning and raw argument deltas are internal and are never forwarded.
fn provider_event(mut event: Value, id: &str) -> Option<Value> {
    let kind = match event["type"].as_str()? {
        "token" => "token",
        "tool_start" => "tool.start",
        "tool_result" => "tool.result",
        "tool_output" => "tool.output",
        _ => return None,
    };
    if let Some(object) = event.as_object_mut()
        && let Some(call_id) = object.remove("call_id")
    {
        object.insert("callId".into(), call_id);
    }
    event["type"] = json!(kind);
    event["sessionId"] = json!(id);
    Some(event)
}
fn turn_error(error: SessionTurnError) -> String {
    match error {
        SessionTurnError::SessionBusy => {
            "A turn is already in progress for this Jait session.".into()
        }
        SessionTurnError::ContextMismatch => "Jait session ownership mismatch".into(),
        SessionTurnError::Capacity => "Jait active turn capacity reached".into(),
        SessionTurnError::Storage(_) => "Jait turn persistence failed".into(),
        SessionTurnError::Turn(error) => match error {
            crate::runtime::chat_turn::TurnError::Cancelled => {
                "Execution interrupted before completion.".into()
            }
            crate::runtime::chat_turn::TurnError::RoundLimit => {
                "Execution reached its round limit before completion.".into()
            }
            _ => "Jait turn failed".into(),
        },
    }
}
async fn emit(sink: &EventSink, event: Value, cancel: &ProcessCancellation) -> Result<(), String> {
    tokio::select! {biased;_=cancel.wait_cancelled()=>Err("Execution interrupted before completion.".into()),r=tokio::time::timeout(Duration::from_secs(5),sink(event))=>r.map_err(|_|"Provider event consumer timed out".to_string())?}
}
struct ActiveTurn {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    id: String,
    generation: String,
    cancel: ProcessCancellation,
    finished: bool,
    settled: Arc<tokio::sync::Notify>,
}
impl ActiveTurn {
    fn settle(&self, error: Option<String>, interrupted: bool) {
        if let Ok(mut sessions) = self.sessions.lock()
            && let Some(state) = sessions
                .get_mut(&self.id)
                .filter(|s| s.generation == self.generation)
        {
            if state.status == "stopped" {
                sessions.remove(&self.id);
            } else {
                state.active = None;
                state.status = if interrupted {
                    "interrupted"
                } else if error.is_some() {
                    "error"
                } else {
                    "running"
                }
                .into();
                state.error = error;
            }
        }
        self.settled.notify_waiters();
    }
    fn finish(mut self, error: Option<String>) {
        self.settle(error, false);
        self.finished = true;
    }
}
impl Drop for ActiveTurn {
    fn drop(&mut self) {
        if !self.finished {
            self.cancel.cancel();
            self.settle(None, true);
        }
    }
}
impl ProviderAdapter for JaitProvider {
    fn id(&self) -> &str {
        "jait"
    }
    fn info(&self) -> Value {
        json!({"id":"jait","name":"Jait (Built-in)","description":"Jait's native agent loop using OpenAI-compatible APIs with full tool access","available":true,"modes":["full-access","supervised"],"auth":crate::providers::provider_auth::NO_PROVIDER_AUTH})
    }
    fn check_availability(&self) -> BoxFuture<'static, Result<(), String>> {
        let disposed = self.disposed.load(Ordering::Acquire);
        Box::pin(async move {
            if disposed {
                Err("Jait provider has shut down.".into())
            } else {
                Ok(())
            }
        })
    }
    fn dispose(&self) -> BoxFuture<'static, Result<(), String>> {
        let provider = self.clone();
        Box::pin(async move { provider.shutdown_and_wait().await })
    }
}
