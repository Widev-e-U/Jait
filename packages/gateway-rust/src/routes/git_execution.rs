//! Scoped Git execution. Request and command authorities are mandatory; no ambient process access.
use super::{GitRoutes, error_response, json_body};
use crate::{
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    runtime::blocking::BlockingLane,
};
use axum::{
    body::Body,
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use futures_util::future::BoxFuture;
use serde_json::{Map, Value};
use std::{
    cell::RefCell,
    collections::HashMap,
    io::{self, Read},
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct GitAuthorizationRequest {
    pub owner: String,
    pub operation: String,
    pub body: Map<String, Value>,
}
/// Grants must reflect consent, exact root and remote destinations, not reachability.
pub type GitAuthority = Arc<
    dyn Fn(
            GitAuthorizationRequest,
            ProcessCancellation,
        ) -> BoxFuture<'static, Result<GitGrant, String>>
        + Send
        + Sync,
>;
#[derive(Clone)]
pub struct GitGrant {
    pub owner: String,
    pub root: PathBuf,
    pub command_authority: GitCommandAuthority,
    /// Explicit permission for the paths in this exact file-diffs request.
    pub allow_worktree_reads: bool,
}
#[derive(Clone, Debug)]
pub struct GitCommandRequest {
    pub owner: String,
    pub operation: String,
    pub program: String,
    pub cwd: PathBuf,
    pub arguments: Vec<String>,
    pub environment: HashMap<String, String>,
    pub input: Option<Vec<u8>>,
}
/// Resolve executable and captured environment only after checking exact argv, owner,
/// root, hooks/helpers and configured remote destinations. Denial must have no effect.
pub type GitCommandAuthority = Arc<
    dyn Fn(
            GitCommandRequest,
            ProcessCancellation,
        ) -> BoxFuture<'static, Result<ProcessRequest, String>>
        + Send
        + Sync,
>;

#[derive(Clone)]
struct Context {
    owner: String,
    operation: String,
    grant: GitGrant,
    pool: ProcessPool,
    lane: BlockingLane,
    cancel: ProcessCancellation,
    deadline: Instant,
    commands: Arc<AtomicUsize>,
    output_bytes: Arc<AtomicUsize>,
}
tokio::task_local! {static REQUEST_CONTEXT:Context;}
thread_local! {static WORKER_CONTEXT:RefCell<Option<Context>>=const{RefCell::new(None)};}
struct CancellationGuard(ProcessCancellation);
impl Drop for CancellationGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
struct WorkerGuard;
impl Drop for WorkerGuard {
    fn drop(&mut self) {
        WORKER_CONTEXT.with(|ctx| ctx.replace(None));
    }
}

pub(super) async fn authorize(
    State(state): State<GitRoutes>,
    request: Request,
    next: Next,
) -> Response {
    let user = match super::auth::require_user(&state.auth, request.headers()).await {
        Ok(u) => u,
        Err(e) => return *e,
    };
    let Some(authority) = state.authority.clone() else {
        return error_response(503, "Git execution authority is unavailable");
    };
    let _permit = match state.admission.clone().try_acquire_owned() {
        Ok(p) => p,
        Err(_) => return error_response(503, "Git request capacity exhausted"),
    };
    let operation = request
        .uri()
        .path()
        .trim_start_matches("/api/git/")
        .to_owned();
    let (parts, body) = request.into_parts();
    let body = match json_body(Request::from_parts(parts.clone(), body)).await {
        Ok(body) => body,
        Err(e) => return *e,
    };
    // Explicit remote selection cannot fall through to a local checkout.
    if body
        .get("nodeId")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.trim().is_empty())
    {
        return error_response(503, "Remote Git execution is unavailable");
    }
    let Some(cwd) = body
        .get("cwd")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    else {
        return error_response(400, "Missing cwd");
    };
    let cwd = PathBuf::from(cwd);
    if !cwd.is_absolute() {
        return error_response(400, "cwd must be an absolute authorized root");
    }
    let cancel = ProcessCancellation::default();
    let _guard = CancellationGuard(cancel.clone());
    let request = GitAuthorizationRequest {
        owner: user.id.clone(),
        operation: operation.clone(),
        body: body.clone(),
    };
    let grant = match tokio::time::timeout(
        Duration::from_secs(5),
        authority(request, cancel.clone()),
    )
    .await
    {
        Ok(Ok(grant)) => grant,
        Ok(Err(error)) => return error_response(403, &error),
        Err(_) => return error_response(504, "Git authorization timed out"),
    };
    if operation == "file-diffs" && !grant.allow_worktree_reads {
        return error_response(403, "Worktree reads are not authorized");
    }
    if grant.owner != user.id || !grant.root.is_absolute() {
        return error_response(403, "Git authority owner/root mismatch");
    }
    let root = grant.root.clone();
    let verified = state
        .blocking
        .run(move || Ok::<_, io::Error>((cwd.canonicalize()?, root.canonicalize()?)))
        .await;
    match verified {
        Ok(Ok((cwd, root))) if cwd == root && root == grant.root => {}
        Ok(Ok(_)) => return error_response(403, "Git root is outside the authorized request"),
        _ => return error_response(403, "Git root is unavailable"),
    }
    let context = Context {
        owner: user.id,
        operation,
        grant,
        pool: state.processes.clone(),
        lane: state.blocking.clone(),
        cancel,
        deadline: Instant::now() + Duration::from_secs(120),
        commands: Arc::new(AtomicUsize::new(0)),
        output_bytes: Arc::new(AtomicUsize::new(0)),
    };
    let bytes = match serde_json::to_vec(&body) {
        Ok(b) => b,
        Err(_) => return error_response(400, "Invalid JSON body"),
    };
    let request = Request::from_parts(parts, Body::from(bytes));
    match tokio::time::timeout(
        Duration::from_secs(120),
        REQUEST_CONTEXT.scope(context, next.run(request)),
    )
    .await
    {
        Ok(response) => response,
        Err(_) => error_response(504, "Git request timed out"),
    }
}

pub(super) async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> T + Send + 'static,
) -> io::Result<T> {
    let context = REQUEST_CONTEXT.try_with(Clone::clone).map_err(|_| {
        io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Git execution has no authorized request",
        )
    })?;
    let lane = context.lane.clone();
    lane.run(move || {
        WORKER_CONTEXT.with(|ctx| ctx.replace(Some(context)));
        let _guard = WorkerGuard;
        operation()
    })
    .await
}
fn context() -> io::Result<Context> {
    WORKER_CONTEXT
        .with(|ctx| ctx.borrow().clone())
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Git command has no scoped worker",
            )
        })
}

