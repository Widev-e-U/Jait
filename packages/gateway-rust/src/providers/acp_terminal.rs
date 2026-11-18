//! Captured ACP child terminals with bounded admission and owned process cleanup.
use crate::{
    contracts::bounded_json::Utf16Text, execution::completion_output::extract_completion_output,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    num::NonZeroU16,
    path::PathBuf,
    process::Stdio,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::{Semaphore, mpsc, watch},
};
#[derive(Clone, Debug)]
pub struct AcpTerminalOptions {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub output_byte_limit: Option<f64>,
}
impl AcpTerminalOptions {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            args: vec![],
            cwd: None,
            env: HashMap::new(),
            output_byte_limit: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitStatus {
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub output: Utf16Text,
    pub exit_status: Option<TerminalExitStatus>,
    pub truncated: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCompletion {
    pub exit_code: Option<i32>,
    pub output: Utf16Text,
}
#[derive(Default)]
struct OutputState {
    output: Vec<u16>,
    truncated: bool,
    exit: Option<TerminalExitStatus>,
}
impl OutputState {
    fn append(&mut self, text: &str, limit: Option<f64>) {
        self.output.extend(text.encode_utf16());
        let Some(limit) = limit.filter(|n| *n != 0.0 && !n.is_nan()) else {
            return;
        };
        let mut bytes = char::decode_utf16(self.output.iter().copied())
            .map(|c| c.unwrap_or('\u{fffd}').len_utf8())
            .sum::<usize>();
        if bytes as f64 <= limit {
            return;
        }
        let mut start = 0;
        while start < self.output.len() && bytes as f64 > limit {
            let u = self.output[start];
            let pair = (0xd800..=0xdbff).contains(&u)
                && self
                    .output
                    .get(start + 1)
                    .is_some_and(|u| (0xdc00..=0xdfff).contains(u));
            bytes -= if pair || u < 0x80 {
                1
            } else if u < 0x800 {
                2
            } else {
                3
            };
            start += 1;
        }
        self.output.drain(..start);
        self.truncated = true;
    }
}
struct Inner {
    command: String,
    started_at: i64,
    state: Arc<Mutex<OutputState>>,
    kill: mpsc::Sender<()>,
    exit: watch::Receiver<Option<TerminalExitStatus>>,
}
impl Drop for Inner {
    fn drop(&mut self) {
        let _ = self.kill.try_send(());
    }
}
#[derive(Clone)]
pub struct AcpTerminal {
    inner: Arc<Inner>,
}
/// Share one pool across provider sessions. The process permit is held through pipe drain/reaping.
#[derive(Clone)]
pub struct AcpTerminalPool {
    permits: Arc<Semaphore>,
}
impl AcpTerminalPool {
    pub fn new(parallelism: NonZeroU16) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(usize::from(parallelism.get()))),
        }
    }
    pub fn close(&self) {
        self.permits.close();
    }
    /// Internal primitive: callers authorize the command, arguments, cwd and execution node.
    /// This factory does not mount ACP handlers or grant execution/assessment permission.
    pub fn spawn(&self, options: AcpTerminalOptions) -> io::Result<AcpTerminal> {
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|e| match e {
                tokio::sync::TryAcquireError::NoPermits => {
                    io::Error::new(io::ErrorKind::WouldBlock, "ACP terminal pool is full")
                }
                tokio::sync::TryAcquireError::Closed => {
                    io::Error::new(io::ErrorKind::BrokenPipe, "ACP terminal pool is closed")
                }
            })?;
        let command = std::iter::once(options.command.as_str())
            .chain(options.args.iter().map(String::as_str))
            .collect::<Vec<_>>()
            .join(" ");
        let state = Arc::new(Mutex::new(OutputState::default()));
        let (kill, mut requests) = mpsc::channel(1);
        let (exit, receive) = watch::channel(None);
        let terminal = AcpTerminal {
            inner: Arc::new(Inner {
                command,
                started_at: (crate::time::default_clock())(),
                state: state.clone(),
                kill,
                exit: receive,
            }),
        };
        tokio::spawn(async move {
            let _permit = permit;
            let mut builder = Command::new(&options.command);
            builder
                .args(&options.args)
                .envs(&options.env)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            if let Some(cwd) = &options.cwd {
                builder.current_dir(cwd);
            }
            let mut child = match builder.spawn() {
                Ok(c) => c,
                Err(e) => {
                    state.lock().unwrap().append(
                        &format!("\n[terminal error: {e}]"),
                        options.output_byte_limit,
                    );
                    finish(
                        &state,
                        &exit,
                        TerminalExitStatus {
                            exit_code: None,
                            signal: None,
                        },
                    );
                    return;
                }
            };
            // Node retains stdin until exit/release; Child::wait would close it automatically.
            let _stdin = child.stdin.take();
            let stdout = child.stdout.take().expect("piped stdout");
            let stderr = child.stderr.take().expect("piped stderr");
            let stream_state = state.clone();
            let limit = options.output_byte_limit;
            let mut readers = tokio::spawn(async move {
                tokio::join!(
                    read_pipe(stdout, stream_state.clone(), limit),
                    read_pipe(stderr, stream_state, limit)
                );
            });
            let mut owner = true;
            let result = loop {
                tokio::select! {
                    status=child.wait()=>break status,
                    request=requests.recv(),if owner=>{
                        match child.try_wait() {
                            Ok(Some(status))=>break Ok(status),
                            Ok(None)=>if request.is_some(){terminate(&mut child)}else{owner=false;let _=child.start_kill();},
                            Err(e)=>break Err(e),
                        }
                    }
                }
            };
            let status = match result {
                Ok(status) => exit_status(status),
                Err(e) => {
                    state.lock().unwrap().append(
                        &format!("\n[terminal error: {e}]"),
                        options.output_byte_limit,
                    );
                    TerminalExitStatus {
                        exit_code: None,
                        signal: None,
                    }
                }
            };
            // The reader owns both pipes. Descendants cannot hold admission forever.
            if tokio::time::timeout(std::time::Duration::from_secs(2), &mut readers)
                .await
                .is_err()
            {
                readers.abort();
                let _ = readers.await;
                state.lock().unwrap().truncated = true;
            }
            finish(&state, &exit, status);
        });
        Ok(terminal)
    }
}
fn finish(
    state: &Arc<Mutex<OutputState>>,
    exit: &watch::Sender<Option<TerminalExitStatus>>,
    status: TerminalExitStatus,
) {
    let mut state = state.lock().unwrap();
    if state.exit.is_some() {
        return;
    }
    state.exit = Some(status.clone());
    exit.send_replace(Some(status));
}
async fn read_pipe(
    mut reader: impl AsyncRead + Unpin,
    state: Arc<Mutex<OutputState>>,
    limit: Option<f64>,
) {
    let mut buffer = vec![0u8; 65536];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break,
            Ok(n) => state
                .lock()
                .unwrap()
                .append(&String::from_utf8_lossy(&buffer[..n]), limit),
            Err(_) => break,
        }
    }
}
#[cfg(unix)]
fn terminate(child: &mut tokio::process::Child) {
    if let Some(pid) = child.id() {
        // The caller owns an unreaped child and checks try_wait before sending a signal.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGTERM);
        }
    }
}
#[cfg(not(unix))]
fn terminate(child: &mut tokio::process::Child) {
    let _ = child.start_kill();
}
fn exit_status(status: std::process::ExitStatus) -> TerminalExitStatus {
    #[cfg(unix)]
    let signal = {
        use std::os::unix::process::ExitStatusExt;
        status.signal().map(|s| match s {
            libc::SIGHUP => "SIGHUP".into(),
            libc::SIGINT => "SIGINT".into(),
            libc::SIGQUIT => "SIGQUIT".into(),
            libc::SIGILL => "SIGILL".into(),
            libc::SIGTRAP => "SIGTRAP".into(),
            libc::SIGBUS => "SIGBUS".into(),
            libc::SIGSYS => "SIGSYS".into(),
            libc::SIGURG => "SIGURG".into(),
            libc::SIGXCPU => "SIGXCPU".into(),
            libc::SIGXFSZ => "SIGXFSZ".into(),
            libc::SIGVTALRM => "SIGVTALRM".into(),
            libc::SIGPROF => "SIGPROF".into(),
            libc::SIGWINCH => "SIGWINCH".into(),
            libc::SIGIO => "SIGIO".into(),
            libc::SIGABRT => "SIGABRT".into(),
            libc::SIGFPE => "SIGFPE".into(),
            libc::SIGKILL => "SIGKILL".into(),
            libc::SIGSEGV => "SIGSEGV".into(),
            libc::SIGPIPE => "SIGPIPE".into(),
            libc::SIGALRM => "SIGALRM".into(),
            libc::SIGTERM => "SIGTERM".into(),
            libc::SIGUSR1 => "SIGUSR1".into(),
            libc::SIGUSR2 => "SIGUSR2".into(),
            libc::SIGCHLD => "SIGCHLD".into(),
            libc::SIGCONT => "SIGCONT".into(),
            libc::SIGSTOP => "SIGSTOP".into(),
            libc::SIGTSTP => "SIGTSTP".into(),
            libc::SIGTTIN => "SIGTTIN".into(),
            libc::SIGTTOU => "SIGTTOU".into(),
            _ => format!("SIG{s}"),
        })
    };
    #[cfg(not(unix))]
    let signal = None;
    TerminalExitStatus {
        exit_code: status.code(),
        signal,
    }
}
impl AcpTerminal {
    pub fn command(&self) -> &str {
        &self.inner.command
    }
    pub fn started_at(&self) -> i64 {
        self.inner.started_at
    }
    pub fn is_running(&self) -> bool {
        self.inner.state.lock().unwrap().exit.is_none()
    }
    pub fn current_output(&self) -> TerminalOutput {
        let state = self.inner.state.lock().unwrap();
        TerminalOutput {
            output: Utf16Text(state.output.clone()),
            exit_status: state.exit.clone(),
            truncated: state.truncated,
        }
    }
    pub async fn wait_for_exit(&self) -> io::Result<TerminalExitStatus> {
        let mut receive = self.inner.exit.clone();
        loop {
            if let Some(status) = receive.borrow_and_update().clone() {
                return Ok(status);
            }
            receive
                .changed()
                .await
                .map_err(|_| io::Error::other("ACP terminal supervisor stopped"))?;
        }
    }
    pub async fn wait_for_completion(&self) -> io::Result<TerminalCompletion> {
        let status = self.wait_for_exit().await?;
        let output = self.inner.state.lock().unwrap().output.clone();
        Ok(TerminalCompletion {
            exit_code: status.exit_code,
            output: extract_completion_output(&output, self.command(), ""),
        })
    }
    pub fn kill(&self) {
        if self.is_running() {
            let _ = self.inner.kill.try_send(());
        }
    }
    pub fn release(&self) {
        self.kill();
    }
}
