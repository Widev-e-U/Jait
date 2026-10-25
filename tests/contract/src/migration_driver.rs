//! Bounded, isolated subprocess transport for backend-selectable migration adapters. Missing operations must fail, never skip.
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

const INPUT_LIMIT: usize = 65_536;
const OUTPUT_LIMIT: u64 = 2_097_152;
struct OwnedChild(Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        #[cfg(unix)]
        let _ = Command::new("/bin/kill")
            .args(["-KILL", "--", &format!("-{}", self.0.id())])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn reader(stream: impl Read + Send + 'static) -> mpsc::Receiver<std::io::Result<Vec<u8>>> {
    let (send, receive) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = stream
            .take(OUTPUT_LIMIT + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes);
        let _ = send.send(result);
    });
    receive
}

/// Sends a programmatically built request. Object key order follows `serde_json`'s
/// ordering, so prefer [`call_request`] whenever vector-authored key order is observable.
pub fn call(
    root: &Path,
    directory: &Path,
    input: Value,
    cancelled: &dyn Fn() -> bool,
) -> Result<Value> {
    call_request(root, directory, &serde_json::to_string(&input)?, cancelled)
}

/// Sends the request body verbatim so adapter-visible key order matches the vector source.
pub fn call_request(
    root: &Path,
    directory: &Path,
    request: &str,
    cancelled: &dyn Fn() -> bool,
) -> Result<Value> {
    ensure!(!cancelled(), "internal driver cancelled");
    let input: Value = serde_json::from_str(request).context("driver request must be JSON")?;
    let calls = input["calls"]
        .as_array()
        .context("driver calls must be an array")?;
    ensure!(
        input["version"] == 1 && calls.len() <= 64,
        "unsupported driver protocol or call count"
    );
    let expected_count = calls.len();
    let request = request.as_bytes();
    ensure!(request.len() <= INPUT_LIMIT, "driver input exceeds 64 KiB");
    let work = directory.join(format!("driver-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(work.join("home"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&work, fs::Permissions::from_mode(0o700))?;
    }
    fs::create_dir_all(work.join("tmp"))?;
    let input_path = work.join("input.json");
    fs::write(&input_path, request)?;
    let bun = std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into());
    let argv = std::env::var("JAIT_MIGRATION_ADAPTER_ARGV").ok();
    let args: Vec<String> = match argv {
        Some(ref json) => {
            serde_json::from_str(json).context("adapter argv must be a JSON array")?
        }
        None => vec![
            bun,
            "--no-env-file".into(),
            root.join("tests/contract/drivers/migration-boundaries.ts")
                .to_string_lossy()
                .into(),
        ],
    };
    ensure!(
        !args.is_empty() && args.len() <= 64 && !args[0].trim().is_empty(),
        "invalid adapter argv"
    );
    ensure!(
        args.iter().all(|a| !a.contains('\0') && a.len() <= 8192),
        "invalid adapter argument"
    );
    let mut command = Command::new(&args[0]);
    command
        .args(&args[1..])
        .current_dir(root)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("HOME", work.join("home"))
        .env("USERPROFILE", work.join("home"))
        .env("TMPDIR", work.join("tmp"))
        .env("TEMP", work.join("tmp"))
        .env("TMP", work.join("tmp"))
        .env("NODE_ENV", "test")
        .env("JAIT_STATE_DIR", work.join("state"))
        .stdin(Stdio::from(File::open(input_path)?))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(value) = std::env::var_os("SYSTEMROOT") {
        command.env("SYSTEMROOT", value);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = OwnedChild(
        command
            .spawn()
            .context("start TypeScript reference driver (requires Bun)")?,
    );
    let stdout = reader(child.0.stdout.take().context("missing driver stdout")?);
    let stderr = reader(child.0.stderr.take().context("missing driver stderr")?);
    // 120s rather than 30s: this suite runs beside vitest and two other cargo suites in
    // the deploy ladder. The heaviest single call (messenger.recover, count=50000) needs
    // ~17.5s with the machine idle, so a 30s bound reported load as a hang. A genuinely
    // wedged driver still exceeds this bound and still fails the test.
    let deadline = Instant::now() + Duration::from_secs(120);
    let mut output = None;
    let mut errors = None;
    loop {
        ensure!(!cancelled(), "internal driver cancelled");
        ensure!(
            Instant::now() < deadline,
            "internal driver exceeded 120 seconds"
        );
        if output.is_none()
            && let Ok(bytes) = stdout.try_recv()
        {
            output = Some(bytes?);
        }
        if errors.is_none()
            && let Ok(bytes) = stderr.try_recv()
        {
            errors = Some(bytes?);
        }
        for bytes in [&output, &errors].into_iter().flatten() {
            ensure!(
                bytes.len() as u64 <= OUTPUT_LIMIT,
                "internal driver output exceeds 2 MiB"
            );
        }
        if let Some(status) = child.0.try_wait()? {
            let output = match output {
                Some(value) => value,
                None => stdout.recv_timeout(Duration::from_secs(1))??,
            };
            let errors = match errors {
                Some(value) => value,
                None => stderr.recv_timeout(Duration::from_secs(1))??,
            };
            ensure!(
                output.len() as u64 <= OUTPUT_LIMIT && errors.len() as u64 <= OUTPUT_LIMIT,
                "internal driver output exceeds 2 MiB"
            );
            fs::write(work.join("output.json"), &output)?;
            fs::write(work.join("stderr.log"), &errors)?;
            if !status.success() {
                bail!(
                    "internal driver exited {status}; inspect {}",
                    work.display()
                );
            }
            let value: Value = serde_json::from_slice(&output).context("invalid driver JSON")?;
            ensure!(
                value["version"] == 1 && value["results"].is_array(),
                "invalid driver response schema"
            );
            ensure!(
                value["results"]
                    .as_array()
                    .is_some_and(|results| results.len() == expected_count),
                "driver result count does not match request"
            );
            return Ok(value["results"].clone());
        }
        thread::sleep(Duration::from_millis(10));
    }
}
