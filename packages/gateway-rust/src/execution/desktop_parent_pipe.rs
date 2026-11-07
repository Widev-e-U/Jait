//! Candidate desktop parent-pipe lifecycle. This module is deliberately not wired
//! into a production entrypoint. The owner must be retained until `run` returns.
//!
//! Startup and completion must supervise and join their own work, observe stop,
//! and finish only after cleanup. No task is spawned here. Dropping a `run`
//! future preserves all state; dropping the owner abandons that responsibility.
//! A shutdown deadline is reported once, without dropping either future. The caller
//! must retain and drive the owner or deliberately decide how to handle a stuck
//! process. This differs from Node's forced exit and is not host integration or
//! full Node parity; the host's own kill deadline and launch behavior still apply.
use std::{future::Future, io, pin::Pin, time::Duration};
use tokio::{
    io::{AsyncRead, ReadBuf},
    sync::watch,
};

const READ_SIZE: usize = 256;
// Bound consecutive input processing so a noisy parent cannot starve startup or
// runtime completion. At the boundary a ready lifecycle future gets priority.
const INPUT_BUDGET: usize = 4096;
type Lifecycle = Pin<Box<dyn Future<Output = io::Result<()>> + Send>>;

pub struct DesktopParentPipe<R, F> {
    input: R,
    ready: F,
    port: u16,
    startup: Option<Lifecycle>,
    completion: Option<Lifecycle>,
    stop: watch::Sender<bool>,
    stopping: bool,
    shutdown_timeout: Duration,
    deadline: Option<Pin<Box<tokio::time::Sleep>>>,
    error: Option<io::Error>,
    line_len: usize,
    line_matches: bool,
    after_cr: bool,
    input_budget: usize,
    finished: bool,
}

