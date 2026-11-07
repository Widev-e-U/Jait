//! Focused contract for the native project-search service.
//!
//! The gateway HTTP route (`routes::project`) constructs `SearchOptions` from the
//! request body, opens the authorized root with `ProjectRoot::open`, and calls
//! `search_project_auto`. These tests pin that surface: option validation and
//! clamping, the camelCase wire shape returned to the TypeScript client, the
//! parity of the native and auto (ripgrep-optional) backends, cancellation, and
//! the deliberate fallback refusal of regular expressions.

use jait_gateway::services::project_search::{
    Budgets, Cancellation, Error, PROJECT_SEARCH_DEFAULT_RESULTS, PROJECT_SEARCH_MAX_RESULTS,
    ProjectRoot, SearchMode, SearchOptions, SearchResult, candidate_limit, normalize_limit,
    search_project, search_project_auto, search_project_fallback,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(".jait/artifacts/gateway-rust/contract-fixtures/project-search")
            .join(format!(
                "{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
        fs::create_dir_all(&path).unwrap();
        // Only the trusted fixture root is canonicalized.
        Self(fs::canonicalize(path).unwrap())
    }

    fn put(&self, path: &str, content: &str) {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn root(&self) -> ProjectRoot {
        ProjectRoot::open(&self.0).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn options(query: &str, mode: SearchMode) -> SearchOptions {
    SearchOptions {
        query: query.into(),
        mode,
        ..Default::default()
    }
}

fn files_of(result: &SearchResult) -> (Vec<String>, bool) {
    match result {
        SearchResult::Files { files, limited, .. } => (
            files.iter().map(|f| f.relative_path.clone()).collect(),
            *limited,
        ),
        other => panic!("expected files result, got {other:?}"),
    }
}

#[test]
fn limit_normalization_matches_route_contract() {
    assert_eq!(
        normalize_limit(None).unwrap(),
        PROJECT_SEARCH_DEFAULT_RESULTS
    );
    assert_eq!(normalize_limit(Some(5)).unwrap(), 5);
    assert_eq!(
        normalize_limit(Some(usize::MAX)).unwrap(),
        PROJECT_SEARCH_MAX_RESULTS
    );
    assert!(matches!(normalize_limit(Some(0)), Err(Error::Input(_))));
    // The candidate window is always wider than the requested limit and bounded.
    for limit in [1, 20, 200] {
        let window = candidate_limit(limit);
        assert!(window >= 500 && window <= 2000, "window {window}");
        assert!(window >= limit);
    }
    assert_eq!(candidate_limit(usize::MAX), 2000);
}

#[test]
fn options_accept_the_documented_camel_case_body_and_reject_unknown_fields() {
    let parsed: SearchOptions = serde_json::from_value(json!({
        "query": "widget",
        "mode": "files",
        "limit": 3,
        "include": "src/**",
        "isRegexp": false,
        "includeIgnoredFiles": true,
    }))
    .unwrap();
    assert_eq!(parsed.mode, SearchMode::Files);
    assert_eq!(parsed.limit, Some(3));
    assert!(parsed.include_ignored_files);
    let defaults: SearchOptions = serde_json::from_value(json!({ "query": "x" })).unwrap();
    assert_eq!(defaults.mode, SearchMode::Content);
    assert!(!defaults.is_regexp);
    assert!(
        serde_json::from_value::<SearchOptions>(json!({
            "query": "x",
            "unexpected": 1,
        }))
        .is_err()
    );
}

#[test]
fn files_mode_uses_the_camel_case_wire_shape() {
    let fixture = Fixture::new();
    fixture.put("src/widget.ts", "export function widget() {}\n");
    fixture.put("docs/readme.md", "widget notes\n");
    let root = fixture.root();
    let result = search_project(
        &root,
        &options("widget", SearchMode::Files),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let value = serde_json::to_value(&result).unwrap();
    assert_eq!(value["mode"], "files");
    assert_eq!(value["query"], "widget");
    assert!(value["limited"].is_boolean());
    let files = value["files"].as_array().unwrap();
    assert!(!files.is_empty());
    for file in files {
        assert!(file["path"].is_string());
        let relative = file["relativePath"].as_str().unwrap();
        assert!(!relative.starts_with('/'), "paths are root-relative");
        assert!(relative.ends_with(".ts") || relative.ends_with(".md"));
        assert_eq!(
            file["name"].as_str().unwrap(),
            relative.rsplit('/').next().unwrap()
        );
        assert!(file["score"].is_i64());
    }
    let (paths, _) = files_of(&result);
    assert_eq!(paths.len(), files.len());
}

#[test]
fn content_mode_reports_line_numbers_and_relative_paths() {
    let fixture = Fixture::new();
    fixture.put("src/app.ts", "const a = 1;\nconst needle = 2;\n");
    let root = fixture.root();
    let result = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let value = serde_json::to_value(&result).unwrap();
    assert_eq!(value["mode"], "content");
    let hits = value["matches"].as_array().unwrap();
    assert_eq!(hits.len(), 1, "one literal match expected: {hits:?}");
    assert_eq!(hits[0]["relativePath"], "src/app.ts");
    assert_eq!(hits[0]["line"], 2);
    assert!(hits[0]["content"].as_str().unwrap().contains("needle"));
    assert!(hits[0]["file"].is_string());
}

#[test]
fn limit_caps_the_number_of_reported_matches() {
    let fixture = Fixture::new();
    for index in 0..6 {
        fixture.put(&format!("src/m{index}.ts"), "needle\n");
    }
    let root = fixture.root();
    let options = SearchOptions {
        limit: Some(2),
        ..options("needle", SearchMode::Content)
    };
    let result = search_project(
        &root,
        &options,
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = &result else {
        panic!("expected content result")
    };
    assert!(
        !matches.is_empty() && matches.len() <= 2,
        "{}",
        matches.len()
    );
}

#[test]
fn auto_backend_agrees_with_the_native_backend() {
    let fixture = Fixture::new();
    fixture.put("src/widget.ts", "widget();\n");
    fixture.put("src/other.ts", "export const other = 1;\n");
    let root = fixture.root();
    let options = options("widget", SearchMode::Content);
    let budgets = Budgets::default();
    let native = search_project(&root, &options, &budgets, &Cancellation::default()).unwrap();
    // `search_project_auto` selects ripgrep when it is installed and the native
    // backend otherwise; the observable result must not change.
    let auto = search_project_auto(&root, &options, &budgets, &Cancellation::default()).unwrap();
    assert_eq!(
        serde_json::to_value(&native).unwrap(),
        serde_json::to_value(&auto).unwrap()
    );
}

#[test]
fn fallback_backend_refuses_regular_expressions() {
    let fixture = Fixture::new();
    fixture.put("src/app.ts", "needle\n");
    let root = fixture.root();
    let regexp = SearchOptions {
        is_regexp: true,
        ..options("n.edle", SearchMode::Content)
    };
    let fallback = search_project_fallback(
        &root,
        &regexp,
        &Budgets::default(),
        &Cancellation::default(),
    );
    assert!(
        matches!(fallback, Err(Error::RegexpRequiresRipgrep)),
        "expected RegexpRequiresRipgrep, got {fallback:?}"
    );
    // The same pattern is a plain literal for the fallback backend.
    let literal = search_project_fallback(
        &root,
        &options("n.edle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = &literal else {
        panic!("expected content result")
    };
    assert!(matches.is_empty(), "dot must not act as a wildcard");
}

#[test]
fn cancelled_searches_report_cancellation_instead_of_results() {
    let fixture = Fixture::new();
    fixture.put("src/app.ts", "needle\n");
    let root = fixture.root();
    let cancel = Cancellation::default();
    cancel.cancel();
    let result = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &cancel,
    );
    assert!(matches!(result, Err(Error::Cancelled)), "got {result:?}");
}

#[test]
fn blank_and_oversized_queries_are_rejected() {
    let fixture = Fixture::new();
    fixture.put("src/app.ts", "needle\n");
    let root = fixture.root();
    let blank = search_project(
        &root,
        &options("   ", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    );
    assert!(matches!(blank, Err(Error::Input(_))), "got {blank:?}");
    let huge = search_project(
        &root,
        &options(&"a".repeat(4097), SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    );
    assert!(matches!(huge, Err(Error::Input(_))), "got {huge:?}");
}

#[test]
fn unauthorized_root_forms_are_refused() {
    for path in ["relative/dir", "/"] {
        let refused = ProjectRoot::open(std::path::Path::new(path));
        assert!(refused.is_err(), "{path} must not be an acceptable root");
    }
    if let Some(home) = std::env::var_os("HOME") {
        assert!(
            ProjectRoot::open(std::path::Path::new(&home)).is_err(),
            "home directory must not be an acceptable root"
        );
    }
}

#[test]
fn ignored_files_stay_visible_only_when_requested() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "ignored/\n");
    fixture.put("src/app.ts", "needle\n");
    fixture.put("ignored/hidden.ts", "needle\n");
    let root = fixture.root();
    let visible = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = &visible else {
        panic!("expected content result")
    };
    assert!(
        matches
            .iter()
            .all(|m| !m.relative_path.starts_with("ignored/"))
    );
    let everything = SearchOptions {
        include_ignored_files: true,
        ..options("needle", SearchMode::Content)
    };
    let all = search_project(
        &root,
        &everything,
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = &all else {
        panic!("expected content result")
    };
    assert!(
        matches
            .iter()
            .any(|m| m.relative_path == "ignored/hidden.ts"),
        "include_ignored_files must surface ignored matches: {matches:?}"
    );
}

#[test]
fn empty_file_query_short_circuits_without_touching_the_tree() {
    let fixture = Fixture::new();
    fixture.put("src/app.ts", "needle\n");
    let root = fixture.root();
    let result = search_project(
        &root,
        &options("...", SearchMode::Files),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let Value::Object(map) = serde_json::to_value(&result).unwrap() else {
        panic!("expected object")
    };
    assert_eq!(map["mode"], "files");
    assert!(map["files"].as_array().unwrap().is_empty());
    assert_eq!(map["limited"], false);
}
