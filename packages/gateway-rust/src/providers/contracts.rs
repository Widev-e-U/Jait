//! Port of `packages/gateway/src/providers/contracts.ts`.
//!
//! Native session boundary; not runtime composition.
//!
//! `ProviderAdapter` remains the canonical metadata/availability/disposal port.
//! This extension is deliberately separate: existing registry adapters do not yet
//! implement it. Session owners must authenticate owner/session/node authority,
//! admit one mutating turn, retain cleanup through cancellation and persist before
//! publishing durable events. Provider events here are live notifications, not
//! committed replay envelopes. No task, queue, process or policy is created here.
// Gaps: TS exports from `providers/contracts.ts` without a native counterpart.
//
// - `ProviderInfo` — no native struct. Provider metadata is emitted structurally by
//   `providers::registry::ProviderAdapter::info()` as `serde_json::Value`
//   (see `routes/*` payload builders); no typed Rust mirror is defined, so none is
//   exposed here rather than inventing one.
//
// Everything else in the TS module is ported below: `ProviderId` (alias of `String`),
// `ProviderSession`, `ProviderSessionStatus`, `ProviderEvent`,
// `CliProviderAdapter` (as the `ProviderAdapter` supertrait bound),
// `StartSessionOptions`, `RuntimeMode`, `McpServerRef`.

use crate::execution::process_runner::ProcessCancellation;
use futures_util::future::BoxFuture;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc};

pub use super::{
    model_fetchers::CatalogueModel as ProviderModelInfo,
    provider_auth::{AuthResult, ProviderAuthCapabilities},
    registry::ProviderAdapter,
    remote_cli::Unsubscribe,
    usage::ModelUsage,
};

/// Provider identifiers include configured accounts and remote providers.
pub type ProviderId = String;

/// Wire modes differ from the executor's internal `Guarded` spelling. Decoding
/// cannot silently turn an unknown/supervised mode into full access.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuntimeMode {
    FullAccess,
    Supervised,
}
impl From<RuntimeMode> for crate::security::consent_executor::RuntimeMode {
    fn from(mode: RuntimeMode) -> Self {
        match mode {
            RuntimeMode::FullAccess => Self::FullAccess,
            RuntimeMode::Supervised => Self::Guarded,
        }
    }
}

/// This is the provider's status, not the session supervisor's lifecycle phase.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderSessionStatus {
    Idle,
    Starting,
    Running,
    Completed,
    Interrupted,
    Error,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSession {
    pub id: String,
    pub provider_id: ProviderId,
    pub thread_id: String,
    pub status: ProviderSessionStatus,
    pub runtime_mode: RuntimeMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProviderTurnAttachment {
    Reference(String),
    Image {
        name: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
        data: String,
    },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    Stdio,
    Http,
    Sse,
}
/// Configuration only. A URL/command here grants no network or process authority.
/// Headers authenticate remote HTTP/SSE; env applies to spawned stdio processes.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRef {
    pub name: String,
    pub transport: McpTransport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
}
// Intentionally no Debug: environment and headers may contain credentials.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionOptions {
    pub thread_id: String,
    pub working_directory: String,
    pub mode: RuntimeMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<Vec<McpServerRef>>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    Assistant,
    User,
}

// Option<Value> normally collapses explicit null into None. Optional unknown
// payloads must retain that distinction without another domain wrapper type.
fn present_json<'de, D: Deserializer<'de>>(de: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(de).map(Some)
}
fn required_json<'de, D: Deserializer<'de>>(de: D) -> Result<Value, D::Error> {
    Value::deserialize(de)
}