impl<R, F> DesktopParentPipe<R, F>
where
    R: AsyncRead + Unpin,
    F: FnMut(&str) -> io::Result<()>,
{
    /// Both factories receive the same stop signal and must supervise their work.
    /// The deadline begins at the first stop request, including errors and EOF.
    /// `completion` must supervise the runtime and react to the supplied watch
    /// receiver. The synchronous readiness callback must write the entire marker
    /// or return an error; it must not re-enter this owner.
    pub fn new<S, C, MakeStartup, MakeCompletion>(
        input: R,
        port: u16,
        make_startup: MakeStartup,
        make_completion: MakeCompletion,
        ready: F,
        shutdown_timeout: Duration,
    ) -> Self
    where
        S: Future<Output = io::Result<()>> + Send + 'static,
        C: Future<Output = io::Result<()>> + Send + 'static,
        MakeStartup: FnOnce(watch::Receiver<bool>) -> S,
        MakeCompletion: FnOnce(watch::Receiver<bool>) -> C,
    {
        let (stop, receiver) = watch::channel(false);
        Self {
            input,
            ready,
            port,
            startup: Some(Box::pin(make_startup(receiver.clone()))),
            completion: Some(Box::pin(make_completion(receiver))),
            stop,
            stopping: false,
            shutdown_timeout,
            deadline: None,
            error: None,
            line_len: 0,
            line_matches: true,
            after_cr: false,
            input_budget: 0,
            finished: false,
        }
    }

    fn request_stop(&mut self) {
        if !self.stopping {
            self.stopping = true;
            self.stop.send_replace(true);
            self.deadline = Some(Box::pin(tokio::time::sleep(self.shutdown_timeout)));
        }
    }

    fn fail(&mut self, error: io::Error) {
        if self.error.is_none() {
            self.error = Some(error);
        }
        self.request_stop();
    }

    fn line_end(&mut self) {
        if self.line_matches && self.line_len == 4 {
            self.request_stop();
        }
        self.line_len = 0;
        self.line_matches = true;
    }

    fn consume(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if self.after_cr {
                self.after_cr = false;
                if byte == b'\n' {
                    continue;
                }
            }
            match byte {
                b'\r' => {
                    self.line_end();
                    self.after_cr = true;
                }
                b'\n' => self.line_end(),
                _ => {
                    if self.line_len >= 4 || b"stop"[self.line_len] != byte {
                        self.line_matches = false;
                    }
                    // Only the first four bytes can match; do not grow on long lines.
                    self.line_len = self.line_len.saturating_add(1).min(5);
                }
            }
        }
    }

    /// Drive startup, parent control and supervised completion. Cancelling this
    /// borrow does not drop any of them. On failure, request stop and retain the
    /// first error until startup and supervised cleanup have both completed. If
    /// the shutdown deadline expires, return `TimedOut` once while retaining
    /// both futures and the first error. Calling `run` again continues cleanup
    /// without a second deadline. The caller owns any escalation policy.
    pub async fn run(&mut self) -> io::Result<()> {
        if self.finished {
            return Err(io::Error::other("desktop lifecycle already completed"));
        }
        loop {
            if self.startup.is_none() && self.completion.is_none() {
                self.finished = true;
                return match self.error.take() {
                    Some(error) => Err(error),
                    None => Ok(()),
                };
            }
            // Keep input on the stack instead of allocating for each read.
            #[allow(clippy::large_enum_variant)]
            enum Event {
                Input(io::Result<usize>, [u8; READ_SIZE]),
                Startup(io::Result<()>, Option<io::Result<()>>),
                Completion(io::Result<()>),
                Deadline,
            }
            let event = std::future::poll_fn(|cx| {
                use std::task::Poll;
                let mut poll_lifecycle = |cx: &mut std::task::Context<'_>| {
                    // A completed runtime takes precedence over readiness when
                    // both are observable in the same poll.
                    if let Some(completion) = &mut self.completion
                        && let Poll::Ready(result) = completion.as_mut().poll(cx)
                    {
                        return Some(Event::Completion(result));
                    }
                    if let Some(startup) = &mut self.startup
                        && let Poll::Ready(result) = startup.as_mut().poll(cx)
                    {
                        // Startup can itself make completion ready. Recheck
                        // before publishing readiness, without repolling startup.
                        let completion = self.completion.as_mut().and_then(|completion| {
                            match completion.as_mut().poll(cx) {
                                Poll::Ready(result) => Some(result),
                                Poll::Pending => None,
                            }
                        });
                        return Some(Event::Startup(result, completion));
                    }
                    None
                };
                if self.input_budget >= INPUT_BUDGET || self.stopping {
                    if let Some(event) = poll_lifecycle(cx) {
                        return Poll::Ready(event);
                    }
                    // A full input batch has given both lifecycle futures a turn.
                    // Start a fresh batch even when they are still pending.
                    self.input_budget = 0;
                }
                if !self.stopping {
                    let mut bytes = [0; READ_SIZE];
                    let mut read_buf = ReadBuf::new(&mut bytes);
                    match Pin::new(&mut self.input).poll_read(cx, &mut read_buf) {
                        Poll::Ready(Ok(())) => {
                            let n = read_buf.filled().len();
                            return Poll::Ready(Event::Input(Ok(n), bytes));
                        }
                        Poll::Ready(Err(error)) => {
                            return Poll::Ready(Event::Input(Err(error), bytes));
                        }
                        Poll::Pending => {}
                    }
                }
                if self.input_budget < INPUT_BUDGET
                    && !self.stopping
                    && let Some(event) = poll_lifecycle(cx)
                {
                    return Poll::Ready(event);
                }
                if let Some(deadline) = &mut self.deadline
                    && deadline.as_mut().poll(cx).is_ready()
                {
                    return Poll::Ready(Event::Deadline);
                }
                Poll::Pending
            })
            .await;
            match event {
                Event::Deadline => {
                    self.deadline = None;
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "desktop shutdown deadline exceeded; cleanup remains owned",
                    ));
                }
                Event::Input(Ok(0), _) => self.request_stop(),
                Event::Input(Ok(n), bytes) => {
                    self.input_budget = self.input_budget.saturating_add(n);
                    self.consume(&bytes[..n]);
                    if self.input_budget >= INPUT_BUDGET {
                        tokio::task::yield_now().await;
                    }
                }
                Event::Input(Err(error), _) => self.fail(error),
                Event::Startup(result, completion) => {
                    self.input_budget = 0;
                    self.startup = None;
                    if let Some(completion) = completion {
                        self.completion = None;
                        match completion {
                            Err(error) => self.fail(error),
                            Ok(()) => self.request_stop(),
                        }
                    }
                    match result {
                        Ok(()) if !self.stopping => {
                            if let Err(error) =
                                (self.ready)(&format!("JAIT_DESKTOP_READY {}\n", self.port))
                            {
                                self.fail(error);
                            }
                        }
                        Err(error) => self.fail(error),
                        _ => {}
                    }
                }
                Event::Completion(result) => {
                    self.input_budget = 0;
                    self.completion = None;
                    if let Err(error) = result {
                        self.fail(error);
                    } else {
                        self.request_stop();
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        sync::{Arc, Mutex},
        time::Duration,
    };
    use tokio::{io::AsyncWriteExt, sync::oneshot, time::timeout};

    async fn supervisor(mut stop: watch::Receiver<bool>) -> io::Result<()> {
        while !*stop.borrow_and_update() {
            stop.changed().await.map_err(io::Error::other)?;
        }
        Ok(())
    }
    type CapturedOutput = Arc<Mutex<Vec<String>>>;

    fn output() -> (CapturedOutput, impl FnMut(&str) -> io::Result<()>) {
        let result = Arc::new(Mutex::new(Vec::new()));
        let captured = result.clone();
        (result, move |s| {
            captured.lock().unwrap().push(s.into());
            Ok(())
        })
    }

    #[tokio::test]
    async fn exact_lines_ignored_input_and_ready_then_stop() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            supervisor,
            ready,
            Duration::from_secs(1),
        );
        parent.write_all(b"stopx\n stop\r\nSTOP\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        assert_eq!(*seen.lock().unwrap(), ["JAIT_DESKTOP_READY 1234\n"]);
        parent.write_all(b"stop\r\nstop\n").await.unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn stop_and_eof_suppress_readiness_during_startup() {
        for eof in [false, true] {
            let (mut parent, child) = tokio::io::duplex(128);
            let (tx, rx) = oneshot::channel();
            let (seen, ready) = output();
            let mut owner = DesktopParentPipe::new(
                child,
                1234,
                |_| async {
                    rx.await.unwrap();
                    Ok(())
                },
                supervisor,
                ready,
                Duration::from_secs(1),
            );
            if eof {
                drop(parent);
            } else {
                parent.write_all(b"stop\n").await.unwrap();
            }
            assert!(
                timeout(Duration::from_millis(10), owner.run())
                    .await
                    .is_err()
            );
            tx.send(()).unwrap();
            owner.run().await.unwrap();
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn input_budget_renews_after_pending_lifecycle_poll() {
        let (mut parent, child) = tokio::io::duplex(INPUT_BUDGET * 3);
        parent
            .write_all(&vec![b'x'; INPUT_BUDGET * 2])
            .await
            .unwrap();
        let (_, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| std::future::pending::<io::Result<()>>(),
            supervisor,
            ready,
            Duration::from_secs(1),
        );
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        assert_eq!(owner.input_budget, 0);
        assert_eq!(owner.line_len, 5);
    }

    #[tokio::test]
    async fn cancellation_preserves_partial_line_and_cleanup() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (clean_tx, clean_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
            Duration::from_secs(1),
        );
        parent.write_all(b"st").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        parent.write_all(b"op\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        clean_tx.send(()).unwrap();
        owner.run().await.unwrap();
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn unterminated_stop_at_eof_and_simultaneous_startup() {
        for input in [&b"stop"[..], &b"stop\r\n"[..]] {
            let (mut parent, child) = tokio::io::duplex(128);
            parent.write_all(input).await.unwrap();
            drop(parent);
            let (seen, ready) = output();
            let mut owner = DesktopParentPipe::new(
                child,
                4321,
                |_| async { Ok(()) },
                supervisor,
                ready,
                Duration::from_secs(1),
            );
            owner.run().await.unwrap();
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn long_ignored_line_is_bounded_and_startup_makes_progress() {
        let (mut parent, child) = tokio::io::duplex(8192);
        parent.write_all(&vec![b'x'; 6000]).await.unwrap();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            supervisor,
            ready,
            Duration::from_secs(1),
        );
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        assert_eq!(owner.line_len, 5);
        assert_eq!(seen.lock().unwrap().len(), 1);
        parent.write_all(b"\nstop\n").await.unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn startup_failure_requests_stop_and_waits_for_cleanup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (clean_tx, clean_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Err(io::Error::other("startup")) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
            Duration::from_secs(1),
        );
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        clean_tx.send(()).unwrap();
        assert_eq!(owner.run().await.unwrap_err().to_string(), "startup");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn completion_precedes_simultaneous_startup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            |_| async { Err(io::Error::other("runtime failed")) },
            ready,
            Duration::from_secs(1),
        );
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn startup_can_make_completion_ready_before_marker() {
        let (_parent, child) = tokio::io::duplex(128);
        let (tx, rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |_| async move {
                tx.send(()).unwrap();
                Ok(())
            },
            move |_| async move {
                rx.await.unwrap();
                Err(io::Error::other("runtime failed"))
            },
            ready,
            Duration::from_secs(1),
        );
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn stop_reaches_startup_and_cleanup_survives_deadline_and_cancel() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (observed_tx, observed_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                observed_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Ok(())
            },
            supervisor,
            ready,
            Duration::from_millis(40),
        );
        parent.write_all(b"stop\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        observed_rx.await.unwrap();
        assert_eq!(
            owner.run().await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        assert!(seen.lock().unwrap().is_empty());
        release_tx.send(()).unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn deadline_preserves_first_failure_for_later_cleanup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (release_tx, release_rx) = oneshot::channel();
        let (_, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |_| async move {
                release_rx.await.unwrap();
                Ok(())
            },
            |_| async { Err(io::Error::other("runtime failed")) },
            ready,
            Duration::from_millis(10),
        );
        assert_eq!(
            owner.run().await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        release_tx.send(()).unwrap();
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
    }
}

// ---------------------------------------------------------------------------
// Desktop-host launch glue, ported from `packages/gateway/bin/desktop-host.mjs`.
//
// The reference host validates its launch configuration, prepares the private
// state directory, takes the state-directory lock, loads or creates the host
// secrets, builds the child environment (including the launcher compile-cache
// export), prints `JAIT_DESKTOP_READY <port>` once the gateway is listening,
// prints `Desktop gateway failed: <error>` on stderr and exits 1 otherwise, and
// performs the shutdown sequence at most once with a 20 s backstop.
//
// The lock and secrets candidates live in sibling files. `src/execution/mod.rs`
// (owned elsewhere) declares only the config and pipe modules, so they are
// registered here with `#[path]` so that they are compiled and reachable
// without editing a file this worker does not own.
#[path = "desktop_host_lock.rs"]
pub mod desktop_host_lock;
#[path = "desktop_host_secrets.rs"]
pub mod desktop_host_secrets;

use crate::execution::desktop_host_config::DesktopHostConfig;
use crate::update::compile_cache::CompileCacheExport;
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::Write as _;
use std::path::PathBuf;

/// First token of the readiness line the supervisor watches for.
pub const READY_PREFIX: &str = "JAIT_DESKTOP_READY";
/// Prefix of the terminal failure line written to stderr.
pub const FAILURE_PREFIX: &str = "Desktop gateway failed:";
/// The reference host's forced-exit backstop once a stop has been requested.
pub const STOP_BACKSTOP: Duration = Duration::from_secs(20);
/// Private state directory mode; the reference uses `mkdirSync(..., {mode: 0o700})`.
pub const STATE_DIRECTORY_MODE: u32 = 0o700;
/// Cross-process lock file the reference host writes its pid into.
pub const PID_FILE_NAME: &str = "desktop-host.pid";
/// Host secret file shared with the gateway child.
pub const SECRETS_FILE_NAME: &str = "host-secrets.json";

/// `join(stateDir, 'data', 'jait.db')` from the reference host.
pub fn database_path(config: &DesktopHostConfig) -> PathBuf {
    config.state_dir.join("data").join("jait.db")
}

pub fn pid_file_path(config: &DesktopHostConfig) -> PathBuf {
    config.state_dir.join(PID_FILE_NAME)
}

pub fn secrets_file_path(config: &DesktopHostConfig) -> PathBuf {
    config.state_dir.join(SECRETS_FILE_NAME)
}

/// The exact environment overlay the reference host layers onto its own
/// environment before spawning the gateway child. Order matches the
/// reference so that later launcher exports (the compile cache) win.
pub fn child_environment(
    config: &DesktopHostConfig,
    jwt_secret: &str,
    hook_secret: &str,
    compile_cache: &CompileCacheExport,
) -> Vec<(&'static str, OsString)> {
    vec![
        ("__JAIT_CLI", OsString::from("1")),
        ("JAIT_DESKTOP_HOST", OsString::from("1")),
        (
            "JAIT_STATE_DIR",
            config.state_dir.as_os_str().to_os_string(),
        ),
        ("JAIT_DB_PATH", database_path(config).into_os_string()),
        ("JAIT_NODE_ONLY", OsString::from("false")),
        ("JAIT_PRIMARY_GATEWAY", OsString::new()),
        ("JAIT_PRIMARY_TOKEN", OsString::new()),
        ("HOST", OsString::from(config.bind_host())),
        ("PORT", OsString::from(config.port.to_string())),
        ("JWT_SECRET", OsString::from(jwt_secret)),
        ("HOOK_SECRET", OsString::from(hook_secret)),
        ("NODE_ENV", OsString::from("production")),
        (
            compile_cache.variable(),
            compile_cache.directory().as_os_str().to_os_string(),
        ),
    ]
}

pub fn apply_child_environment<'a>(
    command: &'a mut std::process::Command,
    config: &DesktopHostConfig,
    secrets: &desktop_host_secrets::HostSecrets,
    compile_cache: &CompileCacheExport,
) -> &'a mut std::process::Command {
    for (key, value) in child_environment(config, secrets.jwt(), secrets.hook(), compile_cache) {
        command.env(key, value);
    }
    command
}

/// Everything the supervisor needs to launch the gateway child, short of
/// actually spawning it: the child environment, the working directory
/// (`chdir(stateDir)` in the reference) and the readiness line to expect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopHostLaunch {
    pub environment: Vec<(&'static str, OsString)>,
    pub working_directory: PathBuf,
    pub ready_line: String,
}

impl DesktopHostLaunch {
    pub fn new(
        config: &DesktopHostConfig,
        jwt_secret: &str,
        hook_secret: &str,
        compile_cache: &CompileCacheExport,
    ) -> Self {
        Self {
            environment: child_environment(config, jwt_secret, hook_secret, compile_cache),
            working_directory: config.state_dir.clone(),
            ready_line: ready_line(config.port),
        }
    }

    pub fn apply<'a>(
        &self,
        command: &'a mut std::process::Command,
    ) -> &'a mut std::process::Command {
        for (key, value) in &self.environment {
            command.env(key, value);
        }
        command.current_dir(&self.working_directory);
        command
    }
}

/// `console.log(`JAIT_DESKTOP_READY ${port}`)` — the line includes its newline.
pub fn ready_line(port: u16) -> String {
    format!("{READY_PREFIX} {port}\n")
}

/// `console.error('Desktop gateway failed:', error)` on stderr, exit code 1.
pub fn failure_line(message: impl std::fmt::Display) -> String {
    format!("{FAILURE_PREFIX} {message}")
}

/// The reference host's `stopping` guard: the shutdown sequence runs once.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct StopLatch {
    stopping: bool,
}

impl StopLatch {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `true` for the first request only.
    pub fn request(&mut self) -> bool {
        let first = !self.stopping;
        self.stopping = true;
        first
    }

    pub fn is_stopping(&self) -> bool {
        self.stopping
    }
}

/// What the reference host learns from `desktop-host.pid`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PidFileState {
    /// `ENOENT`: no host has ever locked this state directory.
    Missing,
    /// Present but not a positive integer pid.
    Incomplete,
    /// Integer pid and `process.kill(pid, 0)` succeeded: a host is running.
    Alive(u32),
    /// Integer pid but the process is gone: the previous host crashed.
    Stale(u32),
}

