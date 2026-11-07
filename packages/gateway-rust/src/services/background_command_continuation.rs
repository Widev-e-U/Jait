//! Continuation payload selection with persisted explicit-null effort precedence.
//!
//! A continuation turn (loop iteration, answered-question resume, background
//! command completion) has no model picker in front of it. It therefore must
//! name the provider and model the *user* chose, and nothing else: not the
//! account default provider, not the model last remembered for a different
//! provider, not the caller's own runtime selection. When the chat has not
//! recorded a pair, the loop stops and asks.
use super::{
    json_state::SessionStateService,
    thread_defaults::{normalize_reasoning_effort, resolve_thread_selection_defaults},
};
use serde_json::{Value, json};
use std::fmt;

/// The built-in in-process backend. For this provider an absent model means the
/// backend's own default (`OLLAMA_MODEL` / `OPENAI_MODEL`), which is *not* a
/// user choice, so it never counts as "the provider resolves its own model".
pub const BUILTIN_HTTP_PROVIDER: &str = "jait";

/// Provider + model the user configured for the work being resumed, when that
/// choice is not stored on the chat itself (a persona's saved selection, or an
/// explicit caller-named pair). Values are used verbatim; empty is treated as
/// absent.
#[derive(Debug, Default, Clone, Copy)]
pub struct RequestedSelection<'a> {
    pub provider_id: Option<&'a str>,
    pub model: Option<&'a str>,
}

pub struct ContinuationOptions<'a> {
    pub session_id: &'a str,
    pub notification: &'a str,
    pub notice: Option<&'a str>,
    pub session_state: Option<&'a SessionStateService<'a>>,
    pub session_metadata: &'a Value,
    /// Explicit selection for this turn, if the user made one.
    pub selection: Option<RequestedSelection<'a>>,
    /// True only when the recorded provider is a CLI/ACP adapter that resolves
    /// models itself, making "provider recorded, no gateway model" a complete
    /// user choice. Never true for [`BUILTIN_HTTP_PROVIDER`].
    pub allow_provider_resolved_model: bool,
}

/// The loop could not run because no provider/model pair was chosen.
#[derive(Debug)]
pub enum ContinuationError {
    SelectionRequired(String),
    Storage(rusqlite::Error),
}

impl From<rusqlite::Error> for ContinuationError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Storage(error)
    }
}

impl fmt::Display for ContinuationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SelectionRequired(message) => f.write_str(message),
            Self::Storage(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for ContinuationError {}

fn persisted_effort(value: &Value) -> Option<Option<String>> {
    let parsed;
    let metadata = if let Some(s) = value.as_str() {
        parsed = serde_json::from_str::<Value>(s).ok()?;
        &parsed
    } else {
        value
    };
    let effort = metadata
        .as_object()?
        .get("chat")?
        .as_object()?
        .get("reasoningEffort")?;
    if effort.is_null() {
        Some(None)
    } else {
        normalize_reasoning_effort(effort).map(Some)
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value.map(String::from).filter(|value| !value.is_empty())
}

pub fn build_background_command_continuation_payload(
    options: ContinuationOptions<'_>,
) -> Result<Value, ContinuationError> {
    // Only the chat's own recorded pair. The account default provider and any
    // model remembered for another provider are intentionally unreachable here.
    let recorded = resolve_thread_selection_defaults(
        None,
        Some(options.session_id),
        None,
        options.session_state,
    )?;
    let selection = options.selection.unwrap_or_default();
    let provider = non_empty(selection.provider_id).or_else(|| recorded.provider_id.clone());
    let model = non_empty(selection.model).or_else(|| recorded.model.clone());
    // A continuation turn must name its provider explicitly. Letting it fall
    // through to "whatever the account defaults to" is how a chat running on one
    // provider silently resumed on another.
    let Some(provider) = provider else {
        return Err(ContinuationError::SelectionRequired(
            "This chat has no provider selected. Choose a provider and model, then resume the loop."
                .to_string(),
        ));
    };
    // Leaving the model out is only acceptable when the provider resolves it
    // itself. For the built-in backend an absent model means "backend default",
    // which is exactly the silent substitution that must not happen — so the
    // flag is never honoured there, even if a caller wrongly sets it.
    let provider_resolves_model =
        options.allow_provider_resolved_model && provider != BUILTIN_HTTP_PROVIDER;
    if model.is_none() && !provider_resolves_model {
        return Err(ContinuationError::SelectionRequired(format!(
            "This chat has no model selected for provider '{provider}'. Choose a model, then resume the loop."
        )));
    }
    let effort = match persisted_effort(options.session_metadata) {
        Some(persisted) => persisted,
        None => recorded.reasoning_effort.clone(),
    };
    let mut result = json!({
        "sessionId": options.session_id,
        "_systemNotification": options.notification,
        "reasoningEffort": effort,
        "provider": provider,
    });
    if let Some(notice) = options.notice.filter(|s| !s.is_empty()) {
        result["_systemNotice"] = json!(notice);
    }
    if let Some(mode) = recorded.runtime_mode.clone() {
        result["runtimeMode"] = json!(mode);
    }
    if let Some(model) = model {
        result["model"] = json!(model);
    }
    Ok(result)
}
