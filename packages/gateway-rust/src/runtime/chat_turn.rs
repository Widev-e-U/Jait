//! Bounded native chat/tool composition. Deliberately not mounted on HTTP.
//! Server code supplies configuration, authenticated context and persistence;
//! model arguments can only be input to an advertised tool.
use crate::{
    execution::process_runner::ProcessCancellation,
    providers::openai_stream::{
        EventSink, MAX_TOOL_ARGUMENT_BYTES, OpenAiHttp, OpenAiToolCall, ParsedStream, StreamFailure,
    },
    security::consent_executor::{
        ConsentAwareExecutor, ExecuteOptions, ToolExecutionContext, ToolResult,
    },
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::time::Instant;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TurnEvent {
    User {
        content: String,
    },
    Assistant {
        content: String,
        thinking: String,
        tool_calls: Vec<OpenAiToolCall>,
    },
    Tool {
        tool_call_id: String,
        name: String,
        result: ToolResult,
    },
}
impl TurnEvent {
    /// Matches agent-loop.ts: tool messages use tool_call_id, never name;
    /// assistant thinking is replayed as reasoning_content.
    pub fn to_message(&self) -> Value {
        match self {
            Self::User { content } => json!({"role":"user","content":content}),
            Self::Assistant {
                content,
                thinking,
                tool_calls,
            } => {
                let mut message =
                    json!({"role":"assistant","content":content,"reasoning_content":thinking});
                if !tool_calls.is_empty() {
                    message["tool_calls"] = json!(tool_calls);
                }
                message
            }
            Self::Tool {
                tool_call_id,
                result,
                ..
            } => {
                json!({"role":"tool","tool_call_id":tool_call_id,"content":serde_json::to_string(result).expect("serializable tool result")})
            }
        }
    }
}

/// Implementations bind owner/session outside model-visible data. A successful
/// append means durable acceptance; failures stop the turn before further effects.
pub trait TurnPersistence: Send + Sync {
    /// Durable bounded backends must override this preflight. The session lease
    /// must exclude all other writers until all admitted records are appended.
    /// The default is suitable only for unbounded in-memory test adapters.
    fn check_capacity(
        &self,
        _events: usize,
        _bytes: usize,
        _max_event_bytes: usize,
    ) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
    fn append(&self, event: TurnEvent) -> BoxFuture<'_, Result<(), String>>;
}
pub trait TurnProvider: Send + Sync {
    fn stream<'a>(
        &'a self,
        body: Value,
        cancellation: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>>;
}
impl TurnProvider for OpenAiHttp {
    fn stream<'a>(
        &'a self,
        body: Value,
        cancellation: &'a ProcessCancellation,
        sink: EventSink,
    ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
        Box::pin(OpenAiHttp::stream(self, body, cancellation, sink))
    }
}
pub trait TurnTools: Send + Sync {
    fn execute<'a>(
        &'a self,
        name: &'a str,
        input: &'a Value,
        context: &'a ToolExecutionContext,
    ) -> BoxFuture<'a, Result<ToolResult, String>>;
}
impl TurnTools for ConsentAwareExecutor {
    fn execute<'a>(
        &'a self,
        name: &'a str,
        input: &'a Value,
        context: &'a ToolExecutionContext,
    ) -> BoxFuture<'a, Result<ToolResult, String>> {
        Box::pin(ConsentAwareExecutor::execute(
            self,
            name,
            input,
            context,
            ExecuteOptions::default(),
        ))
    }
}

#[derive(Clone, Debug)]
pub struct TurnTool {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}
#[derive(Clone, Debug)]
pub struct TurnConfig {
    pub model: String,
    pub tools: Vec<TurnTool>,
    pub max_rounds: usize,
    pub max_tool_calls: usize,
    pub max_history_bytes: usize,
    pub max_tool_result_bytes: usize,
    pub timeout: Duration,
}
impl TurnConfig {
    pub(crate) fn validate(&self) -> Result<(), TurnError> {
        self.tools().map(|_| ())
    }
    fn tools(&self) -> Result<HashMap<String, &TurnTool>, TurnError> {
        if self.model.trim().is_empty()
            || !(1..=64).contains(&self.max_rounds)
            || !(1..=128).contains(&self.max_tool_calls)
            || !(1024..=8 * 1024 * 1024).contains(&self.max_history_bytes)
            || !(256..=1024 * 1024).contains(&self.max_tool_result_bytes)
            || self.timeout.is_zero()
            || self.timeout > Duration::from_secs(3600)
            || self.tools.len() > 128
        {
            return Err(TurnError::InvalidConfiguration);
        }
        let mut tools = HashMap::new();
        for tool in &self.tools {
            let wire_name = tool.name.replace('.', "_");
            if wire_name.is_empty()
                || wire_name.len() > 64
                || !wire_name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
                || !tool.parameters.is_object()
                || tools.insert(wire_name, tool).is_some()
            {
                // Never guess an inverse when names collide after dot conversion.
                return Err(TurnError::InvalidConfiguration);
            }
        }
        Ok(tools)
    }
}
#[derive(Debug, PartialEq, Eq)]
pub enum TurnError {
    InvalidConfiguration,
    Cancelled,
    TimedOut,
    RoundLimit,
    ToolCallLimit,
    HistoryLimit,
    InvalidHistory,
    InvalidToolCalls,
    EventConsumer,
    Provider(String),
    Persistence(String),
}
#[derive(Debug, PartialEq, Eq)]
pub struct TurnOutcome {
    pub rounds: usize,
    pub tool_calls: usize,
    pub content: String,
}

