//! Durable cleanup leases for isolated evaluations (Linux/Unix).
//!
//! This module records *cleanup intent*, not evaluation results or authority to
//! execute effects. The caller supplies a private parent directory capability and
//! a unique, non-secret record name. Create and sync the lease before creating
//! resources or starting a child; retain it until all descendants, database work
//! and filesystem cleanup have stopped. Recovery must acquire the same lease and
//! perform that same supervised cleanup before calling `complete`.
//!
//! Records are deliberately never unlinked: removing a locked inode would let a
//! second opener acquire a different lock for the same name. Retention/garbage
//! collection requires an independent, externally exclusive protocol.
use std::{
    ffi::CString,
    fs::File,
    io::{self, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{FileExt, MetadataExt},
    },
};

const PENDING: &[u8] = b"jait-evaluation-cleanup-v1\npending\n";
const COMPLETE: &[u8] = b"complete\n";
const MAX_RECORD: u64 = 512;
const BOUND_PREFIX: &[u8] = b"jait-evaluation-cleanup-v2\npending\nresource ";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryState {
    Pending,
    Complete,
}

/// An exclusive, process-held lease. Dropping it releases the lock, but never
/// declares cleanup complete. Blocking filesystem operations belong on a bounded
/// blocking lane; cancellation of a wait must not abandon an in-flight cleanup.
pub struct RecoveryLease {
    file: File,
    state: RecoveryState,
    resource_name: Option<String>,
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn name(name: &str) -> io::Result<CString> {
    if name.is_empty()
        || name.len() > 128
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(invalid("invalid recovery record name"));
    }
    CString::new(name).map_err(|_| invalid("invalid recovery record name"))
}
fn validate_parent(parent: &File) -> io::Result<()> {
    let m = parent.metadata()?;
    if !m.is_dir() || m.uid() != unsafe { libc::geteuid() } || m.mode() & 0o7777 != 0o700 {
        return Err(invalid("recovery parent is not private"));
    }
    Ok(())
}
fn validate_file(file: &File) -> io::Result<()> {
    let m = file.metadata()?;
    if !m.is_file()
        || m.uid() != unsafe { libc::geteuid() }
        || m.mode() & 0o7777 != 0o600
        || m.nlink() != 1
        || m.len() > MAX_RECORD
    {
        return Err(invalid("recovery record is not private or is oversized"));
    }
    Ok(())
}
fn open(parent: &File, record_name: &str, create: bool) -> io::Result<File> {
    validate_parent(parent)?;
    let record_name = name(record_name)?;
    let flags = libc::O_RDWR
        | libc::O_CLOEXEC
        | libc::O_NOFOLLOW
        | libc::O_NONBLOCK
        | if create {
            libc::O_CREAT | libc::O_EXCL
        } else {
            0
        };
    let fd = unsafe { libc::openat(parent.as_raw_fd(), record_name.as_ptr(), flags, 0o600) };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    let file = unsafe { File::from_raw_fd(fd) };
    validate_file(&file)?;
    lock_and_validate(&file)?;
    validate_named_record(parent, &record_name, &file)?;
    Ok(file)
}

