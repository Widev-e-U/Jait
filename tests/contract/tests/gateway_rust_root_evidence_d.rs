//! Consumer-level contract evidence for the NATIVE Rust port of the `(root)`
//! smoke scripts:
//!
//!   * `packages/gateway/scripts/smoke-process.mjs`
//!   * `packages/gateway/scripts/smoke-desktop.mjs`
//!         -> `jait_gateway::execution::smoke_process`
//!
//! The scripts observe only two things about a spawned gateway: whether the
//! child has exited (Node leaves `exitCode` null on signal exits) and the
//! shutdown budgets. `smoke-desktop.mjs` additionally performs the `stop` / EOF
//! handshake and demands exit code 0.

use std::process::Stdio;
use std::time::Duration;

use jait_gateway::execution::smoke_process::{
    GRACEFUL_STOP_TIMEOUT, TERMINATE_TIMEOUT, graceful_stop, has_exited,
};
use tokio::process::Command;

fn spawn(script: &str) -> tokio::process::Child {
    Command::new("/bin/sh")
        .arg("-c")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn child")
}

// ===========================================================================
// (root) scripts/smoke-process.mjs + scripts/smoke-desktop.mjs
// ===========================================================================
mod smoke_process_ts {
    use super::*;
    use std::os::unix::process::ExitStatusExt;

    /// Literal budgets from the scripts: 10s hard kill, 30s graceful allowance.
    #[test]
    fn shutdown_budgets_match_the_scripts() {
        assert_eq!(TERMINATE_TIMEOUT, Duration::from_secs(10));
        assert_eq!(GRACEFUL_STOP_TIMEOUT, Duration::from_secs(30));
        assert!(
            GRACEFUL_STOP_TIMEOUT > TERMINATE_TIMEOUT,
            "the kill timer must not pre-empt the graceful wait"
        );
    }

    /// `hasExited`: an absent child counts as exited (`!child`), a live child
    /// does not, and normal, non-zero and signal exits all do.
    #[tokio::test]
    async fn has_exited_contract_for_absent_live_and_signalled_children() {
        assert!(has_exited(None).expect("absent child"));

        let mut live = spawn("sleep 30");
        assert!(!has_exited(Some(&mut live)).unwrap());

        // Signal exit: Node reports `exitCode === null`, the port reports exited.
        let pid = live.id().expect("child pid");
        let status = Command::new("/bin/sh")
            .arg("-c")
            .arg(format!("kill -9 {pid}"))
            .status()
            .await
            .expect("send SIGKILL");
        assert!(status.success());
        let reaped = live.wait().await.expect("reap killed child");
        assert_eq!(reaped.code(), None);
        assert!(reaped.signal().is_some());
        assert!(has_exited(Some(&mut live)).unwrap());

        // Non-zero normal exit also counts.
        let mut failing = spawn("exit 3");
        assert_eq!(
            failing.wait().await.expect("reap failing child").code(),
            Some(3)
        );
        assert!(has_exited(Some(&mut failing)).unwrap());

        // An absent child is checked repeatedly with the same answer.
        assert!(has_exited(None).unwrap());
    }

    /// `smoke-desktop.mjs` EOF path: close stdin, require a zero exit, then
    /// observe the child as exited.
    #[tokio::test]
    async fn desktop_eof_stop_requires_exit_code_zero() {
        let mut child = spawn("cat > /dev/null; exit 0");
        assert!(!has_exited(Some(&mut child)).unwrap());

        graceful_stop(&mut child, true)
            .await
            .expect("EOF shutdown is graceful");
        assert!(has_exited(Some(&mut child)).unwrap());
    }

    /// `smoke-desktop.mjs` `stop` path: the literal `stop\n` command is sent and
    /// a non-zero exit surfaces as `graceful shutdown failed: <status>`.
    #[tokio::test]
    async fn desktop_stop_command_path_and_failure_message() {
        let mut happy = spawn("IFS= read -r line; [ \"$line\" = stop ] || exit 8; exit 0");
        graceful_stop(&mut happy, false)
            .await
            .expect("stop command is graceful");
        assert!(has_exited(Some(&mut happy)).unwrap());

        // A child that dies instead of shutting down cleanly is an error.
        let mut stubborn = spawn("cat > /dev/null; exit 7");
        let error = graceful_stop(&mut stubborn, true)
            .await
            .expect_err("non-zero exit must be reported");
        assert_eq!(error.kind(), std::io::ErrorKind::Other);
        assert_eq!(
            error.to_string(),
            "graceful shutdown failed: exit status: 7"
        );

        // stdin is required for the handshake; without a pipe the stop fails.
        let mut no_stdin = Command::new("/bin/sh")
            .args(["-c", "sleep 5"])
            .stdin(Stdio::null())
            .spawn()
            .expect("spawn without piped stdin");
        let error = graceful_stop(&mut no_stdin, false)
            .await
            .expect_err("missing stdin must be reported");
        assert_eq!(error.kind(), std::io::ErrorKind::BrokenPipe);
        assert_eq!(error.to_string(), "child stdin is unavailable");
    }
}
