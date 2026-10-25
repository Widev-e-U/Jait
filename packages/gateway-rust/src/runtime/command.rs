//! Bounded argv-based subprocess primitive. Callers authorize effects before admission.
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, io, num::NonZeroU16, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::Semaphore,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
    pub timeout_ms: u64,
    pub max_buffer: usize,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandFailure {
    pub message: String,
}
impl std::fmt::Display for CommandFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for CommandFailure {}
// Bun's child_process argument errors inspect strings rather than embedding raw
// control bytes. Keep rejection before spawning and preserve its quote choice.
fn inspect_argument(value: &str) -> String {
    let quote = if value.contains('\'') { '"' } else { '\'' };
    let mut result = String::from(quote);
    for c in value.chars() {
        match c {
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            '\u{8}' => result.push_str("\\b"),
            '\u{c}' => result.push_str("\\f"),
            c if c == quote => {
                result.push('\\');
                result.push(c);
            }
            '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' => {
                use std::fmt::Write;
                write!(&mut result, "\\x{:02x}", c as u32).expect("string write");
            }
            c => result.push(c),
        }
    }
    result.push(quote);
    result
}
#[derive(Clone)]
pub struct CommandPool {
    permits: Arc<Semaphore>,
    environment: HashMap<String, String>,
}
impl CommandPool {
    pub fn new(parallelism: NonZeroU16, environment: HashMap<String, String>) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(usize::from(parallelism.get()))),
            environment,
        }
    }
    pub fn close(&self) {
        self.permits.close();
    }
    pub async fn run(&self, spec: &CommandSpec) -> Result<CommandOutput, CommandFailure> {
        let _permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| failure("command capacity unavailable"))?;
        for (index, arg) in spec.args.iter().enumerate() {
            if arg.contains('\0') {
                return Err(failure(format!(
                    "The argument 'args[{index}]' must be a string without null bytes. Received {}",
                    inspect_argument(arg)
                )));
            }
        }
        let mut builder = Command::new(&spec.program);
        builder
            .args(&spec.args)
            .envs(&self.environment)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            builder.as_std_mut().process_group(0);
        }
        let mut child = spawn_with_retry(&mut builder).await.map_err(|error| {
            if !spec.program.contains(['/', '\\'])
                && matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::PermissionDenied
                )
            {
                failure(format!(
                    "Executable not found in $PATH: {}",
                    serde_json::to_string(&spec.program).expect("program string")
                ))
            } else {
                failure(format!(
                    "spawn {} {}",
                    spec.program,
                    spawn_error_code(&error)
                ))
            }
        })?;
        #[cfg(unix)]
        let _group = OwnedProcessGroup(child.id().expect("spawned process") as i32);
        let _stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let (mut stdout_bytes, mut stderr_bytes) = (Vec::new(), Vec::new());
        let completed = tokio::time::timeout(Duration::from_millis(spec.timeout_ms), async {
            tokio::try_join!(
                read_pipe(stdout, spec.max_buffer, "stdout", &mut stdout_bytes),
                read_pipe(stderr, spec.max_buffer, "stderr", &mut stderr_bytes),
                async { child.wait().await.map_err(|e| failure(e.to_string())) }
            )
        })
        .await;
        let (_, _, status) = match completed {
            Ok(Ok(value)) => value,
            error => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                return Err(match error {
                    Ok(Err(e)) => e,
                    _ => command_failed(spec, &String::from_utf8_lossy(&stderr_bytes)),
                });
            }
        };
        let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
        let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();
        if !status.success() {
            return Err(command_failed(spec, &stderr));
        }
        Ok(CommandOutput { stdout, stderr })
    }
}
/// `ETXTBSY` is transient rather than a property of the command: a concurrent
/// `fork` (another task spawning a child of its own) can inherit a write
/// descriptor for the executable that stays open until that child reaches
/// `execve`, and a package upgrade can briefly replace the same binary. Both
/// windows close on their own, so retrying with a short backoff is the
/// documented mitigation instead of surfacing a spurious spawn failure.
#[cfg(unix)]
async fn spawn_with_retry(builder: &mut Command) -> io::Result<tokio::process::Child> {
    const ATTEMPTS: u32 = 20;
    let mut attempt = 0;
    loop {
        match builder.spawn() {
            Err(error) if error.raw_os_error() == Some(libc::ETXTBSY) && attempt < ATTEMPTS => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(5 * u64::from(attempt))).await;
            }
            outcome => return outcome,
        }
    }
}
#[cfg(not(unix))]
async fn spawn_with_retry(builder: &mut Command) -> io::Result<tokio::process::Child> {
    builder.spawn()
}
fn failure(message: impl Into<String>) -> CommandFailure {
    CommandFailure {
        message: message.into(),
    }
}
async fn read_pipe(
    mut pipe: impl AsyncRead + Unpin,
    limit: usize,
    name: &str,
    bytes: &mut Vec<u8>,
) -> Result<(), CommandFailure> {
    let mut chunk = [0; 8192];
    loop {
        let n = pipe
            .read(&mut chunk)
            .await
            .map_err(|e| failure(e.to_string()))?;
        if n == 0 {
            break;
        }
        if n > limit.saturating_sub(bytes.len()) {
            return Err(failure(format!("{name} maxBuffer length exceeded")));
        }
        bytes.extend_from_slice(&chunk[..n]);
    }
    Ok(())
}