// Metadata can change between opening the record and acquiring its lock. Check
// it again while holding the lock; this does not exclude uncooperative same-UID
// writers and is not by itself authority to clean up a recovered operation.
fn lock_and_validate(file: &File) -> io::Result<()> {
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(io::Error::last_os_error());
    }
    validate_file(file)
}
// A lock on a renamed inode is not a lock on the current record name. This
// point-in-time comparison detects a replacement before acquisition; it cannot
// prevent later mutation by a process with write access to the parent directory.
fn validate_named_record(parent: &File, record_name: &CString, file: &File) -> io::Result<()> {
    validate_parent(parent)?;
    let mut entry = std::mem::MaybeUninit::<libc::stat>::uninit();
    // SAFETY: the descriptor and C string remain valid, and fstatat initializes
    // the output on success without following a final symlink.
    if unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            record_name.as_ptr(),
            entry.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: fstatat succeeded.
    let entry = unsafe { entry.assume_init() };
    let held = file.metadata()?;
    if entry.st_mode & libc::S_IFMT != libc::S_IFREG
        || entry.st_dev != held.dev()
        || entry.st_ino != held.ino()
    {
        return Err(invalid("recovery record name changed during acquisition"));
    }
    Ok(())
}
fn read_record(file: &File) -> io::Result<Vec<u8>> {
    let mut bytes = vec![0; MAX_RECORD as usize + 1];
    let mut used = 0;
    while used < bytes.len() {
        match file.read_at(&mut bytes[used..], used as u64) {
            Ok(0) => break,
            Ok(n) => used += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    if used as u64 > MAX_RECORD {
        return Err(invalid("recovery record is oversized"));
    }
    bytes.truncate(used);
    Ok(bytes)
}
fn bound_pending(resource: &str) -> Vec<u8> {
    [BOUND_PREFIX, resource.as_bytes(), b"\n"].concat()
}

fn parse_record(bytes: &[u8]) -> io::Result<(RecoveryState, Option<String>)> {
    if bytes == PENDING {
        return Ok((RecoveryState::Pending, None));
    }
    if bytes == [PENDING, COMPLETE].concat() {
        return Ok((RecoveryState::Complete, None));
    }
    let rest = bytes
        .strip_prefix(BOUND_PREFIX)
        .ok_or_else(|| invalid("incomplete or corrupt recovery record"))?;
    let newline = rest
        .iter()
        .position(|byte| *byte == b'\n')
        .ok_or_else(|| invalid("incomplete or corrupt recovery record"))?;
    let resource = std::str::from_utf8(&rest[..newline])
        .map_err(|_| invalid("invalid recovery resource name"))?;
    name(resource)?;
    let state = match &rest[newline + 1..] {
        b"" => RecoveryState::Pending,
        COMPLETE => RecoveryState::Complete,
        _ => return Err(invalid("incomplete or corrupt recovery record")),
    };
    Ok((state, Some(resource.to_owned())))
}
impl RecoveryLease {
    /// Establish durable intent before starting any evaluation effects. A failed
    /// creation may leave an empty or partial record; do not start the evaluation.
    pub fn create(parent: &File, record_name: &str) -> io::Result<Self> {
        let mut file = open(parent, record_name, true)?;
        file.write_all(PENDING)?;
        file.sync_all()?;
        parent.sync_all()?;
        Ok(Self {
            file,
            state: RecoveryState::Pending,
            resource_name: None,
        })
    }

    /// Persist the intended direct-child resource name before creating it.
    /// This association is not proof that an entry belongs to this operation;
    /// recovery must independently establish its identity and ownership.
    pub fn create_for(parent: &File, record_name: &str, resource_name: &str) -> io::Result<Self> {
        name(resource_name)?;
        let mut file = open(parent, record_name, true)?;
        let pending = bound_pending(resource_name);
        file.write_all(&pending)?;
        file.sync_all()?;
        parent.sync_all()?;
        Ok(Self {
            file,
            state: RecoveryState::Pending,
            resource_name: Some(resource_name.to_owned()),
        })
    }

    /// Open a known record after restart. A busy lock means another owner may
    /// still have live effects. Corrupt or incomplete records fail closed.
    pub fn recover(parent: &File, record_name: &str) -> io::Result<Self> {
        let file = open(parent, record_name, false)?;
        let bytes = read_record(&file)?;
        let (state, resource_name) = parse_record(&bytes)?;
        Ok(Self {
            file,
            state,
            resource_name,
        })
    }

    /// The recorded direct-child name is a lookup hint, not cleanup authority.
    pub fn resource_name(&self) -> Option<&str> {
        self.resource_name.as_deref()
    }
    /// Duplicate the locked open-file description for an explicitly supervised
    /// child. Transfer before the child can start effects, and retain it in every
    /// process that can outlive its owner. The descriptor is close-on-exec; the
    /// caller must use an explicit secure handoff.
    pub fn duplicate_for_child(&self) -> io::Result<File> {
        validate_file(&self.file)?;
        if self.state != RecoveryState::Pending {
            return Err(invalid("cannot transfer a completed recovery lease"));
        }
        let pending = match &self.resource_name {
            Some(resource) => bound_pending(resource),
            None => PENDING.to_vec(),
        };
        // Positional reads do not disturb the shared open-file offset of any
        // existing duplicate. Bound the read even if the record grows.
        let current = read_record(&self.file)?;
        if current != pending {
            return Err(invalid("incomplete or corrupt recovery record"));
        }
        self.file.try_clone()
    }

    pub fn state(&self) -> RecoveryState {
        self.state
    }

    /// Call only after the child and all effects have terminated and cleanup has
    /// succeeded. Failure leaves the record requiring recovery or investigation.
    pub fn complete(&mut self) -> io::Result<()> {
        validate_file(&self.file)?;
        // A failed previous write can leave a partial suffix; never append to it.
        let current = read_record(&self.file)?;
        let pending = match &self.resource_name {
            Some(resource) => bound_pending(resource),
            None => PENDING.to_vec(),
        };
        if current == [pending.as_slice(), COMPLETE].concat() {
            self.file.sync_all()?;
            self.state = RecoveryState::Complete;
            return Ok(());
        }
        if self.state == RecoveryState::Complete || current != pending {
            return Err(invalid("incomplete or corrupt recovery record"));
        }
        // Duplicated descriptors share an offset; write at the validated end
        // without relying on or changing that shared offset.
        self.file.write_all_at(COMPLETE, pending.len() as u64)?;
        self.file.sync_all()?;
        self.state = RecoveryState::Complete;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
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
            let path = root.join(format!("eval-recovery-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
        fn parent(&self) -> File {
            File::open(&self.0).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }
    #[test]
    fn lease_excludes_live_owner_and_survives_restart() {
        let f = Fixture::new();
        let parent = f.parent();
        let lease = RecoveryLease::create(&parent, "run-1").unwrap();
        assert!(RecoveryLease::recover(&parent, "run-1").is_err());
        let child_lease = lease.duplicate_for_child().unwrap();
        drop(lease);
        assert!(RecoveryLease::recover(&parent, "run-1").is_err());
        drop(child_lease);
        let mut recovered = RecoveryLease::recover(&parent, "run-1").unwrap();
        assert_eq!(recovered.state(), RecoveryState::Pending);
        recovered.complete().unwrap();
        recovered.complete().unwrap();
        drop(recovered);
        assert_eq!(
            RecoveryLease::recover(&parent, "run-1").unwrap().state(),
            RecoveryState::Complete
        );
    }
    #[test]
    fn bound_intent_survives_restart_and_lock_handoff() {
        let f = Fixture::new();
        let parent = f.parent();
        assert!(RecoveryLease::create_for(&parent, "bad", "../outside").is_err());
        let lease = RecoveryLease::create_for(&parent, "lease", "complete").unwrap();
        assert_eq!(lease.resource_name(), Some("complete"));
        let child = lease.duplicate_for_child().unwrap();
        drop(lease);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(child);
        let mut recovered = RecoveryLease::recover(&parent, "lease").unwrap();
        assert_eq!(recovered.resource_name(), Some("complete"));
        recovered.complete().unwrap();
        drop(recovered);
        let recovered = RecoveryLease::recover(&parent, "lease").unwrap();
        assert_eq!(recovered.state(), RecoveryState::Complete);
        assert_eq!(recovered.resource_name(), Some("complete"));
    }
    #[test]
    fn bound_intent_rejects_corruption_and_partial_completion() {
        let f = Fixture::new();
        let parent = f.parent();
        let lease = RecoveryLease::create_for(&parent, "lease", "state-1").unwrap();
        drop(lease);
        fs::OpenOptions::new()
            .append(true)
            .open(f.0.join("lease"))
            .unwrap()
            .write_all(b"comp")
            .unwrap();
        assert_eq!(
            RecoveryLease::recover(&parent, "lease")
                .err()
                .unwrap()
                .kind(),
            io::ErrorKind::InvalidData
        );
    }
    #[test]
    fn malformed_and_partial_records_fail_closed() {
        let f = Fixture::new();
        let parent = f.parent();
        let lease = RecoveryLease::create(&parent, "run").unwrap();
        drop(lease);
        fs::OpenOptions::new()
            .append(true)
            .open(f.0.join("run"))
            .unwrap()
            .write_all(b"comp")
            .unwrap();
        assert_eq!(
            RecoveryLease::recover(&parent, "run").err().unwrap().kind(),
            io::ErrorKind::InvalidData
        );
    }
    #[test]
    fn oversized_record_after_acquisition_cannot_be_completed() {
        let f = Fixture::new();
        let parent = f.parent();
        let mut lease = RecoveryLease::create(&parent, "run").unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(f.0.join("run"))
            .unwrap()
            .write_all(&vec![b'x'; MAX_RECORD as usize + 1])
            .unwrap();
        assert_eq!(
            lease.complete().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(lease.state(), RecoveryState::Pending);
    }
    #[test]
    fn completion_preserves_shared_descriptor_offset() {
        use std::io::{Seek, SeekFrom};

        let f = Fixture::new();
        let parent = f.parent();
        let mut lease = RecoveryLease::create_for(&parent, "lease", "state-1").unwrap();
        let mut child = lease.duplicate_for_child().unwrap();
        child.seek(SeekFrom::Start(1)).unwrap();
        lease.complete().unwrap();
        assert_eq!(child.stream_position().unwrap(), 1);
        assert_eq!(
            fs::read(f.0.join("lease")).unwrap(),
            [bound_pending("state-1").as_slice(), COMPLETE].concat()
        );
    }

    #[test]
    fn child_transfer_requires_unchanged_pending_record() {
        let f = Fixture::new();
        let parent = f.parent();
        let mut lease = RecoveryLease::create_for(&parent, "lease", "state-1").unwrap();
        assert!(lease.duplicate_for_child().is_ok());
        fs::write(f.0.join("lease"), b"corrupt").unwrap();
        assert_eq!(
            lease.duplicate_for_child().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        fs::write(f.0.join("lease"), bound_pending("state-1")).unwrap();
        lease.complete().unwrap();
        assert_eq!(
            lease.duplicate_for_child().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
    }
    #[test]
    fn completed_lease_rechecks_durable_record() {
        let f = Fixture::new();
        let parent = f.parent();
        let mut lease = RecoveryLease::create_for(&parent, "lease", "state-1").unwrap();
        lease.complete().unwrap();
        lease.complete().unwrap();
        fs::write(f.0.join("lease"), bound_pending("state-1")).unwrap();
        assert_eq!(
            lease.complete().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            fs::read(f.0.join("lease")).unwrap(),
            bound_pending("state-1")
        );
    }
    #[test]
    fn replaced_or_nonprivate_lease_cannot_complete_or_transfer() {
        let f = Fixture::new();
        let parent = f.parent();
        let mut lease = RecoveryLease::create_for(&parent, "lease", "state-1").unwrap();
        fs::remove_file(f.0.join("lease")).unwrap();
        let replacement = RecoveryLease::create_for(&parent, "lease", "state-2").unwrap();
        assert_eq!(
            lease.complete().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            lease.duplicate_for_child().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(lease.state(), RecoveryState::Pending);
        assert_eq!(replacement.state(), RecoveryState::Pending);

        let mut other = RecoveryLease::create(&parent, "other").unwrap();
        fs::set_permissions(f.0.join("other"), fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            other.complete().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            other.duplicate_for_child().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(other.state(), RecoveryState::Pending);
    }
    #[test]
    fn lock_rechecks_record_metadata() {
        let f = Fixture::new();
        let path = f.0.join("record");
        fs::write(&path, PENDING).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        validate_file(&file).unwrap();
        fs::remove_file(&path).unwrap();
        assert_eq!(
            lock_and_validate(&file).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
    }

    #[test]
    fn acquisition_rejects_renamed_record_and_replacement() {
        let f = Fixture::new();
        let parent = f.parent();
        let path = f.0.join("record");
        fs::write(&path, PENDING).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&path)
            .unwrap();
        fs::rename(&path, f.0.join("old-record")).unwrap();
        fs::write(&path, PENDING).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        lock_and_validate(&file).unwrap();
        assert_eq!(
            validate_named_record(&parent, &name("record").unwrap(), &file)
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidData
        );
    }

    #[test]
    fn rejects_names_symlinks_and_nonprivate_files() {
        let f = Fixture::new();
        let parent = f.parent();
        assert!(RecoveryLease::create(&parent, "../escape").is_err());
        fs::write(f.0.join("target"), PENDING).unwrap();
        symlink("target", f.0.join("link")).unwrap();
        assert!(RecoveryLease::recover(&parent, "link").is_err());
        assert!(RecoveryLease::recover(&parent, "target").is_err());
        fs::set_permissions(&f.0, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(RecoveryLease::create(&parent, "unsafe").is_err());
    }
}
