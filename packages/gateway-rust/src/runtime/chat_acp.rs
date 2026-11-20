//! ACP (Agent Client Protocol) chat provider.
//!
//! The agent process runs its own tool loop, so this provider returns the final assistant text
//! and streams the agent's events (tokens, thinking, tool activity) through the turn sink. The
//! agent's permission requests are routed to the shared `ConsentManager` and appear at
//! /api/consent/pending. Provider-owned actions that do not request permission are not controlled
//! by this callback, and the gateway's disabled-tool policy does not govern the provider's tools.
//! The command is chosen by the gateway operator; users can only select it, never supply one.
use super::chat_turn::TurnProvider;
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::{
        acp_provider::{
            AcpEvent, AcpOwnerEvent, AcpProviderConfig, AcpSessionOwner, AcpTransport,
            STRIPPED_ENV_VARS, TransportError, build_child_env, find_reasoning_effort_config,
        },
        codex_event_mapper::ProviderEvent as MappedEvent,
        openai_stream::{EventSink, ParsedStream, StreamFailure},
    },
    security::{
        consent_manager::{ConsentHandle, ConsentManager, ConsentRequestPolicy, RequestConsent},
        contracts::Risk,
        tool_permissions::{ConsentLevel, PolicySource},
    },
};
use futures_util::{StreamExt, future::BoxFuture, stream::FuturesUnordered};
use serde_json::{Map, Value, json};
use std::{collections::BTreeMap, path::PathBuf, time::Duration};

pub struct AcpModel {
    pub config: AcpProviderConfig,
    pub cwd: PathBuf,
    pub consent: ConsentManager,
    pub session_id: String,
    /// The model the user chose, set on the agent's session before the prompt.
    pub model: Option<String>,
    /// The reasoning effort the user chose, set on the agent's advertised effort option.
    pub reasoning_effort: Option<String>,
}

/// Public text for a choice the agent refuses or does not offer. The turn shows it as its error, so
/// it names only the setting and carries no agent output.
const MODEL_REFUSED: &str = "The ACP agent did not accept the selected model.";
const EFFORT_REFUSED: &str = "The ACP agent did not accept the selected reasoning effort.";
const EFFORT_NOT_OFFERED: &str = "The ACP agent does not offer the selected reasoning effort.";

/// One `session/set_config_option` request for a choice the user made.
#[derive(Debug, PartialEq, Eq)]
struct OptionRequest {
    config_id: String,
    value: String,
    /// The public text if the agent refuses this request.
    refused: &'static str,
}

/// The requests for the user's model and effort, in the order Node sends them. The model uses the
/// stable config id `model`. The effort must use the id the agent advertised, so an agent that
/// advertises no effort option cannot honor the choice.
fn option_requests(
    model: Option<&str>,
    reasoning_effort: Option<&str>,
    created: &Value,
) -> Result<Vec<OptionRequest>, &'static str> {
    let mut requests = Vec::new();
    if let Some(model) = model {
        requests.push(OptionRequest {
            config_id: "model".into(),
            value: model.into(),
            refused: MODEL_REFUSED,
        });
    }
    if let Some(effort) = reasoning_effort {
        let config_id =
            find_reasoning_effort_config(&created["configOptions"]).ok_or(EFFORT_NOT_OFFERED)?;
        requests.push(OptionRequest {
            config_id,
            value: effort.into(),
            refused: EFFORT_REFUSED,
        });
    }
    Ok(requests)
}

