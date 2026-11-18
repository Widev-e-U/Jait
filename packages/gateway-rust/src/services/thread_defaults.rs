//! Inherited thread selections. Callers must authorize user and session identifiers.
use super::{json_state::SessionStateService, users::UserService};
use serde::Serialize;
use serde_json::Value;
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSelectionDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_mode: Option<String>,
}
pub fn normalize_reasoning_effort(value: &Value) -> Option<String> {
    let text = crate::text::js_trim(value.as_str()?);
    let bytes = text.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 64
        || !bytes[0].is_ascii_alphanumeric()
        || !bytes
            .iter()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(c))
    {
        return None;
    }
    Some(text.into())
}
/// Resolve the provider/model a chat-spawned thread must run on.
///
/// Only the selection the user recorded on the *origin chat* is ever returned
/// (`chat.provider` + `chat.cliModels[provider]`). The account-level default
/// provider and any model remembered for another provider are deliberately not
/// consulted: substituting them is exactly how a chat running on one provider
/// silently handed its spawned threads to a different provider and model.
///
/// A missing value is reported as missing. Callers must stop and let the user
/// choose; they must never guess.
///
/// `_user_id` / `_users` are unused for selection; they are kept so callers can
/// pass their existing context (same shape as the TS reference).
pub fn resolve_thread_selection_defaults(
    _user_id: Option<&str>,
    session_id: Option<&str>,
    _users: Option<&UserService<'_>>,
    state: Option<&SessionStateService<'_>>,
) -> rusqlite::Result<ThreadSelectionDefaults> {
    let mut result = ThreadSelectionDefaults::default();
    let session_id = session_id
        .map(crate::text::js_trim)
        .filter(|v| !v.is_empty());
    let (Some(session_id), Some(state)) = (session_id, state) else {
        return Ok(result);
    };
    let keys = [
        "chat.provider",
        "chat.providerRuntimeMode",
        "chat.cliModels",
        "chat.reasoningEffort",
    ]
    .map(String::from);
    let values = state.get(session_id, Some(&keys))?;
    result.provider_id = values
        .get("chat.provider")
        .and_then(Value::as_str)
        .map(crate::text::js_trim)
        .filter(|v| !v.is_empty())
        .map(String::from);
    result.runtime_mode = values
        .get("chat.providerRuntimeMode")
        .and_then(Value::as_str)
        .filter(|v| ["full-access", "supervised"].contains(v))
        .map(String::from);
    if let Some(provider) = result.provider_id.as_ref().filter(|v| !v.is_empty()) {
        result.model = values
            .get("chat.cliModels")
            .and_then(Value::as_object)
            .and_then(|v| v.get(provider))
            .and_then(Value::as_str)
            .map(crate::text::js_trim)
            .filter(|v| !v.is_empty())
            .map(String::from);
    }
    result.reasoning_effort = values
        .get("chat.reasoningEffort")
        .and_then(normalize_reasoning_effort);
    Ok(result)
}