impl PidFileState {
    /// The refusal message the reference host throws, if the state blocks start.
    pub fn refusal(&self) -> Option<&'static str> {
        match self {
            Self::Incomplete => {
                Some("Desktop gateway lock is incomplete; another gateway may be starting")
            }
            Self::Alive(_) => Some("Desktop gateway is already running"),
            Self::Missing | Self::Stale(_) => None,
        }
    }

    /// The pid that may be unlinked before taking the lock.
    pub fn stale_pid(&self) -> Option<u32> {
        match self {
            Self::Stale(pid) => Some(*pid),
            _ => None,
        }
    }
}

/// Classifies pid-file contents exactly like `Number()` + `Number.isInteger`.
/// `content` is `None` when the file does not exist; `is_alive` is the
/// `process.kill(pid, 0)` probe, injected so the classification stays pure.
pub fn classify_pid_file(content: Option<&str>, is_alive: impl Fn(u32) -> bool) -> PidFileState {
    let Some(content) = content else {
        return PidFileState::Missing;
    };
    let Some(pid) = js_positive_integer(content) else {
        return PidFileState::Incomplete;
    };
    if is_alive(pid) {
        PidFileState::Alive(pid)
    } else {
        PidFileState::Stale(pid)
    }
}

fn js_positive_integer(content: &str) -> Option<u32> {
    let text = content.trim_matches(|c: char| {
        matches!(
            c,
            '\u{0009}'..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
        )
    });
    if text.is_empty() {
        return None;
    }
    let value = if let Some(hex) = text
        .strip_prefix("0x")
        .or_else(|| text.strip_prefix("0X"))
        .filter(|hex| !hex.is_empty() && hex.chars().all(|c| c.is_ascii_hexdigit()))
    {
        i64::from_str_radix(hex, 16).ok()? as f64
    } else {
        text.parse::<f64>().ok()?
    };
    if !value.is_finite() || value.fract() != 0.0 || value < 1.0 || value > u32::MAX as f64 {
        return None;
    }
    Some(value as u32)
}

