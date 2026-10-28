//! Native, account/repository-scoped GitHub PR service. All commands share the
//! forge's canonical authority/process path; remote writes are never retried.
//! Conflict effects require a runtime-owned exclusive disposable workspace lease.
use super::git_forge::{
    ForgeError, ForgeResult, ForgeSession, MAX_PR_NUMBER, bounded_text, validate_pr_identity,
};
use crate::execution::process_runner::ProcessCancellation;
use serde_json::{Value, json};

pub const GITHUB_TOKEN_SECRET_TYPE: &str = "forge-token";
pub const GITHUB_TOKEN_SECRET_KEY: &str = "github.com";
const LIST_FIELDS: &str = "number,title,state,url,author,baseRefName,headRefName,isDraft,reviewDecision,mergeStateStatus,additions,deletions,changedFiles,createdAt,updatedAt,labels,statusCheckRollup";
const DETAIL_FIELDS: &str = "number,title,state,url,author,baseRefName,headRefName,isDraft,reviewDecision,mergeStateStatus,additions,deletions,changedFiles,createdAt,updatedAt,labels,statusCheckRollup,body,mergeable,maintainerCanModify,comments,reviews,commits,files";
#[derive(Clone, Copy, Debug)]
pub enum ListState {
    Open,
    Closed,
    Merged,
    All,
}
impl ListState {
    fn flag(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
            Self::Merged => "merged",
            Self::All => "all",
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub enum ReviewEvent {
    Approve,
    RequestChanges,
    Comment,
}
#[derive(Clone, Copy, Debug)]
pub enum MergeMethod {
    Merge,
    Squash,
    Rebase,
}
#[derive(Clone, Copy, Debug)]
pub enum NextState {
    Open,
    Closed,
}

pub struct GitHubPullRequestService {
    session: ForgeSession,
}
impl GitHubPullRequestService {
    pub fn new(session: ForgeSession) -> Self {
        Self { session }
    }
    pub fn repository_target(&self) -> String {
        self.session.repository().target()
    }
    pub async fn list(
        &self,
        state: ListState,
        limit: u16,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        if !(1..=100).contains(&limit) {
            return Err(ForgeError::InvalidInput);
        }
        let args = vec![
            "pr".into(),
            "list".into(),
            "--repo".into(),
            self.repository_target(),
            "--state".into(),
            state.flag().into(),
            "--limit".into(),
            limit.to_string(),
            "--json".into(),
            LIST_FIELDS.into(),
        ];
        let value = self.session.gh_json("pr-list", args, cancel).await?;
        let rows = value.as_array().ok_or(ForgeError::MalformedResponse)?;
        if rows.len() > usize::from(limit)
            || rows
                .iter()
                .any(|p| validate_pr_identity(p, self.session.repository()).is_err())
        {
            return Err(ForgeError::MalformedResponse);
        }
        Ok(Value::Array(rows.iter().map(summary).collect()))
    }
    pub async fn get(&self, number: u64, cancel: ProcessCancellation) -> ForgeResult<Value> {
        let mut args = self.number_args("view", number)?;
        args.extend(["--json".into(), DETAIL_FIELDS.into()]);
        let data = self.session.gh_json("pr-get", args, cancel).await?;
        validate_pr_identity(&data, self.session.repository())?;
        if data["number"].as_u64() != Some(number) {
            return Err(ForgeError::MalformedResponse);
        }
        Ok(detail(&data))
    }
    pub async fn diff(&self, number: u64, cancel: ProcessCancellation) -> ForgeResult<Value> {
        let mut args = self.number_args("diff", number)?;
        args.push("--patch".into());
        match self
            .session
            .gh("pr-diff", args, None, 2 * 1024 * 1024, cancel)
            .await
        {
            Ok(patch) => Ok(json!({"patch":patch,"truncated":false})),
            Err(ForgeError::OutputLimit) => Ok(json!({"patch":"","truncated":true})),
            Err(error) => Err(error),
        }
    }
    pub async fn comment(
        &self,
        number: u64,
        body: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        bounded_text(body, 1024 * 1024)?;
        if body.trim().is_empty() {
            return Err(ForgeError::InvalidInput);
        }
        let mut args = self.number_args("comment", number)?;
        args.extend(["--body-file".into(), "-".into()]);
        self.write("pr-comment", args, Some(body.into()), cancel)
            .await
    }
    pub async fn review(
        &self,
        number: u64,
        event: ReviewEvent,
        body: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        bounded_text(body, 1024 * 1024)?;
        let mut args = self.number_args("review", number)?;
        args.push(
            match event {
                ReviewEvent::Approve => "--approve",
                ReviewEvent::RequestChanges => "--request-changes",
                ReviewEvent::Comment => "--comment",
            }
            .into(),
        );
        let input = if body.trim().is_empty() {
            None
        } else {
            args.extend(["--body-file".into(), "-".into()]);
            Some(body.into())
        };
        self.write("pr-review", args, input, cancel).await
    }
    pub async fn merge(
        &self,
        number: u64,
        method: MergeMethod,
        delete_branch: bool,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        let mut args = self.number_args("merge", number)?;
        args.push(
            match method {
                MergeMethod::Merge => "--merge",
                MergeMethod::Squash => "--squash",
                MergeMethod::Rebase => "--rebase",
            }
            .into(),
        );
        if delete_branch {
            args.push("--delete-branch".into());
        }
        self.write("pr-merge", args, None, cancel).await
    }
    pub async fn set_state(
        &self,
        number: u64,
        state: NextState,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        let args = self.number_args(
            match state {
                NextState::Open => "reopen",
                NextState::Closed => "close",
            },
            number,
        )?;
        self.write("pr-set-state", args, None, cancel).await
    }
    pub async fn update(
        &self,
        number: u64,
        title: Option<&str>,
        body: Option<&str>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        if title.is_none() && body.is_none() {
            return Err(ForgeError::InvalidInput);
        }
        let mut args = self.number_args("edit", number)?;
        if let Some(title) = title {
            bounded_text(title, 4096)?;
            if title.trim().is_empty() {
                return Err(ForgeError::InvalidInput);
            }
            args.push(format!("--title={title}"));
        }
        if let Some(body) = body {
            bounded_text(body, 1024 * 1024)?;
            args.extend(["--body-file".into(), "-".into()]);
        }
        self.write("pr-update", args, body.map(str::to_owned), cancel)
            .await
    }
    fn number_args(&self, action: &str, number: u64) -> ForgeResult<Vec<String>> {
        if number == 0 || number > MAX_PR_NUMBER {
            return Err(ForgeError::InvalidInput);
        }
        Ok(self.session.pr_args(action, &number.to_string()))
    }
    async fn write(
        &self,
        operation: &str,
        args: Vec<String>,
        input: Option<String>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<()> {
        self.session
            .gh(operation, args, input, 1024 * 1024, cancel)
            .await
            .map(|_| ())
    }
}

fn string<'a>(p: &'a Value, key: &str) -> &'a str {
    p[key].as_str().unwrap_or("")
}
fn numeric(p: &Value, key: &str) -> Value {
    if let Some(number) = p[key].as_number() {
        return Value::Number(number.clone());
    }
    let Some(text) = p[key].as_str() else {
        return json!(0);
    };
    if let Ok(number) = text.trim().parse::<i64>() {
        return json!(number);
    }
    if let Ok(number) = text.trim().parse::<u64>() {
        return json!(number);
    }
    text.trim()
        .parse::<f64>()
        .ok()
        .and_then(serde_json::Number::from_f64)
        .map(Value::Number)
        .unwrap_or_else(|| json!(0))
}
fn array(p: &Value) -> &[Value] {
    p.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn actor(p: &Value) -> Value {
    let login = string(p, "login").trim();
    if login.is_empty() {
        return Value::Null;
    }
    let name = string(p, "name").trim();
    json!({"login":login,"name":if name.is_empty() {None} else {Some(name)}})
}
fn maybe_text(p: &Value, key: &str) -> Option<String> {
    let s = string(p, key).trim();
    if s.is_empty() { None } else { Some(s.into()) }
}
fn summary(p: &Value) -> Value {
    let state = match string(p, "state").to_uppercase().as_str() {
        "MERGED" => "MERGED",
        "CLOSED" => "CLOSED",
        _ => "OPEN",
    };
    let labels: Vec<_> = array(&p["labels"])
        .iter()
        .filter(|v| !string(v, "name").is_empty())
        .map(|v| json!({"name":string(v,"name"),"color":string(v,"color")}))
        .collect();
    let checks: Vec<_> = array(&p["statusCheckRollup"])
        .iter()
        .map(|v| {
            let first = |a, b| {
                let s = string(v, a);
                if s.is_empty() { string(v, b) } else { s }
            };
            let name = first("name", "context");
            let url = first("detailsUrl", "targetUrl").trim();
            json!({"name":if name.is_empty() {"Check"} else {name},
            "status":first("status","state"),"conclusion":first("conclusion","state"),
            "detailsUrl":if url.is_empty() {None} else {Some(url)}})
        })
        .collect();
    json!({"number":numeric(p,"number"),"title":string(p,"title"),"state":state,"url":string(p,"url"),
        "author":actor(&p["author"]),"baseBranch":string(p,"baseRefName"),"headBranch":string(p,"headRefName"),
        "isDraft":p["isDraft"].as_bool().unwrap_or(false),"reviewDecision":string(p,"reviewDecision"),
        "mergeStateStatus":string(p,"mergeStateStatus"),"additions":numeric(p,"additions"),"deletions":numeric(p,"deletions"),
        "changedFiles":numeric(p,"changedFiles"),"createdAt":string(p,"createdAt"),"updatedAt":string(p,"updatedAt"),
        "labels":labels,"checks":checks})
}
fn detail(p: &Value) -> Value {
    let mut out = summary(p);
    out["body"] = json!(string(p, "body"));
    out["mergeable"] = json!(string(p, "mergeable"));
    out["maintainerCanModify"] = json!(p["maintainerCanModify"].as_bool().unwrap_or(false));
    out["comments"] = Value::Array(
        array(&p["comments"])
            .iter()
            .map(|v| {
                json!({
        "id":string(v,"id"),"author":actor(&v["author"]),"body":string(v,"body"),
        "createdAt":string(v,"createdAt"),"url":maybe_text(v,"url")})
            })
            .collect(),
    );
    out["reviews"] = Value::Array(
        array(&p["reviews"])
            .iter()
            .map(|v| {
                json!({
        "id":string(v,"id"),"author":actor(&v["author"]),"body":string(v,"body"),
        "state":string(v,"state"),"submittedAt":string(v,"submittedAt")})
            })
            .collect(),
    );
    out["commits"] = Value::Array(array(&p["commits"]).iter().map(|v| {
        let authored = string(v,"authoredDate");
        let authors: Vec<_> = array(&v["authors"]).iter().map(actor).filter(|p| !p.is_null()).collect();
        json!({"oid":string(v,"oid"),"message":string(v,"messageHeadline"),
            "authoredAt":if authored.is_empty() {string(v,"committedDate")} else {authored},"authors":authors})
    }).collect());
    out["files"] = Value::Array(array(&p["files"]).iter().filter(|v| !string(v,"path").is_empty())
        .map(|v| json!({"path":string(v,"path"),"additions":numeric(v,"additions"),"deletions":numeric(v,"deletions")})).collect());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalize_sparse_malformed_nested_data() {
        let v = detail(
            &json!({"number":17,"state":"merged","labels":[{}, {"name":"bug"}],
            "author":{"login":" alice ","name":" "},"files":[{}, {"path":"x","additions":3}],
            "statusCheckRollup":[{"context":"ci","state":"SUCCESS","targetUrl":" https://github.com/check "}],
            "comments":[{}],"commits":[{"committedDate":"date","authors":[{}, {"login":"bob"}]}]}),
        );
        assert_eq!(v["state"], "MERGED");
        assert_eq!(v["author"], json!({"login":"alice","name":null}));
        assert_eq!(
            v["checks"][0],
            json!({"name":"ci","status":"SUCCESS","conclusion":"SUCCESS","detailsUrl":"https://github.com/check"})
        );
        assert_eq!(
            v["files"],
            json!([{"path":"x","additions":3,"deletions":0}])
        );
        assert_eq!(v["commits"][0]["authoredAt"], "date");
        assert_eq!(v["commits"][0]["authors"].as_array().unwrap().len(), 1);
        assert_eq!(v["comments"][0]["url"], Value::Null);
    }
    #[tokio::test]
    async fn invalid_pr_operations_never_reach_authority() {
        use crate::{
            execution::process_runner::ProcessPool, routes::git::GitCommandAuthority,
            services::git_forge::ForgeRepository,
        };
        use std::{num::NonZeroU16, path::PathBuf, sync::Arc};
        let authority: GitCommandAuthority = Arc::new(|_, _| {
            Box::pin(async { panic!("invalid operation must not request effect authority") })
        });
        let service = GitHubPullRequestService::new(
            ForgeSession::new(
                "alice".into(),
                PathBuf::from("/owned"),
                ForgeRepository::new("github.com", "owned", "repo").unwrap(),
                "test-secret".into(),
                authority,
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            )
            .unwrap(),
        );
        for limit in [0, 101] {
            assert_eq!(
                service
                    .list(ListState::All, limit, ProcessCancellation::default())
                    .await,
                Err(ForgeError::InvalidInput)
            );
        }
        for number in [0, MAX_PR_NUMBER + 1] {
            assert_eq!(
                service.get(number, ProcessCancellation::default()).await,
                Err(ForgeError::InvalidInput)
            );
        }
        for body in [" ", "x\0y"] {
            assert_eq!(
                service
                    .comment(1, body, ProcessCancellation::default())
                    .await,
                Err(ForgeError::InvalidInput)
            );
        }
        assert_eq!(
            service
                .update(1, None, None, ProcessCancellation::default())
                .await,
            Err(ForgeError::InvalidInput)
        );
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        assert_eq!(
            service.merge(1, MergeMethod::Squash, true, cancel).await,
            Err(ForgeError::Cancelled)
        );
    }

    #[tokio::test]
    async fn mutations_send_literal_arguments_and_stdin_to_authority() {
        use crate::{
            execution::process_runner::ProcessPool, routes::git::GitCommandAuthority,
            services::git_forge::ForgeRepository,
        };
        use std::{
            num::NonZeroU16,
            path::PathBuf,
            sync::{Arc, Mutex},
        };
        let calls = Arc::new(Mutex::new(Vec::new()));
        let captured = calls.clone();
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            captured.lock().unwrap().push(request);
            Box::pin(async { Err("denied".into()) })
        });
        let session = ForgeSession::new(
            "alice".into(),
            PathBuf::from("/owned"),
            ForgeRepository::new("github.com", "owned", "repo").unwrap(),
            "test-secret".into(),
            authority,
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
        )
        .unwrap();
        let service = GitHubPullRequestService::new(session);
        let body = "literal `$(touch /unsafe)`\n--repo=other";
        assert_eq!(
            service
                .comment(7, body, ProcessCancellation::default())
                .await,
            Err(ForgeError::Denied)
        );
        assert_eq!(
            service
                .update(
                    7,
                    Some("--repo=evil"),
                    Some(body),
                    ProcessCancellation::default()
                )
                .await,
            Err(ForgeError::Denied)
        );
        assert_eq!(
            service
                .merge(0, MergeMethod::Merge, true, ProcessCancellation::default())
                .await,
            Err(ForgeError::InvalidInput)
        );
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].input.as_deref(), Some(body.as_bytes()));
        assert_eq!(
            calls[0].arguments,
            vec![
                "pr",
                "comment",
                "7",
                "--repo",
                "github.com/owned/repo",
                "--body-file",
                "-"
            ]
        );
        assert!(
            calls[1]
                .arguments
                .contains(&"--title=--repo=evil".to_owned())
        );
        assert!(
            calls
                .iter()
                .all(|r| !r.arguments.iter().any(|s| s.contains("test-secret")))
        );
    }
}

