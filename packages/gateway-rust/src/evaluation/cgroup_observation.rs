//! Linux cgroup v2 observation only. An empty cgroup is not proof of shutdown:
//! the supervisor must separately prevent migration and new arrivals, establish
//! operation identity, and retain recovery ownership before removing state.
use std::{
    fs::File,
    io::{self, Read},
    os::fd::{AsRawFd, FromRawFd},
};

const CGROUP2_SUPER_MAGIC: libc::c_long = 0x6367_7270;
const MAX_EVENTS_BYTES: u64 = 4096;

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

/// Observe `cgroup.events` relative to an explicitly supplied directory FD.
/// Call on a bounded blocking lane. This is a momentary observation, not an
/// authority to clean up state or a guarantee that a process cannot re-enter.
pub fn populated(directory: &File) -> io::Result<bool> {
    let mut stat = std::mem::MaybeUninit::<libc::statfs>::uninit();
    // SAFETY: the fd is borrowed and the kernel initializes stat on success.
    if unsafe { libc::fstatfs(directory.as_raw_fd(), stat.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: fstatfs succeeded above.
    if unsafe { stat.assume_init() }.f_type as libc::c_long != CGROUP2_SUPER_MAGIC {
        return Err(invalid("directory is not on cgroup v2"));
    }
    if !directory.metadata()?.is_dir() {
        return Err(invalid("cgroup capability is not a directory"));
    }
    // SAFETY: the pathname is a fixed NUL-terminated name and the fd is borrowed.
    let fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            c"cgroup.events".as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_NONBLOCK,
        )
    };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: openat returned a new owned descriptor.
    let file = unsafe { File::from_raw_fd(fd) };
    let mut bytes = Vec::new();
    file.take(MAX_EVENTS_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_EVENTS_BYTES {
        return Err(invalid("cgroup events are oversized"));
    }
    parse_populated(&bytes)
}

fn parse_populated(bytes: &[u8]) -> io::Result<bool> {
    if !bytes.ends_with(b"\n") {
        return Err(invalid("incomplete cgroup events"));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| invalid("invalid cgroup events"))?;
    let mut populated = None;
    for line in text.lines() {
        let mut fields = line.split_ascii_whitespace();
        let key = fields
            .next()
            .ok_or_else(|| invalid("invalid cgroup event"))?;
        let value = fields
            .next()
            .ok_or_else(|| invalid("invalid cgroup event"))?;
        if fields.next().is_some() {
            return Err(invalid("invalid cgroup event"));
        }
        if key == "populated" {
            if populated.is_some() {
                return Err(invalid("duplicate populated event"));
            }
            populated = Some(match value {
                "0" => false,
                "1" => true,
                _ => return Err(invalid("invalid populated event")),
            });
        }
    }
    populated.ok_or_else(|| invalid("missing populated event"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_require_one_unambiguous_populated_value() {
        assert_eq!(parse_populated(b"populated 0\nfrozen 0\n").unwrap(), false);
        assert_eq!(parse_populated(b"populated 1\nfrozen 0\n").unwrap(), true);
        for input in [
            b"frozen 0\n".as_slice(),
            b"populated 0\npopulated 1\n",
            b"populated 2\n",
            b"populated 0 extra\n",
            b"populated 0",
            b"populated 0\n\xff",
        ] {
            assert!(parse_populated(input).is_err());
        }
    }

    /// Explicitly run against the executing test's current cgroup; no process
    /// migration or cgroup mutation is required.
    #[test]
    #[ignore = "requires a readable cgroup v2 mount containing this process"]
    fn observes_current_cgroup_as_populated() {
        let membership = std::fs::read_to_string("/proc/self/cgroup").unwrap();
        let path = membership
            .lines()
            .find_map(|line| line.strip_prefix("0::"))
            .expect("unified cgroup membership");
        assert!(path.starts_with('/') && !path.split('/').any(|part| part == ".."));
        let mount = std::env::var_os("JAIT_TEST_CGROUP_MOUNT")
            .expect("set JAIT_TEST_CGROUP_MOUNT to the cgroup v2 mount root");
        let directory =
            File::open(std::path::Path::new(&mount).join(path.trim_start_matches('/'))).unwrap();
        assert!(populated(&directory).unwrap());
    }

    #[test]
    fn rejects_non_cgroup_directory() {
        let directory = File::open(env!("CARGO_MANIFEST_DIR")).unwrap();
        assert!(populated(&directory).is_err());
    }
}
