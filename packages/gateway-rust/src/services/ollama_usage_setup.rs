//! Metadata-only Ollama setup guidance. Never reads key contents or executes commands.
use crate::{
    security::agent_sandbox_owner::{Host, SystemHost},
    text::js_trim,
};
use serde::{Deserialize, Serialize};
use std::{
    io,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHost {
    pub host: String,
    pub platform: String,
    pub gateway_user: String,
    pub uid: i64,
    pub home_dir: String,
    pub configured_key_path: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum KeyStatus {
    Remote,
    Missing,
    Unreadable,
    Readable,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OllamaUsageSetup {
    pub host: String,
    pub platform: String,
    pub gateway_user: String,
    pub local: bool,
    pub key_status: KeyStatus,
    pub key_path: Option<String>,
    pub permission_command: Option<String>,
}
/// Operator-owned paths only. Do not construct this host from tool/HTTP input.
impl UsageHost {
    pub fn key_paths(&self) -> Vec<String> {
        if let Some(configured) = self
            .configured_key_path
            .as_deref()
            .map(js_trim)
            .filter(|s| !s.is_empty())
        {
            return vec![configured.to_string()];
        }
        let mut paths = vec![
            normalize_join(&self.home_dir)
                .to_string_lossy()
                .into_owned(),
        ];
        if self.platform == "linux" {
            paths.push("/usr/share/ollama/.ollama/id_ed25519".into());
        }
        paths
    }
    #[cfg(unix)]
    pub fn from_system(configured_key_path: Option<String>) -> io::Result<Self> {
        use std::ffi::CStr;
        let mut size = 16_384;
        // getpwuid_r writes only into our allocated buffers. Copy strings before
        // releasing them, and bound retries for unusually large NSS records.
        loop {
            let mut record = std::mem::MaybeUninit::<libc::passwd>::uninit();
            let mut bytes = vec![0_u8; size];
            let mut result = std::ptr::null_mut();
            let uid = unsafe { libc::getuid() };
            let error = unsafe {
                libc::getpwuid_r(
                    uid,
                    record.as_mut_ptr(),
                    bytes.as_mut_ptr().cast(),
                    bytes.len(),
                    &mut result,
                )
            };
            if error == libc::ERANGE && size < 1_048_576 {
                size *= 2;
                continue;
            }
            if error != 0 {
                return Err(io::Error::from_raw_os_error(error));
            }
            if result.is_null() {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    "gateway user not found",
                ));
            }
            let record = unsafe { record.assume_init() };
            let username = unsafe { CStr::from_ptr(record.pw_name) }
                .to_string_lossy()
                .into_owned();
            let passwd_home = unsafe { CStr::from_ptr(record.pw_dir) }
                .to_string_lossy()
                .into_owned();
            let home_dir = std::env::var("HOME")
                .ok()
                .filter(|s| !s.is_empty())
                .unwrap_or(passwd_home);
            let platform = if cfg!(target_os = "macos") {
                "darwin"
            } else {
                std::env::consts::OS
            };
            return Ok(Self {
                host: SystemHost.hostname(),
                platform: platform.into(),
                gateway_user: username,
                uid: i64::from(uid),
                home_dir,
                configured_key_path,
            });
        }
    }
}
fn normalize_join(home: &str) -> PathBuf {
    use std::path::Component;
    let joined = Path::new(home).join(".ollama/id_ed25519");
    let mut normalized = PathBuf::new();
    for component in joined.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if normalized.file_name().is_some_and(|name| name != "..") {
                    normalized.pop();
                } else if !normalized.has_root() {
                    normalized.push("..");
                }
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}
/// Established URL parsing only; loopback classification does not authorize an assessment.
pub fn is_local_ollama_url(base_url: &str) -> bool {
    let Ok(url) = url::Url::parse(base_url) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
        && url.username().is_empty()
        && url.password().is_none_or(str::is_empty)
        && url.path() == "/"
        && url.query().is_none_or(str::is_empty)
        && url.fragment().is_none_or(str::is_empty)
}
pub trait KeyMetadata {
    fn is_file(&self, path: &Path) -> io::Result<bool>;
    fn readable(&self, path: &Path) -> io::Result<()>;
}
pub struct SystemKeyMetadata;
impl KeyMetadata for SystemKeyMetadata {
    fn is_file(&self, path: &Path) -> io::Result<bool> {
        std::fs::metadata(path).map(|m| m.is_file())
    }
    fn readable(&self, path: &Path) -> io::Result<()> {
        #[cfg(unix)]
        {
            use std::{ffi::CString, os::unix::ffi::OsStrExt};
            let path = CString::new(path.as_os_str().as_bytes()).map_err(|_| {
                io::Error::new(io::ErrorKind::InvalidInput, "key path contains NUL")
            })?;
            // access(R_OK) checks the same real-UID read permission as Node fs.access.
            if unsafe { libc::access(path.as_ptr(), libc::R_OK) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        }
        #[cfg(not(unix))]
        {
            std::fs::File::open(path).map(drop)
        }
    }
}
/// Run on the gateway's blocking-work pool; user and NSS lookup can block.
#[cfg(unix)]
pub fn get_system_ollama_usage_setup(base_url: &str) -> io::Result<OllamaUsageSetup> {
    let host = UsageHost::from_system(std::env::var("JAIT_OLLAMA_DEVICE_KEY_PATH").ok())?;
    Ok(get_ollama_usage_setup(base_url, &host, &SystemKeyMetadata))
}
fn permission_denied(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::PermissionDenied
}
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
pub fn get_ollama_usage_setup(
    base_url: &str,
    host: &UsageHost,
    metadata: &dyn KeyMetadata,
) -> OllamaUsageSetup {
    let local = is_local_ollama_url(base_url);
    let mut result = OllamaUsageSetup {
        host: host.host.clone(),
        platform: host.platform.clone(),
        gateway_user: host.gateway_user.clone(),
        local,
        key_status: if local {
            KeyStatus::Missing
        } else {
            KeyStatus::Remote
        },
        key_path: None,
        permission_command: None,
    };
    if !local {
        return result;
    }
    for path in host.key_paths() {
        let file = PathBuf::from(&path);
        match metadata.is_file(&file) {
            Ok(false) => continue,
            Err(error) => {
                if result.key_path.is_none() && permission_denied(&error) {
                    result.key_status = KeyStatus::Unreadable;
                    result.key_path = Some(path);
                }
                continue;
            }
            Ok(true) => {}
        }
        if metadata.readable(&file).is_ok() {
            result.key_status = KeyStatus::Readable;
            result.key_path = Some(path);
            result.permission_command = None;
            return result;
        }
        if result.key_path.is_none() {
            result.key_status = KeyStatus::Unreadable;
            if host.platform == "linux" && host.uid >= 0 {
                result.permission_command = Some(format!(
                    "sudo setfacl -m u:{}:r -- {}",
                    host.uid,
                    shell_quote(&path)
                ));
            }
            result.key_path = Some(path);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    fn host() -> UsageHost {
        UsageHost {
            host: "gateway".into(),
            platform: "linux".into(),
            gateway_user: "operator".into(),
            uid: 1234,
            home_dir: "/home/operator".into(),
            configured_key_path: None,
        }
    }
    struct Probe {
        stats: Vec<Result<bool, io::ErrorKind>>,
        readable: Vec<bool>,
        seen: Cell<usize>,
        accesses: Cell<usize>,
    }
    impl KeyMetadata for Probe {
        fn is_file(&self, _: &Path) -> io::Result<bool> {
            let i = self.seen.get();
            self.seen.set(i + 1);
            self.stats[i].map_err(io::Error::from)
        }
        fn readable(&self, _: &Path) -> io::Result<()> {
            let i = self.accesses.get();
            self.accesses.set(i + 1);
            if self.readable[i] {
                Ok(())
            } else {
                Err(io::ErrorKind::PermissionDenied.into())
            }
        }
    }
    fn probe(stats: Vec<Result<bool, io::ErrorKind>>, readable: Vec<bool>) -> Probe {
        Probe {
            stats,
            readable,
            seen: Cell::new(0),
            accesses: Cell::new(0),
        }
    }
    #[test]
    fn remote_urls_do_not_probe_and_local_scope_is_exact() {
        for url in [
            "http://127.0.0.2",
            "http://localhost.evil",
            "http://localhost./",
            "file:///etc/key",
            "http://user@localhost",
            "http://localhost/a",
            "http://localhost/?x=1",
            "http://localhost/#x",
        ] {
            let probe = probe(vec![], vec![]);
            let result = get_ollama_usage_setup(url, &host(), &probe);
            assert_eq!(result.key_status, KeyStatus::Remote);
            assert_eq!(probe.seen.get(), 0);
        }
        for url in [
            "http://localhost",
            "http://127.1",
            "https://[::1]",
            "http://localhost?#",
        ] {
            assert!(is_local_ollama_url(url));
        }
    }
    #[test]
    fn stat_permission_failure_never_guesses_file_acl() {
        let probe = probe(
            vec![Err(io::ErrorKind::PermissionDenied), Ok(true)],
            vec![false],
        );
        let result = get_ollama_usage_setup("http://localhost", &host(), &probe);
        assert_eq!(result.key_status, KeyStatus::Unreadable);
        assert_eq!(
            result.key_path.as_deref(),
            Some("/home/operator/.ollama/id_ed25519")
        );
        assert_eq!(result.permission_command, None);
    }
    #[test]
    fn later_readable_key_clears_prior_access_command() {
        let probe = probe(vec![Ok(true), Ok(true)], vec![false, true]);
        let result = get_ollama_usage_setup("http://localhost", &host(), &probe);
        assert_eq!(result.key_status, KeyStatus::Readable);
        assert_eq!(
            result.key_path.as_deref(),
            Some("/usr/share/ollama/.ollama/id_ed25519")
        );
        assert_eq!(result.permission_command, None);
    }
    #[test]
    fn operator_override_is_trimmed_then_quoted_and_never_executed() {
        let mut host = host();
        host.configured_key_path = Some(" \u{feff}/it's a $(key)\nnext\u{a0}".into());
        let metadata = probe(vec![Ok(true)], vec![false]);
        let result = get_ollama_usage_setup("http://localhost", &host, &metadata);
        assert_eq!(
            result.permission_command.as_deref(),
            Some("sudo setfacl -m u:1234:r -- '/it'\\''s a $(key)\nnext'")
        );
        assert_eq!(metadata.seen.get(), 1);
        host.uid = -1;
        assert!(
            get_ollama_usage_setup(
                "http://localhost",
                &host,
                &probe(vec![Ok(true)], vec![false])
            )
            .permission_command
            .is_none()
        );
    }
    #[test]
    fn default_join_normalizes_parent_components_but_configured_path_is_literal() {
        let mut host = host();
        host.home_dir = "/home/../operator//.".into();
        assert_eq!(host.key_paths()[0], "/operator/.ollama/id_ed25519");
        host.configured_key_path = Some("/home/../literal".into());
        assert_eq!(host.key_paths(), ["/home/../literal"]);
        host.configured_key_path = Some(" ".into());
        host.platform = "darwin".into();
        assert_eq!(host.key_paths(), ["/operator/.ollama/id_ed25519"]);
    }
    #[cfg(unix)]
    #[test]
    fn real_host_metadata_resolves_os_identity_without_reading_keys() {
        let host = UsageHost::from_system(Some("/operator/unused-key-path".into())).unwrap();
        assert!(!host.gateway_user.is_empty());
        assert_eq!(host.uid, i64::from(unsafe { libc::getuid() }));
        assert_eq!(host.key_paths(), ["/operator/unused-key-path"]);
    }
}
