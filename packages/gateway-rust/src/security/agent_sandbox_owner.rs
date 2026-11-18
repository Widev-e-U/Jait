//! Sandbox ownership identity. Unknown or permission-denied processes stay owned.
use crate::text::{js_trim, js_whitespace};
use sha2::{Digest, Sha256};
use std::{
    io,
    path::{Component, Path, PathBuf},
};
#[derive(Clone, Copy)]
pub enum Probe {
    Alive,
    Missing,
    Unknown,
}
pub trait Host {
    fn hostname(&self) -> String;
    fn read(&self, path: &str) -> Option<String>;
    fn read_link(&self, path: &str) -> Option<String>;
    fn pid(&self) -> u32;
    fn probe(&self, pid: u64) -> Probe;
}
pub struct SystemHost;
impl Host for SystemHost {
    fn hostname(&self) -> String {
        #[cfg(unix)]
        {
            let mut bytes = [0u8; 256];
            // Buffer size is fixed and passed exactly; no untrusted pointer is exposed.
            if unsafe { libc::gethostname(bytes.as_mut_ptr().cast(), bytes.len()) } == 0 {
                let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
                return String::from_utf8_lossy(&bytes[..end]).into_owned();
            }
        }
        std::env::var("COMPUTERNAME").unwrap_or_default()
    }
    fn read(&self, path: &str) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }
    fn read_link(&self, path: &str) -> Option<String> {
        std::fs::read_link(path)
            .ok()
            .map(|p| p.to_string_lossy().into_owned())
    }
    fn pid(&self) -> u32 {
        std::process::id()
    }
    fn probe(&self, pid: u64) -> Probe {
        #[cfg(unix)]
        {
            let Ok(pid) = libc::pid_t::try_from(pid) else {
                return Probe::Unknown;
            };
            // Signal zero observes existence and permission only; it never sends a signal.
            if unsafe { libc::kill(pid, 0) } == 0 {
                return Probe::Alive;
            }
            if io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH) {
                Probe::Missing
            } else {
                Probe::Unknown
            }
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            Probe::Unknown
        }
    }
}
fn read(host: &dyn Host, path: &str) -> String {
    host.read(path)
        .map(|s| js_trim(&s).to_string())
        .unwrap_or_default()
}
pub fn process_start_from_stat(stat: &str) -> String {
    let stat = js_trim(stat);
    if stat.is_empty() {
        return String::new();
    }
    let offset = stat.rfind(')').map(|p| p + 2).unwrap_or(1).min(stat.len());
    let Some(rest) = stat.get(offset..) else {
        return String::new();
    };
    let mut parts = vec![];
    let mut start = 0;
    let mut white = false;
    for (i, c) in rest.char_indices() {
        if js_whitespace(c) {
            if !white {
                parts.push(&rest[start..i]);
            }
            white = true;
            start = i + c.len_utf8();
        } else {
            white = false;
        }
    }
    parts.push(&rest[start..]);
    parts.get(19).copied().unwrap_or("").into()
}
fn start(host: &dyn Host, pid: u64) -> String {
    process_start_from_stat(&read(host, &format!("/proc/{pid}/stat")))
}
fn lexical_absolute(path: &Path) -> io::Result<PathBuf> {
    let mut out = PathBuf::new();
    let path = if path.is_absolute() {
        path.to_owned()
    } else {
        std::env::current_dir()?.join(path)
    };
    for part in path.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            part => out.push(part.as_os_str()),
        }
    }
    Ok(out)
}
pub fn command_sandbox_gateway(host: &dyn Host, state: &Path) -> io::Result<String> {
    let bytes = serde_json::to_vec(&[
        host.hostname(),
        read(host, "/etc/machine-id"),
        host.read_link("/proc/self/ns/pid").unwrap_or_default(),
        lexical_absolute(state)?.to_string_lossy().into_owned(),
    ])
    .map_err(io::Error::other)?;
    Ok(hex::encode(Sha256::digest(bytes))[..32].to_string())
}
pub fn command_sandbox_owner(host: &dyn Host) -> String {
    let pid = host.pid();
    format!(
        "{pid}:{}:{}",
        start(host, u64::from(pid)),
        read(host, "/proc/sys/kernel/random/boot_id")
    )
}
pub fn command_sandbox_owner_alive(host: &dyn Host, owner: &str) -> bool {
    let parts = owner.split(':').collect::<Vec<_>>();
    if parts.len() != 3 || parts[0].is_empty() || !parts[0].bytes().all(|c| c.is_ascii_digit()) {
        return true;
    }
    let Ok(pid) = parts[0].parse::<u64>() else {
        return true;
    };
    if pid == 0 || pid > 9_007_199_254_740_991 {
        return true;
    }
    let boot = read(host, "/proc/sys/kernel/random/boot_id");
    if !parts[2].is_empty() && !boot.is_empty() && parts[2] != boot {
        return false;
    }
    match host.probe(pid) {
        Probe::Missing => return false,
        Probe::Unknown => return true,
        Probe::Alive => {}
    }
    let current = start(host, pid);
    parts[1].is_empty() || current.is_empty() || parts[1] == current
}
