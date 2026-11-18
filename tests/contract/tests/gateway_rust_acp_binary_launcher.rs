//! Contract and differential tests for the native ACP binary launcher port.
//!
//! The install pipeline keeps real filesystem mutations (`std::fs`): every
//! assertion about modes, scratch directories, marker bytes, `rename` and
//! `realpath` containment runs against an owned disposable directory under
//! `.jait/artifacts/gateway-rust/parallel-20261020/acp-binary-launcher/`.
//!
//! Only the true external boundaries are injected: the clock, the lock polling
//! sleep, the HTTPS download and the archive tool. The archive tool fake runs
//! the real `tar` binary and additionally synthesises the members it lists, so
//! extraction content is deterministic without shipping binary archives.
//!
//! The differential test at the bottom drives the *actual* TypeScript launcher
//! (`packages/gateway/src/providers/acp-binary-launcher.ts`) through
//! `tests/contract/drivers/nativeacpbinarylauncher.ts` and compares the native
//! result against it. The driver is never used as an oracle for native
//! behaviour: it is the source implementation, executed.
//!
//! Nothing here is compiled or executed in the authoring container; the parent
//! compiles and runs on the host.

#[path = "../src/internal_driver.rs"]
mod internal_driver;

use std::cell::{Cell, RefCell};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::time::Duration;

use jait_gateway::providers::acp_binary_launcher::*;
use serde_json::{Value, json};
use sha2::Digest;

// ---------------------------------------------------------------------------
// Owned fixture space
// ---------------------------------------------------------------------------

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("repository root")
}

/// A fresh owned directory; never a system temporary directory and never a
/// path outside the lane artifact tree.
fn lane() -> PathBuf {
    let directory = root()
        .join(".jait/artifacts/gateway-rust/parallel-20261020/acp-binary-launcher")
        .join("native")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).expect("lane directory");
    directory
}

#[cfg(unix)]
fn mode_of(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .expect("metadata")
        .permissions()
        .mode()
        & 0o777
}

/// Mode bits are a POSIX-only concept: the source's `chmod` calls are skipped on
/// Windows. Returning a value that no assertion accepts keeps the crate
/// compiling there without pretending the check passed.
#[cfg(not(unix))]
fn mode_of(_path: &Path) -> u32 {
    u32::MAX
}

