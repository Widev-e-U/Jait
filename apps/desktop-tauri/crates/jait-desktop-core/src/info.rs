//! Platform/device facts shared by the host layer (mirrors `os.query` data
//! and the props injected by the Electron preload).

use serde_json::Value;

pub fn platform_name() -> &'static str {
    // The web UI branches on process.platform values.
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        _ => "linux",
    }
}

pub fn home_dir() -> Option<std::path::PathBuf> {
    dirs::home_dir()
}

/// The host version surfaced to the gateway/agents (`osInfo.hostApp`).
pub fn host_version() -> String {
    format!("jait-desktop-tauri {}", env!("CARGO_PKG_VERSION"))
}

/// Payload for `desktop:os-query` (mirrors the Electron handler's shape).
pub fn os_query() -> Value {
    serde_json::json!({
        "platform": platform_name(),
        "arch": match std::env::consts::ARCH { "x86_64" => "x64", "aarch64" => "arm64", other => other },
        "hostApp": host_version(),
        "osVersion": os_version(),
        "home": home_dir().map(|p| p.to_string_lossy().into_owned()),
        "uptimeSeconds": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        "totalMemMB": total_mem_mb(),
        "freeMemMB": free_mem_mb(),
    })
}

fn os_version() -> String {
    std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|s| {
            s.lines().find(|l| l.starts_with("PRETTY_NAME=")).map(|l| {
                l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string()
            })
        })
        .unwrap_or_else(|| {
            // Windows / macOS callers report the OS via their own mechanisms;
            // mirroring Electron requires the real OS version, so query it.
            std::process::Command::new("uname")
                .args(["-r"])
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string()))
                .unwrap_or_else(|| "unknown".to_string())
        })
}

fn total_mem_mb() -> u64 {
    read_meminfo_kb("MemTotal:") / 1024
}

fn free_mem_mb() -> u64 {
    read_meminfo_kb("MemAvailable:") / 1024
}

fn read_meminfo_kb(key: &str) -> u64 {
    std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|s| {
            s.lines()
                .find(|l| l.starts_with(key))
                .and_then(|l| l.split_whitespace().nth(1).and_then(|v| v.parse::<u64>().ok()))
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_matches_electron_names() {
        let expected = match std::env::consts::OS {
            "windows" => "win32",
            "macos" => "darwin",
            _ => "linux",
        };
        assert_eq!(platform_name(), expected);
        assert!(os_query().get("platform").is_some());
    }
}