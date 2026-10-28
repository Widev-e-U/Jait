//! Descriptor-relative filesystem access. No content is executed or interpreted.
use super::{Error, Result, walk::Operation};
use crate::{security::path_guard::PathGuard, services::code_graph::engine::path_join};
use std::{
    fs::{File, Metadata},
    io::{self, Read},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

#[derive(Clone)]
pub struct ProjectRoot {
    path: PathBuf,
    directory: Arc<File>,
    identity: (u64, u64),
}
impl std::fmt::Debug for ProjectRoot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProjectRoot")
            .field("path", &self.path)
            .finish_non_exhaustive()
    }
}
impl ProjectRoot {
    /// The caller must authorize this root. A private path is not authorization.
    /// Use `registered_root_path` at authenticated project entrypoints.
    pub fn open(path: &Path) -> Result<Self> {
        if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err(Error::Input(
                "project root must be absolute without parent components".into(),
            ));
        }
        let text = path
            .to_str()
            .ok_or_else(|| Error::Input("project root must be UTF-8".into()))?;
        let normalized = PathBuf::from(path_join(&[text]));
        if normalized.parent().is_none()
            || std::env::var_os("HOME").is_some_and(|home| Path::new(&home) == normalized)
        {
            return Err(Error::Input(
                "refusing a filesystem or home directory root".into(),
            ));
        }
        PathGuard::new(&normalized, &[], true)?
            .validate(normalized.to_str().unwrap())
            .map_err(|_| Error::Excluded)?;
        let directory = open_absolute_directory(&normalized)?;
        let identity = identity(&directory.metadata()?);
        Ok(Self {
            path: normalized,
            directory: Arc::new(directory),
            identity,
        })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub(crate) fn check_identity(&self) -> Result<()> {
        let current = open_absolute_directory(&self.path)?;
        if identity(&current.metadata()?) != self.identity {
            return Err(Error::RootChanged);
        }
        Ok(())
    }
    pub(crate) fn validate(&self, relative: &str) -> Result<PathBuf> {
        if relative.len() > 4096
            || relative.contains(['\0', '\\'])
            || relative.chars().any(char::is_control)
            || Path::new(relative)
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err(Error::Input("invalid project-relative path".into()));
        }
        // Apply the existing policy at every depth, including nested credential directories.
        let guard = PathGuard::new(&self.path, &[], true)?;
        for component in relative.split('/') {
            guard.validate(component).map_err(|_| Error::Excluded)?;
        }
        guard.validate(relative).map_err(|_| Error::Excluded)
    }
    pub(crate) fn open_directory(&self, relative: &str) -> Result<File> {
        if relative.is_empty() {
            #[cfg(unix)]
            {
                use std::os::fd::{AsRawFd, FromRawFd};
                // A fresh open-file description avoids sharing readdir offsets
                // with the pinned root or a concurrent index operation.
                let fd = unsafe {
                    libc::openat(
                        self.directory.as_raw_fd(),
                        c".".as_ptr(),
                        libc::O_RDONLY | libc::O_CLOEXEC | libc::O_DIRECTORY | libc::O_NOFOLLOW,
                    )
                };
                if fd < 0 {
                    return Err(Error::Io(io::Error::last_os_error()));
                }
                return Ok(unsafe { File::from_raw_fd(fd) });
            }
            #[cfg(not(unix))]
            {
                return Err(Error::Unsupported);
            }
        }
        self.validate(relative)?;
        open_relative(&self.directory, relative, true).map_err(Error::Io)
    }
    pub(crate) fn open_file(&self, relative: &str) -> Result<File> {
        self.validate(relative)?;
        let file = open_relative(&self.directory, relative, false)?;
        if !file.metadata()?.is_file() {
            return Err(Error::Excluded);
        }
        Ok(file)
    }
    pub(crate) fn metadata(&self, relative: &str) -> Result<Metadata> {
        self.validate(relative)?;
        // O_NONBLOCK prevents a replacement FIFO from hanging a reader.
        let file = open_relative(&self.directory, relative, false)?;
        Ok(file.metadata()?)
    }
    pub(crate) fn names(
        &self,
        relative: &str,
        max: usize,
        operation: &Operation,
    ) -> Result<(Vec<String>, bool)> {
        operation.check()?;
        directory_names(self.open_directory(relative)?, max, operation)
    }
    pub(crate) fn read(
        &self,
        relative: &str,
        max: usize,
        expected: Option<(u64, u64)>,
        operation: &Operation,
        read_bytes: &mut usize,
    ) -> Result<Vec<u8>> {
        operation.check()?;
        let mut file = self.open_file(relative)?;
        let before = file.metadata()?;
        if expected.is_some_and(|id| id != identity(&before)) {
            return Err(Error::RootChanged);
        }
        if before.len() > max as u64 {
            return Err(Error::FileTooLarge);
        }
        let mut bytes = Vec::new();
        // Read only the observed size. Growth is rejected by the final metadata
        // check; failed/mutating reads still consume the aggregate byte budget.
        let mut remaining = before.len() as usize;
        let mut buffer = [0u8; 16 * 1024];
        while remaining > 0 {
            operation.check()?;
            let count = remaining.min(buffer.len());
            let size = match file.read(&mut buffer[..count]) {
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                result => result?,
            };
            if size == 0 {
                return Err(Error::RootChanged);
            }
            *read_bytes = read_bytes.saturating_add(size);
            bytes.extend_from_slice(&buffer[..size]);
            remaining -= size;
        }
        operation.check()?;
        let after = file.metadata()?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err(Error::RootChanged);
        }
        Ok(bytes)
    }
}
#[cfg(unix)]
pub(crate) fn identity(metadata: &Metadata) -> (u64, u64) {
    use std::os::unix::fs::MetadataExt;
    (metadata.dev(), metadata.ino())
}
#[cfg(not(unix))]
pub(crate) fn identity(_: &Metadata) -> (u64, u64) {
    (0, 0)
}