fn walk(base: &Path) -> Vec<String> {
    fn visit(base: &Path, current: &Path, out: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(current) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(base, &path, out);
            } else {
                out.push(
                    path.strip_prefix(base)
                        .expect("inside base")
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let mut files = Vec::new();
    visit(base, base, &mut files);
    files.sort();
    files
}

// ---------------------------------------------------------------------------
// Injected boundaries
// ---------------------------------------------------------------------------

/// Scripted download/tool boundary with a recorded clock.
struct FakeIo {
    clock: Cell<f64>,
    /// Body returned by the next download, and the URL that produced it.
    body: RefCell<Option<Vec<u8>>>,
    requested: RefCell<Vec<String>>,
    tools: RefCell<Vec<ToolInvocation>>,
    /// Listing text returned for `-tf` / `-Z1`, and members to materialise.
    listing: RefCell<String>,
    members: Vec<String>,
    /// Lock mtime script: each poll pops the next value; the last value repeats.
    lock_mtimes: RefCell<Vec<Option<f64>>>,
    sleeps: Cell<u64>,
    /// When true the archive tool also writes the listed members, mimicking a
    /// successful extraction into `-C <destination>`.
    materialise: bool,
    /// When true the fake delegates to the real `tar` binary instead of
    /// synthesising members, so extraction bytes match the TypeScript side.
    real_tar: bool,
    /// When true the download never resolves, so an install can be cancelled
    /// while the transfer is in flight.
    hang_download: bool,
}

impl FakeIo {
    fn new(body: &[u8], listing: &str, members: &[&str]) -> Self {
        Self {
            clock: Cell::new(1_000_000.0),
            body: RefCell::new(Some(body.to_vec())),
            requested: RefCell::new(Vec::new()),
            tools: RefCell::new(Vec::new()),
            listing: RefCell::new(listing.to_string()),
            members: members.iter().map(|m| m.to_string()).collect(),
            lock_mtimes: RefCell::new(Vec::new()),
            sleeps: Cell::new(0),
            materialise: true,
            real_tar: false,
            hang_download: false,
        }
    }

    /// Delegate archive listing and extraction to the installed `tar` binary.
    fn with_real_tar(self) -> Self {
        Self {
            real_tar: true,
            ..self
        }
    }

    /// Make the download boundary hang forever, modelling an install that is
    /// cancelled while the transfer is in flight.
    fn with_hanging_download(self) -> Self {
        Self {
            hang_download: true,
            ..self
        }
    }

    fn advance(&self, duration: Duration) {
        self.clock
            .set(self.clock.get() + duration.as_secs_f64() * 1000.0);
        self.sleeps.set(self.sleeps.get() + 1);
    }
}

impl LauncherIo for FakeIo {
    fn now_ms(&self) -> f64 {
        self.clock.get()
    }

    async fn sleep(&self, duration: Duration) {
        self.advance(duration);
    }

    async fn lock_mtime_ms(&self, _path: &Path) -> Option<f64> {
        let mut script = self.lock_mtimes.borrow_mut();
        match script.len() {
            0 => None,
            1 => script[0],
            _ => script.remove(0),
        }
    }

    fn download(
        &self,
        url: &str,
        _timeout: Duration,
    ) -> impl Future<Output = Result<Vec<u8>, LauncherError>> {
        self.requested.borrow_mut().push(url.to_string());
        let body = self.body.borrow_mut().take();
        let hang = self.hang_download;
        async move {
            if hang {
                return std::future::pending::<Result<Vec<u8>, LauncherError>>().await;
            }
            Ok(body.unwrap_or_else(|| b"missing-scripted-body".to_vec()))
        }
    }

    fn run_tool(
        &self,
        invocation: ToolInvocation,
    ) -> impl Future<Output = Result<String, LauncherError>> {
        self.tools.borrow_mut().push(invocation.clone());
        let listing = self.listing.borrow().clone();
        let members = self.members.clone();
        let materialise = self.materialise;
        let real_tar = self.real_tar;
        async move {
            if real_tar {
                let output = std::process::Command::new(&invocation.program)
                    .args(&invocation.args)
                    .output()
                    .expect("real archive tool");
                assert!(
                    output.status.success(),
                    "archive tool failed: {:?}",
                    invocation.args
                );
                return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
            }
            let listing_request = invocation
                .args
                .iter()
                .any(|arg| arg == "-tf" || arg == "-Z1");
            if listing_request {
                return Ok(listing);
            }
            if materialise {
                let destination = invocation
                    .args
                    .iter()
                    .position(|arg| arg == "-C" || arg == "-d")
                    .and_then(|index| invocation.args.get(index + 1))
                    .map(PathBuf::from)
                    .expect("extraction destination");
                for member in &members {
                    let path = destination.join(member);
                    if let Some(parent) = path.parent() {
                        std::fs::create_dir_all(parent).expect("member parent");
                    }
                    std::fs::write(&path, b"#!/bin/sh\nexit \"${JAIT_AGENT_EXIT-0}\"\n")
                        .expect("member body");
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
                        .expect("member mode");
                }
            }
            Ok(String::new())
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Spawned {
    command: PathBuf,
    args: Vec<String>,
    env: Vec<(String, String)>,
    forward_signals: bool,
}

struct FakeProcess {
    outcome: ExitOutcome,
    spawned: RefCell<Vec<Spawned>>,
}

impl FakeProcess {
    fn exiting(code: i32) -> Self {
        Self {
            outcome: ExitOutcome::code_only(code),
            spawned: RefCell::new(Vec::new()),
        }
    }

    fn signalled(signal: i32) -> Self {
        Self {
            outcome: ExitOutcome {
                code: None,
                signal: Some(signal),
            },
            spawned: RefCell::new(Vec::new()),
        }
    }
}

impl LauncherProcess for FakeProcess {
    fn run_child(
        &self,
        command: &Path,
        args: &[String],
        env: &[(String, String)],
        forward_signals: bool,
    ) -> impl Future<Output = Result<ExitOutcome, LauncherError>> {
        self.spawned.borrow_mut().push(Spawned {
            command: command.to_path_buf(),
            args: args.to_vec(),
            env: env.to_vec(),
            forward_signals,
        });
        let outcome = self.outcome;
        async move { Ok(outcome) }
    }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

fn base64url_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let first = chunk[0] as u32;
        let second = *chunk.get(1).unwrap_or(&0) as u32;
        let third = *chunk.get(2).unwrap_or(&0) as u32;
        let packed = (first << 16) | (second << 8) | third;
        out.push(ALPHABET[(packed >> 18) as usize & 0x3f] as char);
        out.push(ALPHABET[(packed >> 12) as usize & 0x3f] as char);
        if chunk.len() > 1 {
            out.push(ALPHABET[(packed >> 6) as usize & 0x3f] as char);
        }
        if chunk.len() > 2 {
            out.push(ALPHABET[packed as usize & 0x3f] as char);
        }
    }
    out
}

fn encode(value: Value) -> String {
    base64url_encode(serde_json::to_string(&value).expect("spec json").as_bytes())
}

fn spec_json(archive: &str) -> Value {
    json!({
        "id": "demo",
        "version": "1.2.3",
        "target": "linux-x64",
        "archive": archive,
        "cmd": "bin/agent",
        "args": ["--flag", "value"],
        "env": {"JAIT_AGENT_EXIT": "0"},
    })
}

fn decode_spec(value: Value) -> BinarySpec {
    parse_spec(Some(&encode(value))).expect("valid specification")
}

const GOOD_LISTING: &str = "./\n./bin/\n./bin/agent\n";

// ---------------------------------------------------------------------------
// Specification decoding and validation
// ---------------------------------------------------------------------------

#[test]
fn specification_decoding_matches_typescript_precedence() {
    // Absent specification: the launcher reports this before touching disk.
    let missing = parse_spec(None).expect_err("missing specification");
    assert_eq!(missing.message(), "Missing ACP binary launch specification");

    // Not JSON, not an object, empty object.
    for encoded in ["!!!!", "eyJhIjoxfQ", "e30"] {
        assert_eq!(
            parse_spec(Some(encoded)).expect_err(encoded).message(),
            "Invalid ACP binary launch specification",
            "{encoded}"
        );
    }

    // Identifier grammar, version/target/archive/cmd presence.
    for broken in [
        json!({"id": "Demo_1", "version": "1", "target": "t", "archive": "https://a/x.tgz", "cmd": "bin/a"}),
        json!({"id": "demo", "version": "", "target": "t", "archive": "https://a/x.tgz", "cmd": "bin/a"}),
        json!({"id": "demo", "version": "1", "target": "", "archive": "https://a/x.tgz", "cmd": "bin/a"}),
        json!({"id": "demo", "version": "1", "target": "t", "archive": "https://a/x.tgz", "cmd": ""}),
        json!({"id": ["demo"], "version": "1", "target": "t", "archive": "https://a/x.tgz", "cmd": "bin/a"}),
    ] {
        assert_eq!(
            parse_spec(Some(&encode(broken.clone())))
                .expect_err(&encode(broken))
                .message(),
            "Invalid ACP binary launch specification"
        );
    }

    // Transport restriction is reported before any filesystem work.
    let insecure = parse_spec(Some(&encode(spec_json("http://127.0.0.1:1/agent.tar.gz"))))
        .expect_err("insecure archive");
    assert_eq!(insecure.message(), "ACP binary downloads must use HTTPS");

    // Command must stay inside the install directory.
    for cmd in ["../bin/agent", "/bin/agent", "bin/../../agent", ""] {
        let mut value = spec_json("https://a/agent.tar.gz");
        value["cmd"] = json!(cmd);
        let parsed = parse_spec(Some(&encode(value)));
        let error = parsed
            .and_then(|spec| {
                resolve_archive_command(Path::new("/owned-root"), &spec.cmd).map(|_| spec)
            })
            .expect_err(cmd);
        let message = error.message();
        assert!(
            message.contains("unsafe binary command path")
                || message.contains("Invalid ACP binary launch specification"),
            "{cmd}: {message}"
        );
    }

    // Optional digest: 64 hex characters in either case, normalised to lower.
    let mut with_digest = spec_json("https://a/agent.tar.gz");
    with_digest["sha256"] =
        json!("14AFBD09A77B62239797673CF223B24E0275A21919AA54D3E2641C62A3FEB817");
    let parsed = decode_spec(with_digest);
    assert_eq!(
        parsed.sha256.as_deref(),
        Some("14afbd09a77b62239797673cf223b24e0275a21919aa54d3e2641c62a3feb817")
    );

    for bad in [
        "",
        "14afbd09",
        "zzafbd09a77b62239797673cf223b24e0275a21919aa54d3e2641c62a3feb817",
    ] {
        let mut value = spec_json("https://a/agent.tar.gz");
        value["sha256"] = json!(bad);
        let parsed = parse_spec(Some(&encode(value))).expect("invalid optional digest is ignored");
        assert_eq!(parsed.sha256, None, "{bad}");
    }

    // Non-string args and env values are dropped, order preserved.
    let mut filtered = spec_json("https://a/agent.tar.gz");
    filtered["args"] = json!(["--flag", 7, null, "value"]);
    filtered["env"] = json!({"A": "1", "B": 2, "C": null, "D": "4"});
    let parsed = decode_spec(filtered);
    assert_eq!(parsed.args, vec!["--flag".to_string(), "value".to_string()]);
    let mut env = parsed.env.clone();
    env.sort();
    assert_eq!(
        env,
        vec![
            ("A".to_string(), "1".to_string()),
            ("D".to_string(), "4".to_string())
        ]
    );
    assert_eq!(parsed.archive, "https://a/agent.tar.gz");
}

#[test]
fn path_helpers_reject_traversal_and_resolve_inside_the_root() {
    let base = PathBuf::from("/root");
    assert_eq!(
        resolve_path(&base, &["demo", "1.2.3", "linux-x64"]),
        PathBuf::from("/root/demo/1.2.3/linux-x64")
    );
    // Lexical normalisation keeps `assert_inside` honest before the directory
    // exists, which is exactly when the install path is validated.
    let inside = resolve_path(&base, &["demo", "1.2.3", "linux-x64"]);
    assert!(assert_inside(&base, &inside).is_ok());

    let mut spec = decode_spec(spec_json("https://a/agent.tar.gz"));
    spec.version = "../../escape".to_string();
    let escaped = install_directory(&base, &spec).expect_err("traversal version");
    assert_eq!(
        escaped.message(),
        "ACP agent archive escaped its install directory"
    );

    spec.version = "1.2.3".to_string();
    spec.target = "/etc".to_string();
    let absolute = install_directory(&base, &spec).expect_err("absolute target");
    assert_eq!(
        absolute.message(),
        "ACP agent archive escaped its install directory"
    );
}

#[test]
fn archive_entries_are_screened_before_extraction() {
    for hostile in [
        "../escape.txt",
        "./ok\n../escape.txt\n",
        "/etc/passwd\n",
        "C:/windows/system32/evil.exe\n",
        "a/../../b\n",
    ] {
        let error = validate_archive_entries(hostile).expect_err(hostile);
        assert!(
            error
                .message()
                .starts_with("Unsafe path in ACP agent archive: "),
            "{hostile}: {}",
            error.message()
        );
    }
    assert!(validate_archive_entries(GOOD_LISTING).is_ok());
    assert!(validate_archive_entries("./\n./bin/\n./bin/agent\n./share/data.json\n").is_ok());
    // Blank lines and a bare member without a directory prefix are fine.
    assert!(validate_archive_entries("\n./\nagent\n").is_ok());

    // Listing and extraction commands are derived from the archive suffix.
    let tar = archive_listing_command(Path::new("/a/agent.tar.gz"));
    assert_eq!(
        tar.args,
        vec!["-tf".to_string(), "/a/agent.tar.gz".to_string()]
    );
    let zip = archive_listing_command(Path::new("/a/agent.zip"));
    assert_eq!(
        zip.args,
        vec!["-Z1".to_string(), "/a/agent.zip".to_string()]
    );
    let extract =
        archive_extract_command(Path::new("/a/agent.tar.gz"), Path::new("/scratch/files"));
    assert_eq!(
        extract.args,
        vec![
            "-xf".to_string(),
            "/a/agent.tar.gz".to_string(),
            "-C".to_string(),
            "/scratch/files".to_string()
        ]
    );
}

// ---------------------------------------------------------------------------
// Install pipeline
// ---------------------------------------------------------------------------

#[tokio::test]
async fn install_creates_owner_only_marker_and_rerun_is_idempotent() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.tar.gz"));
    let io = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]);

    let command = ensure_installed(&io, &spec, &root)
        .await
        .expect("install succeeds");

    let install_dir = install_directory(&root, &spec).expect("install directory");
    assert_eq!(command, install_dir.join("bin/agent"));
    assert_eq!(mode_of(&command), 0o755);
    let marker = install_dir.join(INSTALL_MARKER_FILE);
    assert_eq!(mode_of(&marker), 0o600);
    assert_eq!(
        std::fs::read_to_string(&marker).expect("marker"),
        marker_payload(&spec)
    );
    assert_eq!(
        std::fs::read_to_string(&marker).expect("marker"),
        "{\"archive\":\"https://registry.invalid/agent.tar.gz\",\"sha256\":null,\"cmd\":\"bin/agent\"}"
    );

    // Nothing but the installed tree survives: the scratch directory is gone.
    assert_eq!(walk(&install_dir), vec![INSTALL_MARKER_FILE, "bin/agent"]);

    // Exactly one download, and the tool saw a listing then an extraction into
    // a scratch directory below the version directory.
    assert_eq!(io.requested.borrow().len(), 1);
    let tools = io.tools.borrow().clone();
    assert_eq!(tools.len(), 2);
    assert!(tools[0].args.iter().any(|arg| arg == "-tf"));
    let scratch = tools[1]
        .args
        .iter()
        .position(|arg| arg == "-C")
        .and_then(|index| tools[1].args.get(index + 1))
        .map(PathBuf::from)
        .expect("extraction destination");
    assert!(scratch.starts_with(install_dir.parent().expect("version directory")));
    assert_eq!(scratch.file_name().unwrap(), "files");
    assert!(
        scratch
            .parent()
            .unwrap()
            .file_name()
            .expect("scratch name")
            .to_string_lossy()
            .starts_with(".install-")
    );
    assert!(!scratch.exists(), "scratch directory must not survive");

    // A second run reuses the current marker: no download, no tool call.
    io.body.replace(Some(b"archive-bytes".to_vec()));
    let again = ensure_installed(&io, &spec, &root)
        .await
        .expect("idempotent");
    assert_eq!(again, command);
    assert_eq!(io.requested.borrow().len(), 1);
    assert_eq!(io.tools.borrow().len(), 2);

    // A different archive invalidates the marker and reinstalls.
    let mut updated = spec.clone();
    updated.archive = "https://registry.invalid/agent-next.tar.gz".to_string();
    io.body.replace(Some(b"archive-bytes".to_vec()));
    ensure_installed(&io, &updated, &root)
        .await
        .expect("reinstall");
    assert_eq!(io.requested.borrow().len(), 2);
    assert_eq!(
        std::fs::read_to_string(&marker).expect("marker"),
        marker_payload(&updated)
    );

    // A missing command invalidates an otherwise current marker.
    std::fs::remove_file(&command).expect("remove command");
    io.body.replace(Some(b"archive-bytes".to_vec()));
    ensure_installed(&io, &updated, &root)
        .await
        .expect("repair");
    assert_eq!(io.requested.borrow().len(), 3);
    assert!(command.exists());

    std::fs::remove_dir_all(&lane).ok();
}

#[tokio::test]
async fn hostile_archive_aborts_before_extraction() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/hostile.tar.gz"));
    let io = FakeIo::new(b"archive-bytes", "./\n../escape.txt\n", &["../escape.txt"]);

    let error = ensure_installed(&io, &spec, &root)
        .await
        .expect_err("hostile archive");
    assert_eq!(
        error.message(),
        "Unsafe path in ACP agent archive: ../escape.txt"
    );

    // Listing ran, extraction did not, and nothing escaped the lane.
    assert_eq!(io.tools.borrow().len(), 1);
    let install_dir = install_directory(&root, &spec).expect("install dir");
    assert!(!install_dir.join("bin/agent").exists());
    assert!(!install_dir.join(INSTALL_MARKER_FILE).exists());
    assert!(!lane.join("escape.txt").exists());
    assert!(!lane.parent().expect("parent").join("escape.txt").exists());

    std::fs::remove_dir_all(&lane).ok();
}