/// Callers must lease the authenticated session for the full turn. Independent
/// coordinators must never concurrently append/execute against the same session.
pub struct TurnCoordinator<'a> {
    pub config: TurnConfig,
    pub provider: &'a dyn TurnProvider,
    pub tools: &'a dyn TurnTools,
    pub persistence: &'a dyn TurnPersistence,
}
impl TurnCoordinator<'_> {
    pub async fn run(
        &self,
        mut history: Vec<Value>,
        user_content: String,
        context: &ToolExecutionContext,
        sink: EventSink,
    ) -> Result<TurnOutcome, TurnError> {
        let tools = self.config.tools()?;
        let deadline = Instant::now() + self.config.timeout;
        check_cancelled(&context.cancellation)?;
        if serde_json::to_vec(&history)
            .map_err(|_| TurnError::HistoryLimit)?
            .len()
            > self.config.max_history_bytes
        {
            return Err(TurnError::HistoryLimit);
        }
        let mut ids = validate_history(&history)?;
        let user = TurnEvent::User {
            content: user_content,
        };
        self.persist(&mut history, user, deadline).await?;
        let mut total_calls = 0;
        for round in 1..=self.config.max_rounds {
            check_cancelled(&context.cancellation)?;
            let mut body = json!({"model":self.config.model,"messages":history,"stream":true,"stream_options":{"include_usage":true}});
            if !tools.is_empty() {
                body["tools"] = json!(self.config.tools.iter().map(|tool| json!({"type":"function","function":{"name":tool.name.replace('.',"_"),"description":tool.description,"parameters":tool.parameters}})).collect::<Vec<_>>());
            }
            if serde_json::to_vec(&body)
                .map_err(|_| TurnError::HistoryLimit)?
                .len()
                > self.config.max_history_bytes
            {
                return Err(TurnError::HistoryLimit);
            }
            // Capture only displayable tokens, never arguments or tool deltas.
            // Escaping can expand a byte to six bytes in durable JSON.
            let snapshot_budget = self.config.max_history_bytes.saturating_sub(
                serde_json::to_vec(&history)
                    .map_err(|_| TurnError::HistoryLimit)?
                    .len()
                    + 128,
            ) / 6;
            // Worst-case JSON escaping remains below the store's 1 MiB event cap.
            let snapshot_budget = snapshot_budget.min(128 * 1024);
            let (round_sink, partial) = partial_sink(sink.clone(), snapshot_budget);
            let result = bounded(
                self.provider
                    .stream(body, &context.cancellation, round_sink),
                &context.cancellation,
                deadline,
            )
            .await;
            let parsed = match result {
                Ok(Ok(parsed)) => parsed,
                failed => {
                    let event = {
                        let partial = partial.lock().unwrap();
                        (!partial.content.is_empty() || !partial.thinking.is_empty()).then(|| {
                            TurnEvent::Assistant {
                                content: partial.content.clone(),
                                thinking: partial.thinking.clone(),
                                tool_calls: vec![],
                            }
                        })
                    };
                    if let Some(event) = event {
                        self.persist(&mut history, event, Instant::now() + Duration::from_secs(5))
                            .await?;
                    }
                    return Err(match failed {
                        Err(error) => error,
                        Ok(Err(StreamFailure::Cancelled)) => TurnError::Cancelled,
                        Ok(Err(StreamFailure::Http { status, message })) => {
                            TurnError::Provider(format!("HTTP {status}: {message}"))
                        }
                        Ok(Err(StreamFailure::Other(message))) => TurnError::Provider(message),
                        Ok(Ok(_)) => unreachable!(),
                    });
                }
            };
            if parsed.interrupted || context.cancellation.is_cancelled() {
                self.persist(
                    &mut history,
                    TurnEvent::Assistant {
                        content: parsed.content_text,
                        thinking: parsed.thinking_text,
                        tool_calls: vec![],
                    },
                    Instant::now() + Duration::from_secs(5),
                )
                .await?;
                return Err(TurnError::Cancelled);
            }
            if parsed.tool_calls.is_empty() {
                let content = parsed.content_text.clone();
                self.persist(
                    &mut history,
                    TurnEvent::Assistant {
                        content: parsed.content_text,
                        thinking: parsed.thinking_text,
                        tool_calls: vec![],
                    },
                    deadline,
                )
                .await?;
                return Ok(TurnOutcome {
                    rounds: round,
                    tool_calls: total_calls,
                    content,
                });
            }
            // Incomplete calls or conflicting correlation IDs must never execute.
            if parsed.finish_reason.as_deref() != Some("tool_calls")
                || parsed.tool_calls.iter().any(|call| {
                    call.kind != "function"
                        || call.id.is_empty()
                        || call.id.starts_with("pending-")
                        || call.id.len() > 256
                        || !ids.insert(call.id.clone())
                })
            {
                return Err(TurnError::InvalidToolCalls);
            }
            if parsed.tool_calls.len() > self.config.max_tool_calls - total_calls {
                return Err(TurnError::ToolCallLimit);
            }
            let calls = parsed.tool_calls;
            let assistant = TurnEvent::Assistant {
                content: parsed.content_text,
                thinking: parsed.thinking_text,
                tool_calls: calls.clone(),
            };
            let assistant_bytes = serde_json::to_vec(&json!({"version":1,"event":&assistant}))
                .map_err(|_| TurnError::HistoryLimit)?
                .len();
            let mut bytes = assistant_bytes;
            let mut max_event_bytes = assistant_bytes;
            let mut result_messages_bytes = 0;
            let empty_result = ToolResult::message(false, "");
            let empty_result_json =
                serde_json::to_string(&empty_result).map_err(|_| TurnError::HistoryLimit)?;
            let empty_encoded_string_bytes = serde_json::to_string(&empty_result_json)
                .map_err(|_| TurnError::HistoryLimit)?
                .len();
            for call in &calls {
                let empty_event = TurnEvent::Tool {
                    tool_call_id: call.id.clone(),
                    name: tools
                        .get(&call.function.name)
                        .map(|tool| tool.name.clone())
                        .unwrap_or_else(|| call.function.name.clone()),
                    result: empty_result.clone(),
                };
                let envelope_bytes = serde_json::to_vec(&json!({"version":1,"event":&empty_event}))
                    .map_err(|_| TurnError::HistoryLimit)?
                    .len()
                    - empty_result_json.len()
                    + self.config.max_tool_result_bytes;
                bytes += envelope_bytes;
                max_event_bytes = max_event_bytes.max(envelope_bytes);
                result_messages_bytes += serde_json::to_vec(&empty_event.to_message())
                    .map_err(|_| TurnError::HistoryLimit)?
                    .len()
                    - empty_encoded_string_bytes
                    + 2 * self.config.max_tool_result_bytes
                    + 2;
            }
            let history_bytes = serde_json::to_vec(&history)
                .map_err(|_| TurnError::HistoryLimit)?
                .len();
            let assistant_message_bytes = serde_json::to_vec(&assistant.to_message())
                .map_err(|_| TurnError::HistoryLimit)?
                .len();
            if history_bytes + assistant_message_bytes + result_messages_bytes + calls.len() + 1
                > self.config.max_history_bytes
            {
                return Err(TurnError::HistoryLimit);
            }
            bounded(
                self.persistence
                    .check_capacity(1 + calls.len(), bytes, max_event_bytes),
                &context.cancellation,
                deadline,
            )
            .await?
            .map_err(TurnError::Persistence)?;
            self.persist(&mut history, assistant, deadline).await?;
            let mut stop = None;
            let mut cleanup_deadline = None;
            for call in calls {
                let tool = tools.get(&call.function.name);
                // Authenticated context is copied intact; only the action id is new.
                let mut execution_context = context.clone();
                execution_context.action_id = uuid::Uuid::new_v4().to_string();
                let input = if call.function.arguments.len() <= MAX_TOOL_ARGUMENT_BYTES {
                    serde_json::from_str::<Value>(&call.function.arguments)
                        .ok()
                        .filter(Value::is_object)
                } else {
                    None
                };
                let result = if stop.is_some() || context.cancellation.is_cancelled() {
                    if stop.is_none() {
                        cleanup_deadline = Some(Instant::now() + Duration::from_secs(5));
                        stop = Some(TurnError::Cancelled);
                    }
                    ToolResult::message(false, "Cancelled before execution")
                } else if let (Some(tool), Some(input)) = (tool, input) {
                    total_calls += 1;
                    let start = json!({"type":"tool_start","call_id":call.id,"tool":tool.name,"args":input});
                    if let Err(error) =
                        emit_tool_event(&sink, start, &context.cancellation, deadline).await
                    {
                        cleanup_deadline = Some(Instant::now() + Duration::from_secs(5));
                        stop = Some(error);
                        ToolResult::message(
                            false,
                            "Tool was not executed because event delivery stopped",
                        )
                    } else {
                        match bounded(
                            self.tools.execute(&tool.name, &input, &execution_context),
                            &context.cancellation,
                            deadline,
                        )
                        .await
                        {
                            Ok(Ok(result)) => result,
                            Ok(Err(_)) => ToolResult::message(false, "Tool execution failed"),
                            Err(error) => {
                                cleanup_deadline = Some(Instant::now() + Duration::from_secs(5));
                                stop = Some(error);
                                ToolResult::message(
                                    false,
                                    "Execution interrupted; completion has not been verified",
                                )
                            }
                        }
                    }
                } else {
                    total_calls += 1;
                    ToolResult::message(
                        false,
                        "Tool is not advertised or arguments are not a bounded JSON object",
                    )
                };
                let result = if serde_json::to_vec(&result)
                    .map_or(true, |v| v.len() > self.config.max_tool_result_bytes)
                {
                    ToolResult::message(false, "Tool result exceeds size limit; output omitted")
                } else {
                    result
                };
                let name = tool
                    .map(|tool| tool.name.clone())
                    .unwrap_or(call.function.name);
                let mut result_event = json!({"type":"tool_result","call_id":call.id,"tool":name,"ok":result.ok,"message":result.message});
                if let Some(data) = &result.data {
                    result_event["data"] = data.clone();
                }
                self.persist(
                    &mut history,
                    TurnEvent::Tool {
                        tool_call_id: call.id,
                        name,
                        result,
                    },
                    cleanup_deadline.unwrap_or(deadline),
                )
                .await?;
                // The outcome is already durable. A failed consumer must never
                // change that outcome or leave later tool ids unanswered.
                if stop.is_none()
                    && let Err(error) =
                        emit_tool_event(&sink, result_event, &context.cancellation, deadline).await
                {
                    cleanup_deadline = Some(Instant::now() + Duration::from_secs(5));
                    stop = Some(error);
                }
            }
            if let Some(error) = stop {
                return Err(error);
            }
        }
        Err(TurnError::RoundLimit)
    }
    async fn persist(
        &self,
        history: &mut Vec<Value>,
        event: TurnEvent,
        deadline: Instant,
    ) -> Result<(), TurnError> {
        let message = event.to_message();
        history.push(message);
        if serde_json::to_vec(history)
            .map_err(|_| TurnError::HistoryLimit)?
            .len()
            > self.config.max_history_bytes
        {
            return Err(TurnError::HistoryLimit);
        }
        // Do not cancel a durable write midway; storage itself must bound admission.
        tokio::time::timeout_at(deadline, self.persistence.append(event))
            .await
            .map_err(|_| TurnError::TimedOut)?
            .map_err(TurnError::Persistence)
    }
}
fn check_cancelled(cancellation: &ProcessCancellation) -> Result<(), TurnError> {
    if cancellation.is_cancelled() {
        Err(TurnError::Cancelled)
    } else {
        Ok(())
    }
}
async fn bounded<T>(
    future: impl Future<Output = T>,
    cancellation: &ProcessCancellation,
    deadline: Instant,
) -> Result<T, TurnError> {
    tokio::select! { biased;
        _ = cancellation.wait_cancelled() => Err(TurnError::Cancelled),
        _ = tokio::time::sleep_until(deadline) => Err(TurnError::TimedOut),
        value = future => Ok(value),
    }
}

