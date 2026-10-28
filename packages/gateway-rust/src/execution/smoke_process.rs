//! Process cleanup for the packaged desktop smoke test.
//!
//! This operates only on a child already owned by the caller; it does not grant
//! process execution authority. On Unix the reference's default `child.kill()`
//! sends SIGTERM, not SIGKILL. A timed-out child remains owned by the caller.
use std::{io, time::Duration};
use tokio::{io::AsyncWriteExt, process::Child};

pub const TERMINATE_TIMEOUT: Duration = Duration::from_secs(10);
pub const GRACEFUL_STOP_TIMEOUT: Duration = Duration::from_secs(30);

/// Request the desktop host to stop by command or EOF, and require a zero exit.
/// An already exited child is a no-op, as in the reference. On timeout the
/// default termination signal is sent and exit is still awaited. The caller
/// retains the child on cancellation or an I/O error. Cancellation may occur
/// after the command was sent or stdin was closed; do not blindly retry it.
pub async fn graceful_stop(child: &mut Child, eof: bool) -> io::Result<()> {
    graceful_stop_with_timeout(child, eof, GRACEFUL_STOP_TIMEOUT).await
}

async fn graceful_stop_with_timeout(
    child: &mut Child,
    eof: bool,
    deadline: Duration,
) -> io::Result<()> {
    if child.try_wait()?.is_some() {
        return Ok(());
    }
    let stop = async {
        let stdin = child.stdin.as_mut().ok_or_else(|| {
            io::Error::new(io::ErrorKind::BrokenPipe, "child stdin is unavailable")
        })?;
        if !eof {
            stdin.write_all(b"stop\n").await?;
        }
        stdin.shutdown().await?;
        // Drop only after shutdown succeeds, so cancellation retains the handle.
        child.stdin.take();
        child.wait().await
    };
    let status = match tokio::time::timeout(deadline, stop).await {
        Ok(result) => result?,
        Err(_) => {
            send_default_termination(child)?;
            child.wait().await?
        }
    };
    if !status.success() {
        return Err(io::Error::other(format!(
            "graceful shutdown failed: {status}"
        )));
    }
    Ok(())
}

/// An absent child, a normal exit, and a signal exit all count as exited.
/// Unlike Node's cached event fields, Tokio's `try_wait` can reap the child.
pub fn has_exited(child: Option<&mut Child>) -> io::Result<bool> {
    match child {
        None => Ok(true),
        Some(child) => Ok(child.try_wait()?.is_some()),
    }
}

/// Send the platform's default termination signal and await exit for ten seconds.
/// Timeout is an error; the caller keeps the child handle and may retry or escalate.
pub async fn terminate_child(child: Option<&mut Child>) -> io::Result<()> {
    terminate_with_timeout(child, TERMINATE_TIMEOUT).await
}

async fn terminate_with_timeout(child: Option<&mut Child>, deadline: Duration) -> io::Result<()> {
    let Some(child) = child else { return Ok(()) };
    if child.try_wait()?.is_some() {
        return Ok(());
    }

    // Tokio's Child retains the reaping handle, so wait observes an exit even
    // when the process exits immediately after the signal.
    send_default_termination(child)?;
    tokio::time::timeout(deadline, child.wait())
        .await
        .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "child termination timed out"))??;
    Ok(())
}

#[cfg(unix)]
fn send_default_termination(child: &mut Child) -> io::Result<()> {
    let Some(pid) = child.id() else { return Ok(()) };
    let pid = i32::try_from(pid).map_err(|_| io::Error::other("child PID out of range"))?;
    // SAFETY: kill has no pointer arguments. This is an unreaped child PID held
    // by the caller; a racing exit cannot recycle it until it is reaped.
    if unsafe { libc::kill(pid, libc::SIGTERM) } == 0 {
        return Ok(());
    }
    let error = io::Error::last_os_error();
    // A child that raced to exit must still be waited for. Node's kill()
    // returns false for ESRCH and then its exit listener resolves.
    if error.raw_os_error() == Some(libc::ESRCH) {
        return Ok(());
    }
    Err(error)
}