/// `mkdirSync(stateDir, {recursive: true, mode: 0o700})` plus the directory
/// handle the lock and secrets modules operate on.
pub fn prepare_state_directory(config: &DesktopHostConfig) -> std::io::Result<File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true).mode(STATE_DIRECTORY_MODE);
        builder.create(&config.state_dir)?;
        OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY)
            .open(&config.state_dir)
    }
    #[cfg(not(unix))]
    {
        std::fs::create_dir_all(&config.state_dir)?;
        File::open(&config.state_dir)
    }
}

/// The reference host's pid file: created with `openSync(path, 'wx', 0o600)`,
/// written with the current pid and removed on exit.
#[derive(Debug)]
pub struct PidFileGuard {
    path: PathBuf,
    released: bool,
}

impl PidFileGuard {
    pub fn create(path: PathBuf, pid: u32) -> std::io::Result<Self> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path)?;
        writeln!(file, "{pid}")?;
        file.sync_all()?;
        Ok(Self {
            path,
            released: false,
        })
    }

    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    /// `rmSync(path, {force: true})`: missing files are not an error.
    pub fn release(&mut self) {
        if self.released {
            return;
        }
        self.released = true;
        let _ = std::fs::remove_file(&self.path);
    }
}

impl Drop for PidFileGuard {
    fn drop(&mut self) {
        self.release();
    }
}

