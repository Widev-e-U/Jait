//! Parent-owned capability for one isolated evaluation (Linux).
//!
//! Declare as a child of `isolated_gateway_child` so directory descriptors stay
//! private to the evaluation implementation. The caller must retain this object
//! through all spawn, transfer, termination and cleanup outcomes.
use super::private_directory::{self, PrivateDirectory};
use crate::evaluation::{descriptor_transfer, recovery::RecoveryLease};
use std::{
    fs::File,
    io,
    os::{
        fd::{AsFd, AsRawFd, OwnedFd},
        unix::fs::MetadataExt,
    },
    time::Instant,
};

/// An operation with durable cleanup intent and, once prepared, directory FDs.
/// Dropping it releases the lock but neither removes state nor marks completion.
/// The caller must keep the lease alive in every process that can outlive it.
pub struct ParentOperation {
    parent: File,
    resource_name: String,
    lease: RecoveryLease,
    directory: Option<PrivateDirectory>,
    creation_attempted: bool,
    prepared: bool,
    handoff: Option<Handoff>,
}

struct Handoff {
    socket: OwnedFd,
    lease: File,
    next: usize,
    failed: bool,
    deadline: Option<Instant>,
    acknowledged: bool,
}

impl ParentOperation {
    /// Persist and sync intent before creating state or starting any effects.
    /// Failure may leave a partial record requiring investigation.
    pub fn begin(parent: File, record_name: &str, resource_name: &str) -> io::Result<Self> {
        let lease = RecoveryLease::create_for(&parent, record_name, resource_name)?;
        Ok(Self {
            parent,
            resource_name: resource_name.to_owned(),
            lease,
            directory: None,
            creation_attempted: false,
            prepared: false,
            handoff: None,
        })
    }