#[tokio::test]
async fn checksum_mismatch_never_publishes_an_install() {
    let lane = lane();
    let root = lane.join("root");
    let mut spec = decode_spec(spec_json("https://registry.invalid/agent.tar.gz"));
    spec.sha256 = Some("0".repeat(64));
    let io = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]);

    let error = ensure_installed(&io, &spec, &root)
        .await
        .expect_err("digest mismatch");
    assert_eq!(error.message(), "Checksum mismatch for ACP agent demo");
    // The digest is checked before the archive is listed.
    assert!(io.tools.borrow().is_empty());
    let install_dir = install_directory(&root, &spec).expect("install dir");
    assert!(!install_dir.join("bin/agent").exists());
    assert!(!install_dir.join(INSTALL_MARKER_FILE).exists());

    std::fs::remove_dir_all(&lane).ok();
}

#[tokio::test]
async fn lock_contention_waits_reclaims_stale_and_times_out() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.tar.gz"));
    let install_dir = install_directory(&root, &spec).expect("install dir");
    std::fs::create_dir_all(install_dir.parent().expect("version dir")).expect("version dir");
    let lock = lock_path(&install_dir);
    std::fs::create_dir_all(&lock).expect("pre-existing lock");

    // First observation is fresh, then the holder is treated as abandoned.
    let io = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]);
    let now = io.now_ms();
    *io.lock_mtimes.borrow_mut() = vec![
        Some(now),
        Some(now),
        Some(now - (INSTALL_LOCK_STALE.as_millis() as f64) - 1.0),
    ];
    ensure_installed(&io, &spec, &root)
        .await
        .expect("stale lock reclaimed");
    assert!(io.sleeps.get() >= 1, "the waiter polled before reclaiming");
    assert_eq!(io.requested.borrow().len(), 1);
    assert!(!lock.exists(), "the reclaimed lock is released");

    // A holder that never goes stale exhausts the wait budget.
    std::fs::remove_dir_all(&install_dir).expect("reset install");
    std::fs::create_dir_all(&lock).expect("fresh lock");
    let stuck = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]);
    let now = stuck.now_ms();
    let _ = now;
    *stuck.lock_mtimes.borrow_mut() = vec![Some(stuck.now_ms())];
    let error = ensure_installed(&stuck, &spec, &root)
        .await
        .expect_err("lock timeout");
    assert!(!error.message().is_empty());
    assert_eq!(
        stuck.requested.borrow().len(),
        0,
        "no download under a held lock"
    );
    assert!(
        stuck.sleeps.get() > 1,
        "the waiter polled until the deadline"
    );

    std::fs::remove_dir_all(&lane).ok();
}

