//! Captured argv execution for already-authorized tool/sandbox work.
//! This primitive grants no consent, scope, shell, container, or route access.
//! Callers supply the execution environment; host credentials are not inherited.
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    num::NonZeroU16,
    path::PathBuf,
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::{Notify, Semaphore},
};

/// Maximum number of `spawn` attempts for transient kernel refusals.
const SPAWN_ATTEMPTS: u32 = 8;

/// Transient refusals that a short bounded retry of the unchanged command resolves.
#[cfg(unix)]
fn is_transient_spawn_error(error: &io::Error) -> bool {
    // ETXTBSY: the executable is momentarily open for writing, e.g. a script that was just
    // written by a concurrent task. EAGAIN: the kernel briefly refused the fork.
    matches!(error.raw_os_error(), Some(26) | Some(11))
}

#[cfg(not(unix))]
fn is_transient_spawn_error(_error: &io::Error) -> bool {
    false
}

#[derive(Clone, Debug)]
pub struct ProcessRequest {
    pub argv: Vec<String>,
    pub cwd: PathBuf,
    pub environment: HashMap<String, String>,
    pub input: Option<Vec<u8>>,
    pub timeout: Duration,
    pub output_limit: usize,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResult {
    pub output: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub truncated: bool,
}
/// Raw stdout/stderr share one byte budget and preserve whitespace.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CapturedProcessResult {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub truncated: bool,
}
struct Completion {
    display: ProcessResult,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}
