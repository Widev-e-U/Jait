//! Native port of `packages/gateway/src/routes/git.ts`.
//!
//! Bounded local execution paths (17 existing handlers, explicit authority required):
//!   POST /api/git/status, /branches, /fetch, /pull, /sync, /identity,
//!        /checkout, /create-branch, /diff, /diff-stats, /file-diffs,
//!        /discard, /stage, /unstage, /init, /create-worktree, /remove-worktree
//!
//! GitHub forge routes (`gh`, github.com only, owner consent per project):
//!        /gh-status, /gh-auth, /forge-status, /forge-auth, /pr-checks, /forge-pr-checks
//!
//! Deferred (see `DEFERRED` below): run-commit-flow, generate-commit-message.
//! run-stacked-action answers its denial until its network steps are gated.
//!
//! Exact commands require an owner-bound request grant and command authorization.
//! Canonical ProcessPool supervises cancellation and bounded raw capture; bounded
//! BlockingLane workers retain request context. No authority is enabled by default.

use crate::services::user_secrets::UserSecretService;
#[path = "git_batch.rs"]
mod batch;
#[path = "git_destination_grant.rs"]
pub(crate) mod destination_grant;
#[path = "git_execution.rs"]
pub mod execution;
use execution::Command;
pub use execution::{
    GitAuthority, GitAuthorizationRequest, GitCommandAuthority, GitCommandRequest, GitGrant,
    NetworkGate, NetworkRequest,
};

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{Map, Value, json};

use super::auth::{self, AuthState};

/// Handlers that exist in the TypeScript module but are not ported yet.
pub const DEFERRED: [&str; 2] = ["run-commit-flow", "generate-commit-message"];

#[derive(Clone)]
pub struct GitRoutes {
    auth: AuthState,
    /// Optional user secret store, used by the forge/GitHub credential routes.
    user_secrets: Option<UserSecretService>,
    authority: Option<GitAuthority>,
    /// Host consent for network destinations; without it fetch, pull and push are refused.
    network: Option<NetworkGate>,
    processes: crate::execution::process_runner::ProcessPool,
    blocking: crate::runtime::blocking::BlockingLane,
    admission: std::sync::Arc<tokio::sync::Semaphore>,
}

impl GitRoutes {
    pub fn new(auth: AuthState) -> Self {
        let (processes, blocking) = execution::lanes();
        Self {
            auth,
            user_secrets: None,
            authority: None,
            network: None,
            processes,
            blocking,
            admission: std::sync::Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }

    /// Attaches the user secret store so forge credential routes can persist
    /// tokens. Without it those routes answer `503` exactly like the TS plugin
    /// does when `userSecretService` is not supplied.
    pub fn with_user_secrets(mut self, user_secrets: Option<UserSecretService>) -> Self {
        self.user_secrets = user_secrets;
        self
    }

    pub fn with_authority(mut self, authority: GitAuthority) -> Self {
        self.authority = Some(authority);
        self
    }

    pub fn with_network(mut self, network: NetworkGate) -> Self {
        self.network = Some(network);
        self
    }

    /// Obtain host consent for the destinations of `remotes`, or answer the denial.
    async fn authorize_network(
        &self,
        operation: &str,
        remotes: Vec<String>,
    ) -> Result<(), Response> {
        let Some(gate) = self.network.as_ref() else {
            return Err(error_response(
                403,
                "Network Git operations are not authorized",
            ));
        };
        execution::network_gate(gate, operation, remotes)
            .await
            .map_err(|message| error_response(403, &message))
    }

    pub fn router(self) -> Router {
        Router::new()
            .route("/api/git/status", post(status))
            .route("/api/git/branches", post(branches))
            .route("/api/git/fetch", post(fetch))
            .route("/api/git/pull", post(pull))
            .route("/api/git/sync", post(sync))
            .route(
                "/api/git/run-stacked-action",
                post(run_stacked_action_route),
            )
            .route("/api/git/identity", post(identity))
            .route("/api/git/checkout", post(checkout))
            .route("/api/git/create-branch", post(create_branch))
            .route("/api/git/diff", post(diff))
            .route(
                "/api/git/generate-commit-message",
                post(generate_commit_message),
            )
            .route("/api/git/diff-stats", post(diff_stats))
            .route("/api/git/file-diffs", post(file_diffs))
            .route("/api/git/discard", post(discard))
            .route("/api/git/stage", post(stage))
            .route("/api/git/unstage", post(unstage))
            .route("/api/git/init", post(init))
            .route("/api/git/create-worktree", post(create_worktree))
            .route("/api/git/remove-worktree", post(remove_worktree))
            .route("/api/git/gh-status", post(gh_status))
            .route("/api/git/gh-auth", post(gh_auth))
            .route("/api/git/forge-status", post(forge_status))
            .route("/api/git/forge-auth", post(forge_auth))
            .route("/api/git/pr-checks", post(pr_checks))
            .route("/api/git/forge-pr-checks", post(pr_checks))
            .layer(axum::middleware::from_fn_with_state(
                self.clone(),
                execution::authorize,
            ))
            .with_state(self)
    }
}

// ---------------------------------------------------------------------------
// response helpers (same shapes as threads.rs / project.rs)
// ---------------------------------------------------------------------------

type HandlerResult<T> = Result<T, Box<Response>>;

fn json_response(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

fn ok_json(body: Value) -> Response {
    json_response(StatusCode::OK, body)
}

fn error_response(status: u16, message: &str) -> Response {
    let code = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    json_response(code, json!({ "error": message }))
}

async fn json_body(request: Request) -> HandlerResult<Map<String, Value>> {
    let bytes = axum::body::to_bytes(request.into_body(), 1_048_576)
        .await
        .map_err(|_| Box::new(error_response(400, "Invalid JSON body")))?;
    if bytes.is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(map)) => Ok(map),
        _ => Err(Box::new(error_response(400, "Invalid JSON body"))),
    }
}

/// `if (!cwd) return reply.status(400).send({ error: "Missing cwd" })`
fn require_cwd(body: &Map<String, Value>) -> HandlerResult<String> {
    match body.get("cwd").and_then(Value::as_str) {
        Some(cwd) if !cwd.is_empty() => Ok(cwd.to_string()),
        _ => Err(Box::new(error_response(400, "Missing cwd"))),
    }
}

fn string_field(body: &Map<String, Value>, key: &str) -> Option<String> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn bool_field(body: &Map<String, Value>, key: &str) -> bool {
    body.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn paths_field(body: &Map<String, Value>) -> Vec<String> {
    body.get("paths")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Runs a blocking git closure off the async runtime, mapping failures to a
/// 500 with the git error message (TypeScript catches and sends `err.message`).
async fn git_task<F, T>(operation: F) -> HandlerResult<T>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    match execution::blocking(operation).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(message)) => Err(Box::new(error_response(500, &message))),
        Err(_) => Err(Box::new(error_response(500, "Internal Server Error"))),
    }
}

/// Parse a github.com remote into a validated target. Enterprise hosts remain
/// unsupported until credentials are stored and retrieved by host; destination
/// authorization is still required from the request-scoped command authority.
fn github_auth_repository(raw: &str) -> Option<crate::services::git_forge::ForgeRepository> {
    use crate::services::git_forge::ForgeRepository;
    let raw = raw.trim();
    let normalized = if let Some(rest) = raw.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        format!("ssh://git@{host}/{path}")
    } else {
        raw.to_owned()
    };
    // Inspect the original path before URL parsing can normalize dot segments or
    // backslashes into a different repository target.
    let (_, authority_and_path) = normalized.split_once("://")?;
    let (_, raw_path) = authority_and_path.split_once('/')?;
    if raw_path.contains(['\\', '%'])
        || raw_path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return None;
    }
    let url = url::Url::parse(&normalized).ok()?;
    match url.scheme() {
        "https" if url.username().is_empty() && url.password().is_none() => {}
        "ssh" if url.username() == "git" && url.password().is_none() => {}
        _ => return None,
    }
    if url.port().is_some() || url.query().is_some() || url.fragment().is_some() {
        return None;
    }
    let host = url.host_str()?;
    if host != "github.com" {
        return None;
    }
    let parts: Vec<_> = url.path_segments()?.collect();
    if parts.len() != 2 {
        return None;
    }
    let repo = parts[1].strip_suffix(".git").unwrap_or(parts[1]);
    ForgeRepository::new(host, parts[0], repo).ok()
}

// Once dispatched, the database worker cannot abort a running write. The
// cancellation check prevents a queued write from starting after cancellation.
async fn save_github_token(
    auth: &AuthState,
    secrets: UserSecretService,
    owner: String,
    token: String,
    cancellation: crate::execution::process_runner::ProcessCancellation,
) -> HandlerResult<()> {
    use crate::services::github_pull_requests::{
        GITHUB_TOKEN_SECRET_KEY, GITHUB_TOKEN_SECRET_TYPE,
    };
    use crate::services::user_secrets::SaveSecretParams;
    auth.with_database(move |db| {
        if cancellation.is_cancelled() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "Git request cancelled",
            )
            .into());
        }
        secrets
            .save(
                db,
                SaveSecretParams {
                    user_id: Some(owner),
                    r#type: GITHUB_TOKEN_SECRET_TYPE.into(),
                    key: GITHUB_TOKEN_SECRET_KEY.into(),
                    label: "GitHub personal access token".into(),
                    value: token,
                },
            )
            .map(|_| ())
    })
    .await
    .map_err(|_| Box::new(error_response(500, "Secret storage failed")))
}