// ---------------------------------------------------------------------------
// ZIP archives
// ---------------------------------------------------------------------------

/// `unzip` is preferred for `.zip` archives off Windows, so a zip install must
/// use `-Z1` for listing and `-q <archive> -d <destination>` for extraction.
#[tokio::test]
async fn zip_archives_install_through_unzip_with_the_same_marker() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.zip"));
    let io = FakeIo::new(b"zip-bytes", "./\n./bin/\n./bin/agent\n", &["bin/agent"]);

    let command = ensure_installed(&io, &spec, &root)
        .await
        .expect("zip install succeeds");
    let install_dir = install_directory(&root, &spec).expect("install dir");
    assert_eq!(command, install_dir.join("bin/agent"));
    assert_eq!(mode_of(&command), 0o755);
    assert_eq!(mode_of(&install_dir.join(INSTALL_MARKER_FILE)), 0o600);
    assert_eq!(
        std::fs::read_to_string(install_dir.join(INSTALL_MARKER_FILE)).expect("marker"),
        marker_payload(&spec)
    );
    assert_eq!(walk(&install_dir), vec![INSTALL_MARKER_FILE, "bin/agent"]);
    assert!(
        !lock_path(&install_dir).exists(),
        "the install lock is released"
    );

    let tools = io.tools.borrow().clone();
    assert_eq!(tools.len(), 2, "listing then extraction");
    assert_eq!(tools[0].program, "unzip");
    assert_eq!(tools[0].args.len(), 2);
    assert_eq!(tools[0].args[0], "-Z1");
    assert!(
        tools[0].args[1].ends_with("agent.zip"),
        "listing reads the downloaded archive: {:?}",
        tools[0].args
    );
    assert_eq!(tools[1].program, "unzip");
    assert_eq!(tools[1].args.len(), 4);
    assert_eq!(tools[1].args[0], "-q");
    assert_eq!(tools[1].args[1], tools[0].args[1], "same archive");
    assert_eq!(tools[1].args[2], "-d");
    // `unzip -d <dest>` extracts into `<scratch>/files`, exactly as the tar
    // branch does; the scratch root is the parent of that directory.
    let extract_dir = PathBuf::from(&tools[1].args[3]);
    assert_eq!(
        extract_dir
            .file_name()
            .expect("extract dir name")
            .to_string_lossy(),
        "files",
        "extraction targets the scratch files directory"
    );
    let scratch = extract_dir.parent().expect("scratch directory");
    assert!(scratch.starts_with(install_dir.parent().expect("version dir")));
    assert!(
        scratch
            .file_name()
            .expect("scratch name")
            .to_string_lossy()
            .starts_with(".install-"),
        "extraction targets the scratch directory"
    );
    assert!(!scratch.exists(), "scratch directory must not survive");

    // A current zip install is reused without another download.
    let again = ensure_installed(&io, &spec, &root)
        .await
        .expect("idempotent");
    assert_eq!(again, command);
    assert_eq!(io.requested.borrow().len(), 1);
    assert_eq!(io.tools.borrow().len(), 2);

    std::fs::remove_dir_all(&lane).ok();
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

/// Write an owned, uncompressed ZIP archive so the real `unzip` branch can be
/// exercised without a system `zip` binary.
fn write_stored_zip(path: &Path, members: &[(&str, &[u8])]) -> std::io::Result<()> {
    let mut body: Vec<u8> = Vec::new();
    let mut directory: Vec<u8> = Vec::new();
    for (name, contents) in members {
        let offset = body.len() as u32;
        let crc = crc32(contents);
        let size = contents.len() as u32;
        let name_bytes = name.as_bytes();
        body.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        body.extend_from_slice(&20u16.to_le_bytes());
        body.extend_from_slice(&0u16.to_le_bytes());
        body.extend_from_slice(&0u16.to_le_bytes());
        body.extend_from_slice(&0u16.to_le_bytes());
        body.extend_from_slice(&0u16.to_le_bytes());
        body.extend_from_slice(&crc.to_le_bytes());
        body.extend_from_slice(&size.to_le_bytes());
        body.extend_from_slice(&size.to_le_bytes());
        body.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        body.extend_from_slice(&0u16.to_le_bytes());
        body.extend_from_slice(name_bytes);
        body.extend_from_slice(contents);

        directory.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        // "Version made by": high byte 3 = Unix, so `unzip` honours the
        // external-attribute mode bits below instead of synthesising 0644.
        directory.extend_from_slice(&0x0314u16.to_le_bytes());
        directory.extend_from_slice(&20u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&crc.to_le_bytes());
        directory.extend_from_slice(&size.to_le_bytes());
        directory.extend_from_slice(&size.to_le_bytes());
        directory.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&0u16.to_le_bytes());
        directory.extend_from_slice(&(0o100755u32 << 16).to_le_bytes());
        directory.extend_from_slice(&offset.to_le_bytes());
        directory.extend_from_slice(name_bytes);
    }
    let directory_offset = body.len() as u32;
    let directory_size = directory.len() as u32;
    body.extend_from_slice(&directory);
    body.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    body.extend_from_slice(&0u16.to_le_bytes());
    body.extend_from_slice(&0u16.to_le_bytes());
    body.extend_from_slice(&(members.len() as u16).to_le_bytes());
    body.extend_from_slice(&(members.len() as u16).to_le_bytes());
    body.extend_from_slice(&directory_size.to_le_bytes());
    body.extend_from_slice(&directory_offset.to_le_bytes());
    body.extend_from_slice(&0u16.to_le_bytes());
    std::fs::write(path, body)
}

