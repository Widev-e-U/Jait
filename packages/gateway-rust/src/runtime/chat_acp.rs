//! ACP (Agent Client Protocol) chat provider.
//!
//! The agent process runs its own tool loop, so this provider returns the final assistant text
//! and streams the agent's events (tokens, thinking, tool activity) through the turn sink. The
//! agent's permission requests are routed to the shared `ConsentManager`, so they appear at
//! /api/consent/pending and nothing the agent asks to do runs without the user's decision.
//! The command is chosen by the gateway operator; users can only select it, never supply one.
use super::chat_turn::TurnProvider;
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::{
        acp_provider::{
            AcpEvent, AcpOwnerEvent, AcpProviderConfig, AcpSessionOwner, AcpTransport,
            STRIPPED_ENV_VARS, build_child_env,
        },
        codex_event_mapper::ProviderEvent as MappedEvent,
        openai_stream::{EventSink, ParsedStream, StreamFailure},
    },
    security::{
        consent_manager::{ConsentManager, ConsentRequestPolicy, RequestConsent},
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
                transport.initialize(&self.config.provider_type).await?;
                transport
                    .request("session/new", json!({"cwd": cwd, "mcpServers": []}))
                    .await
            };
            let created = tokio::select! {
                _ = cancellation.wait_cancelled() => {
                    transport.shutdown().await;
                    return Ok(ParsedStream { interrupted: true, ..ParsedStream::default() });
                }
                created = tokio::time::timeout(Duration::from_secs(60), handshake) => created,
            };
            let acp_session = match created {
                Ok(Ok(value)) => value["sessionId"].as_str().map(str::to_owned),
                Ok(Err(error)) => {
                    transport.shutdown().await;
                    return Err(failure(format!("{error:?}")));
                }
                Err(_) => {
                    transport.shutdown().await;
                    return Err(failure("ACP agent did not start in time"));
                }
            };
            let Some(acp_session) = acp_session else {
                transport.shutdown().await;
                return Err(failure("ACP agent returned no session"));
            };
            let turn_id = uuid::Uuid::new_v4().to_string();
            let (owner, mut owned) = AcpSessionOwner::start(
                transport,
                events,
                self.session_id.clone(),
                acp_session,
                turn_id,
                json!([{"type": "text", "text": transcript(&body)}]),
            )
            .map_err(failure)?;

            let mut content = String::new();
            let mut thinking = String::new();
            let mut waiting = FuturesUnordered::new();
            let mut interrupted = false;
            loop {
                tokio::select! {
                    _ = cancellation.wait_cancelled(), if !interrupted => {
                        interrupted = true;
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
                                match &update {
                                    AcpEvent::Provider(MappedEvent::Token { content: t, .. }) => content.push_str(t),
                                    AcpEvent::Thinking { content: t, .. } => thinking.push_str(t),
                                    _ => {}
                                }
                                sink(update.to_value()).await.map_err(failure)?;
                            }
                            AcpOwnerEvent::Approval(crate::providers::contracts::ProviderEvent::ToolApprovalRequired {
                                tool, args, request_id, ..
                            }) => {
                                let mut preview = Map::new();
                                preview.insert("args".into(), args);
                                let mut handle = self.consent.request_consent(RequestConsent {
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
                                waiting.push(async move {
                                    let approved = handle.wait().await.map(|d| d.approved).unwrap_or(false);
                                    (request_id, approved)
                                });
                            }
                            AcpOwnerEvent::Approval(_) => {}
                        }
                    }
                }
            }
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
