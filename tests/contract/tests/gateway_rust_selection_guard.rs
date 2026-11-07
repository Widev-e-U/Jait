//! A loop must never choose a provider or model for the user.
//!
//! These are Rust-only assertions (no TypeScript reference process): they pin
//! the rule `packages/gateway/src` enforces today so the native port cannot
//! quietly reintroduce "helpful" defaulting when an autonomous turn wakes up
//! without a picker in front of it — no account default provider, no model
//! remembered for a different provider, no caller runtime selection.
//!
//! The only two legal ways for a continuation turn to run are:
//! 1. the session/thread recorded an explicit provider+model pair
//!    (`chat.provider` plus `chat.cliModels[provider]`), written only by the UI
//!    on an explicit user choice; or
//! 2. the caller names a pair (a persona's saved selection, or the recorded
//!    turn being resumed), which is again an explicit user choice.
//! Anything else stops and asks.

use jait_gateway::{
    db,
    services::{
        background_command_continuation::{
            BUILTIN_HTTP_PROVIDER, ContinuationError, ContinuationOptions, RequestedSelection,
            build_background_command_continuation_payload,
        },
        json_state::SessionStateService,
        thread_defaults::{ThreadSelectionDefaults, resolve_thread_selection_defaults},
        users::UserService,
    },
};
use serde_json::{Map, Value, json};
use std::path::Path;

const SESSION: &str = "loop-session";

fn database() -> rusqlite::Connection {
    let connection = db::open_database(Path::new(":memory:")).expect("open database");
    db::migrate_database(&connection).expect("migrate database");
    connection
}

/// The account-level settings that produced the original leak: the account was
/// configured for `jait` + `deepseek-v4.1-flash:cloud`, and a loop that started
/// on `codex` resumed its workers on that pair. Reading these is the bug.
fn seed_account_defaults(connection: &rusqlite::Connection) {
    connection
        .execute(
            "INSERT INTO user_settings (user_id, chat_provider, selected_model, updated_at)
             VALUES ('u', 'jait', 'deepseek-v4.1-flash:cloud', '2024-01-01T00:00:00Z')",
            [],
        )
        .expect("seed account defaults");
}

/// Record session state exactly as the UI does on an explicit user choice.
fn record<'a>(
    connection: &'a rusqlite::Connection,
    entries: &[(&str, Value)],
) -> SessionStateService<'a> {
    let state = SessionStateService::new(connection);
    let mut map = Map::new();
    for (key, value) in entries {
        map.insert((*key).to_string(), value.clone());
    }
    state.set(SESSION, &map).expect("record session state");
    state
}

fn defaults(
    connection: &rusqlite::Connection,
    state: Option<&SessionStateService<'_>>,
) -> ThreadSelectionDefaults {
    let users = UserService::new(connection);
    resolve_thread_selection_defaults(Some("u"), Some(SESSION), Some(&users), state)
        .expect("resolve defaults")
}

fn payload<'a>(
    state: Option<&'a SessionStateService<'a>>,
    metadata: &'a Value,
    selection: Option<RequestedSelection<'a>>,
    allow_provider_resolved_model: bool,
) -> Result<Value, ContinuationError> {
    build_background_command_continuation_payload(ContinuationOptions {
        session_id: SESSION,
        notification: "Command completed",
        notice: None,
        session_state: state,
        session_metadata: metadata,
        selection,
        allow_provider_resolved_model,
    })
}

fn selection_required(result: Result<Value, ContinuationError>) -> String {
    match result {
        Err(ContinuationError::SelectionRequired(message)) => message,
        Err(ContinuationError::Storage(error)) => {
            panic!("expected a selection error, got a storage error: {error}")
        }
        Ok(payload) => panic!("expected a selection error, got a dispatched payload: {payload}"),
    }
}

#[test]
fn account_defaults_never_become_a_selection() {
    let connection = database();
    seed_account_defaults(&connection);
    let state = record(&connection, &[("chat.reasoningEffort", json!("low"))]);

    let resolved = defaults(&connection, Some(&state));
    assert_eq!(
        resolved.provider_id, None,
        "the account default provider must not be inherited by a loop"
    );
    assert_eq!(
        resolved.model, None,
        "the account's remembered model must not be inherited by a loop"
    );
    // Other recorded state is still reported; it just never implies a selection.
    assert_eq!(resolved.reasoning_effort.as_deref(), Some("low"));
}

