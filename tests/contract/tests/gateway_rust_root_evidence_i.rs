//! External contract evidence for two components that were previously
//! unreachable from outside `jait-gateway`:
//!
//! * `packages/gateway-rust/src/execution/matrix_stack.rs`
//!   (was `pub(crate) mod matrix_stack;`)
//! * `packages/gateway-rust/src/embed_shell_integration.rs`
//!   (was not declared in `lib.rs` at all)
//!
//! These assertions exercise the components through their public surface, the
//! same way the TypeScript callers do: settings parsing from untrusted bytes,
//! effect planning for a single authorized operation, status parsing, and the
//! embed/generate state machine.

use std::fs;
use std::path::{Path, PathBuf};

use jait_gateway::embed_shell_integration::{self, Outcome};
use jait_gateway::execution::matrix_stack::{self, Command, Config, Effect, HostOwner};

const DATA_DIR: &str = "/data/jait-matrix";
const DIGEST: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/// `<name>@sha256:<64 hex>` — the only image form `validate()` accepts.
fn pinned_image() -> String {
    format!(
        "ghcr.io/matrix-org/synapse@sha256:{}",
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    )
}

fn owner() -> HostOwner {
    HostOwner {
        uid: 1000,
        gid: 1000,
    }
}

fn runtime() -> String {
    matrix_stack::runtime_name(DATA_DIR).expect("canonical data dir must derive a runtime name")
}

fn config() -> Config {
    let runtime = runtime();
    Config {
        server_name: "matrix.example".to_owned(),
        port: 8448,
        image: pinned_image(),
        container: runtime.clone(),
        network: runtime,
    }
}

fn settings_json(config: &Config) -> Vec<u8> {
    format!(
        r#"{{"serverName":"{}","port":{},"image":"{}","container":"{}","network":"{}"}}"#,
        config.server_name, config.port, config.image, config.container, config.network
    )
    .into_bytes()
}

