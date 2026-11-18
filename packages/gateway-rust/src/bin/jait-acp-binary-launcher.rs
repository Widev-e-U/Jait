//! Standalone entry point for the native ACP binary launcher.
//!
//! This is the process the gateway's ACP launcher adapter can point at in place
//! of `node .../acp-binary-launcher.ts`. It performs exactly what the TypeScript
//! entry point's `main()` does, using the real system adapters
//! ([`SystemLauncher`] / [`SystemProcess`]):
//!
//! * `argv[1]` is forwarded to [`run`] as the encoded launch specification
//!   (`process.argv[2]` in the source, because Node sees the interpreter as
//!   `argv[0]` and the script path as `argv[1]`).
//! * `argv[2..]` are forwarded to the installed agent verbatim.
//! * `HOME` provides the state-directory default, and `JAIT_STATE_DIR` /
//!   `JAIT_ACP_BINARY_ROOT` keep their source precedence.
//! * A failing launcher prints the single error line on stderr and exits 1.
//! * A child that dies by a signal makes the launcher die by the same signal
//!   (`process.kill(process.pid, signal)`), otherwise the child's exit code is
//!   adopted.
//!
//! Lifecycle bound: the child is killed when the supervising future is dropped
//! (`kill_on_drop`), so a cancelled or panicking launcher cannot leave an agent
//! running. `SIGINT`/`SIGTERM` are intercepted only while the child is alive and
//! forwarded to it; the launcher itself installs no handler before the spawn or
//! after the child exits, matching the window in which the source registers
//! `process.on`.
//!
//! Divergence from the source, documented in
//! `tests/contract/reviews/native-acp-binary-launcher.md`: the source's
//! uncaught-exception text for a malformed specification is replaced by the
//! stable `Invalid ACP binary launch specification` message, and Windows has no
//! signal re-raise (there the launcher exits `128 + signal`).

#[cfg(unix)]
use jait_gateway::providers::acp_binary_launcher::terminate_with_signal;
use jait_gateway::providers::acp_binary_launcher::{
    LauncherRun, LauncherTermination, SystemLauncher, SystemProcess, run,
};
use std::path::PathBuf;

/// `os.homedir()`: `HOME`, then the Windows profile variable, then a stable
/// absolute fallback so [`run`] never receives an empty home directory.
fn home_directory() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Print one failure line the way `console.error(error)` does and exit 1.
fn fail(message: &str) -> ! {
    eprintln!("{message}");
    std::process::exit(1)
}

/// Adopt the launcher termination exactly as the source's exit path does.
fn finish(outcome: LauncherRun) -> ! {
    for line in &outcome.stderr {
        eprintln!("{line}");
    }
    match outcome.termination {
        LauncherTermination::Exit(code) => std::process::exit(code),
        LauncherTermination::Signal(signal) => end_by_signal(signal),
    }
}

#[cfg(unix)]
fn end_by_signal(signal: i32) -> ! {
    terminate_with_signal(signal);
    // Unreachable while the default disposition is in force; report the shell
    // convention rather than a false success if the signal could not be raised.
    std::process::exit(128 + signal)
}

#[cfg(not(unix))]
fn end_by_signal(signal: i32) -> ! {
    // Gap: Windows cannot re-raise a signal; report the shell convention.
    std::process::exit(128 + signal)
}

#[tokio::main]
async fn main() {
    let argv: Vec<String> = std::env::args().collect();
    let home = home_directory();
    let launcher = match SystemLauncher::new() {
        Ok(launcher) => launcher,
        Err(error) => fail(&error.message()),
    };
    let outcome = run(
        &argv,
        &|key: &str| std::env::var(key).ok(),
        &home,
        &launcher,
        &SystemProcess,
    )
    .await;
    finish(outcome)
}
