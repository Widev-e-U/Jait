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
        atomic::{AtomicBool, AtomicU8, Ordering},
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
/// Conservative evidence for a supervised captured execution. A spawned process
/// can leave descendants outside its process group, so this runner never certifies
/// quiescence. In-flight, dropped, and spawned executions all remain Unknown.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProcessQuiescence {
    NoSpawn,
    Unknown,
}

/// One-shot observation held by the supervisor independently of the run future.
/// The supervisor must quarantine its lease whenever the result is Unknown,
/// including after an aborted task or runtime shutdown.
#[derive(Clone, Default)]
pub struct ProcessObservation(Arc<AtomicU8>);
impl ProcessObservation {
    pub fn quiescence(&self) -> ProcessQuiescence {
        if self.0.load(Ordering::Acquire) == 2 {
            ProcessQuiescence::NoSpawn
        } else {
            ProcessQuiescence::Unknown
        }
    }
}

/// Bounded host-owned storage for capabilities whose process cleanup is unknown.
/// This preserves capability lifetime only; it is not OS process containment or
/// protection against non-participating writers. Construct it at the host lifetime,
/// and retain the guard independently of any abortable request task.
pub struct ProcessQuarantine<C> {
    state: Arc<Mutex<QuarantineState<C>>>,
}
struct QuarantineState<C> {
    slots: Vec<Option<C>>,
}
impl<C> Drop for QuarantineState<C> {
    fn drop(&mut self) {
        // Dropping the registry must not silently release unknown capabilities.
        // A leak is intentional: recovery needs an independent quiescence protocol.
        for capability in &mut self.slots {
            if let Some(capability) = capability.take() {
                std::mem::forget(capability);
            }
        }
    }
}
/// A reserved slot holds its capability until a completed no-spawn observation.
/// Unknown outcomes are permanently quarantined in this primitive.
pub struct QuarantinedProcess<C> {
    state: Arc<Mutex<QuarantineState<C>>>,
    slot: usize,
    observation: ProcessObservation,
}
impl<C> ProcessQuarantine<C> {
    pub fn new(capacity: usize) -> Self {
        Self {
            state: Arc::new(Mutex::new(QuarantineState {
                slots: std::iter::repeat_with(|| None).take(capacity).collect(),
            })),
        }
    }
    /// Reserve storage before starting execution. Full storage returns the
    /// untouched capability to the owner; no process may then be started.
    pub fn try_hold(&self, capability: C) -> Result<QuarantinedProcess<C>, C> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let Some(slot) = state.slots.iter().position(Option::is_none) else {
            return Err(capability);
        };
        state.slots[slot] = Some(capability);
        Ok(QuarantinedProcess {
            state: self.state.clone(),
            slot,
            observation: ProcessObservation::default(),
        })
    }
}
impl<C> QuarantinedProcess<C> {
    pub fn observation(&self) -> ProcessObservation {
        self.observation.clone()
    }
}
impl<C> Drop for QuarantinedProcess<C> {
    fn drop(&mut self) {
        if self.observation.quiescence() == ProcessQuiescence::NoSpawn {
            let capability = self
                .state
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .slots[self.slot]
                .take();
            drop(capability);
        }
    }
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
    /// Cancellation is checked before spawn. Dropping an in-flight future requests
    /// child and process-group termination and closes the pool because cleanup is
    /// unconfirmed. Processes that leave the group require separate supervision.
    pub async fn run_captured(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
    ) -> io::Result<CapturedProcessResult> {
        let result = self
            .run_inner(request, cancellation, true, &|_| Ok(()), None)
            .await?;
        Ok(CapturedProcessResult {
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.display.exit_code,
            timed_out: result.display.timed_out,
            cancelled: result.display.cancelled,
            truncated: result.display.truncated,
        })
    }
    /// Capture raw output while revalidating after admission and before each spawn attempt.
    /// The callback does not itself grant authority or confine an already-started child.
    pub async fn run_captured_revalidated(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
        revalidate: &(dyn Fn(&ProcessRequest) -> io::Result<()> + Send + Sync),
    ) -> io::Result<CapturedProcessResult> {
        let result = self
            .run_inner(request, cancellation, true, revalidate, None)
            .await?;
        Ok(CapturedProcessResult {
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.display.exit_code,
            timed_out: result.display.timed_out,
            cancelled: result.display.cancelled,
            truncated: result.display.truncated,
        })
    }
    /// Like `run_captured_revalidated`, with conservative spawn evidence for
    /// an independently owned supervisor. The observation is one-shot; dropping
    /// this future leaves it Unknown even if no spawn has yet occurred.
    pub async fn run_captured_observed(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
        revalidate: &(dyn Fn(&ProcessRequest) -> io::Result<()> + Send + Sync),
        observation: &ProcessObservation,
    ) -> io::Result<CapturedProcessResult> {
        observation
            .0
            .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "process observation already used",
                )
            })?;
        let result = self
            .run_inner(request, cancellation, true, revalidate, Some(observation))
            .await;
        // This transition happens only on a completed future with no successful
        // spawn. A dropped future remains Unknown rather than releasing authority.
        let _ = observation
            .0
            .compare_exchange(1, 2, Ordering::AcqRel, Ordering::Acquire);
        let result = result?;
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
        Ok(self
            .run_inner(request, cancellation, false, &|_| Ok(()), None)
            .await?
            .display)
    }
    /// Revalidate the exact request after admission and immediately before every spawn attempt.
    /// The callback must be fast and nonblocking; it should check current request-bound authority.
    /// This is not a grant, nor does it revoke a child that has already started.
    pub async fn run_revalidated(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
        revalidate: &(dyn Fn(&ProcessRequest) -> io::Result<()> + Send + Sync),
    ) -> io::Result<ProcessResult> {
        Ok(self
            .run_inner(request, cancellation, false, revalidate, None)
            .await?
            .display)
    }
    async fn run_inner(
        &self,
        request: ProcessRequest,
        cancellation: ProcessCancellation,
        raw: bool,
        revalidate: &(dyn Fn(&ProcessRequest) -> io::Result<()> + Send + Sync),
        observation: Option<&ProcessObservation>,
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
            // Tokio 1.53.3 keeps this armed when wait returns ECHILD. Disarming
            // OwnedGroup alone therefore cannot make competing reapers safe:
            // replacing this path requires exclusive ownership or a stable handle
            // for both the direct child and its group, including future drop.
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
            if cancellation.is_cancelled() {
                return Ok(Completion {
                    display: empty_result(false, true),
                    stdout: vec![],
                    stderr: vec![],
                });
            }
            revalidate(&request)?;
            if cancellation.is_cancelled() {
                return Ok(Completion {
                    display: empty_result(false, true),
                    stdout: vec![],
                    stderr: vec![],
                });
            }
            match command.spawn() {
                Ok(child) => {
                    if let Some(observation) = observation {
                        observation.0.store(3, Ordering::Release);
                    }
                    break child;
                }
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
        let mut group = OwnedGroup(Some(child.id().expect("spawned child") as i32));
        // Dropping this future cannot await child reaping or confirm group cleanup.
        let mut cleanup_guard = CleanupGuard::new(&self.permits);
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
                Ok((_, _, _, status)) => {
                    // A child may exit successfully while leaving group members behind.
                    // Report signalling failures before allowing the pool to be reused.
                    #[cfg(unix)]
                    group.kill()?;
                    status.code()
                }
                Err(error) => {
                    // ECHILD means a competing reaper may have released the IDs.
                    // Do not explicitly signal either saved identifier in that case.
                    #[cfg(unix)]
                    if group.forget_if_reaped_elsewhere(&error, &self.permits) {
                        return Err(error);
                    }
                    #[cfg(unix)]
                    let group_cleanup = group.kill();
                    #[cfg(not(unix))]
                    let group_cleanup = Ok(());
                    // Preserve the original I/O error while closing admissions if cleanup fails.
                    let _ = finish_cancelled_child(&mut child, group_cleanup, &self.permits).await;
                    cleanup_guard.disarm();
                    return Err(error);
                }
            }
        } else {
            #[cfg(unix)]
            let group_cleanup = group.kill();
            #[cfg(not(unix))]
            let group_cleanup = Ok(());
            finish_cancelled_child(&mut child, group_cleanup, &self.permits).await?
        };
        cleanup_guard.disarm();
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
// A dropped in-flight future cannot establish that its process was cleaned up.
struct CleanupGuard<'a> {
    permits: &'a Semaphore,
    armed: bool,
}
impl<'a> CleanupGuard<'a> {
    fn new(permits: &'a Semaphore) -> Self {
        Self {
            permits,
            armed: true,
        }
    }
    fn disarm(&mut self) {
        self.armed = false;
    }
}
impl Drop for CleanupGuard<'_> {
    fn drop(&mut self) {
        if self.armed {
            self.permits.close();
        }
    }
}
// Bound cleanup even if termination fails; unconfirmed cleanup closes admissions.
const CHILD_REAP_TIMEOUT: Duration = Duration::from_secs(2);