/// A fully prepared desktop-host launch, composed in the same order as
/// `bin/desktop-host.mjs`: state directory (mode 0700), single-instance guards,
/// secrets, then the child environment and working directory.
///
/// The reference file continues by importing the gateway server, waiting for its
/// `JAIT_DESKTOP_READY` line and relaying signals. The server itself lives in this
/// crate's binary, which this module cannot link against, so the session stops at
/// the point where the caller has everything needed to spawn the child: the
/// overlay in [`DesktopHostSession::launch`] is what the reference hands to
/// `spawn`, and [`DesktopParentPipe`] owns the readiness/stop protocol.
///
/// The PID file is unlinked when the session drops, matching the reference's
/// `process.on('exit')` cleanup; the native `flock` guard is released by the same
/// drop because it is held by an open file description.
pub struct DesktopHostSession {
    lock: desktop_host_lock::DesktopHostLock,
    pid_file: PidFileGuard,
    secrets: desktop_host_secrets::HostSecrets,
    launch: DesktopHostLaunch,
}

/// Why a composed desktop launch refused to start. [`DesktopHostLaunchError::Busy`]
/// carries the reference's verbatim conflict message; the remaining variants wrap
/// the failing step, and the caller renders them through [`failure_line`].
#[derive(Debug)]
pub enum DesktopHostLaunchError {
    StateDirectory(std::io::Error),
    Busy(&'static str),
    Lock(std::io::Error),
    PidFile(std::io::Error),
    Secrets(std::io::Error),
}

impl std::fmt::Display for DesktopHostLaunchError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::StateDirectory(error) => {
                write!(formatter, "Desktop state directory failed: {error}")
            }
            Self::Busy(message) => formatter.write_str(message),
            Self::Lock(error) => write!(formatter, "Desktop host lock failed: {error}"),
            Self::PidFile(error) => write!(formatter, "Desktop host lock file failed: {error}"),
            Self::Secrets(error) => write!(formatter, "Desktop host secrets failed: {error}"),
        }
    }
}

