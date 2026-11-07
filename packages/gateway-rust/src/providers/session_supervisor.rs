//! Unix ACP session process ownership. Auth probes must use their own lifecycle.
//!
//! A supervisor retains the child without calling `wait` until group escalation
//! has finished. Reaping the group leader earlier permits PID/group ID reuse and
//! makes a delayed group signal unsafe. This design requires exclusive reaping
//! and a SIGCHLD disposition that retains the child; neither is enforced here.
//! A competing reaper or automatic reaping can invalidate group ownership, so
//! this draft must not be mounted until that ownership is established.
//! Dropping a handle requests shutdown;
//! cancelling a shutdown waiter does not cancel the supervisor.
//!
//! This module is not yet wired into ACP. It requires a live Tokio runtime until
//! cleanup completes; runtime shutdown may abort cleanup and only the direct child
//! has Tokio's kill-on-drop protection. There is no natural-exit notification:
//! a naturally exited child remains a zombie until its owner requests cleanup
//! or drops the handle. An integration must resolve this lifetime limitation.
//! A failed kill or a reap timeout is reported; the process may remain alive
//! and the runtime's drop/reaper behavior is not proof of descendant cleanup.

#![cfg(unix)]

use std::{io, process::{ExitStatus, Stdio}, sync::Arc, time::Duration};
use tokio::{process::{ChildStderr, ChildStdin, ChildStdout, Command}, sync::{mpsc, watch}};

/// Pipe ends belong to the caller; the supervisor alone owns the child.
pub struct SessionPipes {
    pub stdin: Option<ChildStdin>,
    pub stdout: Option<ChildStdout>,
    pub stderr: Option<ChildStderr>,
}

#[derive(Debug)]
pub struct ShutdownResult {
    pub term_error: Option<String>,
    /// Group SIGKILL error, if any. Success does not prove group cleanup.
    pub kill_error: Option<String>,
    /// Failure to signal the direct child, distinct from group errors.
    pub direct_kill_error: Option<String>,
    /// Timeout or signalling error means cleanup was not established.
    pub exit: io::Result<ExitStatus>,
}

/// A session handle. Dropping it initiates the same cleanup as `shutdown`.
pub struct SessionSupervisor {
    stop: Option<mpsc::UnboundedSender<()>>,
    result: watch::Receiver<Option<Arc<ShutdownResult>>>,
}

impl SessionSupervisor {
    /// Spawn a session in a new process group. All three pipes are created here.
    /// The delay should be the reference's five seconds in production.
    pub fn spawn(command: &mut Command, escalation_delay: Duration) -> io::Result<(Self, SessionPipes)> {
        tokio::runtime::Handle::try_current().map_err(|_| io::Error::new(io::ErrorKind::Other, "session supervisor requires a Tokio runtime"))?;
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        command.process_group(0).kill_on_drop(true);
        let mut child = command.spawn()?;
        let pid = child.id().ok_or_else(|| io::Error::new(io::ErrorKind::Other, "spawned session has no process ID"))?;
        let pipes = SessionPipes { stdin: child.stdin.take(), stdout: child.stdout.take(), stderr: child.stderr.take() };
        let (stop, mut stop_rx) = mpsc::unbounded_channel();
        let (result_tx, result) = watch::channel(None);
        tokio::spawn(async move {
            // Either an explicit request or the last sender disappearing stops the group.
            let _ = stop_rx.recv().await;
            let term = signal_group(pid, libc::SIGTERM);
            let term_error = term.as_ref().err().filter(|e| e.raw_os_error() != Some(libc::ESRCH)).map(ToString::to_string);
            let mut kill_error = None;
            if term.is_ok() {
                tokio::time::sleep(escalation_delay).await;
                kill_error = signal_group(pid, libc::SIGKILL).err().filter(|e| e.raw_os_error() != Some(libc::ESRCH)).map(|e| e.to_string());
            }
            // A leader can leave its original group while descendants remain.
            // Group signals may succeed without reaching it, so independently
            // kill the still-unreaped leader before waiting. Escaped descendants
            // remain outside the guarantees of this supervisor.
            let direct_kill = child.start_kill();
            let direct_kill_error = direct_kill.as_ref().err()
                .filter(|error| error.raw_os_error() != Some(libc::ESRCH))
                .map(ToString::to_string);
            // All group signalling has finished, so allowing the Child to drop
            // after an error/timeout cannot lead to a later stale group signal.
            let exit = bounded_reap(&mut child, direct_kill, Duration::from_secs(5)).await;
            result_tx.send_replace(Some(Arc::new(ShutdownResult { term_error, kill_error, direct_kill_error, exit })));
        });
        Ok((Self { stop: Some(stop), result }, pipes))
    }

    /// Initiate cleanup without waiting for escalation or reaping.
    pub fn request_stop(&mut self) {
        if let Some(stop) = self.stop.take() { let _ = stop.send(()); }
    }

    /// Initiate shutdown and wait for its result. Dropping this future leaves
    /// the supervisor running. An error means the runtime stopped its task.
    pub async fn shutdown(&mut self) -> io::Result<Arc<ShutdownResult>> {
        self.request_stop();
        self.observe().await
    }

