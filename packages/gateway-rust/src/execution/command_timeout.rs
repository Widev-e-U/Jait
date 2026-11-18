//! Finite execution timeout policy with explicit configuration and JavaScript coercion.
use serde::Serialize;
use serde_json::Value;
pub const DEFAULT_COMMAND_TIMEOUT_MS: f64 = 3_600_000.0;
pub const MAX_COMMAND_TIMEOUT_MS: f64 = 86_400_000.0;
#[derive(Clone, Copy, Debug)]
pub struct TimeoutPolicy {
    default_ms: f64,
    max_ms: f64,
}
#[derive(Debug, Serialize)]
pub struct TimeoutResolution {
    pub milliseconds: f64,
    pub warning: Option<String>,
}
fn string_number(raw: &str) -> f64 {
    let raw = crate::text::js_trim(raw);
    if raw.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if raw.to_ascii_lowercase().starts_with(prefix) {
            let mut result = 0.0;
            if raw.len() == 2 {
                return f64::NAN;
            }
            for c in raw[2..].chars() {
                let Some(digit) = c.to_digit(radix) else {
                    return f64::NAN;
                };
                result = result * f64::from(radix) + f64::from(digit);
            }
            return result;
        }
    }
    raw.parse().unwrap_or(f64::NAN)
}
fn array_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Array(values) => values
            .iter()
            .map(array_string)
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
        _ => value.to_string(),
    }
}
pub fn number(value: Option<&Value>) -> f64 {
    match value {
        None => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(value)) => {
            if *value {
                1.0
            } else {
                0.0
            }
        }
        Some(Value::Number(value)) => value.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(value)) => string_number(value),
        Some(value @ Value::Array(_)) => string_number(&array_string(value)),
        Some(Value::Object(_)) => f64::NAN,
    }
}
fn configured(value: Option<&str>, fallback: f64) -> f64 {
    value
        .map(string_number)
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(fallback)
}
fn rounded(value: f64) -> String {
    let value = value.round();
    if value >= 1e21 {
        let text = format!("{value:e}");
        let (mantissa, exponent) = text.split_once('e').expect("exponential formatting");
        format!("{mantissa}e+{exponent}")
    } else {
        value.to_string()
    }
}
impl TimeoutPolicy {
    pub fn default_ms(&self) -> f64 {
        self.default_ms
    }
    pub fn max_ms(&self) -> f64 {
        self.max_ms
    }
    pub fn from_values(default: Option<&str>, max: Option<&str>) -> Self {
        let default_ms = configured(default, DEFAULT_COMMAND_TIMEOUT_MS);
        let max_ms = configured(max, MAX_COMMAND_TIMEOUT_MS).max(default_ms);
        Self { default_ms, max_ms }
    }
    pub fn from_environment() -> Self {
        Self::from_values(
            std::env::var("JAIT_TERMINAL_TIMEOUT_MS").ok().as_deref(),
            std::env::var("JAIT_TERMINAL_TIMEOUT_MAX_MS")
                .ok()
                .as_deref(),
        )
    }
    pub fn resolve(&self, value: Option<&Value>) -> TimeoutResolution {
        self.resolve_number(number(value))
    }
    pub fn resolve_number(&self, value: f64) -> TimeoutResolution {
        if !value.is_finite() || value <= 0.0 {
            return TimeoutResolution {
                milliseconds: self.default_ms,
                warning: None,
            };
        }
        if value > self.max_ms {
            return TimeoutResolution {
                milliseconds: self.max_ms,
                warning: Some(format!(
                    "[terminals] requested timeout {}ms exceeds the {}ms cap — clamping to the cap",
                    rounded(value),
                    rounded(self.max_ms)
                )),
            };
        }
        TimeoutResolution {
            milliseconds: value.ceil().max(1.0),
            warning: None,
        }
    }
}
pub fn default_command_timeout_ms() -> f64 {
    TimeoutPolicy::from_environment().default_ms
}
pub fn max_command_timeout_ms() -> f64 {
    TimeoutPolicy::from_environment().max_ms
}
pub fn resolve_command_timeout_ms(value: Option<&Value>) -> f64 {
    let resolved = TimeoutPolicy::from_environment().resolve(value);
    if let Some(warning) = resolved.warning {
        eprintln!("{warning}");
    }
    resolved.milliseconds
}
