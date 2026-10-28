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

/// Preferred remote: `origin` when present, otherwise the first configured one.
fn preferred_remote(cwd: &str) -> Option<String> {
    let names = remotes(cwd);
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

/// Port of `parseGitRemote` + `detectGitRemoteProvider`. Only the provider is
/// consumed anywhere in the TypeScript module, so only it is returned.
fn detect_git_remote_provider(raw: &str) -> &'static str {
    let trimmed = raw.trim().trim_end_matches('/');
    let host = if let Some(rest) = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .or_else(|| trimmed.strip_prefix("ssh://"))
    {
        match rest.split_once('/') {
            Some((host, _)) => host.to_string(),
            None => rest.to_string(),
        }
    } else if let Some((head, _)) = trimmed.split_once(':') {
        // scp-like syntax: git@github.com:owner/repo.git
        let host = head.rsplit_once('@').map(|(_, host)| host).unwrap_or(head);
        host.to_string()
    } else {
        String::new()
    };

    let lowered = host.to_ascii_lowercase();
    if lowered.contains("github") {
        "github"
    } else if lowered.contains("gitlab") {
        "gitlab"
    } else if lowered.contains("bitbucket") {
        "bitbucket"
    } else if lowered.contains("gitea") || lowered.contains("codeberg") {
        "gitea"
    } else if lowered.is_empty() {
        "none"
    } else {
        "unknown"
    }
}

#[derive(Clone)]
struct PorcelainEntry {
    index: char,
    work: char,
    path: String,
}

/// `git status --porcelain=v1 -z` parsing, rename-aware.
fn porcelain(cwd: &str) -> Result<Vec<PorcelainEntry>, String> {
    let raw = git_exec(cwd, &["status", "--porcelain=v1", "-z"])?;
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
        if matches!(index, 'R' | 'C') || matches!(work, 'R' | 'C') {
            // the original path follows as its own NUL-separated chunk
            let _ = chunks.next();
        }
        entries.push(PorcelainEntry { index, work, path });
    }
    Ok(entries)
}

fn normalize_status_char(value: char) -> String {
    match value {
        ' ' => "M".to_string(),
        other => other.to_string(),
    }
}

