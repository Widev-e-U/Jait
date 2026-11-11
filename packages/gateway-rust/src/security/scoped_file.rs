//! Linux directory-anchored file operations for future authorized tool adapters.
//! This module does not grant authority or provide consent, denied-path policy,
//! auditing, backups, or lifecycle. It is not connected to the gateway.
//! Directory relocation by an untrusted concurrent actor is not prevented. Callers
//! must establish directory isolation separately before enabling writes.
//! Replacement uses a fresh inode and preserves only basic permission bits, not
//! ownership, ACLs, extended attributes, or hard-link identity. This is not yet
//! compatible with the TypeScript surface's in-place write behavior.
#[cfg(target_os = "linux")]
mod linux {
    use std::{
        ffi::CString,
        fs::File,
        io::{self, Read, Write},
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::ffi::OsStrExt,
        },
        path::{Component, Path},
    };

    const RESOLVE_NO_MAGICLINKS: u64 = 0x02;
    const RESOLVE_NO_SYMLINKS: u64 = 0x04;
    const RESOLVE_BENEATH: u64 = 0x08;
    #[repr(C)]
    struct OpenHow {
        flags: u64,
        mode: u64,
        resolve: u64,
    }

    /// A project root opened once; path resolution is performed by the kernel.
    pub struct ScopedFileRoot {
        root: File,
    }
    impl ScopedFileRoot {
        pub fn open(root: &Path) -> io::Result<Self> {
            use std::os::unix::fs::OpenOptionsExt;
            let root = std::fs::OpenOptions::new()
                .read(true)
                .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW)
                .open(root)?;
            Ok(Self { root })
        }
        fn open_file(&self, path: &Path, flags: i32, mode: u64) -> io::Result<File> {
            if path.as_os_str().is_empty()
                || !path.components().all(|c| matches!(c, Component::Normal(_)))
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "expected a relative file path",
                ));
            }
            let path = CString::new(path.as_os_str().as_bytes())
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "null byte in path"))?;
            let how = OpenHow {
                flags: (flags | libc::O_CLOEXEC | libc::O_NOFOLLOW) as u64,
                mode,
                resolve: RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_MAGICLINKS,
            };
            // SAFETY: root is a live directory descriptor, path is NUL terminated,
            // and how points to a correctly sized open_how for this syscall.
            let fd = unsafe {
                libc::syscall(
                    libc::SYS_openat2,
                    self.root.as_raw_fd(),
                    path.as_ptr(),
                    &how,
                    std::mem::size_of::<OpenHow>(),
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: successful openat2 returns a new descriptor owned by us.
            Ok(unsafe { File::from_raw_fd(fd as i32) })
        }
        pub fn read(&self, path: &Path) -> io::Result<Vec<u8>> {
            let mut data = Vec::new();
            let file = self.open_file(path, libc::O_RDONLY | libc::O_NONBLOCK, 0)?;
            use std::os::unix::fs::MetadataExt;
            let metadata = file.metadata()?;
            if !metadata.is_file() || metadata.nlink() != 1 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "not a regular file",
                ));
            }
            file.take(1024 * 1024 + 1).read_to_end(&mut data)?;
            if data.len() > 1024 * 1024 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "file exceeds read limit",
                ));
            }
            Ok(data)
        }
        /// Lists a directory beneath the root (`""` or `"."` is the root). Entries are not followed.
        pub fn list_dir(&self, path: &Path) -> io::Result<Vec<(String, bool)>> {
            let directory = if path.as_os_str().is_empty() || path == Path::new(".") {
                self.root.try_clone()?
            } else {
                self.open_file(path, libc::O_RDONLY | libc::O_DIRECTORY, 0)?
            };
            let mut entries = Vec::new();
            for entry in std::fs::read_dir(format!("/proc/self/fd/{}", directory.as_raw_fd()))? {
                let entry = entry?;
                entries.push((
                    entry.file_name().to_string_lossy().into_owned(),
                    entry.file_type()?.is_dir(),
                ));
            }
            entries.sort();
            Ok(entries)
        }
        pub fn write_existing(&self, path: &Path, data: &[u8]) -> io::Result<()> {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            if path.as_os_str().is_empty()
                || !path.components().all(|c| matches!(c, Component::Normal(_)))
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "expected a relative file path",
                ));
            }
            let name = path
                .file_name()
                .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "missing file name"))?;
            let parent = match path.parent() {
                Some(parent) if !parent.as_os_str().is_empty() => {
                    self.open_file(parent, libc::O_RDONLY | libc::O_DIRECTORY, 0)?
                }
                _ => self.root.try_clone()?,
            };
            let original = self.open_file(path, libc::O_RDONLY | libc::O_NONBLOCK, 0)?;
            let metadata = original.metadata()?;
            if !metadata.is_file() || metadata.nlink() != 1 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "not a regular file",
                ));
            }
            let name = CString::new(name.as_bytes())
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "null byte in path"))?;
            let temporary = CString::new(format!(".jait-write-{}", uuid::Uuid::new_v4())).unwrap();
            // Create a fresh inode so a concurrent hard link to the old file can never
            // redirect the write. Rename only after the full contents are written.
            let fd = unsafe {
                libc::openat(
                    parent.as_raw_fd(),
                    temporary.as_ptr(),
                    libc::O_WRONLY
                        | libc::O_CREAT
                        | libc::O_EXCL
                        | libc::O_CLOEXEC
                        | libc::O_NOFOLLOW,
                    0o600,
                )
            };
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            let mut file = unsafe { File::from_raw_fd(fd) };
            let result = (|| {
                file.write_all(data)?;
                file.set_permissions(std::fs::Permissions::from_mode(metadata.mode() & 0o777))?;
                let result = unsafe {
                    libc::renameat(
                        parent.as_raw_fd(),
                        temporary.as_ptr(),
                        parent.as_raw_fd(),
                        name.as_ptr(),
                    )
                };
                if result < 0 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            })();
            if result.is_err() {
                unsafe {
                    libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0);
                }
            }
            result
        }
    }
}
#[cfg(target_os = "linux")]
pub use linux::ScopedFileRoot;

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::symlink, path::Path};
    #[test]
    fn write_replaces_inode_without_modifying_existing_handles() {
        use std::io::Read;
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/scoped-file")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let path = root.join("file");
        fs::write(&path, "before").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        let mut original = fs::File::open(&path).unwrap();
        let inode = original.metadata().unwrap().ino();
        ScopedFileRoot::open(&root)
            .unwrap()
            .write_existing(Path::new("file"), b"after")
            .unwrap();
        let mut old_contents = String::new();
        original.read_to_string(&mut old_contents).unwrap();
        assert_eq!(old_contents, "before");
        assert_ne!(fs::metadata(&path).unwrap().ino(), inode);
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        assert_eq!(fs::read(&path).unwrap(), b"after");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn kernel_anchors_access_and_rejects_symlink_escape() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/scoped-file")
            .join(uuid::Uuid::new_v4().to_string());
        let root = base.join("project");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file"), "before").unwrap();
        fs::write(base.join("outside"), "safe").unwrap();
        symlink(&base, root.join("escape")).unwrap();
        symlink(base.join("outside"), root.join("link")).unwrap();
        fs::hard_link(base.join("outside"), root.join("hardlink")).unwrap();
        let scope = ScopedFileRoot::open(&root).unwrap();
        scope.write_existing(Path::new("file"), b"after").unwrap();
        assert_eq!(scope.read(Path::new("file")).unwrap(), b"after");
        for path in [
            "../outside",
            "escape/outside",
            "link",
            "hardlink",
            "/etc/passwd",
        ] {
            assert!(
                scope.write_existing(Path::new(path), b"bad").is_err(),
                "{path}"
            );
            assert!(scope.read(Path::new(path)).is_err(), "{path}");
        }
        assert_eq!(fs::read(base.join("outside")).unwrap(), b"safe");
        fs::remove_dir_all(base).unwrap();
    }
}
