//! Architectural guard for the TS -> Rust migration.
//!
//! Invariant: a loop, thread, worker or autonomous turn must **never** select a
//! provider or model by default. It runs only on the selection the user
//! explicitly recorded on the session/thread (`chat.provider`,
//! `chat.cliModels[provider]`, `thread.provider_id`, `thread.model`) or on an
//! explicit selection passed by the caller. If neither exists the turn must stop
//! and ask the user.
//!
//! Account-level settings (`user_settings.chat_provider`,
//! `user_settings.selected_model`) are a persisted *UI convenience*, never an
//! authorization to dispatch. The TypeScript gateway enforces this in
//! `packages/gateway/src/services/thread-defaults.ts`,
//! `.../background-command-continuation.ts`, `.../chat-loops.ts`,
//! `.../tools/thread-tools.ts`, `.../tools/loop-tools.ts`, `.../routes/chat.ts`
//! and `.../routes/threads.ts`.
//!
//! Rust has not ported every one of those sites yet (`POST /api/threads` is
//! still deferred in `src/routes/threads.rs`). The behavioural unit tests in
//! `tests/contract/tests/gateway_rust_selection_guard.rs` can only pin the
//! sites that already exist, so this source-level guard covers the rest: the
//! moment a ported loop/thread/autonomous module reaches for an account
//! default, the modules below stop being free of these identifiers and this
//! test fails.

use std::fs;
use std::path::{Path, PathBuf};

/// Account-level provider/model settings. Reading either one on a dispatch path
/// means "invent a selection the user never made".
const FORBIDDEN_ACCOUNT_DEFAULTS: &[&str] = &[
    "chat_provider",
    "chatProvider",
    "selected_model",
    "selectedModel",
];

/// SQL forms that actually reach the account settings table.
///
/// A bare `user_settings` token is deliberately *not* banned. The gateway also
/// has an unrelated feature-flag field named `user_settings`
/// (`routes/sessions.rs`: `pub user_settings: bool`), so banning the identifier
/// on its own fails on a boolean and would push people to delete the guard.
/// Any real read of the account settings needs the table name in a statement,
/// so these forms cover the leak without the false positive. Reading
/// `chat_provider` / `selected_model` out of it is still caught by
/// `FORBIDDEN_ACCOUNT_DEFAULTS` above.
const SETTINGS_TABLE_STATEMENTS: &[&str] = &[
    "from user_settings",
    "into user_settings",
    "update user_settings",
    "join user_settings",
    "user_settings set",
    "user_settings where",
];

/// Modules that decide which provider/model a turn, thread or worker runs on.
/// They must resolve the selection from the session/thread record or an
/// explicit caller argument only.
const SELECTION_MODULES: &[&str] = &[
    "services/thread_defaults.rs",
    "services/background_command_continuation.rs",
    "services/chat_loops.rs",
    "tools/loop_tools.rs",
    "tools/thread_tools.rs",
    "routes/threads.rs",
    "routes/sessions.rs",
];

/// Control file: if the scanner silently stopped finding files, the positive
/// assertion below fails instead of the guard passing vacuously.
const CONTROL_FILE_WITH_ACCOUNT_DEFAULTS: &str = "services/users.rs";

fn crate_src() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn read_module(relative: &str) -> String {
    let path = crate_src().join(relative);
    fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "selection guard could not read {} ({error}); if the module was renamed, update \
             SELECTION_MODULES so the no-account-default invariant stays enforced",
            path.display()
        )
    })
}

/// Report the offending `line N: <text>` entries for any needle.
fn offenders(source: &str, needles: &[&str]) -> Vec<String> {
    let mut found = Vec::new();
    for (index, line) in source.lines().enumerate() {
        if needles.iter().any(|needle| line.contains(needle)) {
            found.push(format!("line {}: {}", index + 1, line.trim()));
        }
    }
    found
}

