//! Closed security-service dispatch boundary. Ports must enforce assessment
//! ownership, authorized targets/methods, expiry, vantage and cancellation.
//! These presentation adapters grant no scanner or assessment-engine credit.
use super::{core_io::HostError, memory_tools::MemoryToolResult};
use crate::contracts::bounded_json::Utf16Text;
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::sync::Arc;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SecurityService {
    Assessment,
    Workbench,
    Scheduler,
}
impl SecurityService {
    pub fn name(self) -> &'static str {
        match self {
            Self::Assessment => "assessment",
            Self::Workbench => "workbench",
            Self::Scheduler => "scheduler",
        }
    }
}
pub struct SecurityContext<C> {
    pub fields: Value,
    pub capabilities: C,
}
/// The boolean requests the original cancellation capability from context for
/// this particular call. It must never be synthesized from serialized JSON.
pub type SecurityPort<C> = Arc<
    dyn for<'a> Fn(
            SecurityService,
            &'a str,
            Vec<Value>,
            bool,
            &'a SecurityContext<C>,
        ) -> BoxFuture<'a, Result<Value, HostError>>
        + Send
        + Sync,
>;
pub fn output(ok: bool, message: impl Into<String>, data: Option<Value>) -> MemoryToolResult {
    MemoryToolResult {
        ok: json!(ok),
        message: Utf16Text::from(message.into()),
        data,
    }
}
pub fn owner(fields: &Value) -> Value {
    fields
        .get("userId")
        .filter(|v| !v.is_null())
        .or_else(|| fields.get("requestedBy"))
        .cloned()
        .unwrap_or(Value::Null)
}
pub fn node(fields: &Value) -> Value {
    fields
        .get("executionNodeId")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or(json!("gateway"))
}
pub fn field(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}
pub fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .map(crate::services::calendar::js_text)
        .unwrap_or_else(|| "undefined".into())
}
pub fn project(value: &Value, keys: &[&str]) -> Value {
    let mut out = json!({});
    for key in keys {
        if let Some(v) = value.get(*key) {
            out[*key] = v.clone();
        }
    }
    out
}
pub fn array(value: &Value) -> &[Value] {
    value
        .as_array()
        .map(Vec::as_slice)
        .expect("typed security service array")
}
pub fn spread(value: &Value) -> Value {
    let mut out = json!({});
    match value {
        Value::Object(m) => return Value::Object(m.clone()),
        Value::Array(a) => {
            for (i, v) in a.iter().enumerate() {
                out[i.to_string()] = v.clone();
            }
        }
        Value::String(s) => {
            for (i, c) in s.encode_utf16().enumerate() {
                out[i.to_string()] = json!(String::from_utf16_lossy(&[c]));
            }
        }
        _ => {}
    }
    out
}