fn docker_argv(effect: &Effect) -> Vec<String> {
    match effect {
        Effect::Docker { argv, .. } => argv.clone(),
        other => panic!("expected a Docker effect, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// matrix_stack
// ---------------------------------------------------------------------------

#[test]
fn matrix_runtime_name_is_derived_and_guarded() {
    let derived = matrix_stack::runtime_name(DATA_DIR).unwrap();
    // Deterministic, prefix-stable, and hex-only: the reference derives the
    // container/network name from the data directory so two different
    // authorized directories can never collide onto one runtime.
    assert!(derived.starts_with("jait-matrix-"), "{derived}");
    let suffix = &derived["jait-matrix-".len()..];
    assert_eq!(suffix.len(), 10, "{derived}");
    assert!(suffix.bytes().all(|b| b.is_ascii_hexdigit()), "{derived}");
    assert_eq!(derived, matrix_stack::runtime_name(DATA_DIR).unwrap());
    assert_ne!(derived, matrix_stack::runtime_name("/data/other").unwrap());

    // The boundary rejects anything that is not a normalized absolute mount
    // path, because the value is later interpolated into a bind mount.
    for rejected in [
        "",
        "data/jait-matrix",
        "./data",
        "/data/../etc",
        "/data/a,b",
        "/data/a\nb",
    ] {
        assert!(
            matrix_stack::runtime_name(rejected).is_err(),
            "expected rejection for {rejected:?}"
        );
    }

    // A redundant trailing separator or `.` segment is not an escape, and the
    // name is derived from the canonical spelling, so every alias of one
    // directory names the same runtime (one container per data dir).
    let data = matrix_stack::runtime_name("/data").expect("plain absolute dir");
    assert!(data.starts_with("jait-matrix-"), "{data}");
    assert_eq!(matrix_stack::runtime_name("/data/").unwrap(), data);
    assert_eq!(
        matrix_stack::runtime_name("/data/./matrix").unwrap(),
        matrix_stack::runtime_name("/data/matrix").unwrap()
    );
    assert_ne!(matrix_stack::runtime_name("/data/matrix").unwrap(), data);
}

#[test]
fn matrix_settings_parser_enforces_host_boundary() {
    let valid = config();
    let parsed = matrix_stack::parse_settings(&settings_json(&valid), DATA_DIR, owner())
        .expect("well-formed pinned settings must parse");
    assert_eq!(parsed.server_name, valid.server_name);
    assert_eq!(parsed.port, valid.port);
    assert_eq!(parsed.image, valid.image);
    assert_eq!(parsed.container, valid.container);
    assert_eq!(parsed.network, valid.network);

    // Unknown fields are ignored, matching the JavaScript reader's tolerance.
    let mut extra = settings_json(&valid);
    extra.pop();
    extra.extend_from_slice(br#","futureOption":true}"#);
    assert!(matrix_stack::parse_settings(&extra, DATA_DIR, owner()).is_ok());

    // Unpinned / option-shaped images are rejected: the value reaches `docker
    // run` as an argument, so a leading dash or a floating tag is not allowed.
    let mut unpinned = config();
    unpinned.image = "ghcr.io/matrix-org/synapse:latest".to_owned();
    assert!(matrix_stack::parse_settings(&settings_json(&unpinned), DATA_DIR, owner()).is_err());
    let mut short = config();
    short.image = format!("img@sha256:{}", &DIGEST[..62]);
    assert!(matrix_stack::parse_settings(&settings_json(&short), DATA_DIR, owner()).is_err());
    let mut non_hex = config();
    non_hex.image = format!("img@sha256:{}", "z".repeat(64));
    assert!(matrix_stack::parse_settings(&settings_json(&non_hex), DATA_DIR, owner()).is_err());

    // Runtime identity is bound to the authorized directory, not the file.
    let mut foreign = config();
    foreign.container = matrix_stack::runtime_name("/data/elsewhere").unwrap();
    foreign.network = foreign.container.clone();
    assert!(matrix_stack::parse_settings(&settings_json(&foreign), DATA_DIR, owner()).is_err());

    // Privileged / out-of-range ports and non-hostname server names.
    let mut low_port = config();
    low_port.port = 443;
    assert!(matrix_stack::parse_settings(&settings_json(&low_port), DATA_DIR, owner()).is_err());
    let mut bad_name = config();
    bad_name.server_name = "-matrix.example".to_owned();
    assert!(matrix_stack::parse_settings(&settings_json(&bad_name), DATA_DIR, owner()).is_err());

    // Root owner would let the container write the host mount as root.
    assert!(
        matrix_stack::parse_settings(
            &settings_json(&config()),
            DATA_DIR,
            HostOwner { uid: 0, gid: 0 }
        )
        .is_err()
    );

    // Malformed JSON, out-of-range ports, and oversized settings fail closed.
    assert!(matrix_stack::parse_settings(b"{}", DATA_DIR, owner()).is_err());
    assert!(matrix_stack::parse_settings(b"not json", DATA_DIR, owner()).is_err());
    let mut overflow = settings_json(&config());
    overflow.pop();
    overflow.extend_from_slice(br#","port":70000}"#);
    assert!(matrix_stack::parse_settings(&overflow, DATA_DIR, owner()).is_err());
    let oversized = vec![b' '; 64 * 1024 + 1];
    assert!(matrix_stack::parse_settings(&oversized, DATA_DIR, owner()).is_err());
}

#[test]
fn matrix_start_plan_and_status_probe_contract() {
    let config = config();
    let runtime = runtime();

    // Existing container: exactly one effect, `start <container>`.
    let effects = matrix_stack::plan(
        Command::Start {
            container_exists: true,
            network_exists: true,
        },
        &config,
        DATA_DIR,
        owner(),
    )
    .unwrap();
    assert_eq!(effects.len(), 1);
    let argv = docker_argv(&effects[0]).join(" ");
    assert!(argv.contains(&format!("start {runtime}")), "{argv}");
    assert!(
        !argv.contains("--network"),
        "start must not recreate: {argv}"
    );

    // Fresh container on a fresh network: create the network first, then run
    // with the loopback port mapping and the pinned image.
    let effects = matrix_stack::plan(
        Command::Start {
            container_exists: false,
            network_exists: false,
        },
        &config,
        DATA_DIR,
        owner(),
    )
    .unwrap();
    assert_eq!(effects.len(), 2, "{effects:?}");
    let network = docker_argv(&effects[0]).join(" ");
    assert!(
        network.contains(&format!("network create {runtime}")),
        "{network}"
    );
    let run = docker_argv(&effects[1]).join(" ");
    assert!(run.contains(&format!("--name {runtime}")), "{run}");
    assert!(run.contains("--restart unless-stopped"), "{run}");
    assert!(run.contains(&format!("--network {runtime}")), "{run}");
    assert!(run.contains("127.0.0.1:8448:8008"), "{run}");
    assert!(
        run.contains(&format!("type=bind,src={DATA_DIR},dst=/data")),
        "{run}"
    );
    assert!(run.contains("1000:1000"), "{run}");
    assert!(run.contains(&pinned_image()), "{run}");

    // Status report: `client_api_ready` is exactly an HTTP 2xx on the probe.
    let report = matrix_stack::status_report(b"running\n", Some(204)).unwrap();
    assert_eq!(report.container_status, "running");
    assert!(report.client_api_ready);
    let report = matrix_stack::status_report(b"exited", Some(503)).unwrap();
    assert_eq!(report.container_status, "exited");
    assert!(!report.client_api_ready);
    let report = matrix_stack::status_report(b"restarting", None).unwrap();
    assert!(!report.client_api_ready);

    // Untrusted Docker output is capped and must not carry control characters
    // into CLI output or model context.
    assert!(matrix_stack::status_report(&vec![b'x'; 4097], Some(200)).is_err());
    assert!(matrix_stack::status_report(b"running\x1b[31m", Some(200)).is_err());
}

// ---------------------------------------------------------------------------
// embed_shell_integration
// ---------------------------------------------------------------------------

#[test]
fn embed_render_matches_js_escaping_contract() {
    let rendered = embed_shell_integration::render([
        "echo \"bash\"\n",
        "echo 'zsh'\t\n",
        "Write-Host \"pwsh\"\r\n",
    ]);

    // All three asset keys and export names are emitted, in reference order.
    for needle in [
        "bash.sh",
        "zsh.sh",
        "pwsh.ps1",
        "BASH_INTEGRATION_SCRIPT",
        "ZSH_INTEGRATION_SCRIPT",
        "PWSH_INTEGRATION_SCRIPT",
        "SHELL_INTEGRATION_ASSETS",
    ] {
        assert!(rendered.contains(needle), "missing {needle}");
    }
    let bash_at = rendered.find("bash.sh").unwrap();
    let zsh_at = rendered.find("zsh.sh").unwrap();
    let pwsh_at = rendered.find("pwsh.ps1").unwrap();
    assert!(
        bash_at < zsh_at && zsh_at < pwsh_at,
        "asset order must be stable"
    );

    // JSON.stringify-compatible escaping: quotes, backslashes and controls.
    assert!(rendered.contains(r#""echo \"bash\"""#), "quote escaping");
    assert!(rendered.contains(r#""echo 'zsh'\t""#), "tab escaping");
    assert!(
        rendered.contains(r#""Write-Host \"pwsh\"\r""#),
        "carriage-return escaping"
    );
    assert!(
        !rendered.contains('\r'),
        "raw CR must not reach the generated file"
    );

    // Byte labels count UTF-16 code units, matching JS `String.length`.
    let astral = embed_shell_integration::render(["\u{1F600}\n", "", ""]);
    assert!(
        astral.contains("(3 bytes)"),
        "astral label must be UTF-16 based"
    );
}

fn scratch_root(label: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join(".jait/artifacts/gateway-rust")
        .join(format!("embed-contract-{}-{label}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src/surfaces/shell-integration")).unwrap();
    root
}

#[test]
fn embed_write_then_up_to_date_state_machine() {
    let root = scratch_root("state-machine");
    let sources = root.join("src/surfaces/shell-integration");
    fs::write(sources.join("bash.sh"), "bash-body\n").unwrap();
    fs::write(sources.join("zsh.sh"), "zsh-body\n").unwrap();
    fs::write(sources.join("pwsh.ps1"), "pwsh-body\r\n").unwrap();

    // check=true before generation: the asset is absent.
    assert_eq!(
        embed_shell_integration::run(&root, true).unwrap(),
        Outcome::Missing
    );

    // Generating writes exactly what `render` produces for the on-disk sources.
    assert_eq!(
        embed_shell_integration::run(&root, false).unwrap(),
        Outcome::Written
    );
    let output = root.join("src/surfaces/shell-integration-assets.ts");
    let written = fs::read_to_string(&output).unwrap();
    let expected = embed_shell_integration::render(["bash-body\n", "zsh-body\n", "pwsh-body\r\n"]);
    assert_eq!(written, expected);

    // Second check is a no-op, then a source edit is detected as stale.
    assert_eq!(
        embed_shell_integration::run(&root, true).unwrap(),
        Outcome::UpToDate
    );
    fs::write(sources.join("zsh.sh"), "zsh-body-changed\n").unwrap();
    assert_eq!(
        embed_shell_integration::run(&root, true).unwrap(),
        Outcome::OutOfDate
    );

    let _ = fs::remove_dir_all(&root);

    // The committed asset in this repository must be current: this is the same
    // invariant the reference `--check` mode enforces in CI.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("packages/gateway");
    assert_eq!(
        embed_shell_integration::run(&repo_root, true).unwrap(),
        Outcome::UpToDate,
        "committed packages/gateway/src/surfaces/shell-integration-assets.ts must be up to date"
    );
}

#[test]
fn embed_missing_sources_report_file_errors() {
    let root = scratch_root("missing-sources");
    let error = embed_shell_integration::run(&root, true).unwrap_err();
    assert_eq!(error.operation, "open");
    assert!(
        error
            .path
            .ends_with("src/surfaces/shell-integration/bash.sh"),
        "{:?}",
        error.path
    );
    assert_eq!(error.source.kind(), std::io::ErrorKind::NotFound);
    let _ = fs::remove_dir_all(&root);
}