/// Parsed `--numstat` rows: (path, insertions, deletions). Binary files report
/// `-` and are counted as 0/0, matching git's own accounting.
fn numstat(cwd: &str, args: &[&str]) -> Vec<(String, u64, u64)> {
    let raw = match git_exec(cwd, args) {
        Ok(raw) => raw,
        Err(_) => return Vec::new(),
    };
    let mut rows = Vec::new();
    let chunks = raw.split('\0');
    for chunk in chunks {
        let line = chunk.trim_start_matches('\n');
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(3, '\t');
        let insertions = parts.next().unwrap_or_default();
        let deletions = parts.next().unwrap_or_default();
        let path = parts.next().unwrap_or_default().trim();
        if path.is_empty() {
            continue;
        }
        let insertions = insertions.trim().parse::<u64>().unwrap_or(0);
        let deletions = deletions.trim().parse::<u64>().unwrap_or(0);
        rows.push((path.to_string(), insertions, deletions));
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
fn compute_status(cwd: &str, branch_override: Option<&str>) -> Option<Value> {
    if !is_repo(cwd) {
        return None;
    }

    let entries = porcelain(cwd).unwrap_or_default();
    let staged_stats = numstat(cwd, &["diff", "--cached", "--numstat", "-z"]);
    let worktree_stats = numstat(cwd, &["diff", "--numstat", "-z"]);

    let mut index_entries: Vec<(String, char, u64, u64)> = Vec::new();
    let mut worktree_entries: Vec<(String, char, u64, u64)> = Vec::new();

    for entry in &entries {
        let untracked = entry.index == '?' && entry.work == '?';
        if untracked {
            worktree_entries.push((entry.path.clone(), '?', 0, 0));
            continue;
        }
        if entry.index != ' ' {
            let stats = staged_stats
                .iter()
                .find(|(path, _, _)| path == &entry.path)
                .map(|(_, added, removed)| (*added, *removed))
                .unwrap_or((0, 0));
            index_entries.push((entry.path.clone(), entry.index, stats.0, stats.1));
        }
        if entry.work != ' ' {
            let stats = worktree_stats
                .iter()
                .find(|(path, _, _)| path == &entry.path)
                .map(|(_, added, removed)| (*added, *removed))
                .unwrap_or((0, 0));
            worktree_entries.push((entry.path.clone(), entry.work, stats.0, stats.1));
        }
    }

    let branch = branch_override
        .map(str::to_string)
        .or_else(|| current_branch(cwd));

    let (has_upstream, ahead_count, behind_count) = match branch
        .as_deref()
        .and_then(|branch| branch_upstream(cwd, branch))
    {
        Some(upstream) => {
            let (ahead, behind) = ahead_behind(cwd, &upstream);
            (true, ahead, behind)
        }
        None => (false, 0, 0),
    };

    let remote = preferred_remote(cwd);
    let url = remote.as_deref().and_then(|remote| remote_url(cwd, remote));
    let pr_provider = url
        .as_deref()
        .map(detect_git_remote_provider)
        .unwrap_or("none");
    let gh_available = command_available("gh", &["--version"]);

    let pr = if gh_available && pr_provider == "github" {
        branch.as_deref().and_then(|branch| gh_pr(cwd, branch))
    } else {
        None
    };

    Some(json!({
        "branch": branch.map(Value::String).unwrap_or(Value::Null),
        "hasWorkingTreeChanges": !worktree_entries.is_empty(),
        "index": status_section(&index_entries),
        "workingTree": status_section(&worktree_entries),
        "hasUpstream": has_upstream,
        "aheadCount": ahead_count,
        "behindCount": behind_count,
        "pr": pr.unwrap_or(Value::Null),
        "ghAvailable": gh_available,
        "prProvider": pr_provider,
        "remoteUrl": url.map(Value::String).unwrap_or(Value::Null),
    }))
}

/// `gh pr view <branch> --json ...` projection used for the status payload.
fn gh_pr(cwd: &str, branch: &str) -> Option<Value> {
    let output = Command::new("gh")
        .current_dir(cwd)
        .args([
            "pr",
            "view",
            branch,
            "--json",
            "number,title,url,state,baseRefName,headRefName",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
    let number = value.get("number")?.as_i64()?;
    Some(json!({
        "number": number,
        "title": value.get("title").cloned().unwrap_or(Value::Null),
        "url": value.get("url").cloned().unwrap_or(Value::Null),
        "baseBranch": value.get("baseRefName").cloned().unwrap_or(Value::Null),
        "headBranch": value.get("headRefName").cloned().unwrap_or(Value::Null),
        "state": value
            .get("state")
            .and_then(Value::as_str)
            .map(|state| state.to_ascii_lowercase())
            .map(Value::String)
            .unwrap_or(Value::Null),
    }))
}

/// Working-tree file contents for `file-diffs` (empty when the side is absent).
fn file_at_head(cwd: &str, path: &str) -> String {
    let spec = format!("HEAD:{path}");
    git_exec(cwd, &["show", spec.as_str()]).unwrap_or_default()
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

fn is_binary(content: &str) -> bool {
    content.as_bytes().contains(&0)
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

    match git_task(move || Ok(compute_status(&cwd, branch.as_deref()))).await {
        Ok(payload) => ok_json(payload.unwrap_or(Value::Null)),
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
        let rows = match (base_branch, branch) {
            (Some(base), Some(branch)) => {
                let range = format!("{base}...{branch}");
                numstat(&cwd, &["diff", "--numstat", "-z", range.as_str()])
            }
            _ => {
                let mut rows = if has_head(&cwd) {
                    numstat(&cwd, &["diff", "--numstat", "-z", "HEAD"])
                } else {
                    numstat(&cwd, &["diff", "--numstat", "-z"])
                };
                rows.extend(numstat(&cwd, &["diff", "--cached", "--numstat", "-z"]));
                rows
            }
        };
        let mut insertions = 0u64;
        let mut deletions = 0u64;
        for (_, added, removed) in &rows {
            insertions += added;
            deletions += removed;
        }
        Ok(json!({
            "files": rows.len(),
            "insertions": insertions,
            "deletions": deletions,
            "hasChanges": !rows.is_empty(),
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

    let result = git_task(move || {
        let paths = if requested.is_empty() {
            changed_paths(&cwd)
        } else {
            requested
        };
        let mut files = Vec::with_capacity(paths.len());
        for path in paths {
            let original = file_at_head(&cwd, &path);
            let modified = file_on_disk(&cwd, &path)?;
            let binary = is_binary(&original) || is_binary(&modified);
            files.push(json!({
                "path": path,
                "original": original,
                "modified": modified,
                "binary": binary,
            }));
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