fn tool_available(program: &str) -> bool {
    std::process::Command::new(program)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// End-to-end ZIP install with the real `unzip` binary over an archive written
/// by this test. Skipped when `unzip` is absent from the host.
#[cfg(not(windows))]
#[tokio::test]
async fn real_unzip_extracts_an_owned_stored_zip() {
    if !tool_available("unzip") {
        eprintln!("skipping real unzip coverage: unzip is not available on this host");
        return;
    }
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.zip"));
    let archive = lane.join("owned-agent.zip");
    write_stored_zip(
        &archive,
        &[("bin/agent", b"#!/bin/sh\nexit \"${JAIT_AGENT_EXIT-0}\"\n")],
    )
    .expect("owned zip archive");

    let io = FakeIo::new(
        &std::fs::read(&archive).expect("zip bytes"),
        "./\n./bin/\n./bin/agent\n",
        &[],
    )
    .with_real_tar();
    let command = ensure_installed(&io, &spec, &root)
        .await
        .expect("real unzip install");
    assert_eq!(mode_of(&command), 0o755);
    assert_eq!(
        std::fs::read_to_string(&command).expect("command body"),
        "#!/bin/sh\nexit \"${JAIT_AGENT_EXIT-0}\"\n"
    );
    assert_eq!(
        walk(&install_directory(&root, &spec).expect("install dir")),
        vec![INSTALL_MARKER_FILE, "bin/agent"]
    );

    std::fs::remove_dir_all(&lane).ok();
}

// ---------------------------------------------------------------------------
// Real child processes and cancellation
// ---------------------------------------------------------------------------

fn script(lane: &Path, name: &str, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = lane.join(name);
    std::fs::write(&path, body).expect("script body");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).expect("script mode");
    path
}

/// Liveness probe for a child this test started itself. A zombie has already
/// been killed, so it counts as gone: the assertion is that nothing is running.
#[cfg(target_os = "linux")]
fn process_exists(pid: u32) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(stat) => {
            let state = stat
                .rsplit(')')
                .next()
                .and_then(|rest| rest.trim_start().chars().next());
            !matches!(state, None | Some('Z'))
        }
        Err(_) => false,
    }
}

#[cfg(all(unix, not(target_os = "linux")))]
fn process_exists(pid: u32) -> bool {
    std::process::Command::new("ps")
        .arg("-p")
        .arg(pid.to_string())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Real `SystemProcess` children: exit codes, `128+n`-shaped signals, argument
/// and environment forwarding, and the spawn-failure path.
#[tokio::test]
async fn system_process_reports_exit_signals_and_environment() {
    let lane = lane();
    let process = SystemProcess;

    let exiting = script(&lane, "exit-7.sh", "#!/bin/sh\nexit 7\n");
    let outcome = process
        .run_child(&exiting, &[], &[], false)
        .await
        .expect("child exits");
    assert_eq!(outcome.code, Some(7));
    assert_eq!(outcome.signal, None);

    // Arguments and the spec environment reach the child.
    let args = vec!["9".to_string()];
    let env = vec![("JAIT_AGENT_EXIT".to_string(), "9".to_string())];
    let echoing = script(&lane, "argv.sh", "#!/bin/sh\nexit \"$1\"\n");
    let outcome = process
        .run_child(&echoing, &args, &env, false)
        .await
        .expect("child args");
    assert_eq!(outcome.code, Some(9));
    assert_eq!(outcome.signal, None);

    let reading = script(
        &lane,
        "env.sh",
        "#!/bin/sh\n[ \"${JAIT_AGENT_EXIT-unset}\" = \"5\" ] && exit 5\nexit 6\n",
    );
    let env = vec![("JAIT_AGENT_EXIT".to_string(), "5".to_string())];
    let outcome = process
        .run_child(&reading, &[], &env, false)
        .await
        .expect("child env");
    assert_eq!(outcome.code, Some(5));

    // A child killed by a signal reports no exit code, exactly as Node's
    // `null` code plus `signal` pair does.
    let dying = script(&lane, "term.sh", "#!/bin/sh\nkill -TERM $$\n");
    let outcome = process
        .run_child(&dying, &[], &[], false)
        .await
        .expect("child signalled");
    assert_eq!(outcome.code, None);
    assert_eq!(outcome.signal, Some(15), "SIGTERM");

    // Missing command is a spawn failure, not a silent exit.
    let error = process
        .run_child(&lane.join("absent.sh"), &[], &[], false)
        .await
        .expect_err("missing command");
    assert!(
        matches!(error, LauncherError::SpawnFailed(_)),
        "unexpected error: {error:?}"
    );

    std::fs::remove_dir_all(&lane).ok();
}

/// Dropping the run future must not leave the agent running: `kill_on_drop`
/// bounds the child to the task that started it.
#[tokio::test]
async fn cancelling_a_run_terminates_the_child() {
    let baseline_tasks = tokio::runtime::Handle::current()
        .metrics()
        .num_alive_tasks();
    let lane = lane();
    let pidfile = lane.join("child.pid");
    let sleeper = script(
        &lane,
        "sleep.sh",
        "#!/bin/sh\necho $$ > \"$1\"\nexec sleep 60\n",
    );
    let args = vec![pidfile.to_string_lossy().into_owned()];

    let handle =
        tokio::spawn(async move { SystemProcess.run_child(&sleeper, &args, &[], true).await });
    let mut pid = None;
    for _ in 0..400 {
        if let Ok(text) = std::fs::read_to_string(&pidfile)
            && let Ok(parsed) = text.trim().parse::<u32>()
        {
            pid = Some(parsed);
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let pid = pid.expect("the child announced its pid");
    assert!(process_exists(pid), "the child is running");

    handle.abort();
    let _ = handle.await;

    let mut gone = false;
    for _ in 0..400 {
        if !process_exists(pid) {
            gone = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(gone, "cancelled run left child {pid} running");

    for _ in 0..200 {
        if tokio::runtime::Handle::current()
            .metrics()
            .num_alive_tasks()
            <= baseline_tasks
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    assert_eq!(
        tokio::runtime::Handle::current()
            .metrics()
            .num_alive_tasks(),
        baseline_tasks,
        "cancellation left a signal-forwarding task alive"
    );
    std::fs::remove_dir_all(&lane).ok();
}

/// The install lock is released on the success path and, after a rejected
/// archive, on the failure path.
#[tokio::test]
async fn install_releases_the_lock_on_success_and_on_failure() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.tar.gz"));
    let install_dir = install_directory(&root, &spec).expect("install dir");

    let io = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]);
    ensure_installed(&io, &spec, &root).await.expect("install");
    assert!(
        !lock_path(&install_dir).exists(),
        "lock released after a successful install"
    );

    // The lock is taken before the listing is screened, so a hostile archive is
    // rejected while it is held and still releases it.
    std::fs::remove_dir_all(&install_dir).expect("reset install");
    let hostile = FakeIo::new(b"archive-bytes", "./\n../escape.txt\n", &["../escape.txt"]);
    let error = ensure_installed(&hostile, &spec, &root)
        .await
        .expect_err("unsafe member");
    assert!(
        matches!(error, LauncherError::UnsafeArchiveEntry(_)),
        "unexpected error: {error:?}"
    );
    assert!(
        !lock_path(&install_dir).exists(),
        "lock released after a rejected archive"
    );
    assert_eq!(hostile.tools.borrow().len(), 1, "extraction never starts");
    assert!(!install_dir.exists(), "nothing published");
    assert!(
        !lane.join("escape.txt").exists(),
        "nothing escaped the lane"
    );

    std::fs::remove_dir_all(&lane).ok();
}

/// Cancelling an install mid-download must not leave the lock or a scratch tree
/// behind, or every later install would wait for the stale timeout.
#[tokio::test]
async fn cancelled_install_releases_the_lock_and_scratch() {
    let lane = lane();
    let root = lane.join("root");
    let spec = decode_spec(spec_json("https://registry.invalid/agent.tar.gz"));
    let install_dir = install_directory(&root, &spec).expect("install dir");
    let io = FakeIo::new(b"archive-bytes", GOOD_LISTING, &["bin/agent"]).with_hanging_download();

    let cancelled = tokio::time::timeout(
        Duration::from_millis(200),
        ensure_installed(&io, &spec, &root),
    )
    .await;
    assert!(cancelled.is_err(), "the hanging download was cancelled");
    assert_eq!(io.requested.borrow().len(), 1, "the download had started");
    assert!(
        io.tools.borrow().is_empty(),
        "no archive work happens after cancellation"
    );
    assert!(
        !lock_path(&install_dir).exists(),
        "cancellation releases the install lock"
    );
    assert!(!install_dir.exists());
    let leftovers: Vec<String> = std::fs::read_dir(install_dir.parent().expect("version dir"))
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| name.starts_with(".install-"))
                .collect()
        })
        .unwrap_or_default();
    assert!(
        leftovers.is_empty(),
        "scratch directories survived cancellation: {leftovers:?}"
    );

    std::fs::remove_dir_all(&lane).ok();
}

