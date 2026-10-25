// Bidirectional transport keeps polling/retry fixtures controlled by Rust assertions.
use serde_json::{Value, json};
use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::{Once, mpsc},
    thread,
    time::{Duration, Instant},
};
// Only the explicitly selected scanner corpus may read this fixture cache.
fn scoped_trivy_cache(root: &Path, cache: &Path) -> std::io::Result<std::path::PathBuf> {
    let cache = cache.canonicalize()?;
    let boundary = root.canonicalize()?.join(".jait");
    if !cache.starts_with(boundary) || !cache.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "scanner fixture cache must be a directory inside the project .jait directory",
        ));
    }
    Ok(cache)
}

const OLLAMA_FIXTURE_URL: &str = "http://127.0.0.1:11434";

fn validate_local_ollama_model(catalog: &Value, model: &str) -> std::io::Result<()> {
    let invalid = || {
        std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Ollama fixture requires an installed local GGUF model",
        )
    };
    if model.is_empty()
        || model.len() > 256
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_./:".contains(&byte))
        || model.contains("cloud")
    {
        return Err(invalid());
    }
    let entry = catalog["models"]
        .as_array()
        .and_then(|models| models.iter().find(|entry| entry["name"] == model))
        .ok_or_else(invalid)?;
    if !entry["remote_host"].is_null()
        || !entry["remote_model"].is_null()
        || entry["details"]["format"] != "gguf"
        || !entry["size"].as_u64().is_some_and(|size| size > 0)
    {
        return Err(invalid());
    }
    Ok(())
}

fn scoped_local_ollama_model() -> std::io::Result<String> {
    let model = std::env::var("JAIT_TEST_OLLAMA_MODEL").map_err(|_| {
        std::io::Error::other("set JAIT_TEST_OLLAMA_MODEL to an installed local GGUF model")
    })?;
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(std::io::Error::other)?;
    let response = client
        .get(format!("{OLLAMA_FIXTURE_URL}/api/tags"))
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(std::io::Error::other)?;
    let mut bytes = Vec::new();
    response.take(1_048_577).read_to_end(&mut bytes)?;
    if bytes.len() > 1_048_576 {
        return Err(std::io::Error::other(
            "Ollama model inventory exceeds 1 MiB",
        ));
    }
    let catalog: Value = serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
    validate_local_ollama_model(&catalog, &model)?;
    Ok(model)
}

// Peers may customize Error stacks. Classify terminal errors from Rust verdicts.
fn peer_error(message: &Value, counts: &[usize], last: &[bool]) -> String {
    if let Some(slot) = counts
        .iter()
        .zip(last)
        .position(|(count, pass)| *count > 0 && !*pass)
    {
        return format!(
            "final observation failed at assertion {slot}; peer error: {}",
            message["message"]
        );
    }
    message["message"].to_string()
}

const CLEANUP_TIMEOUT: Duration = Duration::from_secs(2);
/// Per-run scratch sandboxes (fake HOME/TMPDIR, assertion stream, stderr log).
const RUN_ROOT: &str = ".jait/artifacts/gateway-rust-readiness/tailstatic-runs";
/// Kept failing-run evidence expires after this age so a long-lived checkout
/// cannot accumulate unbounded sandboxes.
const RUN_RETENTION: Duration = Duration::from_secs(72 * 60 * 60);

/// Passing runs are scratch and delete themselves; keeping every sandbox once
/// cost this repository 68,778 directories and 62 GB. Set
/// `JAIT_TAILSTATIC_KEEP_RUNS=1` to retain passing runs while debugging the
/// harness itself.
fn keep_runs() -> bool {
    std::env::var("JAIT_TAILSTATIC_KEEP_RUNS").is_ok_and(|value| value != "0" && !value.is_empty())
}