/// Complete current TS event union. The Codex mapper's narrower enum remains
/// independently owned; the checked conversions below bridge its existing shape.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ProviderEvent {
    #[serde(rename = "usage")]
    Usage {
        #[serde(rename = "sessionId")]
        session_id: String,
        usage: ModelUsage,
    },
    #[serde(rename = "session.started")]
    SessionStarted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "session.completed")]
    SessionCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "session.error")]
    SessionError {
        #[serde(rename = "sessionId")]
        session_id: String,
        error: String,
    },
    #[serde(rename = "turn.started")]
    TurnStarted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "turnId", skip_serializing_if = "Option::is_none")]
        turn_id: Option<String>,
    },
    #[serde(rename = "turn.completed")]
    TurnCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    #[serde(rename = "token")]
    Token {
        #[serde(rename = "sessionId")]
        session_id: String,
        content: String,
    },
    #[serde(rename = "thinking")]
    Thinking {
        #[serde(rename = "sessionId")]
        session_id: String,
        content: String,
    },
    #[serde(rename = "tool.start")]
    ToolStart {
        #[serde(rename = "sessionId")]
        session_id: String,
        tool: String,
        #[serde(deserialize_with = "required_json")]
        args: Value,
        #[serde(rename = "callId", skip_serializing_if = "Option::is_none")]
        call_id: Option<String>,
        #[serde(rename = "parentCallId", skip_serializing_if = "Option::is_none")]
        parent_call_id: Option<String>,
    },
    #[serde(rename = "tool.output")]
    ToolOutput {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "callId")]
        call_id: String,
        content: String,
    },
    #[serde(rename = "tool.result")]
    ToolResult {
        #[serde(rename = "sessionId")]
        session_id: String,
        tool: String,
        ok: bool,
        message: String,
        #[serde(rename = "callId", skip_serializing_if = "Option::is_none")]
        call_id: Option<String>,
        #[serde(rename = "parentCallId", skip_serializing_if = "Option::is_none")]
        parent_call_id: Option<String>,
        #[serde(
            default,
            deserialize_with = "present_json",
            skip_serializing_if = "Option::is_none"
        )]
        data: Option<Value>,
    },
    #[serde(rename = "tool.approval-required")]
    ToolApprovalRequired {
        #[serde(rename = "sessionId")]
        session_id: String,
        tool: String,
        #[serde(deserialize_with = "required_json")]
        args: Value,
        #[serde(rename = "requestId")]
        request_id: String,
    },
    #[serde(rename = "message")]
    Message {
        #[serde(rename = "sessionId")]
        session_id: String,
        role: MessageRole,
        content: String,
    },
    #[serde(rename = "activity")]
    Activity {
        #[serde(rename = "sessionId")]
        session_id: String,
        kind: String,
        summary: String,
        #[serde(
            default,
            deserialize_with = "present_json",
            skip_serializing_if = "Option::is_none"
        )]
        payload: Option<Value>,
    },
    /// Lengths use the producer's JavaScript UTF-16 units, never Rust byte offsets.
    #[serde(rename = "content_rollback")]
    ContentRollback {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "contentLength")]
        content_length: u64,
        segments: u64,
    },
}

impl ProviderEvent {
    /// Provider subscriptions span sessions. Owners must filter by this identity
    /// and their active generation before applying events; it is not authority.
    pub fn session_id(&self) -> &str {
        match self {
            Self::Usage { session_id, .. }
            | Self::SessionStarted { session_id }
            | Self::SessionCompleted { session_id }
            | Self::SessionError { session_id, .. }
            | Self::TurnStarted { session_id, .. }
            | Self::TurnCompleted { session_id }
            | Self::Token { session_id, .. }
            | Self::Thinking { session_id, .. }
            | Self::ToolStart { session_id, .. }
            | Self::ToolOutput { session_id, .. }
            | Self::ToolResult { session_id, .. }
            | Self::ToolApprovalRequired { session_id, .. }
            | Self::Message { session_id, .. }
            | Self::Activity { session_id, .. }
            | Self::ContentRollback { session_id, .. } => session_id,
        }
    }
}

