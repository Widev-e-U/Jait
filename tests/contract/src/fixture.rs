#[path = "backend.rs"]
mod backend;
use crate::client::Api;
use anyhow::{Context, Result, bail, ensure};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread::sleep,
    time::{Duration, Instant},
};

pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

pub static CANCELLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn check_cancelled() -> Result<()> {
    ensure!(
        !CANCELLED.load(std::sync::atomic::Ordering::SeqCst),
        "contract run cancelled"
    );
    Ok(())
}

pub struct Gateway {
    child: Option<Child>,
    pub api: Api,
    root: PathBuf,
    run_dir: PathBuf,
    secret: String,
    pub managed: bool,
    backend: backend::BackendCommand,
    port: u16,
}

impl Gateway {
    pub fn start(root: &Path, run_dir: &Path, external: Option<&str>) -> Result<Self> {
        let backend = backend::BackendCommand::from_json(
            std::env::var("JAIT_CONTRACT_BACKEND_ARGV").ok().as_deref(),
            std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()),
        )?;
        Self::start_with_backend(root, run_dir, external, backend, 0)
    }

    // Fixture-specific drivers pass argv directly, without mutating the test
    // executable's process-wide environment while other tests are running.
    #[allow(dead_code)]
    pub fn start_owned_command(root: &Path, run_dir: &Path, argv: &str) -> Result<Self> {
        let backend = backend::BackendCommand::from_json(Some(argv), "bun".into())?;
        Self::start_with_backend(root, run_dir, None, backend, 0)
    }

    /// Select a listen port without mutating the parallel test process environment.
    #[allow(dead_code)]
    pub fn start_on_port(root: &Path, run_dir: &Path, port: u16) -> Result<Self> {
        let backend = backend::BackendCommand::from_json(
            std::env::var("JAIT_CONTRACT_BACKEND_ARGV").ok().as_deref(),
            std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()),
        )?;
        Self::start_with_backend(root, run_dir, None, backend, port)
    }

    fn start_with_backend(
        root: &Path,
        run_dir: &Path,
        external: Option<&str>,
        backend: backend::BackendCommand,
        port: u16,
    ) -> Result<Self> {
        let mut gateway = Self {
            child: None,
            api: Api::new(external.unwrap_or("http://127.0.0.1"))?,
            root: root.into(),
            run_dir: run_dir.into(),
            secret: uuid::Uuid::new_v4().to_string(),
            managed: external.is_none(),
            backend,
            port,
        };
        if gateway.managed {
            gateway.launch()?;
        } else {
            gateway.api.expect("GET", "/health", None, None, 200)?;
        }
        Ok(gateway)
    }

    fn launch(&mut self) -> Result<()> {
        let state = self.run_dir.join("state");
        fs::create_dir_all(&state)?;
        let home = self.run_dir.join("home");
        let temporary = self.run_dir.join("tmp");
        fs::create_dir_all(&home)?;
        fs::create_dir_all(&temporary)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
        }
        let ready = self.run_dir.join("ready-port");
        if ready.exists() {
            fs::remove_file(&ready)?;
        }
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.run_dir.join("gateway.log"))?;
        let log_start = log.metadata()?.len();
        let mut command = self.backend.command();
        command
            .current_dir(self.root.join("packages/gateway"))
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .env("HOME", &home)
            .env("USERPROFILE", &home)
            .env("XDG_CONFIG_HOME", home.join(".config"))
            .env("TMPDIR", &temporary)
            .env("TEMP", &temporary)
            .env("TMP", &temporary)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_ASKPASS", "false")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", home.join(".gitconfig"))
            .env("GIT_CEILING_DIRECTORIES", self.root.join(".jait/artifacts"))
            .env("__JAIT_CLI", "1")
            .env("NODE_ENV", "test")
            .env("HOST", "127.0.0.1")
            .env("PORT", self.port.to_string())
            .env("JAIT_RUST_HOST", "127.0.0.1")
            .env("JAIT_RUST_PORT", self.port.to_string())
            .env("WS_PORT", "0")
            .env("LOG_LEVEL", "error")
            .env("JWT_SECRET", &self.secret)
            .env("JAIT_STATE_DIR", &state)
            .env("JAIT_DB_PATH", state.join("jait.db"))
            .env("JAIT_CONTRACT_READY_FILE", &ready)
            .env("JAIT_NODE_ONLY", "false")
            .env("JAIT_PRIMARY_GATEWAY", "")
            .env("JAIT_DISK_JANITOR_ENABLED", "0")
            .env("JAIT_WINDOWS_SANDBOX_STORAGE", state.join("sandbox"))
            .env("JAIT_WEB_DIR", self.root.join("apps/web/public"))
            .env("OLLAMA_URL", "http://127.0.0.1:9")
            .env("OPENAI_BASE_URL", "http://127.0.0.1:9")
            .env("OMNIROUTE_BASE_URL", "http://127.0.0.1:9")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));
        // Windows runtime resolution still requires the system installation path.
        // Home, credentials, config and temporary state stay in this owned fixture.
        for key in ["SYSTEMROOT"] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        self.child = Some(
            command
                .spawn()
                .context("could not start owned disposable backend")?,
        );
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        while Instant::now() < deadline {
            check_cancelled()?;
            if let Some(status) = self.child.as_mut().unwrap().try_wait()? {
                ensure!(
                    status.success(),
                    "disposable gateway exited unsuccessfully ({status}); inspect gateway.log"
                );
                bail!("disposable gateway exited before readiness ({status}); inspect gateway.log");
            }
            let ready_port = fs::read_to_string(&ready)
                .ok()
                .and_then(|s| s.parse::<u16>().ok());
            // Native shipping entrypoints announce structured readiness on stdout.
            // Read only this launch's bounded log prefix, never an earlier restart.
            let announced =
                if ready_port.is_none() && self.backend.profile() == "owned-command-argv" {
                    let mut file = File::open(self.run_dir.join("gateway.log"))?;
                    file.seek(SeekFrom::Start(log_start))?;
                    let mut text = String::new();
                    file.take(65_536).read_to_string(&mut text)?;
                    text.lines()
                        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
                        .find(|v| v["event"] == "gateway.ready")
                        .and_then(|v| {
                            v["address"]
                                .as_str()
                                .and_then(|s| s.parse::<std::net::SocketAddr>().ok())
                        })
                        .filter(|a| a.ip() == std::net::Ipv4Addr::LOCALHOST)
                        .map(|a| a.port())
                } else {
                    None
                };
            if let Some(port) = ready_port.or(announced) {
                ensure!(port > 0, "gateway reported invalid port");
                self.api = Api::new(&format!("http://127.0.0.1:{port}"))?;
                self.api.expect("GET", "/health", None, None, 200)?;
                return Ok(());
            }
            sleep(Duration::from_millis(100));
        }
        bail!("gateway startup exceeded 60 seconds; inspect gateway.log")
    }

    pub fn process_id(&self) -> Option<u32> {
        self.child.as_ref().map(Child::id)
    }

    pub fn launch_profile(&self) -> &'static str {
        self.backend.profile()
    }

    pub fn restart(&mut self) -> Result<()> {
        ensure!(self.managed, "restart requires an owned disposable gateway");
        self.stop()?;
        self.launch()
    }

    /// Ask the owned process to shut down and require it to exit within a bound.
    /// Drop still kills the process group on failure; this does not mask timeouts.
    #[cfg(unix)]
    #[allow(dead_code)]
    pub fn shutdown(&mut self) -> Result<()> {
        let child = self
            .child
            .as_mut()
            .context("shutdown requires an owned process")?;
        let status = Command::new("/bin/kill")
            .args(["-TERM", &child.id().to_string()])
            .status()?;
        ensure!(status.success(), "could not signal owned gateway");
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            if let Some(status) = child.try_wait()? {
                ensure!(status.success(), "gateway shutdown failed: {status}");
                self.stop()?;
                return Ok(());
            }
            ensure!(
                Instant::now() < deadline,
                "gateway graceful shutdown exceeded eight seconds"
            );
            sleep(Duration::from_millis(10));
        }
    }

    pub fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            // A peer may have exited while descendants still hold ports/pipes.
            // Terminate only this owned process group, never the caller's group.
            #[cfg(unix)]
            let _ = Command::new("/bin/kill")
                .args(["-KILL", "--", &format!("-{}", child.id())])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            #[cfg(windows)]
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            if child.try_wait()?.is_none() {
                child.kill()?;
            }
            child.wait()?;
        }
        Ok(())
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

/// Create an isolated, project-local artifact directory even when invoked elsewhere.
pub fn run_directory(root: &Path) -> Result<PathBuf> {
    let directory = root
        .join(".jait/artifacts/contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    // Reserve a report location immediately so startup failures can be recorded.
    File::create(directory.join("report.json"))?;
    Ok(directory)
}
