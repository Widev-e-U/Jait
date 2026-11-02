//! Linux-only, one-message transfer of a private directory capability.
//!
//! Use a dedicated connected unnamed Unix SOCK_SEQPACKET pair, created by the
//! caller before spawning the child. Both endpoints and same-UID processes are
//! trusted. This does not authenticate a particular process, impose a timeout,
//! or recover a capability after the endpoints or owning processes disappear.
#![cfg(target_os = "linux")]

#[path = "child_capability.rs"]
pub mod child_capability;

use std::{
    fs::File,
    io, mem,
    os::fd::{AsRawFd, BorrowedFd, FromRawFd, OwnedFd},
    os::unix::fs::MetadataExt,
};

const MARKER: u8 = 0x44;
const LEASE_MARKER: u8 = 0x4c;
// Linux accepts at most 253 fds in one SCM_RIGHTS record. A larger aligned
// buffer also leaves room for unexpected ancillary records to be rejected.
const CONTROL_WORDS: usize = 512;

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn validate_directory(fd: BorrowedFd<'_>) -> io::Result<()> {
    // Duplicate to obtain metadata without taking ownership of the caller's fd.
    let duplicate = fd.try_clone_to_owned()?;
    let metadata = File::from(duplicate).metadata()?;
    if !metadata.is_dir()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o7777 != 0o700
    {
        return Err(invalid(
            "directory must be owned by the effective user and mode 0700",
        ));
    }
    Ok(())
}

fn validate_lease(fd: BorrowedFd<'_>) -> io::Result<()> {
    let file = File::from(fd.try_clone_to_owned()?);
    let metadata = file.metadata()?;
    let flags = unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    if !metadata.is_file()
        || metadata.uid() != unsafe { libc::geteuid() }
        || metadata.mode() & 0o7777 != 0o600
        || metadata.nlink() != 1
        || metadata.len() > 512
        || flags & libc::O_ACCMODE != libc::O_RDWR
    {
        return Err(invalid("recovery lease descriptor is not private"));
    }
    Ok(())
}

/// Atomically send a directory and a recovery lease without blocking. The lease
/// must come from `RecoveryLease::duplicate_for_child`; metadata validation does
/// not prove the lock is held or that the record belongs to this directory.
/// A successful send queues both descriptors in one packet. The sender retains
/// both originals until a supervised child acknowledges adoption; a dropped
/// socket or process is not evidence that the child stopped. On WouldBlock,
/// retain the socket and retry; never abandon a blocking background send.
pub fn try_send_directory_with_lease(
    socket: BorrowedFd<'_>,
    directory: BorrowedFd<'_>,
    lease: BorrowedFd<'_>,
) -> io::Result<()> {
    validate_socket(socket)?;
    validate_directory(directory)?;
    validate_lease(lease)?;
    unsafe {
        let mut byte = LEASE_MARKER;
        let mut iov = libc::iovec {
            iov_base: (&mut byte as *mut u8).cast(),
            iov_len: 1,
        };
        let mut control = [0usize; CONTROL_WORDS];
        let mut msg: libc::msghdr = mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = control.as_mut_ptr().cast();
        let bytes = (2 * mem::size_of::<libc::c_int>()) as u32;
        msg.msg_controllen = libc::CMSG_SPACE(bytes) as usize;
        let hdr = libc::CMSG_FIRSTHDR(&msg);
        (*hdr).cmsg_level = libc::SOL_SOCKET;
        (*hdr).cmsg_type = libc::SCM_RIGHTS;
        (*hdr).cmsg_len = libc::CMSG_LEN(bytes) as usize;
        let data = libc::CMSG_DATA(hdr).cast::<libc::c_int>();
        data.write_unaligned(directory.as_raw_fd());
        data.add(1).write_unaligned(lease.as_raw_fd());
        let sent = libc::sendmsg(
            socket.as_raw_fd(),
            &msg,
            libc::MSG_NOSIGNAL | libc::MSG_DONTWAIT,
        );
        if sent < 0 {
            return Err(io::Error::last_os_error());
        }
        if sent != 1 {
            return Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "incomplete descriptor message",
            ));
        }
    }
    Ok(())
}

