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

#[cfg(unix)]
#[test]
fn non_utf8_names_consume_global_entry_budget() {
    use std::{ffi::OsStr, os::unix::ffi::OsStrExt};
    let fixture = Fixture::new();
    fs::create_dir(fixture.0.join("a")).unwrap();
    fs::create_dir(fixture.0.join("b")).unwrap();
    fs::write(fixture.0.join("a").join(OsStr::from_bytes(b"\xff")), b"x").unwrap();
    fixture.put("b/needle.txt", "needle");
    let mut options = IndexOptions::default();
    options.budgets.max_entries = 3;
    let index = build_index(&fixture.root(), &options, &Cancellation::default()).unwrap();
    assert_eq!(index.coverage.entries_examined, 3);
    assert!(index.coverage.limited);
    assert!(!index.entries.contains_key("b/needle.txt"));
}

#[cfg(unix)]
#[test]
fn limited_directory_batch_is_sorted() {
    let fixture = Fixture::new();
    for name in ["z.txt", "y.txt", "x.txt", "w.txt"] {
        fixture.put(name, "");
    }
    let cancellation = Cancellation::default();
    let operation = Operation::new(std::time::Duration::from_secs(2), &cancellation);
    let (names, examined, limited) = fixture.root().names("", 3, &operation).unwrap();
    assert_eq!(examined, 3);
    assert!(limited);
    assert_eq!(names.len(), 3);
    assert!(names.windows(2).all(|pair| pair[0] <= pair[1]));
}

#[cfg(unix)]
#[test]
fn rejected_filename_marks_search_incomplete() {
    let fixture = Fixture::new();
    fixture.put("folder\\needle.txt", "needle");
    let SearchResult::Files { files, limited, .. } = search_project_fallback(
        &fixture.root(),
        &options("needle", SearchMode::Files),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert!(files.is_empty());
    assert!(limited);
}

#[test]
fn content_search_decodes_invalid_utf8_without_dropping_the_file() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("encoding.txt"), b"prefix \xff needle\n").unwrap();
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!limited);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].relative_path, "encoding.txt");
    assert_eq!(matches[0].content, "prefix \u{fffd} needle");
}

#[cfg(unix)]
#[test]
fn trailing_backslash_ignore_rule_does_not_exclude_unescaped_filename() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "secret\\\n");
    fixture.put("secret\\", "needle");
    fixture.put("secret", "needle");
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    // The pinned-root validator skips the backslash filename.
    assert!(limited);
    assert_eq!(
        matches
            .iter()
            .map(|entry| entry.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["secret"]
    );
}

#[test]
fn user_globs_retain_existing_empty_class_and_trailing_escape_behavior() {
    assert!(
        ignore::glob("item[]", false, false)
            .unwrap()
            .is_match("item[]")
    );
    assert!(
        ignore::glob("item\\", false, false)
            .unwrap()
            .is_match("item")
    );
}

#[test]
fn long_unmatched_bracket_ignore_rule_preserves_wildcard() {
    let pattern = format!("{}*", "[".repeat(400));
    let (rules, limited) = ignore::parse(&pattern);
    assert!(!limited);
    assert_eq!(rules.len(), 1);
    let scopes = vec![ignore::IgnoreScope {
        base: String::new(),
        higher_priority: false,
        rules,
    }];
    assert!(ignore::ignored(
        &scopes,
        &format!("{}suffix", "[".repeat(400)),
        false
    ));
    assert!(!ignore::ignored(&scopes, "visible", false));
    assert!(ignore::parse(&format!("{}*", "[".repeat(4000))).1);
}

#[test]
fn empty_ignore_rules_do_not_exhaust_rule_budget() {
    let content = format!("{}secret\n", "!\n/\n!/\n".repeat(128));
    let (rules, limited) = ignore::parse(&content);
    assert!(!limited);
    assert_eq!(rules.len(), 1);
    let scopes = vec![ignore::IgnoreScope {
        base: String::new(),
        higher_priority: false,
        rules,
    }];
    assert!(ignore::ignored(&scopes, "secret", false));
    let content = format!("{}!\n/\n!/\n", "valid\n".repeat(128));
    let (rules, limited) = ignore::parse(&content);
    assert_eq!(rules.len(), 128);
    assert!(!limited);
}