/// Conflict resolution never operates on the session's ordinary checkout. The
/// runtime implements this non-cloneable lease, keeps its exclusive lock alive
/// across the entire call, supervises cleanup on drop/cancellation, and verifies
/// an empty, owned, symlink-free disposable root before Initialize. Every later
/// approval must recheck ownership, expiry/revocation, isolation and destinations,
/// enforce disk/network quotas, and record a Push grant durably before returning
/// it. An abandoned Push approval is potentially dispatched and requires remote
/// reconciliation before any later attempt; cancellation is never a retry grant.
/// There is deliberately no default implementation or ambient workspace factory.
pub trait ConflictWorkspaceLease: Send {
    fn owner(&self) -> &str;
    fn root(&self) -> &std::path::Path;
    fn approve<'a>(
        &'a mut self,
        effect: ConflictEffect,
        cancel: ProcessCancellation,
    ) -> futures_util::future::BoxFuture<'a, ForgeResult<()>>;
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConflictEffectKind {
    Initialize,
    Fetch,
    Read,
    Checkout,
    Merge,
    Resolve,
    Commit,
    /// Must grant this exact head repository/ref independently of base access.
    Push,
}
#[derive(Clone, Debug)]
pub struct ConflictEffect {
    pub kind: ConflictEffectKind,
    pub owner: String,
    pub base_repository: String,
    pub pull_request: u64,
    pub root: std::path::PathBuf,
    pub arguments: Vec<String>,
    pub destination: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConflictSide {
    Ours,
    Theirs,
}
#[derive(Debug, PartialEq, Eq)]
pub enum ConflictContent {
    Missing,
    Text(String),
    Binary,
}
#[derive(Debug, PartialEq, Eq)]
pub struct ConflictFile {
    pub path: String,
    pub ours: ConflictContent,
    pub theirs: ConflictContent,
}
#[derive(Debug, PartialEq, Eq)]
pub enum ConflictOutcome {
    Conflicts(Vec<ConflictFile>),
    Merged,
    Pushed,
}
impl ConflictOutcome {
    /// Normalize to the existing TS conflict response shape. Missing stages are
    /// empty text; if either side is binary neither blob is exposed as text.
    pub fn into_json(self) -> Value {
        match self {
            Self::Conflicts(files) => {
                json!({"status":"conflicts", "files":files.into_iter().map(|f| {
                let binary = matches!(f.ours, ConflictContent::Binary) || matches!(f.theirs, ConflictContent::Binary);
                let text = |side| match side { ConflictContent::Text(s) if !binary => s, _ => String::new() };
                json!({"path":f.path,"binary":binary,"ours":text(f.ours),"theirs":text(f.theirs)})
            }).collect::<Vec<_>>() })
            }
            Self::Merged => {
                json!({"status":"merged","message":"Merged base into the pull request branch and pushed."})
            }
            Self::Pushed => json!({"status":"pushed","message":"Conflicts resolved and pushed."}),
        }
    }
}
#[derive(Debug, PartialEq, Eq)]
pub enum ConflictError {
    Forge(ForgeError),
    NotOpen,
    UnsupportedWorkspace,
    SnapshotChanged,
    InvalidStages,
    InvalidChoices,
    /// Dispatch began: remote success cannot safely be inferred from any failure.
    /// Reconcile the remote head explicitly; never retry the push automatically.
    PushUncertain,
}
impl From<ForgeError> for ConflictError {
    fn from(e: ForgeError) -> Self {
        Self::Forge(e)
    }
}
type ConflictResult<T> = Result<T, ConflictError>;
const CONFLICT_BYTES: usize = 4 * 1024 * 1024;
const CONFLICT_FILES: usize = 128;

#[derive(Clone, Debug)]
struct ConflictSnapshot {
    base_url: String,
    head_url: String,
    base_branch: String,
    head_branch: String,
    base_oid: String,
    head_oid: String,
}
fn git_oid(s: &str) -> bool {
    matches!(s.len(), 40 | 64)
        && s.bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}
impl ConflictSnapshot {
    fn parse(
        p: &Value,
        repo: &super::git_forge::ForgeRepository,
        number: u64,
    ) -> ConflictResult<Self> {
        validate_pr_identity(p, repo)?;
        if p["number"].as_u64() != Some(number) {
            return Err(ForgeError::MalformedResponse.into());
        }
        if p["state"].as_str() != Some("OPEN") {
            return Err(ConflictError::NotOpen);
        }
        let text = |k: &str| {
            p[k].as_str()
                .map(str::to_owned)
                .ok_or(ForgeError::MalformedResponse)
        };
        let base_branch = text("baseRefName")?;
        let head_branch = text("headRefName")?;
        super::git_forge::branch(&base_branch)?;
        super::git_forge::branch(&head_branch)?;
        let base_oid = text("baseRefOid")?;
        let head_oid = text("headRefOid")?;
        if !git_oid(&base_oid) || !git_oid(&head_oid) {
            return Err(ForgeError::MalformedResponse.into());
        }
        let raw = p["headRepository"]["url"]
            .as_str()
            .ok_or(ForgeError::MalformedResponse)?;
        // A GitHub fork may have a different owner, never a new inferred host,
        // userinfo, query, redirect, port, or encoded path. Host authority still
        // must independently grant the exact fetch and push destinations.
        let url = url::Url::parse(raw).map_err(|_| ForgeError::MalformedResponse)?;
        let path = url.path().trim_start_matches('/').trim_end_matches(".git");
        let parts: Vec<_> = path.split('/').collect();
        if url.scheme() != "https"
            || url.host_str() != Some(repo.host())
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || parts.len() != 2
        {
            return Err(ForgeError::MalformedResponse.into());
        }
        let head_repo = super::git_forge::ForgeRepository::new(repo.host(), parts[0], parts[1])?;
        let head_url = head_repo.web_url();
        if raw != head_url && raw != format!("{head_url}.git") {
            return Err(ForgeError::MalformedResponse.into());
        }
        Ok(Self {
            base_url: repo.web_url(),
            head_url,
            base_branch,
            head_branch,
            base_oid,
            head_oid,
        })
    }
}

/// Strict NUL framing preserves spaces/tabs without Git's quote interpretation.
/// Reject symlink/submodule modes: stage checkout must never traverse repo links.
#[derive(Debug, Default)]
struct ConflictStages(std::collections::BTreeMap<String, [Option<String>; 3]>);
fn safe_stage_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 4096
        && !path.starts_with('-')
        && !path
            .chars()
            .any(|c| c.is_control() || c == '\\' || c == ':')
        && path.split('/').all(|p| {
            !p.is_empty()
                && p != "."
                && p != ".."
                && !p.eq_ignore_ascii_case(".git")
                && !p.ends_with('.')
                && !p.ends_with(' ')
        })
}
impl ConflictStages {
    fn parse(bytes: &[u8]) -> ConflictResult<Self> {
        if bytes.len() > CONFLICT_BYTES || (!bytes.is_empty() && bytes.last() != Some(&0)) {
            return Err(ConflictError::InvalidStages);
        }
        let mut out = Self::default();
        if bytes.is_empty() {
            return Ok(out);
        }
        for record in bytes[..bytes.len() - 1].split(|b| *b == 0) {
            if record.is_empty() {
                return Err(ConflictError::InvalidStages);
            }
            let record = std::str::from_utf8(record).map_err(|_| ConflictError::InvalidStages)?;
            let (header, path) = record
                .split_once('\t')
                .ok_or(ConflictError::InvalidStages)?;
            let fields: Vec<_> = header.split(' ').collect();
            if fields.len() != 3
                || !matches!(fields[0], "100644" | "100755")
                || !git_oid(fields[1])
                || !safe_stage_path(path)
            {
                return Err(ConflictError::InvalidStages);
            }
            let stage = match fields[2] {
                "1" => 0,
                "2" => 1,
                "3" => 2,
                _ => return Err(ConflictError::InvalidStages),
            };
            let slots = out.0.entry(path.to_owned()).or_default();
            if slots[stage].replace(fields[1].to_owned()).is_some() || out.0.len() > CONFLICT_FILES
            {
                return Err(ConflictError::InvalidStages);
            }
        }
        if out.0.values().any(|s| s[1].is_none() && s[2].is_none()) {
            return Err(ConflictError::InvalidStages);
        }
        Ok(out)
    }
    fn validate_choices(
        &self,
        choices: &std::collections::BTreeMap<String, ConflictSide>,
    ) -> ConflictResult<()> {
        if self.0.len() != choices.len()
            || choices
                .keys()
                .any(|p| !safe_stage_path(p) || !self.0.contains_key(p))
        {
            return Err(ConflictError::InvalidChoices);
        }
        Ok(())
    }
}
fn conflict_content(bytes: Vec<u8>) -> ConflictContent {
    if bytes.contains(&0) {
        return ConflictContent::Binary;
    }
    match String::from_utf8(bytes) {
        Ok(s) => ConflictContent::Text(s),
        Err(_) => ConflictContent::Binary,
    }
}

