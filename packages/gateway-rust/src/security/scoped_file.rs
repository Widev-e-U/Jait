//! Linux directory-anchored file operations for future authorized tool adapters.
//! This module does not grant authority or provide consent, denied-path policy,
//! auditing, backups, or lifecycle. It is not connected to the gateway.
//! Checking link count is not a substitute for isolation from concurrent hard-link
//! creation; callers must establish that separately before enabling writes.
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
        pub fn write_existing(&self, path: &Path, data: &[u8]) -> io::Result<()> {
            let mut file = self.open_file(path, libc::O_WRONLY | libc::O_NONBLOCK, 0)?;
            use std::os::unix::fs::MetadataExt;
            let metadata = file.metadata()?;
            if !metadata.is_file() || metadata.nlink() != 1 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "not a regular file",
                ));
            }
            file.set_len(0)?;
            file.write_all(data)
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