async fn emit_tool_event(
    sink: &EventSink,
    event: Value,
    cancellation: &ProcessCancellation,
    deadline: Instant,
) -> Result<(), TurnError> {
    bounded(sink(event), cancellation, deadline)
        .await?
        .map_err(|_| TurnError::EventConsumer)
}

#[derive(Default)]
struct PartialResponse {
    content: String,
    thinking: String,
    bytes: usize,
}
fn partial_sink(sink: EventSink, limit: usize) -> (EventSink, Arc<Mutex<PartialResponse>>) {
    let partial = Arc::new(Mutex::new(PartialResponse::default()));
    let capture = partial.clone();
    let forwarding: EventSink = Arc::new(move |event| {
        let capture = capture.clone();
        let sink = sink.clone();
        Box::pin(async move {
            if let (Some(kind @ ("token" | "thinking")), Some(text)) =
                (event["type"].as_str(), event["content"].as_str())
            {
                let mut partial = capture.lock().unwrap();
                if text.len() > limit.saturating_sub(partial.bytes) {
                    return Err("Partial response exceeds persistence limit".into());
                }
                partial.bytes += text.len();
                if kind == "token" {
                    partial.content.push_str(text);
                } else {
                    partial.thinking.push_str(text);
                }
            }
            sink(event).await
        })
    });
    (forwarding, partial)
}