#[cfg(not(unix))]
fn send_default_termination(child: &mut Child) -> io::Result<()> {
    child.start_kill()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Stdio;
    use tokio::{
        io::{AsyncBufReadExt, BufReader},
        process::Command,
    };

    #[tokio::test]
    async fn graceful_stop_sends_command_and_eof() {
        for eof in [false, true] {
            let script = if eof {
                "if read -r line; then exit 9; else exit 0; fi"
            } else {
                "IFS= read -r line; [ \"$line\" = stop ] || exit 8; if read -r line; then exit 9; else exit 0; fi"
            };
            let mut child = Command::new("/bin/sh")
                .args(["-c", script])
                .stdin(Stdio::piped())
                .spawn()
                .unwrap();
            graceful_stop(&mut child, eof).await.unwrap();
            assert!(has_exited(Some(&mut child)).unwrap());
        }
    }

    #[tokio::test]
    async fn graceful_stop_rejects_nonzero_and_missing_stdin() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "read -r line; exit 7"])
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        assert!(graceful_stop(&mut child, false).await.is_err());
        assert_eq!(child.wait().await.unwrap().code(), Some(7));

        let mut child = Command::new("/bin/sh")
            .args(["-c", "exec sleep 30"])
            .stdin(Stdio::null())
            .spawn()
            .unwrap();
        assert_eq!(
            graceful_stop(&mut child, false).await.unwrap_err().kind(),
            io::ErrorKind::BrokenPipe
        );
        child.kill().await.unwrap();
    }

    #[tokio::test]
    async fn graceful_stop_timeout_signals_and_reports_nonzero() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "exec sleep 30"])
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        let error = graceful_stop_with_timeout(&mut child, false, Duration::from_millis(50))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("graceful shutdown failed"));
        assert!(has_exited(Some(&mut child)).unwrap());
    }

    #[tokio::test]
    async fn cancelled_graceful_stop_retains_child_for_cleanup() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "exec sleep 30"])
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(50), graceful_stop(&mut child, false))
                .await
                .is_err()
        );
        assert!(!has_exited(Some(&mut child)).unwrap());
        terminate_child(Some(&mut child)).await.unwrap();
    }

    #[tokio::test]
    async fn absent_and_already_exited_children_are_noops() {
        assert!(has_exited(None).unwrap());
        terminate_child(None).await.unwrap();
        let mut child = Command::new("/bin/sh")
            .args(["-c", "exit 7"])
            .spawn()
            .unwrap();
        let status = child.wait().await.unwrap();
        assert_eq!(status.code(), Some(7));
        assert!(has_exited(Some(&mut child)).unwrap());
        terminate_child(Some(&mut child)).await.unwrap();
    }

    #[tokio::test]
    async fn already_signal_exited_child_is_a_noop() {
        use std::os::unix::process::ExitStatusExt;

        let mut child = Command::new("/bin/sh")
            .args(["-c", "exec sleep 30"])
            .spawn()
            .unwrap();
        child.start_kill().unwrap();
        let status = child.wait().await.unwrap();
        assert_eq!(status.code(), None);
        assert_eq!(status.signal(), Some(libc::SIGKILL));
        assert!(has_exited(Some(&mut child)).unwrap());
        terminate_child(Some(&mut child)).await.unwrap();
    }

    #[tokio::test]
    async fn termination_observes_signal_exit_and_is_idempotent() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "exec sleep 30"])
            .spawn()
            .unwrap();
        assert!(!has_exited(Some(&mut child)).unwrap());
        terminate_child(Some(&mut child)).await.unwrap();
        assert!(has_exited(Some(&mut child)).unwrap());
        terminate_child(Some(&mut child)).await.unwrap();
    }

    #[tokio::test]
    async fn ignored_signal_times_out_without_discarding_child() {
        let mut child = Command::new("/bin/sh")
            .args(["-c", "trap '' TERM; echo ready; exec sleep 30"])
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut stdout = BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        stdout.read_line(&mut line).await.unwrap();
        assert_eq!(line, "ready\n");
        let error = terminate_with_timeout(Some(&mut child), Duration::from_millis(50))
            .await
            .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(!has_exited(Some(&mut child)).unwrap());
        child.kill().await.unwrap();
        assert!(has_exited(Some(&mut child)).unwrap());
    }
}