/// Drop evidence left behind by earlier runs (timed-out or killed processes
/// leak their sandbox). Runs once per test process.
fn sweep_stale_runs(root: &Path) {
    static SWEEP: Once = Once::new();
    SWEEP.call_once(|| {
        let entries = match fs::read_dir(root.join(RUN_ROOT)) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let expired = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .is_ok_and(|modified| modified.elapsed().is_ok_and(|age| age > RUN_RETENTION));
            if expired {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    });
}

fn discard_run(directory: &Path) {
    if keep_runs() {
        return;
    }
    let _ = fs::remove_dir_all(directory);
}

// Every peer gets its own group. Only ordinary descendants which stay in that
// group are covered on Unix; deliberately detached sessions require a job/cgroup.
struct OwnedChild {
    process: Child,
    readers: Vec<thread::JoinHandle<()>>,
    cleaned: Option<bool>,
}
impl OwnedChild {
    fn spawn(command: &mut Command) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        Ok(Self {
            process: command.spawn()?,
            readers: Vec::new(),
            cleaned: None,
        })
    }

    fn wait_until(&mut self, deadline: Instant) -> std::io::Result<std::process::ExitStatus> {
        loop {
            if let Some(status) = self.process.try_wait()? {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "fixture exit deadline",
                ));
            }
            thread::sleep(Duration::from_millis(5));
        }
    }

    // Never panic from Drop, including while another assertion is unwinding.
    // The shared deadline bounds reaping and pipe-reader shutdown together.
    fn cleanup(&mut self) -> bool {
        if let Some(result) = self.cleaned {
            return result;
        }
        let deadline = Instant::now() + CLEANUP_TIMEOUT;
        #[cfg(unix)]
        {
            unsafe extern "C" {
                fn kill(pid: i32, signal: i32) -> i32;
            }
            // SAFETY: spawn established PGID == child PID, strictly positive.
            // A negative PID addresses only that isolated group. SIGKILL is 9
            // on the Unix platforms supported by this fixture harness.
            if let Ok(pid) = i32::try_from(self.process.id()) {
                unsafe {
                    kill(-pid, 9);
                }
            }
        }
        #[cfg(windows)]
        {
            // taskkill is a helper process too: do not wait on it indefinitely.
            let executable = std::env::var_os("SYSTEMROOT")
                .map(|root| std::path::PathBuf::from(root).join("System32/taskkill.exe"))
                .unwrap_or_else(|| "taskkill.exe".into());
            if let Ok(mut killer) = Command::new(executable)
                .args(["/PID", &self.process.id().to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
            {
                let helper_deadline = Instant::now() + Duration::from_millis(500);
                while matches!(killer.try_wait(), Ok(None)) && Instant::now() < helper_deadline {
                    thread::sleep(Duration::from_millis(5));
                }
                let _ = killer.kill();
                // try_wait only: even the fallback must remain bounded.
                while matches!(killer.try_wait(), Ok(None)) && Instant::now() < deadline {
                    thread::sleep(Duration::from_millis(5));
                }
            }
        }
        let _ = self.process.kill();
        let reaped = self.wait_until(deadline).is_ok();
        while self.readers.iter().any(|reader| !reader.is_finished()) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        let mut joined = true;
        for reader in self.readers.drain(..) {
            if reader.is_finished() {
                joined &= reader.join().is_ok();
            } else {
                // An escaped descendant can retain a pipe. Detach instead of
                // letting a reader join hang the contract runner forever.
                joined = false;
            }
        }
        let result = reaped && joined;
        self.cleaned = Some(result);
        result
    }
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

// A peer which stops reading replies must not bypass the fixture deadline by
// blocking the assertion thread in write/flush. Only one reply is outstanding.
struct FixtureInput {
    send: mpsc::Sender<String>,
    acknowledged: mpsc::Receiver<std::io::Result<()>>,
}
impl FixtureInput {
    fn new(child: &mut OwnedChild) -> Self {
        let mut input = child.process.stdin.take().expect("fixture stdin");
        let (send, receive) = mpsc::channel::<String>();
        let (acknowledge, acknowledged) = mpsc::channel();
        child.readers.push(thread::spawn(move || {
            while let Ok(message) = receive.recv() {
                let result = writeln!(input, "{message}").and_then(|_| input.flush());
                let failed = result.is_err();
                if acknowledge.send(result).is_err() || failed {
                    break;
                }
            }
        }));
        Self { send, acknowledged }
    }

    fn write(&self, message: String, deadline: Instant) -> std::io::Result<()> {
        if Instant::now() >= deadline {
            return Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "fixture input deadline",
            ));
        }
        self.send.send(message).map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "fixture input disconnected")
        })?;
        self.acknowledged
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .map_err(|error| {
                std::io::Error::new(
                    match error {
                        mpsc::RecvTimeoutError::Timeout => std::io::ErrorKind::TimedOut,
                        mpsc::RecvTimeoutError::Disconnected => std::io::ErrorKind::BrokenPipe,
                    },
                    "fixture input deadline/disconnect",
                )
            })?
    }
}

