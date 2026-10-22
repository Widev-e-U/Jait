//! Consent-aware dispatch. Only authenticated server code constructs execution context;
//! model arguments never choose ownership, scheduler origin, or full-access mode.
//! The mandatory delegate supplies the local registry or remote routing implementation.
//! It captures its authenticated audit writer, matching the reference executor's audit
//! forwarding; this layer never duplicates tool audit entries or records dry-run effects.
//! The delegate retains node/path/sandbox/assessment boundaries and output limits.
use crate::{
    execution::process_runner::ProcessCancellation,
    security::{
        consent_manager::{ConsentManager, ConsentRequestPolicy, DecisionVia, RequestConsent},
        contracts::Risk,
        tool_permissions::{self, ConsentLevel, ToolPermission},
        trust_worker::TrustWorker,
    },
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ToolResult {
    pub ok: bool,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}
impl ToolResult {
    pub fn message(ok: bool, message: impl Into<String>) -> Self {
        Self {
            ok,
            message: message.into(),
            data: None,
        }
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ExecutionOrigin {
    #[default]
    Agent,
    User,
    Scheduler,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum RuntimeMode {
    #[default]
    Guarded,
    FullAccess,
}
/// Internal context, deliberately not deserializable from model/tool arguments.
#[derive(Clone)]
pub struct ToolExecutionContext {
    pub user_id: String,
    pub session_id: String,
    pub action_id: String,
    pub project_root: PathBuf,
    pub origin: ExecutionOrigin,
    pub runtime_mode: RuntimeMode,
    pub cancellation: ProcessCancellation,
    pub on_output: Option<Arc<dyn Fn(String) + Send + Sync>>,
}
pub type ToolDelegate = Arc<
    dyn for<'a> Fn(
            &'a str,
            &'a Value,
            &'a ToolExecutionContext,
        ) -> BoxFuture<'a, Result<ToolResult, String>>
        + Send
        + Sync,
>;
pub trait ToolTrust: Send + Sync {
    fn level<'a>(&'a self, name: &'a str) -> BoxFuture<'a, Result<f64, String>>;
    fn record_approval<'a>(&'a self, name: &'a str) -> BoxFuture<'a, Result<(), String>>;
}
impl ToolTrust for TrustWorker {
    fn level<'a>(&'a self, name: &'a str) -> BoxFuture<'a, Result<f64, String>> {
        Box::pin(async move {
            self.get(name.into())
                .await
                .map(|state| f64::from(state.current_level))
                .map_err(|e| e.to_string())
        })
    }
    fn record_approval<'a>(&'a self, name: &'a str) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.approve(name.into())
                .await
                .map(|_| ())
                .map_err(|e| e.to_string())
        })
    }
}
#[derive(Clone, Copy, Default)]
pub struct ExecuteOptions {
    pub dry_run: bool,
    pub consent_timeout_ms: Option<f64>,
}
pub struct ConsentExecutorOptions {
    pub user_id: String,
    pub session_id: String,
    pub permissions: HashMap<String, ToolPermission>,
    pub session_approvals: HashSet<String>,
    pub profile_name: Option<String>,
    pub max_concurrent: NonZeroU16,
}
pub struct ConsentAwareExecutor {
    options: ConsentExecutorOptions,
    approvals: Mutex<HashSet<String>>,
    consent: ConsentManager,
    trust: Arc<dyn ToolTrust>,
    delegate: ToolDelegate,
    permits: Arc<Semaphore>,
}
impl ConsentAwareExecutor {
    pub fn new(
        options: ConsentExecutorOptions,
        consent: ConsentManager,
        trust: Arc<dyn ToolTrust>,
        delegate: ToolDelegate,
    ) -> Self {
        let approvals = Mutex::new(options.session_approvals.clone());
        let permits = Arc::new(Semaphore::new(usize::from(options.max_concurrent.get())));
        Self {
            options,
            approvals,
            consent,
            trust,
            delegate,
            permits,
        }
    }
    pub fn session_approvals(&self) -> HashSet<String> {
        self.approvals.lock().unwrap().clone()
    }
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &ToolExecutionContext,
        options: ExecuteOptions,
    ) -> Result<ToolResult, String> {
        if context.user_id != self.options.user_id || context.session_id != self.options.session_id
        {
            return Ok(ToolResult::message(
                false,
                "Tool context does not belong to this session",
            ));
        }
        if context.cancellation.is_cancelled() {
            return Ok(cancelled());
        }
        // ToolParametersSchema.type is "object" in the shared tool contract.
        // Reject malformed model arguments before they can reach policy previews or a delegate.
        if !input.is_object() {
            return Ok(ToolResult::message(
                false,
                "Tool arguments must be an object",
            ));
        }
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "tool execution capacity unavailable".to_string())?;
        let permission = tool_permissions::resolve_tool_permission(name, &self.options.permissions);
        let trust_level = tokio::select! {
            biased;
            _ = context.cancellation.wait_cancelled() => return Ok(cancelled()),
            level = self.trust.level(name) => level?,
        };
        let summary = summary(name, input);
        let preview = preview(name, input);
        let requires = tool_permissions::requires_consent(
            Some(&permission.permission),
            trust_level,
            &self.approvals.lock().unwrap(),
        );
        if options.dry_run {
            return Ok(ToolResult {
                ok: true,
                message: "Dry-run: showing plan without executing".into(),
                data: Some(
                    json!({"dryRun":true,"toolName":name,"input":input,"summary":summary,"preview":preview,"requiresConsent":requires,"trustLevel":js_number(trust_level),"risk":permission.permission.risk,"policy":{"profileName":self.options.profile_name,"consentLevel":permission.permission.consent_level,"description":permission.permission.description,"knownTool":permission.known_tool,"source":permission.source}}),
                ),
            });
        }
        let mut irreversible = None;
        if matches!(
            name,
            "terminal.run" | "terminal.stream" | "execute" | "jait.terminal"
        ) && let Some(command) = input.get("command").and_then(Value::as_str)
        {
            let command_permission = if matches!(name, "execute" | "jait.terminal") {
                self.options
                    .permissions
                    .get("terminal.run")
                    .unwrap_or(&permission.permission)
            } else {
                &permission.permission
            };
            let check = tool_permissions::is_command_allowed(command, Some(command_permission));
            if !check.allowed {
                return Ok(ToolResult::message(
                    false,
                    format!("Command blocked: {}", check.reason.unwrap_or_default()),
                ));
            }
            irreversible = tool_permissions::classify_irreversible_command(command).reason;
        }
        let needs_consent = requires || irreversible.is_some();
        let approve_all = self
            .consent
            .is_approve_all_enabled_for_session(&context.session_id);
        if context.runtime_mode == RuntimeMode::FullAccess
            || !needs_consent
            || (irreversible.is_none()
                && (approve_all || context.origin == ExecutionOrigin::Scheduler))
        {
            let result = self.run_tool(name, input, context).await?;
            if result.ok {
                self.trust.record_approval(name).await?;
            }
            return Ok(result);
        }
        if context.cancellation.is_cancelled() {
            return Ok(cancelled());
        }
        let mut consent = self.consent.request_consent(RequestConsent {
            action_id: context.action_id.clone(),
            tool_name: name.into(),
            summary: irreversible
                .map(|reason| format!("{summary} — {reason}"))
                .unwrap_or(summary),
            preview,
            risk: if irreversible.is_some() {
                Risk::High
            } else {
                permission.permission.risk
            },
            policy: ConsentRequestPolicy {
                consent_level: if irreversible.is_some() {
                    ConsentLevel::Dangerous
                } else {
                    permission.permission.consent_level
                },
                description: irreversible
                    .unwrap_or(&permission.permission.description)
                    .into(),
                known_tool: permission.known_tool,
                source: permission.source,
            },
            session_id: context.session_id.clone(),
            timeout_ms: options.consent_timeout_ms,
        })?;
        // Hold admission until a dropped wait has removed its pending approval too.
        let mut pending = PendingConsent {
            manager: self.consent.clone(),
            id: Some(consent.id.clone()),
            permit: Some(permit),
        };
        let decision = tokio::select! {
            biased;
            _=context.cancellation.wait_cancelled()=>return Ok(cancelled()),
            decision=consent.wait()=>decision?,
        };
        pending.id = None;
        if !decision.approved {
            return Ok(ToolResult {
                ok: false,
                message: if decision.decided_via == DecisionVia::Timeout {
                    format!("Consent timed out for {name}")
                } else {
                    format!(
                        "User rejected {name}: {}",
                        decision.reason.as_deref().unwrap_or("no reason given")
                    )
                },
                data: Some(json!({"consentRejected":true,"decidedVia":decision.decided_via})),
            });
        }
        let result = self.run_tool(name, input, context).await?;
        if result.ok {
            self.trust.record_approval(name).await?;
            if permission.permission.consent_level == ConsentLevel::Once {
                self.approvals.lock().unwrap().insert(name.into());
            }
        }
        Ok(result)
    }
    async fn run_tool(
        &self,
        name: &str,
        input: &Value,
        context: &ToolExecutionContext,
    ) -> Result<ToolResult, String> {
        if context.cancellation.is_cancelled() {
            return Ok(cancelled());
        }
        (self.delegate)(name, input, context).await
    }
}
struct PendingConsent {
    manager: ConsentManager,
    id: Option<String>,
    permit: Option<OwnedSemaphorePermit>,
}
impl Drop for PendingConsent {
    fn drop(&mut self) {
        if let Some(id) = self.id.take() {
            let manager = self.manager.clone();
            let permit = self.permit.take();
            // Persistence may block: do not hold a Tokio worker during aborted-wait cleanup.
            tokio::task::spawn_blocking(move || {
                let _permit = permit;
                let _ = manager.reject(&id, Some(DecisionVia::Auto), Some("Cancelled".into()));
            });
        }
    }
}
fn cancelled() -> ToolResult {
    ToolResult::message(false, "Cancelled")
}
// Preserve JSON.stringify number spelling, including null for non-finite values.
fn js_number(value: f64) -> Value {
    serde_json::from_str(ryu_js::Buffer::new().format(value)).unwrap_or(Value::Null)
}
fn js_text(value: Option<&Value>) -> String {
    match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(_)) => "[object Object]".into(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_text(Some(v))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Number(v)) => ryu_js::Buffer::new()
            .format(v.as_f64().unwrap_or_default())
            .to_string(),
        Some(v) => v.to_string(),
    }
}
fn value_or(input: &Value, key: &str, fallback: &str) -> String {
    match input.get(key) {
        None | Some(Value::Null) => fallback.into(),
        Some(v) => js_text(Some(v)),
    }
}
fn summary(name: &str, input: &Value) -> String {
    match name {
        "terminal.run" | "execute" | "jait.terminal" => {
            format!("Run command: {}", value_or(input, "command", "(unknown)"))
        }
        "terminal.stream" => "Open a new terminal session".into(),
        "file.write" => format!("Write to file: {}", value_or(input, "path", "(unknown)")),
        "file.patch" => format!("Patch file: {}", value_or(input, "path", "(unknown)")),
        "file.read" => format!("Read file: {}", value_or(input, "path", "(unknown)")),
        "os.install" => format!(
            "Install package: {}",
            value_or(input, "package", "(unknown)")
        ),
        "os.query" => format!("Query OS: {}", value_or(input, "type", "(unknown)")),
        "computer.session" if input["action"] == "start" => format!(
            "Start visible computer control on {}",
            value_or(input, "nodeId", "the selected desktop")
        ),
        "computer.session" => format!("{} computer control", value_or(input, "action", "Manage")),
        "computer.act" => format!("Computer input: {}", value_or(input, "action", "action")),
        "computer.observe" => "Capture the controlled computer screen".into(),
        "surfaces.start" => format!("Start surface: {}", value_or(input, "type", "(unknown)")),
        "surfaces.stop" => format!("Stop surface: {}", value_or(input, "id", "(unknown)")),
        _ => format!("Execute tool: {name}"),
    }
}
fn fields(input: &Value, keys: &[&str]) -> Map<String, Value> {
    keys.iter()
        .filter_map(|key| input.get(*key).map(|v| ((*key).into(), v.clone())))
        .collect()
}
fn preview(name: &str, input: &Value) -> Map<String, Value> {
    match name {
        "terminal.run" | "execute" | "jait.terminal" => fields(input, &["command", "timeout"]),
        "file.write" => {
            let mut result = fields(input, &["path"]);
            if let Some(content) = input["content"].as_str() {
                result.insert(
                    "content".into(),
                    Value::String(String::from_utf16_lossy(
                        &content.encode_utf16().take(500).collect::<Vec<_>>(),
                    )),
                );
            }
            result
        }
        "file.patch" => fields(input, &["path", "search", "replace"]),
        "os.install" => fields(input, &["package"]),
        _ => input.as_object().cloned().unwrap_or_default(),
    }
}