/// Why session setup stopped. Only a refused or unoffered choice has text for the user.
enum SetupFailure {
    Transport(TransportError),
    NoSession,
    Refused(&'static str),
}

// Remove an unanswered prompt synchronously when the ACP turn stops waiting.
// Persistence and observers run off the async worker, matching other consent users.
struct PendingAcpConsent {
    manager: ConsentManager,
    id: String,
}
impl Drop for PendingAcpConsent {
    fn drop(&mut self) {
        if let Some(claim) = self.manager.claim_cancelled(&self.id) {
            let manager = self.manager.clone();
            tokio::task::spawn_blocking(move || {
                let _ = manager.finalize_cancelled(claim);
            });
        }
    }
}

fn wait_for_acp_consent(
    manager: ConsentManager,
    mut handle: ConsentHandle,
    request_id: String,
) -> impl std::future::Future<Output = (String, bool)> {
    let pending = PendingAcpConsent {
        manager,
        id: handle.id.clone(),
    };
    async move {
        let _pending = pending;
        let approved = handle.wait().await.map(|d| d.approved).unwrap_or(false);
        (request_id, approved)
    }
}

fn failure(error: impl ToString) -> StreamFailure {
    StreamFailure::Other(error.to_string())
}

fn transcript(body: &Value) -> String {
    let messages = body["messages"].as_array().cloned().unwrap_or_default();
    let (history, last) = match messages.split_last() {
        Some((last, history)) => (history, last),
        None => return String::new(),
    };
    let mut text = String::new();
    for message in history {
        if let (Some(role @ ("user" | "assistant")), Some(content)) =
            (message["role"].as_str(), message["content"].as_str())
        {
            text.push_str(&format!("{role}: {content}\n"));
        }
    }
    if !text.is_empty() {
        text = format!("Conversation so far:\n{text}\nCurrent request:\n");
    }
    text.push_str(last["content"].as_str().unwrap_or_default());
    text
}

impl TurnProvider for AcpModel {
    fn stream<'a>(
        &'a self,
        body: Value,
        cancellation: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
        Box::pin(async move {
            let inherited: BTreeMap<String, String> = std::env::vars().collect();
            let env = build_child_env(&inherited, &[], STRIPPED_ENV_VARS);
            let cwd = self.cwd.to_string_lossy().into_owned();
            let (mut transport, events, _) =
                AcpTransport::spawn(&self.config, &cwd, &env).map_err(failure)?;
            let handshake = async {
                transport
                    .initialize(&self.config.provider_type)
                    .await
                    .map_err(SetupFailure::Transport)?;
                let created = transport
                    .request("session/new", json!({"cwd": cwd, "mcpServers": []}))
                    .await
                    .map_err(SetupFailure::Transport)?;
                let Some(acp_session) = created["sessionId"].as_str().map(str::to_owned) else {
                    return Err(SetupFailure::NoSession);
                };
                // Set before the prompt, as Node does. An agent that refuses a choice fails the turn
                // here, so the prompt never runs on a model or effort the user did not pick.
                let requests = option_requests(
                    self.model.as_deref(),
                    self.reasoning_effort.as_deref(),
                    &created,
                )
                .map_err(SetupFailure::Refused)?;
                for request in requests {
                    transport
                        .request(
                            "session/set_config_option",
                            json!({
                                "sessionId": acp_session,
                                "configId": request.config_id,
                                "value": request.value,
                            }),
                        )
                        .await
                        .map_err(|error| match error {
                            TransportError::Rpc(_) => SetupFailure::Refused(request.refused),
                            other => SetupFailure::Transport(other),
                        })?;
                }
                Ok::<_, SetupFailure>(acp_session)
            };
            let created = tokio::select! {
                _ = cancellation.wait_cancelled() => {
                    transport.shutdown().await;
                    return Ok(ParsedStream { interrupted: true, ..ParsedStream::default() });
                }
                created = tokio::time::timeout(Duration::from_secs(60), handshake) => created,
            };
            let acp_session = match created {
                Ok(Ok(session)) => session,
                Ok(Err(SetupFailure::Transport(error))) => {
                    transport.shutdown().await;
                    return Err(failure(format!("{error:?}")));
                }
                Ok(Err(SetupFailure::NoSession)) => {
                    transport.shutdown().await;
                    return Err(failure("ACP agent returned no session"));
                }
                Ok(Err(SetupFailure::Refused(message))) => {
                    transport.shutdown().await;
                    return Err(StreamFailure::SettingRejected(message));
                }
                Err(_) => {
                    transport.shutdown().await;
                    return Err(failure("ACP agent did not start in time"));
                }
            };
            let turn_id = uuid::Uuid::new_v4().to_string();
            let (owner, mut owned) = AcpSessionOwner::start_cancellable(
                transport,
                events,
                self.session_id.clone(),
                acp_session,
                turn_id,
                json!([{"type": "text", "text": transcript(&body)}]),
                cancellation.clone(),
            )
            .map_err(failure)?;

            let mut content = String::new();
            let mut thinking = String::new();
            let mut waiting = FuturesUnordered::new();
            let mut interrupted = false;
            loop {
                tokio::select! {
                    biased;
                    _ = cancellation.wait_cancelled(), if !interrupted => {
                        interrupted = true;
                        waiting.clear();
                        owner.cancel();
                    }
                    Some((request_id, approved)) = waiting.next() => {
                        let _ = owner
                            .resolve_approval(self.session_id.clone(), request_id, approved)
                            .await;
                    }
                    event = owned.recv() => {
                        let Some(event) = event else { break };
                        match event.event {
                            AcpOwnerEvent::Update(update) => {
                                if interrupted {
                                    continue;
                                }
                                match &update {
                                    AcpEvent::Provider(MappedEvent::Token { content: t, .. }) => content.push_str(t),
                                    AcpEvent::Thinking { content: t, .. } => thinking.push_str(t),
                                    _ => {}
                                }
                                tokio::select! {
                                    biased;
                                    _ = cancellation.wait_cancelled() => {
                                        interrupted = true;
                                        waiting.clear();
                                        owner.cancel();
                                    }
                                    result = sink(update.to_value()) => result.map_err(failure)?,
                                }
                            }
                            AcpOwnerEvent::Approval(crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                                tool, args, request_id, ..
                            }) => {
                                if interrupted {
                                    continue;
                                }
                                let mut preview = Map::new();
                                preview.insert("args".into(), args);
                                let handle = self.consent.request_consent(RequestConsent {
                                    action_id: request_id.clone(),
                                    tool_name: tool.clone(),
                                    summary: format!("ACP agent requests: {tool}"),
                                    preview,
                                    risk: Risk::High,
                                    policy: ConsentRequestPolicy {
                                        consent_level: ConsentLevel::Once,
                                        description: "Action requested by the ACP agent".into(),
                                        known_tool: false,
                                        source: PolicySource::UnknownTool,
                                    },
                                    session_id: self.session_id.clone(),
                                    timeout_ms: None,
                                }).map_err(failure)?;
                                waiting.push(wait_for_acp_consent(
                                    self.consent.clone(), handle, request_id,
                                ));
                            }
                            AcpOwnerEvent::Approval(_) => {}
                        }
                    }
                }
            }
            waiting.clear();
            let settled = owner.settle().await.map_err(failure)?;
            if interrupted {
                return Ok(ParsedStream {
                    content_text: content,
                    thinking_text: thinking,
                    interrupted: true,
                    ..ParsedStream::default()
                });
            }
            settled.result.map_err(failure)?;
            Ok(ParsedStream {
                content_text: content,
                thinking_text: thinking,
                finish_reason: Some("stop".into()),
                ..ParsedStream::default()
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::consent_manager::ConsentManagerOptions;

    fn request(manager: &ConsentManager, action_id: &str) -> ConsentHandle {
        manager
            .request_consent(RequestConsent {
                action_id: action_id.into(),
                tool_name: "provider action".into(),
                summary: "Provider requests action".into(),
                preview: Map::new(),
                risk: Risk::High,
                policy: ConsentRequestPolicy {
                    consent_level: ConsentLevel::Once,
                    description: "Provider action".into(),
                    known_tool: false,
                    source: PolicySource::UnknownTool,
                },
                session_id: "session".into(),
                timeout_ms: None,
            })
            .unwrap()
    }

    #[tokio::test]
    async fn cancelled_acp_wait_removes_only_its_pending_prompt() {
        let manager = ConsentManager::new(ConsentManagerOptions::default());
        let mut cancelled = request(&manager, "cancelled");
        let other = request(&manager, "other");
        let future =
            wait_for_acp_consent(manager.clone(), request(&manager, "turn"), "turn".into());
        assert_eq!(manager.pending_count(), 3);
        drop(future);
        assert_eq!(manager.pending_count(), 2);
        assert!(manager.approve(&other.id, None, None).unwrap());
        assert!(manager.reject(&cancelled.id, None, None).unwrap());
        assert!(!cancelled.wait().await.unwrap().approved);
    }

    #[tokio::test]
    async fn cancellation_unblocks_sink_and_removes_pending_prompt() {
        use std::sync::Arc;
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/acp-cancellation-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("prompt-ready");
        let observed = marker.clone();
        let manager = ConsentManager::new(ConsentManagerOptions {
            on_request: Some(Arc::new(move |_| {
                std::fs::write(&observed, b"ready").map_err(|e| e.to_string())
            })),
            ..ConsentManagerOptions::default()
        });
        let script = r#"IFS= read -r init; printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{}}'; IFS= read -r new; printf '%s\n' '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"agent"}}'; IFS= read -r prompt; printf '%s\n' '{"jsonrpc":"2.0","id":"cb","method":"session/request_permission","params":{"sessionId":"agent","toolCall":{"title":"Run"},"options":[{"optionId":"yes","kind":"allow_once"}]}}'; while [ ! -f "$1" ]; do sleep 0.01; done; printf '%s\n' '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"agent","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hello"}}}}'; IFS= read -r reply; sleep 5"#;
        let model = AcpModel {
            config: AcpProviderConfig {
                id: "test".into(),
                command: "/bin/sh".into(),
                args: vec![
                    "-c".into(),
                    script.into(),
                    "test".into(),
                    marker.to_string_lossy().into_owned(),
                ],
                provider_type: "test".into(),
                execution_node_id: None,
            },
            cwd: dir.clone(),
            consent: manager.clone(),
            session_id: "gateway".into(),
            model: None,
            reasoning_effort: None,
        };
        let entered = Arc::new(tokio::sync::Semaphore::new(0));
        let signal = entered.clone();
        let sink: EventSink = Arc::new(move |_| {
            signal.add_permits(1);
            Box::pin(std::future::pending())
        });
        let cancellation = ProcessCancellation::default();
        let test_cancel = cancellation.clone();
        let task = tokio::spawn(async move {
            model
                .stream(
                    json!({"messages":[{"role":"user","content":"hello"}]}),
                    &test_cancel,
                    sink,
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), entered.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        assert_eq!(manager.pending_count(), 1);
        cancellation.cancel();
        let result = tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(result.interrupted);
        assert_eq!(manager.pending_count(), 0);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn approved_acp_wait_preserves_the_decision() {
        let manager = ConsentManager::new(ConsentManagerOptions::default());
        let handle = request(&manager, "turn");
        let id = handle.id.clone();
        let future = wait_for_acp_consent(manager.clone(), handle, "turn".into());
        assert!(manager.approve(&id, None, None).unwrap());
        assert_eq!(future.await, ("turn".into(), true));
        assert_eq!(manager.pending_count(), 0);
    }

    fn advertised_options() -> Value {
        json!({"sessionId": "agent", "configOptions": [
            {"type": "select", "id": "model", "category": "model", "currentValue": "a",
             "options": [{"value": "a", "name": "A"}]},
            {"type": "select", "id": "effort", "category": "thought_level", "currentValue": "low",
             "options": [{"value": "low", "name": "Low"}, {"value": "high", "name": "High"}]},
        ]})
    }

    #[test]
    fn model_is_set_before_the_advertised_effort() {
        assert_eq!(
            option_requests(Some("a"), Some("high"), &advertised_options()).unwrap(),
            vec![
                OptionRequest {
                    config_id: "model".into(),
                    value: "a".into(),
                    refused: MODEL_REFUSED,
                },
                OptionRequest {
                    config_id: "effort".into(),
                    value: "high".into(),
                    refused: EFFORT_REFUSED,
                },
            ]
        );
    }

    #[test]
    fn no_choice_sends_no_option_request() {
        assert_eq!(
            option_requests(None, None, &json!({"sessionId": "agent"})).unwrap(),
            Vec::new()
        );
    }

    #[test]
    fn an_effort_the_agent_does_not_offer_is_refused_not_skipped() {
        let created = json!({"sessionId": "agent"});
        assert_eq!(
            option_requests(None, Some("high"), &created),
            Err(EFFORT_NOT_OFFERED)
        );
        // A model alone is still sent: the agent, not the gateway, decides whether it accepts it.
        assert_eq!(option_requests(Some("a"), None, &created).unwrap().len(), 1);
    }
}
