//! Native filesystem surface. Real filesystem work runs on a bounded blocking
//! lane; callers retain consent and admission policy. PathGuard's existing
//! lexical and final-symlink policy is reused without broadening access.
use super::registry::{
    Surface, SurfaceFactory, SurfaceFuture, SurfaceRef, SurfaceSnapshot, SurfaceStartInput,
    SurfaceState,
};
use crate::{
    runtime::blocking::BlockingLane,
    security::path_guard::{PathError, PathGuard, PathTraversalError},
};
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fmt, fs, io,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};
#[derive(Clone, Debug, PartialEq)]
pub struct FileSystemError {
    pub details: Value,
}
impl FileSystemError {
    pub fn message(message: impl Into<String>) -> Self {
        Self {
            details: json!({"name":"Error","message":message.into()}),
        }
    }
    pub fn thrown(value: Value) -> Self {
        Self {
            details: json!({"thrown":value}),
        }
    }
    pub(crate) fn io(
        error: io::Error,
        syscall: &str,
        path: Option<&Path>,
        dest: Option<&Path>,
    ) -> Self {
        let (code, description) = match error.raw_os_error() {
            Some(libc::ENOENT) => ("ENOENT", "no such file or directory"),
            Some(libc::EACCES) => ("EACCES", "permission denied"),
            Some(libc::EPERM) => ("EPERM", "operation not permitted"),
            Some(libc::ENOTDIR) => ("ENOTDIR", "not a directory"),
            Some(libc::EISDIR) => ("EISDIR", "illegal operation on a directory"),
            Some(libc::EEXIST) => ("EEXIST", "file already exists"),
            Some(libc::ENOTEMPTY) => ("ENOTEMPTY", "directory not empty"),
            Some(libc::ELOOP) => ("ELOOP", "too many symbolic links encountered"),
            Some(libc::ENAMETOOLONG) => ("ENAMETOOLONG", "name too long"),
            Some(libc::ENOSPC) => ("ENOSPC", "no space left on device"),
            Some(libc::EROFS) => ("EROFS", "read-only file system"),
            Some(libc::EXDEV) => ("EXDEV", "cross-device link not permitted"),
            Some(libc::EBUSY) => ("EBUSY", "resource busy or locked"),
            Some(libc::EMFILE) => ("EMFILE", "too many open files"),
            Some(libc::ENFILE) => ("ENFILE", "file table overflow"),
            Some(libc::EIO) => ("EIO", "i/o error"),
            Some(libc::EINVAL) => ("EINVAL", "invalid argument"),
            _ => return Self::message(error.to_string()),
        };
        let mut message = format!("{code}: {description}, {syscall}");
        let mut details = json!({"name":"Error","code":code,"syscall":syscall});
        if let Some(path) = path {
            message.push_str(&format!(" '{}'", path.display()));
            details["path"] = json!(path);
        }
        if let Some(dest) = dest {
            message.push_str(&format!(" -> '{}'", dest.display()));
            details["dest"] = json!(dest);
        }
        details["message"] = json!(message);
        Self { details }
    }
    fn path(error: PathError, target: &str, guard: &PathGuard) -> Self {
        if let Some(error) = error.downcast_ref::<PathTraversalError>() {
            return Self {
                details: json!({"name":"PathTraversalError","message":error.message,"code":"PATH_TRAVERSAL","path":error.path,"boundary":error.boundary}),
            };
        }
        match error.downcast::<io::Error>() {
            Ok(error) => Self::io(
                *error,
                "statx",
                Some(&guard.project_root().join(target)),
                None,
            ),
            Err(error) => Self::message(error.to_string()),
        }
    }
}
impl fmt::Display for FileSystemError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(message) = self.details["message"].as_str() {
            f.write_str(message)
        } else {
            write!(f, "{}", self.details["thrown"])
        }
    }
}
impl std::error::Error for FileSystemError {}
pub type FileSystemResult<T> = Result<T, FileSystemError>;
pub type OutputCallback = Arc<dyn Fn(&str) -> FileSystemResult<()> + Send + Sync>;
pub type StateCallback = Arc<dyn Fn(SurfaceState) -> FileSystemResult<()> + Send + Sync>;
#[derive(Clone)]
pub struct GuardOptions {
    pub project_root: Option<PathBuf>,
    pub denied_paths: Vec<String>,
    pub check_symlinks: bool,
}
impl Default for GuardOptions {
    fn default() -> Self {
        Self {
            project_root: None,
            denied_paths: vec![],
            check_symlinks: true,
        }
    }
}
#[derive(Clone, Debug)]
pub enum FileOperation {
    Read(String),
    ReadBinary(String),
    Write {
        path: String,
        content: String,
    },
    Patch {
        path: String,
        search: String,
        replace: String,
    },
    Exists(String),
    List(String),
    Stat(String),
    Restore(String),
    SaveExternalBackup(String),
    DeleteFile(String),
    DeleteDirectory(String),
    Rename {
        path: String,
        name: String,
    },
    Move {
        path: String,
        directory: String,
    },
    CreateDirectory(String),
    CreateFile {
        path: String,
        content: String,
    },
    Copy {
        source: String,
        destination: String,
    },
}
impl FileOperation {
    fn path(&self) -> &str {
        match self {
            Self::Read(p)
            | Self::ReadBinary(p)
            | Self::Exists(p)
            | Self::List(p)
            | Self::Stat(p)
            | Self::Restore(p)
            | Self::SaveExternalBackup(p)
            | Self::DeleteFile(p)
            | Self::DeleteDirectory(p)
            | Self::CreateDirectory(p) => p,
            Self::Write { path, .. }
            | Self::Patch { path, .. }
            | Self::Rename { path, .. }
            | Self::Move { path, .. }
            | Self::CreateFile { path, .. } => path,
            Self::Copy { source, .. } => source,
        }
    }
}
#[derive(Debug, PartialEq)]
pub enum FileReply {
    Undefined,
    Value(Value),
    Bytes(Vec<u8>),
}
struct State {
    phase: SurfaceState,
    session: Option<String>,
    started: Option<String>,
    panel_open: Option<bool>,
    guard: Option<Arc<PathGuard>>,
    operations: u64,
    backups: HashMap<PathBuf, Option<String>>,
}
impl Default for State {
    fn default() -> Self {
        Self {
            phase: SurfaceState::Idle,
            session: None,
            started: None,
            panel_open: None,
            guard: None,
            operations: 0,
            backups: HashMap::new(),
        }
    }
}
#[derive(Default)]
struct Callbacks {
    output: Option<OutputCallback>,
    state: Option<StateCallback>,
}
#[derive(Clone)]
pub struct FileSystemSurface {
    id: String,
    options: GuardOptions,
    lane: BlockingLane,
    state: Arc<Mutex<State>>,
    callbacks: Arc<Mutex<Callbacks>>,
    clock: Arc<dyn Fn() -> String + Send + Sync>,
}
impl FileSystemSurface {
    pub fn new(id: impl Into<String>, options: GuardOptions, lane: BlockingLane) -> Self {
        Self {
            id: id.into(),
            options,
            lane,
            state: Arc::new(Mutex::new(State::default())),
            callbacks: Arc::new(Mutex::new(Callbacks::default())),
            clock: Arc::new(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        }
    }
    pub fn with_clock(mut self, clock: Arc<dyn Fn() -> String + Send + Sync>) -> Self {
        self.clock = clock;
        self
    }
    pub fn on_output(&self, callback: Option<OutputCallback>) {
        self.callbacks.lock().unwrap().output = callback;
    }
    pub fn on_state_change(&self, callback: Option<StateCallback>) {
        self.callbacks.lock().unwrap().state = callback;
    }
    fn transition(&self, phase: SurfaceState) -> FileSystemResult<()> {
        self.state.lock().unwrap().phase = phase;
        let callback = self.callbacks.lock().unwrap().state.clone();
        if let Some(callback) = callback {
            callback(phase)?;
        }
        Ok(())
    }
    pub async fn start_filesystem(&self, input: SurfaceStartInput) -> FileSystemResult<()> {
        {
            let mut state = self.state.lock().unwrap();
            state.session = Some(input.session_id);
            state.started = Some((self.clock)());
            state.panel_open = input.properties.get("panelOpen").and_then(Value::as_bool);
        }
        let root = self
            .options
            .project_root
            .as_deref()
            .unwrap_or(Path::new(&input.project_root));
        let guard = PathGuard::new(
            root,
            &self.options.denied_paths,
            self.options.check_symlinks,
        )
        .map_err(|e| FileSystemError::message(e.to_string()))?;
        self.state.lock().unwrap().guard = Some(Arc::new(guard));
        self.transition(SurfaceState::Running)
    }
    pub fn stop_filesystem(&self) -> FileSystemResult<()> {
        self.transition(SurfaceState::Stopped)?;
        self.state.lock().unwrap().guard = None;
        Ok(())
    }
    pub fn filesystem_snapshot(&self) -> SurfaceSnapshot {
        let state = self.state.lock().unwrap();
        SurfaceSnapshot{id:self.id.clone(),kind:"filesystem".into(),state:state.phase,session_id:state.session.clone().unwrap_or_default(),started_at:state.started.clone(),metadata:json!({"projectRoot":state.guard.as_ref().map(|g|g.project_root()),"panelOpen":state.panel_open,"operationCount":state.operations}).as_object().unwrap().clone()}
    }
    fn guard(&self) -> FileSystemResult<Arc<PathGuard>> {
        let state = self.state.lock().unwrap();
        if state.phase != SurfaceState::Running {
            return Err(FileSystemError::message(
                "FileSystem surface is not running",
            ));
        }
        state
            .guard
            .clone()
            .ok_or_else(|| FileSystemError::message("FileSystem surface is not running"))
    }
    pub fn is_path_allowed(&self, path: &str) -> bool {
        self.state
            .lock()
            .unwrap()
            .guard
            .as_ref()
            .is_some_and(|g| g.is_allowed(path))
    }
    pub fn backup(&self, path: &str) -> Option<Option<String>> {
        let state = self.state.lock().unwrap();
        let guard = state.guard.as_ref()?;
        let path = guard.validate(path).ok()?;
        state.backups.get(&path).cloned()
    }
    pub fn has_backup(&self, path: &str) -> bool {
        self.backup(path).is_some()
    }
    pub fn clear_backup(&self, path: &str) {
        let mut state = self.state.lock().unwrap();
        if let Some(path) = state.guard.as_ref().and_then(|g| g.validate(path).ok()) {
            state.backups.remove(&path);
        }
    }
    pub async fn execute(&self, operation: FileOperation) -> FileSystemResult<FileReply> {
        let guard = self.guard()?;
        let surface = self.clone();
        self.lane
            .run(move || surface.perform(guard, operation))
            .await
            .map_err(|e| FileSystemError::message(e.to_string()))?
    }
    fn output(&self, make: impl FnOnce(&Path) -> String) -> FileSystemResult<()> {
        let callback = self.callbacks.lock().unwrap().output.clone();
        if let Some(callback) = callback {
            let guard = self.state.lock().unwrap().guard.clone().ok_or_else(|| {
                FileSystemError::message(
                    "null is not an object (evaluating 'this.guard.projectRoot')",
                )
            })?;
            callback(&make(guard.project_root()))?;
        }
        Ok(())
    }
    fn backup_original(&self, path: &Path) {
        if self.state.lock().unwrap().backups.contains_key(path) {
            return;
        }
        let original = fs::read(path)
            .ok()
            .map(|v| String::from_utf8_lossy(&v).into_owned());
        self.state
            .lock()
            .unwrap()
            .backups
            .entry(path.to_path_buf())
            .or_insert(original);
    }
    fn perform(
        &self,
        guard: Arc<PathGuard>,
        operation: FileOperation,
    ) -> FileSystemResult<FileReply> {
        let symlink_check = !matches!(
            &operation,
            FileOperation::Exists(_)
                | FileOperation::List(_)
                | FileOperation::Stat(_)
                | FileOperation::CreateDirectory(_)
        );
        let path = if symlink_check {
            guard.validate_with_symlink_check(operation.path())
        } else {
            guard.validate(operation.path())
        }
        .map_err(|e| FileSystemError::path(e, operation.path(), &guard))?;
        // Validate all paths before incrementing, including the secondary endpoints.
        let destination = match &operation {
            FileOperation::Rename { name, .. } => {
                let joined = join_normalized(path.parent().unwrap_or(Path::new("/")), name);
                Some(
                    guard
                        .validate(&joined.to_string_lossy())
                        .map_err(|e| FileSystemError::path(e, &joined.to_string_lossy(), &guard))?,
                )
            }
            FileOperation::Move { directory, .. } => {
                let dir = guard
                    .validate_with_symlink_check(directory)
                    .map_err(|e| FileSystemError::path(e, directory, &guard))?;
                let dest = dir.join(path.file_name().unwrap_or_default());
                guard
                    .validate(&dest.to_string_lossy())
                    .map_err(|e| FileSystemError::path(e, &dest.to_string_lossy(), &guard))?;
                Some(dest)
            }
            FileOperation::Copy { destination, .. } => Some(
                guard
                    .validate(destination)
                    .map_err(|e| FileSystemError::path(e, destination, &guard))?,
            ),
            _ => None,
        };
        if !matches!(
            &operation,
            FileOperation::Exists(_)
                | FileOperation::Stat(_)
                | FileOperation::Restore(_)
                | FileOperation::SaveExternalBackup(_)
        ) {
            self.state.lock().unwrap().operations += 1;
        }
        match operation {
            FileOperation::Read(_) => {
                let bytes = read_bytes(&path)?;
                let text = String::from_utf8_lossy(&bytes).into_owned();
                self.output(|root| {
                    format!(
                        "read {} ({} bytes)",
                        relative(root, &path),
                        text.encode_utf16().count()
                    )
                })?;
                Ok(FileReply::Value(json!(text)))
            }
            FileOperation::ReadBinary(_) => {
                let bytes = read_bytes(&path)?;
                self.output(|root| {
                    format!(
                        "read binary {} ({} bytes)",
                        relative(root, &path),
                        bytes.len()
                    )
                })?;
                Ok(FileReply::Bytes(bytes))
            }
            FileOperation::Write { content, .. } => {
                self.backup_original(&path);
                make_parent(&path)?;
                write_text(&path, &content)?;
                self.output(|root| {
                    format!(
                        "wrote {} ({} bytes)",
                        relative(root, &path),
                        content.encode_utf16().count()
                    )
                })?;
                Ok(FileReply::Undefined)
            }
            FileOperation::Patch {
                search, replace, ..
            } => {
                let original = String::from_utf8_lossy(&read_bytes(&path)?).into_owned();
                let Some(patched) = replace_first_js(&original, &search, &replace) else {
                    return Ok(FileReply::Value(json!({"matched":false})));
                };
                self.state
                    .lock()
                    .unwrap()
                    .backups
                    .entry(path.clone())
                    .or_insert(Some(original));
                write_text(&path, &patched)?;
                self.output(|root| format!("patched {}", relative(root, &path)))?;
                Ok(FileReply::Value(json!({"matched":true})))
            }
            FileOperation::Exists(_) => Ok(FileReply::Value(json!(fs::metadata(path).is_ok()))),
            FileOperation::List(_) => {
                let entries = fs::read_dir(&path)
                    .map_err(|e| FileSystemError::io(e, "scandir", Some(&path), None))?;
                let mut names = vec![];
                for entry in entries {
                    let entry =
                        entry.map_err(|e| FileSystemError::io(e, "scandir", Some(&path), None))?;
                    let mut name = entry.file_name().to_string_lossy().into_owned();
                    if entry
                        .file_type()
                        .map_err(|e| FileSystemError::io(e, "scandir", Some(&path), None))?
                        .is_dir()
                    {
                        name.push('/');
                    }
                    names.push(name);
                }
                // Preserve filesystem enumeration order, as the source wrapper
                // does. Sorting here changes the observable API on Linux.
                Ok(FileReply::Value(json!(names)))
            }
            FileOperation::Stat(_) => {
                let metadata = metadata(&path)?;
                let modified: DateTime<Utc> = metadata
                    .modified()
                    .map_err(|e| FileSystemError::io(e, "statx", Some(&path), None))?
                    .into();
                Ok(FileReply::Value(
                    json!({"size":metadata.len(),"isDirectory":metadata.is_dir(),"modified":modified.to_rfc3339_opts(SecondsFormat::Millis,true)}),
                ))
            }
            FileOperation::Restore(_) => {
                let backup = self.state.lock().unwrap().backups.get(&path).cloned();
                let Some(backup) = backup else {
                    return Ok(FileReply::Value(json!(false)));
                };
                match backup {
                    None => {
                        let _ = fs::remove_file(&path);
                    }
                    Some(text) => write_text(&path, &text)?,
                }
                self.state.lock().unwrap().backups.remove(&path);
                self.output(|root| format!("restored {}", relative(root, &path)))?;
                Ok(FileReply::Value(json!(true)))
            }
            FileOperation::SaveExternalBackup(_) => {
                self.backup_original(&path);
                Ok(FileReply::Undefined)
            }
            FileOperation::DeleteFile(_) => {
                fs::remove_file(&path)
                    .map_err(|e| FileSystemError::io(e, "unlink", Some(&path), None))?;
                self.output(|root| format!("deleted {}", relative(root, &path)))?;
                Ok(FileReply::Undefined)
            }
            FileOperation::DeleteDirectory(_) => {
                let info = fs::symlink_metadata(&path)
                    .map_err(|e| FileSystemError::io(e, "rm", Some(&path), None))?;
                let result = if info.is_dir() {
                    fs::remove_dir_all(&path)
                } else {
                    fs::remove_file(&path)
                };
                result.map_err(|e| FileSystemError::io(e, "rm", Some(&path), None))?;
                self.output(|root| format!("deleted directory {}", relative(root, &path)))?;
                Ok(FileReply::Undefined)
            }
            FileOperation::Rename { .. } | FileOperation::Move { .. } => {
                let dest = destination.unwrap();
                let is_move = matches!(operation, FileOperation::Move { .. });
                if is_move {
                    make_parent(&dest)?;
                }
                fs::rename(&path, &dest)
                    .map_err(|e| FileSystemError::io(e, "rename", Some(&path), Some(&dest)))?;
                self.output(|root| {
                    format!(
                        "{} {} → {}",
                        if is_move { "moved" } else { "renamed" },
                        relative(root, &path),
                        relative(root, &dest)
                    )
                })?;
                Ok(FileReply::Value(json!(dest)))
            }
            FileOperation::CreateDirectory(_) => {
                mkdir(&path)?;
                self.output(|root| format!("created directory {}", relative(root, &path)))?;
                Ok(FileReply::Undefined)
            }
            FileOperation::CreateFile { content, .. } => {
                make_parent(&path)?;
                write_text(&path, &content)?;
                self.output(|root| format!("created {}", relative(root, &path)))?;
                Ok(FileReply::Undefined)
            }
            FileOperation::Copy { .. } => {
                let dest = destination.unwrap();
                make_parent(&dest)?;
                let info = metadata(&path)?;
                if info.is_dir() {
                    let src = fs::canonicalize(&path)
                        .map_err(|e| FileSystemError::io(e, "realpath", Some(&path), None))?;
                    let real_dest = match fs::canonicalize(&dest) {
                        Ok(p) => p,
                        Err(e) if e.kind() == io::ErrorKind::NotFound => {
                            let parent = dest.parent().unwrap();
                            fs::canonicalize(parent)
                                .map_err(|e| {
                                    FileSystemError::io(e, "realpath", Some(parent), None)
                                })?
                                .join(dest.file_name().unwrap_or_default())
                        }
                        Err(e) => {
                            return Err(FileSystemError::io(e, "realpath", Some(&dest), None));
                        }
                    };
                    if real_dest.starts_with(src) {
                        return Err(FileSystemError::message(
                            "Cannot copy a directory into itself or its descendants.",
                        ));
                    }
                }
                copy(&path, &dest)?;
                self.output(|root| {
                    format!(
                        "copied {} → {}",
                        relative(root, &path),
                        relative(root, &dest)
                    )
                })?;
                Ok(FileReply::Undefined)
            }
        }
    }
}
fn join_normalized(root: &Path, target: &str) -> PathBuf {
    let path = PathBuf::from(format!("{}/{}", root.display(), target));
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}
fn relative(root: &Path, path: &Path) -> String {
    let a = root.components().collect::<Vec<_>>();
    let b = path.components().collect::<Vec<_>>();
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut result = PathBuf::new();
    for _ in common..a.len() {
        result.push("..");
    }
    for c in &b[common..] {
        result.push(c.as_os_str());
    }
    result.to_string_lossy().into_owned()
}
fn read_bytes(path: &Path) -> FileSystemResult<Vec<u8>> {
    fs::read(path).map_err(|e| {
        let directory = e.raw_os_error() == Some(libc::EISDIR);
        FileSystemError::io(
            e,
            if directory { "read" } else { "open" },
            if directory { None } else { Some(path) },
            None,
        )
    })
}
fn write_text(path: &Path, text: &str) -> FileSystemResult<()> {
    fs::write(path, text).map_err(|e| FileSystemError::io(e, "open", Some(path), None))
}
fn metadata(path: &Path) -> FileSystemResult<fs::Metadata> {
    fs::metadata(path).map_err(|e| FileSystemError::io(e, "statx", Some(path), None))
}
fn mkdir(path: &Path) -> FileSystemResult<()> {
    fs::create_dir_all(path).map_err(|e| FileSystemError::io(e, "mkdir", Some(path), None))
}
fn make_parent(path: &Path) -> FileSystemResult<()> {
    mkdir(path.parent().unwrap_or(Path::new("/")))
}
fn copy(src: &Path, dest: &Path) -> FileSystemResult<()> {
    let info =
        fs::symlink_metadata(src).map_err(|e| FileSystemError::io(e, "lstat", Some(src), None))?;
    if info.file_type().is_symlink() {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(src, dest)
                .map_err(|e| FileSystemError::io(e, "symlink", Some(src), Some(dest)))?;
        }
        #[cfg(not(unix))]
        {
            return Err(FileSystemError::message(
                "native symlink copying requires a platform adapter",
            ));
        }
        return Ok(());
    }
    if info.is_dir() {
        mkdir(dest)?;
        for child in
            fs::read_dir(src).map_err(|e| FileSystemError::io(e, "scandir", Some(src), None))?
        {
            let child = child.map_err(|e| FileSystemError::io(e, "scandir", Some(src), None))?;
            copy(&child.path(), &dest.join(child.file_name()))?;
        }
        return Ok(());
    }
    // Bun's cp preserves a regular file copied onto the same inode (including
    // a destination symlink/hard link). Avoid truncating it through std::fs::copy.
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Ok(other) = fs::metadata(dest)
            && info.dev() == other.dev()
            && info.ino() == other.ino()
        {
            return Ok(());
        }
    }
    fs::copy(src, dest).map_err(|e| FileSystemError::io(e, "open", Some(dest), None))?;
    Ok(())
}
// Source-free DeepSeek helper, reviewed against the actual JS wrapper. Its
// generated empty-search expected value was wrong; differential tests use JS.
pub(crate) fn replace_first_js(text: &str, search: &str, replacement: &str) -> Option<String> {
    let pos = text.find(search)?;
    let prefix = &text[..pos];
    let matched = &text[pos..pos + search.len()];
    let suffix = &text[pos + search.len()..];
    let mut out = String::with_capacity(text.len() + replacement.len());
    out.push_str(prefix);
    let mut chars = replacement.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '$' {
            out.push(c);
            continue;
        }
        match chars.peek().copied() {
            Some('$') => {
                chars.next();
                out.push('$');
            }
            Some('&') => {
                chars.next();
                out.push_str(matched);
            }
            Some('`') => {
                chars.next();
                out.push_str(prefix);
            }
            Some('\'') => {
                chars.next();
                out.push_str(suffix);
            }
            _ => out.push('$'),
        }
    }
    out.push_str(suffix);
    Some(out)
}
impl Surface for FileSystemSurface {
    fn id(&self) -> &str {
        &self.id
    }
    fn kind(&self) -> &str {
        "filesystem"
    }
    fn state(&self) -> SurfaceState {
        self.state.lock().unwrap().phase
    }
    fn session_id(&self) -> Option<String> {
        self.state.lock().unwrap().session.clone()
    }
    fn start(&self, input: SurfaceStartInput) -> SurfaceFuture<'_, ()> {
        Box::pin(async move {
            self.start_filesystem(input)
                .await
                .map_err(|e| e.to_string())
        })
    }
    fn stop(&self, _reason: Option<String>) -> SurfaceFuture<'_, ()> {
        Box::pin(async move { self.stop_filesystem().map_err(|e| e.to_string()) })
    }
    fn snapshot(&self) -> Result<SurfaceSnapshot, String> {
        Ok(self.filesystem_snapshot())
    }
}
#[derive(Clone)]
pub struct FileSystemSurfaceFactory {
    options: GuardOptions,
    lane: BlockingLane,
}
impl FileSystemSurfaceFactory {
    pub fn new(options: GuardOptions, lane: BlockingLane) -> Self {
        Self { options, lane }
    }
    pub fn create_filesystem(&self, id: &str) -> FileSystemSurface {
        FileSystemSurface::new(id, self.options.clone(), self.lane.clone())
    }
}
impl SurfaceFactory for FileSystemSurfaceFactory {
    fn kind(&self) -> &str {
        "filesystem"
    }
    fn create(&self, id: &str) -> Result<SurfaceRef, String> {
        Ok(Arc::new(self.create_filesystem(id)))
    }
}
