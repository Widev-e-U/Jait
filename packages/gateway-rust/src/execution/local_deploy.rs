//! Native local-deployment gate and service controller. External build engines remain subprocesses.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Read,
    os::unix::fs::{MetadataExt, OpenOptionsExt},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{process::Command, task::JoinHandle};

pub type Result<T> = std::result::Result<T, String>;

/// Stages whose work is safe to begin before the ladder reaches their position.
/// They write only to their own artifact and cache directories and read the
/// source tree, so starting them early cannot change another stage's evidence.
/// Sequencing is unchanged: the controller awaits a prefetched stage at its own
/// index, so the proof order and the reported failure stay exactly what a
/// strictly sequential run produces.
const PREFETCHED_STEPS: [&str; 3] = ["rust-migration", "web-e2e", "web-ui"];
/// Cheap preflight stages that run alone so they observe an idle workspace.
const PREFLIGHT_STEPS: [&str; 2] = ["release-guard", "artifact-paths"];

fn verification_timeout(id: &str) -> Duration {
    // The complete single-worker browser suite takes over 30 minutes.
    Duration::from_secs(if matches!(id, "web-e2e" | "web-ui") {
        3600
    } else {
        1800
    })
}

/// Cooperative cancellation shared with detached prefetched stages.
#[derive(Clone, Default)]
struct Cancel(Arc<AtomicBool>);
impl Cancel {
    fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    fn cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

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
                "--shards=2",
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
                "--workers=2",
            ],
        ),
    ])
}
/// Compatibility policy for callers that require all non-E2E gates.
pub fn verification_steps_for(root: &Path, skip_e2e: bool) -> Result<Vec<Step>> {
    verification_steps_with_policy(root, skip_e2e, false)
}
pub fn verification_steps_with_policy(
    root: &Path,
    skip_e2e: bool,
    skip_tests: bool,
) -> Result<Vec<Step>> {
    let mut steps = verification_steps(root)?;
    if skip_tests {
        steps.retain(|step| {
            !matches!(
                step.id.as_str(),
                "unit-tests" | "workflow-tests" | "browser-tools" | "rust-migration"
            )
        });
    }
    if skip_e2e {
        steps.retain(|step| !matches!(step.id.as_str(), "web-e2e" | "web-ui"));
    }
    Ok(steps)
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
    async fn validate_inputs(&mut self) -> Result<()> {
        Ok(())
    }
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
    host.validate_inputs().await?;
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
    digest_tree(root, false)
}

