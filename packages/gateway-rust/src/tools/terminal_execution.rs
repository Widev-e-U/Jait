//! Inspection/cancellation adapter. Session identity is supplied by the trusted
//! tool context, never by input. The monitor enforces execution ownership.
use crate::{
    contracts::bounded_json::Utf16Text,
    services::background_command_monitor::{BackgroundCommandMonitor, ExecutionSnapshot},
};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::LazyLock;

pub fn metadata() -> &'static Value {
    static DEFINITION: LazyLock<Value> = LazyLock::new(|| {
        json!({
            "name":"terminal.execution",
            "description":"Inspect partial output or cancel a tracked terminal command from this session. Use the terminalId and executionId returned by execute or jait.terminal. Inspection does not rerun the command. Completion is reported automatically; inspect when progress is needed, rather than polling in a loop.",
            "tier":"standard","category":"terminal","source":"builtin",
            "parameters":{"type":"object","required":["action","terminalId","executionId"],"properties":{
                "action":{"type":"string","enum":["inspect","cancel"]},
                "terminalId":{"type":"string"},"executionId":{"type":"string"}
            }}
        })
    });
    &DEFINITION
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionData {
    pub terminal_id: String,
    pub execution_id: String,
    pub status: String,
    pub output: Utf16Text,
    pub exit_code: Option<f64>,
    pub duration_ms: f64,
}
impl From<ExecutionSnapshot> for ExecutionData {
    fn from(value: ExecutionSnapshot) -> Self {
        Self {
            terminal_id: value.terminal_id,
            execution_id: value.execution_id,
            status: value.status,
            output: value.output,
            exit_code: value.exit_code,
            duration_ms: value.duration_ms,
        }
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct ExecutionResult {
    pub ok: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ExecutionData>,
}
/// A closed monitor port keeps service errors observable, as in the reference.
/// Production uses BackgroundCommandMonitor directly; this boundary grants no
/// process execution, surface lookup, or authorization capability.
pub trait ExecutionMonitor {
    fn inspect(&self, session: &str, terminal: &str, execution: &str) -> Option<ExecutionSnapshot>;
    fn cancel(
        &self,
        session: &str,
        terminal: &str,
        execution: &str,
    ) -> Result<Option<ExecutionSnapshot>, String>;
}
impl ExecutionMonitor for BackgroundCommandMonitor {
    fn inspect(&self, session: &str, terminal: &str, execution: &str) -> Option<ExecutionSnapshot> {
        self.inspect_execution(session, terminal, execution)
    }
    fn cancel(
        &self,
        session: &str,
        terminal: &str,
        execution: &str,
    ) -> Result<Option<ExecutionSnapshot>, String> {
        self.cancel_execution(session, terminal, execution)
    }
}
pub fn execute(
    input: &Value,
    session: &str,
    monitor: &impl ExecutionMonitor,
) -> Result<ExecutionResult, String> {
    let result = match (input["terminalId"].as_str(), input["executionId"].as_str()) {
        (Some(terminal), Some(execution)) => {
            if input["action"] == "cancel" {
                monitor.cancel(session, terminal, execution)?
            } else {
                monitor.inspect(session, terminal, execution)
            }
        }
        _ => None,
    };
    Ok(match result {
        Some(snapshot) => ExecutionResult {
            ok: true,
            message: format!("Command {}", snapshot.status),
            data: Some(snapshot.into()),
        },
        None => ExecutionResult {
            ok: false,
            message: "Tracked execution not found in this session (or expired).".into(),
            data: None,
        },
    })
}