/// Nonblocking atomic receive. Retain the socket on WouldBlock. Returned FDs
/// are close-on-exec; retaining the lease holds the sender's open-file lock.
/// This validates metadata, not the lock, peer process identity, record contents,
/// or directory association. The caller must establish those before effects.
pub fn try_receive_directory_with_lease(socket: BorrowedFd<'_>) -> io::Result<(OwnedFd, OwnedFd)> {
    let mut fds = receive_message(
        socket,
        CONTROL_WORDS * mem::size_of::<usize>(),
        LEASE_MARKER,
        2,
        libc::MSG_DONTWAIT,
    )?;
    let lease = fds.pop().unwrap();
    let directory = fds.pop().unwrap();
    validate_directory(directory.as_fd())?;
    validate_lease(lease.as_fd())?;
    Ok((directory, lease))
}

fn validate_socket(fd: BorrowedFd<'_>) -> io::Result<()> {
    unsafe {
        let mut ty: libc::c_int = 0;
        let mut len = mem::size_of_val(&ty) as libc::socklen_t;
        if libc::getsockopt(
            fd.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_TYPE,
            (&mut ty as *mut libc::c_int).cast(),
            &mut len,
        ) != 0
        {
            return Err(io::Error::last_os_error());
        }
        if ty != libc::SOCK_SEQPACKET {
            return Err(invalid("expected a Unix SOCK_SEQPACKET socket"));
        }
        for peer in [false, true] {
            let mut addr: libc::sockaddr_un = mem::zeroed();
            let mut size = mem::size_of_val(&addr) as libc::socklen_t;
            let result = if peer {
                libc::getpeername(
                    fd.as_raw_fd(),
                    (&mut addr as *mut libc::sockaddr_un).cast(),
                    &mut size,
                )
            } else {
                libc::getsockname(
                    fd.as_raw_fd(),
                    (&mut addr as *mut libc::sockaddr_un).cast(),
                    &mut size,
                )
            };
            if result != 0 {
                return Err(io::Error::last_os_error());
            }
            if addr.sun_family as libc::c_int != libc::AF_UNIX
                || size as usize != mem::offset_of!(libc::sockaddr_un, sun_path)
            {
                return Err(invalid("expected connected unnamed Unix endpoints"));
            }
        }
        let mut cred: libc::ucred = mem::zeroed();
        let mut size = mem::size_of_val(&cred) as libc::socklen_t;
        if libc::getsockopt(
            fd.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut cred as *mut libc::ucred).cast(),
            &mut size,
        ) != 0
        {
            return Err(io::Error::last_os_error());
        }
        if size as usize != mem::size_of_val(&cred) || cred.uid != libc::geteuid() {
            return Err(invalid("peer has a different effective user"));
        }
    }
    Ok(())
}

/// Send one borrowed directory handle; ownership stays with the caller.
/// The caller must serialize sends on this dedicated socket.
pub fn send_directory(socket: BorrowedFd<'_>, directory: BorrowedFd<'_>) -> io::Result<()> {
    validate_socket(socket)?;
    validate_directory(directory)?;
    unsafe {
        let mut byte = MARKER;
        let mut iov = libc::iovec {
            iov_base: (&mut byte as *mut u8).cast(),
            iov_len: 1,
        };
        let mut control = [0usize; CONTROL_WORDS];
        let mut msg: libc::msghdr = mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = control.as_mut_ptr().cast();
        msg.msg_controllen = libc::CMSG_SPACE(mem::size_of::<libc::c_int>() as u32) as usize;
        let hdr = libc::CMSG_FIRSTHDR(&msg);
        (*hdr).cmsg_level = libc::SOL_SOCKET;
        (*hdr).cmsg_type = libc::SCM_RIGHTS;
        (*hdr).cmsg_len = libc::CMSG_LEN(mem::size_of::<libc::c_int>() as u32) as usize;
        libc::CMSG_DATA(hdr)
            .cast::<libc::c_int>()
            .write_unaligned(directory.as_raw_fd());
        let sent = libc::sendmsg(socket.as_raw_fd(), &msg, libc::MSG_NOSIGNAL);
        if sent < 0 {
            return Err(io::Error::last_os_error());
        }
        if sent != 1 {
            return Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "incomplete descriptor message",
            ));
        }
    }
    Ok(())
}