// An authority may supply reviewed credentials, but cannot repoint Git at a
// different worktree/index/object store through environment configuration. Only
// bounded HTTP authorization headers may be added as Git config environment.
fn conflict_git_environment(
    actual: &std::collections::HashMap<String, String>,
    required: &std::collections::HashMap<String, String>,
    destination: Option<&str>,
) -> bool {
    let count = match actual.get("GIT_CONFIG_COUNT") {
        None => 0,
        Some(s) => match s.parse::<usize>() {
            Ok(n) if n <= 4 && n.to_string() == *s => n,
            _ => return false,
        },
    };
    for i in 0..count {
        let Some(key) = actual.get(&format!("GIT_CONFIG_KEY_{i}")) else {
            return false;
        };
        let Some(value) = actual.get(&format!("GIT_CONFIG_VALUE_{i}")) else {
            return false;
        };
        let scoped = destination.map(|d| format!("http.{d}.extraHeader"));
        if destination.is_none()
            || (key != "http.extraHeader" && Some(key) != scoped.as_ref())
            || value.len() > 16 * 1024
            || value.chars().any(char::is_control)
        {
            return false;
        }
    }
    actual.keys().all(|key| {
        if !key.starts_with("GIT_") || required.contains_key(key) || key == "GIT_CONFIG_COUNT" {
            return true;
        }
        (0..count).any(|i| {
            key == &format!("GIT_CONFIG_KEY_{i}") || key == &format!("GIT_CONFIG_VALUE_{i}")
        })
    })
}