pub(super) struct Command {
    program: String,
    cwd: Option<PathBuf>,
    args: Vec<String>,
    environment: HashMap<String, String>,
    input: Option<Vec<u8>>,
}
impl Command {
    pub fn new(program: impl AsRef<str>) -> Self {
        Self {
            program: program.as_ref().into(),
            cwd: None,
            args: vec![],
            environment: HashMap::new(),
            input: None,
        }
    }
    pub fn current_dir(&mut self, cwd: impl AsRef<Path>) -> &mut Self {
        self.cwd = Some(cwd.as_ref().into());
        self
    }
    pub fn args<I, S>(&mut self, args: I) -> &mut Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.args
            .extend(args.into_iter().map(|s| s.as_ref().into()));
        self
    }
    pub fn env(&mut self, key: impl AsRef<str>, value: impl AsRef<str>) -> &mut Self {
        self.environment
            .insert(key.as_ref().into(), value.as_ref().into());
        self
    }
    pub fn output(&mut self) -> io::Result<Capture> {
        let ctx = context()?;
        if ctx.cancel.is_cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Git request cancelled",
            ));
        }
        if ctx.commands.fetch_add(1, Ordering::AcqRel) >= 128 {
            return Err(io::Error::other("Git command budget exhausted"));
        }
        let cwd = self
            .cwd
            .clone()
            .unwrap_or_else(|| ctx.grant.root.clone())
            .canonicalize()?;
        if cwd != ctx.grant.root {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Git command root mismatch",
            ));
        }
        let request = GitCommandRequest {
            owner: ctx.owner.clone(),
            operation: ctx.operation.clone(),
            program: self.program.clone(),
            cwd: cwd.clone(),
            arguments: self.args.clone(),
            environment: self.environment.clone(),
            input: self.input.clone(),
        };
        let timeout = ctx
            .deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_secs(30));
        if timeout.is_zero() {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Git request deadline exhausted",
            ));
        }
        tokio::runtime::Handle::current().block_on(async {
            let mut authorized = tokio::time::timeout(
                timeout,
                (ctx.grant.command_authority)(request, ctx.cancel.clone()),
            )
            .await
            .map_err(|_| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git command authorization timed out",
                )
            })?
            .map_err(|error| io::Error::new(io::ErrorKind::PermissionDenied, error))?;
            if authorized.cwd != cwd
                || authorized.argv.is_empty()
                || !Path::new(&authorized.argv[0]).is_absolute()
                || authorized.argv[1..] != self.args
                || authorized.input != self.input
                || authorized.output_limit > 512 * 1024
                || authorized.timeout > timeout
                || authorized.timeout.is_zero()
            {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Git command grant does not match request bounds",
                ));
            }
            // Authorization consumes the same request budget as process execution.
            let remaining = ctx.deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() || ctx.cancel.is_cancelled() {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git request deadline exhausted",
                ));
            }
            authorized.timeout = authorized.timeout.min(remaining);
            // The canonical runner owns process admission, drain, cancellation and descendant cleanup.
            let output = ctx
                .pool
                .run_captured(authorized, ctx.cancel.clone())
                .await?;
            if output.timed_out {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git command timed out",
                ));
            }
            if output.cancelled {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Git command cancelled",
                ));
            }
            if output.truncated {
                return Err(io::Error::other("Git command output exceeds byte limit"));
            }
            charge_output(&ctx, output.stdout.len() + output.stderr.len())?;
            Ok(Capture {
                status: ExitStatus(output.exit_code),
                stdout: output.stdout,
                stderr: output.stderr,
            })
        })
    }
}
pub(super) struct Capture {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}
pub(super) struct ExitStatus(Option<i32>);
impl ExitStatus {
    pub fn success(&self) -> bool {
        self.0 == Some(0)
    }
    pub fn code(&self) -> Option<i32> {
        self.0
    }
}
pub(super) fn read_worktree_file(cwd: &str, path: &str) -> io::Result<String> {
    let ctx = context()?;
    if !ctx.grant.allow_worktree_reads
        || ctx.cancel.is_cancelled()
        || Instant::now() >= ctx.deadline
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Worktree read is not authorized",
        ));
    }
    if ctx.commands.fetch_add(1, Ordering::AcqRel) >= 128 {
        return Err(io::Error::other("Git command/read budget exhausted"));
    }
    let root = Path::new(cwd).canonicalize()?;
    if root != ctx.grant.root {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Worktree root mismatch",
        ));
    }
    let relative = Path::new(path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Invalid worktree path",
        ));
    }
    let file = open_worktree_file(&root, relative)?;
    if !file.metadata()?.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Worktree target must be a regular file",
        ));
    }
    let mut bytes = Vec::new();
    file.take(512 * 1024 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > 512 * 1024 {
        return Err(io::Error::other("Worktree file exceeds byte limit"));
    }
    charge_output(&ctx, bytes.len())?;
    Ok(String::from_utf8_lossy(&bytes).into())
}
fn charge_output(ctx: &Context, bytes: usize) -> io::Result<()> {
    const LIMIT: usize = 2 * 1024 * 1024;
    ctx.output_bytes
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
            used.checked_add(bytes).filter(|total| *total <= LIMIT)
        })
        .map(|_| ())
        .map_err(|_| io::Error::other("Git request output budget exhausted"))
}

