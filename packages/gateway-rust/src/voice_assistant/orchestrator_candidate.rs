//! Candidate connection admission for the realtime voice assistant.
//!
//! This is deliberately not registered in the module tree. A socket owner must
//! invoke it before connecting to the provider or constructing tool authority.
//! It does not authenticate a websocket upgrade by itself.
use std::{collections::BTreeMap, time::Duration};

use crate::voice::VoiceFuture;
use super::{config::{self, AuthorizedConnection, Identity, SessionConfig}, tools::ToolSchema};

const MAX_TOKEN_BYTES: usize = 16 * 1024;
const ADMISSION_TIMEOUT: Duration = Duration::from_secs(10);

/// All methods are connection-owned: dropping a pending future must cancel its
/// work, including any spawned children. No credential or transport error may be
/// logged or reflected to the client by an implementation of this interface.
pub trait AdmissionHost: Send + Sync {
    fn verify_token<'a>(&'a self, token: &'a str) -> VoiceFuture<'a, Option<Identity>>;
    /// The id comes only from the verified identity, never from a client event.
    fn user_keys<'a>(&'a self, user_id: &'a str) -> VoiceFuture<'a, BTreeMap<String, String>>;
}

/// Client-safe failure. The websocket owner sends an error event only when
/// `message` is present, then closes with the indicated code and reason. No
/// provider connection or tool execution may precede success.
#[derive(Debug, PartialEq, Eq)]
pub struct AdmissionFailure {
    pub code: u16,
    pub message: Option<&'static str>,
    pub close_reason: &'static str,
}

/// Resolve identity and trusted per-user settings in order, with a single deadline
/// for both operations. Provider URLs, credentials and session updates are built
/// only by the existing trusted configuration code. The caller must also cancel
/// this future when the client disconnects and own the returned secrets until the
/// session ends; this function never launches detached work.
pub async fn admit(
    host: &impl AdmissionHost,
    token: &str,
    config: &SessionConfig,
    tools: &[ToolSchema],
) -> Result<AuthorizedConnection, AdmissionFailure> {
    if token.len() > MAX_TOKEN_BYTES {
        return Err(unauthorized());
    }
    match tokio::time::timeout(ADMISSION_TIMEOUT, async {
        let identity = host.verify_token(token).await.map_err(|_| internal())?
            .ok_or_else(unauthorized)?;
        let keys = host.user_keys(&identity.id).await.map_err(|_| internal())?;
        config::authorize(Some(identity), keys, config, tools).map_err(|(code, message)| {
            AdmissionFailure {
                code,
                message: Some(message),
                close_reason: if code == 4002 { "Not configured" } else { "Unauthorized" },
            }
        })
    }).await {
        Ok(result) => result,
        Err(_) => Err(internal()),
    }
}

fn unauthorized() -> AdmissionFailure {
    AdmissionFailure { code: 4001, message: Some("Unauthorized"), close_reason: "Unauthorized" }
}

fn internal() -> AdmissionFailure {
    AdmissionFailure { code: 1011, message: None, close_reason: "Internal error" }
}
