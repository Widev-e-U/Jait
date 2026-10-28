//! Native port of `packages/gateway/src/tools/agent-acp-runner.ts`.
//!
//! The TypeScript module runs one delegated turn on a CLI/ACP specialist
//! provider and normalises the provider's event stream into the transcript
//! segments and tool-call records the web renderer expects. Nothing in this
//! port talks to a provider directly: provider lookup, session lifecycle,
//! turn streaming and approval replies all go through [`AcpSpecialistHost`] so
//! the run/segment/result logic stays transport-free and deterministic.
//!
//! Parity notes that matter for callers:
//!
//! * Early failures (unknown provider, unavailable provider, failed session
//!   start) carry **no** `data` — only `{ ok: false, message }`, exactly like
//!   the TS early returns.
//! * A completed turn always serialises `data` and reports `ok: false` for the
//!   `refuse` / `failure` / `query` performatives without throwing.
//! * `timeout_ms` is a hard cap on the whole turn; abort is observed through a
//!   `watch` channel whose value turning `true` cancels the turn.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Map, Value};

use crate::text::js_trim;
use crate::time::{default_clock, Clock};
use crate::tools::agent_communication::{
    is_successful_performative, parse_performative, strip_performative_tag,
};
use crate::tools::contracts::{NestedAgentEvent, ToolOutputChannel};

/// Same alias used by the other host-boundary ports (`network_scan.rs`,
/// `evaluation/isolated_gateway.rs`): host calls are boxed so the traits stay
/// object safe.
pub type HostFuture<'a, T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// TS default when the caller does not pass `timeoutMs`.
pub const DEFAULT_TIMEOUT_MS: i64 = 8 * 60 * 1000;
/// Fallback runtime mode when the provider advertises no modes at all.
pub const DEFAULT_RUNTIME_MODE: &str = "full-access";
/// Placeholder message for a tool call that started but has not finished.
pub const IN_PROGRESS_MESSAGE: &str = "(in progress)";
/// Placeholder applied by `finalize()` to calls with no result.
pub const NO_RESULT_MESSAGE: &str = "(no result — sub-agent stopped before completing)";

/// Provider metadata the runner needs before starting a session.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AcpProviderInfo {
    /// Runtime modes the provider accepts, in preference order.
    pub modes: Vec<String>,
    /// Human-readable reason used when `checkAvailability` reports `false`.
    pub unavailable_reason: Option<String>,
}

/// A live specialist session handle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AcpSession {
    pub id: String,
}

/// Provider-side session open request.
#[derive(Clone, Debug, PartialEq)]
pub struct StartSessionRequest {
    pub thread_id: String,
    pub workspace: String,
    pub model: Option<String>,
    pub mode: String,
    pub mcp_servers: Vec<Value>,
}

/// Approval prompt surfaced from the provider.
#[derive(Clone, Debug, PartialEq)]
pub struct AcpApprovalRequest {
    pub tool: String,
    pub args: Value,
    pub request_id: String,
}

/// Event stream emitted by a provider while a turn is running. Mirrors the TS
/// discriminated union; `session_id` is carried on every variant because the
/// runner drops events for other sessions.
#[derive(Clone, Debug, PartialEq)]
pub enum ProviderEvent {
    Token {
        session_id: String,
        content: String,
    },
    Thinking {
        session_id: String,
        content: String,
    },
    SessionError {
        session_id: String,
        error: String,
    },
    ToolStart {
        session_id: String,
        call_id: Option<String>,
        tool: String,
        args: Value,
        parent_call_id: Option<String>,
    },
    ToolOutput {
        session_id: String,
        call_id: String,
        content: String,
    },
    ToolResult {
        session_id: String,
        call_id: Option<String>,
        tool: String,
        ok: bool,
        message: String,
        data: Option<Value>,
        parent_call_id: Option<String>,
    },
    ApprovalRequired {
        session_id: String,
        tool: String,
        args: Value,
        request_id: String,
    },
}

impl ProviderEvent {
    pub fn session_id(&self) -> &str {
        match self {
            ProviderEvent::Token { session_id, .. }
            | ProviderEvent::Thinking { session_id, .. }
            | ProviderEvent::SessionError { session_id, .. }
            | ProviderEvent::ToolStart { session_id, .. }
            | ProviderEvent::ToolOutput { session_id, .. }
            | ProviderEvent::ToolResult { session_id, .. }
            | ProviderEvent::ApprovalRequired { session_id, .. } => session_id,
        }
    }
}

/// Approval handler. Returning `false` denies the request; a panicking or
/// failing handler is treated as a denial, matching the TS `catch`.
pub type ApprovalDecider =
    Arc<dyn Fn(AcpApprovalRequest) -> HostFuture<'static, bool> + Send + Sync>;

/// One provider adapter. Implemented by the provider registry in production and
/// by in-process fakes in tests.
pub trait AcpSpecialistProvider: Send + Sync {
    fn info(&self) -> AcpProviderInfo;