    /// Create state once, retaining its identity even if syncing fails. A failure
    /// before descriptor acquisition is uncertain: keep the pending lease and do
    /// not retry creation or delete an entry by its label without reconciliation.
    pub fn prepare(&mut self) -> io::Result<()> {
        if self.creation_attempted {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "state already prepared",
            ));
        }
        self.creation_attempted = true;
        let directory = private_directory::create_in(&self.parent, &self.resource_name)?;
        self.directory = Some(directory);
        let directory = self.directory.as_ref().expect("directory just stored");
        directory.data.sync_all()?;
        directory.state.sync_all()?;
        self.parent.sync_all()?;
        self.prepared = true;
        Ok(())
    }

    /// Descriptors may be duplicated and explicitly transferred, never recovered
    /// by resolving a display label. This does not grant deletion authority.
    pub fn directories(&self) -> io::Result<(&File, &File, &File)> {
        if !self.prepared {
            return Err(io::Error::other("state preparation not confirmed"));
        }
        let directory = self
            .directory
            .as_ref()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "state not prepared"))?;
        Ok((&self.parent, &directory.state, &directory.data))
    }

    /// Start one handoff on the exclusively owned child socket. The caller must
    /// bind this endpoint to the supervised child and retain the operation until
    /// that child and every effect are confirmed stopped. Successful sends alone
    /// do not confirm adoption. A handoff cannot be replaced after any failure.
    pub fn begin_handoff(&mut self, socket: OwnedFd) -> io::Result<()> {
        if self.handoff.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "handoff already started",
            ));
        }
        if !self.prepared {
            return Err(io::Error::other("state preparation not confirmed"));
        }
        self.directories()?;
        self.handoff = Some(Handoff {
            socket,
            lease: self.lease.duplicate_for_child()?,
            next: 0,
            failed: false,
            deadline: None,
            acknowledged: false,
        });
        Ok(())
    }

    /// Start a handoff with a fixed monotonic deadline. The supervisor must still
    /// stop and confirm every child effect after expiry before releasing ownership.
    /// The deadline bounds attempts, not potentially blocking filesystem metadata.
    pub fn begin_handoff_until(&mut self, socket: OwnedFd, deadline: Instant) -> io::Result<()> {
        self.begin_handoff(socket)?;
        self.handoff
            .as_mut()
            .expect("handoff just started")
            .deadline = Some(deadline);
        Ok(())
    }

    /// Queue at most one atomic nonblocking packet in parent, state, data order.
    /// Each packet also carries the locked lease; a child must retain its first
    /// lease before starting any effect. `WouldBlock` leaves progress unchanged.
    /// Other failures are sticky because child ownership may be uncertain.
    /// Call on a filesystem lane: descriptor validation can perform metadata I/O.
    pub fn handoff_step(&mut self) -> io::Result<bool> {
        let dir = self
            .directory
            .as_ref()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "state not prepared"))?;
        let handoff = self
            .handoff
            .as_mut()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "handoff not started"))?;
        if handoff.failed {
            return Err(io::Error::other("handoff failed; ownership unconfirmed"));
        }
        if handoff.next == 3 {
            return Ok(true);
        }
        if handoff
            .deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            handoff.failed = true;
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "handoff deadline expired; ownership unconfirmed",
            ));
        }
        let directory = match handoff.next {
            0 => &self.parent,
            1 => &dir.state,
            2 => &dir.data,
            _ => return Ok(true),
        };
        match descriptor_transfer::try_send_directory_with_lease(
            handoff.socket.as_fd(),
            directory.as_fd(),
            handoff.lease.as_fd(),
        ) {
            Ok(()) => {
                handoff.next += 1;
                Ok(handoff.next == 3)
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => Err(error),
            Err(error) => {
                handoff.failed = true;
                Err(error)
            }
        }
    }

    /// Receive an acknowledgement from the trusted child after it validated all
    /// capabilities. It does not prove child identity or that effects have ended.
    /// The supervisor must continue to own the lease until all effects stop.
    pub fn acknowledgement_step(&mut self) -> io::Result<bool> {
        let data = &self
            .directory
            .as_ref()
            .ok_or_else(|| io::Error::other("state not prepared"))?
            .data;
        let handoff = self
            .handoff
            .as_mut()
            .ok_or_else(|| io::Error::other("handoff not started"))?;
        if handoff.failed {
            return Err(io::Error::other("handoff failed; ownership unconfirmed"));
        }
        if handoff.acknowledged {
            return Ok(true);
        }
        if handoff.next != 3 {
            return Err(io::Error::other("handoff incomplete"));
        }
        if handoff
            .deadline
            .is_some_and(|deadline| Instant::now() >= deadline)
        {
            handoff.failed = true;
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "acknowledgement deadline expired",
            ));
        }
        let result = (|| {
            let (directory, lease) =
                descriptor_transfer::try_receive_directory_with_lease(handoff.socket.as_fd())?;
            let received_directory = File::from(directory).metadata()?;
            let expected_directory = data.metadata()?;
            let received_lease_file = File::from(lease);
            let received_lease = received_lease_file.metadata()?;
            let expected_lease = handoff.lease.metadata()?;
            if (received_directory.dev(), received_directory.ino())
                != (expected_directory.dev(), expected_directory.ino())
                || (received_lease.dev(), received_lease.ino())
                    != (expected_lease.dev(), expected_lease.ino())
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "acknowledgement capability mismatch",
                ));
            }
            // The parent still holds an exclusive flock. A separately opened
            // descriptor for the same inode conflicts with it, while a duplicate
            // of the locked open-file description can reacquire it nonblocking.
            // This assumes the trusted child does not explicitly unlock the lease.
            if unsafe {
                libc::flock(
                    received_lease_file.as_raw_fd(),
                    libc::LOCK_EX | libc::LOCK_NB,
                )
            } != 0
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "acknowledgement lease does not share the held lock",
                ));
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                handoff.acknowledged = true;
                Ok(true)
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => Err(error),
            Err(error) => {
                handoff.failed = true;
                Err(error)
            }
        }
    }

    /// Duplicate the same locked open-file description for the supervised child.
    pub fn child_lease(&self) -> io::Result<File> {
        self.lease.duplicate_for_child()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::evaluation::recovery::{RecoveryLease, RecoveryState};
    use std::{
        fs,
        os::{
            fd::{AsFd, FromRawFd, OwnedFd},
            unix::fs::{MetadataExt, PermissionsExt},
        },
        path::PathBuf,
    };

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!(
                "eval-parent-operation-{}",
                crate::db::identifiers::uuidv7()
            ));
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
    fn durable_intent_precedes_creation_and_lock_follows_duplicate() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        assert!(!fixture.0.join("state").exists());
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        operation.prepare().unwrap();
        let (_, state, data) = operation.directories().unwrap();
        assert!(state.metadata().unwrap().is_dir() && data.metadata().unwrap().is_dir());
        assert!(operation.prepare().is_err());
        let child = operation.child_lease().unwrap();
        drop(operation);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(child);
        let recovered = RecoveryLease::recover(&fixture.parent(), "lease").unwrap();
        assert_eq!(recovered.state(), RecoveryState::Pending);
        assert_eq!(recovered.resource_name(), Some("state"));
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[test]
    fn unconfirmed_preparation_does_not_expose_directory_capabilities() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        assert!(operation.directories().is_err());
        operation.prepare().unwrap();
        // Model a sync failure after creation: descriptors stay owned for recovery,
        // but must not be handed to code that can start effects.
        operation.prepared = false;
        assert!(operation.directory.is_some());
        assert!(operation.directories().is_err());
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(operation);
        assert_eq!(
            RecoveryLease::recover(&fixture.parent(), "lease")
                .unwrap()
                .state(),
            RecoveryState::Pending
        );
    }

    #[test]
    fn nonblocking_handoff_preserves_order_and_lease_ownership() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let expected: Vec<_> = {
            let (parent, state, data) = operation.directories().unwrap();
            [parent, state, data]
                .iter()
                .map(|f| {
                    let m = f.metadata().unwrap();
                    (m.dev(), m.ino())
                })
                .collect()
        };
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation.begin_handoff(parent).unwrap();
        let mut leases = Vec::new();
        for (index, identity) in expected.iter().enumerate() {
            assert_eq!(operation.handoff_step().unwrap(), index == 2);
            let (directory, lease) =
                descriptor_transfer::try_receive_directory_with_lease(child.as_fd()).unwrap();
            let metadata = File::from(directory).metadata().unwrap();
            assert_eq!((metadata.dev(), metadata.ino()), *identity);
            leases.push(lease);
        }
        assert!(operation.handoff_step().unwrap());
        drop(operation);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(leases);
        assert_eq!(
            RecoveryLease::recover(&fixture.parent(), "lease")
                .unwrap()
                .state(),
            RecoveryState::Pending
        );
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[tokio::test]
    async fn parent_handoff_capabilities_can_be_adopted_without_transferring_cleanup() {
        use crate::evaluation::{
            descriptor_transfer::child_capability::ChildCapability,
            isolated_gateway_child::{
                IsolatedChildHost,
                host::{GatewayFactory, NativeChildHost},
            },
        };
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation.begin_handoff(parent).unwrap();
        let mut caps = Vec::new();
        for index in 0..3 {
            assert_eq!(operation.handoff_step().unwrap(), index == 2);
            caps.push(ChildCapability::try_receive(child.as_fd(), "state").unwrap());
        }
        let file = |index: usize| File::from(caps[index].directory().try_clone_to_owned().unwrap());
        let factory =
            || -> GatewayFactory { Box::new(|_| Box::pin(async { Err("unused factory".into()) })) };
        let (ready, _) = tokio::sync::mpsc::channel(1);
        assert!(
            NativeChildHost::adopt(
                file(0),
                &fixture.0,
                "state",
                file(2),
                file(1),
                "secret".into(),
                factory(),
                ready
            )
            .is_err()
        );
        let (ready, _) = tokio::sync::mpsc::channel(1);
        let mut host = NativeChildHost::adopt(
            file(0),
            &fixture.0,
            "state",
            file(1),
            file(2),
            "secret".into(),
            factory(),
            ready,
        )
        .unwrap();
        host.cancel_cleanup().await.unwrap();
        drop(host);
        assert!(fixture.0.join("state/data").is_dir());
        drop(operation);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(caps);
        assert_eq!(
            RecoveryLease::recover(&fixture.parent(), "lease")
                .unwrap()
                .state(),
            RecoveryState::Pending
        );
    }

    #[test]
    fn validated_child_acknowledgement_preserves_lease() {
        use crate::evaluation::descriptor_transfer::child_capability::ChildHandoff;
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation
            .begin_handoff_until(parent, Instant::now() + std::time::Duration::from_secs(60))
            .unwrap();
        let mut received = ChildHandoff::new("state").unwrap();
        assert!(received.acknowledge(child.as_fd()).is_err());
        assert!(operation.acknowledgement_step().is_err());
        for index in 0..3 {
            assert_eq!(operation.handoff_step().unwrap(), index == 2);
            assert_eq!(received.step(child.as_fd()).unwrap(), index == 2);
        }
        assert_eq!(
            operation.acknowledgement_step().unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        received.acknowledge(child.as_fd()).unwrap();
        assert!(operation.acknowledgement_step().unwrap());
        assert!(operation.acknowledgement_step().unwrap());
        drop(operation);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(received);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_ok());
    }

    #[test]
    fn acknowledgement_rejects_independently_opened_lease() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation.begin_handoff(parent).unwrap();
        for _ in 0..3 {
            operation.handoff_step().unwrap();
        }
        let (_, _, data) = operation.directories().unwrap();
        let reopened = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(fixture.0.join("lease"))
            .unwrap();
        descriptor_transfer::try_send_directory_with_lease(
            child.as_fd(),
            data.as_fd(),
            reopened.as_fd(),
        )
        .unwrap();
        assert_eq!(
            operation.acknowledgement_step().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(operation.acknowledgement_step().is_err());
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
    }

    #[test]
    fn acknowledgement_rejects_wrong_directory_and_is_sticky() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation
            .begin_handoff_until(parent, Instant::now() + std::time::Duration::from_secs(60))
            .unwrap();
        for _ in 0..3 {
            operation.handoff_step().unwrap();
        }
        let (wrong, _, _) = operation.directories().unwrap();
        let lease = operation.child_lease().unwrap();
        descriptor_transfer::try_send_directory_with_lease(
            child.as_fd(),
            wrong.as_fd(),
            lease.as_fd(),
        )
        .unwrap();
        assert_eq!(
            operation.acknowledgement_step().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(operation.acknowledgement_step().is_err());
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
    }

    #[test]
    fn completed_handoff_remains_complete_after_deadline() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let _child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation
            .begin_handoff_until(parent, Instant::now() + std::time::Duration::from_secs(60))
            .unwrap();
        assert!(!operation.handoff_step().unwrap());
        assert!(!operation.handoff_step().unwrap());
        assert!(operation.handoff_step().unwrap());
        operation.handoff.as_mut().unwrap().deadline = Some(Instant::now());
        assert!(operation.handoff_step().unwrap());
    }

    #[test]
    fn expired_handoff_is_sticky_and_keeps_lease() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation
            .begin_handoff_until(parent, Instant::now())
            .unwrap();
        assert_eq!(
            operation.handoff_step().unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        assert!(operation.handoff_step().is_err());
        assert_eq!(
            descriptor_transfer::try_receive_directory_with_lease(child.as_fd())
                .unwrap_err()
                .kind(),
            io::ErrorKind::WouldBlock
        );
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(operation);
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_ok());
    }

    #[test]
    fn handoff_backpressure_retains_progress_for_retry() {
        use std::os::fd::AsRawFd;
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        let size: libc::c_int = 4096;
        assert_eq!(
            unsafe {
                libc::setsockopt(
                    parent.as_raw_fd(),
                    libc::SOL_SOCKET,
                    libc::SO_SNDBUF,
                    (&size as *const libc::c_int).cast(),
                    std::mem::size_of_val(&size) as libc::socklen_t,
                )
            },
            0
        );
        let lease = operation.child_lease().unwrap();
        let (dir, _, _) = operation.directories().unwrap();
        let mut filled = 0;
        loop {
            match descriptor_transfer::try_send_directory_with_lease(
                parent.as_fd(),
                dir.as_fd(),
                lease.as_fd(),
            ) {
                Ok(()) => {
                    filled += 1;
                    assert!(filled < 1024);
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => break,
                Err(error) => panic!("unexpected send failure: {error}"),
            }
        }
        operation.begin_handoff(parent).unwrap();
        assert_eq!(
            operation.handoff_step().unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        for _ in 0..filled {
            drop(descriptor_transfer::try_receive_directory_with_lease(child.as_fd()).unwrap());
        }
        assert!(!operation.handoff_step().unwrap());
        let (received, _) =
            descriptor_transfer::try_receive_directory_with_lease(child.as_fd()).unwrap();
        let expected = operation.directories().unwrap().0.metadata().unwrap();
        let actual = File::from(received).metadata().unwrap();
        assert_eq!(
            (actual.dev(), actual.ino()),
            (expected.dev(), expected.ino())
        );
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
    }

    #[test]
    fn handoff_disconnect_is_sticky_and_retains_pending_state() {
        let fixture = Fixture::new();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        operation.prepare().unwrap();
        let mut sockets = [-1; 2];
        assert_eq!(
            unsafe {
                libc::socketpair(
                    libc::AF_UNIX,
                    libc::SOCK_SEQPACKET | libc::SOCK_CLOEXEC,
                    0,
                    sockets.as_mut_ptr(),
                )
            },
            0
        );
        let parent = unsafe { OwnedFd::from_raw_fd(sockets[0]) };
        let child = unsafe { OwnedFd::from_raw_fd(sockets[1]) };
        operation.begin_handoff(parent).unwrap();
        drop(child);
        assert!(operation.handoff_step().is_err());
        assert!(
            operation
                .handoff_step()
                .unwrap_err()
                .to_string()
                .contains("ownership unconfirmed")
        );
        assert!(RecoveryLease::recover(&fixture.parent(), "lease").is_err());
        drop(operation);
        assert_eq!(
            RecoveryLease::recover(&fixture.parent(), "lease")
                .unwrap()
                .state(),
            RecoveryState::Pending
        );
        assert!(fixture.0.join("state/data").is_dir());
    }

    #[test]
    fn collision_leaves_unowned_entry_and_pending_lease() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.0.join("state")).unwrap();
        let mut operation = ParentOperation::begin(fixture.parent(), "lease", "state").unwrap();
        assert!(operation.prepare().is_err());
        assert!(operation.directories().is_err());
        fs::remove_dir(fixture.0.join("state")).unwrap();
        assert!(operation.prepare().is_err());
        assert!(!fixture.0.join("state").exists());
        drop(operation);
        assert_eq!(
            RecoveryLease::recover(&fixture.parent(), "lease")
                .unwrap()
                .state(),
            RecoveryState::Pending
        );
    }
}
