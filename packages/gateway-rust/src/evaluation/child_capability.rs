//! Child-side ownership of a transferred state directory and recovery lease.
//!
//! This is a building block: the trusted sender must pass a duplicate of its
//! locked recovery lease over a dedicated, supervised socket before effects.
//! A pending record is a lookup hint, not proof of directory identity or lock.
use std::{
    ffi::CString,
    fs::File,
    io,
    os::{
        fd::{AsFd, AsRawFd, BorrowedFd, OwnedFd},
        unix::fs::{FileExt, MetadataExt},
    },
    time::Instant,
};

const BOUND_PREFIX: &[u8] = b"jait-evaluation-cleanup-v2\npending\nresource ";
const MAX_RECORD: usize = 512;

/// Keep this object alive until every child effect has stopped. The descriptor
/// is exposed only as a borrow; trusted code can still duplicate that descriptor.
/// The caller must supervise any effects that can outlive this object, including
/// effects spawned by a factory.
pub struct ChildCapability {
    directory: OwnedFd,
    _lease: OwnedFd,
}

impl ChildCapability {
    /// Attempt one nonblocking receive. WouldBlock leaves the socket available
    /// to retry; malformed packets are consumed and all received FDs closed.
    /// No deadline or process authentication is provided. Metadata reads must run
    /// on a bounded supervised blocking lane, even though socket I/O is nonblocking.
    pub fn try_receive(socket: BorrowedFd<'_>, expected_resource: &str) -> io::Result<Self> {
        if expected_resource.is_empty()
            || expected_resource.len() > 128
            || !expected_resource
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid recovery resource name",
            ));
        }
        let (directory, lease) = super::try_receive_directory_with_lease(socket)?;
        let file = File::from(lease.try_clone()?);
        let mut bytes = [0u8; MAX_RECORD + 1];
        let mut used = 0;
        while used < bytes.len() {
            match file.read_at(&mut bytes[used..], used as u64) {
                Ok(0) => break,
                Ok(count) => used += count,
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
        let expected = [BOUND_PREFIX, expected_resource.as_bytes(), b"\n"].concat();
        if bytes[..used] != expected {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "recovery lease is not pending for resource",
            ));
        }
        Ok(Self {
            directory,
            _lease: lease,
        })
    }

    /// Borrow the state capability; never treat the resource name as authority.
    pub fn directory(&self) -> BorrowedFd<'_> {
        self.directory.as_fd()
    }
}

/// Retain this owner through all child effects, including cancellation. The
/// trusted sender supplies three packets in parent, state, data order. Failure
/// is sticky and preserves acquired descriptors for supervisor-controlled drop.
pub struct ChildHandoff {
    resource: String,
    parts: Vec<ChildCapability>,
    failed: bool,
    complete: bool,
    deadline: Option<Instant>,
}

impl ChildHandoff {
    pub fn new(resource: &str) -> io::Result<Self> {
        if resource.is_empty()
            || resource.len() > 128
            || !resource
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid recovery resource name",
            ));
        }
        Ok(Self {
            resource: resource.into(),
            parts: Vec::with_capacity(3),
            failed: false,
            complete: false,
            deadline: None,
        })
    }

    /// Bound receive attempts using a fixed monotonic deadline. The caller must
    /// supervise effects and retain this owner until they have stopped. Metadata
    /// operations may block and are not bounded by this deadline.
    pub fn new_until(resource: &str, deadline: Instant) -> io::Result<Self> {
        let mut handoff = Self::new(resource)?;
        handoff.deadline = Some(deadline);
        Ok(handoff)
    }

    /// Receive at most one packet; WouldBlock preserves progress. Other errors
    /// are sticky. The caller supplies a deadline and a supervised blocking lane.
    pub fn step(&mut self, socket: BorrowedFd<'_>) -> io::Result<bool> {
        if self.failed {
            return Err(io::Error::other("child handoff failed"));
        }
        if self.complete {
            return Ok(true);
        }
        if self
            .deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            self.failed = true;
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "child handoff deadline expired",
            ));
        }
        let part = match ChildCapability::try_receive(socket, &self.resource) {
            Ok(part) => part,
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Err(error),
            Err(error) => {
                self.failed = true;
                return Err(error);
            }
        };
        self.parts.push(part);
        if self.parts.len() < 3 {
            return Ok(false);
        }
        if let Err(error) = self.validate() {
            self.failed = true;
            return Err(error);
        }
        self.complete = true;
        Ok(true)
    }

    fn validate(&self) -> io::Result<()> {
        let lease = File::from(self.parts[0]._lease.try_clone()?).metadata()?;
        for part in &self.parts[1..] {
            let meta = File::from(part._lease.try_clone()?).metadata()?;
            if meta.dev() != lease.dev() || meta.ino() != lease.ino() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "mismatched recovery lease",
                ));
            }
        }
        let name = CString::new(self.resource.as_str())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid resource"))?;
        verify_entry(self.parts[0].directory(), &name, self.parts[1].directory())?;
        verify_entry(
            self.parts[1].directory(),
            c"data",
            self.parts[2].directory(),
        )
    }

    /// Confirm that all three packets were validated by the trusted peer.
    /// This does not prove host adoption or that effects stopped. The caller
    /// must acknowledge only after successful host adoption and retain this
    /// owner until every effect has stopped. WouldBlock permits retry.
    pub fn acknowledge(&self, socket: BorrowedFd<'_>) -> io::Result<()> {
        if !self.complete || self.failed {
            return Err(io::Error::other("child handoff incomplete"));
        }
        super::try_send_directory_with_lease(
            socket,
            self.parts[2].directory(),
            self.parts[2]._lease.as_fd(),
        )
    }

    /// Borrow descriptors for adoption; retain this owner while effects exist.
    /// Same-inode lease checks do not establish the same open-file description.
    pub fn directories(&self) -> io::Result<(BorrowedFd<'_>, BorrowedFd<'_>, BorrowedFd<'_>)> {
        if !self.complete || self.failed {
            return Err(io::Error::other("child handoff incomplete"));
        }
        Ok((
            self.parts[0].directory(),
            self.parts[1].directory(),
            self.parts[2].directory(),
        ))
    }
}