/// Authenticate with GitHub under the current forge-auth grant and persist only
/// a successfully validated token under the owner captured from that same grant.
async fn github_forge_auth(
    state: &GitRoutes,
    repository: crate::services::git_forge::ForgeRepository,
    token: String,
) -> HandlerResult<Value> {
    use crate::execution::process_runner::ProcessCancellation;
    use crate::services::git_forge::GitHubForge;
    // The current secret key is specific to github.com. Do not authenticate an
    // enterprise destination until credentials can be stored and retrieved by host.
    if repository.host() != "github.com" {
        return Err(Box::new(error_response(
            400,
            "GitHub Enterprise authentication is unavailable",
        )));
    }
    let secrets = state
        .user_secrets
        .clone()
        .ok_or_else(|| Box::new(error_response(503, "User secret store is unavailable")))?;
    let owner = execution::forge_auth_owner()
        .map_err(|_| Box::new(error_response(403, "Git execution denied")))?;
    let cancellation = execution::forge_auth_cancellation()
        .map_err(|_| Box::new(error_response(403, "Git execution denied")))?;
    let session = execution::forge_auth_session(repository, token.clone())
        .map_err(|_| Box::new(error_response(403, "Git execution denied")))?;
    let result = GitHubForge::new(session)
        .login_with_token(ProcessCancellation::default())
        .await
        .map_err(|_| Box::new(error_response(500, "forge auth failed")))?;
    if result.get("authenticated").and_then(Value::as_bool) == Some(true) {
        save_github_token(&state.auth, secrets, owner, token, cancellation).await?;
    }
    let mut response = Map::new();
    response.insert(
        "ok".into(),
        json!(result.get("authenticated").and_then(Value::as_bool) == Some(true)),
    );
    response.insert(
        "username".into(),
        result.get("username").cloned().unwrap_or(Value::Null),
    );
    if let Some(error) = result.get("error") {
        response.insert("error".into(), error.clone());
    }
    Ok(Value::Object(response))
}

// ---------------------------------------------------------------------------
// forge routes (GitHub only; every GitHub call is gated by owner consent for github.com)
// ---------------------------------------------------------------------------

const GITHUB_CONNECT_HINT: &str = "GitHub is not connected for this account.";

fn forge_error(error: crate::services::git_forge::ForgeError) -> Box<Response> {
    use crate::services::git_forge::ForgeError;
    Box::new(match error {
        ForgeError::Denied => error_response(403, "Git execution denied"),
        ForgeError::InvalidInput => error_response(400, "Invalid forge request"),
        ForgeError::TimedOut => error_response(504, "Forge request timed out"),
        _ => error_response(500, "Forge request failed"),
    })
}

/// Repository used by calls that do not name one (`gh --version`, `gh api user`).
fn github_account_repository() -> crate::services::git_forge::ForgeRepository {
    crate::services::git_forge::ForgeRepository::new("github.com", "_", "_")
        .expect("static github.com repository is valid")
}

struct ForgeCall {
    owner: String,
    cwd: String,
    body: Map<String, Value>,
}

async fn forge_call(state: &GitRoutes, request: Request) -> Result<ForgeCall, Response> {
    let headers = request.headers().clone();
    let user = auth::require_user(&state.auth, &headers)
        .await
        .map_err(|response| *response)?;
    let body = json_body(request).await.map_err(|response| *response)?;
    let cwd = require_cwd(&body).map_err(|response| *response)?;
    Ok(ForgeCall {
        owner: user.id,
        cwd,
        body,
    })
}

/// The remote the request names, else `origin` of the project.
async fn forge_remote_url(call: &ForgeCall) -> Option<String> {
    if let Some(url) = string_field(&call.body, "remoteUrl") {
        return Some(url);
    }
    let cwd = call.cwd.clone();
    git_task(move || Ok(remote_url(&cwd, "origin")))
        .await
        .ok()
        .flatten()
}

async fn stored_github_token(state: &GitRoutes, owner: &str) -> HandlerResult<Option<String>> {
    use crate::services::github_pull_requests::{
        GITHUB_TOKEN_SECRET_KEY, GITHUB_TOKEN_SECRET_TYPE,
    };
    let secrets = state
        .user_secrets
        .clone()
        .ok_or_else(|| Box::new(error_response(503, "User secret store is unavailable")))?;
    let owner = owner.to_owned();
    state
        .auth
        .with_database(move |db| {
            secrets.get_value(
                db,
                Some(&owner),
                GITHUB_TOKEN_SECRET_TYPE,
                GITHUB_TOKEN_SECRET_KEY,
            )
        })
        .await
        .map_err(|_| Box::new(error_response(500, "Secret storage failed")))
}

struct GithubStatus {
    installed: bool,
    authenticated: bool,
    username: Option<String>,
    error: Option<String>,
}

