//! W1 consumer-level verification: `services/jait-llm.ts` + `services/project-watcher.ts`.
//!
//! PROVENANCE OF EXPECTATIONS
//! * jait-llm: every literal below was produced by executing the REAL TypeScript module, not by
//!   copying a fixture:
//!       cd /home/jakob/jait && bun .jait/artifacts/gateway-rust/verify-w1/ts/ref-llm.ts
//!       cd /home/jakob/jait && bun .jait/artifacts/gateway-rust/verify-w1/ts/ref-llm-completion.ts
//!   `ref-llm.ts` imports `normalizeOpenRouterModelId` from `packages/gateway/src/services/jait-llm.ts`
//!   and `inferContextWindow` from `packages/gateway/src/config.ts`. `ref-llm-completion.ts` imports the
//!   real exported `callJaitLlmCompletion` and stubs `fetch` to drive the response-parsing path that
//!   `completion_text` implements.
//! * project-watcher: coalescing/reference behaviour was observed from the REAL `ProjectWatcher`
//!   (`packages/gateway/src/services/project-watcher.ts`) via a live inotify run:
//!       cd /home/jakob/jait && bun .jait/artifacts/gateway-rust/verify-w1/ts/ref-watcher.ts
//!   Observed there: create→delete inside one window disappears, create→update stays `created`,
//!   `node_modules` writes never surface, distinct casing stays distinct, and emitted batches are
//!   plain change arrays with no `rescanRequired` key.
use jait_gateway::services::jait_llm::{
    completion_text, infer_context_window, normalize_openrouter_model_id,
};
use jait_gateway::services::project_search::{Cancellation, ProjectRoot};
use jait_gateway::services::project_watcher::{
    FileChangeEvent, FileChangeType, ProjectWatcherOptions, WatchState, WatcherSupervisor,
    coalesce_events,
};
use serde_json::json;
use std::time::{Duration, Instant};

fn ev(path: &str, kind: FileChangeType) -> FileChangeEvent {
    FileChangeEvent {
        path: path.to_string(),
        kind,
    }
}

// ---------------------------------------------------------------- jait-llm ----

#[test]
fn llm_normalize_openrouter_model_id_matches_ts() {
    // Verbatim pairs from `bun ref-llm.ts` ("normalize").
    let cases = [
        ("  OpenAI/GPT-4o  ", "OpenAI/GPT-4o"),
        ("anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4"),
        ("openrouter/auto", "openrouter/auto"),
        ("AUTO", "AUTO"),
        ("", ""),
        ("  meta-llama/llama-3.1-70b  ", "meta-llama/llama-3.1-70b"),
    ];
    for (input, expected) in cases {
        assert_eq!(
            normalize_openrouter_model_id(input),
            expected,
            "normalizeOpenRouterModelId({input:?}) diverges from TS reference"
        );
    }
}

#[test]
fn llm_infer_context_window_matches_ts() {
    // Verbatim pairs from `bun ref-llm.ts` ("context").
    let cases: [(&str, u64); 9] = [
        ("auto", 128_000),
        ("auto/best", 128_000),
        ("gpt-5-mini", 400_000),
        ("gpt-4o", 128_000),
        ("gpt-4.1", 128_000),
        ("gpt-4-turbo", 128_000),
        ("claude-sonnet-4", 100_000),
        ("ollama/llama3", 8_192),
        ("unknown-model-x", 128_000),
    ];
    for (model, expected) in cases {
        assert_eq!(
            infer_context_window(model) as u64,
            expected,
            "inferContextWindow({model:?}) diverges from TS reference"
        );
    }
}

#[test]
fn llm_completion_text_matches_ts_response_parsing() {
    // Case 1: string content is trimmed.
    let data = json!({"choices": [{"message": {"content": "  hello world  "}}]});
    assert_eq!(completion_text(&data, "ref-model").unwrap(), "hello world");

    // Case 2: content parts are concatenated, non-text parts skipped.
    let data = json!({"choices": [{"message": {"content": [
        {"type": "text", "text": "a"},
        {"type": "image"},
        {"type": "text", "text": "b"}
    ]}}]});
    assert_eq!(completion_text(&data, "ref-model").unwrap(), "ab");

    // Case 3: reasoning-only answer that burned the budget -> TS raises this exact message.
    let data = json!({"choices": [{"finish_reason": "length", "message": {"content": "", "reasoning_content": "thinking..."}}]});
    assert_eq!(
        completion_text(&data, "ref-model").unwrap_err(),
        "LLM spent its whole token budget reasoning and returned no answer (finish_reason=length, model: ref-model) — increase max_tokens"
    );

    // Case 4: nothing at all -> TS raises this exact message.
    let data = json!({"choices": [{"finish_reason": "stop", "message": {"content": ""}}]});
    assert_eq!(
        completion_text(&data, "ref-model").unwrap_err(),
        "LLM returned no content (finish_reason: stop, model: ref-model)"
    );
}

// ------------------------------------------------------- project-watcher ----

