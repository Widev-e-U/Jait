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
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

#[derive(Clone)]
pub struct GitAuthorizationRequest {
    pub owner: String,
    pub operation: String,
    pub body: Map<String, Value>,
}
// Request bodies may contain credentials; keep them out of diagnostics even when
// an authority logs the request with Debug.
impl std::fmt::Debug for GitAuthorizationRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GitAuthorizationRequest")
            .field("operation", &self.operation)
            .field("body", &"[REDACTED]")
            .finish_non_exhaustive()
    }
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
#[derive(Clone)]
pub struct GitCommandRequest {
    pub owner: String,
    pub operation: String,
    pub program: String,
    pub cwd: PathBuf,
    pub arguments: Vec<String>,
    pub environment: HashMap<String, String>,
    pub input: Option<Vec<u8>>,
}
// Arguments, environment and stdin can all carry credentials or private data.
impl std::fmt::Debug for GitCommandRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GitCommandRequest")
            .field("operation", &self.operation)
            .field("program", &self.program)
            .field("arguments", &"[REDACTED]")
            .field("environment", &"[REDACTED]")
            .field("input", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}
/// Resolve executable and captured environment only after checking exact argv, owner,
/// root, hooks/helpers and configured remote destinations. Denial must have no effect.
///
/// A matching cwd alone does not constrain Git's repository discovery. The authority
/// must also authorize the discovered worktree, Git directory and common directory,
/// including parent repositories and `.git` indirection, for the requested operation.
/// It must control repository-selection environment variables and prevent any change
/// in those resources between authorization and execution. A discovery ceiling may
/// exclude a parent repository, but does not by itself constrain `.git` indirection.
/// Nested working directories require explicit authority for their actual repository;
/// they must not implicitly expand a grant for the requested directory.
pub type GitCommandAuthority = Arc<
    dyn Fn(
            GitCommandRequest,
            ProcessCancellation,
        ) -> BoxFuture<'static, Result<ProcessRequest, String>>
        + Send
        + Sync,
>;

/// Remote destinations one request is about to contact. The host resolves each remote
/// to its destination, obtains consent for it and records a grant that the command
/// authority checks again at execution; the route never constructs that grant.
#[derive(Clone, Debug)]
pub struct NetworkRequest {
    pub owner: String,
    pub root: PathBuf,
    /// `fetch` (also for pull) or `push`.
    pub operation: String,
    pub remotes: Vec<String>,
}
pub type NetworkGate = Arc<
    dyn Fn(NetworkRequest, ProcessCancellation) -> BoxFuture<'static, Result<(), String>>
        + Send
        + Sync,
>;
/// Ask the host to authorize `remotes` for the current request's owner and root.
pub(super) async fn network_gate(
    gate: &NetworkGate,
    operation: &str,
    remotes: Vec<String>,
) -> Result<(), String> {
    let context = REQUEST_CONTEXT
        .try_with(Clone::clone)
        .map_err(|_| "Git execution has no authorized request".to_owned())?;
    gate(
        NetworkRequest {
            owner: context.owner,
            root: context.grant.root,
            operation: operation.to_owned(),
            remotes,
        },
        context.cancel,
    )
    .await
}

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
    capture_active: Arc<AtomicBool>,
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
        Ok(Err(error)) => {
            // Diagnostics can contain transformed or partial credentials, so do not
            // reflect authority errors from requests carrying a token at all.
            if body.contains_key("token") {
                return error_response(403, "Git authorization denied");
            }
            return error_response(403, &error);
        }
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
        capture_active: Arc::new(AtomicBool::new(false)),
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

pub(super) fn request_cancellation() -> Option<ProcessCancellation> {
    REQUEST_CONTEXT
        .try_with(|context| context.cancel.clone())
        .ok()
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
    timeout: Option<Duration>,
}
impl Command {
    pub fn new(program: impl AsRef<str>) -> Self {
        Self {
            program: program.as_ref().into(),
            cwd: None,
            args: vec![],
            environment: HashMap::new(),
            input: None,
            timeout: None,
        }
    }
    pub fn timeout(&mut self, timeout: Duration) -> &mut Self {
        self.timeout = Some(timeout);
        self
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
    pub fn input(&mut self, input: Vec<u8>) -> &mut Self {
        self.input = Some(input);
        self
    }
    pub fn output(&mut self) -> io::Result<Capture> {
        let ctx = context()?;
        tokio::runtime::Handle::current().block_on(self.output_scoped(&ctx))
    }

    async fn output_scoped(&self, ctx: &Context) -> io::Result<Capture> {
        self.output_scoped_with(ctx, &ctx.operation, 512 * 1024, |_| true)
            .await
    }

    // Forward both cancellation sources into the supervised runner. Do not race
    // the runner future against either source: it must drain and reap its child.
    async fn output_scoped_with_cancellation(
        &self,
        ctx: &Context,
        caller_cancel: ProcessCancellation,
        operation: &str,
        output_limit: usize,
        grant_allowed: impl FnOnce(&ProcessRequest) -> bool,
    ) -> io::Result<Capture> {
        let combined = ProcessCancellation::default();
        if ctx.cancel.is_cancelled() || caller_cancel.is_cancelled() {
            combined.cancel();
        }
        let request_cancel = ctx.cancel.clone();
        let forwarded = combined.clone();
        let watcher = tokio::spawn(async move {
            tokio::select! {
                _ = request_cancel.wait_cancelled() => {},
                _ = caller_cancel.wait_cancelled() => {},
            }
            forwarded.cancel();
        });
        struct WatcherGuard(tokio::task::JoinHandle<()>, ProcessCancellation);
        impl Drop for WatcherGuard {
            fn drop(&mut self) {
                self.1.cancel();
                self.0.abort();
            }
        }
        let _watcher = WatcherGuard(watcher, combined.clone());
        let mut scoped = ctx.clone();
        scoped.cancel = combined;
        self.output_scoped_with(&scoped, operation, output_limit, grant_allowed)
            .await
    }

    // Specialized callers must supply their exact operation and additional grant
    // checks while sharing the request's capture, command, and output budgets.
    async fn output_scoped_with(
        &self,
        ctx: &Context,
        operation: &str,
        output_limit: usize,
        grant_allowed: impl FnOnce(&ProcessRequest) -> bool,
    ) -> io::Result<Capture> {
        if output_limit == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "zero output limit",
            ));
        }
        let _capture = CapturePermit::acquire_async(ctx).await?;
        if ctx.cancel.is_cancelled() {
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Git request cancelled",
            ));
        }
        if ctx.output_bytes.load(Ordering::Acquire) >= OUTPUT_BUDGET {
            return Err(io::Error::other(OutputLimitError(
                "Git request output budget exhausted",
            )));
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
            operation: operation.to_owned(),
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
        {
            let mut authorized = tokio::select! {
                biased;
                _ = ctx.cancel.wait_cancelled() => {
                    return Err(io::Error::new(io::ErrorKind::Interrupted, "Git request cancelled"));
                }
                result = tokio::time::timeout(
                    timeout,
                    (ctx.grant.command_authority)(request, ctx.cancel.clone()),
                ) => result
                    .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "Git command authorization timed out"))?
                    .map_err(|error| {
                        // Forge authority diagnostics can include credentials from the
                        // environment or stdin, including transformed fragments.
                        if operation.starts_with("forge.") {
                            io::Error::new(io::ErrorKind::PermissionDenied, "Forge command authorization denied")
                        } else {
                            io::Error::new(io::ErrorKind::PermissionDenied, error)
                        }
                    })?,
            };
            if authorized.cwd != cwd
                || authorized.argv.is_empty()
                || !Path::new(&authorized.argv[0]).is_absolute()
                || authorized.argv[1..] != self.args
                || authorized.input != self.input
                || self
                    .environment
                    .iter()
                    .any(|(key, value)| authorized.environment.get(key) != Some(value))
                || authorized.output_limit == 0
                || authorized.output_limit > 512 * 1024
                || authorized.timeout > timeout
                || authorized.timeout.is_zero()
                || !grant_allowed(&authorized)
            {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Git command grant does not match request bounds",
                ));
            }
            // Authorization consumes the same request budget as process execution.
            let remaining = ctx.deadline.saturating_duration_since(Instant::now());
            if ctx.cancel.is_cancelled() {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Git request cancelled",
                ));
            }
            if remaining.is_zero() {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git request deadline exhausted",
                ));
            }
            authorized.timeout = authorized
                .timeout
                .min(remaining)
                .min(self.timeout.unwrap_or(Duration::from_secs(30)));
            // The permit makes the remaining aggregate allowance stable until capture ends.
            let remaining_output =
                OUTPUT_BUDGET.saturating_sub(ctx.output_bytes.load(Ordering::Acquire));
            authorized.output_limit = authorized
                .output_limit
                .min(remaining_output)
                .min(output_limit);
            // The canonical runner owns process admission, drain, cancellation and descendant cleanup.
            let output = ctx
                .pool
                .run_captured(authorized, ctx.cancel.clone())
                .await?;
            // Account for captured data even when the operation was interrupted.
            let charge = charge_output(ctx, output.stdout.len() + output.stderr.len());
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
            // Captured bytes consume the request budget even if this command
            // exceeds its individual limit and a caller attempts a fallback.
            charge?;
            if output.truncated {
                return Err(io::Error::other(OutputLimitError(
                    "Git command output exceeds byte limit",
                )));
            }
            Ok(Capture {
                status: ExitStatus(output.exit_code),
                stdout: output.stdout,
                stderr: output.stderr,
            })
        }
    }
}
/// Routes that may open a forge session; the session is built from the request scope only.
const FORGE_OPERATIONS: [&str; 6] = [
    "forge-auth",
    "gh-auth",
    "forge-status",
    "gh-status",
    "forge-pr-checks",
    "pr-checks",
];