    fn check_availability<'a>(&'a self) -> HostFuture<'a, Result<bool, String>>;

    /// MCP server refs handed to the specialist, built from the gateway config.
    fn mcp_server_refs(
        &self,
        sub_thread_id: &str,
        workspace: &str,
        runtime_mode: &str,
        config: Option<&Value>,
    ) -> Vec<Value>;

    fn start_session<'a>(
        &'a self,
        request: StartSessionRequest,
    ) -> HostFuture<'a, Result<AcpSession, String>>;

    fn send_turn<'a>(
        &'a self,
        session_id: &'a str,
        prompt: &'a str,
        sink: &'a mut (dyn FnMut(ProviderEvent) + Send),
    ) -> HostFuture<'a, Result<(), String>>;

    fn respond_to_approval<'a>(
        &'a self,
        session_id: &'a str,
        request_id: &'a str,
        approved: bool,
    ) -> HostFuture<'a, Result<(), String>>;

    fn stop_session<'a>(&'a self, session_id: &'a str) -> HostFuture<'a, Result<(), String>>;
}

/// Account-scoped provider lookup.
pub trait AcpSpecialistHost: Send + Sync {
    fn provider_for_user(
        &self,
        provider_id: &str,
        user_id: &str,
    ) -> Option<Arc<dyn AcpSpecialistProvider>>;
}

/// Inputs for one delegated turn.
#[derive(Default)]
pub struct AcpSpecialistRunOptions {
    pub provider_id: String,
    pub user_id: String,
    /// Sub-agent/thread id used for the specialist session and result payload.
    pub sub_agent_id: String,
    pub project_root: String,
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    /// Requested runtime mode; falls back to the provider's first mode.
    pub runtime_mode: Option<String>,
    /// Hard cap on the turn. `None` means [`DEFAULT_TIMEOUT_MS`].
    pub timeout_ms: Option<i64>,
    /// Aborts the turn once the watched value becomes `true`.
    pub abort: Option<tokio::sync::watch::Receiver<bool>>,
    pub on_approval_required: Option<ApprovalDecider>,
    pub on_nested_event: Option<Arc<dyn Fn(NestedAgentEvent) + Send + Sync>>,
    pub config: Option<Value>,
    /// Injected clock so segment timestamps are deterministic in tests.
    pub now: Option<Clock>,
}

impl AcpSpecialistRunOptions {
    pub fn new(
        provider_id: impl Into<String>,
        user_id: impl Into<String>,
        sub_agent_id: impl Into<String>,
        project_root: impl Into<String>,
        prompt: impl Into<String>,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            user_id: user_id.into(),
            sub_agent_id: sub_agent_id.into(),
            project_root: project_root.into(),
            prompt: prompt.into(),
            ..Self::default()
        }
    }

    fn clock(&self) -> Clock {
        self.now.clone().unwrap_or_else(default_clock)
    }
}

/// Transcript payload of a completed turn.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSpecialistData {
    pub sub_agent_id: String,
    pub provider: String,
    pub content: String,
    pub segments: Vec<Value>,
    pub tool_calls: Vec<Value>,
    pub duration_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub performative: Option<String>,
}

/// Tool result shape returned to the caller.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AcpSpecialistResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<AcpSpecialistData>,
}

