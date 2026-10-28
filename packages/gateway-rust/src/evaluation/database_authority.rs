//! Linux-only SQLite opening under an already-owned private directory.
//! This is a building block, not a SQL sandbox or an integrated child host.
use super::private_directory::PrivateDirectory;
use rusqlite::{Connection, OpenFlags, ffi};
use std::{
    ffi::{CStr, c_char, c_int},
    fs::File,
    io,
    os::fd::{AsRawFd, FromRawFd},
    os::unix::fs::MetadataExt,
    sync::OnceLock,
};

const VFS_NAME: &CStr = c"jait-evaluation-dirfd-v1";
static VFS: OnceLock<Result<(), String>> = OnceLock::new();

// SQLite's unix VFS normally resolves /proc/self/fd/N to an ambient pathname
// in xFullPathname. Retain this absolute descriptor path so its main file and
// journal/WAL names continue to resolve through the held directory descriptor.
unsafe extern "C" fn full_path(
    _vfs: *mut ffi::sqlite3_vfs,
    input: *const c_char,
    size: c_int,
    output: *mut c_char,
) -> c_int {
    if input.is_null() || output.is_null() || size <= 0 {
        return ffi::SQLITE_CANTOPEN;
    }
    let bytes = unsafe { CStr::from_ptr(input) }.to_bytes_with_nul();
    if !bytes.starts_with(b"/proc/self/fd/") || bytes.len() > size as usize {
        return ffi::SQLITE_CANTOPEN;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), output.cast(), bytes.len());
    }
    ffi::SQLITE_OK
}

fn register_vfs() -> Result<(), String> {
    VFS.get_or_init(|| unsafe {
        if !ffi::sqlite3_vfs_find(VFS_NAME.as_ptr()).is_null() {
            return Err("SQLite VFS name already registered".into());
        }
        let original = ffi::sqlite3_vfs_find(c"unix".as_ptr());
        if original.is_null() {
            return Err("SQLite unix VFS unavailable".into());
        }
        // SQLite retains the registration globally. It is intentionally leaked,
        // and never installed as the default VFS.
        let mut vfs = Box::new(std::ptr::read(original));
        vfs.zName = VFS_NAME.as_ptr();
        vfs.xFullPathname = Some(full_path);
        vfs.pNext = std::ptr::null_mut();
        let raw = Box::into_raw(vfs);
        let rc = ffi::sqlite3_vfs_register(raw, 0);
        if rc != ffi::SQLITE_OK {
            drop(Box::from_raw(raw));
            return Err(format!("SQLite VFS registration failed: {rc}"));
        }
        Ok(())
    })
    .clone()
}

/// Owns the SQLite connection and directory handles for its entire lifetime.
/// Callers must supervise blocking work and must not allow untrusted SQL, ATTACH,
/// extension loading, or pragmas that redirect writes. The parent and all same-UID
/// processes are trusted; this is not a defense against a same-UID adversary.
pub struct EvaluationDatabase {
    connection: Connection,
    _directory: PrivateDirectory,
}

impl EvaluationDatabase {
    /// Atomically creates a fresh database file. Existing files and symlinks are
    /// rejected; SQLite never receives an attacker-selected database pathname.
    pub fn create(directory: PrivateDirectory) -> Result<Self, String> {
        Self::open(directory, true)
    }

    /// Reopen only through a retained private-directory capability after preparation
    /// has closed SQLite. Never creates a missing database or accepts an ambient path.
    pub fn reopen(directory: PrivateDirectory) -> Result<Self, String> {
        Self::open(directory, false)
    }