#[test]
fn unmatched_ignore_bracket_preserves_following_wildcards() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "[secret*\n");
    fixture.put("[secret-file", "needle");
    fixture.put("visible", "needle");
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!limited);
    assert_eq!(
        matches
            .iter()
            .map(|entry| entry.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["visible"]
    );
    assert!(
        ignore::glob("[secret*", false, false)
            .unwrap()
            .is_match("[secret*")
    );
    assert!(
        !ignore::glob("[secret*", false, false)
            .unwrap()
            .is_match("[secret-file")
    );
}

#[test]
fn negated_empty_ignore_character_classes_match_any_character() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "secret[!]\nprivate[^]\n");
    fixture.put("secreta", "needle");
    fixture.put("privateb", "needle");
    fixture.put("visible", "needle");
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!limited);
    assert_eq!(
        matches
            .iter()
            .map(|entry| entry.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["visible"]
    );
    let (rules, limited) = ignore::parse("secret[!]\n");
    assert!(!limited);
    let scopes = vec![ignore::IgnoreScope {
        base: String::new(),
        higher_priority: false,
        rules,
    }];
    assert!(ignore::ignored(&scopes, "secret\n", false));
}

#[test]
fn empty_ignore_character_class_does_not_match_literal_brackets() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "item[]\n");
    fixture.put("item[]", "needle");
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!limited);
    assert_eq!(
        matches
            .iter()
            .map(|entry| entry.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["item[]"]
    );
}

