//! Candidate Linux desktop-host lock, not wired to a runtime entrypoint.
//!
//! The caller must supply a directory handle already authorized and protected
//! against untrusted writers, retain the returned guard for the entire host
//! lifetime, and supervise cleanup. This lock is advisory and coordinates only
//! participants using this exact protocol. In particular, Node's desktop-host
//! PID-file protocol does not acquire this lock: the two hosts must not be run
//! concurrently until a shared, reviewed authority protocol is implemented.
//!
//! The lock file is never unlinked. Explicit unlock on guard drop and kernel release
//! on process exit provide crash recovery without stale-PID deletion or unlink races.
//! Other platforms fail closed pending equivalent reviewed implementations.
use std::io;

pub struct DesktopHostLock {
    #[cfg(target_os = "linux")]
    _file: std::fs::File,
}

#[cfg(target_os = "linux")]
impl Drop for DesktopHostLock {
    fn drop(&mut self) {
        use std::os::fd::AsRawFd;
        // A concurrent fork can briefly retain the open file description even
        // with CLOEXEC. Release the lock when the owning guard is dropped.
        unsafe { libc::flock(self._file.as_raw_fd(), libc::LOCK_UN) };
    }
}

#[cfg(target_os = "linux")]
pub fn try_acquire(directory: &std::fs::File) -> io::Result<DesktopHostLock> {
    use std::{
        fs::File,
        os::fd::{AsRawFd, FromRawFd},
    };

    // The authorized parent handle pins the directory; O_NOFOLLOW rejects a
    // final symlink. O_NONBLOCK prevents a hostile FIFO from hanging the host.
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            c"desktop-host.native.lock".as_ptr(),
            libc::O_RDWR | libc::O_CREAT | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
            0o600,
        )
    };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    let file = unsafe { File::from_raw_fd(fd) };
    if !file.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Invalid desktop host lock",
        ));
    }
    // The open file description owns the lock; guard drop explicitly releases it.
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(DesktopHostLock { _file: file })
}

#[cfg(not(target_os = "linux"))]
pub fn try_acquire(_directory: &std::fs::File) -> io::Result<DesktopHostLock> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Desktop host locking is unavailable on this platform",
    ))
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn lock_excludes_another_open_and_releases_without_unlinking() {
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/desktop-host-lock-tests");
        std::fs::create_dir_all(&base).unwrap();
        let path = base.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&path).unwrap();
        let directory = std::fs::File::open(&path).unwrap();
        let first = try_acquire(&directory).unwrap();
        assert_eq!(
            try_acquire(&directory).err().unwrap().kind(),
            io::ErrorKind::WouldBlock
        );
        // A forked child may temporarily retain a duplicate of this description.
        let inherited = first._file.try_clone().unwrap();
        drop(first);
        let second = try_acquire(&directory).unwrap();
        drop(inherited);
        drop(second);
        let lock_path = path.join("desktop-host.native.lock");
        assert!(lock_path.exists());
        std::fs::remove_file(&lock_path).unwrap();
        symlink("missing", &lock_path).unwrap();
        assert!(try_acquire(&directory).is_err());
        std::fs::remove_file(&lock_path).unwrap();
        std::fs::remove_dir(&path).unwrap();
    }
}