#[tokio::test]
async fn state_directory_and_root_resolution() {
    let lane = lane();
    let home = lane.join("home");
    std::fs::create_dir_all(&home).expect("home");

    // Relative configured state directory is refused, as in the gateway.
    let relative = |name: &str| -> Option<String> {
        match name {
            STATE_DIR_ENV => Some("relative/state".to_string()),
            _ => None,
        }
    };
    assert_eq!(
        state_directory(&relative, &home)
            .expect_err("relative")
            .message(),
        STATE_DIR_NOT_ABSOLUTE
    );

    // Absent and blank values fall back to `<home>/.jait`.
    let blank = |name: &str| -> Option<String> {
        match name {
            STATE_DIR_ENV => Some("   ".to_string()),
            _ => None,
        }
    };
    assert_eq!(
        state_directory(&blank, &home).expect("default"),
        home.join(".jait")
    );
    let absent = |_: &str| -> Option<String> { None };
    assert_eq!(
        state_directory(&absent, &home).expect("default"),
        home.join(".jait")
    );

    // Binary root: configured value wins, blank falls back under the state dir.
    let configured = |name: &str| -> Option<String> {
        match name {
            AGENT_BINARY_ROOT_ENV => Some(lane.join("explicit").to_string_lossy().into_owned()),
            STATE_DIR_ENV => Some(lane.join("state").to_string_lossy().into_owned()),
            _ => None,
        }
    };
    assert_eq!(
        binary_root(&configured, &home).expect("configured"),
        lane.join("explicit")
    );
    assert_eq!(
        binary_root(&absent, &home).expect("default root"),
        home.join(".jait").join("acp-agents")
    );
    let blank_root = |name: &str| -> Option<String> {
        match name {
            AGENT_BINARY_ROOT_ENV => Some("  ".to_string()),
            STATE_DIR_ENV => Some(lane.join("state").to_string_lossy().into_owned()),
            _ => None,
        }
    };
    assert_eq!(
        binary_root(&blank_root, &home).expect("blank root"),
        lane.join("state").join("acp-agents")
    );

    std::fs::remove_dir_all(&lane).ok();
}

#[tokio::test]
async fn run_orders_arguments_forwards_signals_and_maps_exit_status() {
    let lane = lane();
    let root = lane.join("root");
    let home = lane.join("home");
    std::fs::create_dir_all(&home).expect("home");

    // Preinstall so the run stage performs no download.
    let mut value = json!({
        "id": "demo",
        "version": "1.2.3",
        "target": "linux-x64",
        "archive": "file:///unused",
        "cmd": "bin/agent",
        "args": ["--flag", "value"],
        "env": {"JAIT_AGENT_EXIT": "7", "SHARED": "spec"},
    });
    value["archive"] = json!("https://registry.invalid/agent.tar.gz");
    let mut spec = decode_spec(value.clone());
    spec.env.sort();
    let install_dir = install_directory(&root, &spec).expect("install dir");
    std::fs::create_dir_all(install_dir.join("bin")).expect("install tree");
    std::fs::write(install_dir.join("bin/agent"), b"#!/bin/sh\n").expect("command");
    std::fs::write(install_dir.join(INSTALL_MARKER_FILE), marker_payload(&spec)).expect("marker");

    let io = FakeIo::new(b"", GOOD_LISTING, &[]);
    let process = FakeProcess::signalled(2);
    let env = |name: &str| -> Option<String> {
        match name {
            AGENT_BINARY_ROOT_ENV => Some(root.to_string_lossy().into_owned()),
            _ => None,
        }
    };
    let argv = vec![
        "acp-binary-launcher".to_string(),
        encode(value.clone()),
        "--forwarded".to_string(),
        "x".to_string(),
    ];

    let outcome = run(&argv, &env, &home, &io, &process).await;
    assert_eq!(outcome.exit_code(), 130);
    assert!(matches!(
        outcome.termination,
        LauncherTermination::Signal(2)
    ));
    assert!(outcome.stderr.is_empty());
    assert_eq!(
        io.requested.borrow().len(),
        0,
        "preinstalled run must not download"
    );

    {
        let spawned = process.spawned.borrow();
        assert_eq!(spawned.len(), 1);
        assert_eq!(spawned[0].command, install_dir.join("bin/agent"));
        assert_eq!(
            spawned[0].args,
            vec![
                "--flag".to_string(),
                "value".to_string(),
                "--forwarded".to_string(),
                "x".to_string()
            ]
        );
        assert!(spawned[0].forward_signals);
        let expected_env: Vec<(String, String)> = [
            ("JAIT_AGENT_EXIT".to_string(), "7".to_string()),
            ("SHARED".to_string(), "spec".to_string()),
        ]
        .to_vec();
        assert_eq!(spawned[0].env, expected_env);
    }

    // Plain exit codes pass through unchanged.
    let process = FakeProcess::exiting(7);
    let outcome = run(&argv, &env, &home, &io, &process).await;
    assert_eq!(outcome.exit_code(), 7);
    assert!(matches!(outcome.termination, LauncherTermination::Exit(7)));

    // Failures surface on stderr with the specification message only.
    let failed = run(
        &["acp-binary-launcher".to_string()],
        &env,
        &home,
        &io,
        &process,
    )
    .await;
    assert_eq!(failed.exit_code(), 1);
    assert_eq!(
        failed.stderr,
        vec!["Missing ACP binary launch specification".to_string()]
    );

    std::fs::remove_dir_all(&lane).ok();
}

// ---------------------------------------------------------------------------
// Differential against the real TypeScript launcher
// ---------------------------------------------------------------------------