/// Return the authenticated owner only for a matching forge-auth grant.
/// Credential persistence must use this identity rather than request-body data.
pub(super) fn forge_auth_owner() -> crate::services::git_forge::ForgeResult<String> {
    use crate::services::git_forge::ForgeError;
    let ctx = REQUEST_CONTEXT
        .try_with(Clone::clone)
        .map_err(|_| ForgeError::Denied)?;
    if !matches!(ctx.operation.as_str(), "forge-auth" | "gh-auth") || ctx.grant.owner != ctx.owner {
        return Err(ForgeError::Denied);
    }
    Ok(ctx.owner)
}

/// Capture the request cancellation handle for deferred credential persistence.
pub(super) fn forge_auth_cancellation()
-> crate::services::git_forge::ForgeResult<ProcessCancellation> {
    use crate::services::git_forge::ForgeError;
    let ctx = REQUEST_CONTEXT
        .try_with(Clone::clone)
        .map_err(|_| ForgeError::Denied)?;
    if !matches!(ctx.operation.as_str(), "forge-auth" | "gh-auth") || ctx.grant.owner != ctx.owner {
        return Err(ForgeError::Denied);
    }
    Ok(ctx.cancel)
}

/// Construct a forge session exclusively from the authorized request identity.
/// Callers cannot substitute an owner, root, authority or process pool.
pub(super) fn forge_auth_session(
    repository: crate::services::git_forge::ForgeRepository,
    token: String,
) -> crate::services::git_forge::ForgeResult<crate::services::git_forge::ForgeSession> {
    use crate::services::git_forge::{ForgeError, ForgeSession};
    let ctx = REQUEST_CONTEXT
        .try_with(Clone::clone)
        .map_err(|_| ForgeError::Denied)?;
    if !FORGE_OPERATIONS.contains(&ctx.operation.as_str()) || ctx.grant.owner != ctx.owner {
        return Err(ForgeError::Denied);
    }
    ForgeSession::new_scoped(
        ctx.owner,
        ctx.grant.root,
        repository,
        token,
        ctx.grant.command_authority,
        ctx.pool,
    )
}

/// Execute a specialized command only inside the authorized async request scope.
/// The caller supplies additional provider-specific checks on the resolved grant.
pub(crate) async fn execute_scoped_specialized(
    request: GitCommandRequest,
    output_limit: usize,
    cancel: ProcessCancellation,
    grant_allowed: impl FnOnce(&ProcessRequest) -> bool,
) -> io::Result<Capture> {
    let ctx = REQUEST_CONTEXT.try_with(Clone::clone).map_err(|_| {
        io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Git execution has no authorized request",
        )
    })?;
    if request.owner != ctx.owner || request.cwd != ctx.grant.root {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Git request owner or root mismatch",
        ));
    }
    let mut command = Command::new(&request.program);
    command.current_dir(&request.cwd).args(&request.arguments);
    for (key, value) in &request.environment {
        command.env(key, value);
    }
    if let Some(input) = request.input {
        command.input(input);
    }
    command
        .output_scoped_with_cancellation(
            &ctx,
            cancel,
            &request.operation,
            output_limit,
            grant_allowed,
        )
        .await
}

pub(crate) fn is_output_limit(error: &io::Error) -> bool {
    error
        .get_ref()
        .is_some_and(|source| source.is::<OutputLimitError>())
}

pub(crate) struct Capture {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}
pub(crate) struct ExitStatus(Option<i32>);
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
    let _capture = CapturePermit::acquire(&ctx)?;
    if !ctx.grant.allow_worktree_reads
        || ctx.cancel.is_cancelled()
        || Instant::now() >= ctx.deadline
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Worktree read is not authorized",
        ));
    }
    if ctx.output_bytes.load(Ordering::Acquire) >= OUTPUT_BUDGET {
        return Err(io::Error::other(OutputLimitError(
            "Git request output budget exhausted",
        )));
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
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Worktree target must be a regular file",
        ));
    }
    if metadata.len() > super::batch::MAX_DIFF_FILE_BYTES as u64 {
        let placeholder = super::batch::oversized_placeholder(metadata.len());
        charge_output(&ctx, placeholder.len())?;
        return Ok(placeholder);
    }
    let remaining = OUTPUT_BUDGET.saturating_sub(ctx.output_bytes.load(Ordering::Acquire));
    let read_limit = remaining.min(512 * 1024 + 1);
    let mut bytes = Vec::new();
    let read = file.take(read_limit as u64).read_to_end(&mut bytes);
    let charge = charge_output(&ctx, bytes.len());
    read?;
    charge?;
    // Reaching the aggregate boundary cannot establish EOF without another read.
    // Fail closed, including exact-boundary files, rather than return partial data.
    if bytes.len() == remaining && remaining <= 512 * 1024 + 1 {
        return Err(io::Error::other(OutputLimitError(
            "Git request output budget exhausted",
        )));
    }
    if bytes.len() > 512 * 1024 {
        return Err(io::Error::other("Worktree file exceeds byte limit"));
    }
    Ok(String::from_utf8_lossy(&bytes).into())
}
// All captures in a request serialize through this permit, including worktree
// reads. Waiting is bounded by the request deadline and observes cancellation.
struct CapturePermit(Arc<AtomicBool>);
impl CapturePermit {
    // Async callers share the same permit as blocking worktree reads without
    // blocking a runtime thread while another capture owns it.
    async fn acquire_async(ctx: &Context) -> io::Result<Self> {
        loop {
            if ctx.cancel.is_cancelled() {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Git request cancelled",
                ));
            }
            if Instant::now() >= ctx.deadline {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git request deadline exhausted",
                ));
            }
            if ctx
                .capture_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Ok(Self(ctx.capture_active.clone()));
            }
            tokio::select! {
                biased;
                _ = ctx.cancel.wait_cancelled() => return Err(io::Error::new(io::ErrorKind::Interrupted, "Git request cancelled")),
                _ = tokio::time::sleep(Duration::from_millis(5)) => {}
            }
        }
    }
    fn acquire(ctx: &Context) -> io::Result<Self> {
        loop {
            if ctx.cancel.is_cancelled() {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "Git request cancelled",
                ));
            }
            if Instant::now() >= ctx.deadline {
                return Err(io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Git request deadline exhausted",
                ));
            }
            if ctx
                .capture_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Ok(Self(ctx.capture_active.clone()));
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }
}
impl Drop for CapturePermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