/// A partial earlier tool batch is not safe to replay. Recovery is explicit;
/// never infer a tool outcome or re-execute an old id after a restart.
fn validate_history(history: &[Value]) -> Result<HashSet<String>, TurnError> {
    let mut ids = HashSet::new();
    let mut pending = HashSet::new();
    for message in history {
        match message.get("role").and_then(Value::as_str) {
            Some("tool") => {
                let id = message
                    .get("tool_call_id")
                    .and_then(Value::as_str)
                    .ok_or(TurnError::InvalidHistory)?;
                if !pending.remove(id) {
                    return Err(TurnError::InvalidHistory);
                }
            }
            Some("system" | "developer" | "user" | "assistant") if pending.is_empty() => {
                if let Some(calls) = message.get("tool_calls") {
                    if message["role"] != "assistant" {
                        return Err(TurnError::InvalidHistory);
                    }
                    for call in calls.as_array().ok_or(TurnError::InvalidHistory)? {
                        let id = call
                            .get("id")
                            .and_then(Value::as_str)
                            .filter(|id| !id.is_empty())
                            .ok_or(TurnError::InvalidHistory)?;
                        if !ids.insert(id.to_owned()) {
                            return Err(TurnError::InvalidHistory);
                        }
                        pending.insert(id.to_owned());
                    }
                }
            }
            _ => return Err(TurnError::InvalidHistory),
        }
    }
    if !pending.is_empty() {
        return Err(TurnError::InvalidHistory);
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        providers::openai_stream::OpenAiFunction,
        security::consent_executor::{ExecutionOrigin, RuntimeMode},
    };
    use std::{
        collections::VecDeque,
        path::PathBuf,
        sync::{
            Arc, Mutex,
            atomic::{AtomicBool, Ordering},
        },
    };

    #[derive(Default)]
    struct Store {
        events: Mutex<Vec<TurnEvent>>,
        fail: AtomicBool,
        reject_capacity: AtomicBool,
    }
    impl TurnPersistence for Store {
        fn check_capacity(
            &self,
            _: usize,
            _: usize,
            _: usize,
        ) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async {
                if self.reject_capacity.load(Ordering::SeqCst) {
                    Err("quota".into())
                } else {
                    Ok(())
                }
            })
        }
        fn append(&self, event: TurnEvent) -> BoxFuture<'_, Result<(), String>> {
            Box::pin(async move {
                if self.fail.load(Ordering::SeqCst) {
                    return Err("unavailable".into());
                }
                self.events.lock().unwrap().push(event);
                Ok(())
            })
        }
    }
    #[derive(Default)]
    struct Provider {
        replies: Mutex<VecDeque<ParsedStream>>,
        requests: Mutex<Vec<Value>>,
    }
    impl Provider {
        fn new(replies: Vec<ParsedStream>) -> Self {
            Self {
                replies: Mutex::new(replies.into()),
                ..Self::default()
            }
        }
    }
    impl TurnProvider for Provider {
        fn stream<'a>(
            &'a self,
            body: Value,
            _: &'a ProcessCancellation,
            _: EventSink,
        ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
            self.requests.lock().unwrap().push(body);
            let reply = self.replies.lock().unwrap().pop_front();
            Box::pin(async move {
                match reply {
                    Some(reply) => Ok(reply),
                    None => std::future::pending().await,
                }
            })
        }
    }
    struct Tools {
        result: ToolResult,
        calls: Mutex<Vec<(String, Value, ToolExecutionContext)>>,
        pending: bool,
        started: tokio::sync::Notify,
    }
    impl Tools {
        fn new(result: ToolResult) -> Self {
            Self {
                result,
                calls: Mutex::new(vec![]),
                pending: false,
                started: tokio::sync::Notify::new(),
            }
        }
    }
    impl TurnTools for Tools {
        fn execute<'a>(
            &'a self,
            name: &'a str,
            input: &'a Value,
            context: &'a ToolExecutionContext,
        ) -> BoxFuture<'a, Result<ToolResult, String>> {
            self.calls
                .lock()
                .unwrap()
                .push((name.into(), input.clone(), context.clone()));
            self.started.notify_one();
            Box::pin(async move {
                if self.pending {
                    std::future::pending().await
                } else {
                    Ok(self.result.clone())
                }
            })
        }
    }
    fn config() -> TurnConfig {
        TurnConfig {
            model: "configured-model".into(),
            tools: vec![TurnTool {
                name: "file.read".into(),
                description: "Read authorized file".into(),
                parameters: json!({"type":"object"}),
            }],
            max_rounds: 4,
            max_tool_calls: 8,
            max_history_bytes: 16 * 1024,
            max_tool_result_bytes: 256,
            timeout: Duration::from_secs(20),
        }
    }
    fn context() -> ToolExecutionContext {
        ToolExecutionContext {
            user_id: "owner".into(),
            session_id: "session".into(),
            action_id: "previous".into(),
            project_root: PathBuf::from("/authorized"),
            origin: ExecutionOrigin::Agent,
            runtime_mode: RuntimeMode::Guarded,
            cancellation: ProcessCancellation::default(),
            on_output: None,
        }
    }
    fn sink() -> EventSink {
        Arc::new(|_| Box::pin(async { Ok(()) }))
    }
    fn call(id: &str, name: &str, arguments: &str) -> OpenAiToolCall {
        OpenAiToolCall {
            id: id.into(),
            kind: "function".into(),
            function: OpenAiFunction {
                name: name.into(),
                arguments: arguments.into(),
            },
        }
    }
    fn reply(calls: Vec<OpenAiToolCall>) -> ParsedStream {
        ParsedStream {
            content_text: if calls.is_empty() {
                "Done".into()
            } else {
                "Checking".into()
            },
            thinking_text: "Reason".into(),
            finish_reason: Some(
                if calls.is_empty() {
                    "stop"
                } else {
                    "tool_calls"
                }
                .into(),
            ),
            tool_calls: calls,
            ..ParsedStream::default()
        }
    }
    #[tokio::test]
    async fn continues_tool_round_with_durable_events_and_server_context() {
        let provider = Provider::new(vec![
            reply(vec![call(
                "call-1",
                "file_read",
                r#"{"path":"a","user_id":"intruder","runtime_mode":"FullAccess","session_id":"other"}"#,
            )]),
            reply(vec![]),
        ]);
        let tools = Tools::new(ToolResult::message(true, "contents"));
        let store = Store::default();
        let context = context();
        let coordinator = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        assert_eq!(
            coordinator
                .run(vec![], "Read a".into(), &context, sink())
                .await
                .unwrap(),
            TurnOutcome {
                rounds: 2,
                tool_calls: 1,
                content: "Done".into()
            }
        );
        let events = store.events.lock().unwrap();
        assert!(
            matches!(&events[..], [TurnEvent::User{..},TurnEvent::Assistant{..},TurnEvent::Tool{result,..},TurnEvent::Assistant{..}] if result.ok)
        );
        let calls = tools.calls.lock().unwrap();
        assert_eq!(calls[0].0, "file.read");
        assert_eq!(calls[0].2.user_id, "owner");
        assert_eq!(calls[0].2.session_id, "session");
        assert_eq!(calls[0].2.project_root, PathBuf::from("/authorized"));
        assert_eq!(calls[0].2.runtime_mode, RuntimeMode::Guarded);
        assert_eq!(calls[0].2.origin, ExecutionOrigin::Agent);
        assert_ne!(calls[0].2.action_id, "previous");
        let requests = provider.requests.lock().unwrap();
        assert_eq!(requests[0]["tools"][0]["function"]["name"], "file_read");
        assert_eq!(requests[1]["model"], "configured-model");
        assert_eq!(requests[1]["messages"][1]["reasoning_content"], "Reason");
        assert_eq!(requests[1]["messages"][2]["tool_call_id"], "call-1");
        assert!(requests[1]["messages"][2].get("name").is_none());
    }
    #[tokio::test]
    async fn denied_tool_result_continues_without_claiming_success() {
        let provider = Provider::new(vec![
            reply(vec![call("c", "file_read", "{}")]),
            reply(vec![]),
        ]);
        let tools = Tools::new(ToolResult {
            ok: false,
            message: "User rejected".into(),
            data: Some(json!({"consentRejected":true})),
        });
        let store = Store::default();
        let result = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), sink())
        .await
        .unwrap();
        assert_eq!(result.rounds, 2);
        assert!(
            matches!(&store.events.lock().unwrap()[2],TurnEvent::Tool{result,..} if !result.ok && result.data.as_ref().unwrap()["consentRejected"]==true)
        );
    }
    #[tokio::test]
    async fn invalid_arguments_and_unadvertised_tools_never_execute() {
        let provider = Provider::new(vec![
            reply(vec![
                call("a", "file_read", "[]"),
                call("b", "terminal_run", "{}"),
            ]),
            reply(vec![]),
        ]);
        let tools = Tools::new(ToolResult::message(true, "must not execute"));
        let store = Store::default();
        TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), sink())
        .await
        .unwrap();
        assert!(tools.calls.lock().unwrap().is_empty());
        assert_eq!(
            store
                .events
                .lock()
                .unwrap()
                .iter()
                .filter(|e| matches!(e,TurnEvent::Tool{result,..} if !result.ok))
                .count(),
            2
        );
    }
    #[tokio::test]
    async fn cancellation_during_tool_closes_the_batch_without_running_siblings() {
        let provider = Provider::new(vec![reply(vec![
            call("a", "file_read", "{}"),
            call("b", "file_read", "{}"),
        ])]);
        let mut tools = Tools::new(ToolResult::message(true, "unused"));
        tools.pending = true;
        let store = Store::default();
        let context = context();
        let coordinator = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        let (result, ()) = tokio::join!(
            coordinator.run(vec![], "read".into(), &context, sink()),
            async {
                tools.started.notified().await;
                context.cancellation.cancel();
            }
        );
        assert_eq!(result.unwrap_err(), TurnError::Cancelled);
        assert_eq!(tools.calls.lock().unwrap().len(), 1);
        assert_eq!(store.events.lock().unwrap().len(), 4);
        let history = store
            .events
            .lock()
            .unwrap()
            .iter()
            .map(TurnEvent::to_message)
            .collect::<Vec<_>>();
        assert!(validate_history(&history).is_ok());
    }
    #[tokio::test(start_paused = true)]
    async fn hung_provider_is_bounded_and_precancelled_turn_has_no_writes() {
        let provider = Provider::default();
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        let coordinator = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        assert_eq!(
            coordinator
                .run(vec![], "read".into(), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::TimedOut
        );
        assert_eq!(provider.requests.lock().unwrap().len(), 1);
        let context = context();
        context.cancellation.cancel();
        assert_eq!(
            coordinator
                .run(vec![], "read".into(), &context, sink())
                .await
                .unwrap_err(),
            TurnError::Cancelled
        );
        assert_eq!(store.events.lock().unwrap().len(), 1);
    }
    #[tokio::test]
    async fn rounds_calls_history_and_result_sizes_are_bounded() {
        let provider = Provider::new(vec![reply(vec![call("a", "file_read", "{}")])]);
        let tools = Tools::new(ToolResult::message(true, "x".repeat(1024)));
        let store = Store::default();
        let mut settings = config();
        settings.max_rounds = 1;
        let coordinator = TurnCoordinator {
            config: settings,
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        assert_eq!(
            coordinator
                .run(vec![], "read".into(), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::RoundLimit
        );
        assert!(
            matches!(&store.events.lock().unwrap()[2],TurnEvent::Tool{result,..} if !result.ok && result.message.contains("size limit"))
        );
        let provider = Provider::new(vec![reply(vec![
            call("b", "file_read", "{}"),
            call("c", "file_read", "{}"),
        ])]);
        let mut settings = config();
        settings.max_tool_calls = 1;
        let coordinator = TurnCoordinator {
            config: settings,
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        assert_eq!(
            coordinator
                .run(vec![], "read".into(), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::ToolCallLimit
        );
        assert_eq!(tools.calls.lock().unwrap().len(), 1);
        assert_eq!(
            coordinator
                .run(vec![], "x".repeat(20 * 1024), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::HistoryLimit
        );
    }
    #[tokio::test]
    async fn storage_failure_prevents_provider_and_tools() {
        let provider = Provider::new(vec![reply(vec![])]);
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        store.fail.store(true, Ordering::SeqCst);
        let error = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), sink())
        .await
        .unwrap_err();
        assert_eq!(error, TurnError::Persistence("unavailable".into()));
        assert!(provider.requests.lock().unwrap().is_empty());
        assert!(tools.calls.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn incomplete_duplicate_or_replayed_calls_fail_before_execution() {
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        for parsed in [
            reply(vec![
                call("a", "file_read", "{}"),
                call("a", "file_read", "{}"),
            ]),
            reply(vec![call("pending-0", "file_read", "{}")]),
            {
                let mut p = reply(vec![call("a", "file_read", "{}")]);
                p.finish_reason = Some("length".into());
                p
            },
        ] {
            let provider = Provider::new(vec![parsed]);
            assert_eq!(
                TurnCoordinator {
                    config: config(),
                    provider: &provider,
                    tools: &tools,
                    persistence: &store
                }
                .run(vec![], "read".into(), &context(), sink())
                .await
                .unwrap_err(),
                TurnError::InvalidToolCalls
            );
        }
        let provider = Provider::new(vec![reply(vec![call("old", "file_read", "{}")])]);
        let history = vec![reply(vec![call("old", "file_read", "{}")])]
            .into_iter()
            .map(|p| {
                TurnEvent::Assistant {
                    content: p.content_text,
                    thinking: p.thinking_text,
                    tool_calls: p.tool_calls,
                }
                .to_message()
            })
            .collect::<Vec<_>>();
        let coordinator = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        assert_eq!(
            coordinator
                .run(history.clone(), "read".into(), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::InvalidHistory
        );
        let mut history = history;
        history.push(
            TurnEvent::Tool {
                tool_call_id: "old".into(),
                name: "file.read".into(),
                result: ToolResult::message(true, "done"),
            }
            .to_message(),
        );
        assert_eq!(
            coordinator
                .run(history, "read".into(), &context(), sink())
                .await
                .unwrap_err(),
            TurnError::InvalidToolCalls
        );
        assert!(tools.calls.lock().unwrap().is_empty());
    }
    #[test]
    fn ambiguous_tool_mapping_is_rejected() {
        let mut settings = config();
        settings.tools.push(TurnTool {
            name: "file_read".into(),
            description: "collision".into(),
            parameters: json!({}),
        });
        assert_eq!(
            settings.tools().unwrap_err(),
            TurnError::InvalidConfiguration
        );
    }
    #[tokio::test]
    async fn quota_rejection_precedes_assistant_append_and_tool_effects() {
        let provider = Provider::new(vec![reply(vec![call("a", "file_read", "{}")])]);
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        store.reject_capacity.store(true, Ordering::SeqCst);
        let result = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), sink())
        .await;
        assert_eq!(result.unwrap_err(), TurnError::Persistence("quota".into()));
        assert!(tools.calls.lock().unwrap().is_empty());
        assert_eq!(store.events.lock().unwrap().len(), 1);
    }
    struct PartialProvider {
        started: tokio::sync::Notify,
    }
    impl TurnProvider for PartialProvider {
        fn stream<'a>(
            &'a self,
            _: Value,
            _: &'a ProcessCancellation,
            sink: EventSink,
        ) -> BoxFuture<'a, Result<ParsedStream, StreamFailure>> {
            Box::pin(async move {
                sink(json!({"type":"thinking","content":"reason 🦀"}))
                    .await
                    .map_err(StreamFailure::Other)?;
                sink(json!({"type":"token","content":"partial answer"}))
                    .await
                    .map_err(StreamFailure::Other)?;
                sink(json!({"type":"tool_call_delta","call_id":"untrusted","name":"file_read"}))
                    .await
                    .map_err(StreamFailure::Other)?;
                self.started.notify_one();
                std::future::pending().await
            })
        }
    }
    #[tokio::test]
    async fn cancelled_stream_persists_displayed_partial_tokens_without_tool_calls() {
        let provider = PartialProvider {
            started: tokio::sync::Notify::new(),
        };
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        let context = context();
        let coordinator = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        };
        let (result, ()) = tokio::join!(
            coordinator.run(vec![], "read".into(), &context, sink()),
            async {
                provider.started.notified().await;
                context.cancellation.cancel();
            }
        );
        assert_eq!(result.unwrap_err(), TurnError::Cancelled);
        assert!(
            matches!(&store.events.lock().unwrap()[1],TurnEvent::Assistant{content,thinking,tool_calls} if content=="partial answer" && thinking=="reason 🦀" && tool_calls.is_empty())
        );
        assert!(tools.calls.lock().unwrap().is_empty());
    }
    #[tokio::test(start_paused = true)]
    async fn timedout_stream_persists_partial_snapshot() {
        let provider = PartialProvider {
            started: tokio::sync::Notify::new(),
        };
        let tools = Tools::new(ToolResult::message(true, "unused"));
        let store = Store::default();
        let error = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), sink())
        .await
        .unwrap_err();
        assert_eq!(error, TurnError::TimedOut);
        assert!(
            matches!(&store.events.lock().unwrap()[1],TurnEvent::Assistant{content,tool_calls,..} if content=="partial answer" && tool_calls.is_empty())
        );
    }
    #[tokio::test]
    async fn tool_events_use_canonical_names_and_follow_durable_record_order() {
        let provider = Provider::new(vec![
            reply(vec![call("a", "file_read", r#"{"path":"a"}"#)]),
            reply(vec![]),
        ]);
        let tools = Arc::new(Tools::new(ToolResult {
            ok: true,
            message: "read".into(),
            data: Some(json!({"path":"a"})),
        }));
        let store = Arc::new(Store::default());
        let events = Arc::new(Mutex::new(vec![]));
        let capture: EventSink = {
            let events = events.clone();
            let store = store.clone();
            let tools = tools.clone();
            Arc::new(move |event| {
                let events = events.clone();
                let store = store.clone();
                let tools = tools.clone();
                Box::pin(async move {
                    match event["type"].as_str() {
                        Some("tool_start") => {
                            assert!(matches!(
                                store.events.lock().unwrap().last(),
                                Some(TurnEvent::Assistant { .. })
                            ));
                            assert!(tools.calls.lock().unwrap().is_empty());
                        }
                        Some("tool_result") => {
                            assert!(
                                matches!(store.events.lock().unwrap().last(),Some(TurnEvent::Tool{result,..})if result.ok)
                            );
                            assert_eq!(tools.calls.lock().unwrap().len(), 1);
                        }
                        other => panic!("unexpected event {other:?}"),
                    }
                    events.lock().unwrap().push(event);
                    Ok(())
                })
            })
        };
        TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &*tools,
            persistence: &*store,
        }
        .run(vec![], "read".into(), &context(), capture)
        .await
        .unwrap();
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(
            events[0],
            json!({"type":"tool_start","call_id":"a","tool":"file.read","args":{"path":"a"}})
        );
        assert_eq!(
            events[1],
            json!({"type":"tool_result","call_id":"a","tool":"file.read","ok":true,"message":"read","data":{"path":"a"}})
        );
    }
    #[tokio::test]
    async fn tool_start_consumer_failure_closes_batch_before_any_effect() {
        let provider = Provider::new(vec![reply(vec![
            call("a", "file_read", "{}"),
            call("b", "file_read", "{}"),
        ])]);
        let tools = Tools::new(ToolResult::message(true, "must not execute"));
        let store = Store::default();
        let seen = Arc::new(Mutex::new(vec![]));
        let capture: EventSink = {
            let seen = seen.clone();
            Arc::new(move |event| {
                seen.lock().unwrap().push(event);
                Box::pin(async { Err("consumer disappeared".into()) })
            })
        };
        let error = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), capture)
        .await
        .unwrap_err();
        assert_eq!(error, TurnError::EventConsumer);
        assert!(tools.calls.lock().unwrap().is_empty());
        let stored = store.events.lock().unwrap();
        assert_eq!(stored.len(), 4);
        assert!(
            stored[2..]
                .iter()
                .all(|event| matches!(event,TurnEvent::Tool{result,..}if !result.ok))
        );
        assert!(
            validate_history(&stored.iter().map(TurnEvent::to_message).collect::<Vec<_>>()).is_ok()
        );
        assert_eq!(seen.lock().unwrap().len(), 1);
        assert_eq!(provider.requests.lock().unwrap().len(), 1);
    }
    #[tokio::test]
    async fn tool_result_consumer_failure_preserves_success_and_cancels_remaining_effects() {
        let provider = Provider::new(vec![reply(vec![
            call("a", "file_read", "{}"),
            call("b", "file_read", "{}"),
        ])]);
        let tools = Tools::new(ToolResult::message(true, "completed"));
        let store = Arc::new(Store::default());
        let seen = Arc::new(Mutex::new(vec![]));
        let capture: EventSink = {
            let seen = seen.clone();
            let store = store.clone();
            Arc::new(move |event| {
                let seen = seen.clone();
                let store = store.clone();
                Box::pin(async move {
                    let result = event["type"] == "tool_result";
                    if result {
                        assert!(
                            matches!(store.events.lock().unwrap().last(),Some(TurnEvent::Tool{result,..})if result.ok)
                        );
                    }
                    seen.lock().unwrap().push(event);
                    if result {
                        Err("consumer disappeared".into())
                    } else {
                        Ok(())
                    }
                })
            })
        };
        let error = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &*store,
        }
        .run(vec![], "read".into(), &context(), capture)
        .await
        .unwrap_err();
        assert_eq!(error, TurnError::EventConsumer);
        assert_eq!(tools.calls.lock().unwrap().len(), 1);
        let stored = store.events.lock().unwrap();
        assert_eq!(stored.len(), 4);
        assert!(
            matches!(&stored[2],TurnEvent::Tool{tool_call_id,result,..}if tool_call_id=="a"&&result.ok&&result.message=="completed")
        );
        assert!(
            matches!(&stored[3],TurnEvent::Tool{tool_call_id,result,..}if tool_call_id=="b"&&!result.ok)
        );
        assert!(
            validate_history(&stored.iter().map(TurnEvent::to_message).collect::<Vec<_>>()).is_ok()
        );
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0]["type"], "tool_start");
        assert_eq!(seen[1]["type"], "tool_result");
    }
    #[tokio::test(start_paused = true)]
    async fn stalled_tool_event_consumer_is_bounded_and_all_calls_get_records() {
        let provider = Provider::new(vec![reply(vec![
            call("a", "file_read", "{}"),
            call("b", "file_read", "{}"),
        ])]);
        let tools = Tools::new(ToolResult::message(true, "must not execute"));
        let store = Store::default();
        let capture: EventSink = Arc::new(|_| Box::pin(std::future::pending()));
        let error = TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), capture)
        .await
        .unwrap_err();
        assert_eq!(error, TurnError::TimedOut);
        assert!(tools.calls.lock().unwrap().is_empty());
        let stored = store.events.lock().unwrap();
        assert_eq!(stored.len(), 4);
        assert!(
            validate_history(&stored.iter().map(TurnEvent::to_message).collect::<Vec<_>>()).is_ok()
        );
    }
    #[tokio::test]
    async fn tool_result_events_emit_only_bounded_result_data() {
        let provider = Provider::new(vec![
            reply(vec![call("a", "file_read", "{}")]),
            reply(vec![]),
        ]);
        let tools = Tools::new(ToolResult {
            ok: true,
            message: "read".into(),
            data: Some(json!({"payload":"x".repeat(1024)})),
        });
        let store = Store::default();
        let events = Arc::new(Mutex::new(vec![]));
        let capture: EventSink = {
            let events = events.clone();
            Arc::new(move |event| {
                events.lock().unwrap().push(event);
                Box::pin(async { Ok(()) })
            })
        };
        TurnCoordinator {
            config: config(),
            provider: &provider,
            tools: &tools,
            persistence: &store,
        }
        .run(vec![], "read".into(), &context(), capture)
        .await
        .unwrap();
        let events = events.lock().unwrap();
        let result = &events[1];
        assert_eq!(result["type"], "tool_result");
        assert_eq!(result["ok"], false);
        assert!(result.get("data").is_none());
        assert!(result["message"].as_str().unwrap().contains("size limit"));
    }
}