    fn open(directory: PrivateDirectory, create: bool) -> Result<Self, String> {
        register_vfs()?;
        let meta = directory.data.metadata().map_err(|e| e.to_string())?;
        if !meta.is_dir()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.mode() & 0o777 != 0o700
        {
            return Err("data directory is not private".into());
        }
        let fd = unsafe {
            libc::openat(
                directory.data.as_raw_fd(),
                c"jait.db".as_ptr(),
                libc::O_RDWR
                    | libc::O_NOFOLLOW
                    | libc::O_CLOEXEC
                    | libc::O_NONBLOCK
                    | if create {
                        libc::O_CREAT | libc::O_EXCL
                    } else {
                        0
                    },
                0o600,
            )
        };
        if fd < 0 {
            return Err(io::Error::last_os_error().to_string());
        }
        let file = unsafe { File::from_raw_fd(fd) };
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file()
            || meta.uid() != unsafe { libc::geteuid() }
            || meta.mode() & 0o777 != 0o600
            || meta.nlink() != 1
        {
            return Err("database file is not private".into());
        }
        let path = format!("/proc/self/fd/{}/jait.db", directory.data.as_raw_fd());
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NOFOLLOW;
        let connection = Connection::open_with_flags_and_vfs(path, flags, VFS_NAME)
            .map_err(|e| e.to_string())?;
        connection
            .execute_batch("PRAGMA temp_store=MEMORY;")
            .map_err(|e| e.to_string())?;
        // The directory is private; same-UID mutation is outside the boundary.
        // Keep the checked file open until SQLite has opened its own handle.
        drop(file);
        Ok(Self {
            connection,
            _directory: directory,
        })
    }

    /// The borrow cannot outlive the owner; SQLite closes before directory FDs.
    pub fn connection(&self) -> &Connection {
        &self.connection
    }
}

#[cfg(test)]
mod tests {
    use super::super::private_directory::create_in;
    use super::*;
    use std::{
        fs,
        os::unix::fs::{PermissionsExt, symlink},
        path::PathBuf,
    };
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!("eval-sqlite-{}", crate::db::identifiers::uuidv7()));
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn directory(&self) -> PrivateDirectory {
            create_in(&File::open(&self.0).unwrap(), "state").unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn sqlite_stays_on_held_directory_after_rename_and_replacement() {
        let fixture = Fixture::new();
        let dir = fixture.directory();
        let db = EvaluationDatabase::create(dir).unwrap();
        db.connection()
            .execute_batch("CREATE TABLE sample (value INTEGER); INSERT INTO sample VALUES (1);")
            .unwrap();
        fs::rename(fixture.0.join("state"), fixture.0.join("moved")).unwrap();
        fs::create_dir_all(fixture.0.join("state/data")).unwrap();
        db.connection()
            .execute_batch("PRAGMA journal_mode=WAL; INSERT INTO sample VALUES (2);")
            .unwrap();
        let count: i64 = db
            .connection()
            .query_row("SELECT count(*) FROM sample", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
        assert!(!fixture.0.join("state/data/jait.db").exists());
        drop(db);
        let reopened = Connection::open(fixture.0.join("moved/data/jait.db")).unwrap();
        assert_eq!(
            reopened
                .query_row("SELECT count(*) FROM sample", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn opening_after_directory_replacement_uses_original_handle() {
        let fixture = Fixture::new();
        let dir = fixture.directory();
        fs::rename(fixture.0.join("state"), fixture.0.join("moved")).unwrap();
        fs::create_dir_all(fixture.0.join("state/data")).unwrap();
        let db = EvaluationDatabase::create(dir).unwrap();
        db.connection()
            .execute_batch("CREATE TABLE sample (value INTEGER); INSERT INTO sample VALUES (7);")
            .unwrap();
        assert!(!fixture.0.join("state/data/jait.db").exists());
        drop(db);
        let reopened = Connection::open(fixture.0.join("moved/data/jait.db")).unwrap();
        assert_eq!(
            reopened
                .query_row("SELECT value FROM sample", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            7
        );
    }

    #[test]
    fn rejects_symlink_and_existing_file_without_touching_target() {
        let fixture = Fixture::new();
        let dir = fixture.directory();
        let target = fixture.0.join("target");
        fs::write(&target, b"untouched").unwrap();
        symlink(&target, fixture.0.join("state/data/jait.db")).unwrap();
        assert!(EvaluationDatabase::create(dir).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"untouched");
        fs::remove_file(fixture.0.join("state/data/jait.db")).unwrap();
        fs::write(fixture.0.join("state/data/jait.db"), b"existing").unwrap();
        // Recreate a private directory handle in this module only to exercise collision.
        let dir = PrivateDirectory {
            state: File::open(fixture.0.join("state")).unwrap(),
            data: File::open(fixture.0.join("state/data")).unwrap(),
        };
        assert!(EvaluationDatabase::create(dir).is_err());
        assert_eq!(
            fs::read(fixture.0.join("state/data/jait.db")).unwrap(),
            b"existing"
        );
    }
}