/// The old mapper permits any String role. Reject invalid roles rather than
/// coercing them into assistant output. Other variants convert without loss;
/// fields already discarded upstream cannot be reconstructed here.
impl TryFrom<super::codex_event_mapper::ProviderEvent> for ProviderEvent {
    type Error = &'static str;
    fn try_from(event: super::codex_event_mapper::ProviderEvent) -> Result<Self, Self::Error> {
        use super::codex_event_mapper::ProviderEvent as Old;
        Ok(match event {
            Old::Token {
                session_id,
                content,
            } => Self::Token {
                session_id,
                content,
            },
            Old::Message {
                session_id,
                role,
                content,
            } => Self::Message {
                session_id,
                role: match role.as_str() {
                    "assistant" => MessageRole::Assistant,
                    "user" => MessageRole::User,
                    _ => return Err("Unsupported provider message role"),
                },
                content,
            },
            Old::Activity {
                session_id,
                kind,
                summary,
                payload,
            } => Self::Activity {
                session_id,
                kind,
                summary,
                payload: Some(payload),
            },
            Old::ToolStart {
                session_id,
                tool,
                args,
                call_id,
            } => Self::ToolStart {
                session_id,
                tool,
                args,
                call_id: Some(call_id),
                parent_call_id: None,
            },
            Old::ToolOutput {
                session_id,
                call_id,
                content,
            } => Self::ToolOutput {
                session_id,
                call_id,
                content,
            },
            Old::ToolResult {
                session_id,
                tool,
                ok,
                message,
                call_id,
                data,
            } => Self::ToolResult {
                session_id,
                tool,
                ok,
                message,
                call_id: Some(call_id),
                parent_call_id: None,
                data,
            },
            Old::TurnStarted { session_id } => Self::TurnStarted {
                session_id,
                turn_id: None,
            },
            Old::TurnCompleted { session_id } => Self::TurnCompleted { session_id },
            Old::SessionCompleted { session_id } => Self::SessionCompleted { session_id },
            Old::SessionError { session_id, error } => Self::SessionError { session_id, error },
            Old::Usage { session_id, usage } => Self::Usage { session_id, usage },
        })
    }
}
impl TryFrom<super::acp_provider::AcpEvent> for ProviderEvent {
    type Error = &'static str;
    fn try_from(event: super::acp_provider::AcpEvent) -> Result<Self, Self::Error> {
        use super::acp_provider::AcpEvent;
        match event {
            AcpEvent::Provider(event) => event.try_into(),
            AcpEvent::Thinking {
                session_id,
                content,
            } => Ok(Self::Thinking {
                session_id,
                content,
            }),
            AcpEvent::SessionStarted { session_id } => Ok(Self::SessionStarted { session_id }),
        }
    }
}

/// Internal, server-constructed authority context, never decoded from model data.
/// The token signals a request; completion still requires adapter cleanup/settlement.
#[derive(Clone, Copy)]
pub struct ProviderSessionContext<'a> {
    pub owner_user_id: &'a str,
    pub cancellation: &'a ProcessCancellation,
}
pub type ProviderEventHandler = Arc<dyn Fn(ProviderEvent) + Send + Sync>;
pub type ProviderFuture<'a, T> = BoxFuture<'a, Result<T, String>>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAuthStatus {
    #[serde(flatten)]
    pub capabilities: ProviderAuthCapabilities,
    pub authenticated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
}

