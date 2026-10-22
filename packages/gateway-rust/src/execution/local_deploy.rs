//! Native local-deployment gate and service controller. External build engines remain subprocesses.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Step {
    pub id: String,
    pub command: String,
    pub args: Vec<String>,
}
fn step(id: &str, command: &str, args: &[&str]) -> Step {
    Step {
        id: id.into(),
        command: command.into(),
        args: args.iter().map(|s| (*s).into()).collect(),
    }
}
pub fn verification_steps(root: &Path) -> Result<Vec<Step>> {
    let mut workflow = fs::read_dir(root.join(".github/scripts"))
        .map_err(err)?
        .map(|entry| {
            entry
                .map_err(err)
                .map(|e| e.file_name().to_string_lossy().into_owned())
        })
        .collect::<Result<Vec<_>>>()?;
    workflow.retain(|name| name.ends_with(".test.mjs"));
    workflow.sort();
    let mut workflow_args = vec!["--test".into()];
    workflow_args.extend(
        workflow
            .into_iter()
            .map(|name| format!(".github/scripts/{name}")),
    );
    workflow_args.push("scripts/local-deploy.test.mjs".into());
    Ok(vec![
        step("release-guard", "bun", &["run", "release:check"]),
        step("artifact-paths", "bun", &["run", "check:artifacts"]),
        step("typecheck", "bun", &["run", "typecheck"]),
        step(
            "unit-tests",
            "bun",
            &["run", "test", "--maxWorkers=4", "--minWorkers=1"],
        ),
        Step {
            id: "workflow-tests".into(),
            command: "node".into(),
            args: workflow_args,
        },
        step("lint", "bun", &["run", "lint"]),
        step("browser-tools", "bun", &["run", "test:tools:browser"]),
        step(
            "rust-migration",
            "bun",
            &["run", "test:gateway:rust", "--full-contracts"],
        ),
        step(
            "web-e2e",
            "node",
            &[
                "tests/e2e/scripts/run-isolated.mjs",
                "bun",
                "run",
                "test:e2e",
            ],
        ),
        step(
            "web-ui",
            "node",
            &[
                "tests/e2e/scripts/run-isolated.mjs",
                "bun",
                "run",
                "test:e2e:ui",
            ],
        ),
    ])
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Check {
    #[serde(flatten)]
    pub step: Step,
    pub passed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Proof {
    pub fingerprint: String,
    pub checks: Vec<Check>,
}
#[allow(async_fn_in_trait)]
pub trait VerificationHost {
    async fn fingerprint(&mut self) -> Result<String>;
    async fn run(&mut self, step: &Step) -> Result<()>;
}
pub async fn verify(host: &mut impl VerificationHost, steps: &[Step]) -> Result<Proof> {
    let before = host.fingerprint().await?;
    let mut checks = Vec::new();
    for step in steps {
        host.run(step).await?;
        checks.push(Check {
            step: step.clone(),
            passed: true,
        });
    }
    if host.fingerprint().await? != before {
        return Err("Verified source/build changed during checks; refusing deployment".into());
    }
    Ok(Proof {
        fingerprint: before,
        checks,
    })
}
pub fn validate_proof(proof: &Proof, steps: &[Step]) -> Result<()> {
    if proof.checks.len() != steps.len()
        || proof
            .checks
            .iter()
            .zip(steps)
            .any(|(check, step)| !check.passed || &check.step != step)
        || !valid_hash(&proof.fingerprint)
    {
        return Err("Missing mandatory verification evidence".into());
    }
    Ok(())
}
fn valid_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

/// Hash path, permissions and bytes, matching the launcher, without following symlinks.
pub fn tree_digest(root: &Path) -> Result<String> {
    fn collect(root: &Path, dir: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
        for entry in fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let name = entry.file_name();
            let name = name.to_str().ok_or("Non-UTF8 deployment filename")?;
            if [".git", ".jait", "node_modules"].contains(&name) || name.ends_with(".tsbuildinfo") {
                continue;
            }
            if entry.file_type().map_err(err)?.is_dir() {
                collect(root, &entry.path(), files)?;
            } else {
                files.push(entry.path().strip_prefix(root).map_err(err)?.to_owned());
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    collect(root, root, &mut files)?;
    files.sort_by(|a, b| {
        // JavaScript sorts UTF-16 code units.
        a.to_str()
            .unwrap()
            .encode_utf16()
            .cmp(b.to_str().unwrap().encode_utf16())
    });
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    for path in files {
        let full = root.join(&path);
        let stat = fs::symlink_metadata(&full).map_err(err)?;
        hash.update(
            serde_json::to_vec(&(
                path.to_str().ok_or("Non-UTF8 deployment path")?,
                stat.mode() & 0o777,
            ))
            .map_err(err)?,
        );
        if stat.is_symlink() {
            hash.update(
                fs::read_link(full)
                    .map_err(err)?
                    .to_str()
                    .ok_or("Non-UTF8 deployment symlink")?
                    .as_bytes(),
            );
        } else if stat.is_file() {
            let mut file = fs::File::open(full).map_err(err)?;
            loop {
                let read = file.read(&mut buffer).map_err(err)?;
                if read == 0 {
                    break;
                }
                hash.update(&buffer[..read]);
            }
        } else {
            return Err("Unsupported deployment entry".into());
        }
    }
    Ok(hex::encode(hash.finalize()))
}

pub fn systemd_quote(value: &str) -> Result<String> {
    if value.contains(['\0', '\r', '\n']) {
        return Err("Invalid service argument".into());
    }
    Ok(format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('%', "%%")
            .replace('$', "$$")
    ))
}
pub fn override_unit(argv: &[String], entry: &str) -> Result<String> {
    let index = argv
        .iter()
        .position(|arg| arg.ends_with("/bin/jait.mjs"))
        .filter(|index| *index >= 1)
        .ok_or("Expected a Node/Bun gateway service")?;
    let program = Path::new(&argv[0])
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if !["node", "bun", "node.exe", "bun.exe"].contains(&program) {
        return Err("Expected a Node/Bun gateway service".into());
    }
    let mut args = argv.to_vec();
    args[index] = entry.into();
    Ok(format!(
        "[Service]\nExecStart=\nExecStart={}\n",
        args.iter()
            .map(|s| systemd_quote(s))
            .collect::<Result<Vec<_>>>()?
            .join(" ")
    ))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub artifact_root: PathBuf,
    pub previous_argv: Vec<String>,
    pub unit: String,
    pub port: u16,
    pub previous_version: String,
    pub version: String,
    pub build_id: String,
    pub runtime: PathBuf,
    pub runtime_hash: String,
    pub r#override: PathBuf,
    pub unit_text: String,
    pub proof: Proof,
}
pub fn validate_plan(plan: &Plan, plan_path: &Path, home: &Path) -> Result<()> {
    let run = plan_path
        .parent()
        .ok_or("Invalid activation plan location")?;
    // Canonical paths reject parent traversal and symlink aliases before any systemd changes.
    let base = fs::canonicalize(&plan.artifact_root).map_err(err)?;
    if base != plan.artifact_root
        || run.parent().and_then(Path::parent) != Some(base.as_path())
        || run
            .parent()
            .and_then(Path::file_name)
            .and_then(|n| n.to_str())
            != Some("runs")
        || fs::canonicalize(plan_path).map_err(err)? != plan_path
        || !plan.runtime.starts_with(base.join("releases"))
        || plan.runtime == base.join("releases")
        || fs::canonicalize(&plan.runtime).map_err(err)? != plan.runtime
    {
        return Err("Invalid activation plan location".into());
    }
    if plan.unit != "jait-gateway.service"
        || plan.port == 0
        || plan.r#override
            != home.join(".config/systemd/user/jait-gateway.service.d/90-jait-local.conf")
    {
        return Err("Unexpected local deployment service target".into());
    }
    if plan.unit_text
        != override_unit(
            &plan.previous_argv,
            plan.runtime
                .join("packages/gateway/bin/jait.mjs")
                .to_str()
                .ok_or("Non-UTF8 runtime path")?,
        )?
    {
        return Err("Unexpected local service override".into());
    }
    validate_proof(&plan.proof, &verification_steps(&plan.runtime)?)?;
    if !valid_hash(&plan.runtime_hash) || plan.runtime_hash != plan.proof.fingerprint {
        return Err("Runtime is not bound to verification evidence".into());
    }
    Ok(())
}

#[allow(async_fn_in_trait)]
pub trait ActivationHost {
    async fn read_override(&mut self) -> Result<Option<String>>;
    async fn backup(&mut self, previous: &Option<String>) -> Result<()>;
    async fn write_override(&mut self, text: &str) -> Result<()>;
    async fn remove_override(&mut self) -> Result<()>;
    async fn reload(&mut self) -> Result<()>;
    async fn restart(&mut self) -> Result<()>;
    async fn health(&mut self, version: &str) -> Result<()>;
}
pub async fn restore(
    host: &mut impl ActivationHost,
    previous: Option<&str>,
    version: &str,
) -> Result<()> {
    if let Some(text) = previous {
        host.write_override(text).await?;
    } else {
        host.remove_override().await?;
    }
    host.reload().await?;
    host.restart().await?;
    host.health(version).await
}
pub async fn activate(host: &mut impl ActivationHost, plan: &Plan) -> Result<()> {
    let previous = host.read_override().await?;
    host.backup(&previous).await?;
    let result = async {
        host.write_override(&plan.unit_text).await?;
        host.reload().await?;
        host.restart().await?;
        host.health(&plan.version).await
    }
    .await;
    if let Err(error) = result {
        if let Err(rollback) = restore(host, previous.as_deref(), &plan.previous_version).await {
            return Err(format!(
                "Local activation failed: {error}; rollback failed: {rollback}"
            ));
        }
        return Err(format!(
            "Local activation failed; previous service configuration restored: {error}"
        ));
    }
    Ok(())
}

/// A whole process group is bounded, including descendants that outlive their parent.
pub async fn run_logged(
    command: &str,
    args: &[String],
    cwd: &Path,
    log: &Path,
    limit: Duration,
) -> Result<()> {
    let output = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(log)
        .map_err(err)?;
    let mut child = Command::new(command)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(output.try_clone().map_err(err)?)
        .stderr(output)
        .process_group(0)
        .kill_on_drop(true)
        .spawn()
        .map_err(err)?;
    let pid = child.id().ok_or("Missing process id")? as i32;
    let mut term =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).map_err(err)?;
    let mut interrupt =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt()).map_err(err)?;
    let mut progress = tokio::time::interval(Duration::from_secs(30));
    progress.tick().await;
    let deadline = tokio::time::sleep(limit);
    tokio::pin!(deadline);
    let outcome = loop {
        tokio::select! {
            status = child.wait() => {
                break status.map_err(err).and_then(|s| if s.success() { Ok(()) } else { Err(format!("{command} failed ({s}); see {}", log.display())) });
            }
            _ = &mut deadline => break Err(format!("Stage exceeded {}ms", limit.as_millis())),
            _ = term.recv() => break Err("Local deployment cancelled".into()),
            _ = interrupt.recv() => break Err("Local deployment cancelled".into()),
            _ = progress.tick() => eprintln!("[local-deploy] {} still running", log.display()),
        }
    };
    // SAFETY: this negative PID addresses only the process group created above.
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    // Reap the child and allow descendants a bounded grace period, including after parent exit.
    let cleanup = async {
        let _ = child.wait().await;
        loop {
            if unsafe { libc::kill(-pid, 0) } != 0 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    };
    if tokio::time::timeout(Duration::from_secs(5), cleanup)
        .await
        .is_err()
    {
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
        let _ = child.wait().await;
    }
    outcome
}

pub struct FilesystemVerificationHost {
    pub root: PathBuf,
    pub logs: PathBuf,
}
impl VerificationHost for FilesystemVerificationHost {
    async fn fingerprint(&mut self) -> Result<String> {
        tree_digest(&self.root)
    }
    async fn run(&mut self, step: &Step) -> Result<()> {
        eprintln!(
            "[local-deploy] {}; log: {}",
            step.id,
            self.logs.join(format!("{}.log", step.id)).display()
        );
        run_logged(
            &step.command,
            &step.args,
            &self.root,
            &self.logs.join(format!("{}.log", step.id)),
            Duration::from_secs(1800),
        )
        .await
    }
}

fn read_optional(path: &Path) -> Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(err(error)),
    }
}
pub fn write_private(path: &Path, contents: &[u8]) -> Result<()> {
    use std::io::Write;
    OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(path)
        .map_err(err)?
        .write_all(contents)
        .map_err(err)
}
pub struct SystemdActivationHost {
    pub plan: Plan,
    pub run: PathBuf,
}
impl ActivationHost for SystemdActivationHost {
    async fn read_override(&mut self) -> Result<Option<String>> {
        read_optional(&self.plan.r#override)
    }
    async fn backup(&mut self, previous: &Option<String>) -> Result<()> {
        write_private(
            &self.run.join("rollback.json"),
            &serde_json::to_vec(&serde_json::json!({"override":previous})).map_err(err)?,
        )
    }
    async fn write_override(&mut self, text: &str) -> Result<()> {
        write_private(&self.plan.r#override, text.as_bytes())
    }
    async fn remove_override(&mut self) -> Result<()> {
        match fs::remove_file(&self.plan.r#override) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(err(error)),
        }
    }
    async fn reload(&mut self) -> Result<()> {
        self.command("reload", &["--user", "daemon-reload"]).await
    }
    async fn restart(&mut self) -> Result<()> {
        let unit = self.plan.unit.clone();
        self.command("restart", &["--user", "restart", &unit]).await
    }
    async fn health(&mut self, version: &str) -> Result<()> {
        wait_for_version(self.plan.port, version, Duration::from_secs(180)).await
    }
}
impl SystemdActivationHost {
    async fn command(&self, name: &str, args: &[&str]) -> Result<()> {
        run_logged(
            "systemctl",
            &args.iter().map(|s| (*s).into()).collect::<Vec<_>>(),
            &self.run,
            &self.run.join(format!("systemd-{name}.log")),
            Duration::from_secs(30),
        )
        .await
    }
}
pub async fn wait_for_version(port: u16, version: &str, limit: Duration) -> Result<()> {
    // Local service probes must not inherit proxy settings or follow redirects.
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(err)?;
    let probe = async {
        loop {
            if let Ok(response) = client
                .get(format!("http://127.0.0.1:{port}/health"))
                .send()
                .await
                && response.status().is_success()
                && let Ok(value) = response.json::<serde_json::Value>().await
                && value["healthy"] != false
                && value["version"] == version
            {
                return;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    };
    tokio::time::timeout(limit, probe)
        .await
        .map_err(|_| format!("Gateway {version} did not become healthy on port {port}"))
}

/// Recheck the actual running command and package after the long verification window.
pub async fn current_service_matches(plan: &Plan, run: &Path) -> Result<()> {
    let log = run.join("service-pid.log");
    run_logged(
        "systemctl",
        &[
            "--user",
            "show",
            &plan.unit,
            "--property=MainPID",
            "--value",
        ]
        .iter()
        .map(|s| (*s).into())
        .collect::<Vec<_>>(),
        run,
        &log,
        Duration::from_secs(10),
    )
    .await?;
    let pid = fs::read_to_string(log)
        .map_err(err)?
        .trim()
        .parse::<u32>()
        .map_err(err)?;
    if pid == 0 {
        return Err("Gateway service is not running".into());
    }
    let argv: Vec<String> = fs::read_to_string(format!("/proc/{pid}/cmdline"))
        .map_err(err)?
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    if argv != plan.previous_argv {
        return Err("Service configuration changed during verification".into());
    }
    let entry = argv
        .iter()
        .find(|s| s.ends_with("/bin/jait.mjs"))
        .ok_or("Missing gateway entry")?;
    let package: serde_json::Value = serde_json::from_slice(
        &fs::read(
            Path::new(entry)
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("package.json"),
        )
        .map_err(err)?,
    )
    .map_err(err)?;
    if package["name"] != "@jait/gateway" || package["version"] != plan.previous_version {
        return Err("Service configuration changed during verification".into());
    }
    Ok(())
}