fn typescript_available(root: &Path) -> bool {
    std::process::Command::new("bun")
        .arg("--version")
        .current_dir(root)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn ts_calls(root: &Path, calls: Vec<Value>) -> Value {
    internal_driver::call(
        root,
        &root
            .join(".jait/artifacts/gateway-rust/parallel-20261020/acp-binary-launcher/differential")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version": 1, "calls": calls}),
        &|| false,
    )
    .expect("typescript launcher")
}

#[tokio::test]
async fn differential_matches_the_typescript_launcher() {
    let repository = root();
    if !typescript_available(&repository) {
        eprintln!("skipping differential: bun is not available on this host");
        return;
    }

    let lane = lane();
    // Loopback fixture body for the checksum case; the driver serves it from
    // 127.0.0.1, so no live network is contacted and no real archive is needed
    // because the digest is compared before the archive is ever listed.
    let body = lane.join("body.bin");
    std::fs::write(&body, b"not-an-archive").expect("fixture body");

    let cases = vec![
        ("missing-spec", None),
        (
            "insecure",
            Some(spec_json("http://insecure.invalid/agent.tar.gz")),
        ),
        (
            "bad-digest",
            Some({
                let mut value = spec_json("https://fixture.invalid/agent.tar.gz");
                value["sha256"] = json!("0".repeat(64));
                value
            }),
        ),
    ];

    let mut calls = Vec::new();
    for (name, spec) in &cases {
        let mut call = json!({
            "op": "nativeacpbinarylauncher.launch",
            "workDir": lane.join(name).to_string_lossy(),
            "root": lane.join(name).join("root").to_string_lossy(),
        });
        if let Some(spec) = spec {
            let spec = spec.clone();
            if spec["sha256"].is_string() {
                call["fixture"] = json!({
                    "archivePath": body.to_string_lossy(),
                    "archiveName": "agent.tar.gz",
                    "status": 200,
                });
            }
            call["spec"] = spec;
        }
        calls.push(call);
    }
    let reference = ts_calls(&repository, calls.clone());
    let results = reference.as_array().expect("results array");
    assert_eq!(results.len(), cases.len());

    for (index, (name, spec)) in cases.iter().enumerate() {
        let expected = &results[index];
        // The TypeScript launcher reports failures as exit code 1 with the
        // message on stderr; the native port maps the same message.
        let native = if let Some(spec) = spec {
            let encoded = encode(spec.clone());
            // Identical bytes to the peer's body so the digest comparison, not
            // the payload, decides the outcome.
            let io = FakeIo::new(
                &std::fs::read(&body).expect("fixture body"),
                GOOD_LISTING,
                &[],
            );
            let process = FakeProcess::exiting(0);
            let directory = lane.join("native").join(name_for(name));
            let env = |key: &str| -> Option<String> {
                match key {
                    AGENT_BINARY_ROOT_ENV => Some(directory.to_string_lossy().into_owned()),
                    _ => None,
                }
            };
            let home = lane.join("native-home");
            std::fs::create_dir_all(&home).expect("home");
            run(
                &["acp-binary-launcher".to_string(), encoded],
                &env,
                &home,
                &io,
                &process,
            )
            .await
        } else {
            let io = FakeIo::new(b"", GOOD_LISTING, &[]);
            let process = FakeProcess::exiting(0);
            let home = lane.join("native-home");
            std::fs::create_dir_all(&home).expect("home");
            run(
                &["acp-binary-launcher".to_string()],
                &|_: &str| None,
                &home,
                &io,
                &process,
            )
            .await
        };

        assert_eq!(
            native.exit_code(),
            expected["exitCode"].as_i64().expect("exit code") as i32,
            "{name}: exit code"
        );
        assert_eq!(
            native.stderr.join("\n"),
            expected["stderr"].as_str().expect("stderr").trim_end(),
            "{name}: stderr"
        );
    }

    std::fs::remove_dir_all(&lane).ok();
}

fn name_for(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

#[test]
fn empty_argument_is_a_missing_specification() {
    assert_eq!(
        parse_spec(Some("")).unwrap_err().message(),
        "Missing ACP binary launch specification"
    );
}

/// Actual HTTPS, checksum, unzip, filesystem publication and child execution,
/// compared with the real TypeScript program over the same owned archive.
#[cfg(unix)]
#[tokio::test]
async fn system_https_install_run_and_reuse_match_typescript() {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    let lane = lane();
    let archive = lane.join("agent.zip");
    let output = lane.join("arguments.txt");
    let body = b"#!/bin/sh\nprintf '%s\\n' \"$JAIT_FIXTURE_VALUE\" \"$1\" \"$2\" > \"$JAIT_FIXTURE_OUTPUT\"\nexit 7\n";
    write_stored_zip(&archive, &[("bin/agent", body)]).unwrap();
    let certificate = lane.join("certificate.pem");
    let key = lane.join("key.pem");
    assert!(
        std::process::Command::new("openssl")
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=127.0.0.1",
                "-addext",
                "subjectAltName=IP:127.0.0.1",
                "-addext",
                "basicConstraints=critical,CA:FALSE",
                "-keyout",
                key.to_str().unwrap(),
                "-out",
                certificate.to_str().unwrap(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap()
            .success()
    );
    let peer_script = lane.join("peer.ts");
    std::fs::write(
        &peer_script,
        r#"
import {readFileSync} from 'node:fs';
const here = import.meta.dir;
let count = 0;
const server = Bun.serve({hostname:'127.0.0.1',port:0,
 tls:{cert:readFileSync(here+'/certificate.pem'),key:readFileSync(here+'/key.pem')},
 fetch(req) {
  const path = new URL(req.url).pathname;
  if (path === '/count') return Response.json(count);
  if (path === '/failure') return new Response('fixture',{status:503});
  if (path.startsWith('/redirect/')) {
   const remaining = Number(path.split('/')[2]);
   if (remaining > 0) {
    const next = new URL(req.url); next.pathname = '/redirect/'+(remaining-1)+'/agent.zip';
    return Response.redirect(next,302);
   }
  }
  count++;
  return new Response(readFileSync(here+'/agent.zip'));
 }});
console.log('https://127.0.0.1:'+server.port);
"#,
    )
    .unwrap();
    std::fs::create_dir_all(lane.join("home")).unwrap();
    std::fs::create_dir_all(lane.join("tmp")).unwrap();
    let mut peer = tokio::process::Command::new("bun")
        .arg(&peer_script)
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("HOME", lane.join("home"))
        .env("TMPDIR", lane.join("tmp"))
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut lines = BufReader::new(peer.stdout.take().unwrap()).lines();
    let origin = tokio::time::timeout(Duration::from_secs(3), lines.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(origin.starts_with("https://127.0.0.1:"));
    let builder = || {
        reqwest::Client::builder()
            .no_proxy()
            .add_root_certificate(
                reqwest::Certificate::from_pem(&std::fs::read(&certificate).unwrap()).unwrap(),
            )
            .timeout(Duration::from_secs(3))
    };
    let client = builder().build().unwrap();
    let system = SystemLauncher::with_builder(builder()).unwrap();
    let mut value = spec_json(&format!("{origin}/redirect/12/agent.zip"));
    value["args"] = json!(["spec argument"]);
    value["env"] = json!({"JAIT_FIXTURE_VALUE":"env value", "JAIT_FIXTURE_OUTPUT":output});
    value["sha256"] = json!(hex::encode(sha2::Sha256::digest(
        std::fs::read(&archive).unwrap()
    )));
    let spec = decode_spec(value.clone());
    let native_root = lane.join("native-root");
    let argv = vec![
        "launcher".into(),
        encode(value.clone()),
        "forwarded with spaces".into(),
    ];
    let env = |name: &str| {
        (name == AGENT_BINARY_ROOT_ENV).then(|| native_root.to_str().unwrap().to_string())
    };
    let first = run(&argv, &env, &lane.join("home"), &system, &SystemProcess).await;
    assert_eq!(first.exit_code(), 7, "{:?}", first.stderr);
    assert!(first.stderr.is_empty());
    let native_arguments = std::fs::read_to_string(&output).unwrap();
    assert_eq!(
        native_arguments,
        "env value\nspec argument\nforwarded with spaces\n"
    );
    let second = run(&argv, &env, &lane.join("home"), &system, &SystemProcess).await;
    assert_eq!(second.exit_code(), 7);
    let count: usize = client
        .get(format!("{origin}/count"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(count, 1, "a current install must not redownload");
    let failed = system
        .download(&format!("{origin}/failure"), Duration::from_secs(3))
        .await
        .unwrap_err();
    assert_eq!(failed.message(), "Download failed with HTTP 503");

    let expected = ts_calls(
        &root(),
        vec![json!({
            "op":"nativeacpbinarylauncher.launch", "workDir":lane.join("reference"),
            "spec":value, "fixture":{"archivePath":archive,"archiveName":"agent.zip"},
            "forwarded":["forwarded with spaces"]
        })],
    );
    let expected = &expected[0];
    assert_eq!(expected["exitCode"], first.exit_code());
    assert_eq!(expected["stderr"], "");
    assert_eq!(std::fs::read_to_string(&output).unwrap(), native_arguments);
    let installed = install_directory(&native_root, &spec).unwrap();
    let command = installed.join("bin/agent");
    assert_eq!(mode_of(&command), 0o755);
    assert_eq!(mode_of(&installed.join(INSTALL_MARKER_FILE)), 0o600);
    let marker = std::fs::read_to_string(installed.join(INSTALL_MARKER_FILE))
        .unwrap()
        .replace(&spec.archive, "<archive>");
    assert_eq!(expected["marker"], marker);
    assert_eq!(walk(&installed), vec![INSTALL_MARKER_FILE, "bin/agent"]);
    assert_eq!(expected["files"][0]["mode"], "600");
    assert_eq!(expected["files"][1]["mode"], "755");
    assert_eq!(expected["toolLog"][0][0], "unzip");
    assert_eq!(expected["toolLog"][1][0], "unzip");
    peer.kill().await.unwrap();
    peer.wait().await.unwrap();
}

#[cfg(unix)]
#[test]
fn standalone_binary_runs_without_js_and_forwards_signals() {
    use std::os::unix::process::ExitStatusExt;
    use std::process::{Command, Stdio};
    let repository = root();
    let built = Command::new("node")
        .arg(repository.join("packages/gateway-rust/run.mjs"))
        .args(["build", "--bin", "jait-acp-binary-launcher"])
        .output()
        .unwrap();
    assert!(
        built.status.success(),
        "{}",
        String::from_utf8_lossy(&built.stderr)
    );
    let binary =
        repository.join(".jait/artifacts/gateway-rust-target/debug/jait-acp-binary-launcher");
    let lane = lane();
    let native_root = lane.join("root");
    let mut value = spec_json("https://fixture.invalid/agent.zip");
    value["args"] = json!([]);
    let spec = decode_spec(value.clone());
    let installed = install_directory(&native_root, &spec).unwrap();
    std::fs::create_dir_all(installed.join("bin")).unwrap();
    std::fs::write(installed.join(INSTALL_MARKER_FILE), marker_payload(&spec)).unwrap();
    let command = || {
        let mut child = Command::new(&binary);
        child
            .env_clear()
            .env("PATH", "")
            .env("HOME", &lane)
            .env(AGENT_BINARY_ROOT_ENV, &native_root)
            .arg(encode(value.clone()))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        child
    };
    script(&installed.join("bin"), "agent", "#!/bin/sh\nexit 7\n");
    assert_eq!(command().output().unwrap().status.code(), Some(7));
    script(
        &installed.join("bin"),
        "agent",
        "#!/bin/sh\nkill -TERM $$\n",
    );
    assert_eq!(command().output().unwrap().status.signal(), Some(15));

    let ready = lane.join("ready");
    script(
        &installed.join("bin"),
        "agent",
        "#!/bin/sh\ntrap 'exit 19' TERM\nprintf ready > \"$JAIT_FIXTURE_READY\"\nwhile :; do /bin/sleep 0.05; done\n",
    );
    let child = command().env("JAIT_FIXTURE_READY", &ready).spawn().unwrap();
    struct Owned(std::process::Child);
    impl Drop for Owned {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut child = Owned(child);
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    while !ready.exists() && std::time::Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(ready.exists(), "installed child never started");
    // Only signal the launcher process owned by this fixture.
    assert!(
        Command::new("/bin/kill")
            .args(["-TERM", &child.0.id().to_string()])
            .status()
            .unwrap()
            .success()
    );
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Some(status) = child.0.try_wait().unwrap() {
            break status;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "signal was not forwarded"
        );
        std::thread::sleep(Duration::from_millis(5));
    };
    assert_eq!(status.code(), Some(19));
}

#[cfg(unix)]
#[tokio::test]
async fn cancelling_archive_tool_terminates_its_process() {
    let lane = lane();
    let pidfile = lane.join("tool.pid");
    let tool = script(
        &lane,
        "tool.sh",
        "#!/bin/sh\necho $$ > \"$1\"\nexec /bin/sleep 60\n",
    );
    let invocation = ToolInvocation {
        max_buffer: 1024,
        program: tool.to_str().unwrap().to_string(),
        args: vec![pidfile.to_str().unwrap().to_string()],
    };
    let task =
        tokio::spawn(async move { SystemLauncher::new().unwrap().run_tool(invocation).await });
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    let pid = loop {
        if let Ok(text) = std::fs::read_to_string(&pidfile)
            && let Ok(pid) = text.trim().parse::<u32>()
        {
            break pid;
        }
        assert!(tokio::time::Instant::now() < deadline, "tool did not start");
        tokio::time::sleep(Duration::from_millis(5)).await;
    };
    task.abort();
    let _ = task.await;
    for _ in 0..80 {
        if !process_exists(pid) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    let gone = !process_exists(pid);
    if !gone {
        // Keep a failing before-fix reproduction from leaking its owned child.
        std::process::Command::new("/bin/kill")
            .args(["-KILL", &pid.to_string()])
            .status()
            .unwrap();
    }
    assert!(gone, "cancelled archive tool {pid} was left running");
}

#[cfg(unix)]
#[tokio::test]
async fn archive_stderr_has_the_same_byte_ceiling_as_stdout() {
    let result = SystemLauncher::new()
        .unwrap()
        .run_tool(ToolInvocation {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "head -c 65536 /dev/zero >&2".into()],
            max_buffer: 1024,
        })
        .await;
    assert!(
        matches!(result, Err(LauncherError::Tool(ref message)) if message.contains("1024 bytes")),
        "unbounded stderr was accepted: {result:?}"
    );
    assert_eq!(
        archive_extract_command(Path::new("a.zip"), Path::new("files")).max_buffer,
        1024 * 1024
    );
    assert_eq!(
        archive_listing_command(Path::new("a.zip")).max_buffer,
        8 * 1024 * 1024
    );
}

#[tokio::test]
async fn padded_base64_ignores_trailing_data_like_node() {
    let lane = lane();
    let value = spec_json("https://fixture.invalid/agent.zip");
    let encoded = format!("{}=AAAA", encode(value.clone()));
    let expected = ts_calls(
        &root(),
        vec![json!({
            "op":"nativeacpbinarylauncher.launch","workDir":lane.join("reference"),
            "spec":value,"encoded":encoded,
            "preinstall":{"script":"#!/bin/sh\nexit 0\n","marker":{"archive":value["archive"],"sha256":null,"cmd":"bin/agent"}}
        })],
    );
    assert_eq!(expected[0]["exitCode"], 0);
    let parsed = parse_spec(Some(&encoded)).expect("padding terminates base64 decoding");
    assert_eq!(parsed, decode_spec(value));
}
