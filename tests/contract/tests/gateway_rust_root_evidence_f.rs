//! Consumer-level contract evidence for the NATIVE Rust port of the `(root)`
//! provisioning entry `packages/gateway/bin/install-runtime.mjs`
//! (`ensureGraphifyRuntime` in `src/services/code-graph/graphify-runtime.ts`)
//! -> `jait_gateway::services::code_graph::runtime`.
//!
//! Everything is driven through the public `Executor` port, so the assertions
//! pin the observable argv/environment sequence and the operator-facing status
//! and error text rather than internals.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use jait_gateway::services::code_graph::engine::{ExecOutput, ExecRequest, Executor, GraphError};
use jait_gateway::services::code_graph::runtime::{
    includes_expected_version, runtime_paths, supports_python, GraphifyRuntime, RuntimeStatus,
    MIN_PYTHON_VERSION, PACKAGE_NAME, PACKAGE_VERSION,
};

type Reply = Result<(&'static str, &'static str), &'static str>;

fn runtime(
    state: &str,
    env: &[(&str, &str)],
    replies: Vec<(String, Reply)>,
    seen: Arc<Mutex<Vec<String>>>,
) -> GraphifyRuntime {
    let table: Arc<Vec<(String, Reply)>> = Arc::new(replies);
    let execute: Executor = Arc::new(move |request: ExecRequest| {
        seen.lock()
            .unwrap()
            .push(format!("{} {}", request.command, request.args.join(" ")).trim().to_string());
        let key = request.command.clone();
        let reply = table
            .iter()
            .find(|(command, _)| *command == key)
            .map(|(_, reply)| *reply)
            .unwrap_or(Err("unexpected command"));
        Box::pin(async move {
            match reply {
                Ok((stdout, stderr)) => Ok(ExecOutput {
                    stdout: stdout.to_string(),
                    stderr: stderr.to_string(),
                }),
                Err(message) => Err(GraphError::error(message)),
            }
        })
    });
    let env = env
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect::<BTreeMap<_, _>>();
    GraphifyRuntime::new(state.to_string(), env, execute)
}