// Preserve the existing diagnostic while allowing callers to distinguish output
// exhaustion from unrelated I/O and command-budget errors without parsing text.
#[derive(Debug)]
struct OutputLimitError(&'static str);
impl std::fmt::Display for OutputLimitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for OutputLimitError {}

const OUTPUT_BUDGET: usize = 2 * 1024 * 1024;

fn charge_output(ctx: &Context, bytes: usize) -> io::Result<()> {
    let previous = ctx
        .output_bytes
        .try_update(Ordering::AcqRel, Ordering::Acquire, |used| {
            Some(used.saturating_add(bytes).min(OUTPUT_BUDGET))
        })
        .expect("budget update always succeeds");
    if bytes > OUTPUT_BUDGET.saturating_sub(previous) {
        return Err(io::Error::other(OutputLimitError(
            "Git request output budget exhausted",
        )));
    }
    Ok(())
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
    #[test]
    fn authorization_debug_does_not_expose_credentials() {
        let request = super::GitAuthorizationRequest {
            owner: "private-owner".into(),
            operation: "forge-auth".into(),
            body: serde_json::json!({"token":"secret-body"})
                .as_object()
                .unwrap()
                .clone(),
        };
        let command = super::GitCommandRequest {
            owner: "private-owner".into(),
            operation: "token-login".into(),
            program: "gh".into(),
            cwd: "/private/root".into(),
            arguments: vec!["secret-argument".into()],
            environment: [("GH_TOKEN".into(), "secret-environment".into())].into(),
            input: Some(b"secret-input".to_vec()),
        };
        let output = format!("{request:?} {command:?}");
        for secret in [
            "private-owner",
            "/private/root",
            "secret-body",
            "secret-argument",
            "secret-environment",
            "secret-input",
        ] {
            assert!(!output.contains(secret), "debug output exposed {secret}");
        }
        assert!(output.contains("forge-auth"));
        assert!(output.contains("token-login"));
    }
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
                capture_active: Arc::new(AtomicBool::new(false)),
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
    async fn async_capture_permit_shares_lock_and_observes_cancellation() {
        let fixture = Fixture::new();
        let ctx = fixture.context(deny());
        let held = CapturePermit::acquire_async(&ctx).await.unwrap();
        let waiting = ctx.clone();
        let waiter = tokio::spawn(async move { CapturePermit::acquire_async(&waiting).await });
        tokio::task::yield_now().await;
        assert!(!waiter.is_finished());
        ctx.cancel.cancel();
        let error = match waiter.await.unwrap() {
            Ok(_) => panic!("cancelled waiter acquired permit"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert!(ctx.capture_active.load(Ordering::Acquire));
        drop(held);
        assert!(!ctx.capture_active.load(Ordering::Acquire));
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

    #[cfg(unix)]
    #[tokio::test]
    async fn oversized_worktree_file_returns_bounded_placeholder() {
        let fixture = Fixture::new();
        let file = std::fs::File::create(fixture.root.join("oversized")).unwrap();
        file.set_len(10 * 1024 * 1024 + 262_144).unwrap();
        let root = fixture.root.to_string_lossy().into_owned();
        let ctx = fixture.context(deny());
        let output_bytes = ctx.output_bytes.clone();
        let text = scoped(ctx, move || read_worktree_file(&root, "oversized"))
            .await
            .unwrap();
        assert_eq!(text, "(file too large to diff: 10.3 MB, limit 10 MB)");
        assert_eq!(output_bytes.load(Ordering::Acquire), text.len());
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
        charge_output(&ctx, 2 * 1024 * 1024 - 2).unwrap();
        assert!(charge_output(&ctx, 3).is_err());
        assert_eq!(ctx.output_bytes.load(Ordering::Acquire), 2 * 1024 * 1024);
        ctx.output_bytes.store(0, Ordering::Release);
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
    async fn scoped_forge_session_uses_request_authority_and_fails_closed() {
        use crate::services::git_forge::{ForgeError, ForgeRepository, ForgeSession};
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(
                    request.operation,
                    "forge.github.login:github.com/owner/repo"
                );
                assert_eq!(
                    request.environment.get("GH_TOKEN").map(String::as_str),
                    Some("secret")
                );
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority.clone());
        let session = ForgeSession::new_scoped(
            ctx.owner.clone(),
            ctx.grant.root.clone(),
            ForgeRepository::new("github.com", "owner", "repo").unwrap(),
            "secret".into(),
            authority,
            ctx.pool.clone(),
        )
        .unwrap();
        assert!(matches!(
            session.conflict_context(),
            Err(ForgeError::Denied)
        ));
        assert_eq!(
            session
                .gh(
                    "login",
                    vec!["ok".into()],
                    None,
                    1024,
                    ProcessCancellation::default()
                )
                .await,
            Err(ForgeError::Denied)
        );
        let commands = ctx.commands.clone();
        REQUEST_CONTEXT
            .scope(ctx, async {
                assert_eq!(
                    session
                        .gh(
                            "login",
                            vec!["ok".into()],
                            None,
                            1024,
                            ProcessCancellation::default()
                        )
                        .await
                        .unwrap(),
                    "ok"
                );
                assert_eq!(commands.load(Ordering::Acquire), 1);
            })
            .await;
    }

    #[tokio::test]
    async fn forge_auth_session_requires_matching_request_operation() {
        use crate::services::git_forge::{ForgeError, ForgeRepository};
        let repository = ForgeRepository::new("github.com", "owner", "repo").unwrap();
        assert!(matches!(
            forge_auth_session(repository.clone(), "secret".into()),
            Err(ForgeError::Denied)
        ));
        let fixture = Fixture::new();
        let mut ctx = fixture.context(deny());
        REQUEST_CONTEXT
            .scope(ctx.clone(), async {
                assert!(matches!(
                    forge_auth_session(repository.clone(), "secret".into()),
                    Err(ForgeError::Denied)
                ));
            })
            .await;
        ctx.operation = "forge-auth".into();
        REQUEST_CONTEXT
            .scope(ctx, async {
                assert!(forge_auth_session(repository, "secret".into()).is_ok());
            })
            .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn github_auth_persists_only_success_for_authorized_owner() {
        use crate::routes::auth::AuthState;
        use crate::services::git_forge::ForgeRepository;
        use crate::services::user_secrets::UserSecretService;
        use std::os::unix::fs::PermissionsExt;

        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let users = UserService::new(&db);
        let owner = users
            .create_user_with_hash("forge-owner", "hash")
            .unwrap()
            .id;
        let other = users
            .create_user_with_hash("forge-other", "hash")
            .unwrap()
            .id;
        let auth = AuthState::new(db, "forge-auth-test-key-at-least-32-bytes".into()).unwrap();
        let secrets = UserSecretService::new("forge-auth-test-encryption-key");
        let state =
            super::super::GitRoutes::new(auth.clone()).with_user_secrets(Some(secrets.clone()));
        let fixture = Fixture::new();
        let executable = fixture.root.join("fake-gh");
        std::fs::write(&executable, "#!/bin/sh\nexit 1\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            let executable = executable.clone();
            Box::pin(async move {
                assert_eq!(
                    request.operation,
                    "forge.github.token-login:github.com/owner/repo"
                );
                let mut argv = vec![executable.to_string_lossy().into_owned()];
                argv.extend(request.arguments);
                Ok(ProcessRequest {
                    argv,
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 65536,
                })
            })
        });
        let mut ctx = fixture.context(authority);
        ctx.operation = "forge-auth".into();
        ctx.owner = owner.clone();
        ctx.grant.owner = owner.clone();
        let enterprise =
            ForgeRepository::new("github.enterprise.example", "owner", "repo").unwrap();
        let commands = ctx.commands.clone();
        let rejected = REQUEST_CONTEXT
            .scope(
                ctx.clone(),
                super::super::github_forge_auth(&state, enterprise, "enterprise-token".into()),
            )
            .await;
        assert!(rejected.is_err());
        assert_eq!(commands.load(Ordering::Acquire), 0);
        let repo = ForgeRepository::new("github.com", "owner", "repo").unwrap();
        // Cancellation of the request must prevent command admission and persistence.
        let mut cancelled_ctx = fixture.context(deny());
        cancelled_ctx.operation = "forge-auth".into();
        cancelled_ctx.owner = owner.clone();
        cancelled_ctx.grant.owner = owner.clone();
        let cancelled_commands = cancelled_ctx.commands.clone();
        cancelled_ctx.cancel.cancel();
        let cancelled = REQUEST_CONTEXT
            .scope(
                cancelled_ctx,
                super::super::github_forge_auth(&state, repo.clone(), "cancelled-token".into()),
            )
            .await;
        assert!(cancelled.is_err());
        assert_eq!(cancelled_commands.load(Ordering::Acquire), 0);
        let check = secrets.clone();
        let check_owner = owner.clone();
        auth.with_database(move |db| {
            assert_eq!(
                check.get_value(db, Some(&check_owner), "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        let reject_target: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(
                    request.operation,
                    "forge.github.token-login:github.com/owner/repo"
                );
                Err("destination denied".into())
            })
        });
        let mut denied_ctx = fixture.context(reject_target);
        denied_ctx.operation = "forge-auth".into();
        denied_ctx.owner = owner.clone();
        denied_ctx.grant.owner = owner.clone();
        let denied = REQUEST_CONTEXT
            .scope(
                denied_ctx,
                super::super::github_forge_auth(&state, repo.clone(), "denied-token".into()),
            )
            .await;
        assert!(denied.is_err());
        let check = secrets.clone();
        let check_owner = owner.clone();
        auth.with_database(move |db| {
            assert_eq!(
                check.get_value(db, Some(&check_owner), "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        let failed = REQUEST_CONTEXT
            .scope(
                ctx.clone(),
                super::super::github_forge_auth(&state, repo.clone(), "failed-token".into()),
            )
            .await
            .unwrap();
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["username"], serde_json::Value::Null);
        assert!(failed["error"].is_string());
        let check = secrets.clone();
        let check_owner = owner.clone();
        auth.with_database(move |db| {
            assert_eq!(
                check.get_value(db, Some(&check_owner), "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        std::fs::write(
            fixture.root.join("fake-gh"),
            "#!/bin/sh\nprintf '%s' '{\"login\":\"forge-user\"}'\n",
        )
        .unwrap();
        let success = REQUEST_CONTEXT
            .scope(
                ctx,
                super::super::github_forge_auth(&state, repo, "valid-token".into()),
            )
            .await
            .unwrap();
        assert_eq!(success["ok"], true);
        assert!(success.get("error").is_none());
        assert_eq!(success["username"], "forge-user");
        auth.with_database(move |db| {
            assert_eq!(
                secrets
                    .get_value(db, Some(&owner), "forge-token", "github.com")?
                    .as_deref(),
                Some("valid-token")
            );
            assert_eq!(
                secrets.get_value(db, Some(&other), "forge-token", "github.com")?,
                None
            );
            assert_eq!(
                secrets.get_value(db, None, "forge-token", "github.com")?,
                None
            );
            let stored: String =
                db.query_row("SELECT encrypted_value FROM user_secrets", [], |row| {
                    row.get(0)
                })?;
            assert!(!stored.contains("valid-token"));
            Ok(())
        })
        .await
        .unwrap();
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn github_login_cancelled_after_success_while_token_write_is_queued() {
        use crate::routes::auth::AuthState;
        use crate::services::git_forge::ForgeRepository;
        use crate::services::user_secrets::UserSecretService;
        use std::os::unix::fs::PermissionsExt;

        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let owner = UserService::new(&db)
            .create_user_with_hash("login-queue-owner", "hash")
            .unwrap()
            .id;
        let auth = AuthState::new(db, "forge-auth-test-key-at-least-32-bytes".into()).unwrap();
        let secrets = UserSecretService::new("forge-auth-test-encryption-key");
        let state =
            super::super::GitRoutes::new(auth.clone()).with_user_secrets(Some(secrets.clone()));
        let fixture = Fixture::new();
        let executable = fixture.root.join("fake-gh");
        std::fs::write(
            &executable,
            "#!/bin/sh\nprintf '%s' '{\"login\":\"forge-user\"}'\n",
        )
        .unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            let executable = executable.clone();
            Box::pin(async move {
                let mut argv = vec![executable.to_string_lossy().into_owned()];
                argv.extend(request.arguments);
                Ok(ProcessRequest {
                    argv,
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 65536,
                })
            })
        });
        let mut ctx = fixture.context(authority);
        ctx.operation = "forge-auth".into();
        ctx.owner = owner.clone();
        ctx.grant.owner = owner.clone();
        let cancel = ctx.cancel.clone();
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let blocked_auth = auth.clone();
        let blocker = tokio::spawn(async move {
            blocked_auth
                .with_database(move |_| {
                    let _ = entered_tx.send(());
                    release_rx.recv().unwrap();
                    Ok(())
                })
                .await
                .unwrap();
        });
        entered_rx.await.unwrap();
        let repo = ForgeRepository::new("github.com", "owner", "repo").unwrap();
        let login = tokio::spawn(async move {
            REQUEST_CONTEXT
                .scope(
                    ctx,
                    super::super::github_forge_auth(&state, repo, "queued-token".into()),
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), async {
            while auth.worker().queued_jobs() == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("successful login must queue its secret write");
        cancel.cancel();
        release_tx.send(()).unwrap();
        blocker.await.unwrap();
        assert!(login.await.unwrap().is_err());
        auth.with_database(move |db| {
            assert_eq!(
                secrets.get_value(db, Some(&owner), "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn github_token_write_cancelled_while_queued_is_not_persisted() {
        use crate::execution::process_runner::ProcessCancellation;
        use crate::routes::auth::AuthState;
        use crate::services::user_secrets::UserSecretService;
        use std::future::Future;
        use std::task::{Context, Poll, Waker};

        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let owner = UserService::new(&db)
            .create_user_with_hash("queued-owner", "hash")
            .unwrap()
            .id;
        let auth = AuthState::new(db, "forge-auth-test-key-at-least-32-bytes".into()).unwrap();
        let secrets = UserSecretService::new("forge-auth-test-encryption-key");
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let blocked_auth = auth.clone();
        let blocker = tokio::spawn(async move {
            blocked_auth
                .with_database(move |_| {
                    let _ = entered_tx.send(());
                    release_rx.recv().unwrap();
                    Ok(())
                })
                .await
                .unwrap();
        });
        entered_rx.await.unwrap();
        let cancellation = ProcessCancellation::default();
        let write = super::super::save_github_token(
            &auth,
            secrets.clone(),
            owner.clone(),
            "queued-token".into(),
            cancellation.clone(),
        );
        tokio::pin!(write);
        // A single poll admits the write to the worker mailbox while it is blocked.
        let mut context = Context::from_waker(Waker::noop());
        assert!(matches!(write.as_mut().poll(&mut context), Poll::Pending));
        cancellation.cancel();
        release_tx.send(()).unwrap();
        blocker.await.unwrap();
        assert!(write.await.is_err());
        auth.with_database(move |db| {
            assert_eq!(
                secrets.get_value(db, Some(&owner), "forge-token", "github.com")?,
                None
            );
            Ok(())
        })
        .await
        .unwrap();
        auth.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn forge_auth_owner_rejects_unscoped_wrong_operation_and_owner() {
        use crate::services::git_forge::ForgeError;
        assert_eq!(forge_auth_owner(), Err(ForgeError::Denied));
        let fixture = Fixture::new();
        let mut ctx = fixture.context(deny());
        REQUEST_CONTEXT
            .scope(ctx.clone(), async {
                assert_eq!(forge_auth_owner(), Err(ForgeError::Denied));
            })
            .await;
        ctx.operation = "forge-auth".into();
        let expected = ctx.owner.clone();
        REQUEST_CONTEXT
            .scope(ctx.clone(), async {
                assert_eq!(forge_auth_owner(), Ok(expected));
            })
            .await;
        ctx.grant.owner = "different-owner".into();
        REQUEST_CONTEXT
            .scope(ctx, async {
                assert_eq!(forge_auth_owner(), Err(ForgeError::Denied));
            })
            .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn scoped_forge_maps_output_exhaustion_and_rejects_rewritten_token() {
        use crate::services::git_forge::{ForgeError, ForgeRepository, ForgeSession};
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority.clone());
        ctx.output_bytes
            .store(2 * 1024 * 1024 - 1, Ordering::Release);
        let session = ForgeSession::new_scoped(
            ctx.owner.clone(),
            ctx.grant.root.clone(),
            ForgeRepository::new("github.com", "owner", "repo").unwrap(),
            "secret".into(),
            authority,
            ctx.pool.clone(),
        )
        .unwrap();
        REQUEST_CONTEXT
            .scope(ctx, async {
                assert_eq!(
                    session
                        .gh(
                            "login",
                            vec!["too long".into()],
                            None,
                            1024,
                            ProcessCancellation::default()
                        )
                        .await,
                    Err(ForgeError::OutputLimit)
                );
                assert_eq!(
                    session
                        .gh(
                            "login",
                            vec!["x".into()],
                            None,
                            1024,
                            ProcessCancellation::default()
                        )
                        .await,
                    Err(ForgeError::OutputLimit)
                );
            })
            .await;

        let rewrite: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                let mut environment = request.environment;
                environment.insert("GH_TOKEN".into(), "different".into());
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(rewrite.clone());
        let session = ForgeSession::new_scoped(
            ctx.owner.clone(),
            ctx.grant.root.clone(),
            ForgeRepository::new("github.com", "owner", "repo").unwrap(),
            "secret".into(),
            rewrite,
            ctx.pool.clone(),
        )
        .unwrap();
        REQUEST_CONTEXT
            .scope(ctx, async {
                assert_eq!(
                    session
                        .gh(
                            "login",
                            vec!["ok".into()],
                            None,
                            1024,
                            ProcessCancellation::default()
                        )
                        .await,
                    Err(ForgeError::Denied)
                );
            })
            .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn specialized_entry_requires_matching_request_scope() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(request.operation, "forge.github.login:owner/repo");
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority);
        let request = GitCommandRequest {
            owner: ctx.owner.clone(),
            operation: "forge.github.login:owner/repo".into(),
            program: "printf".into(),
            cwd: ctx.grant.root.clone(),
            arguments: vec!["ok".into()],
            environment: HashMap::new(),
            input: None,
        };
        let denied = execute_scoped_specialized(
            request.clone(),
            1024,
            ProcessCancellation::default(),
            |_| true,
        )
        .await;
        assert_eq!(
            denied.err().unwrap().kind(),
            io::ErrorKind::PermissionDenied
        );
        let mut wrong_owner = request.clone();
        wrong_owner.owner = "other-owner".into();
        let counts = ctx.commands.clone();
        REQUEST_CONTEXT
            .scope(ctx, async {
                let denied = execute_scoped_specialized(
                    wrong_owner,
                    1024,
                    ProcessCancellation::default(),
                    |_| true,
                )
                .await;
                assert_eq!(
                    denied.err().unwrap().kind(),
                    io::ErrorKind::PermissionDenied
                );
                assert_eq!(counts.load(Ordering::Acquire), 0);
                let output = execute_scoped_specialized(
                    request,
                    1024,
                    ProcessCancellation::default(),
                    |_| true,
                )
                .await
                .unwrap();
                assert_eq!(output.stdout, b"ok");
                assert_eq!(counts.load(Ordering::Acquire), 1);
            })
            .await;
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn specialized_forge_execution_charges_shared_output_budget() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority);
        ctx.output_bytes.store(OUTPUT_BUDGET - 4, Ordering::Release);
        let mut command = Command::new("printf");
        command.args(["abcdefgh"]);
        let error = command
            .output_scoped_with(&ctx, "forge.github.login:owner/repo", 1024, |_| true)
            .await
            .err()
            .unwrap();
        assert!(error.to_string().contains("output exceeds byte limit"));
        assert!(error.get_ref().is_some_and(|e| e.is::<OutputLimitError>()));
        assert_eq!(ctx.output_bytes.load(Ordering::Acquire), OUTPUT_BUDGET);
        let error = command
            .output_scoped_with(&ctx, "forge.github.login:owner/repo", 1024, |_| true)
            .await
            .err()
            .unwrap();
        assert!(error.to_string().contains("output budget exhausted"));
        assert!(error.get_ref().is_some_and(|e| e.is::<OutputLimitError>()));
        assert_eq!(ctx.commands.load(Ordering::Acquire), 1);
        ctx.output_bytes.store(0, Ordering::Release);
        ctx.commands.store(128, Ordering::Release);
        let error = command
            .output_scoped_with(&ctx, "forge.github.login:owner/repo", 1024, |_| true)
            .await
            .err()
            .unwrap();
        assert!(!error.get_ref().is_some_and(|e| e.is::<OutputLimitError>()));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn specialized_scoped_grant_checks_forge_operation_and_environment() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(request.operation, "forge.github.login:owner/repo");
                let mut environment = request.environment;
                environment.insert("GH_REPO".into(), "hostile/repo".into());
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority);
        let mut command = Command::new("sh");
        command.args(["-c", ": > should-not-exist"]);
        command.env("GH_TOKEN", "test-token");
        let result = command
            .output_scoped_with(&ctx, "forge.github.login:owner/repo", 1024, |grant| {
                crate::services::git_forge::forge_environment_allowed(
                    "github",
                    "github.com",
                    &command.environment,
                    &grant.environment,
                )
            })
            .await;
        assert_eq!(
            result.err().unwrap().kind(),
            io::ErrorKind::PermissionDenied
        );
        assert!(!fixture.root.join("should-not-exist").exists());
        assert_eq!(ctx.commands.load(Ordering::Acquire), 1);
    }

    #[tokio::test]
    async fn forge_command_authority_errors_do_not_expose_credentials() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move { Err(format!("denied {:?}", request.environment)) })
        });
        let ctx = fixture.context(authority);
        let mut command = Command::new("gh");
        command.env("GH_TOKEN", "private-forge-token");
        let error = command
            .output_scoped_with(&ctx, "forge.github.login:owner/repo", 1024, |_| true)
            .await
            .err()
            .unwrap();
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "Forge command authorization denied");
        assert!(!error.to_string().contains("private-forge-token"));
        assert_eq!(std::fs::read_dir(&fixture.root).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn scoped_command_forwards_both_cancellation_sources() {
        for cancel_request in [false, true] {
            let fixture = Fixture::new();
            let started = Arc::new(AtomicBool::new(false));
            let marker = started.clone();
            let authority: GitCommandAuthority = Arc::new(move |_, _| {
                let marker = marker.clone();
                Box::pin(async move {
                    marker.store(true, Ordering::Release);
                    std::future::pending().await
                })
            });
            let ctx = fixture.context(authority);
            let request_cancel = ctx.cancel.clone();
            let caller_cancel = ProcessCancellation::default();
            let signal = caller_cancel.clone();
            let task = tokio::spawn(async move {
                Command::new("gh")
                    .output_scoped_with_cancellation(
                        &ctx,
                        caller_cancel,
                        "forge.github.login:owner/repo",
                        1024,
                        |_| true,
                    )
                    .await
                    .err()
                    .unwrap()
            });
            tokio::time::timeout(Duration::from_secs(2), async {
                while !started.load(Ordering::Acquire) {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            if cancel_request {
                request_cancel.cancel();
            } else {
                signal.cancel();
            }
            let error = tokio::time::timeout(Duration::from_secs(2), task)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(error.kind(), io::ErrorKind::Interrupted);
            assert_eq!(std::fs::read_dir(&fixture.root).unwrap().count(), 0);
        }
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn scoped_cancellation_reaps_running_process_and_releases_capture() {
        for cancel_request in [false, true] {
            let fixture = Fixture::new();
            let authority: GitCommandAuthority = Arc::new(|request, _| {
                Box::pin(async move {
                    Ok(ProcessRequest {
                        argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                        cwd: request.cwd,
                        environment: request.environment,
                        input: request.input,
                        timeout: Duration::from_secs(2),
                        output_limit: 1024,
                    })
                })
            });
            let ctx = fixture.context(authority);
            let request_cancel = ctx.cancel.clone();
            let capture_active = ctx.capture_active.clone();
            let caller_cancel = ProcessCancellation::default();
            let signal = caller_cancel.clone();
            let marker = fixture.root.join("child-pid");
            let task = tokio::spawn(async move {
                let mut command = Command::new("sh");
                command.args(["-c", "echo $$ > child-pid; exec /bin/sleep 20"]);
                command
                    .output_scoped_with_cancellation(
                        &ctx,
                        caller_cancel,
                        "forge.github.login:owner/repo",
                        1024,
                        |_| true,
                    )
                    .await
                    .err()
                    .unwrap()
            });
            let pid: u32 = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    if let Ok(contents) = std::fs::read_to_string(&marker)
                        && let Ok(pid) = contents.trim().parse()
                    {
                        break pid;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            if cancel_request {
                request_cancel.cancel();
            } else {
                signal.cancel();
            }
            let error = tokio::time::timeout(Duration::from_secs(5), task)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(error.kind(), io::ErrorKind::Interrupted);
            assert!(
                !std::path::Path::new(&format!("/proc/{pid}")).exists(),
                "child was not reaped"
            );
            assert!(!capture_active.load(Ordering::Acquire));
        }
    }

    #[tokio::test]
    async fn cancellation_interrupts_pending_command_authorization() {
        let fixture = Fixture::new();
        let started = Arc::new(AtomicBool::new(false));
        let marker = started.clone();
        let authority: GitCommandAuthority = Arc::new(move |_, _| {
            let marker = marker.clone();
            Box::pin(async move {
                marker.store(true, Ordering::Release);
                std::future::pending().await
            })
        });
        let ctx = fixture.context(authority);
        let cancel = ctx.cancel.clone();
        let task = tokio::spawn(scoped(ctx, || Command::new("git").output().err().unwrap()));
        tokio::time::timeout(Duration::from_secs(2), async {
            while !started.load(Ordering::Acquire) {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        cancel.cancel();
        let error = tokio::time::timeout(Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert_eq!(std::fs::read_dir(&fixture.root).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn zero_output_grant_is_rejected_before_process_start() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 0,
                })
            })
        });
        let error = scoped(fixture.context(authority), || {
            Command::new("sh")
                .args(["-c", ": > should-not-exist"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert!(!fixture.root.join("should-not-exist").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_during_authorization_reports_interrupted() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, cancel| {
            Box::pin(async move {
                cancel.cancel();
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 1024,
                })
            })
        });
        let error = scoped(fixture.context(authority), || {
            Command::new("sh")
                .args(["-c", ": > should-not-exist"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert!(!fixture.root.join("should-not-exist").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn command_rejects_changed_or_missing_requested_environment() {
        for replacement in [None, Some("different")] {
            let fixture = Fixture::new();
            let authority: GitCommandAuthority = Arc::new(move |request, _| {
                Box::pin(async move {
                    let mut environment = HashMap::new();
                    if let Some(value) = replacement {
                        environment.insert("REQUESTED_VALUE".into(), value.into());
                    }
                    Ok(ProcessRequest {
                        argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                        cwd: request.cwd,
                        environment,
                        input: request.input,
                        timeout: Duration::from_secs(1),
                        output_limit: 1024,
                    })
                })
            });
            let error = scoped(fixture.context(authority), || {
                Command::new("sh")
                    .args(["-c", ": > should-not-exist"])
                    .env("REQUESTED_VALUE", "expected")
                    .output()
                    .err()
                    .unwrap()
            })
            .await;
            assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
            assert!(!fixture.root.join("should-not-exist").exists());
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn truncated_command_capture_is_charged_to_request_budget() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/printf".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: request.input,
                    timeout: Duration::from_secs(1),
                    output_limit: 4,
                })
            })
        });
        let ctx = fixture.context(authority);
        let charged = ctx.output_bytes.clone();
        let error = scoped(ctx, || {
            Command::new("printf")
                .args(["abcdefgh"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert!(error.to_string().contains("output exceeds byte limit"));
        assert_eq!(charged.load(Ordering::Acquire), 4);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_capture_accounting_worktree_limit() {
        let fixture = Fixture::new();
        let file = std::fs::File::create(fixture.root.join("medium")).unwrap();
        file.set_len(512 * 1024 + 1).unwrap();
        let ctx = fixture.context(deny());
        let charged = ctx.output_bytes.clone();
        let root = fixture.root.to_string_lossy().into_owned();
        let error = scoped(ctx, move || {
            read_worktree_file(&root, "medium").unwrap_err()
        })
        .await;
        assert!(error.to_string().contains("exceeds byte limit"));
        assert_eq!(charged.load(Ordering::Acquire), 512 * 1024 + 1);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn failed_capture_accounting_timeout_and_cancellation() {
        for cancel in [false, true] {
            let fixture = Fixture::new();
            let authority: GitCommandAuthority = Arc::new(move |request, _| {
                Box::pin(async move {
                    Ok(ProcessRequest {
                        argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                        cwd: request.cwd,
                        environment: HashMap::new(),
                        input: request.input,
                        timeout: Duration::from_millis(if cancel { 2000 } else { 500 }),
                        output_limit: 1024,
                    })
                })
            });
            let ctx = fixture.context(authority);
            let charged = ctx.output_bytes.clone();
            let cancellation = ctx.cancel.clone();
            let ready = fixture.root.join("ready");
            let task = tokio::spawn(scoped(ctx, || {
                Command::new("sh")
                    .args(["-c", "printf abc; : > ready; exec /bin/sleep 5"])
                    .output()
                    .err()
                    .unwrap()
            }));
            if cancel {
                tokio::time::timeout(Duration::from_secs(1), async {
                    while !ready.exists() {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await
                .unwrap();
                cancellation.cancel();
            }
            let error = task.await.unwrap();
            assert_eq!(
                error.kind(),
                if cancel {
                    io::ErrorKind::Interrupted
                } else {
                    io::ErrorKind::TimedOut
                }
            );
            assert_eq!(charged.load(Ordering::Acquire), 3);
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn remaining_budget_bounds_process_and_worktree_capture() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: request.input,
                    timeout: Duration::from_secs(2),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority);
        let charged = ctx.output_bytes.clone();
        charge_output(&ctx, OUTPUT_BUDGET - 3).unwrap();
        let error = scoped(ctx.clone(), || {
            Command::new("sh")
                .args(["-c", "printf abcdef"])
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert!(error.to_string().contains("byte limit"));
        assert_eq!(charged.load(Ordering::Acquire), OUTPUT_BUDGET);
        charged.store(OUTPUT_BUDGET - 3, Ordering::Release);
        std::fs::write(fixture.root.join("bounded"), b"abcdef").unwrap();
        let root = fixture.root.to_string_lossy().into_owned();
        let error = scoped(ctx.clone(), move || {
            read_worktree_file(&root, "bounded").unwrap_err()
        })
        .await;
        assert!(error.to_string().contains("output budget"));
        assert_eq!(charged.load(Ordering::Acquire), OUTPUT_BUDGET);
        charged.store(0, Ordering::Release);
        let result = scoped(ctx, || {
            Command::new("sh")
                .args(["-c", "printf ok"])
                .output()
                .unwrap()
                .stdout
        })
        .await;
        assert_eq!(result, b"ok");
        assert_eq!(charged.load(Ordering::Acquire), 2);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn concurrent_capture_waits_and_observes_cancellation() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv: [vec!["/bin/sh".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: HashMap::new(),
                    input: request.input,
                    timeout: Duration::from_secs(2),
                    output_limit: 1024,
                })
            })
        });
        let ctx = fixture.context(authority);
        let ready = fixture.root.join("ready");
        let first_ctx = ctx.clone();
        let first = tokio::spawn(scoped(first_ctx, || {
            Command::new("sh")
                .args(["-c", "printf abc; : > ready; exec /bin/sleep 1"])
                .output()
                .err()
                .unwrap()
        }));
        tokio::time::timeout(Duration::from_secs(1), async {
            while !ready.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        let second_ctx = ctx.clone();
        let second = tokio::spawn(scoped(second_ctx, || {
            Command::new("sh")
                .args(["-c", "printf def; : > second"])
                .output()
                .err()
                .unwrap()
        }));
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!fixture.root.join("second").exists());
        ctx.cancel.cancel();
        assert_eq!(second.await.unwrap().kind(), io::ErrorKind::Interrupted);
        assert_eq!(first.await.unwrap().kind(), io::ErrorKind::Interrupted);
        assert_eq!(ctx.output_bytes.load(Ordering::Acquire), 3);
        assert!(!fixture.root.join("second").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn batch_reads_use_authority_and_fall_back_without_raising_limits() {
        let fixture = Fixture::new();
        let run = |args: &[&str]| {
            let output = std::process::Command::new("/usr/bin/git")
                .current_dir(&fixture.root)
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        run(&["init", "-q"]);
        std::fs::write(fixture.root.join("a"), b"one\r\n").unwrap();
        std::fs::write(fixture.root.join("b"), b"two\n").unwrap();
        run(&["add", "a", "b"]);
        run(&[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "-qm",
            "fixture",
        ]);
        let calls = Arc::new(std::sync::Mutex::new(Vec::<Vec<String>>::new()));
        let deny_batch = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let authority: GitCommandAuthority = {
            let calls = calls.clone();
            let deny_batch = deny_batch.clone();
            Arc::new(move |request, _| {
                calls.lock().unwrap().push(request.arguments.clone());
                let deny = deny_batch.load(Ordering::SeqCst)
                    && request.arguments.first().is_some_and(|s| s == "cat-file");
                Box::pin(async move {
                    if deny {
                        return Err("batch denied".into());
                    }
                    Ok(ProcessRequest {
                        argv: [vec!["/usr/bin/git".into()], request.arguments].concat(),
                        cwd: request.cwd,
                        environment: request.environment,
                        input: request.input,
                        timeout: Duration::from_secs(1),
                        output_limit: 512 * 1024,
                    })
                })
            })
        };
        let root = fixture.root.to_string_lossy().into_owned();
        let specs = vec![
            "HEAD:a".to_owned(),
            "HEAD:b".to_owned(),
            "HEAD:missing".to_owned(),
        ];
        let values = scoped(fixture.context(authority.clone()), {
            let root = root.clone();
            let specs = specs.clone();
            move || super::super::files_at_refs(&root, &specs)
        })
        .await;
        assert_eq!(values["HEAD:a"], "one");
        assert_eq!(values["HEAD:b"], "two");
        assert_eq!(values["HEAD:missing"], "");
        assert_eq!(calls.lock().unwrap().len(), 1);
        deny_batch.store(true, Ordering::SeqCst);
        let fallback = scoped(fixture.context(authority.clone()), {
            let root = root.clone();
            let specs = specs.clone();
            move || super::super::files_at_refs(&root, &specs)
        })
        .await;
        assert_eq!(fallback, values);
        assert_eq!(calls.lock().unwrap().len(), 5);
        let ctx = fixture.context(authority);
        ctx.cancel.cancel();
        let before = calls.lock().unwrap().len();
        scoped(ctx, move || super::super::files_at_refs(&root, &specs)).await;
        assert_eq!(calls.lock().unwrap().len(), before);
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
    async fn command_timeout_narrows_a_wider_authorized_grant() {
        let fixture = Fixture::new();
        let authority: GitCommandAuthority = Arc::new(|request, _| {
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
        let error = scoped(fixture.context(authority), || {
            Command::new("sh")
                .args(["-c", "exec sleep 1"])
                .timeout(Duration::from_millis(100))
                .output()
                .err()
                .unwrap()
        })
        .await;
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
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
    async fn commit_generation_uses_scoped_diff_and_user_model() {
        use crate::services::users::{Patch, UserSettingsPatch};
        use axum::{Json, routing::post};
        let fixture = Fixture::new();
        for args in [
            vec!["init", "-q"],
            vec!["config", "user.name", "Test"],
            vec!["config", "user.email", "test@example.invalid"],
        ] {
            assert!(
                std::process::Command::new("git")
                    .current_dir(&fixture.root)
                    .args(args)
                    .status()
                    .unwrap()
                    .success()
            );
        }
        std::fs::write(fixture.root.join("file"), "before\n").unwrap();
        assert!(
            std::process::Command::new("git")
                .current_dir(&fixture.root)
                .args(["add", "file"])
                .status()
                .unwrap()
                .success()
        );
        assert!(
            std::process::Command::new("git")
                .current_dir(&fixture.root)
                .args(["-c", "core.hooksPath=/dev/null", "commit", "-qm", "initial"])
                .status()
                .unwrap()
                .success()
        );
        let (tx, mut rx) = tokio::sync::mpsc::channel::<Value>(1);
        let model = server(axum::Router::new().route("/chat/completions", post(move |Json(body): Json<Value>| {
            let tx = tx.clone();
            async move {
                let hold = body["messages"][1]["content"].as_str().unwrap().contains("cancel-fixture");
                tx.send(body).await.unwrap();
                if hold { std::future::pending::<()>().await; }
                ([("content-type", "text/event-stream")], "data: {\"choices\":[{\"delta\":{\"content\":\"Update file\"}}]}\n\ndata: [DONE]\n\n")
            }
        }))).await;
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let service = UserService::new(&db);
        let user = service
            .create_user_with_hash("git-generation", "hash")
            .unwrap();
        let mut keys = std::collections::BTreeMap::new();
        keys.insert("OPENAI_BASE_URL".to_string(), model.base.clone());
        keys.insert("OPENAI_API_KEY".to_string(), "fixture-key".to_string());
        service
            .update_settings(
                &user.id,
                UserSettingsPatch {
                    api_keys: Some(keys),
                    selected_model: Patch::Set(Some("fixture-model".into())),
                    ..Default::default()
                },
            )
            .unwrap();
        let secret = "git-generation-secret-at-least-thirty-two-bytes";
        let token = sign_auth_token(
            &AuthUser {
                id: user.id.clone(),
                username: user.username,
            },
            secret,
        )
        .unwrap();
        let auth = super::super::auth::AuthState::new(db, secret.into()).unwrap();
        let root = fixture.root.clone();
        let commands: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                if request.program != "git"
                    || !matches!(
                        request.arguments.first().map(String::as_str),
                        Some("rev-parse" | "diff")
                    )
                {
                    return Err("command denied".into());
                }
                Ok(ProcessRequest {
                    argv: [vec!["/usr/bin/git".into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment: request.environment,
                    input: request.input,
                    timeout: Duration::from_secs(3),
                    output_limit: 512 * 1024,
                })
            })
        });
        let captured_cancel = Arc::new(std::sync::Mutex::new(None::<ProcessCancellation>));
        let recorded_cancel = captured_cancel.clone();
        let authority: GitAuthority = Arc::new(move |request, cancel| {
            *recorded_cancel.lock().unwrap() = Some(cancel);
            let root = root.clone();
            let command_authority = commands.clone();
            Box::pin(async move {
                Ok(GitGrant {
                    owner: request.owner,
                    root,
                    command_authority,
                    allow_worktree_reads: false,
                })
            })
        });
        let gateway = server(
            GitRoutes::new(auth.clone())
                .with_authority(authority)
                .router(),
        )
        .await;
        let client = reqwest::Client::new();
        let request = || {
            client
                .post(format!("{}/api/git/generate-commit-message", gateway.base))
                .bearer_auth(&token)
                .json(&json!({"cwd":fixture.root}))
        };
        assert_eq!(request().send().await.unwrap().status(), 400);
        assert!(rx.try_recv().is_err());
        std::fs::write(fixture.root.join("file"), "after\n").unwrap();
        let response = request().send().await.unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(
            response.json::<Value>().await.unwrap(),
            json!({"message":"Update file"})
        );
        let body = rx.recv().await.unwrap();
        assert_eq!(body["model"], "fixture-model");
        assert!(
            body["messages"][1]["content"]
                .as_str()
                .unwrap()
                .contains("+after")
        );
        assert_eq!(
            client
                .post(format!("{}/api/git/generate-commit-message", gateway.base))
                .json(&json!({"cwd":fixture.root}))
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        // An unborn branch has no HEAD; staged changes still form the prompt.
        assert!(
            std::process::Command::new("git")
                .current_dir(&fixture.root)
                .args(["symbolic-ref", "HEAD", "refs/heads/unborn-fixture"])
                .status()
                .unwrap()
                .success()
        );
        std::fs::write(fixture.root.join("file"), "initial-staged-fixture\n").unwrap();
        assert!(
            std::process::Command::new("git")
                .current_dir(&fixture.root)
                .args(["add", "file"])
                .status()
                .unwrap()
                .success()
        );
        let response = request().send().await.unwrap();
        assert_eq!(response.status(), 200);
        let body = rx.recv().await.unwrap();
        assert!(
            body["messages"][1]["content"]
                .as_str()
                .unwrap()
                .contains("+initial-staged-fixture")
        );

        std::fs::write(fixture.root.join("file"), "cancel-fixture\n").unwrap();
        let pending_request = request().send();
        tokio::pin!(pending_request);
        tokio::select! {
            result = &mut pending_request => panic!("request completed before cancellation: {result:?}"),
            body = rx.recv() => assert!(body.is_some()),
            _ = tokio::time::sleep(Duration::from_secs(5)) => panic!("model was not called"),
        }
        captured_cancel.lock().unwrap().as_ref().unwrap().cancel();
        let cancelled = tokio::time::timeout(Duration::from_secs(3), pending_request)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cancelled.status(), 502);
        auth.shutdown().await.unwrap();
    }

    #[cfg(unix)]
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
        let denied_command = Arc::new(AtomicUsize::new(0));
        let denial = denied_command.clone();
        let diff_commands = Arc::new(AtomicUsize::new(0));
        let diffs = diff_commands.clone();
        let gh_commands = Arc::new(AtomicUsize::new(0));
        let gh_calls = gh_commands.clone();
        let gh_enabled = Arc::new(AtomicUsize::new(0));
        let enabled = gh_enabled.clone();
        let gh_fixture = fixture.root.join(".git/fixture-gh");
        let command_authority: GitCommandAuthority = Arc::new(move |request, _| {
            let gh_executable = gh_fixture.clone();
            let allow_fixture_gh = enabled.load(Ordering::SeqCst) == 1;
            recorded.fetch_add(1, Ordering::SeqCst);
            if request.program == "gh" {
                gh_calls.fetch_add(1, Ordering::SeqCst);
            }
            let command = request.arguments.first().map(String::as_str);
            if command == Some("diff") {
                diffs.fetch_add(1, Ordering::SeqCst);
            }
            let denied = matches!(
                (denial.load(Ordering::SeqCst), command),
                (1, Some("status")) | (2, Some("diff"))
            );
            let fail_worktree_diff = denial.load(Ordering::SeqCst) == 3
                && command == Some("diff")
                && !request.arguments.iter().any(|arg| arg == "--cached");
            let fail_rev_list = denial.load(Ordering::SeqCst) == 4 && command == Some("rev-list");
            let fail_head_diff = denial.load(Ordering::SeqCst) == 5
                && request.arguments == ["diff", "--numstat", "-z", "HEAD"];
            Box::pin(async move {
                if denied {
                    return Err("Fixture command denied".into());
                }
                if request.program == "gh" && allow_fixture_gh {
                    return Ok(ProcessRequest {
                        argv: [
                            vec![gh_executable.to_string_lossy().into_owned()],
                            request.arguments,
                        ]
                        .concat(),
                        cwd: request.cwd,
                        environment: request.environment,
                        input: None,
                        // A wider grant is safely narrowed for the gh version probe.
                        timeout: Duration::from_secs(10),
                        output_limit: 65536,
                    });
                }
                if request.program != "git" {
                    return Err("Only fixture-local Git is authorized".into());
                }
                if !matches!(
                    request.arguments.first().map(String::as_str),
                    Some(
                        "init"
                            | "add"
                            | "rev-parse"
                            | "rev-list"
                            | "merge-base"
                            | "for-each-ref"
                            | "status"
                            | "show"
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
                // Keep pre-init discovery inside the fixture, not its parent repository.
                environment.insert(
                    "GIT_CEILING_DIRECTORIES".into(),
                    request.cwd.parent().unwrap().to_string_lossy().into_owned(),
                );
                // Keep the authorized arguments unchanged so the execution guard
                // admits a real process that exits unsuccessfully.
                let executable = if fail_worktree_diff || fail_rev_list || fail_head_diff {
                    "/usr/bin/false"
                } else {
                    "/usr/bin/git"
                };
                Ok(ProcessRequest {
                    argv: [vec![executable.into()], request.arguments].concat(),
                    cwd: request.cwd,
                    environment,
                    input: None,
                    timeout: Duration::from_secs(1),
                    output_limit: 65536,
                })
            })
        });
        let root = fixture.root.clone();
        let reads_enabled = Arc::new(AtomicUsize::new(0));
        let reads_grant = reads_enabled.clone();
        let authority: GitAuthority = Arc::new(move |request, _| {
            let root = root.clone();
            let command_authority = command_authority.clone();
            let allow_worktree_reads = reads_grant.load(Ordering::SeqCst) == 1;
            Box::pin(async move {
                Ok(GitGrant {
                    owner: request.owner,
                    root,
                    command_authority,
                    allow_worktree_reads,
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
        let empty = call("status", &fixture.root).await.unwrap();
        assert_eq!(empty.status(), 200);
        assert_eq!(
            empty.json::<Value>().await.unwrap(),
            json!({
                "branch": null,
                "hasWorkingTreeChanges": false,
                "index": { "files": [], "insertions": 0, "deletions": 0 },
                "workingTree": { "files": [], "insertions": 0, "deletions": 0 },
                "hasUpstream": false,
                "aheadCount": 0,
                "behindCount": 0,
                "pr": null,
                "ghAvailable": false,
                "prProvider": "none",
                "remoteUrl": null,
            })
        );
        assert_eq!(call("init", &fixture.root).await.unwrap().status(), 200);
        assert!(fixture.root.join(".git/HEAD").is_file());
        denied_command.store(2, Ordering::SeqCst);
        assert_eq!(call("status", &fixture.root).await.unwrap().status(), 200);
        assert_eq!(diff_commands.load(Ordering::SeqCst), 0);
        std::fs::write(fixture.root.join("new.txt"), "owned fixture\n").unwrap();
        std::fs::create_dir(fixture.root.join("nested")).unwrap();
        std::fs::write(fixture.root.join("nested/one.txt"), "one\n").unwrap();
        std::fs::write(fixture.root.join("nested/two.txt"), "two\n").unwrap();
        let response = call("status", &fixture.root).await.unwrap();
        assert_eq!(response.status(), 200);
        let value: Value = response.json().await.unwrap();
        assert_eq!(value["hasWorkingTreeChanges"], true);
        let paths: Vec<_> = value["workingTree"]["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|file| file["path"].as_str().unwrap())
            .collect();
        assert_eq!(paths, vec!["nested/one.txt", "nested/two.txt", "new.txt"]);
        assert_eq!(diff_commands.load(Ordering::SeqCst), 0);
        denied_command.store(1, Ordering::SeqCst);
        assert_eq!(call("status", &fixture.root).await.unwrap().status(), 500);
        denied_command.store(2, Ordering::SeqCst);
        assert_eq!(value["ghAvailable"], false);
        assert_eq!(gh_commands.load(Ordering::SeqCst), 0);
        // An unborn HEAD has no current branch in the status contract, even
        // when a different branch is requested for pull-request lookup.
        let requested = client
            .post(format!("{}/api/git/status", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd":fixture.root,"branch":"other-branch"}))
            .send()
            .await
            .unwrap();
        assert_eq!(requested.status(), 200);
        let requested: Value = requested.json().await.unwrap();
        assert_eq!(requested["branch"], value["branch"]);
        assert!(requested["branch"].is_null());
        assert_eq!(requested["hasUpstream"], value["hasUpstream"]);
        assert_eq!(gh_commands.load(Ordering::SeqCst), 1);
        assert_eq!(call("stage", &fixture.root).await.unwrap().status(), 200);
        assert_eq!(call("status", &fixture.root).await.unwrap().status(), 500);
        assert_eq!(diff_commands.load(Ordering::SeqCst), 1);
        denied_command.store(0, Ordering::SeqCst);
        let staged: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(staged["hasWorkingTreeChanges"], true);
        assert!(
            staged["workingTree"]["files"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(staged["index"]["files"].as_array().unwrap().len(), 3);
        std::fs::write(fixture.root.join("new.txt"), "owned fixture\nchanged\n").unwrap();
        denied_command.store(3, Ordering::SeqCst);
        assert_eq!(call("status", &fixture.root).await.unwrap().status(), 500);
        denied_command.store(0, Ordering::SeqCst);
        let mixed: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(mixed["index"]["files"].as_array().unwrap().len(), 3);
        assert_eq!(mixed["workingTree"]["files"].as_array().unwrap().len(), 1);
        assert_eq!(mixed["workingTree"]["files"][0]["path"], "new.txt");
        assert_eq!(mixed["workingTree"]["files"][0]["insertions"], 1);
        // Build a local diverged upstream, with no network or external Git configuration.
        let git = |args: &[&str]| {
            let output = std::process::Command::new("/usr/bin/git")
                .current_dir(&fixture.root)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_GLOBAL", "/dev/null")
                .args([
                    "-c",
                    "user.name=Fixture",
                    "-c",
                    "user.email=fixture@example.invalid",
                ])
                .args(args)
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "fixture git failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8(output.stdout).unwrap().trim().to_string()
        };
        git(&["commit", "-m", "base"]);
        git(&["mv", "nested/one.txt", "nested/renamed.txt"]);
        reads_enabled.store(1, Ordering::SeqCst);
        let diffs: Value = client
            .post(format!("{}/api/git/file-diffs", server.base))
            .bearer_auth(&token)
            .json(
                &json!({"cwd": fixture.root, "paths": ["/nested/renamed.txt/", "not-changed.txt"]}),
            )
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            diffs,
            json!({"files": [{"path": "nested/renamed.txt", "original": "one", "modified": "one\n", "status": "R"}]})
        );
        git(&["reset", "--hard", "HEAD"]);
        std::fs::write(fixture.root.join("new.txt"), "modified fixture\n").unwrap();
        std::fs::remove_file(fixture.root.join("nested/one.txt")).unwrap();
        let changed: Value = client
            .post(format!("{}/api/git/file-diffs", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd": fixture.root, "paths": ["new.txt", "nested/one.txt"]}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let files = changed["files"].as_array().unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&json!({"path": "new.txt", "original": "owned fixture", "modified": "modified fixture\n", "status": "M"})));
        assert!(files.contains(
            &json!({"path": "nested/one.txt", "original": "one", "modified": "", "status": "D"})
        ));
        // Exercise the size placeholder through the authenticated route and its
        // scoped worktree grant, using a sparse untracked file.
        let oversized = fixture.root.join("oversized-http.txt");
        let file = std::fs::File::create(&oversized).unwrap();
        file.set_len(10 * 1024 * 1024 + 262_144).unwrap();
        let large: Value = client
            .post(format!("{}/api/git/file-diffs", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd": fixture.root, "paths": ["oversized-http.txt"]}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            large,
            json!({"files": [{"path": "oversized-http.txt", "original": "", "modified": "(file too large to diff: 10.3 MB, limit 10 MB)", "status": "?"}]})
        );
        std::fs::remove_file(oversized).unwrap();
        reads_enabled.store(0, Ordering::SeqCst);
        git(&["reset", "--hard", "HEAD"]);
        std::fs::write(fixture.root.join("new.txt"), "owned fixture\nchanged\n").unwrap();
        git(&["add", "new.txt"]);
        std::fs::write(fixture.root.join("untracked-stat.txt"), "untracked\n").unwrap();
        let stats: Value = call("diff-stats", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            stats,
            json!({"files": 2, "insertions": 1, "deletions": 0, "hasChanges": true})
        );
        // The HEAD comparison can fail even when HEAD exists. Fall back to the
        // staged and working-tree comparisons using their authorized arguments.
        std::fs::write(
            fixture.root.join("new.txt"),
            "owned fixture\nchanged\nunstaged\n",
        )
        .unwrap();
        denied_command.store(5, Ordering::SeqCst);
        let before = diff_commands.load(Ordering::SeqCst);
        let fallback: Value = call("diff-stats", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            fallback,
            json!({"files": 2, "insertions": 2, "deletions": 0, "hasChanges": true})
        );
        assert_eq!(diff_commands.load(Ordering::SeqCst) - before, 3);
        denied_command.store(0, Ordering::SeqCst);
        std::fs::write(fixture.root.join("new.txt"), "owned fixture\nchanged\n").unwrap();
        git(&["reset", "--", "new.txt"]);
        std::fs::remove_file(fixture.root.join("untracked-stat.txt")).unwrap();
        let branch = git(&["branch", "--show-current"]);
        git(&["checkout", "-b", "fixture-upstream"]);
        std::fs::write(fixture.root.join("upstream-only.txt"), "upstream\n").unwrap();
        git(&["add", "upstream-only.txt"]);
        git(&["commit", "-m", "upstream"]);
        git(&["checkout", &branch]);
        std::fs::write(fixture.root.join("local-only.txt"), "local\n").unwrap();
        git(&["add", "local-only.txt"]);
        git(&["commit", "-m", "local one"]);
        git(&["commit", "--allow-empty", "-m", "local two"]);
        git(&["branch", "--set-upstream-to=fixture-upstream", &branch]);
        let diverged: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(diverged["hasUpstream"], true);
        assert_eq!(diverged["aheadCount"], 2);
        assert_eq!(diverged["behindCount"], 1);
        let base_stats: Value = client
            .post(format!("{}/api/git/diff-stats", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd": fixture.root, "baseBranch": "fixture-upstream"}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            base_stats,
            json!({"files": 2, "insertions": 2, "deletions": 0, "hasChanges": true})
        );
        reads_enabled.store(1, Ordering::SeqCst);
        for (request, expected) in [
            (
                json!({"cwd": fixture.root, "baseBranch": "fixture-upstream", "paths": ["local-only.txt"]}),
                "local\n",
            ),
            (
                json!({"cwd": fixture.root, "baseBranch": "fixture-upstream", "branch": branch, "paths": ["local-only.txt"]}),
                "local",
            ),
        ] {
            let result: Value = client
                .post(format!("{}/api/git/file-diffs", server.base))
                .bearer_auth(&token)
                .json(&request)
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(
                result,
                json!({"files": [{"path": "local-only.txt", "original": "", "modified": expected, "status": "A"}]})
            );
        }
        for (base, topic) in [("--help", branch.as_str()), ("fixture-upstream", "--help")] {
            let before = commands.load(Ordering::SeqCst);
            let result: Value = client
                .post(format!("{}/api/git/file-diffs", server.base))
                .bearer_auth(&token)
                .json(&json!({"cwd": fixture.root, "baseBranch": base, "branch": topic}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(result, json!({"files": []}));
            assert_eq!(commands.load(Ordering::SeqCst), before);
        }
        reads_enabled.store(0, Ordering::SeqCst);
        // A merged topic should still report its own changes, not an empty three-dot diff.
        git(&["add", "new.txt"]);
        git(&["commit", "-m", "finish local"]);
        git(&["checkout", "fixture-upstream"]);
        git(&["merge", "--no-ff", &branch, "-m", "merge local"]);
        reads_enabled.store(1, Ordering::SeqCst);
        let merged_files: Value = client.post(format!("{}/api/git/file-diffs", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd": fixture.root, "baseBranch": "fixture-upstream", "branch": branch, "paths": ["local-only.txt"]}))
            .send().await.unwrap().json().await.unwrap();
        assert_eq!(
            merged_files,
            json!({"files": [{"path": "local-only.txt", "original": "", "modified": "local", "status": "A"}]})
        );
        reads_enabled.store(0, Ordering::SeqCst);
        let merged_stats: Value = client
            .post(format!("{}/api/git/diff-stats", server.base))
            .bearer_auth(&token)
            .json(&json!({"cwd": fixture.root, "baseBranch": "fixture-upstream", "branch": branch}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(
            merged_stats,
            json!({"files": 3, "insertions": 2, "deletions": 1, "hasChanges": true})
        );
        for (base, topic) in [("--help", branch.as_str()), ("fixture-upstream", "--help")] {
            let before = commands.load(Ordering::SeqCst);
            let rejected: Value = client
                .post(format!("{}/api/git/diff-stats", server.base))
                .bearer_auth(&token)
                .json(&json!({"cwd": fixture.root, "baseBranch": base, "branch": topic}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(
                rejected,
                json!({"files": 0, "insertions": 0, "deletions": 0, "hasChanges": false})
            );
            assert_eq!(commands.load(Ordering::SeqCst), before);
        }
        git(&["checkout", &branch]);
        denied_command.store(4, Ordering::SeqCst);
        assert_eq!(call("status", &fixture.root).await.unwrap().status(), 500);
        denied_command.store(0, Ordering::SeqCst);
        // Remote URLs are inert fixture values; status only reads configuration.
        git(&[
            "remote",
            "add",
            "origin",
            "https://example.invalid/origin.git",
        ]);
        git(&[
            "remote",
            "add",
            "other",
            "https://example.invalid/other.git",
        ]);
        git(&["config", &format!("branch.{branch}.remote"), "other"]);
        // Remove merge configuration so this fixture does not require a remote ref.
        git(&["config", "--unset", &format!("branch.{branch}.merge")]);
        let selected: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(selected["remoteUrl"], "https://example.invalid/other.git");
        git(&["config", &format!("branch.{branch}.remote"), "missing"]);
        let fallback: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(fallback["remoteUrl"], "https://example.invalid/origin.git");
        // A fixture executable checks exact CLI arguments and never contacts a network.
        use std::os::unix::fs::PermissionsExt;
        let fixture_cli = fixture.root.join(".git/fixture-gh");
        std::fs::write(&fixture_cli, r##"#!/bin/sh
if [ "$1" = "--version" ] && [ "$#" = 1 ]; then exit 0; fi
if [ "$*" = 'pr view --head topic --repo owner/repo --json number,title,url,state,baseRefName,headRefName' ]; then
  printf '%s' '{"number":7,"title":"Example","url":"https://example.invalid/pr/7","state":"MERGED","baseRefName":"main","headRefName":"topic"}'
  exit 0
fi
if [ "$*" = 'pr view --head topic --json number,title,url,state,baseRefName,headRefName' ]; then
  printf '%s' '{"number":8,"state":"DRAFT"}'
  exit 0
fi
exit 2
"##).unwrap();
        std::fs::set_permissions(&fixture_cli, std::fs::Permissions::from_mode(0o700)).unwrap();
        git(&[
            "remote",
            "set-url",
            "other",
            "git@github.com:owner/repo.git",
        ]);
        git(&["config", &format!("branch.{branch}.remote"), "other"]);
        gh_enabled.store(1, Ordering::SeqCst);
        let with_gh = || {
            client
                .post(format!("{}/api/git/status", server.base))
                .bearer_auth(&token)
                .json(&json!({"cwd":fixture.root,"branch":"topic"}))
                .send()
        };
        let github: Value = with_gh().await.unwrap().json().await.unwrap();
        assert_eq!(github["ghAvailable"], true);
        assert_eq!(github["pr"]["number"], 7);
        assert_eq!(github["pr"]["state"], "merged");
        git(&[
            "remote",
            "set-url",
            "other",
            "https://example.invalid/other.git",
        ]);
        let nongithub: Value = with_gh().await.unwrap().json().await.unwrap();
        assert_eq!(nongithub["pr"]["number"], 8);
        assert_eq!(nongithub["pr"]["state"], "open");
        assert_eq!(nongithub["pr"]["title"], "");
        gh_enabled.store(0, Ordering::SeqCst);
        // Produce a real UU porcelain entry in this local fixture, with no network.
        std::fs::write(fixture.root.join("conflict.txt"), "base\n").unwrap();
        git(&["add", "conflict.txt"]);
        git(&["commit", "-m", "conflict base"]);
        git(&["checkout", "-b", "fixture-conflict"]);
        std::fs::write(fixture.root.join("conflict.txt"), "other\n").unwrap();
        git(&["commit", "-am", "conflict other"]);
        git(&["checkout", &branch]);
        std::fs::write(fixture.root.join("conflict.txt"), "local\n").unwrap();
        git(&["commit", "-am", "conflict local"]);
        let merge = std::process::Command::new("/usr/bin/git")
            .current_dir(&fixture.root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .args([
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "merge",
                "fixture-conflict",
            ])
            .output()
            .unwrap();
        assert!(!merge.status.success(), "fixture merge should conflict");
        let conflicted: Value = call("status", &fixture.root)
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        for section in ["index", "workingTree"] {
            let file = conflicted[section]["files"]
                .as_array()
                .unwrap()
                .iter()
                .find(|file| file["path"] == "conflict.txt")
                .unwrap();
            assert_eq!(file["status"], "M");
        }
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
    async fn authorization_denial_does_not_reflect_request_token() {
        let fixture = Fixture::new();
        let db = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate_database(&db).unwrap();
        let user = UserService::new(&db)
            .create_user_with_hash("git-redaction-owner", "test-hash")
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
        let authority: GitAuthority = Arc::new(|request, _| {
            Box::pin(async move { Err(format!("denied credential {:?}", request.body["token"])) })
        });
        let server = server(
            GitRoutes::new(auth.clone())
                .with_authority(authority)
                .router(),
        )
        .await;
        let response = reqwest::Client::new()
            .post(format!("{}/api/git/status", server.base))
            .bearer_auth(token)
            .json(&json!({"cwd": fixture.root, "token": "private-forge-token"}))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
        let body = response.text().await.unwrap();
        assert!(!body.contains("private-forge-token"));
        assert!(body.contains("Git authorization denied"));
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
