use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

pub(super) struct Fixture(pub PathBuf);
impl Fixture {
    pub(super) fn new() -> Self {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        let path = PathBuf::from(
            option_env!("JAIT_PROJECT_SEARCH_REPO_ROOT")
                .unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/../..")),
        )
        .join(".jait/artifacts/gateway-rust/parallel-implementation/project-search-fixtures")
        .join(format!(
            "{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        // Canonicalize only the trusted fixture, never untrusted entry paths.
        Self(fs::canonicalize(path).unwrap())
    }
    pub(super) fn put(&self, path: &str, content: &str) {
        let path = self.0.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }
    pub(super) fn root(&self) -> ProjectRoot {
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

#[test]
fn ranked_native_files_and_content_reuse_index_without_directory_offset_loss() {
    let fixture = Fixture::new();
    fixture.put("src/widget.ts", "export function widget() {}\nwidget();\n");
    fixture.put("tests/widget.test.ts", "widget();\n");
    let root = fixture.root();
    for _ in 0..3 {
        let result = search_project(
            &root,
            &options("widget", SearchMode::Files),
            &Budgets::default(),
            &Cancellation::default(),
        )
        .unwrap();
        let SearchResult::Files { files, .. } = result else {
            panic!()
        };
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].relative_path, "src/widget.ts");
    }
    let result = search_project(
        &root,
        &options("widget", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(matches.len(), 3);
    assert_eq!(matches[0].line, 1);
    assert!(matches[0].score > matches[1].score);
}
#[test]
fn nested_ignore_negation_directory_rules_and_explicit_override() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "*.log\n!keep.log\ncache/\n");
    fixture.put("private.log", "needle");
    fixture.put("keep.log", "needle");
    fixture.put("cache/data.txt", "needle");
    fixture.put("src/.gitignore", "secret.txt\n");
    fixture.put("src/secret.txt", "needle");
    fixture.put("src/open.txt", "needle");
    fixture.put(".git/config", "needle");
    fixture.put(".aws/credentials", "needle");
    fixture.put(".jait/data.txt", "needle");
    let root = fixture.root();
    let result = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    let paths: Vec<_> = matches.iter().map(|m| m.relative_path.as_str()).collect();
    assert_eq!(paths.len(), 2);
    assert!(paths.contains(&"keep.log"));
    assert!(paths.contains(&"src/open.txt"));
    let result = search_project(
        &root,
        &SearchOptions {
            include_ignored_files: true,
            ..options("needle", SearchMode::Content)
        },
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(matches.len(), 5);
}
#[cfg(unix)]
#[test]
fn rejects_links_parent_components_and_root_replacement() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let outside = Fixture::new();
    outside.put("secret.txt", "needle");
    symlink(&outside.0, fixture.0.join("linked")).unwrap();
    symlink(outside.0.join("secret.txt"), fixture.0.join("secret.txt")).unwrap();
    let root = fixture.root();
    assert!(root.open_file("linked/secret.txt").is_err());
    assert!(root.open_file("secret.txt").is_err());
    assert!(root.open_file("../secret.txt").is_err());
    assert!(ProjectRoot::open(&fixture.0.join("linked")).is_err());
    assert!(ProjectRoot::open(&fixture.0.join("../x")).is_err());
    let result = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert!(matches.is_empty());
    let moved = fixture.0.with_extension("moved");
    fs::rename(&fixture.0, &moved).unwrap();
    fs::create_dir(&fixture.0).unwrap();
    assert!(matches!(
        build_index(&root, &IndexOptions::default(), &Cancellation::default()),
        Err(Error::RootChanged)
    ));
    fs::remove_dir_all(moved).unwrap();
}
#[test]
fn bounded_regex_binary_large_files_output_and_cancellation() {
    let fixture = Fixture::new();
    fixture.put(
        "src/file.txt",
        &format!("{}needle\nneedle\n", "x".repeat(1000)),
    );
    fs::write(fixture.0.join("binary.txt"), b"needle\0payload").unwrap();
    let root = fixture.root();
    let cancel = Cancellation::default();
    cancel.cancel();
    assert!(matches!(
        search_project(
            &root,
            &options("needle", SearchMode::Content),
            &Budgets::default(),
            &cancel
        ),
        Err(Error::Cancelled)
    ));
    let invalid = SearchOptions {
        is_regexp: true,
        ..options("[", SearchMode::Content)
    };
    assert!(matches!(
        search_project(
            &root,
            &invalid,
            &Budgets::default(),
            &Cancellation::default()
        ),
        Err(Error::Input(_))
    ));
    let regex = SearchOptions {
        is_regexp: true,
        ..options("n[e]+dle", SearchMode::Content)
    };
    let SearchResult::Content { matches, .. } =
        search_project(&root, &regex, &Budgets::default(), &Cancellation::default()).unwrap()
    else {
        panic!()
    };
    assert_eq!(matches.len(), 2);
    assert!(matches.iter().any(|m| m.content.contains("truncated")));
    let budgets = Budgets {
        max_output_bytes: 256,
        ..Default::default()
    };
    let result = search_project(&root, &regex, &budgets, &Cancellation::default()).unwrap();
    assert!(result.limited());
    assert!(serde_json::to_vec(&result).unwrap().len() <= 256);
    let budgets = Budgets {
        max_file_bytes: 10,
        ..Default::default()
    };
    assert!(
        search_project(&root, &regex, &budgets, &Cancellation::default())
            .unwrap()
            .limited()
    );
    let op = Operation::new(std::time::Duration::ZERO, &Cancellation::default());
    assert!(matches!(op.check(), Err(Error::TimedOut)));
}
#[test]
fn count_budgets_and_index_ignore_provenance_are_enforced() {
    let fixture = Fixture::new();
    for n in 0..8 {
        fixture.put(&format!("file{n}.txt"), "needle");
    }
    let root = fixture.root();
    let index = build_index(
        &root,
        &IndexOptions {
            include_ignored_files: true,
            budgets: Budgets {
                max_files: 2,
                ..Default::default()
            },
            ..Default::default()
        },
        &Cancellation::default(),
    )
    .unwrap();
    assert_eq!(index.coverage.files, 2);
    assert!(index.coverage.limited);
    assert!(matches!(
        search_index(
            &index,
            &options("needle", SearchMode::Content),
            &Budgets::default(),
            &Cancellation::default()
        ),
        Err(Error::Input(_))
    ));
    assert!(normalize_limit(Some(0)).is_err());
    assert_eq!(normalize_limit(Some(500)).unwrap(), 200);
}
#[cfg(unix)]
#[test]
fn unreadable_symlink_ignore_fails_closed() {
    let fixture = Fixture::new();
    let outside = Fixture::new();
    outside.put("ignore", "secret.txt\n");
    fixture.put("secret.txt", "needle");
    std::os::unix::fs::symlink(outside.0.join("ignore"), fixture.0.join(".gitignore")).unwrap();
    assert!(matches!(
        build_index(
            &fixture.root(),
            &IndexOptions::default(),
            &Cancellation::default()
        ),
        Err(Error::Input(_))
    ));
}

#[test]
fn cached_search_rejects_both_ignore_policy_mismatches() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "private.txt\n");
    fixture.put("private.txt", "needle");
    let index = build_index(
        &fixture.root(),
        &IndexOptions::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let request = SearchOptions {
        include_ignored_files: true,
        ..options("needle", SearchMode::Content)
    };
    assert!(matches!(
        search_index(
            &index,
            &request,
            &Budgets::default(),
            &Cancellation::default()
        ),
        Err(Error::Input(_))
    ));
}

#[test]
fn descriptor_reads_charge_bytes_and_observe_cancel_and_deadline() {
    let fixture = Fixture::new();
    fixture.put("data.txt", &"x".repeat(40000));
    let root = fixture.root();
    let cancel = Cancellation::default();
    let operation = Operation::new(std::time::Duration::from_secs(1), &cancel);
    let mut charged = 7;
    assert_eq!(
        root.read("data.txt", 40000, None, &operation, &mut charged)
            .unwrap()
            .len(),
        40000
    );
    assert_eq!(charged, 40007);
    cancel.cancel();
    assert!(matches!(
        root.read("data.txt", 40000, None, &operation, &mut charged),
        Err(Error::Cancelled)
    ));
    assert!(matches!(
        root.names("", 100, &operation),
        Err(Error::Cancelled)
    ));
    assert_eq!(charged, 40007);
    let expired = Operation::new(std::time::Duration::ZERO, &Cancellation::default());
    assert!(matches!(
        root.read("data.txt", 40000, None, &expired, &mut charged),
        Err(Error::TimedOut)
    ));
    assert!(matches!(
        root.names("", 100, &expired),
        Err(Error::TimedOut)
    ));
}

#[test]
fn unmatched_glob_brackets_remain_literal() {
    let pattern = ignore::glob("file[abc", false, false).unwrap();
    assert!(pattern.is_match("file[abc"));
    assert!(!pattern.is_match("filea"));
    assert!(
        ignore::glob("file[!ab]", false, false)
            .unwrap()
            .is_match("filec")
    );
}

#[test]
fn ignore_files_override_gitignore_and_respect_nested_rules() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "*.txt\n");
    fixture.put(".ignore", "!keep.txt\nprivate.log\n");
    fixture.put("src/.gitignore", "keep.txt\n");
    fixture.put("src/.ignore", "nested.log\n");
    fixture.put("src/keep.txt", "needle");
    fixture.put("src/private.log", "needle");
    fixture.put("src/nested.log", "needle");
    fixture.put("src/other.txt", "needle");
    let root = fixture.root();
    let result = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(
        matches
            .iter()
            .map(|m| m.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["src/keep.txt"]
    );
    let result = search_project(
        &root,
        &SearchOptions {
            include_ignored_files: true,
            ..options("needle", SearchMode::Content)
        },
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(matches.len(), 4);
}

#[test]
fn hidden_entries_are_excluded_by_default_in_fresh_and_reused_searches() {
    let fixture = Fixture::new();
    fixture.put("visible/needle.txt", "needle");
    fixture.put("visible/.needle.txt", "needle");
    fixture.put(".hidden/needle.txt", "needle");
    fixture.put(".git/needle.txt", "needle");
    fixture.put(".ignore", "ignored.txt\n");
    fixture.put("ignored.txt", "needle");
    let root = fixture.root();
    let budgets = Budgets::default();
    let cancel = Cancellation::default();
    let index = build_index(&root, &IndexOptions::default(), &cancel).unwrap();
    assert!(index.entries.contains_key(".hidden/needle.txt"));
    for mode in [SearchMode::Files, SearchMode::Content] {
        let opts = options("needle", mode);
        for result in [
            search_project(&root, &opts, &budgets, &cancel).unwrap(),
            search_index(&index, &opts, &budgets, &cancel).unwrap(),
        ] {
            let paths: Vec<String> = match result {
                SearchResult::Files { files, .. } => {
                    files.into_iter().map(|m| m.relative_path).collect()
                }
                SearchResult::Content { matches, .. } => {
                    matches.into_iter().map(|m| m.relative_path).collect()
                }
            };
            assert_eq!(paths, vec!["visible/needle.txt"]);
        }
        let opts = SearchOptions {
            include_ignored_files: true,
            ..opts
        };
        let result = search_project(&root, &opts, &budgets, &cancel).unwrap();
        let paths: Vec<String> = match result {
            SearchResult::Files { files, .. } => {
                files.into_iter().map(|m| m.relative_path).collect()
            }
            SearchResult::Content { matches, .. } => {
                matches.into_iter().map(|m| m.relative_path).collect()
            }
        };
        assert!(paths.contains(&"visible/.needle.txt".to_string()));
        assert!(paths.contains(&".hidden/needle.txt".to_string()));
        assert!(!paths.contains(&".git/needle.txt".to_string()));
        if mode == SearchMode::Content {
            assert!(paths.contains(&"ignored.txt".to_string()));
        }
    }
}

#[test]
fn file_include_uses_reference_post_filter() {
    let fixture = Fixture::new();
    fixture.put("src/needle.rs", "needle");
    let root = fixture.root();
    let search_with = |include: &str| {
        let options = SearchOptions {
            include: Some(include.into()),
            ..options("needle", SearchMode::Files)
        };
        let SearchResult::Files { files, .. } = search_project(
            &root,
            &options,
            &Budgets::default(),
            &Cancellation::default(),
        )
        .unwrap() else {
            panic!()
        };
        files
    };
    assert_eq!(search_with("*.rs").len(), 1);
    // The reference's post-filter removes '*' before substring matching.
    assert!(search_with("src/*.rs").is_empty());
}
