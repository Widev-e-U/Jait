//! Owned gateway process. Independent of Tauri so lifecycle tests run headless.
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GatewayMode {
    #[default]
    Remote,
    Local,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GatewayConfig {
    pub mode: GatewayMode,
    pub remote_url: Option<String>,
    pub port: u16,
    pub allow_network: bool,
}
impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            mode: GatewayMode::Remote,
            remote_url: None,
            port: 18000,
            allow_network: false,
        }
    }
}
impl GatewayConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.port < 1024 {
            return Err("Choose a port between 1024 and 65535".into());
        }
        if let Some(value) = &self.remote_url {
            let url = url::Url::parse(value).map_err(|_| "Enter a valid gateway URL")?;
            if !["http", "https"].contains(&url.scheme())
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(
                    "Use an HTTP(S) gateway URL without credentials, query, or fragment".into(),
                );
            }
        }
        if self.mode == GatewayMode::Remote && self.remote_url.is_none() {
            return Err("Enter a gateway URL".into());
        }
        Ok(())
    }
    pub fn url(&self) -> Option<String> {
        if self.mode == GatewayMode::Local {
            Some(format!("http://127.0.0.1:{}", self.port))
        } else {
            self.remote_url.clone()
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub config: GatewayConfig,
    pub state: String,
    pub url: Option<String>,
    pub error: Option<String>,
    pub logs: Vec<String>,
}

pub struct GatewayHost {
    pub config: GatewayConfig,
    config_path: PathBuf,
    resources: PathBuf,
    data: PathBuf,
    child: Option<Child>,
    process_tree: Option<ProcessTree>,
    state: String,
    error: Option<String>,
    logs: Arc<Mutex<VecDeque<String>>>,
    retries: u8,
}
impl GatewayHost {
    pub fn new(resources: PathBuf, data: PathBuf) -> Self {
        let config_path = data.join("hosting.json");
        let loaded = fs::read(&config_path);
        let (config, error) = match loaded {
            Ok(bytes) => match serde_json::from_slice::<GatewayConfig>(&bytes) {
                Ok(c) if c.validate().is_ok() => (c, None),
                _ => (
                    GatewayConfig::default(),
                    Some("Invalid saved gateway configuration; choose the gateway again".into()),
                ),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (GatewayConfig::default(), None),
            Err(e) => (
                GatewayConfig::default(),
                Some(format!("Cannot read gateway configuration: {e}")),
            ),
        };
        Self {
            config,
            config_path,
            resources,
            data,
            child: None,
            process_tree: None,
            state: "stopped".into(),
            error,
            logs: Arc::new(Mutex::new(VecDeque::new())),
            retries: 0,
        }
    }
    pub fn status(&mut self) -> GatewayStatus {
        if let Some(child) = &mut self.child {
            if let Ok(Some(exit)) = child.try_wait() {
                self.child = None;
                self.process_tree = None;
                self.state = "failed".into();
                self.error = Some(format!(
                    "Gateway exited ({exit}). Check the gateway log and retry."
                ));
            }
        }
        GatewayStatus {
            config: self.config.clone(),
            state: self.state.clone(),
            url: self.config.url(),
            error: self.error.clone(),
            logs: self.logs.lock().iter().cloned().collect(),
        }
    }
    pub fn configure(&mut self, config: GatewayConfig) -> Result<GatewayStatus, String> {
        config.validate()?;
        fs::create_dir_all(&self.data).map_err(|e| e.to_string())?;
        let pending = self.config_path.with_extension("tmp");
        fs::write(
            &pending,
            serde_json::to_vec(&config).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        // Persist only after validating; never promote a remote client implicitly.
        fs::rename(&pending, &self.config_path).map_err(|e| e.to_string())?;
        self.stop();
        self.config = config;
        self.retries = 0;
        self.error = None;
        if self.config.mode == GatewayMode::Local {
            self.start()?;
        }
        Ok(self.status())
    }
    pub fn start(&mut self) -> Result<(), String> {
        if self.config.mode != GatewayMode::Local {
            return Ok(());
        }
        if self.status().state == "running" {
            return Ok(());
        }
        self.state = "starting".into();
        self.error = None;
        match self.launch() {
            Ok(()) => {
                self.state = "running".into();
                Ok(())
            }
            Err(error) => {
                self.stop();
                self.state = "failed".into();
                self.error = Some(error.clone());
                Err(error)
            }
        }
    }
    fn launch(&mut self) -> Result<(), String> {
        let runtime =
            self.resources
                .join("runtime")
                .join(if cfg!(windows) { "node.exe" } else { "node" });
        let entry = self
            .resources
            .join("node_modules/@jait/gateway/bin/desktop-host.mjs");
        if !runtime.is_file() || !entry.is_file() {
            return Err("Gateway runtime is missing. Install a desktop build that includes gateway hosting.".into());
        }
        fs::create_dir_all(&self.data).map_err(|e| e.to_string())?;
        let mut command = Command::new(runtime);
        command
            .arg(entry)
            .arg(self.data.join("state"))
            .arg(self.config.port.to_string())
            .arg(if self.config.allow_network {
                "network"
            } else {
                "local"
            })
            .current_dir(&self.data)
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Cannot start gateway: {e}"))?;
        match ProcessTree::attach(&child) {
            Ok(tree) => self.process_tree = Some(tree),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        }
        let (ready_tx, ready_rx) = mpsc::channel();
        let prefix = format!("JAIT_DESKTOP_READY {}", self.config.port);
        let logs = self.logs.clone();
        let stdout = child.stdout.take().ok_or("Missing gateway stdout")?;
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line == prefix {
                    let _ = ready_tx.send(());
                } else {
                    append_log(&logs, line);
                }
            }
        });
        let logs = self.logs.clone();
        let stderr = child.stderr.take().ok_or("Missing gateway stderr")?;
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                append_log(&logs, line);
            }
        });
        self.child = Some(child);
        let deadline = Instant::now() + Duration::from_secs(90);
        loop {
            if ready_rx.recv_timeout(Duration::from_millis(100)).is_ok() {
                return Ok(());
            }
            if let Some(exit) = self
                .child
                .as_mut()
                .unwrap()
                .try_wait()
                .map_err(|e| e.to_string())?
            {
                return Err(format!("Gateway failed to start ({exit}). Check the gateway log; the port may already be in use."));
            }
            if Instant::now() >= deadline {
                return Err("Gateway startup timed out. Check the gateway log and retry.".into());
            }
        }
    }
    pub fn stop(&mut self) {
        self.state = "stopping".into();
        if let Some(mut child) = self.child.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"stop\n");
            }
            let deadline = Instant::now() + Duration::from_secs(8);
            loop {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    break;
                }
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }
        }
        self.process_tree = None;
        self.state = "stopped".into();
    }
    pub fn monitor(&mut self) {
        let status = self.status();
        if status.state == "failed" && self.config.mode == GatewayMode::Local && self.retries < 3 {
            self.retries += 1;
            let _ = self.start();
        }
    }
}
impl Drop for GatewayHost {
    fn drop(&mut self) {
        self.stop();
    }
}
fn append_log(logs: &Mutex<VecDeque<String>>, line: String) {
    let mut logs = logs.lock();
    if logs.len() >= 100 {
        logs.pop_front();
    }
    logs.push_back(line.chars().take(2000).collect());
}

