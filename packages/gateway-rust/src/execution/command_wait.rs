//! Initial tool wait is independent of the command's process deadline.
use serde_json::Value;
pub const DEFAULT_COMMAND_YIELD_MS: f64 = 10_000.0;
pub const MAX_COMMAND_YIELD_MS: f64 = 30_000.0;
pub fn resolve_command_yield_ms(value: Option<&Value>, timeout_ms: f64) -> f64 {
    let requested = value
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && *v >= 0.0)
        .map(f64::ceil)
        .unwrap_or(DEFAULT_COMMAND_YIELD_MS);
    requested.min(MAX_COMMAND_YIELD_MS).min(timeout_ms).max(1.0)
}