fn verify_entry(
    parent: BorrowedFd<'_>,
    name: &std::ffi::CStr,
    child: BorrowedFd<'_>,
) -> io::Result<()> {
    let mut entry = std::mem::MaybeUninit::<libc::stat>::uninit();
    if unsafe {
        libc::fstatat(
            parent.as_raw_fd(),
            name.as_ptr(),
            entry.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    } != 0
    {
        return Err(io::Error::last_os_error());
    }
    let entry = unsafe { entry.assume_init() };
    let meta = File::from(child.try_clone_to_owned()?).metadata()?;
    if entry.st_mode & libc::S_IFMT != libc::S_IFDIR
        || entry.st_dev != meta.dev()
        || entry.st_ino != meta.ino()
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "child directory identity mismatch",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::evaluation::{descriptor_transfer, recovery::RecoveryLease};
    use std::{
        fs,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::fs::PermissionsExt,
        },
        path::PathBuf,
    };

    fn pair() -> (OwnedFd, OwnedFd) {
        let mut fds = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    fds.as_mut_ptr(),
                )
            },
            0
        );
        unsafe { (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1])) }
    }
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/child-capability");
            fs::create_dir_all(&root).unwrap();
            let dir = root.join(uuid::Uuid::new_v4().to_string());
            fs::create_dir(&dir).unwrap();
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
            Self(dir)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn handoff_assembly_and_rejection_retain_leases() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        fs::create_dir(fixture.0.join("state")).unwrap();
        fs::set_permissions(fixture.0.join("state"), fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(fixture.0.join("state/data")).unwrap();
        fs::set_permissions(
            fixture.0.join("state/data"),
            fs::Permissions::from_mode(0o700),
        )
        .unwrap();
        let state = File::open(fixture.0.join("state")).unwrap();
        let data = File::open(fixture.0.join("state/data")).unwrap();
        let lease = RecoveryLease::create_for(&parent, "lease", "state").unwrap();
        let child = lease.duplicate_for_child().unwrap();
        let (a, b) = pair();
        let mut good = ChildHandoff::new("state").unwrap();
        let mut bad = ChildHandoff::new("state").unwrap();
        for (index, directory) in [&parent, &state, &data].iter().enumerate() {
            descriptor_transfer::try_send_directory_with_lease(
                a.as_fd(),
                directory.as_fd(),
                child.as_fd(),
            )
            .unwrap();
            assert_eq!(good.step(b.as_fd()).unwrap(), index == 2);
            if index == 0 {
                assert!(good.directories().is_err());
                assert_eq!(
                    good.step(b.as_fd()).unwrap_err().kind(),
                    io::ErrorKind::WouldBlock
                );
            }
        }
        assert!(good.directories().is_ok());
        for (index, directory) in [&parent, &state, &parent].iter().enumerate() {
            descriptor_transfer::try_send_directory_with_lease(
                a.as_fd(),
                directory.as_fd(),
                child.as_fd(),
            )
            .unwrap();
            let result = bad.step(b.as_fd());
            if index == 2 {
                assert!(result.is_err());
            } else {
                assert!(!result.unwrap());
            }
        }
        assert!(bad.directories().is_err());
        assert!(bad.step(b.as_fd()).is_err());
        drop(child);
        drop(lease);
        drop(good);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(bad);
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[test]
    fn child_deadline_retains_partial_lease_and_failure_is_sticky() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let lease = RecoveryLease::create_for(&parent, "lease", "state").unwrap();
        let child_lease = lease.duplicate_for_child().unwrap();
        let (sender, receiver) = pair();
        descriptor_transfer::try_send_directory_with_lease(
            sender.as_fd(),
            parent.as_fd(),
            child_lease.as_fd(),
        )
        .unwrap();
        let mut handoff =
            ChildHandoff::new_until("state", Instant::now() + std::time::Duration::from_secs(60))
                .unwrap();
        assert!(!handoff.step(receiver.as_fd()).unwrap());
        handoff.deadline = Some(Instant::now());
        assert_eq!(
            handoff.step(receiver.as_fd()).unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        assert!(handoff.step(receiver.as_fd()).is_err());
        assert!(handoff.directories().is_err());
        drop(child_lease);
        drop(lease);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(handoff);
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[test]
    fn handoff_rejects_distinct_lease_records_for_same_resource() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        fs::create_dir(fixture.0.join("state")).unwrap();
        fs::set_permissions(fixture.0.join("state"), fs::Permissions::from_mode(0o700)).unwrap();
        fs::create_dir(fixture.0.join("state/data")).unwrap();
        fs::set_permissions(
            fixture.0.join("state/data"),
            fs::Permissions::from_mode(0o700),
        )
        .unwrap();
        let state = File::open(fixture.0.join("state")).unwrap();
        let data = File::open(fixture.0.join("state/data")).unwrap();
        let first = RecoveryLease::create_for(&parent, "lease-a", "state").unwrap();
        let second = RecoveryLease::create_for(&parent, "lease-b", "state").unwrap();
        let first_child = first.duplicate_for_child().unwrap();
        let second_child = second.duplicate_for_child().unwrap();
        let (sender, receiver) = pair();
        let mut handoff = ChildHandoff::new("state").unwrap();
        for (directory, lease) in [
            (&parent, &first_child),
            (&state, &first_child),
            (&data, &second_child),
        ] {
            descriptor_transfer::try_send_directory_with_lease(
                sender.as_fd(),
                directory.as_fd(),
                lease.as_fd(),
            )
            .unwrap();
        }
        assert!(!handoff.step(receiver.as_fd()).unwrap());
        assert!(!handoff.step(receiver.as_fd()).unwrap());
        assert_eq!(
            handoff.step(receiver.as_fd()).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(handoff.directories().is_err());
        assert!(handoff.step(receiver.as_fd()).is_err());
        drop(first_child);
        drop(second_child);
        drop(first);
        drop(second);
        assert!(RecoveryLease::recover(&parent, "lease-a").is_err());
        assert!(RecoveryLease::recover(&parent, "lease-b").is_err());
        drop(handoff);
        assert!(RecoveryLease::recover(&parent, "lease-a").is_ok());
        assert!(RecoveryLease::recover(&parent, "lease-b").is_ok());
    }

    #[test]
    fn child_capability_holds_lease_and_rejects_partial_and_wrong_record() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let lease = RecoveryLease::create_for(&parent, "lease", "state").unwrap();
        let child = lease.duplicate_for_child().unwrap();
        let (a, b) = pair();
        assert!(
            matches!(ChildCapability::try_receive(b.as_fd(), "state"), Err(e) if e.kind() == io::ErrorKind::WouldBlock)
        );
        descriptor_transfer::send_directory(a.as_fd(), parent.as_fd()).unwrap();
        assert!(ChildCapability::try_receive(b.as_fd(), "state").is_err());
        descriptor_transfer::try_send_directory_with_lease(
            a.as_fd(),
            parent.as_fd(),
            child.as_fd(),
        )
        .unwrap();
        assert!(ChildCapability::try_receive(b.as_fd(), "other").is_err());
        descriptor_transfer::try_send_directory_with_lease(
            a.as_fd(),
            parent.as_fd(),
            child.as_fd(),
        )
        .unwrap();
        let held = ChildCapability::try_receive(b.as_fd(), "state").unwrap();
        assert!(held.directory().as_raw_fd() >= 0);
        drop(child);
        drop(lease);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(held);
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }
}