    /// Observe completion or task failure without requesting shutdown.
    /// A failure means cleanup was not established.
    pub async fn observe(&mut self) -> io::Result<Arc<ShutdownResult>> {
        loop {
            if let Some(result) = self.result.borrow().clone() { return Ok(result); }
            self.result.changed().await.map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "session supervisor stopped before cleanup"))?;
        }
    }

    #[cfg(test)]
    pub(super) fn failed_for_test() -> Self {
        let (stop, _stop_rx) = mpsc::unbounded_channel();
        let (result_tx, result) = watch::channel(None);
        drop(result_tx);
        Self { stop: Some(stop), result }
    }
}

async fn bounded_reap(
    child: &mut tokio::process::Child,
    direct_kill: io::Result<()>,
    timeout: Duration,
) -> io::Result<ExitStatus> {
    if let Err(error) = direct_kill {
        if error.raw_os_error() != Some(libc::ESRCH) {
            return Err(error);
        }
    }
    tokio::time::timeout(timeout, child.wait()).await.map_err(|_| {
        io::Error::new(io::ErrorKind::TimedOut, "session leader did not exit after kill")
    })?
}

fn signal_group(pid: u32, signal: i32) -> io::Result<()> {
    let pid = i32::try_from(pid).map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid process group ID"))?;
    if pid <= 1 { return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid process group ID")); }
    // Safe only while exclusive reaping and retained-child disposition hold.
    if unsafe { libc::kill(-pid, signal) } == 0 { Ok(()) } else { Err(io::Error::last_os_error()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

    async fn fixture() -> (SessionSupervisor, BufReader<ChildStdout>) {
        let mut command = Command::new("sh");
        command.arg("-c").arg("trap 'exit 0' TERM; (trap '' TERM; echo ready; while :; do sleep 1; done) & wait");
        let (supervisor, pipes) = SessionSupervisor::spawn(&mut command, Duration::from_millis(120)).unwrap();
        let mut stdout = BufReader::new(pipes.stdout.unwrap());
        let mut ready = String::new();
        tokio::time::timeout(Duration::from_secs(2), stdout.read_line(&mut ready)).await.unwrap().unwrap();
        assert_eq!(ready, "ready\n");
        (supervisor, stdout)
    }

    #[tokio::test]
    async fn escalation_reaps_leader_and_closes_descendant_pipe() {
        let (mut supervisor, mut stdout) = fixture().await;
        supervisor.request_stop();
        let result = tokio::time::timeout(Duration::from_secs(3), supervisor.shutdown()).await.unwrap().unwrap();
        assert!(result.term_error.is_none());
        assert!(result.kill_error.is_none());
        assert!(result.exit.is_ok());
        let mut remaining = Vec::new();
        tokio::time::timeout(Duration::from_secs(2), stdout.read_to_end(&mut remaining)).await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn escaped_leader_is_killed_after_group_escalation() {
        let mut command = Command::new("python3");
        command.arg("-c").arg(r#"import os, signal, time
r, w = os.pipe()
if os.fork() == 0:
    os.close(w)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    os.read(r, 1)
    print('ready', flush=True)
    while True: time.sleep(1)
os.close(r)
os.setpgid(0, os.getpgid(os.getppid()))
os.write(w, b'x')
while True: time.sleep(1)
"#);
        let (mut supervisor, pipes) = SessionSupervisor::spawn(&mut command, Duration::from_millis(120)).unwrap();
        let mut stdout = BufReader::new(pipes.stdout.unwrap());
        let mut ready = String::new();
        tokio::time::timeout(Duration::from_secs(2), stdout.read_line(&mut ready)).await.unwrap().unwrap();
        assert_eq!(ready, "ready\n");
        let result = tokio::time::timeout(Duration::from_secs(3), supervisor.shutdown()).await.unwrap().unwrap();
        assert!(result.term_error.is_none());
        assert!(result.kill_error.is_none());
        assert!(result.exit.is_ok());
        let mut remaining = Vec::new();
        tokio::time::timeout(Duration::from_secs(2), stdout.read_to_end(&mut remaining)).await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn failed_direct_kill_returns_without_waiting_for_live_child() {
        let mut command = Command::new("sleep");
        let mut child = command.arg("10").kill_on_drop(true).spawn().unwrap();
        let result = tokio::time::timeout(
            Duration::from_millis(250),
            bounded_reap(&mut child, Err(io::Error::from_raw_os_error(libc::EPERM)), Duration::from_secs(5)),
        ).await.expect("failed signal must not wait for the child");
        assert_eq!(result.unwrap_err().raw_os_error(), Some(libc::EPERM));
        child.kill().await.unwrap();
    }

    #[tokio::test]
    async fn reap_timeout_is_reported_for_a_live_child() {
        let mut command = Command::new("sleep");
        let mut child = command.arg("10").kill_on_drop(true).spawn().unwrap();
        let result = bounded_reap(&mut child, Ok(()), Duration::from_millis(50)).await;
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
        child.kill().await.unwrap();
    }

    #[tokio::test]
    async fn dropping_handle_still_escalates() {
        let (supervisor, mut stdout) = fixture().await;
        drop(supervisor);
        let mut remaining = Vec::new();
        tokio::time::timeout(Duration::from_secs(3), stdout.read_to_end(&mut remaining)).await.unwrap().unwrap();
    }
}
