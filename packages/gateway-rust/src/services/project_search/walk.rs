use super::{
    Cancellation, Error, ProjectRoot, Result,
    filesystem::identity,
    ignore::{self, IgnoreScope},
};
use serde::Serialize;
use std::{
    collections::{BTreeMap, VecDeque},
    sync::Arc,
    time::{Duration, Instant, SystemTime},
};

#[derive(Clone, Debug)]
pub struct Budgets {
    pub max_directories: usize,
    pub max_files: usize,
    pub max_entries: usize,
    pub max_path_bytes: usize,
    pub max_file_bytes: usize,
    pub max_read_bytes: usize,
    pub max_output_bytes: usize,
    pub duration: Duration,
}
impl Default for Budgets {
    fn default() -> Self {
        Self {
            max_directories: 2000,
            max_files: 10000,
            max_entries: 12000,
            max_path_bytes: 8 * 1024 * 1024,
            max_file_bytes: 2 * 1024 * 1024,
            max_read_bytes: 16 * 1024 * 1024,
            max_output_bytes: 8 * 1024 * 1024,
            duration: Duration::from_secs(20),
        }
    }
}
impl Budgets {
    pub fn validate(&self) -> Result<()> {
        let cap = Self::default();
        if self.max_directories == 0
            || self.max_directories > cap.max_directories
            || self.max_files == 0
            || self.max_files > cap.max_files
            || self.max_entries == 0
            || self.max_entries > cap.max_entries
            || self.max_path_bytes == 0
            || self.max_path_bytes > cap.max_path_bytes
            || self.max_file_bytes == 0
            || self.max_file_bytes > cap.max_file_bytes
            || self.max_read_bytes == 0
            || self.max_read_bytes > cap.max_read_bytes
            || self.max_output_bytes < 128
            || self.max_output_bytes > cap.max_output_bytes
            || self.duration.is_zero()
            || self.duration > cap.duration
        {
            return Err(Error::Input(
                "project budgets must be positive and at or below hard caps".into(),
            ));
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Default)]
pub struct IndexOptions {
    pub include_ignored_files: bool,
    /// Compiled once per scan, bounded in both count and source length.
    pub exclude: Vec<String>,
    pub budgets: Budgets,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IndexEntry {
    pub directory: bool,
    pub bytes: u64,
    pub modified: Option<SystemTime>,
    pub identity: (u64, u64),
}
impl IndexEntry {
    pub(crate) fn from_metadata(metadata: &std::fs::Metadata) -> Self {
        Self {
            directory: metadata.is_dir(),
            bytes: metadata.len(),
            modified: metadata.modified().ok(),
            identity: identity(metadata),
        }
    }
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexCoverage {
    pub files: usize,
    pub directories: usize,
    pub entries_examined: usize,
    pub path_bytes: usize,
    pub ignore_bytes: usize,
    pub ignore_rules: usize,
    pub unreadable: usize,
    pub skipped: usize,
    pub limited: bool,
}
#[derive(Clone, Debug)]
pub struct ProjectIndex {
    pub root: ProjectRoot,
    pub entries: BTreeMap<String, IndexEntry>,
    pub coverage: IndexCoverage,
    pub(crate) include_ignored_files: bool,
}
pub(crate) struct Operation {
    deadline: Instant,
    cancel: Cancellation,
}
impl Operation {
    pub(crate) fn new(duration: Duration, cancel: &Cancellation) -> Self {
        Self {
            deadline: Instant::now() + duration,
            cancel: cancel.clone(),
        }
    }
    pub(crate) fn check(&self) -> Result<()> {
        if self.cancel.is_cancelled() {
            Err(Error::Cancelled)
        } else if Instant::now() >= self.deadline {
            Err(Error::TimedOut)
        } else {
            Ok(())
        }
    }
}
pub fn build_index(
    root: &ProjectRoot,
    options: &IndexOptions,
    cancel: &Cancellation,
) -> Result<ProjectIndex> {
    options.budgets.validate()?;
    scan(
        root,
        options,
        &Operation::new(options.budgets.duration, cancel),
        false,
    )
}
pub(crate) fn scan(
    root: &ProjectRoot,
    options: &IndexOptions,
    operation: &Operation,
    skip_hidden: bool,
) -> Result<ProjectIndex> {
    operation.check()?;
    root.check_identity()?;
    if options.exclude.len() > 128 {
        return Err(Error::Input("too many exclusion globs".into()));
    }
    let excludes = options
        .exclude
        .iter()
        .map(|p| ignore::glob(p, false, false))
        .collect::<Result<Vec<_>>>()?;
    let mut coverage = IndexCoverage::default();
    let mut entries = BTreeMap::new();
    let mut queue = VecDeque::from([(String::new(), Arc::new(Vec::<IgnoreScope>::new()))]);
    let mut discovered_directories = 1;
    while let Some((directory, inherited)) = queue.pop_front() {
        operation.check()?;
        coverage.directories += 1;
        let mut scopes = (*inherited).clone();
        if !options.include_ignored_files {
            for name in [".gitignore", ".ignore"] {
                let path = if directory.is_empty() {
                    name.to_owned()
                } else {
                    format!("{directory}/{name}")
                };
                let remaining = options
                    .budgets
                    .max_read_bytes
                    .saturating_sub(coverage.ignore_bytes);
                if remaining > 0 {
                    match root.read(
                        &path,
                        remaining.min(64 * 1024),
                        None,
                        operation,
                        &mut coverage.ignore_bytes,
                    ) {
                        Ok(bytes) => {
                            let text = std::str::from_utf8(&bytes).map_err(|_| {
                                Error::Input("project ignore file must be UTF-8".into())
                            })?;
                            let (rules, limited) = ignore::parse(text);
                            coverage.ignore_rules += rules.len();
                            if coverage.ignore_rules > 512 {
                                return Err(Error::Input(
                                    "project ignore rule count exceeds budget".into(),
                                ));
                            }
                            if limited {
                                return Err(Error::Input(
                                    "project ignore rules are invalid or exceed budget".into(),
                                ));
                            }
                            if scopes.iter().map(|s| s.rules.len()).sum::<usize>() + rules.len()
                                <= 256
                            {
                                scopes.push(IgnoreScope {
                                    base: directory.clone(),
                                    higher_priority: name == ".ignore",
                                    rules,
                                });
                            } else {
                                return Err(Error::Input(
                                    "project ignore rules exceed scope budget".into(),
                                ));
                            }
                        }
                        Err(Error::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(error @ (Error::Cancelled | Error::TimedOut)) => return Err(error),
                        Err(_) => {
                            return Err(Error::Input(
                                "project ignore file is unreadable or exceeds budget".into(),
                            ));
                        }
                    }
                } else {
                    return Err(Error::Input("project ignore bytes exceed budget".into()));
                }
            }
        }
        let scopes = Arc::new(scopes);
        let (names, limited) = match root.names(
            &directory,
            options
                .budgets
                .max_entries
                .saturating_sub(coverage.entries_examined),
            operation,
        ) {
            Ok(result) => result,
            Err(error @ (Error::Cancelled | Error::TimedOut)) => return Err(error),
            Err(_) if !directory.is_empty() => {
                coverage.skipped += 1;
                coverage.limited = true;
                continue;
            }
            Err(error) => return Err(error),
        };
        coverage.limited |= limited;
        for name in names {
            operation.check()?;
            coverage.entries_examined += 1;
            if skip_hidden && name.starts_with('.') {
                continue;
            }
            let relative = if directory.is_empty() {
                name
            } else {
                format!("{directory}/{name}")
            };
            if ignore::hard_excluded(&relative) {
                continue;
            }
            if excludes
                .iter()
                .any(|re| re.is_match(&relative) || re.is_match(&format!("{relative}/")))
            {
                continue;
            }
            let metadata = match root.metadata(&relative) {
                Ok(metadata) if metadata.is_dir() || metadata.is_file() => metadata,
                Err(Error::Io(error)) => {
                    coverage.skipped += 1;
                    #[cfg(unix)]
                    let symlink = error.raw_os_error() == Some(libc::ELOOP);
                    #[cfg(not(unix))]
                    let symlink = false;
                    if !symlink {
                        coverage.unreadable += 1;
                        coverage.limited = true;
                    }
                    continue;
                }
                _ => {
                    coverage.skipped += 1;
                    continue;
                }
            };
            let is_directory = metadata.is_dir();
            if !options.include_ignored_files && ignore::ignored(&scopes, &relative, is_directory) {
                continue;
            }
            if coverage.path_bytes + relative.len() > options.budgets.max_path_bytes {
                coverage.limited = true;
                break;
            }
            if is_directory {
                if discovered_directories >= options.budgets.max_directories {
                    coverage.limited = true;
                    continue;
                }
                discovered_directories += 1;
                queue.push_back((relative.clone(), scopes.clone()));
            } else {
                if coverage.files >= options.budgets.max_files {
                    coverage.limited = true;
                    break;
                }
                coverage.files += 1;
            }
            coverage.path_bytes += relative.len();
            entries.insert(relative, IndexEntry::from_metadata(&metadata));
        }
        if coverage.entries_examined >= options.budgets.max_entries
            || coverage.files >= options.budgets.max_files
            || coverage.path_bytes >= options.budgets.max_path_bytes
        {
            coverage.limited = true;
            break;
        }
    }
    operation.check()?;
    root.check_identity()?;
    Ok(ProjectIndex {
        root: root.clone(),
        entries,
        coverage,
        include_ignored_files: options.include_ignored_files,
    })
}
