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
    pub async fn run(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
    ) -> io::Result<ProcessResult> {
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
            return Ok(empty_result(false, true));
        }
        let _permit = self.permits.clone().try_acquire_owned().map_err(|_| {
            io::Error::new(io::ErrorKind::WouldBlock, "process capacity unavailable")
        })?;
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
        let mut child = command.spawn()?;
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
                    read_output(stdout, output.clone(), request.output_limit),
                    read_output(stderr, output.clone(), request.output_limit),
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
        let captured = output.lock().unwrap();
        let text = crate::text::js_trim(&captured.text);
        Ok(ProcessResult {
            output: if text.is_empty() {
                "(no output)".into()
            } else {
                text.into()
            },
            exit_code,
            timed_out,
            cancelled,
            truncated: captured.truncated,
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
    truncated: bool,
}
async fn read_output(
    mut pipe: impl AsyncRead + Unpin,
    output: Arc<Mutex<CapturedOutput>>,
    limit: usize,
) -> io::Result<()> {
    let mut buffer = [0; 8192];
    loop {
        let n = pipe.read(&mut buffer).await?;
        if n == 0 {
            return Ok(());
        }
        let mut captured = output.lock().unwrap();
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