#[test]
fn watcher_coalesce_matches_reference_semantics() {
    // create+delete inside one window annuls (TS ref-watcher: d.txt produced no event).
    let out = coalesce_events(vec![
        ev("d.txt", FileChangeType::Created),
        ev("d.txt", FileChangeType::Deleted),
    ]);
    assert!(out.is_empty(), "create->delete must annul, got {out:?}");

    // create+update stays `created` (TS ref-watcher: e.txt emitted once as created).
    let out = coalesce_events(vec![
        ev("e.txt", FileChangeType::Created),
        ev("e.txt", FileChangeType::Updated),
    ]);
    assert_eq!(out, vec![ev("e.txt", FileChangeType::Created)]);

    // delete+create promotes to updated.
    let out = coalesce_events(vec![
        ev("f.txt", FileChangeType::Deleted),
        ev("f.txt", FileChangeType::Created),
    ]);
    assert_eq!(out, vec![ev("f.txt", FileChangeType::Updated)]);

    // first-seen order and case sensitivity are preserved (TS ref-watcher: Case.txt + case.txt
    // both surfaced, in creation order).
    let out = coalesce_events(vec![
        ev("Case.txt", FileChangeType::Created),
        ev("zzz.txt", FileChangeType::Created),
        ev("case.txt", FileChangeType::Created),
    ]);
    assert_eq!(
        out,
        vec![
            ev("Case.txt", FileChangeType::Created),
            ev("zzz.txt", FileChangeType::Created),
            ev("case.txt", FileChangeType::Created),
        ]
    );
}

#[test]
fn watcher_supervisor_capacity_is_bounded() {
    assert!(WatcherSupervisor::new(0).is_err());
    assert!(WatcherSupervisor::new(33).is_err());
    assert!(WatcherSupervisor::new(1).is_ok());
    assert!(WatcherSupervisor::new(32).is_ok());
}

#[test]
fn watcher_rejects_invalid_bounds_and_generated_root() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/verify-w1/fixtures")
        .join(format!("jait-w1-bounds-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let root = ProjectRoot::open(&std::fs::canonicalize(&dir).unwrap()).expect("project root");

    // Coalesce window of zero is rejected before any thread is created.
    let mut options = ProjectWatcherOptions::default();
    options.coalesce = Duration::ZERO;
    assert!(
        WatcherSupervisor::new(1)
            .unwrap()
            .watch(root.clone(), options, Cancellation::default())
            .is_err()
    );

    // Default options must be accepted (mirrors TS constructor defaults: 150ms coalescing).
    assert_eq!(
        ProjectWatcherOptions::default().coalesce,
        Duration::from_millis(150)
    );
    assert!(
        ProjectWatcherOptions::default()
            .ignore
            .iter()
            .any(|p| p.contains("node_modules"))
    );

    // A generated (`.jait`) root is skipped without a watcher.
    let generated = dir.join(".jait");
    std::fs::create_dir_all(&generated).expect("generated dir");
    let generated_root =
        ProjectRoot::open(&std::fs::canonicalize(&generated).unwrap()).expect("generated root");
    let outcome = WatcherSupervisor::new(1)
        .unwrap()
        .watch(
            generated_root,
            ProjectWatcherOptions::default(),
            Cancellation::default(),
        )
        .expect("generated root is not an error");
    assert!(
        outcome.is_none(),
        "root containing .jait must not be watched"
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn watcher_emits_created_events_and_skips_ignored_dirs() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/verify-w1/fixtures")
        .join(format!("jait-w1-live-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    let root = ProjectRoot::open(&std::fs::canonicalize(&dir).unwrap()).expect("project root");
    let supervisor = WatcherSupervisor::new(1).expect("supervisor");
    let mut options = ProjectWatcherOptions::default();
    // Generated fixtures stay inside project artifacts; production defaults remain unchanged.
    options.allow_generated_root = true;
    let mut watcher = supervisor
        .watch(root, options, Cancellation::default())
        .expect("watch ok")
        .expect("watcher started");

    // Give the watcher a moment to attach, then perform the same sequence the TS reference run did.
    let deadline = Instant::now() + Duration::from_secs(5);
    while watcher.state() != WatchState::Watching && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    std::thread::sleep(Duration::from_millis(200));
    std::fs::create_dir_all(dir.join("node_modules")).unwrap();
    std::fs::write(dir.join("node_modules").join("ignored.js"), "x").unwrap();
    std::fs::write(dir.join("c.txt"), "c").unwrap();

    let mut seen: Vec<FileChangeEvent> = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        match watcher.try_recv() {
            Ok(batch) => {
                // TS emits a bare array; the native batch always carries rescanRequired=false
                // for ordinary writes.
                assert!(
                    !batch.rescan_required,
                    "unexpected rescanRequired on plain write"
                );
                seen.extend(batch.changes);
                if seen.iter().any(|c| c.path.ends_with("c.txt")) {
                    break;
                }
            }
            Err(_) => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    watcher.stop();
    assert_eq!(watcher.state(), WatchState::Stopped);

    let c = seen
        .iter()
        .find(|c| c.path.ends_with("c.txt"))
        .unwrap_or_else(|| panic!("never observed c.txt, saw {seen:?}"));
    assert_eq!(c.kind, FileChangeType::Created);
    assert!(
        !seen.iter().any(|c| c.path.contains("node_modules")),
        "node_modules writes must be ignored, saw {seen:?}"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