impl std::error::Error for DesktopHostLaunchError {}

impl DesktopHostSession {
    /// Acquire everything the reference acquires before it starts the server.
    ///
    /// `is_alive` is the process-liveness probe used to classify the previous PID
    /// file (`process.kill(pid, 0)` in the reference); `pid` is written into the
    /// new PID file. Failures are ordered like the reference: directory first,
    /// then the single-instance guards, then secrets.
    pub fn acquire(
        config: &DesktopHostConfig,
        compile_cache: &CompileCacheExport,
        pid: u32,
        is_alive: impl Fn(u32) -> bool,
    ) -> Result<Self, DesktopHostLaunchError> {
        let directory =
            prepare_state_directory(config).map_err(DesktopHostLaunchError::StateDirectory)?;
        // Native, crash-safe exclusion first: an advisory `flock` on the state
        // directory handle that the kernel releases on process exit. It cannot
        // replace the PID file, because the Node host knows only the PID protocol.
        let lock =
            desktop_host_lock::try_acquire(&directory).map_err(DesktopHostLaunchError::Lock)?;
        let path = pid_file_path(config);
        let previous = match std::fs::read_to_string(&path) {
            Ok(contents) => Some(contents),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(DesktopHostLaunchError::PidFile(error)),
        };
        let state = classify_pid_file(previous.as_deref(), &is_alive);
        if let Some(message) = state.refusal() {
            return Err(DesktopHostLaunchError::Busy(message));
        }
        if state.stale_pid().is_some() {
            // `rmSync(pidFile, {force: true})` before `openSync(pidFile, 'wx')`.
            std::fs::remove_file(&path).map_err(DesktopHostLaunchError::PidFile)?;
        }
        let pid_file = PidFileGuard::create(path, pid).map_err(DesktopHostLaunchError::PidFile)?;
        let secrets = desktop_host_secrets::load_or_create(&directory)
            .map_err(DesktopHostLaunchError::Secrets)?;
        let launch = DesktopHostLaunch::new(config, secrets.jwt(), secrets.hook(), compile_cache);
        Ok(Self {
            lock,
            pid_file,
            secrets,
            launch,
        })
    }

    /// The child overlay, working directory and readiness line.
    pub fn launch(&self) -> &DesktopHostLaunch {
        &self.launch
    }

    pub fn secrets(&self) -> &desktop_host_secrets::HostSecrets {
        &self.secrets
    }

    pub fn pid_file(&self) -> &std::path::Path {
        self.pid_file.path()
    }

    /// Held for the lifetime of the session; dropping it releases the lock.
    pub fn lock(&self) -> &desktop_host_lock::DesktopHostLock {
        &self.lock
    }
}

#[cfg(test)]
mod desktop_launch_tests {
    use super::*;

    fn config(network: &str) -> DesktopHostConfig {
        DesktopHostConfig::parse("/state/desktop", "8123", network).unwrap()
    }

    const JWT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const HOOK: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    fn compile_cache() -> CompileCacheExport {
        CompileCacheExport::resolve(
            None,
            Some("/state/desktop"),
            std::path::Path::new("/home/u"),
        )
    }