/// `gh` availability and, when a token is stored and the owner approves github.com, who it is.
async fn github_status(state: &GitRoutes, owner: &str) -> HandlerResult<GithubStatus> {
    use crate::execution::process_runner::ProcessCancellation;
    use crate::services::git_forge::{ForgeError, GitHubForge};
    let token = stored_github_token(state, owner).await?;
    // The placeholder token only accompanies `gh --version`, which never reaches the network.
    let session = execution::forge_auth_session(
        github_account_repository(),
        token.clone().unwrap_or_else(|| "unused".into()),
    )
    .map_err(forge_error)?;
    let forge = GitHubForge::new(session);
    let installed = match forge
        .check_cli_available(ProcessCancellation::default())
        .await
    {
        Ok(installed) => installed,
        // `--version` needs no consent, so a refusal means `gh` cannot be run at all.
        Err(ForgeError::Denied) => false,
        Err(error) => return Err(forge_error(error)),
    };
    let Some(_) = token.filter(|_| installed) else {
        return Ok(GithubStatus {
            installed,
            authenticated: false,
            username: None,
            error: installed.then(|| GITHUB_CONNECT_HINT.into()),
        });
    };
    state
        .authorize_network(crate::runtime::git_network::FORGE_OPERATION, vec![])
        .await
        .map_err(Box::new)?;
    let result = forge
        .login_with_token(ProcessCancellation::default())
        .await
        .map_err(forge_error)?;
    Ok(GithubStatus {
        installed,
        authenticated: result.get("authenticated").and_then(Value::as_bool) == Some(true),
        username: result
            .get("username")
            .and_then(Value::as_str)
            .map(str::to_owned),
        error: result
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

/// `POST /api/git/gh-status` (git.ts:916)
async fn gh_status(State(state): State<GitRoutes>, request: Request) -> Response {
    let call = match forge_call(&state, request).await {
        Ok(call) => call,
        Err(response) => return response,
    };
    match github_status(&state, &call.owner).await {
        Ok(status) => ok_json(json!({
            "installed": status.installed,
            "authenticated": status.authenticated,
            "username": status.username,
        })),
        Err(response) => *response,
    }
}

/// `POST /api/git/forge-status` (git.ts:1012)
async fn forge_status(State(state): State<GitRoutes>, request: Request) -> Response {
    let call = match forge_call(&state, request).await {
        Ok(call) => call,
        Err(response) => return response,
    };
    let remote = forge_remote_url(&call).await;
    let provider = remote
        .as_deref()
        .map_or("unknown", detect_git_remote_provider);
    if provider != "github" {
        return ok_json(json!({
            "provider": provider,
            "forgeName": if provider == "unknown" { "Unknown" } else { provider },
            "installed": false,
            "authenticated": false,
            "username": Value::Null,
            "error": if provider == "unknown" {
                Value::Null
            } else {
                json!("This gateway supports GitHub forges only.")
            },
        }));
    }
    match github_status(&state, &call.owner).await {
        Ok(status) => {
            let mut response = json!({
                "provider": "github",
                "forgeName": "GitHub",
                "installed": status.installed,
                "authenticated": status.authenticated,
                "username": status.username,
            });
            if let Some(error) = status.error {
                response["error"] = json!(error);
            }
            ok_json(response)
        }
        Err(response) => *response,
    }
}

async fn authenticate_github(
    state: &GitRoutes,
    repository: crate::services::git_forge::ForgeRepository,
    token: String,
) -> HandlerResult<Value> {
    state
        .authorize_network(crate::runtime::git_network::FORGE_OPERATION, vec![])
        .await
        .map_err(Box::new)?;
    github_forge_auth(state, repository, token).await
}

/// `POST /api/git/gh-auth` (git.ts:974)
async fn gh_auth(State(state): State<GitRoutes>, request: Request) -> Response {
    let call = match forge_call(&state, request).await {
        Ok(call) => call,
        Err(response) => return response,
    };
    let Some(token) = string_field(&call.body, "token") else {
        return error_response(400, "Missing token");
    };
    match authenticate_github(&state, github_account_repository(), token).await {
        Ok(result) if result.get("ok").and_then(Value::as_bool) == Some(true) => {
            ok_json(json!({ "ok": true, "username": result.get("username") }))
        }
        Ok(result) => error_response(
            401,
            result
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("GitHub authentication failed"),
        ),
        Err(response) => *response,
    }
}

/// `POST /api/git/forge-auth` (git.ts:1062)
async fn forge_auth(State(state): State<GitRoutes>, request: Request) -> Response {
    let call = match forge_call(&state, request).await {
        Ok(call) => call,
        Err(response) => return response,
    };
    let Some(token) = string_field(&call.body, "token") else {
        return error_response(400, "Missing token");
    };
    let remote = forge_remote_url(&call).await;
    let provider = remote
        .as_deref()
        .map_or("unknown", detect_git_remote_provider);
    if provider == "unknown" {
        return error_response(400, "Cannot determine forge provider from remote URL");
    }
    let Some(repository) = remote.as_deref().and_then(github_auth_repository) else {
        return error_response(400, "This gateway supports github.com forges only.");
    };
    match authenticate_github(&state, repository, token).await {
        Ok(result) => ok_json(result),
        Err(response) => *response,
    }
}

/// `POST /api/git/pr-checks` and `/api/git/forge-pr-checks` (git.ts:948, 1101)
async fn pr_checks(State(state): State<GitRoutes>, request: Request) -> Response {
    use crate::execution::process_runner::ProcessCancellation;
    use crate::services::git_forge::{ForgeError, GitHubForge};
    let call = match forge_call(&state, request).await {
        Ok(call) => call,
        Err(response) => return response,
    };
    let Some(branch) = string_field(&call.body, "branch") else {
        return error_response(400, "Missing branch parameter");
    };
    let remote = forge_remote_url(&call).await;
    let Some(repository) = remote.as_deref().and_then(github_auth_repository) else {
        return ok_json(json!([]));
    };
    let token = match stored_github_token(&state, &call.owner).await {
        Ok(Some(token)) => token,
        Ok(None) => return error_response(401, GITHUB_CONNECT_HINT),
        Err(response) => return *response,
    };
    if let Err(response) = state
        .authorize_network(crate::runtime::git_network::FORGE_OPERATION, vec![])
        .await
    {
        return response;
    }
    let session = match execution::forge_auth_session(repository, token) {
        Ok(session) => session,
        Err(error) => return *forge_error(error),
    };
    match GitHubForge::new(session)
        .get_pr_checks(&branch, ProcessCancellation::default())
        .await
    {
        Ok(checks) => ok_json(checks),
        // No pull request for the branch (or none readable) has no checks to show.
        Err(ForgeError::CommandFailed) => ok_json(json!([])),
        Err(error) => *forge_error(error),
    }
}

// ---------------------------------------------------------------------------
// git CLI primitives (port of the `gitExec` / helper block in services/git.ts)
// ---------------------------------------------------------------------------

fn git_exec(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|err| err.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return Err(stderr);
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return Err(stdout);
    }
    Err(format!(
        "git {} failed with exit code {}",
        args.join(" "),
        output.status.code().unwrap_or(-1)
    ))
}

fn command_available(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .timeout(std::time::Duration::from_secs(5))
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn is_repo(cwd: &str) -> bool {
    git_exec(cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|out| out.trim() == "true")
        .unwrap_or(false)
}

fn has_head(cwd: &str) -> bool {
    git_exec(cwd, &["rev-parse", "--verify", "HEAD"]).is_ok()
}

fn current_branch(cwd: &str) -> Option<String> {
    git_exec(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|out| out.trim().to_string())
        .filter(|branch| !branch.is_empty() && branch != "HEAD")
}

fn list_branches(cwd: &str) -> Vec<String> {
    git_exec(cwd, &["branch", "--format=%(refname:short)"])
        .map(|out| {
            out.lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn branch_upstream(cwd: &str, branch: &str) -> Option<String> {
    let reference = format!("refs/heads/{branch}");
    git_exec(
        cwd,
        &[
            "for-each-ref",
            "--format=%(upstream:short)",
            reference.as_str(),
        ],
    )
    .ok()
    .map(|out| out.trim().to_string())
    .filter(|upstream| !upstream.is_empty())
}

/// `git rev-list --left-right --count <upstream>...HEAD` -> (ahead, behind)
fn ahead_behind(cwd: &str, upstream: &str) -> (u64, u64) {
    let range = format!("{upstream}...HEAD");
    let raw = match git_exec(
        cwd,
        &["rev-list", "--left-right", "--count", range.as_str()],
    ) {
        Ok(raw) => raw,
        Err(_) => return (0, 0),
    };
    let mut parts = raw.split_whitespace();
    let behind = parts
        .next()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let ahead = parts
        .next()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    (ahead, behind)
}

fn remotes(cwd: &str) -> Vec<String> {
    git_exec(cwd, &["remote"])
        .map(|out| {
            out.lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Prefer the checked-out branch's configured remote, then origin, then the first remote.
fn preferred_remote(cwd: &str, branch: Option<&str>) -> Option<String> {
    let names = remotes(cwd);
    if let Some(branch) = branch {
        let key = format!("branch.{branch}.remote");
        if let Ok(configured) = git_exec(cwd, &["config", "--default", "", "--get", &key]) {
            let configured = configured.trim();
            if names.iter().any(|name| name == configured) {
                return Some(configured.to_string());
            }
        }
    }
    if names.iter().any(|name| name == "origin") {
        return Some("origin".to_string());
    }
    names.into_iter().next()
}

fn remote_url(cwd: &str, remote: &str) -> Option<String> {
    git_exec(cwd, &["remote", "get-url", remote])
        .ok()
        .map(|out| out.trim().to_string())
        .filter(|url| !url.is_empty())
}

/// Classify a remote using the same host and path requirements as the
/// TypeScript parser. This only parses text and performs no network access.
fn detect_git_remote_provider(raw: &str) -> &'static str {
    let raw = raw.trim();
    let normalized = raw.strip_suffix(".git").unwrap_or(raw);
    let normalized = if let Some(path) = normalized.strip_prefix("git@ssh.dev.azure.com:v3/") {
        let parts: Vec<_> = path.splitn(3, '/').collect();
        if parts.len() == 3 {
            format!(
                "https://dev.azure.com/{}/{}/_git/{}",
                parts[0], parts[1], parts[2]
            )
        } else {
            return "unknown";
        }
    } else if let Some(rest) = normalized.strip_prefix("git@") {
        match rest.split_once(':') {
            Some((host, path)) => format!("https://{host}/{path}"),
            None => return "unknown",
        }
    } else {
        normalized.to_owned()
    };
    let Ok(url) = url::Url::parse(&normalized) else {
        return "unknown";
    };
    let Some(host) = url.host_str() else {
        return "unknown";
    };
    let host = host.to_ascii_lowercase();
    let parts: Vec<_> = url
        .path_segments()
        .map(|parts| parts.filter(|p| !p.is_empty()).collect())
        .unwrap_or_default();
    if host.contains("github") && parts.len() >= 2 {
        "github"
    } else if host == "dev.azure.com" && parts.len() >= 4 && parts[2] == "_git"
        || host.ends_with(".visualstudio.com") && parts.len() >= 3 && parts[1] == "_git"
    {
        "azure-devops"
    } else if host.contains("gitlab") && parts.len() >= 2 {
        "gitlab"
    } else if host.contains("bitbucket") && parts.len() >= 2 {
        "bitbucket"
    } else if host.contains("gitea") && parts.len() >= 2 {
        "gitea"
    } else {
        "unknown"
    }
}

#[derive(Clone)]
struct PorcelainEntry {
    index: char,
    work: char,
    path: String,
    original_path: String,
}

/// `git status --porcelain=v1 -z` parsing, rename-aware.
fn porcelain(cwd: &str) -> Result<Vec<PorcelainEntry>, String> {
    let raw = git_exec(
        cwd,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?;
    let mut entries = Vec::new();
    let mut chunks = raw.split('\0');
    while let Some(entry) = chunks.next() {
        if entry.len() < 4 {
            continue;
        }
        let mut chars = entry.chars();
        let index = chars.next().unwrap_or(' ');
        let work = chars.next().unwrap_or(' ');
        let path: String = entry.chars().skip(3).collect();
        let original_path = if matches!(index, 'R' | 'C') || matches!(work, 'R' | 'C') {
            chunks.next().unwrap_or(&path).to_owned()
        } else {
            path.clone()
        };
        entries.push(PorcelainEntry {
            index,
            work,
            path,
            original_path,
        });
    }
    Ok(entries)
}

fn normalize_status_char(value: char) -> String {
    match value {
        '?' | 'A' | 'D' => value.to_string(),
        'R' | 'C' => "R".to_string(),
        _ => "M".to_string(),
    }
}

/// Parsed `--numstat` rows: (path, insertions, deletions). Binary files report
/// `-` and are counted as 0/0, matching git's own accounting.
fn numstat(cwd: &str, args: &[&str]) -> Vec<(String, u64, u64)> {
    let raw = match git_exec(cwd, args) {
        Ok(raw) => raw,
        Err(_) => return Vec::new(),
    };
    parse_numstat(&raw)
}

fn parse_numstat(raw: &str) -> Vec<(String, u64, u64)> {
    let mut rows = Vec::new();
    let mut chunks = raw.split('\0');
    while let Some(record) = chunks.next() {
        let mut parts = record.splitn(3, '\t');
        let (Some(insertions), Some(deletions), Some(path)) =
            (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        // With -z, a rename record has an empty path followed by old and new
        // names as separate NUL-terminated records. Status uses the new name.
        let path = if path.is_empty() {
            let (Some(_old), Some(new)) = (chunks.next(), chunks.next()) else {
                break;
            };
            new
        } else {
            path
        };
        if path.is_empty() {
            continue;
        }
        rows.push((
            path.to_string(),
            insertions.parse::<u64>().unwrap_or(0),
            deletions.parse::<u64>().unwrap_or(0),
        ));
    }
    rows
}

fn status_section(entries: &[(String, char, u64, u64)]) -> Value {
    let mut files = Vec::with_capacity(entries.len());
    let mut insertions = 0u64;
    let mut deletions = 0u64;
    for (path, status, added, removed) in entries {
        insertions += added;
        deletions += removed;
        files.push(json!({
            "path": path,
            "status": normalize_status_char(*status),
            "insertions": added,
            "deletions": removed,
        }));
    }
    json!({
        "files": files,
        "insertions": insertions,
        "deletions": deletions,
    })
}

/// Port of `GitService.computeStatus` (services/git.ts:1071).
fn compute_status(cwd: &str, branch_override: Option<&str>) -> Result<Option<Value>, String> {
    if !is_repo(cwd) {
        return Ok(None);
    }

    let entries = porcelain(cwd)?;
    let staged_stats = if entries
        .iter()
        .any(|entry| entry.index != ' ' && entry.index != '?')
    {
        parse_numstat(&git_exec(cwd, &["diff", "--cached", "--numstat", "-z"])?)
    } else {
        Vec::new()
    };
    let worktree_stats = if entries
        .iter()
        .any(|entry| entry.work != ' ' && entry.work != '?')
    {
        parse_numstat(&git_exec(cwd, &["diff", "--numstat", "-z"])?)
    } else {
        Vec::new()
    };

    // Git's status and numstat outputs can both contain many paths. Index the
    // stats once, preserving the reference implementation's last-row-wins map.
    let staged_by_path: std::collections::HashMap<&str, (u64, u64)> = staged_stats
        .iter()
        .map(|(path, added, removed)| (path.as_str(), (*added, *removed)))
        .collect();
    let worktree_by_path: std::collections::HashMap<&str, (u64, u64)> = worktree_stats
        .iter()
        .map(|(path, added, removed)| (path.as_str(), (*added, *removed)))
        .collect();
    let mut index_entries: Vec<(String, char, u64, u64)> = Vec::new();
    let mut worktree_entries: Vec<(String, char, u64, u64)> = Vec::new();

    for entry in &entries {
        let untracked = entry.index == '?' && entry.work == '?';
        if untracked {
            worktree_entries.push((entry.path.clone(), '?', 0, 0));
            continue;
        }
        if entry.index != ' ' {
            let stats = staged_by_path
                .get(entry.path.as_str())
                .copied()
                .unwrap_or((0, 0));
            index_entries.push((entry.path.clone(), entry.index, stats.0, stats.1));
        }
        if entry.work != ' ' {
            let stats = worktree_by_path
                .get(entry.path.as_str())
                .copied()
                .unwrap_or((0, 0));
            worktree_entries.push((entry.path.clone(), entry.work, stats.0, stats.1));
        }
    }

    // The requested branch selects the PR lookup; status and upstream still
    // describe the checked-out branch.
    let branch = current_branch(cwd);

    let (has_upstream, ahead_count, behind_count) = match branch
        .as_deref()
        .and_then(|branch| branch_upstream(cwd, branch))
    {
        Some(upstream) => {
            let range = format!("{upstream}...HEAD");
            let raw = git_exec(cwd, &["rev-list", "--left-right", "--count", &range])?;
            let mut counts = raw.split_whitespace();
            let behind = counts
                .next()
                .and_then(|n| n.parse::<u64>().ok())
                .unwrap_or(0);
            let ahead = counts
                .next()
                .and_then(|n| n.parse::<u64>().ok())
                .unwrap_or(0);
            (true, ahead, behind)
        }
        None => (false, 0, 0),
    };

    let remote = preferred_remote(cwd, branch.as_deref());
    let url = remote.as_deref().and_then(|remote| remote_url(cwd, remote));
    let pr_provider = url
        .as_deref()
        .map(detect_git_remote_provider)
        .unwrap_or("none");
    let pr_branch = branch_override.or(branch.as_deref());
    let gh_available = pr_branch.is_some() && command_available("gh", &["--version"]);

    let pr = if gh_available {
        pr_branch.and_then(|branch| gh_pr(cwd, branch, url.as_deref().and_then(github_repo)))
    } else {
        None
    };

    Ok(Some(json!({
        "branch": branch.map(Value::String).unwrap_or(Value::Null),
        "hasWorkingTreeChanges": !entries.is_empty(),
        "index": status_section(&index_entries),
        "workingTree": status_section(&worktree_entries),
        "hasUpstream": has_upstream,
        "aheadCount": ahead_count,
        "behindCount": behind_count,
        "pr": pr.unwrap_or(Value::Null),
        "ghAvailable": gh_available,
        "prProvider": pr_provider,
        "remoteUrl": url.map(Value::String).unwrap_or(Value::Null),
    })))
}

/// Extract the repository selector used by the TypeScript status lookup.
fn github_repo(raw: &str) -> Option<String> {
    let normalized = raw.trim().strip_suffix(".git").unwrap_or(raw.trim());
    let normalized = if let Some(rest) = normalized.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        format!("https://{host}/{path}")
    } else {
        normalized.to_owned()
    };
    let parsed = url::Url::parse(&normalized).ok()?;
    if !parsed.host_str()?.to_ascii_lowercase().contains("github") {
        return None;
    }
    let mut segments = parsed.path_segments()?.filter(|part| !part.is_empty());
    Some(format!("{}/{}", segments.next()?, segments.next()?))
}

/// Execute the status PR lookup through the scoped command authority.
fn gh_pr(cwd: &str, branch: &str, repo: Option<String>) -> Option<Value> {
    let mut command = Command::new("gh");
    command
        .current_dir(cwd)
        .args(["pr", "view", "--head", branch]);
    if let Some(repo) = repo.as_deref() {
        command.args(["--repo", repo]);
    }
    let output = command
        .args(["--json", "number,title,url,state,baseRefName,headRefName"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
    project_gh_pr(&value)
}

/// Project a gh response; numeric strings are accepted by the reference client.
fn project_gh_pr(value: &Value) -> Option<Value> {
    let number = value.get("number")?;
    let number = match number {
        Value::Number(number) => number.as_i64().filter(|number| *number != 0)?,
        Value::String(number) if !number.is_empty() => number.trim().parse::<i64>().ok()?,
        _ => return None,
    };
    let state = value
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("OPEN")
        .to_ascii_uppercase();
    let field = |name| value.get(name).and_then(Value::as_str).unwrap_or("");
    Some(json!({
        "number": number,
        "title": field("title"),
        "url": field("url"),
        "baseBranch": field("baseRefName"),
        "headBranch": field("headRefName"),
        "state": match state.as_str() { "MERGED" => "merged", "CLOSED" => "closed", _ => "open" },
    }))
}

// Batch execution uses exactly the same owner-bound command authority and output
// cap as other Git commands. A denial, output cap or invalid frame falls back
// to individually authorized show commands; no larger process budget is granted.
fn files_at_refs(cwd: &str, specs: &[String]) -> std::collections::HashMap<String, String> {
    if specs.is_empty() {
        return std::collections::HashMap::new();
    }
    let attempt = || -> Option<std::collections::HashMap<String, String>> {
        let (_, input) = batch::batch_input(specs).ok()?;
        if input.len() > 512 * 1024 {
            return None;
        }
        let output = Command::new("git")
            .current_dir(cwd)
            .args(["cat-file", "--batch"])
            .env("GIT_TERMINAL_PROMPT", "0")
            .input(input)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        batch::parse_batch(specs, &output.stdout).ok()
    };
    attempt().unwrap_or_else(|| {
        let mut results = std::collections::HashMap::new();
        for spec in specs {
            results.entry(spec.clone()).or_insert_with(|| {
                let mut text = git_exec(cwd, &["show", spec]).unwrap_or_default();
                if text.ends_with('\n') {
                    text.pop();
                    if text.ends_with('\r') {
                        text.pop();
                    }
                }
                text
            });
        }
        results
    })
}

fn name_status(raw: &str) -> Vec<(String, String)> {
    let mut records = raw.split('\0');
    let mut entries = Vec::new();
    while let Some(code) = records.next() {
        if code.is_empty() {
            break;
        }
        let Some(first) = records.next() else {
            break;
        };
        let path = if code.starts_with('R') || code.starts_with('C') {
            let Some(destination) = records.next() else {
                break;
            };
            destination
        } else {
            first
        };
        let status = match code.chars().next() {
            Some('A') => "A",
            Some('D') => "D",
            Some('R') => "R",
            _ => "M",
        };
        entries.push((path.to_owned(), status.to_owned()));
    }
    entries
}

fn file_on_disk(cwd: &str, path: &str) -> Result<String, String> {
    execution::read_worktree_file(cwd, path)
        .or_else(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                Ok(String::new())
            } else {
                Err(e)
            }
        })
        .map_err(|e| e.to_string())
}

fn changed_paths(cwd: &str) -> Vec<String> {
    porcelain(cwd)
        .map(|entries| entries.into_iter().map(|entry| entry.path).collect())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

/// `POST /api/git/status` (git.ts:171)
async fn status(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let branch = string_field(&body, "branch");

    match git_task(move || compute_status(&cwd, branch.as_deref())).await {
        Ok(payload) => ok_json(payload.unwrap_or_else(|| {
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
        })),
        Err(response) => *response,
    }
}

/// `POST /api/git/branches` (git.ts:287)
async fn branches(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };

    match git_task(move || Ok(list_branches(&cwd))).await {
        Ok(list) => ok_json(json!({ "branches": list, "isRepo": true })),
        Err(response) => *response,
    }
}

/// `POST /api/git/fetch` (git.ts:321)
async fn fetch(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let all_remotes = bool_field(&body, "allRemotes");

    // Remotes are named explicitly so the destination that was consented to is the one
    // contacted; `--all` becomes one fetch per remote.
    let targets = {
        let cwd = cwd.clone();
        git_task(move || {
            Ok(if all_remotes {
                remotes(&cwd)
            } else {
                preferred_remote(&cwd, current_branch(&cwd).as_deref())
                    .into_iter()
                    .collect()
            })
        })
        .await
    };
    let targets = match targets {
        Ok(targets) => targets,
        Err(response) => return *response,
    };
    if targets.is_empty() {
        return ok_json(
            json!({ "status": "skipped_no_remote", "remote": Value::Null, "allRemotes": all_remotes }),
        );
    }
    if let Err(response) = state.authorize_network("fetch", targets.clone()).await {
        return response;
    }

    let result = git_task(move || {
        let mut output = String::new();
        for remote in &targets {
            output.push_str(&git_exec(&cwd, &["fetch", "--prune", remote])?);
        }
        Ok(json!({ "ok": true, "output": output.trim() }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/pull` (git.ts:352)
async fn pull(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };

    let plan = {
        let cwd = cwd.clone();
        git_task(move || {
            let Some(branch) = current_branch(&cwd) else {
                return Ok(Err(json!({ "status": "skipped_no_upstream" })));
            };
            let Some(upstream) = branch_upstream(&cwd, &branch) else {
                return Ok(Err(json!({ "status": "skipped_no_upstream" })));
            };
            let (_, behind) = ahead_behind(&cwd, &upstream);
            if behind == 0 {
                return Ok(Err(json!({ "status": "skipped_up_to_date" })));
            }
            Ok(preferred_remote(&cwd, Some(&branch))
                .map(|remote| (remote, behind))
                .ok_or_else(|| json!({ "status": "skipped_no_upstream" })))
        })
        .await
    };
    let (remote, behind) = match plan {
        Ok(Ok(plan)) => plan,
        Ok(Err(skipped)) => return ok_json(skipped),
        Err(response) => return *response,
    };
    if let Err(response) = state.authorize_network("fetch", vec![remote.clone()]).await {
        return response;
    }

    let result = git_task(move || {
        git_exec(&cwd, &["pull", "--ff-only", &remote])?;
        Ok(json!({ "status": "pulled", "commits": behind }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/sync` (git.ts:371)
async fn sync(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };

    // Each network step asks for consent to its own destination and operation first.
    let plan = {
        let cwd = cwd.clone();
        git_task(move || {
            let branch = current_branch(&cwd);
            let upstream = branch
                .as_deref()
                .and_then(|branch| branch_upstream(&cwd, branch));
            let remote = branch
                .as_deref()
                .and_then(|branch| preferred_remote(&cwd, Some(branch)));
            let behind = upstream
                .as_deref()
                .map_or(0, |upstream| ahead_behind(&cwd, upstream).1);
            Ok((branch, upstream, remote, behind))
        })
        .await
    };
    let (branch, upstream, remote, behind) = match plan {
        Ok(plan) => plan,
        Err(response) => return *response,
    };

    let pull_result = match (upstream.as_deref(), remote.as_ref()) {
        (None, _) | (_, None) => json!({ "status": "skipped_no_upstream" }),
        (Some(_), Some(_)) if behind == 0 => json!({ "status": "skipped_up_to_date" }),
        (Some(_), Some(remote)) => {
            if let Err(response) = state.authorize_network("fetch", vec![remote.clone()]).await {
                return response;
            }
            let (cwd, remote) = (cwd.clone(), remote.clone());
            match git_task(move || {
                git_exec(&cwd, &["pull", "--ff-only", &remote])?;
                Ok(json!({ "status": "pulled", "commits": behind }))
            })
            .await
            {
                Ok(value) => value,
                Err(response) => return *response,
            }
        }
    };

    let ahead = match upstream.as_deref() {
        Some(upstream) => {
            let (cwd, upstream) = (cwd.clone(), upstream.to_owned());
            match git_task(move || Ok(ahead_behind(&cwd, &upstream).0)).await {
                Ok(ahead) => ahead,
                Err(response) => return *response,
            }
        }
        None => 0,
    };
    let push_result = match (upstream.as_deref(), remote.as_ref()) {
        (None, _) | (_, None) => json!({ "status": "skipped_no_upstream" }),
        (Some(_), Some(_)) if ahead == 0 => json!({ "status": "skipped_up_to_date" }),
        (Some(_), Some(remote)) => {
            if let Err(response) = state.authorize_network("push", vec![remote.clone()]).await {
                return response;
            }
            let (cwd, remote) = (cwd.clone(), remote.clone());
            match git_task(move || {
                git_exec(&cwd, &["push", &remote])?;
                Ok(json!({ "status": "pushed", "commits": ahead }))
            })
            .await
            {
                Ok(value) => value,
                Err(response) => return *response,
            }
        }
    };

    let result: HandlerResult<Value> = Ok(json!({
        "branch": branch.map(Value::String).unwrap_or(Value::Null),
        "upstreamBranch": upstream.map(Value::String).unwrap_or(Value::Null),
        "pull": pull_result,
        "push": push_result,
    }));

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `COMMITTABLE_PATHSPEC` from services/git.ts: never commit local release checkouts.
const COMMITTABLE_PATHSPEC: [&str; 3] = ["--", ".", ":(exclude).jait/release-checkout-*"];

fn with_pathspec<'a>(head: &[&'a str]) -> Vec<&'a str> {
    head.iter()
        .chain(COMMITTABLE_PATHSPEC.iter())
        .copied()
        .collect()
}

fn base36(mut value: u128) -> String {
    if value == 0 {
        return "0".into();
    }
    let mut digits = Vec::new();
    while value > 0 {
        digits.push(char::from_digit((value % 36) as u32, 36).unwrap_or('0'));
        value /= 36;
    }
    digits.iter().rev().collect()
}

/// `buildCreatePrUrl` for hosts whose compare URL only needs the remote text.
fn create_pr_url(raw: &str, branch: &str, base: &str) -> Option<String> {
    let raw = raw.trim().trim_end_matches(".git");
    let web = match raw.strip_prefix("git@") {
        Some(rest) => {
            let (host, path) = rest.split_once(':')?;
            format!("https://{host}/{path}")
        }
        None => raw.to_owned(),
    };
    let enc =
        |value: &str| url::form_urlencoded::byte_serialize(value.as_bytes()).collect::<String>();
    match detect_git_remote_provider(raw) {
        "github" => Some(format!(
            "{web}/compare/{}...{}?expand=1",
            enc(base),
            enc(branch)
        )),
        "gitlab" => Some(format!(
            "{web}/-/merge_requests/new?merge_request[source_branch]={}",
            enc(branch)
        )),
        "bitbucket" => Some(format!("{web}/pull-requests/new?source={}", enc(branch))),
        "gitea" => Some(format!("{web}/compare/{}...{}", enc(base), enc(branch))),
        _ => None,
    }
}

/// Commit and optionally push, mirroring `GitService.runStackedAction` for the
/// `commit` and `commit_push` actions. Network commands go through the same
/// request authority as every other command, so a root without network
/// authority gets the denial instead of a push.
fn run_stacked_action(
    cwd: &str,
    action: &str,
    commit_message: Option<&str>,
    feature_branch: bool,
    base_branch: Option<&str>,
) -> Result<Value, String> {
    let pushing = action == "commit_push";
    let mut branch_result = json!({ "status": "skipped_not_requested" });
    let mut commit_result = json!({ "status": "skipped_no_changes" });
    let mut push_result = json!({ "status": "skipped_not_requested" });

    let resolve_base = |branch: Option<&str>| -> String {
        if let Some(base) = base_branch.map(str::trim).filter(|b| !b.is_empty()) {
            return base.to_string();
        }
        let _ = branch;
        ["main", "master"]
            .into_iter()
            .find(|name| {
                git_exec(
                    cwd,
                    &["rev-parse", "--verify", &format!("refs/heads/{name}")],
                )
                .is_ok()
            })
            .unwrap_or("main")
            .to_string()
    };

    // Publish the base branch before branching so the PR diff stays clean (best effort).
    if pushing && feature_branch {
        let pre_branch = current_branch(cwd);
        let target = resolve_base(pre_branch.as_deref());
        if pre_branch.as_deref() == Some(target.as_str()) {
            let _ = (|| -> Result<(), String> {
                let remote = preferred_remote(cwd, pre_branch.as_deref()).ok_or("no remote")?;
                git_exec(cwd, &["fetch", &remote, &target])?;
                let range = format!("{remote}/{target}..HEAD");
                let ahead = git_exec(cwd, &["rev-list", "--count", &range])?;
                if ahead.trim().parse::<u64>().unwrap_or(0) > 0 {
                    git_exec(cwd, &["push", "--no-verify", &remote, &target])?;
                }
                Ok(())
            })();
        }
    }

    if feature_branch {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let name = format!("feature/auto-{}", base36(millis));
        git_exec(cwd, &["checkout", "-b", &name])?;
        branch_result = json!({ "status": "created", "name": name });
    }

    let branch = current_branch(cwd);

    // Honor the user's staging: commit exactly what is staged, otherwise stage everything.
    let has_staged = !git_exec(cwd, &with_pathspec(&["diff", "--cached", "--name-only"]))
        .unwrap_or_default()
        .trim()
        .is_empty();
    let has_changes = has_staged
        || !git_exec(cwd, &with_pathspec(&["status", "--porcelain"]))
            .unwrap_or_default()
            .trim()
            .is_empty();
    if has_changes {
        if !has_staged {
            git_exec(cwd, &with_pathspec(&["add", "-A"]))?;
        }
        let subject = match commit_message.map(str::trim).filter(|m| !m.is_empty()) {
            Some(message) => message.to_string(),
            None => match git_exec(cwd, &with_pathspec(&["diff", "--cached", "--stat"])) {
                Ok(summary) => format!(
                    "chore: auto-commit {} file(s) changed",
                    summary.trim().lines().count()
                ),
                Err(_) => "chore: auto-commit changes".to_string(),
            },
        };
        let committed = git_exec(cwd, &["commit", "-m", &subject])
            .and_then(|_| git_exec(cwd, &["rev-parse", "HEAD"]));
        match committed {
            Ok(sha) => {
                commit_result =
                    json!({ "status": "created", "commitSha": sha.trim(), "subject": subject });
            }
            Err(error) => {
                let _ = git_exec(cwd, &with_pathspec(&["reset", "HEAD"]));
                return Err(error);
            }
        }
    }

    if pushing && let Some(branch) = branch.as_deref() {
        let upstream = branch_upstream(cwd, branch);

        // Rebase onto the latest remote base so the pushed branch is not rooted on a stale commit.
        let rebase_target = resolve_base(Some(branch));
        if let Some(remote) = preferred_remote(cwd, Some(branch)) {
            let rebased = git_exec(cwd, &["fetch", &remote, &rebase_target])
                .and_then(|_| git_exec(cwd, &["rebase", &format!("{remote}/{rebase_target}")]));
            if rebased.is_err() {
                let _ = git_exec(cwd, &["rebase", "--abort"]);
            }
        }

        if let Some(upstream) = upstream {
            push_result = match git_exec(cwd, &["push", "--no-verify", "--force-with-lease"]) {
                Ok(_) => {
                    json!({ "status": "pushed", "branch": branch, "upstreamBranch": upstream })
                }
                Err(error) => {
                    json!({ "status": "failed", "branch": branch, "upstreamBranch": upstream, "error": error })
                }
            };
        } else {
            match preferred_remote(cwd, Some(branch)) {
                None => push_result = json!({ "status": "skipped_no_remote", "branch": branch }),
                Some(remote) => {
                    git_exec(
                        cwd,
                        &["push", "--no-verify", "--set-upstream", &remote, branch],
                    )?;
                    push_result = json!({
                        "status": "pushed",
                        "branch": branch,
                        "upstreamBranch": format!("{remote}/{branch}"),
                        "setUpstream": true,
                    });
                }
            }
        }

        if push_result["status"] == "pushed" {
            let remote = push_result["upstreamBranch"]
                .as_str()
                .and_then(|upstream| upstream.split('/').next())
                .map(str::to_string)
                .or_else(|| preferred_remote(cwd, Some(branch)));
            let url = remote
                .and_then(|remote| remote_url(cwd, &remote))
                .and_then(|raw| create_pr_url(&raw, branch, &resolve_base(Some(branch))));
            if let (Some(url), Some(object)) = (url, push_result.as_object_mut()) {
                object.insert("createPrUrl".into(), Value::String(url));
            }
        }
    }

    Ok(json!({
        "commit": commit_result,
        "push": push_result,
        "branch": branch_result,
        "pr": { "status": "skipped_not_requested" },
    }))
}

/// `POST /api/git/run-stacked-action` (git.ts:429)
///
/// `commit_push_pr` needs the forge/`gh` integration and answers 501 until it
/// is ported; `run-commit-flow` stays deferred for the same network reasons.
async fn run_stacked_action_route(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let action = body
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if !["commit", "commit_push", "commit_push_pr"].contains(&action.as_str()) {
        return error_response(400, &format!("Invalid action: {action}"));
    }
    if action == "commit_push_pr" {
        return error_response(
            501,
            "commit_push_pr is not available in the Rust gateway yet",
        );
    }
    let message = string_field(&body, "commitMessage");
    let feature_branch = body.get("featureBranch").and_then(Value::as_bool) == Some(true);
    let base_branch = string_field(&body, "baseBranch");

    let result = git_task(move || {
        run_stacked_action(
            &cwd,
            &action,
            message.as_deref(),
            feature_branch,
            base_branch.as_deref(),
        )
    })
    .await;
    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/identity` (git.ts:507)
async fn identity(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let (name, email) = match identity_fields(&body) {
        Ok(fields) => fields,
        Err(response) => return *response,
    };

    let result = git_task(move || {
        let repo = is_repo(&cwd);
        match (name, email) {
            (Some(name), Some(email)) => {
                if repo {
                    git_exec(&cwd, &["config", "user.name", name.as_str()])?;
                    git_exec(&cwd, &["config", "user.email", email.as_str()])?;
                } else {
                    git_exec(&cwd, &["config", "--global", "user.name", name.as_str()])?;
                    git_exec(&cwd, &["config", "--global", "user.email", email.as_str()])?;
                }
                Ok(json!({ "name": name, "email": email }))
            }
            (Some(_), None) | (None, Some(_)) => unreachable!("identity fields validated"),
            (None, None) => {
                let name = read_config(&cwd, repo, "user.name");
                let email = read_config(&cwd, repo, "user.email");
                Ok(json!({
                    "name": name.map(Value::String).unwrap_or(Value::Null),
                    "email": email.map(Value::String).unwrap_or(Value::Null),
                }))
            }
        }
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

fn identity_fields(body: &Map<String, Value>) -> HandlerResult<(Option<String>, Option<String>)> {
    let field = |key: &str| {
        body.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    };
    let name = field("name");
    let email = field("email");
    if name.is_some() != email.is_some() {
        return Err(Box::new(error_response(
            400,
            "Both name and email are required",
        )));
    }
    Ok((name, email))
}

fn read_config(cwd: &str, repo: bool, key: &str) -> Option<String> {
    let args: Vec<&str> = if repo {
        vec!["config", key]
    } else {
        vec!["config", "--global", key]
    };
    git_exec(cwd, &args)
        .ok()
        .map(|out| out.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// `POST /api/git/checkout` (git.ts:554)
async fn checkout(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let branch = match string_field(&body, "branch") {
        Some(branch) => branch,
        None => return error_response(400, "Missing cwd or branch"),
    };

    let result = git_task(move || {
        git_exec(&cwd, &["checkout", branch.as_str()])?;
        Ok(json!({ "ok": true, "branch": branch }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/create-branch` (git.ts:575)
async fn create_branch(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let branch = match string_field(&body, "branch") {
        Some(branch) => branch,
        None => return error_response(400, "Missing cwd or branch"),
    };
    let base = string_field(&body, "baseBranch");

    let result = git_task(move || {
        match base {
            Some(base) => {
                git_exec(&cwd, &["checkout", "-b", branch.as_str(), base.as_str()])?;
            }
            None => {
                git_exec(&cwd, &["checkout", "-b", branch.as_str()])?;
            }
        }
        Ok(json!({ "ok": true, "branch": branch }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/diff` (git.ts:606)
async fn diff(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };

    let result = git_task(move || {
        let patch = if has_head(&cwd) {
            git_exec(&cwd, &["diff", "--no-color", "HEAD"])?
        } else {
            git_exec(&cwd, &["diff", "--no-color"])?
        };
        let files = changed_paths(&cwd);
        let has_changes = !files.is_empty() || !patch.trim().is_empty();
        Ok(json!({
            "diff": patch,
            "files": files,
            "hasChanges": has_changes,
        }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// Generate a message using the authenticated user's configured model and the scoped diff.
async fn generate_commit_message(State(state): State<GitRoutes>, request: Request) -> Response {
    use crate::providers::openai_stream::{EventSink, OpenAiHttp};
    use crate::services::jait_llm::{
        JaitLlmConfig, ResolveJaitLlmOptions, resolve_jait_llm_config,
    };
    use crate::services::jait_models::JaitBackend;
    use crate::services::users::UserService;
    use std::{collections::HashMap, sync::Arc};

    let user = match auth::require_user(&state.auth, request.headers()).await {
        Ok(user) => user,
        Err(response) => return *response,
    };
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    if body
        .get("provider")
        .and_then(Value::as_str)
        .is_some_and(|p| p != "jait")
    {
        return error_response(
            501,
            "CLI provider-backed commit generation is not configured",
        );
    }
    let Some(cancel) = execution::request_cancellation() else {
        return error_response(503, "Git request cancellation is unavailable");
    };
    let requested_model = string_field(&body, "model");
    let patch = match git_task(move || {
        if has_head(&cwd) {
            git_exec(&cwd, &["diff", "--no-ext-diff", "--no-color", "HEAD"])
        } else {
            let staged = git_exec(&cwd, &["diff", "--no-ext-diff", "--no-color", "--cached"])?;
            let unstaged = git_exec(&cwd, &["diff", "--no-ext-diff", "--no-color"])?;
            Ok(format!("{staged}\n{unstaged}"))
        }
    })
    .await
    {
        Ok(patch) => patch,
        Err(response) => return *response,
    };
    if patch.trim().is_empty() {
        return error_response(400, "No changes to generate a commit message for");
    }
    let mut diff: String = patch.chars().take(8000).collect();
    if patch.chars().count() > 8000 {
        diff.push_str("\n... (truncated)");
    }
    let id = user.id;
    let settings = match state
        .auth
        .worker()
        .run(move |db| Ok(UserService::new(db).get_settings(&id)?))
        .await
    {
        Ok(settings) => settings,
        Err(_) => return error_response(500, "User settings unavailable"),
    };
    let keys: HashMap<String, String> = settings.api_keys.into_iter().collect();
    let resolved = match resolve_jait_llm_config(ResolveJaitLlmOptions {
        config: &JaitLlmConfig::default(),
        api_keys: &keys,
        requested_model: requested_model
            .as_deref()
            .or(settings.selected_model.as_deref()),
        jait_backend: JaitBackend::parse(&settings.jait_backend),
        strict_model: true,
    }) {
        Ok(config) => config,
        Err(_) => return error_response(400, "Model configuration is unavailable"),
    };
    let http = match OpenAiHttp::configured(
        &resolved.openai_base_url,
        &resolved.openai_api_key,
        "git-commit-message",
    ) {
        Ok(http) => http,
        Err(_) => return error_response(400, "Model configuration is unavailable"),
    };
    let sink: EventSink = Arc::new(|_| Box::pin(async { Ok(()) }));
    let result = http.stream(json!({
        "model": resolved.openai_model,
        "stream": true,
        "max_tokens": 1024,
        "temperature": 0.3,
        "messages": [
            {"role":"system", "content":"Generate a concise imperative git commit message. Keep the subject at most 72 characters. Output only the message."},
            {"role":"user", "content":format!("Generate a git commit message for these changes:\n\n```diff\n{diff}\n```")}
        ]
    }), &cancel, sink).await;
    match result {
        Ok(result) if !result.interrupted && !result.content_text.trim().is_empty() => {
            ok_json(json!({"message": result.content_text.trim()}))
        }
        _ => error_response(502, "Commit message generation failed"),
    }
}

// Find the pre-merge base when the requested branch has already been merged.
// All history commands still pass through the request's scoped command authority.
fn branch_diff_base(cwd: &str, base: &str, branch: &str) -> String {
    let merge_base = git_exec(cwd, &["merge-base", "--", base, branch]).unwrap_or_default();
    let merge_base = merge_base.trim();
    if merge_base.is_empty() {
        return base.to_owned();
    }
    let branch_sha =
        git_exec(cwd, &["rev-parse", "--verify", "--end-of-options", branch]).unwrap_or_default();
    let branch_sha = branch_sha.trim();
    if branch_sha != merge_base {
        return merge_base.to_owned();
    }
    let merges = git_exec(
        cwd,
        &[
            "rev-list",
            "--first-parent",
            "--merges",
            "--end-of-options",
            base,
        ],
    )
    .unwrap_or_default();
    for commit in merges.lines().filter(|line| !line.is_empty()) {
        // Git-generated identifiers must not become options in subsequent commands.
        if !commit.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        let parents =
            git_exec(cwd, &["rev-list", "--parents", "-n", "1", commit]).unwrap_or_default();
        let parts: Vec<_> = parents.split_whitespace().collect();
        if parts.len() < 3
            || !parts[1..]
                .iter()
                .all(|part| part.bytes().all(|byte| byte.is_ascii_hexdigit()))
        {
            continue;
        }
        for parent in &parts[2..] {
            if git_exec(
                cwd,
                &["merge-base", "--is-ancestor", "--", branch_sha, parent],
            )
            .is_ok()
            {
                return parts[1].to_owned();
            }
        }
    }
    merge_base.to_owned()
}

/// `POST /api/git/diff-stats` (git.ts:633)
async fn diff_stats(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let base_branch = string_field(&body, "baseBranch");
    let branch = string_field(&body, "branch");

    let result = git_task(move || {
        let include_untracked = branch.is_none();
        let rows = match (base_branch, branch) {
            (Some(base), Some(branch)) => {
                if base.starts_with('-') || branch.starts_with('-') {
                    Vec::new()
                } else {
                    let diff_base = branch_diff_base(&cwd, &base, &branch);
                    numstat(
                        &cwd,
                        &["diff", "--numstat", "-z", &diff_base, &branch, "--"],
                    )
                }
            }
            (Some(base), None) => {
                // A ref beginning with '-' must not be interpreted as a git option.
                if base.starts_with('-') {
                    Vec::new()
                } else {
                    let resolved =
                        git_exec(&cwd, &["merge-base", "--", &base, "HEAD"]).unwrap_or_default();
                    let diff_base = resolved.trim();
                    let diff_base = if diff_base.is_empty() {
                        &base
                    } else {
                        diff_base
                    };
                    numstat(&cwd, &["diff", "--numstat", "-z", diff_base, "--"])
                }
            }
            _ => match git_exec(&cwd, &["diff", "--numstat", "-z", "HEAD"]) {
                Ok(raw) => parse_numstat(&raw),
                Err(_) => {
                    let mut rows = numstat(&cwd, &["diff", "--cached", "--numstat", "-z"]);
                    rows.extend(numstat(&cwd, &["diff", "--numstat", "-z"]));
                    rows
                }
            },
        };
        let mut insertions = 0u64;
        let mut deletions = 0u64;
        let mut paths = std::collections::HashSet::new();
        for (path, added, removed) in &rows {
            paths.insert(path.clone());
            insertions += added;
            deletions += removed;
        }
        if include_untracked {
            for entry in porcelain(&cwd).unwrap_or_default() {
                if entry.index == '?' && entry.work == '?' {
                    paths.insert(entry.path);
                }
            }
        }
        Ok(json!({
            "files": paths.len(),
            "insertions": insertions,
            "deletions": deletions,
            "hasChanges": !paths.is_empty(),
        }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/file-diffs` (git.ts:732)
async fn file_diffs(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let requested = paths_field(&body);
    let base_branch = string_field(&body, "baseBranch");
    let branch = string_field(&body, "branch");

    let result = git_task(move || {
        let filter: Vec<String> = requested.iter().map(|path| {
            path.trim_start_matches('/').replace('\\', "/").trim_end_matches('/').to_owned()
        }).filter(|path| !path.is_empty()).collect();
        let mut files = Vec::new();
        if let Some(base) = base_branch {
            if base.starts_with('-') || branch.as_ref().is_some_and(|value| value.starts_with('-')) {
                return Ok(json!({ "files": files }));
            }
            let diff_base = if let Some(ref topic) = branch {
                branch_diff_base(&cwd, &base, topic)
            } else {
                let resolved = git_exec(&cwd, &["merge-base", "--", &base, "HEAD"]).unwrap_or_default();
                if resolved.trim().is_empty() { base } else { resolved.trim().to_owned() }
            };
            let raw = if let Some(ref topic) = branch {
                git_exec(&cwd, &["diff", "--name-status", "-z", &diff_base, topic, "--"])
            } else {
                git_exec(&cwd, &["diff", "--name-status", "-z", &diff_base, "--"])
            }.unwrap_or_default();
            let mut candidates = name_status(&raw);
            if branch.is_none() {
                for entry in porcelain(&cwd).unwrap_or_default() {
                    if entry.index == '?' && entry.work == '?' {
                        candidates.push((entry.path, "?".to_owned()));
                    }
                }
            }
            let mut seen = std::collections::HashSet::new();
            let candidates: Vec<_> = candidates.into_iter().filter(|(path, _)| {
                let normalized = path.replace('\\', "/");
                seen.insert(path.clone()) && (filter.is_empty() || filter.iter().any(|item| item == &normalized || item == normalized.trim_start_matches("./")))
            }).collect();
            let mut specs = Vec::new();
            for (path, status) in &candidates {
                if status != "A" && status != "?" { specs.push(format!("{diff_base}:{path}")); }
                if status != "D" && let Some(topic) = &branch { specs.push(format!("{topic}:{path}")); }
            }
            let blobs = files_at_refs(&cwd, &specs);
            for (path, status) in candidates {
                let original = if status == "A" || status == "?" { String::new() } else { blobs.get(&format!("{diff_base}:{path}")).cloned().unwrap_or_default() };
                let modified = if status == "D" { String::new() } else if let Some(ref topic) = branch { blobs.get(&format!("{topic}:{path}")).cloned().unwrap_or_default() } else { file_on_disk(&cwd, &path)? };
                files.push(json!({ "path": path, "original": original, "modified": modified, "status": status }));
            }
            return Ok(json!({ "files": files }));
        }
        let entries: Vec<_> = porcelain(&cwd).unwrap_or_default().into_iter().filter(|entry| {
            let normalized = entry.path.replace('\\', "/");
            filter.is_empty() || filter.iter().any(|path| path == &normalized || path == normalized.trim_start_matches("./"))
        }).collect();
        let specs: Vec<_> = entries.iter().filter(|entry| entry.index != '?' && entry.work != '?' && entry.index != 'A' && entry.work != 'A')
            .map(|entry| format!("HEAD:{}", entry.original_path)).collect();
        let blobs = files_at_refs(&cwd, &specs);
        for entry in entries {
            let status = if entry.index == '?' || entry.work == '?' { "?" }
                else if entry.index == 'A' || entry.work == 'A' { "A" }
                else if entry.index == 'D' || entry.work == 'D' { "D" }
                else if entry.index == 'R' || entry.work == 'R' { "R" }
                else { "M" };
            let original = if status == "A" || status == "?" { String::new() }
                else { blobs.get(&format!("HEAD:{}", entry.original_path)).cloned().unwrap_or_default() };
            let modified = if status == "D" { String::new() }
                else { file_on_disk(&cwd, &entry.path)? };
            files.push(json!({ "path": entry.path, "original": original, "modified": modified, "status": status }));
        }
        Ok(json!({ "files": files }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/discard` (git.ts:758)
async fn discard(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let paths = paths_field(&body);

    let result = git_task(move || {
        let entries = porcelain(&cwd).unwrap_or_default();
        let mut tracked: Vec<String> = Vec::new();
        let mut untracked: Vec<String> = Vec::new();
        for path in &paths {
            let entry = entries.iter().find(|entry| &entry.path == path);
            match entry {
                Some(entry) if entry.index == '?' && entry.work == '?' => {
                    untracked.push(path.clone())
                }
                _ => tracked.push(path.clone()),
            }
        }
        if !tracked.is_empty() {
            let mut args: Vec<&str> = vec!["checkout", "--"];
            args.extend(tracked.iter().map(String::as_str));
            git_exec(&cwd, &args)?;
        }
        if !untracked.is_empty() {
            let mut args: Vec<&str> = vec!["clean", "-f", "--"];
            args.extend(untracked.iter().map(String::as_str));
            git_exec(&cwd, &args)?;
        }
        Ok(json!({ "ok": true, "discardedCount": paths.len() }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/stage` (git.ts:799)
async fn stage(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let paths = paths_field(&body);

    let result = git_task(move || {
        let mut args: Vec<&str> = vec!["add", "--"];
        let refs: Vec<String> = if paths.is_empty() {
            vec!["-A".to_string()]
        } else {
            paths
        };
        args = if refs.len() == 1 && refs[0] == "-A" {
            vec!["add", "-A"]
        } else {
            args.extend(refs.iter().map(String::as_str));
            args
        };
        git_exec(&cwd, &args)?;
        Ok(json!({ "ok": true }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/unstage` (git.ts:829)
async fn unstage(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let paths = paths_field(&body);

    let result = git_task(move || {
        if paths.is_empty() {
            git_exec(&cwd, &["reset", "--quiet", "HEAD"])?;
        } else {
            let mut args: Vec<&str> = vec!["reset", "--quiet", "HEAD", "--"];
            args.extend(paths.iter().map(String::as_str));
            git_exec(&cwd, &args)?;
        }
        Ok(json!({ "ok": true }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/init` (git.ts:859)
async fn init(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };

    let result = git_task(move || {
        git_exec(&cwd, &["init"])?;
        Ok(json!({ "ok": true }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/create-worktree` (git.ts:874)
async fn create_worktree(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let base_branch = string_field(&body, "baseBranch");
    let new_branch = string_field(&body, "newBranch");
    let (base_branch, new_branch) = match (base_branch, new_branch) {
        (Some(base), Some(new)) => (base, new),
        _ => return error_response(400, "Missing cwd, baseBranch, or newBranch"),
    };

    let result = git_task(move || {
        let repo = std::path::Path::new(&cwd);
        let parent = repo.parent().unwrap_or(repo);
        let name = repo
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "worktree".to_string());
        let sibling = format!("{name}-{new_branch}");
        let target = parent.join(sibling);
        let target_str = target.to_string_lossy().to_string();
        git_exec(
            &cwd,
            &[
                "worktree",
                "add",
                "-b",
                new_branch.as_str(),
                target_str.as_str(),
                base_branch.as_str(),
            ],
        )?;
        Ok(json!({ "ok": true }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

/// `POST /api/git/remove-worktree` (git.ts:900)
async fn remove_worktree(State(state): State<GitRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(response) = auth::require_user(&state.auth, &headers).await {
        return *response;
    }
    let body = match json_body(request).await {
        Ok(body) => body,
        Err(response) => return *response,
    };
    let cwd = match require_cwd(&body) {
        Ok(cwd) => cwd,
        Err(response) => return *response,
    };
    let path = match string_field(&body, "path") {
        Some(path) => path,
        None => return error_response(400, "Missing cwd or path"),
    };

    let result = git_task(move || {
        git_exec(&cwd, &["worktree", "remove", "--force", path.as_str()])?;
        let _ = git_exec(&cwd, &["worktree", "prune"]);
        Ok(json!({ "ok": true }))
    })
    .await;

    match result {
        Ok(payload) => ok_json(payload),
        Err(response) => *response,
    }
}

#[cfg(test)]
mod gh_projection_tests {
    use super::project_gh_pr;
    use serde_json::json;

    #[test]
    fn accepts_numeric_string_pr_number() {
        let pr =
            project_gh_pr(&json!({"number": "42", "title": "change", "state": "merged"})).unwrap();
        assert_eq!(pr["number"], 42);
        assert_eq!(pr["title"], "change");
        assert_eq!(pr["state"], "merged");
        assert!(project_gh_pr(&json!({"number": 0})).is_none());
        assert_eq!(project_gh_pr(&json!({"number": "0"})).unwrap()["number"], 0);
        assert!(project_gh_pr(&json!({"number": ""})).is_none());
    }
}

#[cfg(test)]
mod remote_provider_tests {
    use super::detect_git_remote_provider;

    #[test]
    fn github_auth_remote_requires_valid_unambiguous_target() {
        use super::github_auth_repository;
        for remote in [
            "https://github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo",
        ] {
            assert_eq!(
                github_auth_repository(remote).unwrap().target(),
                "github.com/owner/repo"
            );
        }
        for remote in [
            "https://github.com/owner",
            "https://github.com/owner/repo/extra",
            "https://user:password@github.com/owner/repo",
            "https://github.com/owner/repo?x=y",
            "https://github.com:444/owner/repo",
            "https://gitlab.com/owner/repo",
            "https://github.com.attacker.example/owner/repo",
            "https://notgithub.com/owner/repo",
            "https://github.enterprise.example/owner/repo",
            "https://github.com/owner/%2e%2e",
            "https://github.com/owner//repo",
            "https://github.com/owner/repo/",
            "https://github.com/other/../owner/repo",
            "https://github.com/owner/%72epo",
            "https://github.com/owner\\repo",
            "file:///owner/repo",
        ] {
            assert!(github_auth_repository(remote).is_none(), "{remote}");
        }
    }

    #[test]
    fn classifies_remote_hosts_and_required_paths() {
        for (remote, expected) in [
            ("git@github.com:owner/repo.git", "github"),
            ("https://github.com/owner", "unknown"),
            ("git@ssh.dev.azure.com:v3/org/project/repo", "azure-devops"),
            (
                "https://dev.azure.com/org/project/_git/repo",
                "azure-devops",
            ),
            (
                "https://org.visualstudio.com/project/_git/repo",
                "azure-devops",
            ),
            ("https://dev.azure.com/org/project/repo", "unknown"),
            ("https://gitlab.example/group/repo", "gitlab"),
            ("https://bitbucket.example/owner/repo", "bitbucket"),
            ("https://gitea.example/owner/repo", "gitea"),
            ("https://codeberg.org/owner/repo", "unknown"),
            ("not-a-url", "unknown"),
        ] {
            assert_eq!(detect_git_remote_provider(remote), expected, "{remote}");
        }
    }
}

#[cfg(test)]
mod status_projection_tests {
    use super::status_section;

    #[test]
    fn normalizes_conflict_and_copy_statuses() {
        let entries = vec![
            ("conflict".into(), 'U', 0, 0),
            ("copy".into(), 'C', 1, 2),
            ("type-change".into(), 'T', 0, 0),
            ("untracked".into(), '?', 0, 0),
        ];
        let section = status_section(&entries);
        assert_eq!(section["files"][0]["status"], "M");
        assert_eq!(section["files"][1]["status"], "R");
        assert_eq!(section["files"][2]["status"], "M");
        assert_eq!(section["files"][3]["status"], "?");
        assert_eq!(section["insertions"], 1);
        assert_eq!(section["deletions"], 2);
    }
}

#[cfg(test)]
mod status_numstat_tests {
    use super::parse_numstat;

    #[test]
    fn numstat_preserves_names_and_uses_rename_destination() {
        let rows = parse_numstat("2\t1\t leading \0-\t-\tbinary\0");
        assert_eq!(
            rows,
            vec![(" leading ".into(), 2, 1), ("binary".into(), 0, 0)]
        );
        let rows = parse_numstat("3\t2\t\0old\0new\tname\0");
        assert_eq!(rows, vec![("new\tname".into(), 3, 2)]);
        assert!(parse_numstat("1\t0\t\0old\0").is_empty());
    }
}

#[cfg(test)]
mod identity_input_tests {
    use super::identity_fields;
    use serde_json::json;

    #[test]
    fn trims_identity_and_rejects_partial_updates() {
        let body = json!({"name": "  Jane Doe  ", "email": "  jane@example.com  "});
        assert_eq!(
            identity_fields(body.as_object().unwrap()).unwrap(),
            (Some("Jane Doe".into()), Some("jane@example.com".into()))
        );
        let partial = json!({"name": "Jane", "email": "  "});
        let error = identity_fields(partial.as_object().unwrap()).unwrap_err();
        assert_eq!(error.status(), axum::http::StatusCode::BAD_REQUEST);
        let empty = json!({"name": " ", "email": " "});
        assert_eq!(
            identity_fields(empty.as_object().unwrap()).unwrap(),
            (None, None)
        );
    }
}