impl AcpSpecialistResult {
    fn failed(message: String) -> Self {
        Self {
            ok: false,
            message,
            data: None,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PendingKind {
    Text,
    Thinking,
}

impl PendingKind {
    fn as_str(self) -> &'static str {
        match self {
            PendingKind::Text => "text",
            PendingKind::Thinking => "thinking",
        }
    }
}

/// Accumulates provider events into transcript segments + tool calls.
struct Collector {
    segments: Vec<Value>,
    tool_calls: Vec<Map<String, Value>>,
    call_index: HashMap<String, usize>,
    pending: Option<(PendingKind, String)>,
    now: Clock,
}

impl Collector {
    fn new(now: Clock) -> Self {
        Self {
            segments: Vec::new(),
            tool_calls: Vec::new(),
            call_index: HashMap::new(),
            pending: None,
            now,
        }
    }

    fn stamp(&self) -> i64 {
        (self.now)()
    }

    fn flush(&mut self) {
        let Some((kind, content)) = self.pending.take() else {
            return;
        };
        let trimmed = js_trim(&content);
        let text = match kind {
            PendingKind::Text => strip_performative_tag(trimmed),
            PendingKind::Thinking => trimmed,
        };
        if !text.is_empty() {
            self.segments.push(json!({ "type": kind.as_str(), "content": text }));
        }
    }

    fn text(&mut self, content: &str) {
        match &mut self.pending {
            Some((PendingKind::Text, buffered)) => buffered.push_str(content),
            _ => {
                self.flush();
                self.pending = Some((PendingKind::Text, content.to_string()));
            }
        }
    }

    fn thinking(&mut self, content: &str) {
        match &mut self.pending {
            Some((PendingKind::Thinking, buffered)) => buffered.push_str(content),
            _ => {
                self.flush();
                self.pending = Some((PendingKind::Thinking, content.to_string()));
            }
        }
    }

    fn error(&mut self, content: &str) {
        self.flush();
        let trimmed = js_trim(content);
        if !trimmed.is_empty() {
            self.segments
                .push(json!({ "type": "error", "content": trimmed }));
        }
    }

    fn tool_start(&mut self, call_id: &str, tool: &str, args: Value) {
        self.flush();
        match self.segments.last_mut().as_deref() {
            Some(last) if last["type"] == json!("toolGroup") => {
                if let Some(Value::Array(call_ids)) = self
                    .segments
                    .last_mut()
                    .and_then(|segment| segment.get_mut("callIds"))
                {
                    call_ids.push(Value::String(call_id.to_string()));
                }
            }
            _ => self
                .segments
                .push(json!({ "type": "toolGroup", "callIds": [call_id] })),
        }
        let index = self.tool_calls.len();
        self.call_index.insert(call_id.to_string(), index);
        let mut call = Map::new();
        call.insert("callId".into(), json!(call_id));
        call.insert("tool".into(), json!(tool));
        call.insert("args".into(), args);
        call.insert("ok".into(), json!(false));
        call.insert("message".into(), json!(IN_PROGRESS_MESSAGE));
        call.insert("startedAt".into(), json!(self.stamp()));
        self.tool_calls.push(call);
    }

    fn tool_result(
        &mut self,
        call_id: &str,
        tool: &str,
        ok: bool,
        message: &str,
        data: Option<Value>,
    ) {
        if let Some(index) = self.call_index.get(call_id).copied() {
            let now = self.stamp();
            let call = &mut self.tool_calls[index];
            call.insert("ok".into(), json!(ok));
            call.insert("message".into(), json!(message));
            match data {
                Some(value) => {
                    call.insert("data".into(), value);
                }
                None => {
                    call.remove("data");
                }
            }
            call.insert("completedAt".into(), json!(now));
            return;
        }
        // Result without a matching start (some CLI providers emit one). Record
        // it anyway so the call is visible on reload.
        let now = self.stamp();
        let index = self.tool_calls.len();
        self.call_index.insert(call_id.to_string(), index);
        let mut call = Map::new();
        call.insert("callId".into(), json!(call_id));
        call.insert("tool".into(), json!(tool));
        call.insert("ok".into(), json!(ok));
        call.insert("message".into(), json!(message));
        if let Some(value) = data {
            call.insert("data".into(), value);
        }
        call.insert("startedAt".into(), json!(now));
        call.insert("completedAt".into(), json!(now));
        self.tool_calls.push(call);
    }

    fn finalize(&mut self) -> (Vec<Value>, Vec<Value>) {
        self.flush();
        let now = self.stamp();
        for call in &mut self.tool_calls {
            if !call.contains_key("completedAt") {
                call.insert("ok".into(), json!(false));
                call.insert("message".into(), json!(NO_RESULT_MESSAGE));
                call.insert("completedAt".into(), json!(now));
            }
        }
        (
            self.segments.clone(),
            self.tool_calls.iter().cloned().map(Value::Object).collect(),
        )
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn js_round_seconds(timeout_ms: i64) -> i64 {
    (timeout_ms as f64 / 1000.0).round() as i64
}

enum TurnEnd {
    Completed(Result<(), String>),
    TimedOut,
    Aborted,
}

/// Runs one delegated turn, mirroring `runAcpSpecialistTurn`.
pub async fn run_acp_specialist_turn(
    host: Arc<dyn AcpSpecialistHost>,
    opts: AcpSpecialistRunOptions,
) -> AcpSpecialistResult {
    let Some(provider) = host.provider_for_user(&opts.provider_id, &opts.user_id) else {
        return AcpSpecialistResult::failed(format!(
            "Provider \"{}\" is not available for this account.",
            opts.provider_id
        ));
    };

    match provider.check_availability().await {
        Ok(true) => {}
        Ok(false) => {
            let reason = provider.info().unavailable_reason;
            return AcpSpecialistResult::failed(match reason {
                Some(reason) => format!(
                    "Provider \"{}\" is currently unavailable: {}",
                    opts.provider_id, reason
                ),
                None => format!(
                    "Provider \"{}\" is currently unavailable.",
                    opts.provider_id
                ),
            });
        }
        Err(err) => {
            return AcpSpecialistResult::failed(format!(
                "Could not check availability of provider \"{}\": {}",
                opts.provider_id, err
            ))
        }
    }

    let info = provider.info();
    let runtime_mode = match opts
        .runtime_mode
        .as_deref()
        .filter(|mode| info.modes.iter().any(|candidate| candidate == mode))
    {
        Some(mode) => mode.to_string(),
        None => info
            .modes
            .first()
            .cloned()
            .unwrap_or_else(|| DEFAULT_RUNTIME_MODE.to_string()),
    };

    let prompt = match &opts.system_prompt {
        Some(system_prompt) => format!("{}\n\n---\n\n{}", system_prompt, opts.prompt),
        None => opts.prompt.clone(),
    };

    let mcp_servers = provider.mcp_server_refs(
        &opts.sub_agent_id,
        &opts.project_root,
        &runtime_mode,
        opts.config.as_ref(),
    );

    let session = match provider
        .start_session(StartSessionRequest {
            thread_id: opts.sub_agent_id.clone(),
            workspace: opts.project_root.clone(),
            model: opts.model.clone(),
            mode: runtime_mode,
            mcp_servers,
        })
        .await
    {
        Ok(session) => session,
        Err(err) => {
            return AcpSpecialistResult::failed(format!(
                "Failed to start {} session for specialist: {}",
                opts.provider_id, err
            ))
        }
    };

    let timeout_ms = opts.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS);
    let now = opts.clock();
    let started_at = now();
    let collector = Arc::new(Mutex::new(Collector::new(now.clone())));
    let chunks: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let sink = {
        let collector = Arc::clone(&collector);
        let chunks = Arc::clone(&chunks);
        let provider = Arc::clone(&provider);
        let nested = opts.on_nested_event.clone();
        let approval = opts.on_approval_required.clone();
        let session_id = session.id.clone();
        let sub_agent_id = opts.sub_agent_id.clone();
        move |event: ProviderEvent| {
            if event.session_id() != session_id {
                return;
            }
            let fallback_call_id = |tool: &str| format!("{}-{}", sub_agent_id, tool);
            match event {
                ProviderEvent::Token { content, .. } => {
                    lock(&chunks).push(content.clone());
                    lock(&collector).text(&content);
                    if let Some(callback) = &nested {
                        callback(NestedAgentEvent::ToolOutput {
                            call_id: String::new(),
                            content,
                            channel: Some(ToolOutputChannel::Text),
                        });
                    }
                }
                ProviderEvent::Thinking { content, .. } => {
                    lock(&collector).thinking(&content);
                    if let Some(callback) = &nested {
                        callback(NestedAgentEvent::ToolOutput {
                            call_id: String::new(),
                            content,
                            channel: Some(ToolOutputChannel::Thinking),
                        });
                    }
                }
                ProviderEvent::SessionError { error, .. } => {
                    // TS pushes `\n[error] ${error}` onto the token stream and records a
                    // collector error; the final ok/message still come from the
                    // performative parse of the accumulated content.
                    lock(&chunks).push(format!("\n[error] {}", error));
                    lock(&collector).error(&error);
                }
                ProviderEvent::ToolStart {
                    call_id,
                    tool,
                    args,
                    parent_call_id,
                    ..
                } => {
                    let call_id = call_id.unwrap_or_else(|| fallback_call_id(&tool));
                    lock(&collector).tool_start(&call_id, &tool, args.clone());
                    if let Some(callback) = &nested {
                        callback(NestedAgentEvent::ToolStart {
                            tool,
                            args,
                            call_id,
                            parent_call_id,
                        });
                    }
                }
                ProviderEvent::ToolOutput {
                    call_id, content, ..
                } => {
                    if let Some(callback) = &nested {
                        callback(NestedAgentEvent::ToolOutput {
                            call_id,
                            content,
                            channel: None,
                        });
                    }
                }
                ProviderEvent::ToolResult {
                    call_id,
                    tool,
                    ok,
                    message,
                    data,
                    parent_call_id,
                    ..
                } => {
                    let call_id = call_id.unwrap_or_else(|| fallback_call_id(&tool));
                    lock(&collector).tool_result(&call_id, &tool, ok, &message, data.clone());
                    if let Some(callback) = &nested {
                        callback(NestedAgentEvent::ToolResult {
                            call_id,
                            tool,
                            ok,
                            message,
                            parent_call_id,
                            data,
                        });
                    }
                }
                ProviderEvent::ApprovalRequired {
                    tool,
                    args,
                    request_id,
                    ..
                } => {
                    let Some(decider) = approval.clone() else {
                        return;
                    };
                    let provider = Arc::clone(&provider);
                    let chunks = Arc::clone(&chunks);
                    let reply_session = session_id.clone();
                    tokio::spawn(async move {
                        let approved = decider(AcpApprovalRequest {
                            tool: tool.clone(),
                            args,
                            request_id: request_id.clone(),
                        })
                        .await;
                        if let Err(err) = provider
                            .respond_to_approval(&reply_session, &request_id, approved)
                            .await
                        {
                            lock(&chunks).push(format!(
                                "\n[error] could not answer approval for {}: {}",
                                tool, err
                            ));
                        }
                    });
                }
            }
        }
    };

    let end = {
        let turn = async {
            let mut sink = sink;
            provider.send_turn(&session.id, &prompt, &mut sink).await
        };
        let duration = Duration::from_millis(timeout_ms.max(0) as u64);
        match opts.abort.clone() {
            Some(mut abort) => {
                tokio::select! {
                    result = turn => TurnEnd::Completed(result),
                    _ = tokio::time::sleep(duration) => TurnEnd::TimedOut,
                    _ = abort.wait_for(|aborted| *aborted) => TurnEnd::Aborted,
                }
            }
            None => {
                tokio::select! {
                    result = turn => TurnEnd::Completed(result),
                    _ = tokio::time::sleep(duration) => TurnEnd::TimedOut,
                }
            }
        }
    };

    let collected_text = js_trim(&lock(&chunks).concat()).to_string();
    let duration_ms = now() - started_at;

    let result = match end {
        TurnEnd::Completed(Ok(())) => {
            let parsed = parse_performative(&collected_text);
            let ok = is_successful_performative(parsed.performative);
            let message = if !parsed.content.is_empty() {
                parsed.content
            } else if ok {
                "(specialist produced no output)".to_string()
            } else {
                format!("Sub-agent {}: no details given", parsed.performative)
            };
            let (segments, tool_calls) = lock(&collector).finalize();
            AcpSpecialistResult {
                ok,
                message,
                data: Some(AcpSpecialistData {
                    sub_agent_id: opts.sub_agent_id.clone(),
                    provider: opts.provider_id.clone(),
                    content: collected_text,
                    segments,
                    tool_calls,
                    duration_ms,
                    performative: Some(parsed.performative.to_string()),
                }),
            }
        }
        TurnEnd::Completed(Err(err)) => {
            let message = format!("Specialist turn on {} failed: {}", opts.provider_id, err);
            lock(&collector).error(&message);
            let (segments, tool_calls) = lock(&collector).finalize();
            AcpSpecialistResult {
                ok: false,
                message: message.clone(),
                data: Some(AcpSpecialistData {
                    sub_agent_id: opts.sub_agent_id.clone(),
                    provider: opts.provider_id.clone(),
                    content: collected_text,
                    segments,
                    tool_calls,
                    duration_ms,
                    performative: None,
                }),
            }
        }
        TurnEnd::TimedOut => {
            let partial = if collected_text.is_empty() {
                String::new()
            } else {
                format!(" Partial output:\n{}", collected_text)
            };
            let message = format!(
                "Specialist timed out after {}s waiting for {}.{}",
                js_round_seconds(timeout_ms),
                opts.provider_id,
                partial
            );
            let (segments, tool_calls) = lock(&collector).finalize();
            AcpSpecialistResult {
                ok: false,
                message,
                data: Some(AcpSpecialistData {
                    sub_agent_id: opts.sub_agent_id.clone(),
                    provider: opts.provider_id.clone(),
                    content: collected_text,
                    segments,
                    tool_calls,
                    duration_ms,
                    performative: None,
                }),
            }
        }
        TurnEnd::Aborted => {
            let (segments, tool_calls) = lock(&collector).finalize();
            AcpSpecialistResult {
                ok: false,
                message: "Cancelled before the specialist finished.".to_string(),
                data: Some(AcpSpecialistData {
                    sub_agent_id: opts.sub_agent_id.clone(),
                    provider: opts.provider_id.clone(),
                    content: collected_text,
                    segments,
                    tool_calls,
                    duration_ms,
                    performative: None,
                }),
            }
        }
    };

    // Best effort: the TS version stops the session in `finally`.
    provider.stop_session(&session.id).await.ok();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "sess-1";

    #[derive(Default)]
    struct Calls {
        starts: Vec<StartSessionRequest>,
        prompts: Vec<String>,
        approvals: Vec<(String, bool)>,
        stops: usize,
    }

    struct FakeProvider {
        info: AcpProviderInfo,
        availability: Result<bool, String>,
        start_error: Option<String>,
        events: Vec<ProviderEvent>,
        hang: bool,
        calls: Mutex<Calls>,
    }

    impl FakeProvider {
        fn new(events: Vec<ProviderEvent>) -> Self {
            Self {
                info: AcpProviderInfo {
                    modes: vec!["read-only".into(), "full-access".into()],
                    unavailable_reason: None,
                },
                availability: Ok(true),
                start_error: None,
                events,
                hang: false,
                calls: Mutex::new(Calls::default()),
            }
        }
    }

    impl AcpSpecialistProvider for FakeProvider {
        fn info(&self) -> AcpProviderInfo {
            self.info.clone()
        }

        fn check_availability<'a>(&'a self) -> HostFuture<'a, Result<bool, String>> {
            let result = match &self.availability {
                Ok(available) => Ok(*available),
                Err(err) => Err(err.clone()),
            };
            Box::pin(async move { result })
        }

        fn mcp_server_refs(
            &self,
            sub_thread_id: &str,
            _workspace: &str,
            _runtime_mode: &str,
            _config: Option<&Value>,
        ) -> Vec<Value> {
            vec![json!({ "name": sub_thread_id })]
        }

        fn start_session<'a>(
            &'a self,
            request: StartSessionRequest,
        ) -> HostFuture<'a, Result<AcpSession, String>> {
            lock(&self.calls).starts.push(request);
            let error = self.start_error.clone();
            Box::pin(async move {
                match error {
                    Some(error) => Err(error),
                    None => Ok(AcpSession {
                        id: SESSION.to_string(),
                    }),
                }
            })
        }