// OS ownership ensures gateway-spawned commands cannot outlive the desktop.
// On Windows closing the Job Object also covers an abrupt shell crash.
#[cfg(windows)]
struct ProcessTree(isize);
#[cfg(windows)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle() as _) == 0
            {
                let error = std::io::Error::last_os_error().to_string();
                CloseHandle(job);
                return Err(format!("Cannot contain gateway process tree: {error}"));
            }
            Ok(Self(job as isize))
        }
    }
}
#[cfg(windows)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0 as _);
        }
    }
}
#[cfg(unix)]
struct ProcessTree(i32);
#[cfg(unix)]
impl ProcessTree {
    fn attach(child: &Child) -> Result<Self, String> {
        Ok(Self(child.id() as i32))
    }
}
#[cfg(unix)]
impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_selection_and_validation() {
        let mut c = GatewayConfig::default();
        assert!(c.validate().is_err());
        c.mode = GatewayMode::Local;
        assert!(c.validate().is_ok());
        assert_eq!(c.url().as_deref(), Some("http://127.0.0.1:18000"));
        c.port = 0;
        assert!(c.validate().is_err());
        c.port = 18000;
        c.remote_url = Some("file:///etc/passwd".into());
        assert!(c.validate().is_err());
    }
    #[test]
    fn missing_runtime_is_visible_and_choice_survives_restart() {
        let dir = tempfile::tempdir().unwrap();
        let mut host = GatewayHost::new(dir.path().join("missing"), dir.path().join("data"));
        assert_eq!(host.status().state, "stopped");
        let c = GatewayConfig {
            mode: GatewayMode::Local,
            ..GatewayConfig::default()
        };
        assert!(host.configure(c.clone()).unwrap_err().contains("missing"));
        assert_eq!(host.status().state, "failed");
        let mut restored = GatewayHost::new(dir.path().join("missing"), dir.path().join("data"));
        assert_eq!(restored.config, c);
        assert_eq!(restored.status().state, "stopped");
    }
    #[cfg(unix)]
    fn fake_runtime(dir: &std::path::Path, script: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let resources = dir.join("resources");
        fs::create_dir_all(resources.join("runtime")).unwrap();
        fs::create_dir_all(resources.join("node_modules/@jait/gateway/bin")).unwrap();
        fs::write(
            resources.join("node_modules/@jait/gateway/bin/desktop-host.mjs"),
            "",
        )
        .unwrap();
        fs::write(
            resources.join("runtime/node"),
            format!("#!/bin/sh\n{script}\n"),
        )
        .unwrap();
        fs::set_permissions(
            resources.join("runtime/node"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        resources
    }
    #[cfg(unix)]
    #[test]
    fn running_child_is_stopped_when_selecting_remote() {
        let dir = tempfile::tempdir().unwrap();
        let resources = fake_runtime(
            dir.path(),
            "printf 'JAIT_DESKTOP_READY %s\\n' \"$3\"\nread command\nexit 0",
        );
        let mut host = GatewayHost::new(resources, dir.path().join("data"));
        let local = GatewayConfig {
            mode: GatewayMode::Local,
            ..GatewayConfig::default()
        };
        assert_eq!(host.configure(local).unwrap().state, "running");
        let pid = host.child.as_ref().unwrap().id();
        let remote = GatewayConfig {
            remote_url: Some("https://example.com".into()),
            ..GatewayConfig::default()
        };
        assert_eq!(host.configure(remote).unwrap().state, "stopped");
        assert!(host.child.is_none());
        assert_eq!(unsafe { libc::kill(pid as i32, 0) }, -1);
    }
    #[cfg(unix)]
    #[test]
    fn crash_retries_are_bounded_and_visible() {
        let dir = tempfile::tempdir().unwrap();
        let resources = fake_runtime(dir.path(), "exit 1");
        let mut host = GatewayHost::new(resources, dir.path().join("data"));
        let config = GatewayConfig {
            mode: GatewayMode::Local,
            ..GatewayConfig::default()
        };
        assert!(host.configure(config).is_err());
        for _ in 0..5 {
            host.monitor();
        }
        assert_eq!(host.retries, 3);
        assert_eq!(host.status().state, "failed");
        assert!(host.status().error.is_some());
    }

    #[test]
    #[ignore = "requires the native packaged gateway distribution"]
    fn packaged_runtime_lifecycle() {
        let resources = PathBuf::from(
            std::env::var("JAIT_HOSTING_TEST_RESOURCES").expect("packaged resources path"),
        );
        let resources = resources.canonicalize().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let mut host = GatewayHost::new(resources, dir.path().join("data"));
        let config = GatewayConfig {
            mode: GatewayMode::Local,
            port,
            ..GatewayConfig::default()
        };
        assert_eq!(host.configure(config).unwrap().state, "running");
        host.child.as_mut().unwrap().kill().unwrap();
        host.child.as_mut().unwrap().wait().unwrap();
        host.monitor();
        assert_eq!(host.status().state, "running", "crashed gateway restarts");
        assert_eq!(host.retries, 1);
        host.stop();
        assert_eq!(host.status().state, "stopped");
        assert!(host.child.is_none());
        assert!(host.process_tree.is_none());
        host.start().unwrap();
        assert_eq!(
            host.status().state,
            "running",
            "state survives a clean stop"
        );
        host.stop();
    }
}
