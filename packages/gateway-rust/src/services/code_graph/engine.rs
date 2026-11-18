//! Explicit, bounded argv transport shared by code-graph runtime and extraction.
//! The embedding executor must authorize paths, package installation and commands.
//! Environment and working directory are supplied; no credentials are discovered.
use crate::execution::process_runner::ProcessCancellation;
use futures_util::future::BoxFuture;
use serde::Serialize;
use serde_json::{Value, json};
use std::{collections::BTreeMap, fmt, path::PathBuf, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::Semaphore,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ErrorKind {
    Ordinary,
    Runtime,
    Unavailable,
}
#[derive(Clone, Debug)]
pub struct GraphError {
    pub kind: ErrorKind,
    pub name: String,
    pub message: String,
    pub code: Option<Box<Value>>,
    pub cause: Option<Box<GraphError>>,
    pub thrown: Option<Box<Value>>,
}
impl GraphError {
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Ordinary,
            name: "Error".into(),
            message: message.into(),
            code: None,
            cause: None,
            thrown: None,
        }
    }
    pub fn runtime(message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Runtime,
            name: "GraphifyRuntimeError".into(),
            ..Self::error(message)
        }
    }
    pub fn unavailable() -> Self {
        Self {
            kind: ErrorKind::Unavailable,
            name: "GraphifyUnavailableError".into(),
            ..Self::error(
                "The required Graphify runtime is unavailable. Run jait doctor for diagnostics.",
            )
        }
    }
    pub fn thrown(value: Value) -> Self {
        Self {
            message: crate::services::calendar::js_text(&value),
            thrown: Some(Box::new(value)),
            ..Self::error("")
        }
    }
    pub fn value(&self) -> Value {
        if let Some(value) = &self.thrown {
            return json!({"thrown":value});
        }
        let mut out = json!({"name":self.name,"message":self.message});
        if let Some(code) = &self.code {
            out["code"] = (**code).clone();
        }
        if let Some(cause) = &self.cause {
            out["cause"] = cause.value();
        }
        out
    }
    pub fn io(error: std::io::Error, operation: &str, path: &str) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => "ENOENT",
            std::io::ErrorKind::PermissionDenied => "EACCES",
            std::io::ErrorKind::AlreadyExists => "EEXIST",
            std::io::ErrorKind::NotADirectory => "ENOTDIR",
            std::io::ErrorKind::IsADirectory => "EISDIR",
            _ => "EIO",
        };
        let description = match code {
            "ENOENT" => "no such file or directory",
            "EACCES" => "permission denied",
            "EEXIST" => "file already exists",
            "ENOTDIR" => "not a directory",
            "EISDIR" => "illegal operation on a directory",
            _ => "input/output error",
        };
        Self {
            code: Some(Box::new(json!(code))),
            ..Self::error(format!("{code}: {description}, {operation} '{path}'"))
        }
    }
}
impl fmt::Display for GraphError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for GraphError {}
#[derive(Clone)]
pub struct ExecRequest {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: BTreeMap<String, String>,
    pub signal: Option<ProcessCancellation>,
}
#[derive(Clone, Debug, Serialize)]
pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
}
pub type Executor =
    Arc<dyn Fn(ExecRequest) -> BoxFuture<'static, Result<ExecOutput, GraphError>> + Send + Sync>;