fn scratch(tag: &str) -> String {
    let path = std::env::temp_dir().join(format!(
        "jait-graphify-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir_all(&path).unwrap();
    path.to_string_lossy().into_owned()
}

/// The managed layout, package pin, and Python floor are literal constants of
/// the installer (`jaitDir/runtime/graphify/...`, non-Windows `bin/`).
#[test]
fn managed_paths_and_package_pins_match_the_installer() {
    assert_eq!(PACKAGE_NAME, "graphifyy");
    assert_eq!(PACKAGE_VERSION, "0.9.30");
    assert_eq!(MIN_PYTHON_VERSION, "3.10");

    let posix = runtime_paths("/srv/jait-state", false);
    assert_eq!(posix.runtime_dir, "/srv/jait-state/runtime/graphify");
    assert_eq!(posix.venv_dir, "/srv/jait-state/runtime/graphify/venv");
    assert_eq!(posix.python_path, "/srv/jait-state/runtime/graphify/venv/bin/python");
    assert_eq!(posix.command_path, "/srv/jait-state/runtime/graphify/venv/bin/graphify");
    assert_eq!(posix.metadata_path, "/srv/jait-state/runtime/graphify/runtime.json");

    let windows = runtime_paths("/srv/jait-state", true);
    assert_eq!(windows.python_path, "/srv/jait-state/runtime/graphify/venv/Scripts/python.exe");
    assert_eq!(windows.command_path, "/srv/jait-state/runtime/graphify/venv/Scripts/graphify.exe");

    // The default command is the managed path when nothing overrides it.
    let status_free = GraphifyRuntime::new(
        "/srv/jait-state".to_string(),
        BTreeMap::new(),
        Arc::new(|_request: ExecRequest| Box::pin(async { Err(GraphError::error("unused")) })),
    );
    assert_eq!(status_free.command(), posix.command_path);
}

/// Version/Python output matching follows the JS regexes exactly: the pinned
/// version needs non-digit guards, and Python needs a whitespace separator plus
/// a 3.10+ floor.
#[test]
fn output_matching_mirrors_javascript_regexes() {
    assert!(includes_expected_version("0.9.30"));
    assert!(includes_expected_version("graphify 0.9.30\n"));
    assert!(includes_expected_version("v0.9.30"));
    assert!(!includes_expected_version("0.9.300"));
    assert!(!includes_expected_version("10.9.30"));
    assert!(!includes_expected_version("0.9.3"));

    assert!(supports_python("Python 3.10.0"));
    assert!(supports_python("Python 3.12"));
    assert!(supports_python("Python 4.0"));
    assert!(supports_python("python 3.11"));
    assert!(supports_python("Python\u{00a0}3.10"));
    assert!(!supports_python("Python 3.9.18"));
    assert!(!supports_python("Python 3.9"));
    assert!(!supports_python("Python3.10"));
    assert!(!supports_python("no python here"));
}

/// `inspect` accepts only the pinned version for a managed runtime, while an
/// operator-supplied `JAIT_GRAPHIFY_COMMAND` is accepted as-is.
#[tokio::test]
async fn inspect_enforces_the_pin_only_for_the_managed_runtime() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let good = runtime(
        "/srv/jait-state",
        &[],
        vec![("/srv/jait-state/runtime/graphify/venv/bin/graphify".to_string(), Ok(("graphify 0.9.30\n", "")))],
        seen.clone(),
    );
    let status: RuntimeStatus = good.inspect().await;
    assert!(status.ready);
    assert!(status.managed);
    assert_eq!(status.command, "/srv/jait-state/runtime/graphify/venv/bin/graphify");
    assert_eq!(status.version.as_deref(), Some("graphify 0.9.30"));
    assert_eq!(status.expected_version, "0.9.30");
    assert_eq!(status.error, None);
    assert_eq!(*seen.lock().unwrap(), vec!["/srv/jait-state/runtime/graphify/venv/bin/graphify --version"]);

    let stale = runtime(
        "/srv/jait-state",
        &[],
        vec![("/srv/jait-state/runtime/graphify/venv/bin/graphify".to_string(), Ok(("0.9.29", "")))],
        Arc::new(Mutex::new(Vec::new())),
    )
    .inspect()
    .await;
    assert!(!stale.ready);
    assert_eq!(stale.version.as_deref(), Some("0.9.29"));
    assert_eq!(stale.error.as_deref(), Some("Expected Graphify 0.9.30, found 0.9.29"));

    let silent = runtime(
        "/srv/jait-state",
        &[],
        vec![("/srv/jait-state/runtime/graphify/venv/bin/graphify".to_string(), Ok(("  ", " \n")))],
        Arc::new(Mutex::new(Vec::new())),
    )
    .inspect()
    .await;
    assert!(!silent.ready);
    assert_eq!(silent.version, None);
    assert_eq!(silent.error.as_deref(), Some("Graphify returned no version information"));

    // Unmanaged command: any reported version is accepted, probe errors surface.
    let unmanaged = runtime(
        "/srv/jait-state",
        &[("JAIT_GRAPHIFY_COMMAND", " /opt/graphify ")],
        vec![("/opt/graphify".to_string(), Ok(("0.1.0", "")))],
        Arc::new(Mutex::new(Vec::new())),
    )
    .inspect()
    .await;
    assert!(!unmanaged.managed);
    assert_eq!(unmanaged.command, "/opt/graphify");
    assert!(unmanaged.ready);
    assert_eq!(unmanaged.error, None);

    let broken = runtime(
        "/srv/jait-state",
        &[("JAIT_GRAPHIFY_COMMAND", "/opt/graphify")],
        vec![("/opt/graphify".to_string(), Err("spawn ENOENT"))],
        Arc::new(Mutex::new(Vec::new())),
    )
    .inspect()
    .await;
    assert!(!broken.ready);
    assert_eq!(broken.error.as_deref(), Some("spawn ENOENT"));
}

/// Provisioning probes the managed command first, then the Python candidates in
/// the reference order (configured -> python3 -> python), and fails with the
/// exact operator message listing every rejected candidate.
#[tokio::test]
async fn provision_reports_python_candidates_in_reference_order() {
    let state = scratch("provision");
    let seen = Arc::new(Mutex::new(Vec::new()));
    let command = format!("{state}/runtime/graphify/venv/bin/graphify");
    let probe = runtime(
        &state,
        &[("JAIT_GRAPHIFY_PYTHON", "custom-py")],
        vec![
            (command.clone(), Err("graphify missing")),
            ("custom-py".to_string(), Ok(("Python 3.9.18", ""))),
            ("python3".to_string(), Err("no such file")),
            ("python".to_string(), Ok(("", "\n"))),
        ],
        seen.clone(),
    );
    let error = match probe.ensure().await {
        Ok(status) => panic!("expected rejection, got ready={}", status.ready),
        Err(error) => error,
    };
    assert_eq!(
        error.message,
        "Graphify requires Python 3.10 or newer. Install Python and restart Jait. \
         Checked: custom-py: Python 3.9.18, python3: unavailable, python: unknown version"
    );
    assert_eq!(error.name, "GraphifyRuntimeError");
    assert_eq!(
        *seen.lock().unwrap(),
        vec![
            format!("{command} --version"),
            "custom-py --version".to_string(),
            "python3 --version".to_string(),
            "python --version".to_string(),
        ]
    );
    // The runtime root is created, but a rejected Python never gets a venv.
    assert!(std::path::Path::new(&format!("{state}/runtime/graphify")).is_dir());
    assert!(!std::path::Path::new(&format!("{state}/runtime/graphify/venv")).exists());

    // An unusable JAIT_GRAPHIFY_COMMAND short-circuits before any Python probe.
    let seen = Arc::new(Mutex::new(Vec::new()));
    let unusable = runtime(
        &state,
        &[("JAIT_GRAPHIFY_COMMAND", "/opt/graphify")],
        vec![("/opt/graphify".to_string(), Err("spawn ENOENT"))],
        seen.clone(),
    );
    let error = match unusable.ensure().await {
        Ok(status) => panic!("expected rejection, got ready={}", status.ready),
        Err(error) => error,
    };
    assert_eq!(
        error.message,
        "JAIT_GRAPHIFY_COMMAND points to an unusable Graphify executable (/opt/graphify): spawn ENOENT"
    );
    assert_eq!(*seen.lock().unwrap(), vec!["/opt/graphify --version".to_string()]);
    let _ = std::fs::remove_dir_all(&state);
}