#[derive(Default)]
struct CancellationState {
    cancelled: AtomicBool,
    notify: Notify,
}
#[derive(Clone, Default)]
pub struct ProcessCancellation(Arc<CancellationState>);
impl ProcessCancellation {
    pub fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        self.0.notify.notify_waiters();
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }
    pub async fn wait_cancelled(&self) {
        loop {
            let notified = self.0.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}
#[derive(Clone)]
pub struct ProcessPool {
    permits: Arc<Semaphore>,
}
impl ProcessPool {
    pub fn new(parallelism: NonZeroU16) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(usize::from(parallelism.get()))),
        }
    }
    pub fn close(&self) {
        self.permits.close();
    }
    /// Execute only after the enclosing policy/consent boundary authorizes this exact request.
    /// An aborted future kills the owned child/group; cancellation is checked before spawn.
    pub async fn run_captured(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
    ) -> io::Result<CapturedProcessResult> {
        let result = self.run_inner(request, cancellation, true).await?;
        Ok(CapturedProcessResult {
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.display.exit_code,
            timed_out: result.display.timed_out,
            cancelled: result.display.cancelled,
            truncated: result.display.truncated,
        })
    }
    pub async fn run(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
    ) -> io::Result<ProcessResult> {
        Ok(self.run_inner(request, cancellation, false).await?.display)
    }
    async fn run_inner(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
        raw: bool,
    ) -> io::Result<Completion> {
        if request.argv.is_empty()
            || request.argv[0].is_empty()
            || request.argv.iter().any(|s| s.contains('\0'))
            || request.timeout.is_zero()
            || request.timeout > Duration::from_secs(86400)
            || request.output_limit == 0
            || request.output_limit > 16 * 1024 * 1024
            || request
                .input
                .as_ref()
                .is_some_and(|v| v.len() > 16 * 1024 * 1024)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid bounded process request",
            ));
        }
        if cancellation.is_cancelled() {
            return Ok(Completion {
                display: empty_result(false, true),
                stdout: vec![],
                stderr: vec![],
            });
        }
        let _permit = tokio::select! {
            biased;
            _ = cancellation.wait_cancelled() => {
                return Ok(Completion {
                    display: empty_result(false, true),
                    stdout: vec![],
                    stderr: vec![],
                });
            }
            permit = self.permits.clone().acquire_owned() => permit.map_err(|_| {
                io::Error::new(io::ErrorKind::BrokenPipe, "process pool closed")
            })?,
        };
        let mut command = Command::new(&request.argv[0]);
        command
            .args(&request.argv[1..])
            .current_dir(&request.cwd)
            .env_clear()
            .envs(&request.environment)
            .stdin(if request.input.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        // A command-not-found is returned without platform-dependent error text or argv leakage.
        // Spawning is retried a bounded number of times for transient kernel refusals (a freshly
        // written executable is briefly ETXTBSY while another task still holds it open, and fork
        // can return EAGAIN under momentary resource pressure). The permit stays held and
        // cancellation is honoured between attempts, so the bounded contract is unchanged.
        let mut attempt = 0u32;
        let mut child = loop {
            match command.spawn() {
                Ok(child) => break child,
                Err(error) if is_transient_spawn_error(&error) && attempt + 1 < SPAWN_ATTEMPTS => {
                    attempt += 1;
                    tokio::select! {
                        biased;
                        _ = cancellation.wait_cancelled() => {
                            return Ok(Completion {
                                display: empty_result(false, true),
                                stdout: vec![],
                                stderr: vec![],
                            });
                        }
                        _ = tokio::time::sleep(Duration::from_millis(5 * u64::from(attempt))) => {}
                    }
                }
                Err(error) => return Err(error),
            }
        };
        #[cfg(unix)]
        let group = OwnedGroup(child.id().expect("spawned child") as i32);
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let stdin = child.stdin.take();
        let output = Arc::new(Mutex::new(CapturedOutput::default()));
        let deadline = tokio::time::sleep(request.timeout);
        tokio::pin!(deadline);
        let result;
        let mut timed_out = false;
        let mut cancelled = false;
        {
            let complete = async {
                tokio::try_join!(
                    read_output(stdout, output.clone(), request.output_limit, raw, false),
                    read_output(stderr, output.clone(), request.output_limit, raw, true),
                    async move {
                        if let (Some(mut pipe), Some(input)) = (stdin, request.input) {
                            // EPIPE is normal if the child intentionally closes its input early.
                            if let Err(error) = pipe.write_all(&input).await
                                && error.kind() != io::ErrorKind::BrokenPipe
                            {
                                return Err(error);
                            }
                        }
                        Ok(())
                    },
                    child.wait()
                )
            };
            tokio::pin!(complete);
            result = tokio::select! {
                biased;
                _ = cancellation.wait_cancelled() => { cancelled = true; None },
                _ = &mut deadline => { timed_out = true; None },
                value = &mut complete => Some(value),
            };
        }
        let exit_code = if let Some(result) = result {
            match result {
                Ok((_, _, _, status)) => status.code(),
                Err(error) => {
                    #[cfg(unix)]
                    group.kill();
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    return Err(error);
                }
            }
        } else {
            #[cfg(unix)]
            group.kill();
            let _ = child.start_kill();
            // Reap the direct child before releasing its concurrency permit.
            child.wait().await?.code()
        };
        let mut captured = output.lock().unwrap();
        let text = crate::text::js_trim(&captured.text);
        let display = ProcessResult {
            output: if text.is_empty() {
                "(no output)".into()
            } else {
                text.into()
            },
            exit_code,
            timed_out,
            cancelled,
            truncated: captured.truncated,
        };
        Ok(Completion {
            display,
            stdout: std::mem::take(&mut captured.stdout),
            stderr: std::mem::take(&mut captured.stderr),
        })
    }
}
fn empty_result(timed_out: bool, cancelled: bool) -> ProcessResult {
    ProcessResult {
        output: "(no output)".into(),
        exit_code: None,
        timed_out,
        cancelled,
        truncated: false,
    }
}
#[derive(Default)]
struct CapturedOutput {
    text: String,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    truncated: bool,
}
async fn read_output(
    mut pipe: impl AsyncRead + Unpin,
    output: Arc<Mutex<CapturedOutput>>,
    limit: usize,
    raw: bool,
    stderr: bool,
) -> io::Result<()> {
    let mut buffer = [0; 8192];
    loop {
        let n = pipe.read(&mut buffer).await?;
        if n == 0 {
            return Ok(());
        }
        let mut captured = output.lock().unwrap();
        if raw {
            let remaining = limit.saturating_sub(captured.stdout.len() + captured.stderr.len());
            let keep = n.min(remaining);
            captured.truncated |= keep < n;
            if stderr {
                captured.stderr.extend_from_slice(&buffer[..keep]);
            } else {
                captured.stdout.extend_from_slice(&buffer[..keep]);
            }
            continue;
        }
        let text = String::from_utf8_lossy(&buffer[..n]);
        // Keep the tail, as terminal completion output does; continue draining to prevent deadlock.
        // Count decoded UTF-8 bytes, so hostile invalid bytes cannot expand beyond the cap.
        if text.len() >= limit {
            captured.truncated |= !captured.text.is_empty() || text.len() > limit;
            let mut start = text.len() - limit;
            while !text.is_char_boundary(start) {
                start += 1;
            }
            captured.text.clear();
            captured.text.push_str(&text[start..]);
        } else {
            let mut excess = (captured.text.len() + text.len()).saturating_sub(limit);
            if excess > 0 {
                while !captured.text.is_char_boundary(excess) {
                    excess += 1;
                }
                captured.text.drain(..excess);
                captured.truncated = true;
            }
            captured.text.push_str(&text);
        }
    }
}
#[cfg(unix)]
struct OwnedGroup(i32);
#[cfg(unix)]
impl OwnedGroup {
    fn kill(&self) {
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}
#[cfg(unix)]
impl Drop for OwnedGroup {
    fn drop(&mut self) {
        self.kill();
    }
}

#[cfg(all(test, unix))]
mod captured_tests {
    use super::*;
    fn request(script: &str, limit: usize) -> ProcessRequest {
        ProcessRequest {
            argv: vec!["/bin/sh".into(), "-c".into(), script.into()],
            cwd: PathBuf::from("/"),
            environment: HashMap::new(),
            input: None,
            timeout: Duration::from_secs(2),
            output_limit: limit,
        }
    }
    #[tokio::test]
    async fn raw_streams_preserve_whitespace_and_legacy_display() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let result = pool
            .run_captured(
                request("printf '  raw \\t\\n'; printf 'stderr\\n' >&2", 128),
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(result.stdout, b"  raw \t\n");
        assert_eq!(result.stderr, b"stderr\n");
        assert_eq!(result.exit_code, Some(0));
        assert!(!result.truncated);
        let legacy = pool
            .run(
                request("printf '  value  \\n'", 128),
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(legacy.output, "value");
    }
    #[tokio::test]
    async fn raw_streams_share_one_budget_and_honor_cancellation() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let result = pool
            .run_captured(
                request("printf '%0500d' 0; printf '%0500d' 0 >&2", 128),
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(result.stdout.len() + result.stderr.len(), 128);
        assert!(result.truncated);
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        let result = pool
            .run_captured(request("exit 99", 128), cancel)
            .await
            .unwrap();
        assert!(result.cancelled);
        assert_eq!(result.exit_code, None);
        assert!(result.stdout.is_empty());
        let mut req = request("sleep 5", 128);
        req.timeout = Duration::from_millis(40);
        let result = pool
            .run_captured(req, ProcessCancellation::default())
            .await
            .unwrap();
        assert!(result.timed_out);
        assert_eq!(
            pool.run_captured(request("printf done", 128), ProcessCancellation::default())
                .await
                .unwrap()
                .stdout,
            b"done"
        );
    }
}