struct ConflictGit<'a> {
    lease: &'a mut dyn ConflictWorkspaceLease,
    authority: crate::routes::git::GitCommandAuthority,
    pool: crate::execution::process_runner::ProcessPool,
    owner: String,
    repository: String,
    number: u64,
    cancel: ProcessCancellation,
    budget: usize,
    commands: usize,
    push_dispatched: bool,
}
impl ConflictGit<'_> {
    async fn run(
        &mut self,
        kind: ConflictEffectKind,
        args: Vec<String>,
        destination: Option<String>,
        allow_merge_conflicts: bool,
    ) -> ConflictResult<(i32, Vec<u8>)> {
        use crate::routes::git::GitCommandRequest;
        use std::{collections::HashMap, path::Path, time::Duration};
        if self.cancel.is_cancelled() {
            return Err(ForgeError::Cancelled.into());
        }
        if self.commands >= 1024 || self.budget == 0 {
            return Err(ForgeError::OutputLimit.into());
        }
        self.commands += 1;
        // No configured remote names, helpers, hooks, submodule recursion or
        // attribute filters. Authority must isolate HOME/config/network/credentials
        // and ensure parent paths cannot be symlinked or concurrently replaced.
        let mut arguments: Vec<String> = [
            "--no-optional-locks",
            "--literal-pathspecs",
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "credential.helper=",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.https.allow=always",
            "-c",
            "http.followRedirects=false",
            "-c",
            "submodule.recurse=false",
            "-c",
            "core.autocrlf=false",
            "-c",
            "commit.gpgSign=false",
            "-c",
            "user.name=Jait conflict resolution",
            "-c",
            "user.email=jait-conflicts@localhost",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect();
        arguments.extend(args);
        let root = self.lease.root().to_path_buf();
        let effect = ConflictEffect {
            kind: kind.clone(),
            owner: self.owner.clone(),
            base_repository: self.repository.clone(),
            pull_request: self.number,
            root: root.clone(),
            arguments: arguments.clone(),
            destination: destination.clone(),
        };
        tokio::select! {
            _ = self.cancel.wait_cancelled() => return Err(ForgeError::Cancelled.into()),
            approved = tokio::time::timeout(Duration::from_secs(5), self.lease.approve(effect, self.cancel.clone())) => approved.map_err(|_| ForgeError::TimedOut)??,
        }
        if self.lease.owner() != self.owner || self.lease.root() != root {
            return Err(ForgeError::Denied.into());
        }
        let environment = HashMap::from([
            ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
            ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
            ("GIT_TERMINAL_PROMPT".into(), "0".into()),
            ("GIT_ATTR_NOSYSTEM".into(), "1".into()),
            ("GIT_LFS_SKIP_SMUDGE".into(), "1".into()),
            ("LC_ALL".into(), "C".into()),
        ]);
        let request = GitCommandRequest {
            owner: self.owner.clone(),
            operation: format!(
                "forge.github.conflict.{kind:?}:{}#{}",
                self.repository, self.number
            ),
            program: "git".into(),
            cwd: root.clone(),
            arguments: arguments.clone(),
            environment: environment.clone(),
            input: None,
        };
        let mut command = tokio::select! {
            _ = self.cancel.wait_cancelled() => return Err(ForgeError::Cancelled.into()),
            result = tokio::time::timeout(Duration::from_secs(5), (self.authority)(request, self.cancel.clone())) => result.map_err(|_| ForgeError::TimedOut)?.map_err(|_| ForgeError::Denied)?,
        };
        if command.argv.len() != arguments.len() + 1
            || command.argv[1..] != arguments
            || !Path::new(&command.argv[0]).is_absolute()
            || command.cwd != root
            || command.input.is_some()
            || !conflict_git_environment(&command.environment, &environment, destination.as_deref())
            || command.timeout.is_zero()
            || command.output_limit == 0
            || environment
                .iter()
                .any(|(k, v)| command.environment.get(k) != Some(v))
        {
            return Err(ForgeError::Denied.into());
        }
        // Additional env is trusted ONLY from exact GitCommandAuthority, including
        // bounded HTTP auth headers; never inherited from this process.
        command.timeout = command.timeout.min(Duration::from_secs(60));
        command.output_limit = command.output_limit.min(CONFLICT_BYTES).min(self.budget);
        // From this point every push failure is uncertain, including cancellation
        // and timeout; a lost acknowledgement cannot authorize a second dispatch.
        let push = kind == ConflictEffectKind::Push;
        if self.lease.owner() != self.owner || self.lease.root() != root {
            return Err(ForgeError::Denied.into());
        }
        self.push_dispatched |= push;
        let result = self.pool.run_captured(command, self.cancel.clone()).await;
        let result = match result {
            Ok(r) => r,
            Err(_) if push => return Err(ConflictError::PushUncertain),
            Err(_) => return Err(ForgeError::CapacityOrProcessFailure.into()),
        };
        self.budget = self
            .budget
            .saturating_sub(result.stdout.len() + result.stderr.len());
        if push
            && (result.cancelled
                || result.timed_out
                || result.truncated
                || result.exit_code != Some(0))
        {
            return Err(ConflictError::PushUncertain);
        }
        if result.cancelled {
            return Err(ForgeError::Cancelled.into());
        }
        if result.timed_out {
            return Err(ForgeError::TimedOut.into());
        }
        if result.truncated {
            return Err(ForgeError::OutputLimit.into());
        }
        let code = result.exit_code.ok_or(ForgeError::CommandFailed)?;
        if code != 0 && !(allow_merge_conflicts && code == 1) {
            return Err(ForgeError::CommandFailed.into());
        }
        Ok((code, result.stdout))
    }
    async fn local(
        &mut self,
        kind: ConflictEffectKind,
        args: Vec<String>,
    ) -> ConflictResult<Vec<u8>> {
        self.run(kind, args, None, false).await.map(|(_, b)| b)
    }
    async fn stage_content(&mut self, oid: &Option<String>) -> ConflictResult<ConflictContent> {
        let Some(oid) = oid else {
            return Ok(ConflictContent::Missing);
        };
        // Blob IDs came from the bounded index, avoiding revision/path ambiguity.
        let data = self
            .local(
                ConflictEffectKind::Read,
                vec!["cat-file".into(), "blob".into(), oid.clone()],
            )
            .await?;
        Ok(conflict_content(data))
    }
    async fn execute(
        &mut self,
        s: &ConflictSnapshot,
        choices: Option<&std::collections::BTreeMap<String, ConflictSide>>,
    ) -> ConflictResult<ConflictOutcome> {
        use ConflictEffectKind as K;
        self.local(
            K::Initialize,
            vec!["init".into(), "--template=".into(), ".".into()],
        )
        .await?;
        for (url, branch, target, oid) in [
            (&s.base_url, &s.base_branch, "base", &s.base_oid),
            (&s.head_url, &s.head_branch, "head", &s.head_oid),
        ] {
            self.run(
                K::Fetch,
                vec![
                    "fetch".into(),
                    "--no-tags".into(),
                    "--no-recurse-submodules".into(),
                    "--".into(),
                    url.clone(),
                    format!("+refs/heads/{branch}:refs/remotes/conflict/{target}"),
                ],
                Some(url.clone()),
                false,
            )
            .await?;
            let actual = self
                .local(
                    K::Read,
                    vec![
                        "rev-parse".into(),
                        "--verify".into(),
                        format!("refs/remotes/conflict/{target}^{{commit}}"),
                    ],
                )
                .await?;
            if actual.strip_suffix(b"\n").unwrap_or(&actual) != oid.as_bytes() {
                return Err(ConflictError::SnapshotChanged);
            }
        }
        self.local(
            K::Checkout,
            vec![
                "checkout".into(),
                "--detach".into(),
                "refs/remotes/conflict/head".into(),
                "--".into(),
            ],
        )
        .await?;
        let (merge_code, _) = self
            .run(
                K::Merge,
                vec![
                    "merge".into(),
                    "--no-edit".into(),
                    "--no-commit".into(),
                    "--no-ff".into(),
                    "refs/remotes/conflict/base".into(),
                    "--".into(),
                ],
                None,
                true,
            )
            .await?;
        let raw = self
            .local(K::Read, vec!["ls-files".into(), "-u".into(), "-z".into()])
            .await?;
        let stages = ConflictStages::parse(&raw)?;
        let had_conflicts = !stages.0.is_empty();
        if had_conflicts && merge_code == 0 {
            return Err(ConflictError::InvalidStages);
        }
        if let Some(choices) = choices {
            stages.validate_choices(choices)?;
        }
        if had_conflicts && choices.is_none() {
            let mut files = Vec::new();
            for (path, slots) in &stages.0 {
                let ours = self.stage_content(&slots[1]).await?;
                let theirs = self.stage_content(&slots[2]).await?;
                files.push(ConflictFile {
                    path: path.clone(),
                    ours,
                    theirs,
                });
            }
            return Ok(ConflictOutcome::Conflicts(files));
        }
        if let Some(choices) = choices {
            for (path, slots) in &stages.0 {
                let side = choices.get(path).ok_or(ConflictError::InvalidChoices)?;
                let (index, flag) = match side {
                    ConflictSide::Ours => (1, "--ours"),
                    ConflictSide::Theirs => (2, "--theirs"),
                };
                if slots[index].is_some() {
                    self.local(
                        K::Resolve,
                        vec!["checkout".into(), flag.into(), "--".into(), path.clone()],
                    )
                    .await?;
                    self.local(K::Resolve, vec!["add".into(), "--".into(), path.clone()])
                        .await?;
                } else {
                    self.local(
                        K::Resolve,
                        vec![
                            "rm".into(),
                            "-f".into(),
                            "--ignore-unmatch".into(),
                            "--".into(),
                            path.clone(),
                        ],
                    )
                    .await?;
                    // git rm already stages deletion; add -A on an untracked,
                    // now absent path can fail and is unnecessary.
                }
            }
            let remaining = self
                .local(K::Read, vec!["ls-files".into(), "-u".into(), "-z".into()])
                .await?;
            if !remaining.is_empty() {
                return Err(ConflictError::InvalidStages);
            }
        }
        // A failed merge without stages is a real failure, not placeholder success.
        // Inspect MERGE_HEAD using a zero-exit command; absent means already current
        // only when the merge itself succeeded. No swallowed commit failures.
        let (code, output) = self
            .run(
                K::Read,
                vec![
                    "rev-parse".into(),
                    "-q".into(),
                    "--verify".into(),
                    "MERGE_HEAD".into(),
                ],
                None,
                true,
            )
            .await?;
        if code == 0 {
            let oid = std::str::from_utf8(&output)
                .map_err(|_| ForgeError::MalformedResponse)?
                .trim_end_matches('\n');
            if oid != s.base_oid {
                return Err(ConflictError::SnapshotChanged);
            }
            self.local(
                K::Commit,
                vec![
                    "commit".into(),
                    "--no-edit".into(),
                    "-m".into(),
                    format!("Resolve merge conflicts with {}", s.base_branch),
                ],
            )
            .await?;
        } else if merge_code != 0 || had_conflicts {
            return Err(ForgeError::CommandFailed.into());
        }
        self.run(
            K::Push,
            vec![
                "push".into(),
                "--porcelain".into(),
                format!(
                    "--force-with-lease=refs/heads/{}:{}",
                    s.head_branch, s.head_oid
                ),
                "--".into(),
                s.head_url.clone(),
                format!("HEAD:refs/heads/{}", s.head_branch),
            ],
            Some(s.head_url.clone()),
            false,
        )
        .await?;
        Ok(if had_conflicts {
            ConflictOutcome::Pushed
        } else {
            ConflictOutcome::Merged
        })
    }
}
impl GitHubPullRequestService {
    /// Each invocation starts afresh under a new exclusive lease and revalidates
    /// the PR and both branch hashes. The host owns admission, total deadline and
    /// lease cleanup. Base repository access never implies fork write permission.
    pub async fn resolve_conflicts(
        &self,
        number: u64,
        lease: &mut dyn ConflictWorkspaceLease,
        choices: Option<&std::collections::BTreeMap<String, ConflictSide>>,
        cancel: ProcessCancellation,
    ) -> ConflictResult<ConflictOutcome> {
        if !cfg!(unix) {
            return Err(ConflictError::UnsupportedWorkspace);
        }
        let mut args = self.number_args("view", number)?;
        args.extend([
            "--json".into(),
            "number,url,state,baseRefName,headRefName,baseRefOid,headRefOid,headRepository".into(),
        ]);
        if cancel.is_cancelled() {
            return Err(ForgeError::Cancelled.into());
        }
        let (owner, session_root, authority, pool) = self.session.conflict_context();
        let root = lease.root();
        if lease.owner() != owner
            || !root.is_absolute()
            || root == session_root
            || root.parent().is_none()
            || root.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::CurDir
                )
            })
        {
            return Err(ForgeError::Denied.into());
        }
        let value = self
            .session
            .gh_json("pr-conflict-snapshot", args, cancel.clone())
            .await?;
        let snapshot = ConflictSnapshot::parse(&value, self.session.repository(), number)?;
        let mut git = ConflictGit {
            lease,
            authority,
            pool,
            owner: owner.to_owned(),
            repository: self.repository_target(),
            number,
            cancel,
            budget: 16 * 1024 * 1024,
            commands: 0,
            push_dispatched: false,
        };
        // Deadline covers fixture/host approvals and the complete serial flow;
        // dropping the future kills any active child via the shared executor.
        match tokio::time::timeout(
            std::time::Duration::from_secs(300),
            git.execute(&snapshot, choices),
        )
        .await
        {
            Ok(Ok(ConflictOutcome::Conflicts(mut files))) => {
                for file in &mut files {
                    for side in [&mut file.ours, &mut file.theirs] {
                        if let ConflictContent::Text(text) = side {
                            *text = self.session.redact(text);
                        }
                    }
                }
                Ok(ConflictOutcome::Conflicts(files))
            }
            Ok(result) => result,
            Err(_) if git.push_dispatched => Err(ConflictError::PushUncertain),
            Err(_) => Err(ForgeError::TimedOut.into()),
        }
    }
}