// Directory handles prevent ancestor symlink swaps redirecting approved reads.
#[cfg(unix)]
fn open_worktree_file(root: &Path, relative: &Path) -> io::Result<std::fs::File> {
    use std::{
        ffi::CString,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::{ffi::OsStrExt, fs::OpenOptionsExt},
        },
    };
    let mut directory = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(root)?;
    let components = relative.components().collect::<Vec<_>>();
    for (index, component) in components.iter().enumerate() {
        let name = CString::new(component.as_os_str().as_bytes())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "Invalid worktree path"))?;
        let last = index + 1 == components.len();
        // Nonblocking open rejects FIFOs without waiting for a writer.
        let flags = libc::O_RDONLY
            | libc::O_NOFOLLOW
            | libc::O_CLOEXEC
            | libc::O_NONBLOCK
            | if last { 0 } else { libc::O_DIRECTORY };
        let descriptor = unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
        if descriptor < 0 {
            return Err(io::Error::last_os_error());
        }
        let file = unsafe { std::fs::File::from_raw_fd(descriptor) };
        if last {
            return Ok(file);
        }
        directory = file;
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidInput,
        "Empty worktree path",
    ))
}
#[cfg(not(unix))]
fn open_worktree_file(_root: &Path, _relative: &Path) -> io::Result<std::fs::File> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Handle-scoped worktree reads are unavailable on this platform",
    ))
}