/// Receive exactly one directory handle, atomically marked close-on-exec.
/// The caller must serialize receives and arrange its own timeout/cancellation.
pub fn receive_directory(socket: BorrowedFd<'_>) -> io::Result<OwnedFd> {
    receive_with_control_size(socket, CONTROL_WORDS * mem::size_of::<usize>())
}

fn receive_with_control_size(socket: BorrowedFd<'_>, control_size: usize) -> io::Result<OwnedFd> {
    let mut fds = receive_message(socket, control_size, MARKER, 1, 0)?;
    let fd = fds.pop().unwrap();
    validate_directory(fd.as_fd())?;
    Ok(fd)
}

fn receive_message(
    socket: BorrowedFd<'_>,
    control_size: usize,
    marker: u8,
    count: usize,
    flags: libc::c_int,
) -> io::Result<Vec<OwnedFd>> {
    validate_socket(socket)?;
    unsafe {
        let mut byte = 0u8;
        let mut iov = libc::iovec {
            iov_base: (&mut byte as *mut u8).cast(),
            iov_len: 1,
        };
        let mut control = [0usize; CONTROL_WORDS];
        let mut msg: libc::msghdr = mem::zeroed();
        msg.msg_iov = &mut iov;
        msg.msg_iovlen = 1;
        msg.msg_control = control.as_mut_ptr().cast();
        msg.msg_controllen = control_size.min(mem::size_of_val(&control));
        let received = libc::recvmsg(socket.as_raw_fd(), &mut msg, libc::MSG_CMSG_CLOEXEC | flags);
        if received < 0 {
            return Err(io::Error::last_os_error());
        }
        // Own every delivered fd immediately, including in rejected messages.
        let mut fds = Vec::new();
        let mut records = 0usize;
        let mut malformed = false;
        let mut hdr = libc::CMSG_FIRSTHDR(&msg);
        while !hdr.is_null() {
            records += 1;
            let length = (*hdr).cmsg_len;
            let base = libc::CMSG_LEN(0) as usize;
            if length < base {
                malformed = true;
                break;
            }
            if (*hdr).cmsg_level == libc::SOL_SOCKET && (*hdr).cmsg_type == libc::SCM_RIGHTS {
                let bytes = length - base;
                if bytes % mem::size_of::<libc::c_int>() != 0 {
                    malformed = true;
                }
                let data = libc::CMSG_DATA(hdr).cast::<libc::c_int>();
                for i in 0..bytes / mem::size_of::<libc::c_int>() {
                    let raw = data.add(i).read_unaligned();
                    if raw < 0 {
                        malformed = true;
                    } else {
                        fds.push(OwnedFd::from_raw_fd(raw));
                    }
                }
            } else {
                malformed = true;
            }
            hdr = libc::CMSG_NXTHDR(&msg, hdr);
        }
        if received != 1
            || byte != marker
            || msg.msg_flags & (libc::MSG_TRUNC | libc::MSG_CTRUNC) != 0
            || malformed
            || records != 1
            || fds.len() != count
        {
            return Err(invalid("invalid or truncated descriptor message"));
        }
        Ok(fds)
    }
}
use std::os::fd::AsFd;

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        os::{
            fd::RawFd,
            unix::{fs::PermissionsExt, process::CommandExt},
        },
        path::PathBuf,
        process::Command,
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
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts");
            fs::create_dir_all(&root).unwrap();
            let path = root.join(format!(
                "descriptor-transfer-{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
            fs::create_dir(&path).unwrap();
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn raw_send(socket: RawFd, bytes: &[u8], fds: &[RawFd]) {
        unsafe {
            let mut iov = libc::iovec {
                iov_base: bytes.as_ptr() as *mut _,
                iov_len: bytes.len(),
            };
            let mut control = [0usize; CONTROL_WORDS];
            let mut msg: libc::msghdr = mem::zeroed();
            msg.msg_iov = &mut iov;
            msg.msg_iovlen = 1;
            if !fds.is_empty() {
                msg.msg_control = control.as_mut_ptr().cast();
                msg.msg_controllen = libc::CMSG_SPACE(mem::size_of_val(fds) as u32) as usize;
                let hdr = libc::CMSG_FIRSTHDR(&msg);
                (*hdr).cmsg_level = libc::SOL_SOCKET;
                (*hdr).cmsg_type = libc::SCM_RIGHTS;
                (*hdr).cmsg_len = libc::CMSG_LEN(mem::size_of_val(fds) as u32) as usize;
                std::ptr::copy_nonoverlapping(fds.as_ptr(), libc::CMSG_DATA(hdr).cast(), fds.len());
            }
            assert_eq!(
                libc::sendmsg(socket, &msg, libc::MSG_NOSIGNAL),
                bytes.len() as isize
            );
        }
    }
    #[test]
    fn directory_and_lease_transfer_is_atomic_and_retains_lock() {
        use crate::evaluation::recovery::RecoveryLease;
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let lease = RecoveryLease::create_for(&parent, "lease", "state").unwrap();
        let child_lease = lease.duplicate_for_child().unwrap();
        let (a, b) = pair();
        assert_eq!(
            try_receive_directory_with_lease(b.as_fd())
                .unwrap_err()
                .kind(),
            io::ErrorKind::WouldBlock
        );
        try_send_directory_with_lease(a.as_fd(), parent.as_fd(), child_lease.as_fd()).unwrap();
        let (received_dir, received_lease) = try_receive_directory_with_lease(b.as_fd()).unwrap();
        assert_eq!(
            File::from(received_dir).metadata().unwrap().ino(),
            parent.metadata().unwrap().ino()
        );
        assert_ne!(
            unsafe { libc::fcntl(received_lease.as_raw_fd(), libc::F_GETFD) } & libc::FD_CLOEXEC,
            0
        );
        drop(child_lease);
        drop(lease);
        assert!(RecoveryLease::recover(&parent, "lease").is_err());
        drop(received_lease);
        assert!(RecoveryLease::recover(&parent, "lease").is_ok());
    }

    #[test]
    fn directory_and_lease_transfer_rejects_wrong_descriptors() {
        let fixture = Fixture::new();
        let parent = File::open(&fixture.0).unwrap();
        let (a, b) = pair();
        assert!(try_send_directory_with_lease(a.as_fd(), parent.as_fd(), parent.as_fd()).is_err());
        raw_send(
            a.as_raw_fd(),
            &[LEASE_MARKER],
            &[parent.as_raw_fd(), parent.as_raw_fd()],
        );
        assert!(try_receive_directory_with_lease(b.as_fd()).is_err());
        raw_send(a.as_raw_fd(), &[LEASE_MARKER], &[parent.as_raw_fd()]);
        assert!(try_receive_directory_with_lease(b.as_fd()).is_err());
    }

    fn fd_count() -> usize {
        fs::read_dir("/proc/self/fd").unwrap().count()
    }

    #[test]
    fn child_receiver() {
        if std::env::var_os("JAIT_DESCRIPTOR_CHILD").is_none() {
            return;
        }
        let socket = unsafe { OwnedFd::from_raw_fd(198) };
        let fd = receive_directory(socket.as_fd()).unwrap();
        assert_ne!(
            unsafe { libc::fcntl(fd.as_raw_fd(), libc::F_GETFD) } & libc::FD_CLOEXEC,
            0
        );
        let name = std::ffi::CString::new("child-created").unwrap();
        let created = unsafe {
            libc::openat(
                fd.as_raw_fd(),
                name.as_ptr(),
                libc::O_CREAT | libc::O_EXCL | libc::O_WRONLY | libc::O_CLOEXEC,
                0o600,
            )
        };
        assert!(created >= 0);
        drop(unsafe { OwnedFd::from_raw_fd(created) });
    }

    #[test]
    fn subprocess_transfer_retains_renamed_authority_and_cloexec() {
        let fixture = Fixture::new();
        let original = fixture.0.join("original");
        let moved = fixture.0.join("moved");
        fs::create_dir(&original).unwrap();
        fs::set_permissions(&original, fs::Permissions::from_mode(0o700)).unwrap();
        let dir = File::open(&original).unwrap();
        let (parent, child) = pair();
        let child_raw = child.as_raw_fd();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .arg("child_receiver")
            .arg("--nocapture")
            .env("JAIT_DESCRIPTOR_CHILD", "1");
        unsafe {
            command.pre_exec(move || {
                if libc::dup2(child_raw, 198) < 0 {
                    return Err(io::Error::last_os_error());
                }
                if libc::fcntl(198, libc::F_SETFD, 0) < 0 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let mut process = command.spawn().unwrap();
        drop(child);
        fs::rename(&original, &moved).unwrap();
        fs::create_dir(&original).unwrap();
        send_directory(parent.as_fd(), dir.as_fd()).unwrap();
        assert!(process.wait().unwrap().success());
        assert!(moved.join("child-created").exists());
        assert!(!original.join("child-created").exists());
        assert!(dir.metadata().unwrap().is_dir());
    }

    #[test]
    fn rejected_messages_close_received_descriptors() {
        // Run in a separate test process to make fd counts independent of other tests.
        if std::env::var_os("JAIT_DESCRIPTOR_LEAK_CHILD").is_none() {
            assert!(
                Command::new(std::env::current_exe().unwrap())
                    .arg("rejected_messages_close_received_descriptors")
                    .env("JAIT_DESCRIPTOR_LEAK_CHILD", "1")
                    .status()
                    .unwrap()
                    .success()
            );
            return;
        }
        let fixture = Fixture::new();
        let dir = File::open(&fixture.0).unwrap();
        let file_path = fixture.0.join("file");
        fs::write(&file_path, b"x").unwrap();
        let file = File::open(file_path).unwrap();
        let (a, b) = pair();
        let baseline = fd_count();
        for (bytes, fds, control_size) in [
            (vec![MARKER], vec![], 4096),
            (vec![MARKER], vec![dir.as_raw_fd(), dir.as_raw_fd()], 4096),
            (vec![0], vec![dir.as_raw_fd()], 4096),
            (vec![MARKER, 1], vec![dir.as_raw_fd()], 4096),
            (vec![MARKER], vec![file.as_raw_fd()], 4096),
            (
                vec![MARKER],
                vec![dir.as_raw_fd(), dir.as_raw_fd()],
                unsafe { libc::CMSG_LEN(mem::size_of::<libc::c_int>() as u32) as usize },
            ),
        ] {
            raw_send(a.as_raw_fd(), &bytes, &fds);
            assert!(receive_with_control_size(b.as_fd(), control_size).is_err());
            assert_eq!(fd_count(), baseline);
        }
        // Kernel-generated credentials are an unexpected ancillary record.
        let enabled: libc::c_int = 1;
        assert_eq!(
            unsafe {
                libc::setsockopt(
                    b.as_raw_fd(),
                    libc::SOL_SOCKET,
                    libc::SO_PASSCRED,
                    (&enabled as *const libc::c_int).cast(),
                    mem::size_of_val(&enabled) as libc::socklen_t,
                )
            },
            0
        );
        raw_send(a.as_raw_fd(), &[MARKER], &[dir.as_raw_fd()]);
        assert!(receive_directory(b.as_fd()).is_err());
        assert_eq!(fd_count(), baseline);
        let disabled: libc::c_int = 0;
        assert_eq!(
            unsafe {
                libc::setsockopt(
                    b.as_raw_fd(),
                    libc::SOL_SOCKET,
                    libc::SO_PASSCRED,
                    (&disabled as *const libc::c_int).cast(),
                    mem::size_of_val(&disabled) as libc::socklen_t,
                )
            },
            0
        );
        fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(send_directory(a.as_fd(), dir.as_fd()).is_err());
        raw_send(a.as_raw_fd(), &[MARKER], &[dir.as_raw_fd()]);
        assert!(receive_directory(b.as_fd()).is_err());
        assert_eq!(fd_count(), baseline);
        // Special permission bits are excluded by the exact 0700 contract too.
        fs::set_permissions(&fixture.0, fs::Permissions::from_mode(0o1700)).unwrap();
        assert!(send_directory(a.as_fd(), dir.as_fd()).is_err());
        raw_send(a.as_raw_fd(), &[MARKER], &[dir.as_raw_fd()]);
        assert!(receive_directory(b.as_fd()).is_err());
        assert_eq!(fd_count(), baseline);
        let (stream_a, _) = std::os::unix::net::UnixStream::pair().unwrap();
        assert!(send_directory(stream_a.as_fd(), dir.as_fd()).is_err());
    }
}
