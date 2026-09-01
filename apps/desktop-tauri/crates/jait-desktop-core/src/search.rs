//! search — port of apps/desktop/src/project-search.ts (search-project op).

use crate::types::*;
use std::path::Path;

/// Mirrors search-tools.ts: content matches capped at 60 lines total,
/// file-name mode capped at 100; both honour an optional glob `include`.
const DEFAULT_LIMIT: u64 = 60;
const DEFAULT_FILE_LIST_LIMIT: u64 = 100;

pub fn search(root: &Path, req: &SearchRequest) -> SearchResult {
    let limit = req.limit.unwrap_or(if req.mode == "files" {
        DEFAULT_FILE_LIST_LIMIT
    } else {
        DEFAULT_LIMIT
    });
    let walker = ignore::WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(!req.include_ignored_files.unwrap_or(false))
        .build();

    let mut results = SearchResult {
        mode: req.mode.clone(),
        matches: if req.mode == "content" {
            Some(Vec::new())
        } else {
            None
        },
        files: if req.mode == "files" {
            Some(Vec::new())
        } else {
            None
        },
        limited: false,
    };

    let include_matcher = req.include.as_deref().map(|i| {
        ignore::overrides::OverrideBuilder::new(root)
            .add(i)
            .ok()
            .map(|b| b.build().ok())
            .flatten()
    });

    let regex = if req.is_regexp.unwrap_or(false) {
        regex::Regex::new(&req.query).ok()
    } else {
        None
    };
    let lower_query = req.query.to_lowercase();

    let mut counter = 0u64;
    let mut counter_files = 0u64;
    for entry in walker.flatten() {
        if !entry.file_type().map(|f| f.is_file()).unwrap_or(false) {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| entry.file_name().to_string_lossy().into_owned());

        if let Some(glob) = &include_matcher {
            match glob {
                Some(g) => {
                    if !g.matched(entry.path(), false).is_whitelist() {
                        continue;
                    }
                }
                None => continue,
            }
        }

        if req.mode == "files" {
            let hay = if regex.is_some() {
                entry.file_name().to_string_lossy().into_owned()
            } else {
                entry.file_name().to_string_lossy().to_lowercase()
            };
            let hit = match &regex {
                Some(re) => re.is_match(&hay),
                None => hay.contains(&lower_query),
            };
            if hit {
                if counter_files >= limit {
                    results.limited = true;
                    break;
                }
                results
                    .files
                    .as_mut()
                    .unwrap()
                    .push(SearchFile { path: rel });
                counter_files += 1;
            }
            continue;
        }

        // content mode
        let content = match std::fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue, // binary files are skipped like ripgrep
        };
        let mut pushed_any = false;
        for (idx, line) in content.lines().enumerate() {
            let hit = match &regex {
                Some(re) => re.is_match(line),
                None => line.to_lowercase().contains(&lower_query),
            };
            if hit {
                if counter >= limit {
                    results.limited = true;
                    break;
                }
                results.matches.as_mut().unwrap().push(SearchMatch {
                    file: rel.clone(),
                    line: idx as u64 + 1,
                    content: line.to_string(),
                });
                counter += 1;
                pushed_any = true;
            }
        }
        let _ = pushed_any;
        if results.limited {
            break;
        }
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("jait-search-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::write(
            dir.join("src/main.rs"),
            "fn main() {}\n// TODO: fill this in\nlet gateway_url = \"wss://x\";\n",
        )
        .unwrap();
        std::fs::write(dir.join("src/lib.rs"), "pub mod gateway;\nTODO\n").unwrap();
        std::fs::write(dir.join("README.md"), "# Jait\nTODO later\n").unwrap();
        dir
    }

    #[test]
    fn content_search_finds_matches() {
        let root = temp_root("content");
        let req = SearchRequest {
            query: "TODO".into(),
            mode: "content".into(),
            limit: Some(60),
            include: None,
            is_regexp: Some(false),
            include_ignored_files: Some(false),
        };
        let res = search(&root, &req);
        let mut matches = res.matches.unwrap();
        // Walker order is filesystem-dependent; sort for stable assertions.
        matches.sort_by(|a, b| (a.file.clone(), a.line).cmp(&(b.file.clone(), b.line)));
        assert_eq!(matches.len(), 3, "{matches:?}");
        assert!(
            matches
                .iter()
                .any(|m| m.file == "src/main.rs" && m.line == 2),
            "{matches:?}"
        );
        assert!(
            matches
                .iter()
                .any(|m| m.file == "src/lib.rs" && m.line == 2),
            "{matches:?}"
        );
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn files_search_matches_by_name() {
        let root = temp_root("files");
        let req = SearchRequest {
            query: "main".into(),
            mode: "files".into(),
            limit: None,
            include: None,
            is_regexp: Some(false),
            include_ignored_files: Some(false),
        };
        let res = search(&root, &req);
        let files = res.files.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/main.rs");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn limit_sets_limited_flag() {
        let root = temp_root("limit");
        let req = SearchRequest {
            query: "TODO".into(),
            mode: "content".into(),
            limit: Some(2),
            include: None,
            is_regexp: Some(false),
            include_ignored_files: Some(false),
        };
        let res = search(&root, &req);
        assert!(res.limited);
        assert_eq!(res.matches.unwrap().len(), 2);
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn include_glob_filters_files() {
        let root = temp_root("glob");
        let req = SearchRequest {
            query: "TODO".into(),
            mode: "content".into(),
            limit: Some(60),
            include: Some("**/*.rs".into()),
            is_regexp: Some(false),
            include_ignored_files: Some(false),
        };
        let res = search(&root, &req);
        // README.md's TODO must NOT appear.
        assert!(res
            .matches
            .as_ref()
            .unwrap()
            .iter()
            .all(|m| m.file.ends_with(".rs")));
        std::fs::remove_dir_all(root).ok();
    }
}