// Try to reap the direct child before reporting a group signalling failure.
async fn finish_cancelled_child(
    child: &mut tokio::process::Child,
    group_cleanup: io::Result<()>,
    permits: &Semaphore,
) -> io::Result<Option<i32>> {
    finish_cancelled_child_with(child, group_cleanup, permits, CHILD_REAP_TIMEOUT, |child| {
        child.start_kill()
    })
    .await
}

async fn finish_cancelled_child_with(
    child: &mut tokio::process::Child,
    group_cleanup: io::Result<()>,
    permits: &Semaphore,
    timeout: Duration,
    terminate: impl FnOnce(&mut tokio::process::Child) -> io::Result<()>,
) -> io::Result<Option<i32>> {
    // Close immediately on a signalling error, even while the child is being reaped.
    if group_cleanup.is_err() {
        permits.close();
    }
    let _ = terminate(child);
    let status = wait_for_child_bounded(child, permits, timeout).await?;
    group_cleanup?;
    Ok(status.code())
}
async fn wait_for_child_bounded(
    child: &mut tokio::process::Child,
    permits: &Semaphore,
    timeout: Duration,
) -> io::Result<std::process::ExitStatus> {
    match tokio::time::timeout(timeout, child.wait()).await {
        Ok(Ok(status)) => Ok(status),
        Ok(Err(error)) => {
            permits.close();
            Err(error)
        }
        Err(_) => {
            permits.close();
            Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "child cleanup timed out",
            ))
        }
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
struct OwnedGroup(Option<i32>);
#[cfg(unix)]
impl OwnedGroup {
    fn forget_if_reaped_elsewhere(&mut self, error: &io::Error, permits: &Semaphore) -> bool {
        if error.raw_os_error() != Some(libc::ECHILD) {
            return false;
        }
        self.0 = None;
        permits.close();
        true
    }
    fn kill(&mut self) -> io::Result<()> {
        self.kill_with(|id| {
            if unsafe { libc::kill(-id, libc::SIGKILL) } == 0 {
                Ok(())
            } else {
                Err(io::Error::last_os_error())
            }
        })
    }
    fn kill_with(&mut self, signal: impl FnOnce(i32) -> io::Result<()>) -> io::Result<()> {
        // A retry after the child is reaped could signal a reused group ID.
        let Some(id) = self.0.take() else {
            return Ok(());
        };
        match signal(id) {
            Err(error) if error.raw_os_error() == Some(libc::ESRCH) => Ok(()),
            result => result,
        }
    }
}
#[cfg(unix)]
impl Drop for OwnedGroup {
    fn drop(&mut self) {
        let _ = self.kill();
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
    async fn quarantine_retains_unknown_and_releases_only_no_spawn() {
        struct Capability(Arc<std::sync::atomic::AtomicUsize>);
        impl Drop for Capability {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let dropped = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let quarantine = ProcessQuarantine::new(1);
        let guard = quarantine
            .try_hold(Capability(dropped.clone()))
            .ok()
            .unwrap();
        let observation = guard.observation();
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        pool.run_captured_observed(request("exit 0", 1024), cancel, &|_| Ok(()), &observation)
            .await
            .unwrap();
        drop(guard);
        assert_eq!(dropped.load(Ordering::SeqCst), 1);

        let guard = quarantine
            .try_hold(Capability(dropped.clone()))
            .ok()
            .unwrap();
        let observation = guard.observation();
        pool.run_captured_observed(
            request("exit 0", 1024),
            ProcessCancellation::default(),
            &|_| Ok(()),
            &observation,
        )
        .await
        .unwrap();
        drop(guard);
        let rejected = quarantine
            .try_hold(Capability(dropped.clone()))
            .err()
            .unwrap();
        drop(rejected);
        assert_eq!(dropped.load(Ordering::SeqCst), 2);
        drop(quarantine);
        assert_eq!(dropped.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn quarantine_retains_capability_when_future_is_aborted() {
        struct Capability(Arc<std::sync::atomic::AtomicUsize>);
        impl Drop for Capability {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let dropped = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let quarantine = ProcessQuarantine::new(1);
        let guard = quarantine
            .try_hold(Capability(dropped.clone()))
            .ok()
            .unwrap();
        let observation = guard.observation();
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let permit = pool.permits.clone().acquire_owned().await.unwrap();
        let task = tokio::spawn(async move {
            pool.run_captured_observed(
                request("exit 0", 1024),
                ProcessCancellation::default(),
                &|_| Ok(()),
                &observation,
            )
            .await
        });
        tokio::task::yield_now().await;
        task.abort();
        let _ = task.await;
        drop(permit);
        drop(guard);
        drop(quarantine);
        assert_eq!(dropped.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn observed_execution_only_certifies_completed_no_spawn() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let cancelled = ProcessCancellation::default();
        cancelled.cancel();
        let no_spawn = ProcessObservation::default();
        assert_eq!(no_spawn.quiescence(), ProcessQuiescence::Unknown);
        pool.run_captured_observed(request("exit 0", 1024), cancelled, &|_| Ok(()), &no_spawn)
            .await
            .unwrap();
        assert_eq!(no_spawn.quiescence(), ProcessQuiescence::NoSpawn);
        assert!(
            pool.run_captured_observed(
                request("exit 0", 1024),
                ProcessCancellation::default(),
                &|_| Ok(()),
                &no_spawn
            )
            .await
            .is_err()
        );
        assert_eq!(no_spawn.quiescence(), ProcessQuiescence::NoSpawn);

        let spawned = ProcessObservation::default();
        pool.run_captured_observed(
            request("exit 0", 1024),
            ProcessCancellation::default(),
            &|_| Ok(()),
            &spawned,
        )
        .await
        .unwrap();
        assert_eq!(spawned.quiescence(), ProcessQuiescence::Unknown);

        let denied = ProcessObservation::default();
        assert!(
            pool.run_captured_observed(
                request("exit 0", 1024),
                ProcessCancellation::default(),
                &|_| Err(io::Error::new(io::ErrorKind::PermissionDenied, "denied")),
                &denied
            )
            .await
            .is_err()
        );
        assert_eq!(denied.quiescence(), ProcessQuiescence::NoSpawn);
    }

    #[tokio::test]
    async fn concurrent_observation_reuse_cannot_certify_no_spawn() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let permit = pool.permits.clone().acquire_owned().await.unwrap();
        let observation = ProcessObservation::default();
        let task = tokio::spawn({
            let pool = pool.clone();
            let observation = observation.clone();
            async move {
                pool.run_captured_observed(
                    request("exit 0", 1024),
                    ProcessCancellation::default(),
                    &|_| Ok(()),
                    &observation,
                )
                .await
            }
        });
        tokio::time::timeout(Duration::from_secs(5), async {
            while observation.0.load(Ordering::Acquire) != 1 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("first execution did not claim observation");
        let error = pool
            .run_captured_observed(
                request("exit 0", 1024),
                ProcessCancellation::default(),
                &|_| Ok(()),
                &observation,
            )
            .await
            .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert_eq!(observation.quiescence(), ProcessQuiescence::Unknown);
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        drop(permit);
        assert_eq!(observation.quiescence(), ProcessQuiescence::Unknown);
    }

    #[tokio::test]
    async fn dropped_observed_future_remains_unknown() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let permit = pool.permits.clone().acquire_owned().await.unwrap();
        let observation = ProcessObservation::default();
        let task = tokio::spawn({
            let pool = pool.clone();
            let observation = observation.clone();
            async move {
                pool.run_captured_observed(
                    request("exit 0", 1024),
                    ProcessCancellation::default(),
                    &|_| Ok(()),
                    &observation,
                )
                .await
            }
        });
        tokio::task::yield_now().await;
        task.abort();
        let _ = task.await;
        drop(permit);
        assert_eq!(observation.quiescence(), ProcessQuiescence::Unknown);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn aborting_running_process_closes_pool_admissions() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .find(|path| path.join("packages/gateway-rust/Cargo.toml").is_file())
            .unwrap()
            .to_path_buf();
        let dir = root.join(".jait/artifacts/gateway-rust/preview-stop-test");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join(format!("abort-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        let script = format!(
            "printf '%s' \"$$\" > '{}'; exec /bin/sleep 30",
            marker.display()
        );
        let mut req = request(&script, 1024);
        req.cwd = root;
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let task = tokio::spawn({
            let pool = pool.clone();
            async move { pool.run(req, ProcessCancellation::default()).await }
        });
        let pid: u32 = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some(pid) = std::fs::read_to_string(&marker)
                    .ok()
                    .and_then(|text| text.parse().ok())
                {
                    break pid;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("child did not start");
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(pool.permits.is_closed());
        assert!(pool.permits.acquire().await.is_err());
        tokio::time::timeout(Duration::from_secs(3), async {
            while PathBuf::from(format!("/proc/{pid}")).exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("direct child was not reaped");
        let _ = std::fs::remove_file(marker);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn waitid_wnowait_observes_exit_without_reaping_leader() {
        let mut child = Command::new("/bin/true")
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let pid = child.id().unwrap();
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
                let result = unsafe {
                    libc::waitid(
                        libc::P_PID,
                        pid,
                        &mut info,
                        libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                    )
                };
                assert_eq!(result, 0, "waitid failed: {}", io::Error::last_os_error());
                if unsafe { info.si_pid() } == pid as libc::pid_t {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("child did not exit");
        // WNOWAIT left the leader waitable; Tokio can still collect its real status.
        assert!(PathBuf::from(format!("/proc/{pid}")).exists());
        assert!(child.wait().await.unwrap().success());
        assert!(!PathBuf::from(format!("/proc/{pid}")).exists());
    }

    #[cfg(unix)]
    #[test]
    fn failed_group_signal_is_not_retried_after_ownership_is_consumed() {
        let mut group = OwnedGroup(Some(123));
        let error = group
            .kill_with(|_| Err(io::Error::from_raw_os_error(libc::EPERM)))
            .unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::EPERM));
        assert!(group.0.is_none());
        group
            .kill_with(|_| panic!("failed signal must not be retried"))
            .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cleanup_wait_timeout_closes_admissions() {
        let mut child = Command::new("/bin/sleep")
            .arg("30")
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let permits = Semaphore::new(1);
        let error = wait_for_child_bounded(&mut child, &permits, Duration::from_millis(20))
            .await
            .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(permits.is_closed());
        child.kill().await.unwrap();
        child.wait().await.unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_signals_do_not_block_cleanup_indefinitely() {
        let mut child = Command::new("/bin/sleep")
            .arg("30")
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let permits = Semaphore::new(1);
        let result = tokio::time::timeout(
            Duration::from_secs(1),
            finish_cancelled_child_with(
                &mut child,
                Err(io::Error::from_raw_os_error(libc::EPERM)),
                &permits,
                Duration::from_millis(20),
                |_| Err(io::Error::from_raw_os_error(libc::EPERM)),
            ),
        )
        .await
        .expect("cleanup exceeded its outer deadline");
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
        assert!(permits.is_closed());
        assert!(child.try_wait().unwrap().is_none());
        child.kill().await.unwrap();
        child.wait().await.unwrap();
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn externally_reaped_child_discards_runner_group() {
        // Disable Tokio's drop signal for this test: the reaped numeric PID no
        // longer establishes ownership and the test must not signal it.
        let mut child = Command::new("/bin/true")
            .kill_on_drop(false)
            .spawn()
            .unwrap();
        let pid = child.id().unwrap() as libc::pid_t;
        let mut status = 0;
        assert_eq!(unsafe { libc::waitpid(pid, &mut status, 0) }, pid);
        let error = child.wait().await.unwrap_err();
        assert_eq!(error.raw_os_error(), Some(libc::ECHILD));
        let permits = Semaphore::new(1);
        let mut group = OwnedGroup(Some(pid));
        assert!(group.forget_if_reaped_elsewhere(&error, &permits));
        assert!(permits.is_closed());
        group
            .kill_with(|_| panic!("reaped child group must not be signalled"))
            .unwrap();
    }

    #[test]
    fn competing_reaper_error_discards_group_and_closes_admissions() {
        let permits = Semaphore::new(1);
        let mut group = OwnedGroup(Some(123));
        assert!(
            !group.forget_if_reaped_elsewhere(&io::Error::from_raw_os_error(libc::EINTR), &permits)
        );
        assert!(!permits.is_closed());
        assert!(
            group.forget_if_reaped_elsewhere(&io::Error::from_raw_os_error(libc::ECHILD), &permits)
        );
        assert!(permits.is_closed());
        group
            .kill_with(|_| panic!("lost group identity must not be signalled"))
            .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_reaps_child_before_reporting_group_signal_failure() {
        let mut child = Command::new("/bin/sleep")
            .arg("30")
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let permits = Semaphore::new(1);
        let error = finish_cancelled_child(
            &mut child,
            Err(io::Error::from_raw_os_error(libc::EPERM)),
            &permits,
        )
        .await
        .unwrap_err();
        assert!(
            permits.is_closed(),
            "unconfirmed cleanup must stop new admissions"
        );
        assert!(permits.acquire().await.is_err());
        assert_eq!(error.raw_os_error(), Some(libc::EPERM));
        assert!(
            child.try_wait().unwrap().is_some(),
            "child must be reaped before error"
        );
    }
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn cancellation_signals_a_descendant_in_the_owned_group() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .find(|path| path.join("packages/gateway-rust/Cargo.toml").is_file())
            .unwrap()
            .to_path_buf();
        let dir = root.join(".jait/artifacts/gateway-rust/preview-stop-test");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join(format!("descendant-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);
        let script = format!(
            "/bin/sleep 30 & printf '%s' \"$!\" > '{}'; wait",
            marker.display()
        );
        let mut req = request(&script, 1024);
        req.cwd = root;
        req.timeout = Duration::from_secs(40);
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let cancel = ProcessCancellation::default();
        let task = tokio::spawn({
            let cancel = cancel.clone();
            async move { pool.run(req, cancel).await }
        });
        let pid: u32 = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some(pid) = std::fs::read_to_string(&marker)
                    .ok()
                    .and_then(|text| text.parse().ok())
                {
                    break pid;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("descendant did not start");
        cancel.cancel();
        assert!(task.await.unwrap().unwrap().cancelled);
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"));
                let stopped = match stat {
                    Ok(text) => {
                        text.rsplit_once(") ")
                            .and_then(|(_, tail)| tail.chars().next())
                            == Some('Z')
                    }
                    Err(error)
                        if error.kind() == io::ErrorKind::NotFound
                            || error.raw_os_error() == Some(libc::ESRCH) =>
                    {
                        true
                    }
                    Err(error) => panic!("cannot inspect descendant: {error}"),
                };
                if stopped {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("descendant still running after cancellation");
        let _ = std::fs::remove_file(marker);
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
    async fn revalidation_occurs_after_admission_and_denial_prevents_spawn() {
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let held = pool.permits.clone().acquire_owned().await.unwrap();
        let allowed = Arc::new(AtomicBool::new(true));
        let checks = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let task_pool = pool.clone();
        let task_allowed = allowed.clone();
        let task_checks = checks.clone();
        let task = tokio::spawn(async move {
            let check = |req: &ProcessRequest| {
                assert_eq!(req.argv[0], "/definitely-not-an-executable");
                task_checks.fetch_add(1, Ordering::SeqCst);
                if task_allowed.load(Ordering::SeqCst) {
                    Ok(())
                } else {
                    Err(io::Error::new(io::ErrorKind::PermissionDenied, "revoked"))
                }
            };
            let mut req = request("exit 0", 128);
            req.argv = vec!["/definitely-not-an-executable".into()];
            task_pool
                .run_revalidated(req, ProcessCancellation::default(), &check)
                .await
        });
        tokio::task::yield_now().await;
        assert_eq!(checks.load(Ordering::SeqCst), 0);
        allowed.store(false, Ordering::SeqCst);
        drop(held);
        let err = task.await.unwrap().unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(checks.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn captured_revalidation_rejects_revocation_after_admission_wait() {
        use std::future::{Future, poll_fn};
        use std::task::Poll;
        let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
        let held = pool.permits.clone().acquire_owned().await.unwrap();
        let allowed = AtomicBool::new(true);
        let checks = std::sync::atomic::AtomicUsize::new(0);
        let check = |_: &ProcessRequest| {
            checks.fetch_add(1, Ordering::SeqCst);
            if allowed.load(Ordering::SeqCst) {
                Ok(())
            } else {
                Err(io::Error::new(io::ErrorKind::PermissionDenied, "revoked"))
            }
        };
        let mut req = request("exit 0", 128);
        req.argv = vec!["/definitely-not-an-executable".into()];
        let future = pool.run_captured_revalidated(req, ProcessCancellation::default(), &check);
        tokio::pin!(future);
        // Poll the actual runner to Pending while the only permit is held. A scheduler
        // yield alone does not establish that the spawned task reached admission.
        poll_fn(|cx| match future.as_mut().poll(cx) {
            Poll::Pending => Poll::Ready(()),
            Poll::Ready(_) => panic!("runner completed before admission"),
        })
        .await;
        assert_eq!(checks.load(Ordering::SeqCst), 0);
        allowed.store(false, Ordering::SeqCst);
        drop(held);
        let err = future.await.unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(checks.load(Ordering::SeqCst), 1);
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