/// Node-compatible lexical join for supplied path components on this host.
/// Absolute roots and parent components are normalized without filesystem access.
pub fn path_join(parts: &[&str]) -> String {
    #[cfg(windows)]
    {
        let joined = parts
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join("\\");
        let path = PathBuf::from(joined);
        let mut out = PathBuf::new();
        for component in path.components() {
            match component {
                std::path::Component::ParentDir => {
                    if !out.pop() {
                        out.push("..");
                    }
                }
                std::path::Component::CurDir => {}
                _ => out.push(component.as_os_str()),
            }
        }
        if out.as_os_str().is_empty() {
            ".".into()
        } else {
            out.to_string_lossy().into_owned()
        }
    }
    #[cfg(not(windows))]
    {
        let joined = parts
            .iter()
            .filter(|s| !s.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join("/");
        let absolute = joined.starts_with('/');
        let mut segments = vec![];
        for segment in joined.split('/') {
            match segment {
                "" | "." => {}
                ".." => {
                    if segments.last().is_some_and(|s| *s != "..") {
                        segments.pop();
                    } else if !absolute {
                        segments.push("..");
                    }
                }
                _ => segments.push(segment),
            }
        }
        let path = format!("{}{}", if absolute { "/" } else { "" }, segments.join("/"));
        if path.is_empty() { ".".into() } else { path }
    }
}

#[cfg(unix)]
struct OwnedGroup(u32);
#[cfg(unix)]
impl Drop for OwnedGroup {
    fn drop(&mut self) {
        unsafe {
            libc::kill(-(self.0 as i32), libc::SIGKILL);
        }
    }
}
async fn read_stream(
    mut stream: impl AsyncRead + Unpin,
    limit: usize,
    label: &str,
) -> Result<Vec<u8>, GraphError> {
    let mut out = Vec::new();
    let mut buffer = [0; 8192];
    loop {
        let count = stream
            .read(&mut buffer)
            .await
            .map_err(|error| GraphError::error(error.to_string()))?;
        if count == 0 {
            return Ok(out);
        }
        if out.len() + count > limit {
            return Err(GraphError {
                code: Some(Box::new(json!("ERR_CHILD_PROCESS_STDIO_MAXBUFFER"))),
                ..GraphError::error(format!("{label} maxBuffer length exceeded"))
            });
        }
        out.extend_from_slice(&buffer[..count]);
    }
}
/// Already-authorized process capture with separate raw UTF-8 channels. A deadline
/// is mandatory at composition; stdout/stderr each have the reference 16 MiB cap.
pub fn native_executor(
    default_cwd: PathBuf,
    timeout: Duration,
    parallelism: u16,
) -> Result<Executor, GraphError> {
    if timeout.is_zero() || timeout > Duration::from_secs(86400) || parallelism == 0 {
        return Err(GraphError::error("Invalid code-graph execution limits"));
    }
    let permits = Arc::new(Semaphore::new(parallelism as usize));
    Ok(Arc::new(move |request| {
        let cwd = default_cwd.clone();
        let permits = permits.clone();
        Box::pin(async move {
            if request.command.is_empty()
                || request.command.contains('\0')
                || request.args.iter().any(|arg| arg.contains('\0'))
            {
                return Err(GraphError::error("Invalid code-graph command argument"));
            }
            let cancelled = || GraphError {
                name: "AbortError".into(),
                code: Some(Box::new(json!("ABORT_ERR"))),
                ..GraphError::error("The operation was aborted")
            };
            if request
                .signal
                .as_ref()
                .is_some_and(ProcessCancellation::is_cancelled)
            {
                return Err(cancelled());
            }
            let _permit = permits
                .try_acquire_owned()
                .map_err(|_| GraphError::error("Code-graph process capacity unavailable"))?;
            let mut command = Command::new(&request.command);
            command
                .args(&request.args)
                .current_dir(request.cwd.as_ref().map(PathBuf::from).unwrap_or(cwd))
                .env_clear()
                .envs(&request.env)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true);
            #[cfg(unix)]
            {
                use std::os::unix::process::CommandExt;
                command.as_std_mut().process_group(0);
            }
            let mut child = command.spawn().map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    GraphError {
                        code: Some(Box::new(json!("ENOENT"))),
                        ..GraphError::error(format!("spawn {} ENOENT", request.command))
                    }
                } else {
                    GraphError::error(error.to_string())
                }
            })?;
            #[cfg(unix)]
            let _group = OwnedGroup(child.id().unwrap());
            let stdout = child.stdout.take().unwrap();
            let stderr = child.stderr.take().unwrap();
            let outcome = {
                let complete = async {
                    tokio::try_join!(
                        read_stream(stdout, 16 * 1024 * 1024, "stdout"),
                        read_stream(stderr, 16 * 1024 * 1024, "stderr"),
                        async {
                            child
                                .wait()
                                .await
                                .map_err(|error| GraphError::error(error.to_string()))
                        }
                    )
                };
                tokio::pin!(complete);
                let signal = request.signal.clone();
                let cancellation = async {
                    if let Some(signal) = signal {
                        signal.wait_cancelled().await;
                    } else {
                        std::future::pending::<()>().await;
                    }
                };
                tokio::select! {biased;_=cancellation=>Err(cancelled()),_=tokio::time::sleep(timeout)=>Err(GraphError{code:Some(Box::new(json!("ETIMEDOUT"))),..GraphError::error("Code-graph command exceeded its execution deadline")}),result=&mut complete=>result}
            };
            match outcome {
                Ok((stdout, stderr, status)) => {
                    let stdout = String::from_utf8_lossy(&stdout).into_owned();
                    let stderr = String::from_utf8_lossy(&stderr).into_owned();
                    if status.success() {
                        Ok(ExecOutput { stdout, stderr })
                    } else {
                        Err(GraphError {
                            code: status.code().map(|code| Box::new(json!(code))),
                            ..GraphError::error(format!(
                                "Command failed: {}{}\n{}",
                                request.command,
                                if request.args.is_empty() {
                                    String::new()
                                } else {
                                    format!(" {}", request.args.join(" "))
                                },
                                stderr
                            ))
                        })
                    }
                }
                Err(error) => {
                    let _ = child.start_kill();
                    let _ = child.wait().await;
                    Err(error)
                }
            }
        })
    }))
}