    #[test]
    fn launch_environment_matches_reference_overlay() {
        let env = child_environment(&config("local"), JWT, HOOK, &compile_cache());
        let get = |key: &str| {
            env.iter()
                .find(|(k, _)| *k == key)
                .map(|(_, v)| v.to_string_lossy().into_owned())
        };
        assert_eq!(get("__JAIT_CLI").as_deref(), Some("1"));
        assert_eq!(get("JAIT_DESKTOP_HOST").as_deref(), Some("1"));
        assert_eq!(get("JAIT_STATE_DIR").as_deref(), Some("/state/desktop"));
        assert_eq!(
            get("JAIT_DB_PATH").as_deref(),
            Some("/state/desktop/data/jait.db")
        );
        assert_eq!(get("JAIT_NODE_ONLY").as_deref(), Some("false"));
        assert_eq!(get("JAIT_PRIMARY_GATEWAY").as_deref(), Some(""));
        assert_eq!(get("JAIT_PRIMARY_TOKEN").as_deref(), Some(""));
        assert_eq!(get("HOST").as_deref(), Some("127.0.0.1"));
        assert_eq!(get("PORT").as_deref(), Some("8123"));
        assert_eq!(get("JWT_SECRET").as_deref(), Some(JWT));
        assert_eq!(get("HOOK_SECRET").as_deref(), Some(HOOK));
        assert_eq!(get("NODE_ENV").as_deref(), Some("production"));
        assert_eq!(
            get("NODE_COMPILE_CACHE").as_deref(),
            Some("/state/desktop/cache/node-compile")
        );
        // The launcher compile-cache export comes last so it wins.
        assert_eq!(env.last().map(|(k, _)| *k), Some("NODE_COMPILE_CACHE"));
    }

    #[test]
    fn network_configuration_binds_all_interfaces() {
        let env = child_environment(&config("network"), JWT, HOOK, &compile_cache());
        assert!(env.contains(&("HOST", OsString::from("0.0.0.0"))));
    }

    #[test]
    fn launch_plan_uses_state_directory_as_working_directory() {
        let plan = DesktopHostLaunch::new(&config("local"), JWT, HOOK, &compile_cache());
        assert_eq!(plan.working_directory, PathBuf::from("/state/desktop"));
        assert_eq!(plan.ready_line, "JAIT_DESKTOP_READY 8123\n");
        assert!(plan.ready_line.ends_with('\n'));
    }

    #[test]
    fn ready_and_failure_lines_match_supervisor_contract() {
        assert_eq!(ready_line(1024), "JAIT_DESKTOP_READY 1024\n");
        assert_eq!(failure_line("boom"), "Desktop gateway failed: boom");
    }

    #[test]
    fn stop_latch_runs_shutdown_sequence_once() {
        let mut latch = StopLatch::new();
        assert!(!latch.is_stopping());
        assert!(latch.request());
        assert!(!latch.request());
        assert!(latch.is_stopping());
        assert_eq!(STOP_BACKSTOP, Duration::from_secs(20));
    }

    #[test]
    fn pid_file_classification_covers_missing_incomplete_alive_and_stale() {
        assert_eq!(classify_pid_file(None, |_| true), PidFileState::Missing);
        assert_eq!(
            classify_pid_file(Some(""), |_| true),
            PidFileState::Incomplete
        );
        assert_eq!(
            classify_pid_file(Some("not-a-pid\n"), |_| true),
            PidFileState::Incomplete
        );
        assert_eq!(
            classify_pid_file(Some("0"), |_| true),
            PidFileState::Incomplete
        );
        assert_eq!(
            classify_pid_file(Some("12.5"), |_| true),
            PidFileState::Incomplete
        );
        assert_eq!(
            classify_pid_file(Some(" 4242\n"), |pid| pid == 4242),
            PidFileState::Alive(4242)
        );
        assert_eq!(
            classify_pid_file(Some("4242"), |_| false),
            PidFileState::Stale(4242)
        );
        assert_eq!(
            classify_pid_file(Some("0x10"), |_| false),
            PidFileState::Stale(16)
        );
        assert_eq!(
            PidFileState::Alive(7).refusal(),
            Some("Desktop gateway is already running")
        );
        assert_eq!(
            PidFileState::Incomplete.refusal(),
            Some("Desktop gateway lock is incomplete; another gateway may be starting")
        );
        assert_eq!(PidFileState::Missing.refusal(), None);
        assert_eq!(PidFileState::Stale(7).refusal(), None);
        assert_eq!(PidFileState::Stale(7).stale_pid(), Some(7));
    }

    fn scratch_directory(tag: &str) -> PathBuf {
        static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let unique = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "jait-desktop-{tag}-{}-{unique}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        path
    }