fn command_failed(spec: &CommandSpec, stderr: &str) -> CommandFailure {
    let command = std::iter::once(spec.program.as_str())
        .chain(spec.args.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ");
    failure(if stderr.is_empty() {
        format!("Command failed: {command}")
    } else {
        format!("Command failed: {command}\n{stderr}")
    })
}
#[cfg(unix)]
struct OwnedProcessGroup(i32);
#[cfg(unix)]
impl Drop for OwnedProcessGroup {
    fn drop(&mut self) {
        // A dedicated group is created before exec; never signal the gateway group.
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{
        os::unix::fs::PermissionsExt,
        path::{Path, PathBuf},
    };
    fn fixture(script: &str) -> (PathBuf, CommandSpec) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        let work = root
            .join(".jait/artifacts/gateway-rust/command-tests")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&work).unwrap();
        let file = work.join("peer.sh");
        std::fs::write(&file, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o700)).unwrap();
        (
            work,
            CommandSpec {
                program: file.to_string_lossy().into_owned(),
                args: vec![],
                timeout_ms: 10_000,
                max_buffer: 1024,
            },
        )
    }
    fn pool(environment: HashMap<String, String>) -> CommandPool {
        CommandPool::new(NonZeroU16::new(1).unwrap(), environment)
    }
    async fn pid(path: &Path) -> i32 {
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                if let Ok(text) = std::fs::read_to_string(path)
                    && let Ok(pid) = text.trim().parse()
                {
                    break pid;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap()
    }
    async fn gone(pid: i32) {
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                if unsafe { libc::kill(pid, 0) } == -1 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("owned process survived cancellation")
    }
    #[tokio::test]
    async fn streams_have_independent_limits_and_utf8_is_decoded_after_drain() {
        let (_, mut spec) = fixture("printf abc; printf def >&2");
        spec.max_buffer = 3;
        assert_eq!(
            pool(HashMap::new()).run(&spec).await.unwrap(),
            CommandOutput {
                stdout: "abc".into(),
                stderr: "def".into()
            }
        );
        let (_, spec) = fixture("printf '\\360\\237\\246\\200'; printf '\\377x' >&2");
        assert_eq!(
            pool(HashMap::new()).run(&spec).await.unwrap(),
            CommandOutput {
                stdout: "🦀".into(),
                stderr: "�x".into()
            }
        );
    }
    #[tokio::test]
    async fn overflow_on_either_stream_stops_the_child() {
        for redirection in ["", ">&2"] {
            let (_, mut spec) = fixture(&format!("printf abcd {redirection}; exec /bin/sleep 10"));
            spec.max_buffer = 3;
            let error =
                tokio::time::timeout(Duration::from_secs(15), pool(HashMap::new()).run(&spec))
                    .await
                    .unwrap()
                    .unwrap_err();
            assert_eq!(
                error.message,
                format!(
                    "{} maxBuffer length exceeded",
                    if redirection.is_empty() {
                        "stdout"
                    } else {
                        "stderr"
                    }
                )
            );
        }
    }
    #[tokio::test]
    async fn timeout_preserves_failure_output_and_reaps_the_process() {
        let (work, mut spec) =
            fixture("printf '%s' \"$$\" > \"$PIDFILE\"; printf entered >&2; exec /bin/sleep 10");
        spec.timeout_ms = 100;
        let file = work.join("pid");
        let pool = pool(HashMap::from([(
            "PIDFILE".into(),
            file.to_string_lossy().into_owned(),
        )]));
        let failure = tokio::time::timeout(Duration::from_secs(15), pool.run(&spec))
            .await
            .unwrap()
            .unwrap_err();
        assert!(
            failure.message.ends_with("\nentered"),
            "{}",
            failure.message
        );
        gone(pid(&file).await).await;
    }
    #[tokio::test]
    async fn overload_close_and_dropped_callers_cannot_leave_owned_children_running() {
        let (work, spec) = fixture("printf '%s' \"$$\" > \"$PIDFILE\"; exec /bin/sleep 10");
        let file = work.join("pid");
        let pool = pool(HashMap::from([(
            "PIDFILE".into(),
            file.to_string_lossy().into_owned(),
        )]));
        let worker_pool = pool.clone();
        let worker_spec = spec.clone();
        let caller = tokio::spawn(async move { worker_pool.run(&worker_spec).await });
        let child_pid = pid(&file).await;
        assert_eq!(
            pool.run(&spec).await.unwrap_err().message,
            "command capacity unavailable"
        );
        caller.abort();
        let _ = caller.await;
        gone(child_pid).await;
        let (_, quick) = fixture("printf done");
        assert_eq!(pool.run(&quick).await.unwrap().stdout, "done");
        pool.close();
        assert_eq!(
            pool.run(&quick).await.unwrap_err().message,
            "command capacity unavailable"
        );
    }
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn descendants_cannot_hold_pipes_past_the_deadline() {
        let (work, mut spec) = fixture("/bin/sleep 10 & printf '%s' \"$!\" > \"$PIDFILE\"; exit 0");
        spec.timeout_ms = 100;
        let file = work.join("pid");
        let pool = pool(HashMap::from([(
            "PIDFILE".into(),
            file.to_string_lossy().into_owned(),
        )]));
        tokio::time::timeout(Duration::from_secs(15), pool.run(&spec))
            .await
            .unwrap()
            .unwrap_err();
        let child_pid = pid(&file).await;
        // An orphan can remain a zombie until the container's init reaps it; it
        // must no longer execute or own a pipe after the command returns.
        let proc = PathBuf::from(format!("/proc/{child_pid}/stat"));
        tokio::time::timeout(Duration::from_secs(15), async {
            loop {
                match std::fs::read_to_string(&proc) {
                    Err(_) => break,
                    Ok(stat)
                        if stat
                            .split(')')
                            .nth(1)
                            .unwrap_or("")
                            .trim_start()
                            .starts_with('Z') =>
                    {
                        break;
                    }
                    _ => tokio::time::sleep(Duration::from_millis(5)).await,
                }
            }
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    async fn missing_program_and_nul_arguments_fail_without_shell_interpretation() {
        let (work, mut spec) = fixture("printf unexpected");
        spec.program = work.join("absent").to_string_lossy().into_owned();
        assert_eq!(
            pool(HashMap::new()).run(&spec).await.unwrap_err().message,
            format!("spawn {} ENOENT", spec.program)
        );
        let (_, mut spec) = fixture("printf unexpected");
        spec.args = vec!["x\0y".into()];
        assert_eq!(
            pool(HashMap::new()).run(&spec).await.unwrap_err().message,
            "The argument 'args[0]' must be a string without null bytes. Received 'x\\x00y'"
        );
    }
}

fn spawn_error_code(error: &io::Error) -> String {
    #[cfg(unix)]
    {
        let code = match error.raw_os_error() {
            Some(libc::ENOENT) => Some("ENOENT"),
            Some(libc::EACCES) => Some("EACCES"),
            Some(libc::ENOEXEC) => Some("ENOEXEC"),
            Some(libc::ENOTDIR) => Some("ENOTDIR"),
            Some(libc::E2BIG) => Some("E2BIG"),
            Some(libc::ENAMETOOLONG) => Some("ENAMETOOLONG"),
            Some(libc::EMFILE) => Some("EMFILE"),
            Some(libc::ENFILE) => Some("ENFILE"),
            Some(libc::ENOMEM) => Some("ENOMEM"),
            Some(libc::ETXTBSY) => Some("ETXTBSY"),
            Some(libc::ELOOP) => Some("ELOOP"),
            _ => None,
        };
        if let Some(code) = code {
            return code.into();
        }
    }
    if error.kind() == io::ErrorKind::NotFound {
        "ENOENT".into()
    } else {
        error.to_string()
    }
}
