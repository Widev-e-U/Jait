//! Native port of `packages/gateway/src/routes/git.ts`.
//!
//! Bounded local execution paths (17 existing handlers, explicit authority required):
//!   POST /api/git/status, /branches, /fetch, /pull, /sync, /identity,
//!        /checkout, /create-branch, /diff, /diff-stats, /file-diffs,
//!        /discard, /stage, /unstage, /init, /create-worktree, /remove-worktree
//!
//! Deferred (9 handlers, all remote-control-plane / integration bound -- see
//! `DEFERRED` below): run-stacked-action, run-commit-flow, gh-status,
//! pr-checks, gh-auth, forge-status, forge-auth, forge-pr-checks,
//! generate-commit-message.
//!
//! Exact commands require an owner-bound request grant and command authorization.
//! Canonical ProcessPool supervises cancellation and bounded raw capture; bounded
//! BlockingLane workers retain request context. No authority is enabled by default.

use crate::services::user_secrets::UserSecretService;
#[path = "git_batch.rs"]
mod batch;
#[path = "git_execution.rs"]
pub mod execution;
use execution::Command;
pub use execution::{
    GitAuthority, GitAuthorizationRequest, GitCommandAuthority, GitCommandRequest, GitGrant,
};

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{Map, Value, json};

use super::auth::{self, AuthState};

/// Handlers that exist in the TypeScript module but are not ported yet.
pub const DEFERRED: [&str; 9] = [
    "run-stacked-action",
    "run-commit-flow",
    "gh-status",
    "pr-checks",
    "gh-auth",
    "forge-status",
    "forge-auth",
    "forge-pr-checks",
    "generate-commit-message",
];

#[derive(Clone)]
pub struct GitRoutes {
    auth: AuthState,
    /// Optional user secret store, used by the forge/GitHub credential routes.
    user_secrets: Option<UserSecretService>,
    authority: Option<GitAuthority>,
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

    pub fn router(self) -> Router {
        Router::new()
            .route("/api/git/status", post(status))
            .route("/api/git/branches", post(branches))
            .route("/api/git/fetch", post(fetch))
            .route("/api/git/pull", post(pull))
            .route("/api/git/sync", post(sync))
            .route("/api/git/identity", post(identity))
            .route("/api/git/checkout", post(checkout))
            .route("/api/git/create-branch", post(create_branch))
            .route("/api/git/diff", post(diff))
            .route("/api/git/diff-stats", post(diff_stats))
            .route("/api/git/file-diffs", post(file_diffs))
            .route("/api/git/discard", post(discard))
            .route("/api/git/stage", post(stage))
            .route("/api/git/unstage", post(unstage))
            .route("/api/git/init", post(init))
            .route("/api/git/create-worktree", post(create_worktree))
            .route("/api/git/remove-worktree", post(remove_worktree))
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

    let result = git_task(move || {
        if remotes(&cwd).is_empty() {
            return Ok(json!({ "status": "skipped_no_remote", "remote": Value::Null, "allRemotes": all_remotes }));
        }
        let output = if all_remotes {
            git_exec(&cwd, &["fetch", "--all", "--prune"])?
        } else {
            git_exec(&cwd, &["fetch", "--prune"])?
        };
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

    let result = git_task(move || {
        let branch = match current_branch(&cwd) {
            Some(branch) => branch,
            None => return Ok(json!({ "status": "skipped_no_upstream" })),
        };
        let upstream = match branch_upstream(&cwd, &branch) {
            Some(upstream) => upstream,
            None => return Ok(json!({ "status": "skipped_no_upstream" })),
        };
        let (_, behind) = ahead_behind(&cwd, &upstream);
        if behind == 0 {
            return Ok(json!({ "status": "skipped_up_to_date" }));
        }
        git_exec(&cwd, &["pull", "--ff-only"])?;
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

    let result = git_task(move || {
        let branch = current_branch(&cwd);
        let upstream = branch
            .as_deref()
            .and_then(|branch| branch_upstream(&cwd, branch));

        let pull_result = match upstream.as_deref() {
            None => json!({ "status": "skipped_no_upstream" }),
            Some(upstream) => {
                let (_, behind) = ahead_behind(&cwd, upstream);
                if behind == 0 {
                    json!({ "status": "skipped_up_to_date" })
                } else {
                    git_exec(&cwd, &["pull", "--ff-only"])?;
                    json!({ "status": "pulled", "commits": behind })
                }
            }
        };

        let push_result = match upstream.as_deref() {
            None => json!({ "status": "skipped_no_upstream" }),
            Some(upstream) => {
                let (ahead, _) = ahead_behind(&cwd, upstream);
                if ahead == 0 {
                    json!({ "status": "skipped_up_to_date" })
                } else {
                    git_exec(&cwd, &["push"])?;
                    json!({ "status": "pushed", "commits": ahead })
                }
            }
        };

        Ok(json!({
            "branch": branch.map(Value::String).unwrap_or(Value::Null),
            "upstreamBranch": upstream.map(Value::String).unwrap_or(Value::Null),
            "pull": pull_result,
            "push": push_result,
        }))
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
    let name = string_field(&body, "name");
    let email = string_field(&body, "email");

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
            (Some(_), None) | (None, Some(_)) => {
                Err("Both name and email are required".to_string())
            }
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