#[cfg(test)]
mod conflict_tests {
    use super::*;
    use crate::{
        execution::process_runner::{ProcessPool, ProcessRequest},
        routes::git::{GitCommandAuthority, GitCommandRequest},
    };
    use std::{
        collections::BTreeMap,
        num::NonZeroU16,
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
        time::Duration,
    };

    const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    fn snapshot() -> ConflictSnapshot {
        ConflictSnapshot {
            base_url: "https://github.com/base/repo".into(),
            head_url: "https://github.com/fork/repo".into(),
            base_branch: "main".into(),
            head_branch: "topic".into(),
            base_oid: A.into(),
            head_oid: B.into(),
        }
    }
    fn stage(stage: u8, path: &str) -> String {
        format!("100644 {A} {stage}\t{path}\0")
    }
    #[test]
    fn stages_preserve_text_binary_and_missing_sides() {
        let parsed = ConflictStages::parse(
            format!(
                "{}{}{}",
                stage(1, "file with spaces"),
                stage(2, "file with spaces"),
                stage(3, "deleted")
            )
            .as_bytes(),
        )
        .unwrap();
        assert!(parsed.0["deleted"][1].is_none());
        assert_eq!(
            conflict_content(b"hello\n".to_vec()),
            ConflictContent::Text("hello\n".into())
        );
        assert_eq!(conflict_content(vec![0, 1]), ConflictContent::Binary);
        assert_eq!(conflict_content(vec![255]), ConflictContent::Binary);
    }
    #[test]
    fn rejects_unsafe_paths_modes_framing_and_duplicate_stages() {
        for path in [
            "../x",
            "/x",
            "x/../../y",
            "a//b",
            ".git/config",
            "a/.GIT/b",
            "x\\y",
            "C:x",
            "a\tb",
            "-flag",
            "a/.",
            "a/..",
            "x.",
        ] {
            assert!(
                ConflictStages::parse(stage(2, path).as_bytes()).is_err(),
                "{path}"
            );
        }
        for bytes in [
            stage(2, "x").replace("100644", "120000"),
            stage(2, "x").replace("100644", "160000"),
            stage(2, "x").trim_end_matches('\0').to_owned(),
            format!("{}{}", stage(2, "x"), stage(2, "x")),
            format!("{}\0", stage(2, "x")),
            stage(1, "x"),
        ] {
            assert!(ConflictStages::parse(bytes.as_bytes()).is_err());
        }
    }
    #[test]
    fn choices_require_exact_membership_and_every_path() {
        let stages = ConflictStages::parse(stage(2, "x").as_bytes()).unwrap();
        for choices in [
            BTreeMap::new(),
            BTreeMap::from([("extra".into(), ConflictSide::Ours)]),
            BTreeMap::from([
                ("x".into(), ConflictSide::Ours),
                ("extra".into(), ConflictSide::Theirs),
            ]),
        ] {
            assert_eq!(
                stages.validate_choices(&choices),
                Err(ConflictError::InvalidChoices)
            );
        }
        stages
            .validate_choices(&BTreeMap::from([("x".into(), ConflictSide::Theirs)]))
            .unwrap();
    }
    fn snapshot_json() -> Value {
        json!({"number":7,"url":"https://github.com/base/repo/pull/7","state":"OPEN","baseRefName":"main","headRefName":"topic","baseRefOid":A,"headRefOid":B,"headRepository":{"url":"https://github.com/fork/repo"}})
    }
    #[test]
    fn open_snapshot_validates_identity_hashes_and_https_fork() {
        let repo =
            super::super::git_forge::ForgeRepository::new("github.com", "base", "repo").unwrap();
        assert_eq!(
            ConflictSnapshot::parse(&snapshot_json(), &repo, 7)
                .unwrap()
                .head_url,
            "https://github.com/fork/repo"
        );
        for remote in [
            "http://github.com/fork/repo",
            "https://evil.test/fork/repo",
            "https://token@github.com/fork/repo",
            "https://github.com/fork/repo?x",
            "https://github.com/fork/%72epo",
            "https://github.com/fork/repo/../other",
        ] {
            let mut p = snapshot_json();
            p["headRepository"]["url"] = remote.into();
            assert!(ConflictSnapshot::parse(&p, &repo, 7).is_err(), "{remote}");
        }
        let mut p = snapshot_json();
        p["state"] = "CLOSED".into();
        assert!(matches!(
            ConflictSnapshot::parse(&p, &repo, 7),
            Err(ConflictError::NotOpen)
        ));
        p = snapshot_json();
        p["headRefOid"] = "main".into();
        assert!(ConflictSnapshot::parse(&p, &repo, 7).is_err());
        assert!(ConflictSnapshot::parse(&snapshot_json(), &repo, 8).is_err());
    }

