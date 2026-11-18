//! Bounded, ordered ACP prompt settlement compatibility adapter.
//!
//! This is a pure per-turn adapter, not an owner, transport, approval handler, or
//! terminal monitor. The owner must serialize updates and the prompt response,
//! drain preceding notifications, and supply the deferred update failure and the
//! response failure computed by `read_acp_session_failure`. `HandoffTerminals`
//! is a barrier: perform the existing asynchronous handoff before continuing.
//! The limits below are explicit integration policy and require client/overload
//! compatibility review before this module is registered.

use crate::providers::{codex_event_mapper::ProviderEvent, usage::parse_acp_usage};
use serde_json::Value;

pub const MAX_SETTLEMENT_BYTES: usize = 1024 * 1024;
pub const MAX_ID_BYTES: usize = 1024;
pub const MAX_ERROR_BYTES: usize = 16 * 1024;

/// Ordered effects; the caller must execute each before moving to the next.
#[derive(Debug, PartialEq)]
pub enum SettlementEffect {
    Event(ProviderEvent),
    HandoffTerminals,
}

#[derive(Debug, PartialEq)]
pub enum SettlementError {
    InvalidIdentity,
    InputTooLarge,
    AlreadySettled,
}

/// One instance per turn. It retains no provider data or event queue.
pub struct AcpSettlement {
    session_id: String,
    settled: bool,
}

impl AcpSettlement {
    pub fn new(session_id: &str) -> Result<Self, SettlementError> {
        if session_id.is_empty() || session_id.len() > MAX_ID_BYTES {
            return Err(SettlementError::InvalidIdentity);
        }
        Ok(Self {
            session_id: session_id.to_owned(),
            settled: false,
        })
    }

    /// Adapt the settled prompt result. The usage ID must be unique per response,
    /// including auxiliary compaction responses. Failures are already classified
    /// by the existing ACP failure reader; no approval or security decision is made.
    /// A transport error is the catch path and takes precedence over response data.
    pub fn settle(
        &mut self,
        result: Result<&Value, &str>,
        usage_id: &str,
        update_failure: Option<&str>,
        response_failure: Option<&str>,
    ) -> Result<Vec<SettlementEffect>, SettlementError> {
        if self.settled {
            return Err(SettlementError::AlreadySettled);
        }
        if usage_id.is_empty() || usage_id.len() > MAX_ID_BYTES {
            return Err(SettlementError::InvalidIdentity);
        }
        if update_failure
            .into_iter()
            .chain(response_failure)
            .any(|s| s.len() > MAX_ERROR_BYTES)
            || result
                .as_ref()
                .err()
                .is_some_and(|s| s.len() > MAX_ERROR_BYTES)
        {
            return Err(SettlementError::InputTooLarge);
        }
        if let Ok(value) = &result {
            // Count without allocating another potentially large serialized copy.
            struct LimitWriter {
                remaining: usize,
            }
            impl std::io::Write for LimitWriter {
                fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                    if bytes.len() > self.remaining {
                        return Err(std::io::ErrorKind::WriteZero.into());
                    }
                    self.remaining -= bytes.len();
                    Ok(bytes.len())
                }
                fn flush(&mut self) -> std::io::Result<()> {
                    Ok(())
                }
            }
            if serde_json::to_writer(
                LimitWriter {
                    remaining: MAX_SETTLEMENT_BYTES,
                },
                value,
            )
            .is_err()
            {
                return Err(SettlementError::InputTooLarge);
            }
        }
        self.settled = true;
        let mut effects = Vec::with_capacity(3);
        let error_event = |error: &str| {
            SettlementEffect::Event(ProviderEvent::SessionError {
                session_id: self.session_id.clone(),
                error: error.to_owned(),
            })
        };
        let value = match result {
            Ok(value) => value,
            Err(error) => {
                effects.push(error_event(error));
                return Ok(effects);
            }
        };
        if let Some(usage) = value
            .get("usage")
            .and_then(|v| parse_acp_usage(v, usage_id))
        {
            effects.push(SettlementEffect::Event(ProviderEvent::Usage {
                session_id: self.session_id.clone(),
                usage,
            }));
        }
        if let Some(failure) = update_failure.or(response_failure) {
            effects.push(error_event(failure));
            return Ok(effects);
        }
        if value.get("stopReason").and_then(Value::as_str) == Some("cancelled") {
            effects.push(error_event("Turn cancelled"));
        }
        effects.push(SettlementEffect::HandoffTerminals);
        effects.push(SettlementEffect::Event(ProviderEvent::TurnCompleted {
            session_id: self.session_id.clone(),
        }));
        Ok(effects)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn usage_failure_and_cancellation_order() {
        let response = json!({"usage":{"inputTokens":3,"outputTokens":2},"stopReason":"cancelled"});
        let mut turn = AcpSettlement::new("s").unwrap();
        let effects = turn.settle(Ok(&response), "u", None, None).unwrap();
        assert!(
            matches!(&effects[..], [SettlementEffect::Event(ProviderEvent::Usage { .. }), SettlementEffect::Event(ProviderEvent::SessionError { error, .. }), SettlementEffect::HandoffTerminals, SettlementEffect::Event(ProviderEvent::TurnCompleted { .. })] if error == "Turn cancelled")
        );
        assert_eq!(
            turn.settle(Ok(&response), "u", None, None),
            Err(SettlementError::AlreadySettled)
        );
        let mut turn = AcpSettlement::new("s").unwrap();
        let effects = turn
            .settle(Ok(&response), "u", Some("update"), Some("response"))
            .unwrap();
        assert!(
            matches!(&effects[..], [SettlementEffect::Event(ProviderEvent::Usage { .. }), SettlementEffect::Event(ProviderEvent::SessionError { error, .. })] if error == "update")
        );
    }

    #[test]
    fn bounded_rejection_does_not_settle_and_transport_error_has_no_completion() {
        let mut turn = AcpSettlement::new("s").unwrap();
        let huge = json!({"x":"a".repeat(MAX_SETTLEMENT_BYTES)});
        assert_eq!(
            turn.settle(Ok(&huge), "u", None, None),
            Err(SettlementError::InputTooLarge)
        );
        let effects = turn.settle(Err("failed"), "u", None, None).unwrap();
        assert!(
            matches!(&effects[..], [SettlementEffect::Event(ProviderEvent::SessionError { error, .. })] if error == "failed")
        );
    }
}