pub fn run(
    root: &Path,
    file: &str,
    name: &str,
    rules: &[Value],
    compare: impl Fn(&Value, &Value) -> bool,
) {
    run_inner(root, file, name, rules, compare, None);
}

#[allow(dead_code)]
pub struct SourceReview<'a> {
    pub source: &'a Path,
    pub copy: &'a Path,
    pub cancelled: &'a dyn Fn() -> bool,
}

#[allow(dead_code)]
pub fn run_source(
    root: &Path,
    file: &str,
    name: &str,
    rules: &[Value],
    compare: impl Fn(&Value, &Value) -> bool,
    review: SourceReview<'_>,
) {
    run_inner(root, file, name, rules, compare, Some(review));
}

fn run_inner(
    root: &Path,
    file: &str,
    name: &str,
    rules: &[Value],
    compare: impl Fn(&Value, &Value) -> bool,
    review: Option<SourceReview<'_>>,
) {
    assert!(
        !review.as_ref().is_some_and(|review| (review.cancelled)()),
        "source review cancelled"
    );
    sweep_stale_runs(root);
    let directory = root
        .join(RUN_ROOT)
        .join(format!("stream-{}", uuid::Uuid::new_v4()));
    for child in ["home", "tmp", "state"] {
        fs::create_dir_all(directory.join(child)).expect("fixture artifact directory");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let request = json!({"file":file,"name":name});
    fs::write(directory.join("request.json"), request.to_string()).unwrap();
    // Bun's built-in ws lacks unexpected-response; this real socket scenario
    // runs unchanged on Node with the installed ws package and a TS loader.
    // Bun 1.3.10 execFileSync does not inherit mutations to process.env
    // unless env is supplied explicitly. The original Vitest lifecycle fixture
    // relies on Node's current-environment inheritance to label child sandboxes.
    // Preserve that runtime boundary instead of rewriting the source fixture.
    let ollama_peer =
        name.starts_with("tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_");
    let node_peer = name.contains("routes_browser_devtools_test")
        // Bun's built-in ws fails noServer.handleUpgrade before the preview echo.
        // Exercise the original socket scenario with the installed ws on Node.
        || name == "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_127_1"
        || name.contains("security_agent_sandbox_lifecycle_integration_test")
        // Preserve the original Node process.execPath input in CLI fixtures.
        || name.contains("gateway_src_cli_start_test")
        || name.contains("gateway_src_cli_update_test");
    let mut command = if node_peer {
        let mut command = Command::new("node");
        command
            .arg("--no-warnings")
            .arg("--loader")
            .arg(root.join("tests/contract/drivers/tail-node-loader.mjs"))
            .arg(root.join("tests/contract/drivers/tailstream.ts"));
        command
    } else {
        let mut command =
            Command::new(std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into()));
        command
            .arg("--no-env-file")
            .arg("test")
            .arg(if ollama_peer {
                "--timeout=330000"
            } else {
                "--timeout=120000"
            })
            .arg(root.join("tests/contract/drivers/tail-peer.test.ts"));
        command
    };
    command
        .current_dir(root)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("HOME", directory.join("home"))
        .env("USERPROFILE", directory.join("home"))
        .env("TMPDIR", directory.join("tmp"))
        .env("TEMP", directory.join("tmp"))
        .env("TMP", directory.join("tmp"))
        .env("NODE_ENV", "test")
        .env("__JAIT_CLI", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("JAIT_ASSERTION_STREAM", "1")
        .env(
            "PLAYWRIGHT_BROWSERS_PATH",
            root.join(".jait/artifacts/playwright-browsers"),
        )
        .env("JAIT_ASSERTION_DIR", &directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(review) = &review {
        command.env(
            "JAIT_SOURCE_REVIEW_OVERRIDE",
            json!({"source":review.source,"copy":review.copy}).to_string(),
        );
    }
    if name.starts_with("tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_")
        && let Some(cache) = std::env::var_os("JAIT_TEST_TRIVY_CACHE")
    {
        let cache = scoped_trivy_cache(root, Path::new(&cache))
            .expect("bounded existing scanner fixture cache");
        command.env("JAIT_TEST_TRIVY_CACHE", cache);
    }
    if ollama_peer {
        let model = scoped_local_ollama_model()
            .expect("bounded loopback Ollama fixture with a local model");
        command
            .env("OLLAMA_E2E_URL", OLLAMA_FIXTURE_URL)
            .env("OLLAMA_E2E_MODEL", model);
    }
    if let Some(value) = std::env::var_os("SYSTEMROOT") {
        command.env("SYSTEMROOT", value);
    }
    let deadline = Instant::now() + Duration::from_secs(if ollama_peer { 330 } else { 120 });
    let mut child = OwnedChild::spawn(&mut command).expect("start fixture peer");
    let input = FixtureInput::new(&mut child);
    input
        .write(request.to_string(), deadline)
        .expect("write fixture request");
    let output = child.process.stdout.take().unwrap();
    let errors = child.process.stderr.take().unwrap();
    let stderr_path = directory.join("stderr.log");
    child.readers.push(thread::spawn(move || {
        let mut file = File::create(stderr_path).unwrap();
        let _ = std::io::copy(&mut errors.take(262145), &mut file);
    }));
    let (send, receive) = mpsc::sync_channel(4);
    child.readers.push(thread::spawn(move || {
        let mut output = BufReader::new(output);
        loop {
            let mut bytes = Vec::new();
            let result = output.by_ref().take(262145).read_until(b'\n', &mut bytes);
            match result {
                Ok(0) => break,
                Ok(_) if bytes.len() <= 262144 => {
                    if send.send(Ok(bytes)).is_err() {
                        break;
                    }
                }
                Ok(_) => {
                    let _ = send.send(Err("fixture observation exceeds 256 KiB".to_owned()));
                    break;
                }
                Err(error) => {
                    let _ = send.send(Err(error.to_string()));
                    break;
                }
            }
        }
    }));
    let mut trace = File::create(directory.join("assertions.jsonl")).unwrap();
    let mut stdout_log = File::create(directory.join("stdout.log")).unwrap();
    let mut protocol_log = File::create(directory.join("protocol.jsonl")).unwrap();
    let mut stdout_bytes = 0;
    let mut counts = vec![0usize; rules.len()];
    let mut last = vec![true; rules.len()];
    loop {
        assert!(
            Instant::now() < deadline,
            "{name}: fixture deadline; {}",
            directory.display()
        );
        let remaining = deadline.saturating_duration_since(Instant::now());
        assert!(
            !review.as_ref().is_some_and(|review| (review.cancelled)()),
            "source review cancelled"
        );
        let wait = if review.is_some() {
            remaining.min(Duration::from_millis(100))
        } else {
            remaining
        };
        let received = receive.recv_timeout(wait);
        if review.is_some() && matches!(received, Err(mpsc::RecvTimeoutError::Timeout)) {
            continue;
        }
        let line = received
            .unwrap_or_else(|error| {
                panic!(
                    "{name}: fixture deadline/disconnect: {error}; {}",
                    directory.display()
                )
            })
            .expect("fixture read failed");
        let prefix = b"\x1eJAIT_ASSERTION ";
        let Some(offset) = line.windows(prefix.len()).position(|part| part == prefix) else {
            stdout_bytes += line.len();
            assert!(
                stdout_bytes <= 2 * 1024 * 1024,
                "fixture stdout exceeds 2 MiB"
            );
            stdout_log.write_all(&line).unwrap();
            continue;
        };
        stdout_bytes += offset;
        assert!(
            stdout_bytes <= 2 * 1024 * 1024,
            "fixture stdout exceeds 2 MiB"
        );
        stdout_log.write_all(&line[..offset]).unwrap();
        let payload = &line[offset + prefix.len()..];
        protocol_log.write_all(payload).unwrap();
        let mut message: Value = serde_json::from_slice(payload).expect("fixture protocol JSON");
        if message["event"] == "payload" {
            let filename = message["file"].as_str().expect("payload filename");
            assert!(
                filename.starts_with("payload-")
                    && filename.ends_with(".json")
                    && filename
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"-.".contains(&c)),
                "invalid payload filename"
            );
            let file = File::open(directory.join(filename)).expect("fixture payload");
            let mut bytes = Vec::new();
            file.take(16 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .unwrap();
            assert!(
                bytes.len() <= 16 * 1024 * 1024,
                "fixture payload exceeds 16 MiB"
            );
            message = serde_json::from_slice(&bytes).expect("fixture payload JSON");
        }
        match message["event"].as_str().expect("fixture event") {
            "assertion" => {
                let observation = &message["observation"];
                let slot = observation["slot"].as_u64().expect("assertion slot") as usize;
                let rule = rules.get(slot).expect("unknown assertion slot");
                let pass = compare(observation, rule) != (rule["negate"] == true);
                counts[slot] += 1;
                last[slot] = pass;
                writeln!(
                    trace,
                    "{}",
                    json!({"slot":slot,"pass":pass,"observation":observation})
                )
                .unwrap();
                input
                    .write(
                        json!({"pass":pass,"message":format!("site {slot}: {rule}")}).to_string(),
                        deadline,
                    )
                    .expect("write fixture assertion reply");
            }
            "complete" => break,
            "error" => panic!(
                "{name}: {}; inspect {}",
                peer_error(&message, &counts, &last),
                directory.display()
            ),
            event => panic!("unknown fixture event: {event}"),
        }
    }
    assert!(
        counts.iter().sum::<usize>() > 0,
        "{name}: no assertions executed"
    );
    for (slot, count) in counts.iter().enumerate() {
        assert!(
            *count > 0 || rules[slot]["optional"] == true || rules[slot]["conditional"] == true,
            "{name}: assertion {slot} was never observed"
        );
        assert!(
            last[slot],
            "{name}: final observation failed at assertion {slot}; inspect {}",
            directory.display()
        );
    }
    drop(input);
    drop(receive); // Unblock a reader sending queued output before cleanup joins it.
    let status = child
        .wait_until(deadline)
        .expect("wait for fixture peer before deadline");
    assert!(
        child.cleanup(),
        "fixture cleanup incomplete; {}",
        directory.display()
    );
    assert!(
        status.success(),
        "{name}: fixture peer failed; {}",
        directory.display()
    );
    // Every assertion above passed. Close the evidence files before removing the
    // sandbox (Windows refuses to delete a directory that still has open handles).
    // A failing run panics before this point, so its sandbox survives to be
    // inspected at the path printed in the failure message.
    drop(trace);
    drop(stdout_log);
    drop(protocol_log);
    discard_run(&directory);
}

#[cfg(test)]
mod local_ollama_tests {
    use super::*;

    fn catalog() -> Value {
        json!({"models":[{"name":"fixture:tiny","size":64,"details":{"format":"gguf"}}]})
    }

    #[test]
    fn accepts_only_an_installed_local_model() {
        assert!(validate_local_ollama_model(&catalog(), "fixture:tiny").is_ok());
        assert!(validate_local_ollama_model(&catalog(), "missing:tiny").is_err());
        for name in [
            "",
            "fixture:cloud",
            "fixture cloud",
            "fixture;command",
            "fixture\ncommand",
        ] {
            assert!(validate_local_ollama_model(&catalog(), name).is_err());
        }
    }

    #[test]
    fn rejects_cloud_stubs_and_malformed_catalogs() {
        for (key, value) in [
            ("remote_host", json!("https://ollama.com")),
            ("remote_model", json!("remote")),
            ("size", json!(0)),
            ("details", json!({})),
        ] {
            let mut cloud = catalog();
            cloud["models"][0][key] = value;
            assert!(validate_local_ollama_model(&cloud, "fixture:tiny").is_err());
        }
        for malformed in [Value::Null, json!({}), json!({"models":{}})] {
            assert!(validate_local_ollama_model(&malformed, "fixture:tiny").is_err());
        }
    }
}

#[cfg(test)]
mod peer_error_tests {
    use super::*;

    #[test]
    fn missing_peer_error_message_preserves_rust_assertion_failure() {
        let error = peer_error(
            &json!({"event":"error","message":"Error\n at observe"}),
            &[1, 1],
            &[true, false],
        );
        assert!(
            error.contains("final observation failed at assertion 1"),
            "{error}"
        );
    }

    #[test]
    fn setup_errors_and_recovered_retry_failures_do_not_gain_mutation_credit() {
        for (counts, last) in [(vec![0], vec![true]), (vec![2], vec![true])] {
            let error = peer_error(
                &json!({"event":"error","message":"fixture setup failed"}),
                &counts,
                &last,
            );
            assert!(!error.contains("final observation failed"), "{error}");
            assert!(error.contains("fixture setup failed"));
        }
    }
}