    struct Lease {
        root: PathBuf,
        denied: Option<ConflictEffectKind>,
        effects: Vec<ConflictEffect>,
    }
    impl ConflictWorkspaceLease for Lease {
        fn owner(&self) -> &str {
            "alice"
        }
        fn root(&self) -> &Path {
            &self.root
        }
        fn approve<'a>(
            &'a mut self,
            effect: ConflictEffect,
            _: ProcessCancellation,
        ) -> futures_util::future::BoxFuture<'a, ForgeResult<()>> {
            let denied = self.denied.as_ref() == Some(&effect.kind);
            self.effects.push(effect);
            Box::pin(async move {
                if denied {
                    Err(ForgeError::Denied)
                } else {
                    Ok(())
                }
            })
        }
    }
    // Executes a deterministic Git protocol fixture through the real ProcessPool.
    // All files are anchored to the manifest's project root, never CWD or temp.
    #[cfg(unix)]
    struct Fixture {
        root: PathBuf,
        script: PathBuf,
        calls: Arc<Mutex<Vec<GitCommandRequest>>>,
    }
    #[cfg(unix)]
    impl Fixture {
        fn new() -> Self {
            use std::{
                os::unix::fs::PermissionsExt,
                sync::atomic::{AtomicU64, Ordering},
            };
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join(
                    "../../.jait/artifacts/gateway-rust/parallel-implementation/conflict-fixtures",
                )
                .join(format!(
                    "{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
            std::fs::create_dir_all(&root).unwrap();
            let root = std::fs::canonicalize(root).unwrap();
            let script = root.join("git-fixture");
            std::fs::write(&script,r#"#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in init|fetch|rev-parse|checkout|merge|ls-files|cat-file|add|rm|commit|push) break;; esac
  shift
done
cmd="$1"
shift
case "$cmd" in
init|fetch|add) exit 0;;
commit) if [ "$FIXTURE_MODE" = commit-failed ]; then exit 1; fi;;
rev-parse)
  case "$*" in
  *base*) printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';;
  *head*) printf 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n';;
  *MERGE_HEAD*) if [ "$FIXTURE_MODE" = current ]; then exit 1; fi; printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n';;
  esac;;