fn digest_tree(root: &Path, dependencies: bool) -> Result<String> {
    fn collect(
        root: &Path,
        dir: &Path,
        files: &mut Vec<PathBuf>,
        dependencies: bool,
    ) -> Result<()> {
        for entry in fs::read_dir(dir).map_err(err)? {
            let entry = entry.map_err(err)?;
            let name = entry.file_name();
            let name = name.to_str().ok_or("Non-UTF8 deployment filename")?;
            if [".git", ".jait"].contains(&name)
                || (!dependencies && name == "node_modules")
                || name.ends_with(".tsbuildinfo")
            {
                continue;
            }
            if entry.file_type().map_err(err)?.is_dir() {
                collect(root, &entry.path(), files, dependencies)?;
            } else {
                files.push(entry.path().strip_prefix(root).map_err(err)?.to_owned());
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    collect(root, root, &mut files, dependencies)?;
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
            if dependencies {
                let target = fs::canonicalize(&full).map_err(err)?;
                let relative = target
                    .strip_prefix(root)
                    .map_err(|_| "External symlink prevents verification reuse")?;
                if relative.components().any(|part| {
                    let name = part.as_os_str().to_string_lossy();
                    name == ".git" || name == ".jait" || name.ends_with(".tsbuildinfo")
                }) {
                    return Err("Symlink to unhashed inputs prevents verification reuse".into());
                }
            }
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
    #[serde(default)]
    pub skip_e2e: bool,
    #[serde(default)]
    pub skip_tests: bool,
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
    validate_proof(
        &plan.proof,
        &verification_steps_with_policy(&plan.runtime, plan.skip_e2e, plan.skip_tests)?,
    )?;
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
    run_logged_cancellable(command, args, cwd, log, limit, None).await
}

/// Same contract as [`run_logged`], plus cooperative cancellation so a stage that
/// runs ahead of the ladder can still be torn down with its whole process group.
async fn run_logged_cancellable(
    command: &str,
    args: &[String],
    cwd: &Path,
    log: &Path,
    limit: Duration,
    cancel: Option<Cancel>,
) -> Result<()> {
    let output = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(log)
        .map_err(err)?;
    let mut term =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).map_err(err)?;
    let mut interrupt =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt()).map_err(err)?;
    if cancel.as_ref().is_some_and(|token| token.cancelled()) {
        return Err("Local deployment cancelled".into());
    }
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
    let mut progress = tokio::time::interval(Duration::from_secs(30));
    progress.tick().await;
    let mut cancel_watch = tokio::time::interval(Duration::from_millis(250));
    cancel_watch.tick().await;
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
            _ = cancel_watch.tick() => {
                if cancel.as_ref().is_some_and(|token| token.cancelled()) {
                    break Err("Local deployment cancelled".into());
                }
            }
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
        // SIGKILL is only queued here; drain the group so no descendant outlives this call.
        let drain = async {
            let _ = child.wait().await;
            loop {
                if unsafe { libc::kill(-pid, 0) } != 0 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        };
        let _ = tokio::time::timeout(Duration::from_secs(5), drain).await;
    }
    outcome
}

// Only deterministic, local checks may reuse a pass. Guards and browser checks
// observe external/runtime state and always run again.
fn resumable(step: &Step) -> bool {
    matches!(
        step.id.as_str(),
        "typecheck" | "unit-tests" | "lint" | "rust-migration"
    )
}
#[derive(Clone, Serialize, Deserialize)]
struct SavedPasses {
    version: u8,
    key: String,
    completed_at: u64,
    run: PathBuf,
    checks: Vec<Check>,
}
#[derive(Clone)]
struct Resume {
    key: String,
    context: String,
    saved: Option<SavedPasses>,
    completed: Arc<Mutex<Vec<Step>>>,
}
fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn resume_key(root: &Path, context: &str) -> Result<String> {
    let mut hash = Sha256::new();
    hash.update(b"jait-verification-resume-v1\0");
    hash.update(context);
    hash.update(digest_tree(root, true)?);
    Ok(hex::encode(hash.finalize()))
}
impl Resume {
    fn reused(&self, step: &Step) -> Option<&SavedPasses> {
        self.saved.as_ref().filter(|saved| {
            resumable(step)
                && saved
                    .checks
                    .iter()
                    .any(|check| check.passed && check.step == *step)
        })
    }
    fn record(&self, step: &Step) {
        if resumable(step) {
            self.completed.lock().unwrap().push(step.clone());
        }
    }
}

pub struct FilesystemVerificationHost {
    pub root: PathBuf,
    pub logs: PathBuf,
    cancel: Cancel,
    pending: Vec<Step>,
    running: BTreeMap<String, JoinHandle<Result<()>>>,
    resume: Option<Resume>,
}
impl FilesystemVerificationHost {
    /// Prefetched stages start only after the preflight pair has finished, so the
    /// cheap workspace guards still observe an idle tree.
    pub fn new(root: PathBuf, logs: PathBuf, steps: &[Step]) -> Self {
        let pending = steps
            .iter()
            .filter(|step| PREFETCHED_STEPS.contains(&step.id.as_str()))
            .cloned()
            .collect();
        Self {
            root,
            logs,
            cancel: Cancel::default(),
            pending,
            running: BTreeMap::new(),
            resume: None,
        }
    }
    /// The launcher supplies tool/environment identity after frozen installation.
    /// Missing, corrupt or unsupported context disables reuse, never verification.
    pub fn enable_resume(&mut self) {
        let setup = || -> Result<Resume> {
            let value: serde_json::Value = serde_json::from_slice(
                &fs::read(self.root.join(".jait/verification-context.json")).map_err(err)?,
            )
            .map_err(err)?;
            let context = value["key"]
                .as_str()
                .filter(|key| valid_hash(key))
                .ok_or("Missing verification context")?
                .to_owned();
            let key = resume_key(&self.root, &context)?;
            let saved: Option<SavedPasses> = if value["fresh"] == true {
                None
            } else {
                fs::read(self.root.join(".jait/verification-passes.json"))
                    .ok()
                    .and_then(|bytes| serde_json::from_slice::<SavedPasses>(&bytes).ok())
                    .filter(|saved| {
                        saved.version == 1
                            && saved.key == key
                            && saved.completed_at <= now_seconds()
                            && now_seconds() - saved.completed_at < 24 * 60 * 60
                    })
            };
            Ok(Resume {
                key,
                context,
                saved,
                completed: Arc::default(),
            })
        };
        match setup() {
            Ok(resume) => self.resume = Some(resume),
            Err(error) => eprintln!("[local-deploy] Verification reuse unavailable: {error}"),
        }
    }
    /// Called after all subprocesses drain, including on a failed attempt. A
    /// changing source/dependency tree cannot publish reusable partial success.
    pub fn save_passes(&self) -> Result<()> {
        let Some(resume) = &self.resume else {
            return Ok(());
        };
        if resume_key(&self.root, &resume.context)? != resume.key {
            eprintln!("[local-deploy] Inputs changed; successful stages will not be reused");
            return Ok(());
        }
        let mut checks = resume
            .saved
            .as_ref()
            .map(|saved| saved.checks.clone())
            .unwrap_or_default();
        for step in resume.completed.lock().unwrap().iter() {
            checks.retain(|check| check.step.id != step.id);
            checks.push(Check {
                step: step.clone(),
                passed: true,
            });
        }
        let saved = SavedPasses {
            version: 1,
            key: resume.key.clone(),
            completed_at: resume
                .saved
                .as_ref()
                .map_or_else(now_seconds, |saved| saved.completed_at),
            run: self.logs.clone(),
            checks,
        };
        let path = self.root.join(".jait/verification-passes.json");
        let pending = path.with_extension("pending");
        fs::write(&pending, serde_json::to_vec(&saved).map_err(err)?).map_err(err)?;
        fs::rename(pending, path).map_err(err)
    }
    fn reuse(&self, step: &Step) -> Result<bool> {
        let Some(saved) = self.resume.as_ref().and_then(|resume| resume.reused(step)) else {
            return Ok(false);
        };
        let message = format!(
            "[local-deploy] {} reused successful verification from {}; key {}\n",
            step.id,
            saved.run.display(),
            saved.key
        );
        eprint!("{message}");
        fs::write(self.log_path(step), message).map_err(err)?;
        Ok(true)
    }
    fn log_path(&self, step: &Step) -> PathBuf {
        self.logs.join(format!("{}.log", step.id))
    }
    /// Start independent lanes when their predecessors have finished.
    fn start_prefetch(&mut self, current: &str) {
        if PREFLIGHT_STEPS.contains(&current) || self.pending.is_empty() {
            return;
        }
        // Keep browser gates in one lane: Playwright shares report/output paths.
        // Start that lane only when the ordinary checks (including browser-tools)
        // are finished, while a still-running Rust gate occupies the other lane.
        let browsers_ready = current == "rust-migration"
            && self
                .running
                .get(current)
                .is_some_and(|handle| !handle.is_finished());
        let mut previous_browser = None;
        for step in std::mem::take(&mut self.pending) {
            if step.id == current
                || self
                    .resume
                    .as_ref()
                    .is_some_and(|resume| resume.reused(&step).is_some())
            {
                continue;
            }
            let browser = matches!(step.id.as_str(), "web-e2e" | "web-ui");
            if browser && !browsers_ready {
                self.pending.push(step);
                continue;
            }
            let predecessor = if browser {
                previous_browser.take()
            } else {
                None
            };
            let completion = if browser {
                let (sender, receiver) = tokio::sync::oneshot::channel::<bool>();
                previous_browser = Some(receiver);
                Some(sender)
            } else {
                None
            };
            let log = self.log_path(&step);
            eprintln!(
                "[local-deploy] {}; log: {} (started early)",
                step.id,
                log.display()
            );
            let (command, args, root, cancel) = (
                step.command.clone(),
                step.args.clone(),
                self.root.clone(),
                self.cancel.clone(),
            );
            let timeout = verification_timeout(&step.id);
            let receipt = self.resume.clone();
            let completed_step = step.clone();
            self.running.insert(
                step.id.clone(),
                tokio::spawn(async move {
                    if let Some(predecessor) = predecessor
                        && predecessor.await != Ok(true)
                    {
                        return Err("Previous browser stage failed".into());
                    }
                    let result =
                        run_logged_cancellable(&command, &args, &root, &log, timeout, Some(cancel))
                            .await;
                    if result.is_ok()
                        && let Some(receipt) = receipt
                    {
                        receipt.record(&completed_step);
                    }
                    if let Some(completion) = completion {
                        let _ = completion.send(result.is_ok());
                    }
                    result
                }),
            );
        }
    }
}
impl Drop for FilesystemVerificationHost {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}
impl VerificationHost for FilesystemVerificationHost {
    async fn validate_inputs(&mut self) -> Result<()> {
        if let Some(resume) = &self.resume
            && resume_key(&self.root, &resume.context)? != resume.key
        {
            return Err("Verification inputs changed during checks; refusing deployment".into());
        }
        Ok(())
    }
    async fn fingerprint(&mut self) -> Result<String> {
        tree_digest(&self.root)
    }
    async fn run(&mut self, step: &Step) -> Result<()> {
        self.start_prefetch(&step.id);
        let result = if let Err(error) = self.reuse(step) {
            Err(error)
        } else if self
            .resume
            .as_ref()
            .is_some_and(|resume| resume.reused(step).is_some())
        {
            Ok(())
        } else if let Some(handle) = self.running.remove(&step.id) {
            handle
                .await
                .map_err(|error| format!("{} stage aborted: {error}", step.id))
                .and_then(|result| result)
        } else {
            eprintln!(
                "[local-deploy] {}; log: {}",
                step.id,
                self.log_path(step).display()
            );
            run_logged_cancellable(
                &step.command,
                &step.args,
                &self.root,
                &self.log_path(step),
                verification_timeout(&step.id),
                Some(self.cancel.clone()),
            )
            .await
        };
        if result.is_ok()
            && let Some(resume) = &self.resume
            && resume.reused(step).is_none()
        {
            resume.record(step);
        }
        if result.is_err() {
            // The CLI exits immediately on failure. Keep its runtime alive until
            // every prefetched stage has torn down its entire process group.
            self.cancel.cancel();
            for (_, handle) in std::mem::take(&mut self.running) {
                let _ = handle.await;
            }
        }
        result
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

#[cfg(test)]
mod parallel_tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("src/execution/.jait/artifacts/parallel-tests")
                .join(format!(
                    "{}-{}",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos()
                ));
            fs::create_dir_all(directory.join(".jait/logs")).unwrap();
            Self(directory)
        }
        fn stage(&self, id: &str, body: &str) -> Step {
            step(
                id,
                "node",
                &[
                    "--eval",
                    &format!(
                        "const fs = require('node:fs'); \
                 const marker = n => '.jait/' + n; \
                 const exists = n => fs.existsSync(marker(n)); \
                 const write = n => fs.writeFileSync(marker(n), 'ready'); \
                 const wait = async n => {{ \
                   const deadline = Date.now() + 5000; \
                   while (!exists(n)) {{ \
                     if (Date.now() > deadline) throw Error('Missing marker: ' + n); \
                     await new Promise(r => setTimeout(r, 10)); \
                   }} \
                 }}; \
                 (async () => {{ {body} }})().catch(e => {{ console.error(e); process.exitCode = 1; }});"
                    ),
                ],
            )
        }
        fn host(&self, steps: &[Step]) -> FilesystemVerificationHost {
            FilesystemVerificationHost::new(self.0.clone(), self.0.join(".jait/logs"), steps)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[tokio::test]
    async fn browser_lane_overlaps_rust_but_keeps_browser_order_and_proof_order() {
        let fixture = Fixture::new();
        let steps = vec![
            fixture.stage("release-guard", "if (exists('rust-started')) throw Error('early Rust');"),
            fixture.stage("artifact-paths", "if (exists('rust-started')) throw Error('early Rust'); write('preflight');"),
            fixture.stage("typecheck", "await wait('rust-started');"),
            fixture.stage("browser-tools", "if (exists('e2e-started')) throw Error('early browser'); write('tools-done');"),
            fixture.stage("rust-migration", "await wait('preflight'); write('rust-started'); await wait('ui-done');"),
            fixture.stage("web-e2e", "if (!exists('tools-done')) throw Error('tools still running'); write('e2e-started'); await wait('rust-started'); write('e2e-done');"),
            fixture.stage("web-ui", "if (!exists('e2e-done')) throw Error('browsers overlapped'); write('ui-done');"),
        ];
        let proof = verify(&mut fixture.host(&steps), &steps).await.unwrap();
        assert_eq!(
            proof
                .checks
                .iter()
                .map(|check| &check.step)
                .collect::<Vec<_>>(),
            steps.iter().collect::<Vec<_>>()
        );
        validate_proof(&proof, &steps).unwrap();
    }

    #[tokio::test]
    async fn failed_browser_does_not_start_the_next_browser() {
        let fixture = Fixture::new();
        let steps = vec![
            fixture.stage("typecheck", "await wait('rust-started');"),
            fixture.stage(
                "rust-migration",
                "write('rust-started'); await wait('e2e-failed');",
            ),
            fixture.stage("web-e2e", "write('e2e-failed'); process.exitCode = 18;"),
            fixture.stage("web-ui", "write('ui-started');"),
        ];
        let error = verify(&mut fixture.host(&steps), &steps).await.unwrap_err();
        assert!(error.contains("web-e2e.log"), "{error}");
        assert!(!fixture.0.join(".jait/ui-started").exists());
    }

    #[tokio::test]
    async fn failed_rust_drains_the_active_browser_and_cancels_queued_ui() {
        let fixture = Fixture::new();
        let steps = vec![
            fixture.stage("typecheck", "await wait('rust-started');"),
            fixture.stage("rust-migration", "write('rust-started'); await wait('browser-pid'); process.exitCode = 17;"),
            fixture.stage("web-e2e", "fs.writeFileSync(marker('browser-pid'), String(process.pid)); await new Promise(r => setTimeout(r, 30000));"),
            fixture.stage("web-ui", "write('ui-started');"),
        ];
        let error = verify(&mut fixture.host(&steps), &steps).await.unwrap_err();
        assert!(error.contains("rust-migration.log"), "{error}");
        let pid = fs::read_to_string(fixture.0.join(".jait/browser-pid"))
            .unwrap()
            .parse::<i32>()
            .unwrap();
        // SAFETY: read-only liveness check for our own fixture subprocess.
        assert_ne!(
            unsafe { libc::kill(pid, 0) },
            0,
            "browser outlived verification"
        );
        assert!(!fixture.0.join(".jait/ui-started").exists());
    }

    #[tokio::test]
    async fn completed_failed_rust_does_not_launch_browsers() {
        let fixture = Fixture::new();
        let steps = vec![
            fixture.stage(
                "typecheck",
                "await wait('rust-failed'); await new Promise(r => setTimeout(r, 100));",
            ),
            fixture.stage(
                "rust-migration",
                "write('rust-failed'); process.exitCode = 17;",
            ),
            fixture.stage("web-e2e", "write('e2e-started');"),
            fixture.stage("web-ui", "write('ui-started');"),
        ];
        let error = verify(&mut fixture.host(&steps), &steps).await.unwrap_err();
        assert!(error.contains("rust-migration.log"), "{error}");
        assert!(!fixture.0.join(".jait/e2e-started").exists());
        assert!(!fixture.0.join(".jait/ui-started").exists());
    }
}
