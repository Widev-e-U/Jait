//! Bounded, isolated subprocess transport for test-only TypeScript reference adapters.
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::{
    fs::{self, File},
    io::Read,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Condvar, Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};

const INPUT_LIMIT: usize = 65_536;
const OUTPUT_LIMIT: u64 = 262_144;
// The deadline guards against a wedged driver, not against normal startup cost.
// Every call boots a fresh Bun process, so a whole contract binary running in
// parallel pays interpreter startup on each thread at once; that latency is
// load-dependent and far exceeds the sub-second cost of an isolated call.
const DRIVER_DEADLINE: Duration = Duration::from_secs(180);
const MAX_CONCURRENT_DRIVERS: usize = 4;
static ACTIVE_DRIVERS: Mutex<usize> = Mutex::new(0);
static DRIVER_SLOT_READY: Condvar = Condvar::new();

struct DriverSlot;
impl DriverSlot {
    fn acquire() -> Self {
        let mut active = ACTIVE_DRIVERS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        while *active >= MAX_CONCURRENT_DRIVERS {
            active = DRIVER_SLOT_READY
                .wait(active)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        *active += 1;
        Self
    }
}
impl Drop for DriverSlot {
    fn drop(&mut self) {
        let mut active = ACTIVE_DRIVERS
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *active = active.saturating_sub(1);
        DRIVER_SLOT_READY.notify_one();
    }
}
struct OwnedChild(Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
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
    let mut command = Command::new(bun);
    command
        .arg(root.join("tests/contract/drivers/internals.ts"))
        .current_dir(root)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("HOME", work.join("home"))
        .env("USERPROFILE", work.join("home"))
        .env("TMPDIR", work.join("tmp"))
        .env("TEMP", work.join("tmp"))
        .env("TMP", work.join("tmp"))
        .env("NODE_ENV", "test")
        .env("__JAIT_CLI", "1")
        .env("JAIT_STATE_DIR", work.join("state"))
        .stdin(Stdio::from(File::open(input_path)?))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(value) = std::env::var_os("SYSTEMROOT") {
        command.env("SYSTEMROOT", value);
    }
    let _slot = DriverSlot::acquire();
    let mut child = OwnedChild(
        command
            .spawn()
            .context("start TypeScript reference driver (requires Bun)")?,
    );
    let stdout = reader(child.0.stdout.take().context("missing driver stdout")?);
    let stderr = reader(child.0.stderr.take().context("missing driver stderr")?);
    let deadline = Instant::now() + DRIVER_DEADLINE;
    let mut output = None;
    let mut errors = None;
    loop {
        ensure!(!cancelled(), "internal driver cancelled");
        ensure!(
            Instant::now() < deadline,
            "internal driver exceeded {} seconds",
            DRIVER_DEADLINE.as_secs()
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
                "internal driver output exceeds 256 KiB"
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
                "internal driver output exceeds 256 KiB"
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cancellation_is_checked_before_creating_artifacts_or_spawning() {
        let absent = Path::new("/__jait_contract_nonexistent__");
        let error = call(absent, absent, json!({"version":1,"calls":[]}), &|| true).unwrap_err();
        assert!(error.to_string().contains("cancelled"));
    }

    #[test]
    fn malformed_protocol_is_rejected_before_spawning() {
        let absent = Path::new("/__jait_contract_nonexistent__");
        for input in [
            json!({"version":2,"calls":[]}),
            json!({"version":1,"calls":vec![Value::Null; 65]}),
        ] {
            let error = call(absent, absent, input, &|| false).unwrap_err();
            assert!(error.to_string().contains("unsupported driver protocol"));
        }
        let error = call(absent, absent, json!({"version":1}), &|| false).unwrap_err();
        assert!(error.to_string().contains("calls must be an array"));
    }

    #[test]
    fn oversized_request_is_rejected_before_spawning() {
        let absent = Path::new("/__jait_contract_nonexistent__");
        let error = call(
            absent,
            absent,
            json!({"version":1,"calls":[{"op":"auth.public","path":"x".repeat(INPUT_LIMIT)}]}),
            &|| false,
        )
        .unwrap_err();
        assert!(error.to_string().contains("input exceeds 64 KiB"));
    }

    #[test]
    fn output_reader_stops_after_limit_plus_detection_byte() {
        let bytes = reader(std::io::Cursor::new(vec![b'x'; OUTPUT_LIMIT as usize * 2]))
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .unwrap();
        assert_eq!(bytes.len() as u64, OUTPUT_LIMIT + 1);
    }
}