checkout) if [ "$1" = --ours ] || [ "$1" = --theirs ]; then : > resolved; fi;;
merge)
  case "$FIXTURE_MODE" in clean|current) exit 0;; cancel) exec /bin/sleep 20;; failed) exit 2;; esac
  exit 1;;
ls-files)
  if [ -e resolved ] || [ "$FIXTURE_MODE" = clean ] || [ "$FIXTURE_MODE" = current ]; then exit 0; fi
  if [ "$FIXTURE_MODE" != delete ]; then printf '100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2\tfile\000'; fi
  printf '100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 3\tfile\000';;
cat-file)
  if [ "$FIXTURE_MODE" = read-error ]; then exit 1; fi
  if [ "$FIXTURE_MODE" = binary ]; then printf '\000\377'; else printf 'text content\n'; fi;;
rm) : > resolved;;
push) if [ "$FIXTURE_MODE" = uncertain ]; then exit 1; fi;;
*) exit 9;;
esac
"#).unwrap();
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).unwrap();
            Self {
                root,
                script,
                calls: Arc::new(Mutex::new(Vec::new())),
            }
        }
        fn authority(&self, mode: &str) -> GitCommandAuthority {
            let script = self.script.clone();
            let mode = mode.to_owned();
            let calls = self.calls.clone();
            Arc::new(move |r, _| {
                calls.lock().unwrap().push(r.clone());
                let mut argv = vec![script.to_string_lossy().into_owned()];
                argv.extend(r.arguments);
                let mut environment = r.environment;
                environment.insert("FIXTURE_MODE".into(), mode.clone());
                Box::pin(async move {
                    Ok(ProcessRequest {
                        argv,
                        cwd: r.cwd,
                        environment,
                        input: r.input,
                        timeout: Duration::from_secs(2),
                        output_limit: CONFLICT_BYTES,
                    })
                })
            })
        }
        fn lease(&self, denied: Option<ConflictEffectKind>) -> Lease {
            Lease {
                root: self.root.clone(),
                denied,
                effects: vec![],
            }
        }
    }
    #[cfg(unix)]
    fn engine<'a>(
        f: &Fixture,
        lease: &'a mut Lease,
        mode: &str,
        cancel: ProcessCancellation,
    ) -> ConflictGit<'a> {
        ConflictGit {
            lease,
            authority: f.authority(mode),
            pool: ProcessPool::new(NonZeroU16::new(1).unwrap()),
            owner: "alice".into(),
            repository: "github.com/base/repo".into(),
            number: 7,
            cancel,
            budget: 16 * 1024 * 1024,
            commands: 0,
            push_dispatched: false,
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn supervised_text_binary_and_delete_preview_fixtures() {
        for mode in ["text", "binary", "delete"] {
            let f = Fixture::new();
            let mut lease = f.lease(None);
            let outcome = engine(&f, &mut lease, mode, ProcessCancellation::default())
                .execute(&snapshot(), None)
                .await
                .unwrap();
            let ConflictOutcome::Conflicts(files) = outcome else {
                panic!("expected conflicts")
            };
            assert_eq!(files.len(), 1);
            match mode {
                "binary" => assert_eq!(files[0].ours, ConflictContent::Binary),
                "delete" => assert_eq!(files[0].ours, ConflictContent::Missing),
                _ => assert_eq!(
                    files[0].ours,
                    ConflictContent::Text("text content\n".into())
                ),
            }
            assert!(
                !lease
                    .effects
                    .iter()
                    .any(|e| e.kind == ConflictEffectKind::Push)
            );
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn supervised_complete_text_and_delete_choices_commit_and_push() {
        for (mode, side) in [
            ("text", ConflictSide::Theirs),
            ("delete", ConflictSide::Ours),
        ] {
            let f = Fixture::new();
            let mut lease = f.lease(None);
            let choices = BTreeMap::from([("file".into(), side)]);
            assert_eq!(
                engine(&f, &mut lease, mode, ProcessCancellation::default())
                    .execute(&snapshot(), Some(&choices))
                    .await
                    .unwrap(),
                ConflictOutcome::Pushed
            );
            let calls = f.calls.lock().unwrap();
            assert!(
                calls
                    .iter()
                    .any(|r| r.arguments.iter().any(|a| a == "commit"))
            );
            if mode == "delete" {
                assert!(calls.iter().any(|r| r.arguments.iter().any(|a| a == "rm")));
            }
            let push = lease
                .effects
                .iter()
                .find(|e| e.kind == ConflictEffectKind::Push)
                .unwrap();
            assert_eq!(
                push.destination.as_deref(),
                Some("https://github.com/fork/repo")
            );
            assert!(push.arguments.iter().any(|a| a == "HEAD:refs/heads/topic"));
            assert!(
                push.arguments
                    .iter()
                    .any(|a| a == &format!("--force-with-lease=refs/heads/topic:{B}"))
            );
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn denied_fork_push_and_uncertain_push_are_never_success_or_retried() {
        for denied in [true, false] {
            let f = Fixture::new();
            let mut lease = f.lease(if denied {
                Some(ConflictEffectKind::Push)
            } else {
                None
            });
            let choices = BTreeMap::from([("file".into(), ConflictSide::Ours)]);
            let result = engine(&f, &mut lease, "uncertain", ProcessCancellation::default())
                .execute(&snapshot(), Some(&choices))
                .await;
            assert_eq!(
                result,
                Err(if denied {
                    ConflictError::Forge(ForgeError::Denied)
                } else {
                    ConflictError::PushUncertain
                })
            );
            let calls = f.calls.lock().unwrap();
            assert_eq!(
                calls
                    .iter()
                    .filter(|r| r.arguments.iter().any(|a| a == "push"))
                    .count(),
                if denied { 0 } else { 1 }
            );
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn clean_and_already_current_merges_do_not_swallow_errors() {
        for mode in ["clean", "current", "failed"] {
            let f = Fixture::new();
            let mut lease = f.lease(None);
            let result = engine(&f, &mut lease, mode, ProcessCancellation::default())
                .execute(&snapshot(), None)
                .await;
            if mode == "failed" {
                assert_eq!(result, Err(ForgeError::CommandFailed.into()));
            } else {
                assert_eq!(result, Ok(ConflictOutcome::Merged));
            }
            let calls = f.calls.lock().unwrap();
            assert_eq!(
                calls
                    .iter()
                    .filter(|r| r.arguments.iter().any(|a| a == "commit"))
                    .count(),
                if mode == "clean" { 1 } else { 0 }
            );
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_terminates_supervised_merge_and_stops_effects() {
        let f = Fixture::new();
        let mut lease = f.lease(None);
        let cancel = ProcessCancellation::default();
        let trigger = cancel.clone();
        let calls = f.calls.clone();
        let task = tokio::spawn(async move {
            for _ in 0..200 {
                if calls
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|r| r.arguments.iter().any(|a| a == "merge"))
                {
                    trigger.cancel();
                    return;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            panic!("merge not dispatched");
        });
        let result = engine(&f, &mut lease, "cancel", cancel)
            .execute(&snapshot(), None)
            .await;
        task.await.unwrap();
        assert_eq!(result, Err(ForgeError::Cancelled.into()));
        assert!(
            !lease
                .effects
                .iter()
                .any(|e| e.kind == ConflictEffectKind::Push)
        );
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn missing_choices_denied_initialization_and_snapshot_drift_stop_before_writes() {
        let f = Fixture::new();
        let mut lease = f.lease(Some(ConflictEffectKind::Initialize));
        assert_eq!(
            engine(&f, &mut lease, "text", ProcessCancellation::default())
                .execute(&snapshot(), None)
                .await,
            Err(ForgeError::Denied.into())
        );
        assert!(f.calls.lock().unwrap().is_empty());
        let f = Fixture::new();
        let mut lease = f.lease(None);
        let mut changed = snapshot();
        changed.base_oid = B.into();
        assert_eq!(
            engine(&f, &mut lease, "text", ProcessCancellation::default())
                .execute(&changed, None)
                .await,
            Err(ConflictError::SnapshotChanged)
        );
        assert!(
            !lease
                .effects
                .iter()
                .any(|e| e.kind == ConflictEffectKind::Checkout)
        );
        let f = Fixture::new();
        let mut lease = f.lease(None);
        assert_eq!(
            engine(&f, &mut lease, "text", ProcessCancellation::default())
                .execute(&snapshot(), Some(&BTreeMap::new()))
                .await,
            Err(ConflictError::InvalidChoices)
        );
        assert!(
            !lease
                .effects
                .iter()
                .any(|e| e.kind == ConflictEffectKind::Resolve)
        );
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn exact_command_denial_and_tampering_never_spawn() {
        for mode in [
            "denied",
            "argv",
            "cwd",
            "environment",
            "input",
            "worktree",
            "config",
        ] {
            let f = Fixture::new();
            let mut lease = f.lease(None);
            let mut git = engine(&f, &mut lease, "clean", ProcessCancellation::default());
            let base = f.authority("clean");
            git.authority = Arc::new(move |request, cancel| {
                let base = base.clone();
                Box::pin(async move {
                    if mode == "denied" {
                        return Err("denied".into());
                    }
                    let mut command = base(request, cancel).await?;
                    match mode {
                        "argv" => command.argv.push("--unsafe".into()),
                        "cwd" => command.cwd = PathBuf::from("/"),
                        "environment" => {
                            command.environment.remove("GIT_TERMINAL_PROMPT");
                        }
                        "input" => command.input = Some(vec![1]),
                        "worktree" => {
                            command
                                .environment
                                .insert("GIT_WORK_TREE".into(), "/owned-checkout".into());
                        }
                        "config" => {
                            command
                                .environment
                                .insert("GIT_CONFIG_COUNT".into(), "1".into());
                            command
                                .environment
                                .insert("GIT_CONFIG_KEY_0".into(), "core.worktree".into());
                            command
                                .environment
                                .insert("GIT_CONFIG_VALUE_0".into(), "/owned-checkout".into());
                        }
                        _ => unreachable!(),
                    }
                    Ok(command)
                })
            });
            assert_eq!(
                git.execute(&snapshot(), None).await,
                Err(ForgeError::Denied.into())
            );
            assert!(!git.push_dispatched);
            assert_eq!(git.commands, 1);
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn cancelled_push_dispatch_is_uncertain_without_retry() {
        let f = Fixture::new();
        let mut lease = f.lease(None);
        let cancel = ProcessCancellation::default();
        let mut git = engine(&f, &mut lease, "clean", cancel.clone());
        let base = f.authority("clean");
        let trigger = cancel.clone();
        git.authority = Arc::new(move |request, token| {
            let base = base.clone();
            let trigger = trigger.clone();
            Box::pin(async move {
                if request.arguments.iter().any(|a| a == "push") {
                    trigger.cancel();
                }
                base(request, token).await
            })
        });
        assert_eq!(
            git.execute(&snapshot(), None).await,
            Err(ConflictError::PushUncertain)
        );
        assert!(git.push_dispatched);
        assert_eq!(
            f.calls
                .lock()
                .unwrap()
                .iter()
                .filter(|r| r.arguments.iter().any(|a| a == "push"))
                .count(),
            1
        );
    }
    #[test]
    fn stage_output_and_file_count_are_bounded() {
        assert_eq!(
            ConflictStages::parse(&vec![b'x'; CONFLICT_BYTES + 1]).unwrap_err(),
            ConflictError::InvalidStages
        );
        let records = (0..=CONFLICT_FILES)
            .map(|i| stage(2, &format!("file{i}")))
            .collect::<String>();
        assert_eq!(
            ConflictStages::parse(records.as_bytes()).unwrap_err(),
            ConflictError::InvalidStages
        );
    }
    #[test]
    fn credential_config_cannot_redirect_workspace_or_disable_tls() {
        let required = std::collections::HashMap::new();
        let mut env = std::collections::HashMap::from([
            ("GIT_CONFIG_COUNT".into(), "1".into()),
            ("GIT_CONFIG_KEY_0".into(), "http.extraHeader".into()),
            (
                "GIT_CONFIG_VALUE_0".into(),
                "Authorization: Basic fixture".into(),
            ),
        ]);
        assert!(conflict_git_environment(
            &env,
            &required,
            Some("https://github.com/fork/repo")
        ));
        assert!(!conflict_git_environment(&env, &required, None));
        env.insert(
            "GIT_CONFIG_VALUE_0".into(),
            "Authorization: fixture\nInjected: evil".into(),
        );
        assert!(!conflict_git_environment(
            &env,
            &required,
            Some("https://github.com/fork/repo")
        ));
        for key in [
            "core.worktree",
            "http.sslVerify",
            "credential.helper",
            "filter.evil.smudge",
        ] {
            env.insert("GIT_CONFIG_KEY_0".into(), key.into());
            assert!(!conflict_git_environment(
                &env,
                &required,
                Some("https://github.com/fork/repo")
            ));
        }
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn blob_read_and_commit_failures_are_not_missing_or_success() {
        for mode in ["read-error", "commit-failed"] {
            let f = Fixture::new();
            let mut lease = f.lease(None);
            let choices = BTreeMap::from([("file".into(), ConflictSide::Ours)]);
            let selection = if mode == "commit-failed" {
                Some(&choices)
            } else {
                None
            };
            assert_eq!(
                engine(&f, &mut lease, mode, ProcessCancellation::default())
                    .execute(&snapshot(), selection)
                    .await,
                Err(ForgeError::CommandFailed.into())
            );
            assert!(
                !lease
                    .effects
                    .iter()
                    .any(|e| e.kind == ConflictEffectKind::Push)
            );
        }
    }
    #[test]
    fn normalized_binary_and_delete_results_match_ts_shape() {
        let value = ConflictOutcome::Conflicts(vec![
            ConflictFile {
                path: "binary".into(),
                ours: ConflictContent::Binary,
                theirs: ConflictContent::Text("hidden".into()),
            },
            ConflictFile {
                path: "delete".into(),
                ours: ConflictContent::Missing,
                theirs: ConflictContent::Text("kept".into()),
            },
        ])
        .into_json();
        assert_eq!(value["status"], "conflicts");
        assert_eq!(
            value["files"][0],
            json!({"path":"binary","binary":true,"ours":"","theirs":""})
        );
        assert_eq!(
            value["files"][1],
            json!({"path":"delete","binary":false,"ours":"","theirs":"kept"})
        );
    }
}

#[cfg(all(test, unix))]
#[path = "github_pull_requests_real_git_tests.rs"]
mod real_git_tests;