/// Report `line N: <text>` for lines that reach the account settings table
/// inside a SQL statement. Matching is case-insensitive because the crate
/// writes SQL keywords in both cases.
fn settings_table_offenders(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for (index, line) in source.lines().enumerate() {
        let lowered = line.to_ascii_lowercase();
        if SETTINGS_TABLE_STATEMENTS
            .iter()
            .any(|statement| lowered.contains(statement))
        {
            found.push(format!("line {}: {}", index + 1, line.trim()));
        }
    }
    found
}

#[test]
fn selection_modules_never_read_account_provider_or_model_defaults() {
    for module in SELECTION_MODULES {
        let source = read_module(module);

        let account = offenders(&source, FORBIDDEN_ACCOUNT_DEFAULTS);
        assert!(
            account.is_empty(),
            "{module} must not resolve a provider/model from account settings \
             (user_settings.chat_provider / user_settings.selected_model). A loop, thread or \
             autonomous turn only runs on the pair the user explicitly recorded on the \
             session/thread, or on an explicit caller selection; otherwise it must stop and ask. \
             Offending lines:\n{}",
            account.join("\n")
        );

        let settings_table = settings_table_offenders(&source);
        assert!(
            settings_table.is_empty(),
            "{module} must not read the account settings table to choose a provider/model for a \
             turn; the selection comes from the session/thread record or the caller. Offending \
             lines:\n{}",
            settings_table.join("\n")
        );
    }
}

#[test]
fn selection_module_list_still_matches_the_gateway_layout() {
    // Guards against a vacuous pass: every listed module must exist and be
    // non-trivial, and the scanner must still detect the identifiers it bans.
    for module in SELECTION_MODULES {
        let source = read_module(module);
        assert!(
            source.lines().count() > 20,
            "{module} is suspiciously small ({} lines); the selection guard would be vacuous",
            source.lines().count()
        );
    }

    let control = read_module(CONTROL_FILE_WITH_ACCOUNT_DEFAULTS);
    assert!(
        !offenders(&control, FORBIDDEN_ACCOUNT_DEFAULTS).is_empty(),
        "control file {CONTROL_FILE_WITH_ACCOUNT_DEFAULTS} is expected to mention account \
         provider/model settings; the scanner is broken, so the selection guard proves nothing"
    );
    assert!(
        !settings_table_offenders(&control).is_empty(),
        "control file {CONTROL_FILE_WITH_ACCOUNT_DEFAULTS} is expected to query the account \
         settings table; the scanner is broken, so the selection guard proves nothing"
    );
}

#[test]
fn autonomous_dispatch_has_a_single_guarded_payload_builder() {
    // Every autonomous dispatch (loop continuation, background command result,
    // answered-question resume) must build its payload through the one function
    // that raises SelectionRequired instead of falling back to a provider.
    let payload = read_module("services/background_command_continuation.rs");
    assert!(
        payload.contains("build_background_command_continuation_payload"),
        "the guarded continuation payload builder is missing; autonomous dispatch would need a \
         new (unguarded) selection path"
    );
    assert!(
        payload.contains("SelectionRequired"),
        "the continuation payload builder must still fail with SelectionRequired when no explicit \
         or recorded provider+model exists"
    );
    assert!(
        !payload.contains("unwrap_or(\"jait\")") && !payload.contains("unwrap_or_else(|| \"jait\""),
        "the continuation payload builder must never default the provider to the builtin HTTP \
         backend; an absent provider means the loop stops and asks"
    );
}

#[test]
fn thread_defaults_reads_the_chat_record_not_the_account() {
    let defaults = read_module("services/thread_defaults.rs");
    assert!(
        defaults.contains("chat.provider"),
        "thread defaults must resolve the provider from the chat's own recorded `chat.provider`"
    );
    assert!(
        defaults.contains("chat.cliModels"),
        "thread defaults must resolve the model from the chat's own `chat.cliModels[provider]`, \
         never from another provider's entry"
    );
}
