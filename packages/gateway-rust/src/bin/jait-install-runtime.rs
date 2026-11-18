//! Native replacement for `packages/gateway/bin/install-runtime.mjs`.
//!
//! The script resolves `dist/services/code-graph/graphify-runtime.js` relative to
//! its own location, short-circuits when that module is missing but the `src/`
//! tree exists (build not finished yet), fails when the manager is missing
//! entirely, and otherwise awaits `ensureGraphifyRuntime` while streaming
//! `[jait] …` progress lines.
//!
//! In this binary the runtime manager is statically linked, so the file-based
//! "module missing" branches collapse to [`InstallRuntimeStep::Ensure`]; the
//! decision tree itself lives in
//! `jait_gateway::services::code_graph::runtime::install_runtime_step` and is
//! unit-tested there. What remains real here is the resolution of the state
//! directory, the child environment handed to the managed runtime, the process
//! executor, and the exact log/exit-code contract of the script.

use jait_gateway::services::code_graph::engine::native_executor;
use jait_gateway::services::code_graph::runtime::{
    GraphifyRuntime, install_runtime_line, install_runtime_step,
};
use jait_gateway::state_directory::state_directory;
use std::{collections::BTreeMap, path::PathBuf, process::ExitCode, sync::Arc, time::Duration};

/// Provisioning runs a single managed `pip` install at a time; the script never
/// passes a timeout, so use the executor's composition deadline instead of
/// leaving the child unbounded.
const PROVISION_TIMEOUT: Duration = Duration::from_secs(900);
const PROVISION_PARALLELISM: u16 = 1;

fn main() -> ExitCode {
    // The manager is compiled in: `runtime_module_present` is always true here.
    // `install_runtime_step` still models the script's other branches for tests
    // and for embedders that keep a file-based installation.
    let step = install_runtime_step(true, false);
    if let Some(message) = step.message() {
        let line = install_runtime_line(message);
        if step.exit_code() == 0 {
            println!("{line}");
        } else {
            eprintln!("{line}");
        }
        return ExitCode::from(step.exit_code());
    }

    let state_dir = match resolve_state_dir() {
        Ok(directory) => directory,
        Err(message) => {
            eprintln!("{}", install_runtime_line(&message));
            return ExitCode::FAILURE;
        }
    };

    let executor = match native_executor(
        PathBuf::from(&state_dir),
        PROVISION_TIMEOUT,
        PROVISION_PARALLELISM,
    ) {
        Ok(executor) => executor,
        Err(error) => {
            eprintln!("{}", install_runtime_line(&error.message));
            return ExitCode::FAILURE;
        }
    };

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("{}", install_runtime_line(&error.to_string()));
            return ExitCode::FAILURE;
        }
    };

    let mut graphify = GraphifyRuntime::new(state_dir, host_environment(), executor);
    // Mirrors the script's `onProgress: (message) => console.log(`[jait] ${message}`)`.
    graphify.progress = Some(Arc::new(|message: String| {
        println!("{}", install_runtime_line(&message));
    }));

    match runtime.block_on(graphify.ensure()) {
        Ok(_status) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", install_runtime_line(&error.message));
            ExitCode::FAILURE
        }
    }
}

/// `ensureGraphifyRuntime` reads `JAIT_GRAPHIFY_*` overrides from the process
/// environment and hands the same map to the child processes it spawns, so the
/// launcher passes the environment through verbatim (non-UTF-8 entries, which
/// Node could not represent either, are skipped).
fn host_environment() -> BTreeMap<String, String> {
    std::env::vars().collect()
}

fn resolve_state_dir() -> Result<String, String> {
    let home = home_directory();
    let configured = std::env::var("JAIT_STATE_DIR").ok();
    state_directory(&home, configured.as_deref())
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

fn home_directory() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}