/// Object-safe extension of the registry adapter, with no success-returning
/// lifecycle stubs. Implementations must check owner/session identity at effects,
/// correlate approvals by session AND request id, reject stale steering IDs and
/// keep stop/interrupt/approval responsive while send_turn awaits. No mutex may
/// span the turn. False steering keeps the message queued at the owner.
///
/// Optional methods return None when unsupported, distinguishing absence from a
/// supported method returning false/empty. AuthResult and CatalogueModel reuse
/// existing native records; their broader/narrower shared-TS differences remain
/// explicit integration gaps. Availability and disposal retain registry semantics.
pub trait CliProviderAdapter: ProviderAdapter {
    fn provider_type(&self) -> Option<&str> {
        None
    }
    fn execution_node_id(&self) -> Option<&str> {
        None
    }
    fn start_session<'a>(
        &'a self,
        context: ProviderSessionContext<'a>,
        options: StartSessionOptions,
    ) -> ProviderFuture<'a, ProviderSession>;
    fn send_turn<'a>(
        &'a self,
        context: ProviderSessionContext<'a>,
        session_id: &'a str,
        message: &'a str,
        attachments: Option<&'a [ProviderTurnAttachment]>,
    ) -> ProviderFuture<'a, ()>;
    fn interrupt_turn<'a>(
        &'a self,
        context: ProviderSessionContext<'a>,
        session_id: &'a str,
    ) -> ProviderFuture<'a, ()>;
    fn respond_to_approval<'a>(
        &'a self,
        context: ProviderSessionContext<'a>,
        session_id: &'a str,
        request_id: &'a str,
        approved: bool,
    ) -> ProviderFuture<'a, ()>;
    fn stop_session<'a>(
        &'a self,
        context: ProviderSessionContext<'a>,
        session_id: &'a str,
    ) -> ProviderFuture<'a, ()>;
    /// Subscribe before starting work; unsubscribe explicitly on owner teardown.
    /// Callbacks preserve producer order; they do not persist or grant approval.
    fn on_event(&self, handler: ProviderEventHandler) -> Unsubscribe;
    fn steer_turn<'a>(
        &'a self,
        _context: ProviderSessionContext<'a>,
        _session_id: &'a str,
        _message: &'a str,
        _expected_turn_id: Option<&'a str>,
    ) -> Option<ProviderFuture<'a, bool>> {
        None
    }
    fn has_session(&self, _owner_user_id: &str, _session_id: &str) -> Option<bool> {
        None
    }
    fn list_models(&self) -> Option<ProviderFuture<'_, Vec<ProviderModelInfo>>> {
        None
    }
    fn reset_models(&self) -> Option<()> {
        None
    }
    fn get_auth_status(&self) -> Option<ProviderFuture<'_, ProviderAuthStatus>> {
        None
    }
    fn start_login(&self) -> Option<ProviderFuture<'_, AuthResult>> {
        None
    }
    fn logout(&self) -> Option<ProviderFuture<'_, AuthResult>> {
        None
    }
    fn send_login_input(&self, _input: &str) -> Option<Result<(), String>> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_mode_serde_is_kebab_case() {
        assert_eq!(
            serde_json::to_string(&RuntimeMode::FullAccess).expect("serialize"),
            "\"full-access\""
        );
        assert_eq!(
            serde_json::to_string(&RuntimeMode::Supervised).expect("serialize"),
            "\"supervised\""
        );
        assert!(serde_json::from_str::<RuntimeMode>("\"bogus\"").is_err());
    }

    #[test]
    fn runtime_mode_bridges_to_security_contract() {
        assert_eq!(
            crate::security::consent_executor::RuntimeMode::from(RuntimeMode::Supervised),
            crate::security::consent_executor::RuntimeMode::Guarded
        );
        assert_eq!(
            crate::security::consent_executor::RuntimeMode::from(RuntimeMode::FullAccess),
            crate::security::consent_executor::RuntimeMode::FullAccess
        );
    }

    #[test]
    fn provider_session_status_serde_is_lowercase() {
        assert_eq!(
            serde_json::to_string(&ProviderSessionStatus::Running).expect("serialize"),
            "\"running\""
        );
        assert_eq!(
            serde_json::from_str::<ProviderSessionStatus>("\"interrupted\"").expect("parse"),
            ProviderSessionStatus::Interrupted
        );
    }

    #[test]
    fn provider_session_serializes_camel_case_and_skips_absent_optionals() {
        let session = ProviderSession {
            id: "s1".to_string(),
            provider_id: "acp".to_string(),
            thread_id: "t1".to_string(),
            status: ProviderSessionStatus::Running,
            runtime_mode: RuntimeMode::Supervised,
            error: None,
            started_at: None,
            completed_at: None,
        };
        let json = serde_json::to_value(&session).expect("serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "id": "s1",
                "providerId": "acp",
                "threadId": "t1",
                "status": "running",
                "runtimeMode": "supervised",
            })
        );
        let parsed: ProviderSession = serde_json::from_value(json).expect("parse");
        assert_eq!(parsed, session);
    }

    #[test]
    fn provider_id_is_a_string_alias() {
        let id: ProviderId = "acp".to_string();
        assert_eq!(id.as_str(), "acp");
    }
}