#[test]
fn escaped_trailing_space_in_ignore_rule_excludes_the_named_file() {
    let fixture = Fixture::new();
    fixture.put(".gitignore", "secret\\ \nordinary   \n");
    fixture.put("secret ", "needle");
    fixture.put("secret", "needle");
    fixture.put("ordinary", "needle");
    let SearchResult::Content {
        matches, limited, ..
    } = search_project(
        &fixture.root(),
        &SearchOptions {
            include_ignored_files: false,
            ..options("needle", SearchMode::Content)
        },
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap()
    else {
        panic!()
    };
    assert!(!limited);
    assert_eq!(
        matches
            .iter()
            .map(|m| m.relative_path.as_str())
            .collect::<Vec<_>>(),
        vec!["secret"]
    );
}

#[test]
fn empty_cleaned_filename_query_returns_before_regexp_or_enumeration() {
    let fixture = Fixture::new();
    fixture.put("file.txt", "needle");
    let result = search_project(
        &fixture.root(),
        &SearchOptions {
            is_regexp: true,
            ..options("*", SearchMode::Files)
        },
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Files { files, limited, .. } = result else {
        panic!()
    };
    assert!(files.is_empty());
    assert!(!limited);
}

#[test]
fn fallback_rejects_regex_before_enumeration_and_respects_cancellation() {
    let fixture = Fixture::new();
    let root = fixture.root();
    for mode in [SearchMode::Files, SearchMode::Content] {
        let opts = SearchOptions {
            is_regexp: true,
            ..options("a[", mode)
        };
        assert!(matches!(
            search_project_fallback(&root, &opts, &Budgets::default(), &Cancellation::default()),
            Err(Error::RegexpRequiresRipgrep)
        ));
        let cancel = Cancellation::default();
        cancel.cancel();
        assert!(matches!(
            search_project_fallback(&root, &opts, &Budgets::default(), &cancel),
            Err(Error::Cancelled)
        ));
    }
    let empty = SearchOptions {
        is_regexp: true,
        ..options("*", SearchMode::Files)
    };
    assert!(
        matches!(search_project_fallback(&root, &empty, &Budgets::default(), &Cancellation::default()),
        Ok(SearchResult::Files { files, limited: false, .. }) if files.is_empty())
    );
}

#[test]
fn fallback_content_filters_extensions_before_consuming_read_budget() {
    let fixture = Fixture::new();
    fixture.put("a.bin", &"needle".repeat(100));
    fixture.put("README", "needle");
    fixture.put(".env", "needle");
    fixture.put("config.env", "needle");
    fixture.put("source.TS", "needle");
    let budgets = Budgets {
        max_read_bytes: 32,
        ..Default::default()
    };
    let opts = SearchOptions {
        include_ignored_files: true,
        ..options("needle", SearchMode::Content)
    };
    let SearchResult::Content {
        matches, limited, ..
    } = search_project_fallback(&fixture.root(), &opts, &budgets, &Cancellation::default())
        .unwrap()
    else {
        panic!()
    };
    let mut paths = matches
        .iter()
        .map(|m| m.relative_path.as_str())
        .collect::<Vec<_>>();
    paths.sort();
    assert_eq!(paths, vec!["config.env", "source.TS"]);
    assert!(!limited);
}

#[test]
fn fallback_include_uses_reference_substring_and_native_still_searches_other_extensions() {
    let fixture = Fixture::new();
    fixture.put("src/one.txt", "needle");
    fixture.put("src/other.bin", "needle");
    let root = fixture.root();
    let opts = SearchOptions {
        include: Some("src/*.txt".into()),
        ..options("needle", SearchMode::Content)
    };
    let SearchResult::Content { matches, .. } =
        search_project_fallback(&root, &opts, &Budgets::default(), &Cancellation::default())
            .unwrap()
    else {
        panic!()
    };
    assert!(matches.is_empty());
    let SearchResult::Content { matches, .. } = search_project(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert!(matches.iter().any(|m| m.relative_path == "src/other.bin"));
}

#[cfg(unix)]
#[test]
fn automatic_search_falls_back_only_for_missing_executable() {
    use std::ffi::OsStr;
    let fixture = Fixture::new();
    fixture.put("known.txt", "needle\n");
    fixture.put("unknown.xyz", "needle\n");
    let root = fixture.root();
    let missing = fixture.0.join("missing-rg");
    let result = search_project_auto_with_program(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
        missing.as_os_str(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].relative_path, "known.txt");
    let mut regex = options("needle", SearchMode::Content);
    regex.is_regexp = true;
    assert!(matches!(
        search_project_auto_with_program(
            &root,
            &regex,
            &Budgets::default(),
            &Cancellation::default(),
            missing.as_os_str()
        ),
        Err(Error::RegexpRequiresRipgrep)
    ));
    // A present but failing executable is an error, never silently treated as missing.
    assert!(matches!(
        search_project_auto_with_program(
            &root,
            &regex,
            &Budgets::default(),
            &Cancellation::default(),
            OsStr::new("/bin/sh")
        ),
        Err(Error::Input(_))
    ));
}

#[cfg(unix)]
#[test]
fn supervised_ripgrep_obeys_deadline_and_output_limit() {
    use std::{os::unix::fs::PermissionsExt, time::Duration};
    let fixture = Fixture::new();
    let script = fixture.0.join("fake-rg");
    std::fs::write(
        &script,
        "#!/bin/sh\nwhile :; do printf '1:abcdefghij\\n'; done\n",
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
    let cancel = Cancellation::default();
    let operation = Operation::new(Duration::from_secs(2), &cancel);
    let (_, limited) = ripgrep::run(script.as_os_str(), "x", false, b"", 128, &operation)
        .unwrap()
        .unwrap();
    assert!(limited);
    std::fs::write(&script, "#!/bin/sh\nwhile :; do :; done\n").unwrap();
    let operation = Operation::new(Duration::from_millis(30), &cancel);
    assert!(matches!(
        ripgrep::run(script.as_os_str(), "x", false, b"", 128, &operation),
        Err(Error::TimedOut)
    ));
    cancel.cancel();
    let operation = Operation::new(Duration::from_secs(1), &cancel);
    assert!(matches!(
        ripgrep::run(script.as_os_str(), "x", false, b"", 128, &operation),
        Err(Error::Cancelled)
    ));
}

#[cfg(unix)]
#[test]
fn supervised_ripgrep_cancels_streaming_child() {
    use std::{
        os::unix::fs::PermissionsExt,
        thread,
        time::{Duration, Instant},
    };
    let fixture = Fixture::new();
    let script = fixture.0.join("streaming-rg");
    let ready = fixture.0.join("streaming-rg.ready");
    std::fs::write(
        &script,
        "#!/bin/sh\nprintf '1:started\\n'\n: > \"$0.ready\"\nwhile :; do printf '1:abcdefghij\\n'; done\n",
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
    let cancel = Cancellation::default();
    let signal = cancel.clone();
    let waiter = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        while !ready.exists() && Instant::now() < deadline {
            thread::yield_now();
        }
        let started = ready.exists();
        signal.cancel();
        started
    });
    let operation = Operation::new(Duration::from_secs(3), &cancel);
    let result = ripgrep::run(
        script.as_os_str(),
        "x",
        false,
        b"",
        64 * 1024 * 1024,
        &operation,
    );
    assert!(waiter.join().unwrap(), "streaming child did not start");
    assert!(matches!(result, Err(Error::Cancelled)), "{result:?}");
}

#[cfg(unix)]
#[test]
fn supervised_ripgrep_exchanges_large_input_and_output() {
    use std::{os::unix::fs::PermissionsExt, time::Duration};
    let fixture = Fixture::new();
    let script = fixture.0.join("duplex-rg");
    std::fs::write(
        &script,
        "#!/bin/sh\nwhile IFS= read -r line; do printf '%s\\n' \"$line\"; done\n",
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
    let input = format!("{}\n", "x".repeat(1023)).repeat(512).into_bytes();
    let cancel = Cancellation::default();
    let operation = Operation::new(Duration::from_secs(5), &cancel);
    let (output, limited) = ripgrep::run(
        script.as_os_str(),
        "x",
        false,
        &input,
        input.len() + 1,
        &operation,
    )
    .unwrap()
    .unwrap();
    assert!(!limited);
    assert_eq!(output, input);
}

#[cfg(unix)]
#[test]
fn supervised_ripgrep_keeps_complete_records_in_overflowing_read() {
    use std::{os::unix::fs::PermissionsExt, time::Duration};
    let fixture = Fixture::new();
    let script = fixture.0.join("fake-rg-records");
    std::fs::write(
        &script,
        "#!/bin/sh\nprintf '1:first\\n2:second\\n3:third\\n'\n",
    )
    .unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
    let cancel = Cancellation::default();
    for (budget, expected) in [
        (7, &b""[..]),
        (8, &b"1:first\n"[..]),
        (19, &b"1:first\n2:second\n"[..]),
    ] {
        let operation = Operation::new(Duration::from_secs(2), &cancel);
        let (output, limited) =
            ripgrep::run(script.as_os_str(), "x", false, b"", budget, &operation)
                .unwrap()
                .unwrap();
        assert!(limited);
        assert_eq!(output, expected);
    }
}

#[cfg(unix)]
#[test]
fn installed_ripgrep_searches_only_scoped_file_bytes() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let outside = Fixture::new();
    fixture.put("source.xyz", "Alpha needle\n");
    outside.put("secret.txt", "needle\n");
    symlink(&outside.0, fixture.0.join("escape")).unwrap();
    let root = fixture.root();
    let operation = Operation::new(std::time::Duration::from_secs(2), &Cancellation::default());
    if ripgrep::run(
        std::ffi::OsStr::new("rg"),
        "needle",
        false,
        b"",
        1024,
        &operation,
    )
    .unwrap()
    .is_none()
    {
        return;
    }
    let result = search_project_auto(
        &root,
        &options("needle", SearchMode::Content),
        &Budgets::default(),
        &Cancellation::default(),
    )
    .unwrap();
    let SearchResult::Content { matches, .. } = result else {
        panic!()
    };
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].relative_path, "source.xyz");
    assert_eq!(matches[0].line, 1);
}

#[test]
fn primary_bridge_confines_root_and_preserves_results_and_cancellation() {
    use super::primary_bridge::PinnedPrimarySearchBridge;
    use crate::services::primary_link::{
        ProjectSearchBridge, ProjectSearchMode, ProjectSearchRequest, RawSearchResult,
    };
    let fixture = Fixture::new();
    fixture.put("src/example.txt", "needle\n");
    let root = fixture.root();
    let budgets = Budgets::default();
    let cancel = Cancellation::default();
    let bridge = PinnedPrimarySearchBridge {
        root: &root,
        budgets: &budgets,
        cancel: &cancel,
    };
    let mut request = ProjectSearchRequest {
        root: root.path().to_path_buf(),
        query: "needle".into(),
        mode: ProjectSearchMode::Content,
        ..Default::default()
    };
    let RawSearchResult::Content { matches, .. } = bridge.search_project(&request).unwrap() else {
        panic!()
    };
    assert_eq!(matches[0].relative_path, "src/example.txt");
    request.root = root.path().join("src");
    assert!(bridge.search_project(&request).is_err());
    request.root = root.path().to_path_buf();
    cancel.cancel();
    assert!(
        bridge
            .search_project(&request)
            .unwrap_err()
            .message
            .contains("cancelled")
    );
}

#[tokio::test]
async fn primary_search_dispatch_uses_authorized_root_and_lane() {
    use super::primary_bridge::{PrimarySearchCall, PrimarySearchDispatch};
    use crate::runtime::blocking::BlockingLane;
    let fixture = Fixture::new();
    fixture.put("example.txt", "needle\n");
    let root = fixture.root();
    let lane = BlockingLane::new(std::num::NonZeroU16::new(1).unwrap());
    let dispatch = PrimarySearchDispatch {
        root: root.clone(),
        lane: lane.clone(),
    };
    let args = serde_json::json!({"pattern":"needle"})
        .as_object()
        .unwrap()
        .clone();
    let result = dispatch.run(PrimarySearchCall::Tool(args)).await.unwrap();
    assert_eq!(result["ok"], true);
    let escaped = serde_json::json!({"pattern":"needle", "path":".."})
        .as_object()
        .unwrap()
        .clone();
    let result = dispatch
        .run(PrimarySearchCall::Tool(escaped))
        .await
        .unwrap();
    assert_eq!(result["ok"], false);
    let fs_args = serde_json::json!({"path": root.path(), "query": "needle", "mode": "content"})
        .as_object()
        .unwrap()
        .clone();
    let result = dispatch.run(PrimarySearchCall::Fs(fs_args)).await.unwrap();
    assert_eq!(result["mode"], "content");
    assert_eq!(result["matches"][0]["file"], "example.txt");
    let foreign_args =
        serde_json::json!({"path": root.path().parent().unwrap(), "query": "needle"})
            .as_object()
            .unwrap()
            .clone();
    assert!(
        dispatch
            .run(PrimarySearchCall::Fs(foreign_args))
            .await
            .is_err()
    );
    lane.close();
    assert!(
        dispatch
            .run(PrimarySearchCall::Tool(Default::default()))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn primary_search_dispatch_rejects_replaced_root() {
    use super::primary_bridge::{PrimarySearchCall, PrimarySearchDispatch};
    use crate::runtime::blocking::BlockingLane;
    let fixture = Fixture::new();
    fixture.put("project/old.txt", "old needle");
    let path = fixture.0.join("project");
    let root = ProjectRoot::open(&path).unwrap();
    let dispatch = PrimarySearchDispatch {
        root,
        lane: BlockingLane::new(std::num::NonZeroU16::new(1).unwrap()),
    };
    fs::rename(&path, fixture.0.join("original")).unwrap();
    fixture.put("project/new.txt", "replacement needle");
    let args = serde_json::json!({"pattern":"needle"})
        .as_object()
        .unwrap()
        .clone();
    let result = dispatch.run(PrimarySearchCall::Tool(args)).await.unwrap();
    assert_eq!(result["ok"], false);
}
