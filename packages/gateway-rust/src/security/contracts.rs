//! Public security DTOs and asynchronous service contract; no consent engine activation.
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(into = "u8")]
pub enum TrustLevel {
    Zero,
    One,
    Two,
    Three,
}
impl<'de> Deserialize<'de> for TrustLevel {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = serde_json::Value::deserialize(deserializer)?;
        match value.as_f64() {
            Some(0.0) => Ok(Self::Zero),
            Some(1.0) => Ok(Self::One),
            Some(2.0) => Ok(Self::Two),
            Some(3.0) => Ok(Self::Three),
            _ => Err(serde::de::Error::custom("trust level must be 0, 1, 2 or 3")),
        }
    }
}
impl TryFrom<u8> for TrustLevel {
    type Error = &'static str;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Zero),
            1 => Ok(Self::One),
            2 => Ok(Self::Two),
            3 => Ok(Self::Three),
            _ => Err("trust level must be 0, 1, 2 or 3"),
        }
    }
}
impl From<TrustLevel> for u8 {
    fn from(value: TrustLevel) -> Self {
        match value {
            TrustLevel::Zero => 0,
            TrustLevel::One => 1,
            TrustLevel::Two => 2,
            TrustLevel::Three => 3,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Low,
    Medium,
    High,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequest {
    pub action_id: String,
    pub tool_name: String,
    pub summary: String,
    pub risk: Risk,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentDecision {
    pub action_id: String,
    pub approved: bool,
    pub decided_at: String,
    pub decided_by: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuditStatus {
    Started,
    Completed,
    Failed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    pub action_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub status: AuditStatus,
    pub input: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    pub timestamp: String,
}
/// Rejections are explicit native errors. `Ok(None)` is the source's declined/missing decision.
pub trait SecurityService {
    type Error;
    fn request_consent(
        &mut self,
        request: ConsentRequest,
    ) -> BoxFuture<'_, Result<Option<ConsentDecision>, Self::Error>>;
    fn record_audit(&mut self, record: AuditRecord) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn get_trust_level<'a>(
        &'a mut self,
        operator_id: &'a str,
    ) -> BoxFuture<'a, Result<TrustLevel, Self::Error>>;
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trust_levels_reject_values_outside_the_literal_union() {
        for value in 0..=3 {
            assert_eq!(
                serde_json::to_value(
                    serde_json::from_value::<TrustLevel>(serde_json::json!(value)).unwrap()
                )
                .unwrap(),
                value
            );
        }
        for valid in ["1.0", "1e0", "-0"] {
            assert!(serde_json::from_str::<TrustLevel>(valid).is_ok());
        }
        for invalid in [
            serde_json::json!(-1),
            serde_json::json!(4),
            serde_json::json!(1.5),
            serde_json::json!("1"),
            serde_json::Value::Null,
        ] {
            assert!(serde_json::from_value::<TrustLevel>(invalid).is_err());
        }
    }
}