    #[test]
    fn pid_file_guard_is_exclusive_and_removed_on_drop() {
        let directory = scratch_directory("pid");
        let config =
            DesktopHostConfig::parse(directory.to_str().unwrap(), "8123", "local").unwrap();
        prepare_state_directory(&config).unwrap();
        let path = pid_file_path(&config);
        {
            let guard = PidFileGuard::create(path.clone(), 4242).unwrap();
            assert_eq!(guard.path(), path.as_path());
            assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), "4242");
            // `wx` semantics: a second host cannot claim the same file.
            assert!(PidFileGuard::create(path.clone(), 4243).is_err());
            assert_eq!(
                classify_pid_file(Some(&std::fs::read_to_string(&path).unwrap()), |pid| pid
                    == 4242),
                PidFileState::Alive(4242)
            );
        }
        assert!(!path.exists());
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[cfg(unix)]
    #[test]
    fn state_directory_lock_is_exclusive_and_secrets_are_created_once() {
        let directory = scratch_directory("lock");
        let config =
            DesktopHostConfig::parse(directory.to_str().unwrap(), "8123", "local").unwrap();
        let handle = prepare_state_directory(&config).unwrap();
        let lock = desktop_host_lock::try_acquire(&handle).unwrap();
        let second = prepare_state_directory(&config).unwrap();
        assert!(desktop_host_lock::try_acquire(&second).is_err());
        let first = desktop_host_secrets::load_or_create(&handle).unwrap();
        let again = desktop_host_secrets::load_or_create(&second).unwrap();
        assert_eq!(first.jwt(), again.jwt());
        assert_eq!(first.hook(), again.hook());
        assert_eq!(first.jwt().len(), 64);
        drop(lock);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[cfg(unix)]
    #[test]
    fn desktop_session_prepares_directory_guards_and_environment() {
        let directory = scratch_directory("session");
        let state = directory.to_str().unwrap().to_owned();
        let config = DesktopHostConfig::parse(&state, "8123", "local").unwrap();
        let cache =
            CompileCacheExport::resolve(None, Some(&state), std::path::Path::new("/home/u"));
        let session = DesktopHostSession::acquire(&config, &cache, 4242, |_| false).unwrap();

        assert_eq!(
            std::fs::read_to_string(session.pid_file()).unwrap().trim(),
            "4242"
        );
        assert_eq!(session.secrets().jwt().len(), 64);
        assert_eq!(session.secrets().hook().len(), 64);
        // The overlay is built from the secrets that were just loaded.
        assert!(session.launch().environment.contains(&(
            "JWT_SECRET",
            std::ffi::OsString::from(session.secrets().jwt())
        )));
        assert!(session.launch().environment.contains(&(
            "HOOK_SECRET",
            std::ffi::OsString::from(session.secrets().hook())
        )));
        assert_eq!(session.launch().working_directory, directory);
        assert_eq!(session.launch().ready_line, "JAIT_DESKTOP_READY 8123\n");
        assert_eq!(
            session.launch().environment.last().map(|(key, _)| *key),
            Some("NODE_COMPILE_CACHE")
        );

        // The native directory lock is held for as long as the session lives.
        let competitor = prepare_state_directory(&config).unwrap();
        assert!(desktop_host_lock::try_acquire(&competitor).is_err());

        let jwt = session.secrets().jwt().to_owned();
        let pid_file = session.pid_file().to_path_buf();
        let _held = session.lock();
        drop(session);
        assert!(!pid_file.exists(), "session drop unlinks the PID file");

        // Secrets survive the restart; the lock is free again.
        let handle = prepare_state_directory(&config).unwrap();
        let lock = desktop_host_lock::try_acquire(&handle).unwrap();
        assert_eq!(
            desktop_host_secrets::load_or_create(&handle).unwrap().jwt(),
            jwt
        );
        drop(lock);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[cfg(unix)]
    #[test]
    fn desktop_session_refuses_a_live_pid_file_and_replaces_a_stale_one() {
        let directory = scratch_directory("session-pid");
        let state = directory.to_str().unwrap().to_owned();
        let config = DesktopHostConfig::parse(&state, "8123", "local").unwrap();
        let cache =
            CompileCacheExport::resolve(None, Some(&state), std::path::Path::new("/home/u"));
        let _handle = prepare_state_directory(&config).unwrap();
        let path = pid_file_path(&config);
        std::fs::write(&path, "7\n").unwrap();

        match DesktopHostSession::acquire(&config, &cache, 4242, |pid| pid == 7) {
            Err(DesktopHostLaunchError::Busy(message)) => {
                assert_eq!(message, "Desktop gateway is already running");
            }
            other => panic!("expected a refusal, got ok={}", other.is_ok()),
        }
        // The failed attempt released the directory lock.
        let retry = prepare_state_directory(&config).unwrap();
        assert!(desktop_host_lock::try_acquire(&retry).is_ok());

        // A dead PID is stale: the file is replaced with the new host PID.
        let session = DesktopHostSession::acquire(&config, &cache, 4242, |_| false).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), "4242");
        assert_eq!(session.pid_file(), path.as_path());
        drop(session);
        let _ = std::fs::remove_dir_all(&directory);
    }
}
