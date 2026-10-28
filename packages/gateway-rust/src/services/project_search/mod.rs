//! Native bounded project enumeration, indexing and ranked search. No HTTP, shell,
//! TS/Bun worker, ambient Git config or model interpretation of file contents.
mod filesystem;
pub(crate) mod ignore;
pub mod ranking;
mod walk;
use crate::{runtime::blocking::BlockingLane, services::projects::ProjectService};
pub use filesystem::ProjectRoot;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::{
    fmt, io,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
pub(crate) use walk::Operation;
use walk::scan;
pub use walk::{Budgets, IndexCoverage, IndexEntry, IndexOptions, ProjectIndex, build_index};

pub const PROJECT_SEARCH_MAX_RESULTS: usize = 200;
pub const PROJECT_SEARCH_DEFAULT_RESULTS: usize = 20;
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Debug)]
pub enum Error {
    Input(String),
    Io(io::Error),
    Cancelled,
    TimedOut,
    RootChanged,
    Excluded,
    FileTooLarge,
    Unsupported,
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Input(message) => f.write_str(message),
            Self::Io(_) => f.write_str("project filesystem operation failed"),
            Self::Cancelled => f.write_str("project operation cancelled"),
            Self::TimedOut => f.write_str("project operation timed out"),
            Self::RootChanged => f.write_str("project entry changed during operation"),
            Self::Excluded => f.write_str("project entry excluded"),
            Self::FileTooLarge => f.write_str("project file exceeds byte budget"),
            Self::Unsupported => f.write_str("project operation unsupported on this platform"),
        }
    }
}
impl std::error::Error for Error {}
impl From<io::Error> for Error {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
#[derive(Clone, Debug, Default)]
pub struct Cancellation(Arc<AtomicBool>);
impl Cancellation {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }
}
/// Look up the authenticated user's effective root using the existing registry.
/// Resolve on the DB lane, then open `ProjectRoot` on the shared filesystem lane.
/// No unauthenticated `None` owner fallback is provided.
pub fn registered_root_path(
    projects: &ProjectService<'_>,
    project_id: &str,
    owner_id: &str,
) -> Result<std::path::PathBuf> {
    if project_id.is_empty() || owner_id.is_empty() {
        return Err(Error::Input("project and owner are required".into()));
    }
    let root = projects
        .effective_root_path(project_id, Some(owner_id))
        .map_err(|_| Error::Input("project root lookup failed".into()))?
        .ok_or_else(|| Error::Input("owned project has no effective root".into()))?;
    Ok(std::path::PathBuf::from(root))
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Files,
    #[default]
    Content,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchOptions {
    pub query: String,
    #[serde(default)]
    pub mode: SearchMode,
    pub limit: Option<usize>,
    pub include: Option<String>,
    #[serde(default)]
    pub is_regexp: bool,
    #[serde(default)]
    pub include_ignored_files: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileMatch {
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub score: i32,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentMatch {
    pub file: String,
    pub relative_path: String,
    pub line: usize,
    pub content: String,
    pub score: i32,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum SearchResult {
    Files {
        query: String,
        files: Vec<FileMatch>,
        limited: bool,
    },
    Content {
        query: String,
        matches: Vec<ContentMatch>,
        limited: bool,
    },
}
impl SearchResult {
    pub fn limited(&self) -> bool {
        match self {
            Self::Files { limited, .. } | Self::Content { limited, .. } => *limited,
        }
    }
    fn bound_output(&mut self, bytes: usize, operation: &Operation) -> Result<()> {
        while serde_json::to_vec(&self)
            .map_err(|_| Error::Input("search result serialization failed".into()))?
            .len()
            > bytes
        {
            operation.check()?;
            let removed = match self {
                Self::Files { files, limited, .. } => {
                    *limited = true;
                    files.pop().is_some()
                }
                Self::Content {
                    matches, limited, ..
                } => {
                    *limited = true;
                    matches.pop().is_some()
                }
            };
            if !removed {
                return Err(Error::Input("query exceeds output byte budget".into()));
            }
        }
        Ok(())
    }
}
pub fn normalize_limit(limit: Option<usize>) -> Result<usize> {
    let value = limit.unwrap_or(PROJECT_SEARCH_DEFAULT_RESULTS);
    if value == 0 {
        return Err(Error::Input("limit must be a positive integer".into()));
    }
    Ok(value.min(PROJECT_SEARCH_MAX_RESULTS))
}
pub fn candidate_limit(limit: usize) -> usize {
    limit.saturating_mul(10).clamp(500, 2000)
}
fn validate(options: &SearchOptions, budgets: &Budgets) -> Result<usize> {
    budgets.validate()?;
    if options.query.trim().is_empty() {
        return Err(Error::Input("query is required".into()));
    }
    if options.query.len() > 4096 {
        return Err(Error::Input("query exceeds 4096 bytes".into()));
    }
    normalize_limit(options.limit)
}
pub fn search_project(
    root: &ProjectRoot,
    options: &SearchOptions,
    budgets: &Budgets,
    cancel: &Cancellation,
) -> Result<SearchResult> {
    validate(options, budgets)?;
    let operation = Operation::new(budgets.duration, cancel);
    let index = scan(
        root,
        &IndexOptions {
            include_ignored_files: options.include_ignored_files,
            budgets: budgets.clone(),
            ..Default::default()
        },
        &operation,
    )?;
    search(&index, options, budgets, &operation)
}
/// Search a caller-owned immutable metadata index. Contents are read live through
/// the same pinned root and must retain the indexed identity; this is not a cache
/// of secrets or a claim that a watcher has made the index current.
pub fn search_index(
    index: &ProjectIndex,
    options: &SearchOptions,
    budgets: &Budgets,
    cancel: &Cancellation,
) -> Result<SearchResult> {
    validate(options, budgets)?;
    if index.include_ignored_files != options.include_ignored_files {
        return Err(Error::Input(
            "search requires an index with the requested ignore policy".into(),
        ));
    }
    search(
        index,
        options,
        budgets,
        &Operation::new(budgets.duration, cancel),
    )
}
fn search(
    index: &ProjectIndex,
    options: &SearchOptions,
    budgets: &Budgets,
    operation: &Operation,
) -> Result<SearchResult> {
    let limit = validate(options, budgets)?;
    operation.check()?;
    index.root.check_identity()?;
    let query = options.query.trim();
    let regex = if options.is_regexp {
        Some(
            RegexBuilder::new(query)
                .case_insensitive(true)
                .size_limit(1024 * 1024)
                .dfa_size_limit(2 * 1024 * 1024)
                .build()
                .map_err(|_| Error::Input("invalid or excessive regular expression".into()))?,
        )
    } else {
        None
    };
    let include = options
        .include
        .as_deref()
        .filter(|p| !p.is_empty())
        .map(|p| ignore::glob(p, !p.contains('/'), false))
        .transpose()?;
    let needle = query.to_lowercase();
    let file_needle = ranking::cleaned_file_query(query);
    let cap = candidate_limit(limit);
    let mut limited = index.coverage.limited;
    let mut paths = Vec::new();
    let mut matches = Vec::new();
    let mut read_bytes = index.coverage.ignore_bytes;
    let mut candidate_bytes = 0usize;
    for (relative, entry) in &index.entries {
        operation.check()?;
        if entry.directory || include.as_ref().is_some_and(|re| !re.is_match(relative)) {
            continue;
        }
        if options.mode == SearchMode::Files {
            if file_needle.is_empty() {
                break;
            }
            let matched = regex.as_ref().map_or_else(
                || relative.to_lowercase().contains(&file_needle),
                |re| re.is_match(relative),
            );
            if !matched {
                continue;
            }
            if paths.len() >= cap || candidate_bytes + relative.len() > budgets.max_output_bytes {
                limited = true;
                break;
            }
            candidate_bytes += relative.len();
            paths.push(relative.clone());
            continue;
        }
        if entry.bytes > budgets.max_file_bytes as u64 {
            limited = true;
            continue;
        }
        if read_bytes.saturating_add(entry.bytes as usize) > budgets.max_read_bytes {
            limited = true;
            break;
        }
        let data = match index.root.read(
            relative,
            budgets
                .max_file_bytes
                .min(budgets.max_read_bytes.saturating_sub(read_bytes)),
            Some(entry.identity),
            operation,
            &mut read_bytes,
        ) {
            Ok(data) => data,
            Err(error @ (Error::Cancelled | Error::TimedOut)) => return Err(error),
            Err(_) => {
                limited = true;
                continue;
            }
        };
        operation.check()?;
        if data.contains(&0) {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&data) else {
            continue;
        };
        let mut per_file = 0;
        for (number, line) in text.split('\n').enumerate() {
            operation.check()?;
            if !regex.as_ref().map_or_else(
                || line.to_lowercase().contains(&needle),
                |re| re.is_match(line),
            ) {
                continue;
            }
            let content = ranking::truncate_content(line);
            if matches.len() >= cap
                || candidate_bytes.saturating_add(content.len() + relative.len() + 128)
                    > budgets.max_output_bytes
            {
                limited = true;
                break;
            }
            candidate_bytes += content.len() + relative.len() + 128;
            matches.push(ContentMatch {
                file: String::new(),
                relative_path: relative.clone(),
                line: number + 1,
                content,
                score: 0,
            });
            per_file += 1;
            if per_file >= 50 {
                limited = true;
                break;
            }
        }
        if matches.len() >= cap || candidate_bytes >= budgets.max_output_bytes {
            limited = true;
            break;
        }
    }
    operation.check()?;
    index.root.check_identity()?;
    let mut result = match options.mode {
        SearchMode::Files => {
            limited |= paths.len() > limit;
            let mut files = ranking::rank_file_paths(&paths, query, limit, options.is_regexp);
            for file in &mut files {
                file.path = index
                    .root
                    .path()
                    .join(&file.relative_path)
                    .to_string_lossy()
                    .into_owned();
            }
            SearchResult::Files {
                query: options.query.clone(),
                files,
                limited,
            }
        }
        SearchMode::Content => {
            limited |= matches.len() > limit;
            ranking::rank_content_matches(&mut matches, query, limit);
            for matched in &mut matches {
                matched.file = index
                    .root
                    .path()
                    .join(&matched.relative_path)
                    .to_string_lossy()
                    .into_owned();
            }
            SearchResult::Content {
                query: options.query.clone(),
                matches,
                limited,
            }
        }
    };
    result.bound_output(budgets.max_output_bytes, operation)?;
    operation.check()?;
    index.root.check_identity()?;
    Ok(result)
}
/// The caller supplies the shared blocking lane; no new global pool or per-session
/// executor is created. Dropping the future cancels the child, whose lane permit
/// remains owned until bounded blocking work returns.
#[derive(Clone)]
pub struct ProjectSearch {
    lane: BlockingLane,
}
impl ProjectSearch {
    pub fn new(lane: BlockingLane) -> Self {
        Self { lane }
    }
    pub async fn search(
        &self,
        root: ProjectRoot,
        options: SearchOptions,
        budgets: Budgets,
        cancel: Cancellation,
    ) -> Result<SearchResult> {
        struct CancelOnDrop(Cancellation, bool);
        impl Drop for CancelOnDrop {
            fn drop(&mut self) {
                if self.1 {
                    self.0.cancel();
                }
            }
        }
        let mut cancel_on_drop = CancelOnDrop(cancel.clone(), true);
        let result = self
            .lane
            .run(move || search_project(&root, &options, &budgets, &cancel))
            .await
            .map_err(Error::Io)?;
        cancel_on_drop.1 = false;
        result
    }
}
#[cfg(test)]
mod tests;