#[cfg(unix)]
fn open_absolute_directory(path: &Path) -> io::Result<File> {
    // Start at the filesystem root and refuse links in *every* component.
    let root = File::open("/")?;
    let relative = path.strip_prefix("/").map_err(io::Error::other)?;
    if relative.as_os_str().is_empty() {
        return Ok(root);
    }
    open_relative(
        &root,
        relative
            .to_str()
            .ok_or_else(|| io::Error::other("non UTF-8 path"))?,
        true,
    )
}
#[cfg(not(unix))]
fn open_absolute_directory(_: &Path) -> io::Result<File> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "descriptor-relative project access is not implemented on this platform",
    ))
}
#[cfg(unix)]
fn open_relative(root: &File, relative: &str, directory: bool) -> io::Result<File> {
    use std::{
        ffi::CString,
        os::fd::{AsRawFd, FromRawFd},
    };
    let mut current = root.try_clone()?;
    let components: Vec<_> = Path::new(relative).components().collect();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(name) = component else {
            return Err(io::Error::other("invalid relative path"));
        };
        use std::os::unix::ffi::OsStrExt;
        let name = CString::new(name.as_bytes()).map_err(io::Error::other)?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if directory || index + 1 < components.len() {
                libc::O_DIRECTORY
            } else {
                0
            };
        // SAFETY: current owns a valid fd, name is NUL terminated, result ownership transfers once.
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        current = unsafe { File::from_raw_fd(fd) };
    }
    Ok(current)
}
#[cfg(not(unix))]
fn open_relative(_: &File, _: &str, _: bool) -> io::Result<File> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "descriptor-relative project access unsupported",
    ))
}
#[cfg(unix)]
fn directory_names(
    directory: File,
    max: usize,
    operation: &Operation,
) -> Result<(Vec<String>, bool)> {
    use std::{ffi::CStr, os::fd::IntoRawFd};
    struct Stream(*mut libc::DIR);
    impl Drop for Stream {
        fn drop(&mut self) {
            unsafe {
                libc::closedir(self.0);
            }
        }
    }
    let fd = directory.into_raw_fd();
    // SAFETY: fd is owned; fdopendir consumes it on success only.
    let stream = unsafe { libc::fdopendir(fd) };
    if stream.is_null() {
        unsafe {
            libc::close(fd);
        }
        return Err(Error::Io(io::Error::last_os_error()));
    }
    let stream = Stream(stream);
    let mut names = Vec::new();
    let mut seen = 0;
    let mut skipped = false;
    loop {
        operation.check()?;
        // SAFETY: stream remains live, copy each name before the next readdir call.
        // errno distinguishes end-of-stream from partial I/O failures.
        #[cfg(target_os = "linux")]
        unsafe {
            *libc::__errno_location() = 0;
        }
        let entry = unsafe { libc::readdir(stream.0) };
        if entry.is_null() {
            #[cfg(target_os = "linux")]
            if unsafe { *libc::__errno_location() } != 0 {
                return Err(Error::Io(io::Error::last_os_error()));
            }
            break;
        }
        let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
        if name == b"." || name == b".." {
            continue;
        }
        seen += 1;
        if seen > max {
            return Ok((names, true));
        }
        if let Ok(name) = std::str::from_utf8(name) {
            names.push(name.to_owned());
        } else {
            skipped = true;
        }
    }
    names.sort();
    Ok((names, skipped))
}
#[cfg(not(unix))]
fn directory_names(_: File, _: usize, _: &Operation) -> Result<(Vec<String>, bool)> {
    Err(Error::Unsupported)
}