#[test]
fn recorded_user_choice_is_used_verbatim() {
    let connection = database();
    let state = record(
        &connection,
        &[
            ("chat.provider", json!("codex")),
            ("chat.cliModels", json!({ "codex": "gpt-5" })),
            ("chat.reasoningEffort", json!("high")),
            ("chat.providerRuntimeMode", json!("supervised")),
        ],
    );

    let resolved = defaults(&connection, Some(&state));
    assert_eq!(resolved.provider_id.as_deref(), Some("codex"));
    assert_eq!(resolved.model.as_deref(), Some("gpt-5"));
    assert_eq!(resolved.reasoning_effort.as_deref(), Some("high"));
    assert_eq!(resolved.runtime_mode.as_deref(), Some("supervised"));
}

#[test]
fn a_recorded_provider_never_borrows_another_providers_model() {
    let connection = database();
    let state = record(
        &connection,
        &[
            ("chat.provider", json!("claude-code")),
            ("chat.cliModels", json!({ "codex": "gpt-5" })),
        ],
    );

    let resolved = defaults(&connection, Some(&state));
    assert_eq!(resolved.provider_id.as_deref(), Some("claude-code"));
    assert_eq!(
        resolved.model, None,
        "a model remembered for codex is not a model choice for claude-code"
    );
}

#[test]
fn account_selected_model_does_not_fill_in_for_a_recorded_provider() {
    let connection = database();
    seed_account_defaults(&connection);
    let state = record(&connection, &[("chat.provider", json!("codex"))]);

    let resolved = defaults(&connection, Some(&state));
    assert_eq!(resolved.provider_id.as_deref(), Some("codex"));
    assert_eq!(resolved.model, None);
}

#[test]
fn continuation_stops_and_asks_when_no_provider_was_recorded() {
    let connection = database();
    seed_account_defaults(&connection);
    let state = record(&connection, &[("chat.reasoningEffort", json!("low"))]);
    let metadata = json!({});

    let message = selection_required(payload(Some(&state), &metadata, None, false));
    assert!(
        message.contains("no provider selected"),
        "unexpected message: {message}"
    );
}

#[test]
fn continuation_stops_and_asks_when_the_recorded_provider_has_no_model() {
    let connection = database();
    seed_account_defaults(&connection);
    let state = record(&connection, &[("chat.provider", json!("codex"))]);
    let metadata = json!({});

    let message = selection_required(payload(Some(&state), &metadata, None, false));
    assert!(
        message.contains("provider 'codex'"),
        "unexpected message: {message}"
    );
}

#[test]
fn an_explicit_selection_wins_over_recorded_state() {
    let connection = database();
    let state = record(
        &connection,
        &[
            ("chat.provider", json!("codex")),
            ("chat.cliModels", json!({ "codex": "gpt-5" })),
        ],
    );
    let metadata = json!({});
    let selection = RequestedSelection {
        provider_id: Some("claude-code"),
        model: Some("opus"),
    };

    let dispatched = payload(Some(&state), &metadata, Some(selection), false).expect("dispatch");
    assert_eq!(dispatched["provider"], json!("claude-code"));
    assert_eq!(dispatched["model"], json!("opus"));
    assert_eq!(dispatched["sessionId"], json!(SESSION));
    assert_eq!(
        dispatched["_systemNotification"],
        json!("Command completed")
    );
}

#[test]
fn an_external_provider_without_a_gateway_model_is_a_complete_choice() {
    let connection = database();
    let state = record(&connection, &[("chat.provider", json!("codex"))]);
    let metadata = json!({});

    // The user picked the model inside the Codex adapter; repeating that choice
    // on the same provider is not a new decision.
    let dispatched = payload(Some(&state), &metadata, None, true).expect("dispatch");
    assert_eq!(dispatched["provider"], json!("codex"));
    assert!(
        dispatched.get("model").is_none(),
        "no gateway model may be invented: {dispatched}"
    );
}

#[test]
fn the_builtin_backend_never_gets_a_provider_resolved_model() {
    let connection = database();
    // For the in-process backend an absent model means "use the backend
    // default", which is precisely the silent substitution being removed, so
    // the flag must not open that door even if a caller sets it.
    let state = record(
        &connection,
        &[("chat.provider", json!(BUILTIN_HTTP_PROVIDER))],
    );
    let metadata = json!({});

    let message = selection_required(payload(Some(&state), &metadata, None, true));
    assert!(
        message.contains("no model selected"),
        "unexpected message: {message}"
    );
}

#[test]
fn continuation_requires_a_selection_even_without_any_session_state() {
    let connection = database();
    seed_account_defaults(&connection);
    let metadata = json!({});

    let message = selection_required(payload(None, &metadata, None, false));
    assert!(
        message.contains("no provider selected"),
        "unexpected message: {message}"
    );
}
