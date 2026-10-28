//! Descriptor-relative skill storage. PathGuard remains the outer policy;
//! O_NOFOLLOW at every component closes its documented ancestor-symlink gap.
//! Non-Unix effects fail closed until a Windows reparse-point adapter exists.
use std::{io, path::Path};
#[cfg(unix)]
mod native {
    use super::*;
    use std::{
        ffi::{CStr, CString},
        fs::File,
        io::{Read, Write},
        os::fd::{AsRawFd, FromRawFd},
        path::Component,
    };
    pub struct Directory(File);
    fn name(value: &str) -> io::Result<CString> {
        if value.is_empty()
            || value == "."
            || value == ".."
            || value.contains(['/', '\\', ':', '\0'])
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid skill path component",
            ));
        }
        CString::new(value).map_err(io::Error::other)
    }
    fn fd_file(fd: libc::c_int) -> io::Result<File> {
        if fd < 0 {
            Err(io::Error::last_os_error())
        } else {
            // SAFETY: successful open/openat/dup transfers a fresh descriptor.
            Ok(unsafe { File::from_raw_fd(fd) })
        }
    }
    impl Directory {
        pub fn open(path: &Path) -> io::Result<Self> {
            if !path.is_absolute() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Skill root must be absolute",
                ));
            }
            let guard = crate::security::path_guard::PathGuard::new(path, &[], true)?;
            guard
                .validate(".")
                .map_err(|e| io::Error::other(e.to_string()))?;
            // SAFETY: static null-terminated string and valid flags.
            let mut dir = Self(fd_file(unsafe {
                libc::open(
                    c"/".as_ptr(),
                    libc::O_DIRECTORY | libc::O_RDONLY | libc::O_CLOEXEC,
                )
            })?);
            for c in path.components() {
                match c {
                    Component::RootDir => {}
                    Component::Normal(n) => {
                        let n = n
                            .to_str()
                            .ok_or_else(|| io::Error::other("Non-UTF8 skill root"))?;
                        dir = dir.child(n, false)?;
                    }
                    _ => return Err(io::Error::other("Non-normal skill root")),
                }
            }
            Ok(dir)
        }
        pub fn same_as(&self, other: &Self) -> io::Result<bool> {
            use std::os::unix::fs::MetadataExt;
            let a = self.0.metadata()?;
            let b = other.0.metadata()?;
            Ok(a.dev() == b.dev() && a.ino() == b.ino())
        }
        pub fn ensure_owned(&self) -> io::Result<()> {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            let metadata = self.0.metadata()?;
            // SAFETY: geteuid has no arguments or side effects.
            if metadata.uid() != unsafe { libc::geteuid() }
                || metadata.permissions().mode() & 0o022 != 0
            {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Skill storage must be owned by the gateway user and not group/world writable",
                ));
            }
            Ok(())
        }
        pub fn child(&self, child: &str, create: bool) -> io::Result<Self> {
            let n = name(child)?;
            if create {
                // SAFETY: descriptor and C string valid; never follows a link.
                if unsafe { libc::mkdirat(self.0.as_raw_fd(), n.as_ptr(), 0o700) } != 0 {
                    let e = io::Error::last_os_error();
                    if e.kind() != io::ErrorKind::AlreadyExists {
                        return Err(e);
                    }
                }
            }
            // SAFETY: openat is anchored to the retained directory descriptor.
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
                )
            };
            Ok(Self(fd_file(fd)?))
        }
        pub fn create_child(&self, child: &str) -> io::Result<Self> {
            let n = name(child)?;
            // SAFETY: valid descriptor/C string; mkdirat requires a fresh name.
            if unsafe { libc::mkdirat(self.0.as_raw_fd(), n.as_ptr(), 0o700) } != 0 {
                return Err(io::Error::last_os_error());
            }
            self.child(child, false)
        }
        pub fn names(&self, limit: usize) -> io::Result<Vec<String>> {
            // Open a fresh file description: dup would share the readdir offset.
            // SAFETY: retained descriptor and static string are valid.
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    c".".as_ptr(),
                    libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: successful fdopendir takes ownership of this fresh fd.
            let ptr = unsafe { libc::fdopendir(fd) };
            if ptr.is_null() {
                unsafe {
                    libc::close(fd);
                }
                return Err(io::Error::last_os_error());
            }
            struct Entries(*mut libc::DIR);
            impl Drop for Entries {
                fn drop(&mut self) {
                    unsafe {
                        libc::closedir(self.0);
                    }
                }
            }
            let stream = Entries(ptr);
            let mut names = Vec::new();
            loop {
                // SAFETY: stream owns DIR; each entry is consumed before next read.
                #[cfg(target_os = "linux")]
                unsafe {
                    *libc::__errno_location() = 0;
                }
                #[cfg(any(target_os = "macos", target_os = "ios", target_os = "freebsd"))]
                unsafe {
                    *libc::__error() = 0;
                }
                let entry = unsafe { libc::readdir(stream.0) };
                if entry.is_null() {
                    #[cfg(any(
                        target_os = "linux",
                        target_os = "macos",
                        target_os = "ios",
                        target_os = "freebsd"
                    ))]
                    {
                        let error = io::Error::last_os_error();
                        if error.raw_os_error() != Some(0) {
                            return Err(error);
                        }
                    }
                    break;
                }
                let raw = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
                if raw.to_bytes() == b"." || raw.to_bytes() == b".." {
                    continue;
                }
                if names.len() >= limit {
                    return Err(io::Error::other("Skill directory entry budget exceeded"));
                }
                let value = raw
                    .to_str()
                    .map_err(|_| io::Error::other("Non-UTF8 skill filename"))?;
                names.push(value.to_owned());
            }
            names.sort();
            Ok(names)
        }
        pub fn read(&self, child: &str, limit: usize) -> io::Result<Vec<u8>> {
            let n = name(child)?;
            // NONBLOCK prevents FIFO/device open from blocking before file-type check.
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
                )
            };
            let file = fd_file(fd)?;
            if !file.metadata()?.is_file() {
                return Err(io::Error::other("Skill input must be a regular file"));
            }
            let mut out = Vec::new();
            file.take(limit as u64 + 1).read_to_end(&mut out)?;
            if out.len() > limit {
                return Err(io::Error::other("Skill file byte budget exceeded"));
            }
            Ok(out)
        }
        pub fn write_new(&self, child: &str, bytes: &[u8]) -> io::Result<()> {
            self.ensure_owned()?;
            let n = name(child)?;
            let fd = unsafe {
                libc::openat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    libc::O_WRONLY
                        | libc::O_CREAT
                        | libc::O_EXCL
                        | libc::O_CLOEXEC
                        | libc::O_NOFOLLOW,
                    0o600,
                )
            };
            let mut file = fd_file(fd)?;
            file.write_all(bytes)?;
            file.sync_all()
        }
        pub fn exists(&self, child: &str) -> io::Result<bool> {
            let n = name(child)?;
            let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
            if unsafe {
                libc::fstatat(
                    self.0.as_raw_fd(),
                    n.as_ptr(),
                    stat.as_mut_ptr(),
                    libc::AT_SYMLINK_NOFOLLOW,
                )
            } == 0
            {
                return Ok(true);
            }
            let e = io::Error::last_os_error();
            if e.kind() == io::ErrorKind::NotFound {
                Ok(false)
            } else {
                Err(e)
            }
        }
        pub fn rename(
            &self,
            from: &str,
            destination: &Directory,
            to: &str,
            replace: bool,
        ) -> io::Result<()> {
            self.ensure_owned()?;
            destination.ensure_owned()?;
            let from = name(from)?;
            let to = name(to)?;
            #[cfg(target_os = "linux")]
            let rc = unsafe {
                libc::syscall(
                    libc::SYS_renameat2,
                    self.0.as_raw_fd(),
                    from.as_ptr(),
                    destination.0.as_raw_fd(),
                    to.as_ptr(),
                    if replace { 0 } else { libc::RENAME_NOREPLACE },
                )
            };
            #[cfg(not(target_os = "linux"))]
            let rc = {
                if !replace {
                    return Err(io::Error::new(
                        io::ErrorKind::Unsupported,
                        "Atomic no-replace skill publication requires platform adapter",
                    ));
                }
                unsafe {
                    libc::renameat(
                        self.0.as_raw_fd(),
                        from.as_ptr(),
                        destination.0.as_raw_fd(),
                        to.as_ptr(),
                    ) as libc::c_long
                }
            };
            if rc != 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        }
        pub fn remove_file(&self, child: &str) -> io::Result<()> {
            let n = name(child)?;
            if unsafe { libc::unlinkat(self.0.as_raw_fd(), n.as_ptr(), 0) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        }
        pub fn remove_tree(&self, child: &str, budget: &mut usize, depth: usize) -> io::Result<()> {
            if depth > 20 || *budget == 0 {
                return Err(io::Error::other("Skill cleanup budget exceeded"));
            }
            *budget -= 1;
            let dir = self.child(child, false)?;
            dir.ensure_owned()?;
            for n in dir.names(*budget)? {
                if dir.child(&n, false).is_ok() {
                    dir.remove_tree(&n, budget, depth + 1)?;
                } else {
                    if *budget == 0 {
                        return Err(io::Error::other("Skill cleanup budget exceeded"));
                    }
                    *budget -= 1;
                    dir.remove_file(&n)?;
                }
            }
            let n = name(child)?;
            if unsafe { libc::unlinkat(self.0.as_raw_fd(), n.as_ptr(), libc::AT_REMOVEDIR) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        }
    }
}
#[cfg(unix)]
pub(crate) use native::Directory;
#[cfg(not(unix))]
pub(crate) struct Directory;
#[cfg(not(unix))]
impl Directory {
    fn unsupported<T>() -> io::Result<T> {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Secure skill filesystem requires a platform adapter",
        ))
    }
    pub fn open(_: &Path) -> io::Result<Self> {
        Self::unsupported()
    }
    pub fn same_as(&self, _: &Self) -> io::Result<bool> {
        Self::unsupported()
    }
    pub fn ensure_owned(&self) -> io::Result<()> {
        Self::unsupported()
    }
    pub fn child(&self, _: &str, _: bool) -> io::Result<Self> {
        Self::unsupported()
    }
    pub fn create_child(&self, _: &str) -> io::Result<Self> {
        Self::unsupported()
    }
    pub fn names(&self, _: usize) -> io::Result<Vec<String>> {
        Self::unsupported()
    }
    pub fn read(&self, _: &str, _: usize) -> io::Result<Vec<u8>> {
        Self::unsupported()
    }
    pub fn write_new(&self, _: &str, _: &[u8]) -> io::Result<()> {
        Self::unsupported()
    }
    pub fn exists(&self, _: &str) -> io::Result<bool> {
        Self::unsupported()
    }
    pub fn rename(&self, _: &str, _: &Self, _: &str, _: bool) -> io::Result<()> {
        Self::unsupported()
    }
    pub fn remove_file(&self, _: &str) -> io::Result<()> {
        Self::unsupported()
    }
    pub fn remove_tree(&self, _: &str, _: &mut usize, _: usize) -> io::Result<()> {
        Self::unsupported()
    }
}