pub(super) fn lanes() -> (ProcessPool, BlockingLane) {
    (
        ProcessPool::new(NonZeroU16::new(4).unwrap()),
        BlockingLane::new(NonZeroU16::new(4).unwrap()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::http_auth::{AuthUser, sign_auth_token};
    use crate::services::users::UserService;
    use serde_json::json;

    struct Fixture {
        root: PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/gateway-rust/git-execution-tests")
                .join(uuid::Uuid::new_v4().to_string());
            std::fs::create_dir_all(&root).unwrap();
            Self {
                root: root.canonicalize().unwrap(),
            }
        }
        fn context(&self, authority: GitCommandAuthority) -> Context {
            let (pool, lane) = lanes();
            Context {
                owner: "owner".into(),
                operation: "test".into(),
                grant: GitGrant {
                    owner: "owner".into(),
                    root: self.root.clone(),
                    command_authority: authority,
                    allow_worktree_reads: true,
                },
                pool,
                lane,
                cancel: ProcessCancellation::default(),
                deadline: Instant::now() + Duration::from_secs(3),
                commands: Arc::new(AtomicUsize::new(0)),
                output_bytes: Arc::new(AtomicUsize::new(0)),
            }
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    fn deny() -> GitCommandAuthority {
        Arc::new(|_, _| Box::pin(async { Err("command denied".into()) }))
    }
    async fn scoped<T: Send + 'static>(ctx: Context, f: impl FnOnce() -> T + Send + 'static) -> T {
        REQUEST_CONTEXT.scope(ctx, blocking(f)).await.unwrap()
    }

    #[tokio::test]
    async fn missing_worker_context_and_denied_commands_have_no_effect() {
        assert!(Command::new("git").output().is_err());
        let fixture = Fixture::new();
        let error = scoped(fixture.context(deny()), || {
            Command::new("git").output().err().unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(std::fs::read_dir(&fixture.root).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn worktree_reads_reject_traversal_symlinks_and_special_files() {
        use std::os::unix::ffi::OsStrExt;
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.root.join("nested")).unwrap();
        std::fs::write(fixture.root.join("nested/file"), "approved").unwrap();
        std::fs::write(fixture.root.join("large"), vec![0u8; 512 * 1024 + 1]).unwrap();
        std::os::unix::fs::symlink("nested", fixture.root.join("alias")).unwrap();
        std::os::unix::fs::symlink("nested/file", fixture.root.join("linked")).unwrap();
        let fifo =
            std::ffi::CString::new(fixture.root.join("fifo").as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        let root = fixture.root.to_string_lossy().into_owned();
        scoped(fixture.context(deny()), move || {
            assert_eq!(
                read_worktree_file(&root, "nested/file").unwrap(),
                "approved"
            );
            for path in [
                "../outside",
                "/etc/passwd",
                "alias/file",
                "linked",
                "fifo",
                "large",
                "",
            ] {
                assert!(
                    read_worktree_file(&root, path).is_err(),
                    "unexpected read: {path}"
                );
            }
        })
        .await;
    }

    #[tokio::test]
    async fn command_budget_and_worktree_read_permission_are_enforced() {
        let fixture = Fixture::new();
        let mut ctx = fixture.context(deny());
        ctx.commands.store(128, Ordering::Release);
        ctx.grant.allow_worktree_reads = false;
        let root = fixture.root.to_string_lossy().into_owned();
        scoped(ctx, move || {
            assert!(
                Command::new("git")
                    .output()
                    .err()
                    .unwrap()
                    .to_string()
                    .contains("budget")
            );
            assert!(
                read_worktree_file(&root, "file")
                    .err()
                    .unwrap()
                    .to_string()
                    .contains("not authorized")
            );
        })
        .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn aggregate_output_budget_applies_across_commands_and_reads() {
        let fixture = Fixture::new();
        let ctx = fixture.context(deny());
        charge_output(&ctx, 2 * 1024 * 1024 - 1).unwrap();
        charge_output(&ctx, 1).unwrap();
        assert!(charge_output(&ctx, 1).is_err());
        assert_eq!(ctx.output_bytes.load(Ordering::Acquire), 2 * 1024 * 1024);
        std::fs::write(fixture.root.join("file"), "x").unwrap();
        let root = fixture.root.to_string_lossy().into_owned();
        scoped(ctx, move || {
            assert!(
                read_worktree_file(&root, "file")
                    .unwrap_err()
                    .to_string()
                    .contains("output budget")
            )
        })
        .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn authorized_process_preserves_raw_output_and_rejects_changed_arguments() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(request.owner, "owner");
                assert_eq!(request.operation, "test");
                assert_eq!(request.program, "printf");
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 4096,
                })
            })
        });
        let output = scoped(fixture.context(authority), || {
            Command::new("printf").args(["line\n\n"]).output().unwrap()
        })
        .await;
        assert!(output.status.success());
        assert_eq!(output.stdout, b"line\n\n");
        assert!(output.stderr.is_empty());
        let changed: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: vec!["/usr/bin/printf".into(), "changed".into()],
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: None,
                    timeout: Duration::from_secs(1),
                    output_limit: 4096,
                })
            })
        });
        let error = scoped(fixture.context(changed), || {
            Command::new("printf")
                .args(["original"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn authorization_and_execution_share_request_deadline() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                tokio::time::sleep(Duration::from_millis(150)).await;
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: None,
                    timeout: Duration::from_millis(280),
                    output_limit: 4096,
                })
            })
        });
        let mut ctx = fixture.context(authority);
        ctx.deadline = Instant::now() + Duration::from_millis(300);
        let started = Instant::now();
        let error = scoped(ctx, || {
            Command::new("sh")
                .args(["-c", "sleep 0.20; printf late"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        // A generous bound accommodates CI scheduling; raw cancellation is also checked below.
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn request_cancellation_interrupts_owned_process() {
        let fixture = Fixture::new();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(());
            }
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: None,
                    timeout: Duration::from_secs(2),
                    output_limit: 4096,
                })
            })
        });
        let ctx = fixture.context(authority);
        let cancel = ctx.cancel.clone();
        let task = tokio::spawn(scoped(ctx, || {
            Command::new("sh")
                .args(["-c", "exec sleep 10"])
                .output()
                .err()
                .unwrap()
        }));
        rx.await.unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        cancel.cancel();
        let error = tokio::time::timeout(Duration::from_secs(1), task)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
    }

    struct Server {
        base: String,
        task: tokio::task::JoinHandle<()>,
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.task.abort();
        }
    }
    async fn server(router: axum::Router) -> Server {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        Server { base, task }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn authorized_http_init_and_status_use_scoped_native_processes() {
        let fixture = Fixture::new();
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let user = UserService::new(&db)
            .create_user_with_hash("git-native", "test-hash")
            .unwrap();
        let secret = "git-native-test-secret-at-least-thirty-two-bytes";
        let token = sign_auth_token(
            &AuthUser {
                id: user.id,
                username: user.username,
            },
            secret,
        )
        .unwrap();
        let auth = super::super::auth::AuthState::new(db, secret.into()).unwrap();
        let commands = Arc::new(AtomicUsize::new(0));
        let recorded = commands.clone();
        let command_authority: GitCommandAuthority = Arc::new(move |request, _| {
            recorded.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                if request.program != "git" {
                    return Err("Only fixture-local Git is authorized".into());
                }
                if !matches!(
                    request.arguments.first().map(String::as_str),
                    Some(
                        "init"
                            | "rev-parse"
                            | "status"
                            | "diff"
                            | "symbolic-ref"
                            | "branch"
                            | "config"
                            | "remote"
                    )
                ) {
                    return Err("Fixture command is not authorized".into());
                }
                let mut environment = request.environment;
                environment.insert("GIT_CONFIG_NOSYSTEM".into(), "1".into());
                environment.insert("GIT_CONFIG_GLOBAL".into(), "/dev/null".into());
                environment.insert("HOME".into(), request.cwd.to_string_lossy().into_owned());
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/git".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment,
                    input: None,
                    timeout: Duration::from_secs(1),
                    output_limit: 65536,
                })
            })
        });
        let root = fixture.root.clone();
        let authority: GitAuthority = Arc::new(move |request, _| {
            let root = root.clone();
            let command_authority = command_authority.clone();
            Box::pin(async move {
                Ok(GitGrant {
                    owner: request.owner,
                    root,
                    command_authority,
                    allow_worktree_reads: false,
                })
            })
        });
        let server = server(
            GitRoutes::new(auth.clone())
                .with_authority(authority)
                .router(),
        )
        .await;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        let call = |operation: &str, root: &Path| {
            client
                .post(format!("{}/api/git/{operation}", server.base))
                .bearer_auth(&token)
                .json(&json!({"cwd":root}))
                .send()
        };
        assert_eq!(call("init", &fixture.root).await.unwrap().status(), 200);
        assert!(fixture.root.join(".git/HEAD").is_file());
        std::fs::write(fixture.root.join("new.txt"), "owned fixture\n").unwrap();
        let response = call("status", &fixture.root).await.unwrap();
        assert_eq!(response.status(), 200);
        let value: Value = response.json().await.unwrap();
        assert_eq!(value["hasWorkingTreeChanges"], true);
        assert_eq!(value["ghAvailable"], false);
        let before = commands.load(Ordering::SeqCst);
        assert!(before > 3);
        std::fs::create_dir(fixture.root.join("other")).unwrap();
        assert_eq!(
            call("status", &fixture.root.join("other"))
                .await
                .unwrap()
                .status(),
            403
        );
        assert_eq!(
            call("file-diffs", &fixture.root).await.unwrap().status(),
            403
        );
        assert_eq!(commands.load(Ordering::SeqCst), before);
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn routes_require_auth_authority_owner_and_local_target() {
        let fixture = Fixture::new();
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let user = UserService::new(&db)
            .create_user_with_hash("git-owner", "test-hash")
            .unwrap();
        let secret = "git-route-test-secret-at-least-thirty-two-bytes";
        let token = sign_auth_token(
            &AuthUser {
                id: user.id,
                username: user.username,
            },
            secret,
        )
        .unwrap();
        let auth = super::super::auth::AuthState::new(db, secret.into()).unwrap();
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap();
        let first = server(GitRoutes::new(auth.clone()).router()).await;
        let body = json!({"cwd":fixture.root});
        assert_eq!(
            client
                .post(format!("{}/api/git/status", first.base))
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            client
                .post(format!("{}/api/git/status", first.base))
                .bearer_auth(&token)
                .json(&body)
                .send()
                .await
                .unwrap()
                .status(),
            503
        );
        let root = fixture.root.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let recorded = calls.clone();
        let authority: GitAuthority = Arc::new(move |_, _| {
            let root = root.clone();
            recorded.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                Ok(GitGrant {
                    owner: "different-owner".into(),
                    root,
                    command_authority: deny(),
                    allow_worktree_reads: false,
                })
            })
        });
        let second = server(
            GitRoutes::new(auth.clone())
                .with_authority(authority)
                .router(),
        )
        .await;
        let status = |body: Value| {
            client
                .post(format!("{}/api/git/status", second.base))
                .bearer_auth(&token)
                .json(&body)
                .send()
        };
        assert_eq!(
            status(json!({"cwd":fixture.root,"nodeId":"remote-node"}))
                .await
                .unwrap()
                .status(),
            503
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(status(body).await.unwrap().status(), 403);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        auth.shutdown().await.unwrap();
    }
}