        fn send_turn<'a>(
            &'a self,
            _session_id: &'a str,
            prompt: &'a str,
            sink: &'a mut (dyn FnMut(ProviderEvent) + Send),
        ) -> HostFuture<'a, Result<(), String>> {
            lock(&self.calls).prompts.push(prompt.to_string());
            let events = self.events.clone();
            let hang = self.hang;
            Box::pin(async move {
                for event in events {
                    sink(event);
                }
                if hang {
                    std::future::pending::<()>().await;
                }
                Ok(())
            })
        }

        fn respond_to_approval<'a>(
            &'a self,
            _session_id: &'a str,
            request_id: &'a str,
            approved: bool,
        ) -> HostFuture<'a, Result<(), String>> {
            lock(&self.calls)
                .approvals
                .push((request_id.to_string(), approved));
            Box::pin(async move { Ok(()) })
        }

        fn stop_session<'a>(&'a self, _session_id: &'a str) -> HostFuture<'a, Result<(), String>> {
            lock(&self.calls).stops += 1;
            Box::pin(async move { Ok(()) })
        }
    }

    struct FakeHost {
        provider: Option<Arc<dyn AcpSpecialistProvider>>,
    }

    impl AcpSpecialistHost for FakeHost {
        fn provider_for_user(
            &self,
            _provider_id: &str,
            _user_id: &str,
        ) -> Option<Arc<dyn AcpSpecialistProvider>> {
            self.provider.clone()
        }
    }

    fn host(provider: Arc<dyn AcpSpecialistProvider>) -> Arc<dyn AcpSpecialistHost> {
        Arc::new(FakeHost {
            provider: Some(provider),
        })
    }

    fn token(content: &str) -> ProviderEvent {
        ProviderEvent::Token {
            session_id: SESSION.into(),
            content: content.into(),
        }
    }

    fn thinking(content: &str) -> ProviderEvent {
        ProviderEvent::Thinking {
            session_id: SESSION.into(),
            content: content.into(),
        }
    }

    fn opts() -> AcpSpecialistRunOptions {
        let mut options = AcpSpecialistRunOptions::new(
            "claude-code",
            "user-1",
            "thread-9",
            "/repo",
            "do the thing",
        );
        options.now = Some(Arc::new(|| 1_000));
        options
    }

    #[tokio::test]
    async fn text_and_thinking_segments_are_flushed_and_tag_stripped() {
        let provider = Arc::new(FakeProvider::new(vec![
            thinking("  plan  "),
            token("[inform] "),
            token("hello"),
        ]));
        let result = run_acp_specialist_turn(host(provider.clone()), opts()).await;

        assert!(result.ok, "{}", result.message);
        assert_eq!(result.message, "hello");
        let data = result.data.expect("completed turn has data");
        assert_eq!(
            data.segments,
            vec![
                json!({ "type": "thinking", "content": "plan" }),
                json!({ "type": "text", "content": "hello" }),
            ]
        );
        assert_eq!(data.performative.as_deref(), Some("inform"));
        assert_eq!(data.provider, "claude-code");
        assert_eq!(data.sub_agent_id, "thread-9");
        assert_eq!(lock(&provider.calls).stops, 1);
    }

    #[tokio::test]
    async fn consecutive_tool_starts_share_one_group_and_results_update_calls() {
        let provider = Arc::new(FakeProvider::new(vec![
            ProviderEvent::ToolStart {
                session_id: SESSION.into(),
                call_id: Some("c1".into()),
                tool: "read_file".into(),
                args: json!({ "path": "a" }),
                parent_call_id: None,
            },
            ProviderEvent::ToolStart {
                session_id: SESSION.into(),
                call_id: Some("c2".into()),
                tool: "write_file".into(),
                args: json!({ "path": "b" }),
                parent_call_id: None,
            },
            ProviderEvent::ToolResult {
                session_id: SESSION.into(),
                call_id: Some("c1".into()),
                tool: "read_file".into(),
                ok: true,
                message: "done".into(),
                data: Some(json!({ "bytes": 3 })),
                parent_call_id: None,
            },
        ]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;
        let data = result.data.expect("data");

        assert_eq!(
            data.segments,
            vec![json!({ "type": "toolGroup", "callIds": ["c1", "c2"] })]
        );
        assert_eq!(data.tool_calls.len(), 2);
        assert_eq!(data.tool_calls[0]["ok"], json!(true));
        assert_eq!(data.tool_calls[0]["message"], json!("done"));
        assert_eq!(data.tool_calls[0]["data"], json!({ "bytes": 3 }));
        assert_eq!(data.tool_calls[0]["completedAt"], json!(1_000));
        assert_eq!(data.tool_calls[0]["args"], json!({ "path": "a" }));
        assert_eq!(data.tool_calls[1]["ok"], json!(false));
        // `finalize()` rewrites still-in-flight calls to NO_RESULT_MESSAGE.
        assert_eq!(data.tool_calls[1]["message"], json!(NO_RESULT_MESSAGE));
        assert_eq!(data.tool_calls[1]["startedAt"], json!(1_000));
    }

    #[tokio::test]
    async fn result_without_start_is_recorded_completed() {
        let provider = Arc::new(FakeProvider::new(vec![ProviderEvent::ToolResult {
            session_id: SESSION.into(),
            call_id: Some("orphan".into()),
            tool: "bash".into(),
            ok: false,
            message: "boom".into(),
            data: None,
            parent_call_id: None,
        }]));
        let data = run_acp_specialist_turn(host(provider), opts())
            .await
            .data
            .expect("data");

        assert!(data.segments.is_empty());
        assert_eq!(data.tool_calls.len(), 1);
        let call = &data.tool_calls[0];
        assert_eq!(call["callId"], json!("orphan"));
        assert_eq!(call["ok"], json!(false));
        assert_eq!(call["startedAt"], json!(1_000));
        assert_eq!(call["completedAt"], json!(1_000));
        assert!(call.get("data").is_none());
    }

    #[tokio::test]
    async fn unfinished_calls_are_finalized_with_no_result_message() {
        let provider = Arc::new(FakeProvider::new(vec![ProviderEvent::ToolStart {
            session_id: SESSION.into(),
            call_id: None,
            tool: "bash".into(),
            args: Value::Null,
            parent_call_id: None,
        }]));
        let data = run_acp_specialist_turn(host(provider), opts())
            .await
            .data
            .expect("data");

        assert_eq!(data.tool_calls[0]["callId"], json!("thread-9-bash"));
        assert_eq!(data.tool_calls[0]["message"], json!(NO_RESULT_MESSAGE));
        assert_eq!(data.tool_calls[0]["completedAt"], json!(1_000));
    }

    #[tokio::test]
    async fn refusal_performative_reports_failure_with_details() {
        let provider = Arc::new(FakeProvider::new(vec![token("[refuse] not allowed")]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;

        assert!(!result.ok);
        assert_eq!(result.message, "not allowed");
        assert_eq!(
            result.data.expect("data").performative.as_deref(),
            Some("refuse")
        );
    }

    #[tokio::test]
    async fn empty_refusal_uses_no_details_message() {
        let provider = Arc::new(FakeProvider::new(vec![token("[failure]   ")]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;

        assert!(!result.ok);
        assert_eq!(result.message, "Sub-agent failure: no details given");
    }

    #[tokio::test]
    async fn empty_successful_output_uses_placeholder() {
        let provider = Arc::new(FakeProvider::new(vec![]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;

        assert!(result.ok);
        assert_eq!(result.message, "(specialist produced no output)");
    }

    #[tokio::test]
    async fn unknown_provider_and_unavailable_provider_return_no_data() {
        let missing = Arc::new(FakeHost { provider: None });
        let result = run_acp_specialist_turn(missing, opts()).await;
        assert!(!result.ok);
        assert_eq!(
            result.message,
            "Provider \"claude-code\" is not available for this account."
        );
        assert!(result.data.is_none());

        let mut provider = FakeProvider::new(vec![]);
        provider.availability = Ok(false);
        provider.info.unavailable_reason = Some("quota exhausted".into());
        let result = run_acp_specialist_turn(host(Arc::new(provider)), opts()).await;
        assert_eq!(
            result.message,
            "Provider \"claude-code\" is currently unavailable: quota exhausted"
        );
        assert!(result.data.is_none());
    }

    #[tokio::test]
    async fn availability_error_and_start_failure_return_no_data() {
        let mut provider = FakeProvider::new(vec![]);
        provider.availability = Err("network down".into());
        let result = run_acp_specialist_turn(host(Arc::new(provider)), opts()).await;
        assert_eq!(
            result.message,
            "Could not check availability of provider \"claude-code\": network down"
        );
        assert!(result.data.is_none());

        let mut provider = FakeProvider::new(vec![]);
        provider.start_error = Some("no binary".into());
        let result = run_acp_specialist_turn(host(Arc::new(provider)), opts()).await;
        assert_eq!(
            result.message,
            "Failed to start claude-code session for specialist: no binary"
        );
        assert!(result.data.is_none());
    }

    #[tokio::test]
    async fn session_error_becomes_error_segment_and_appends_to_content() {
        let provider = Arc::new(FakeProvider::new(vec![
            token("partial"),
            ProviderEvent::SessionError {
                session_id: SESSION.into(),
                error: "died".into(),
            },
        ]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;

        // TS: `chunks.push("\n[error] " + error)` + `collector.error(error)`; the turn's
        // ok/message are still derived from the performative parse, so a session error
        // does not by itself flip the run to failure.
        assert!(result.ok);
        let data = result.data.expect("data");
        assert_eq!(data.content, "partial\n[error] died");
        assert_eq!(result.message, "partial\n[error] died");
        assert_eq!(
            data.segments,
            vec![
                json!({ "type": "text", "content": "partial" }),
                json!({ "type": "error", "content": "died" }),
            ]
        );
        // parse_performative falls back to "inform" (same default as TS parsePerformative).
        assert_eq!(data.performative.as_deref(), Some("inform"));
    }

    #[tokio::test]
    async fn events_for_other_sessions_are_ignored() {
        let provider = Arc::new(FakeProvider::new(vec![ProviderEvent::Token {
            session_id: "other".into(),
            content: "leak".into(),
        }]));
        let result = run_acp_specialist_turn(host(provider), opts()).await;

        assert!(result.ok);
        assert_eq!(result.message, "(specialist produced no output)");
        assert!(result.data.expect("data").segments.is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn timeout_caps_the_turn_and_reports_partial_output() {
        let mut provider = FakeProvider::new(vec![token("half")]);
        provider.hang = true;
        let mut options = opts();
        options.timeout_ms = Some(120_000);
        // `hang` parks on `std::future::pending()`, so the only outstanding timer is the
        // turn deadline: advance the paused clock past it rather than waiting 120s.
        let (result, ()) = tokio::join!(
            run_acp_specialist_turn(host(Arc::new(provider)), options),
            async {
                tokio::time::sleep(Duration::from_millis(1)).await;
                tokio::time::advance(Duration::from_secs(121)).await;
            }
        );

        assert!(!result.ok);
        assert_eq!(
            result.message,
            "Specialist timed out after 120s waiting for claude-code. Partial output:\nhalf"
        );
        let data = result.data.expect("data");
        assert_eq!(data.content, "half");
        assert_eq!(data.duration_ms, 0);
    }

    #[tokio::test]
    async fn abort_cancels_the_turn_and_reports_cancelled() {
        let mut provider = FakeProvider::new(vec![token("half")]);
        provider.hang = true;
        let provider = Arc::new(provider);
        let (tx, rx) = tokio::sync::watch::channel(false);
        let mut options = opts();
        options.abort = Some(rx);

        let run = tokio::spawn(run_acp_specialist_turn(host(provider.clone()), options));
        tokio::task::yield_now().await;
        tx.send(true).expect("abort signal delivered");
        let result = run.await.expect("task joins");

        assert!(!result.ok);
        assert_eq!(result.message, "Cancelled before the specialist finished.");
        assert_eq!(result.data.expect("data").content, "half");
        assert_eq!(lock(&provider.calls).stops, 1);
    }

    #[tokio::test]
    async fn approval_decision_is_forwarded_to_the_provider() {
        let provider = Arc::new(FakeProvider::new(vec![ProviderEvent::ApprovalRequired {
            session_id: SESSION.into(),
            tool: "bash".into(),
            args: json!({ "command": "ls" }),
            request_id: "req-1".into(),
        }]));
        let decisions = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&decisions);
        let mut options = opts();
        options.on_approval_required = Some(Arc::new(move |request: AcpApprovalRequest| {
            lock(&recorded).push(request.tool);
            Box::pin(async { false })
        }));

        run_acp_specialist_turn(host(provider.clone()), options).await;
        for _ in 0..64 {
            if !lock(&provider.calls).approvals.is_empty() {
                break;
            }
            tokio::task::yield_now().await;
        }

        assert_eq!(*lock(&decisions), vec!["bash".to_string()]);
        assert_eq!(
            lock(&provider.calls).approvals,
            vec![("req-1".to_string(), false)]
        );
    }

    #[tokio::test]
    async fn nested_events_are_forwarded_for_tokens_and_tools() {
        let provider = Arc::new(FakeProvider::new(vec![
            token("hi"),
            ProviderEvent::ToolStart {
                session_id: SESSION.into(),
                call_id: Some("c1".into()),
                tool: "bash".into(),
                args: json!({}),
                parent_call_id: Some("p1".into()),
            },
            ProviderEvent::ToolOutput {
                session_id: SESSION.into(),
                call_id: "c1".into(),
                content: "out".into(),
            },
            ProviderEvent::ToolResult {
                session_id: SESSION.into(),
                call_id: Some("c1".into()),
                tool: "bash".into(),
                ok: true,
                message: "ok".into(),
                data: None,
                parent_call_id: None,
            },
        ]));
        let seen: Arc<Mutex<Vec<NestedAgentEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        let mut options = opts();
        options.on_nested_event = Some(Arc::new(move |event| lock(&sink).push(event)));

        run_acp_specialist_turn(host(provider), options).await;

        assert_eq!(
            *lock(&seen),
            vec![
                NestedAgentEvent::ToolOutput {
                    call_id: String::new(),
                    content: "hi".into(),
                    channel: Some(ToolOutputChannel::Text),
                },
                NestedAgentEvent::ToolStart {
                    tool: "bash".into(),
                    args: json!({}),
                    call_id: "c1".into(),
                    parent_call_id: Some("p1".into()),
                },
                NestedAgentEvent::ToolOutput {
                    call_id: "c1".into(),
                    content: "out".into(),
                    channel: None,
                },
                NestedAgentEvent::ToolResult {
                    call_id: "c1".into(),
                    tool: "bash".into(),
                    ok: true,
                    message: "ok".into(),
                    parent_call_id: None,
                    data: None,
                },
            ]
        );
    }

    #[tokio::test]
    async fn runtime_mode_and_system_prompt_reach_the_session() {
        let provider = Arc::new(FakeProvider::new(vec![]));
        let mut options = opts();
        options.runtime_mode = Some("nope".into());
        options.system_prompt = Some("be brief".into());
        options.model = Some("opus".into());
        options.config = Some(json!({ "port": 8000 }));

        run_acp_specialist_turn(host(provider.clone()), options).await;
        let calls = lock(&provider.calls);
        let start = calls.starts.first().expect("started once");
        assert_eq!(start.mode, "read-only");
        assert_eq!(start.model.as_deref(), Some("opus"));
        assert_eq!(start.workspace, "/repo");
        assert_eq!(start.thread_id, "thread-9");
        assert_eq!(start.mcp_servers, vec![json!({ "name": "thread-9" })]);
        assert_eq!(calls.prompts, vec!["be brief\n\n---\n\ndo the thing"]);
    }

    #[tokio::test]
    async fn requested_runtime_mode_is_used_when_supported() {
        let provider = Arc::new(FakeProvider::new(vec![]));
        let mut options = opts();
        options.runtime_mode = Some("full-access".into());

        run_acp_specialist_turn(host(provider.clone()), options).await;
        assert_eq!(lock(&provider.calls).starts[0].mode, "full-access");
    }
}
