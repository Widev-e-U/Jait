//! Native forge operations. Reuses the canonical Git command authority and process pool.
//! No ambient credentials, shell commands, CLI login writes, or automatic fallbacks.
//! Runtime must authorize owner/root/host/repository plus each exact command, including
//! CLI configuration, credential helpers, proxies, redirects and network destinations.
use crate::{
    execution::process_runner::{ProcessCancellation, ProcessPool},
    routes::git::{GitCommandAuthority, GitCommandRequest},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::HashMap, path::PathBuf, time::Duration};

pub type ForgeResult<T> = Result<T, ForgeError>;
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ForgeError {
    InvalidInput,
    AuthenticationRequired,
    Denied,
    Cancelled,
    TimedOut,
    CapacityOrProcessFailure,
    OutputLimit,
    MalformedResponse,
    /// The remote effect may have succeeded. Do not retry writes automatically.
    CommandFailed,
    UnsupportedProvider,
}
impl std::fmt::Display for ForgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ForgeError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ForgeProvider {
    Github,
    Gitlab,
    Gitea,
    AzureDevops,
    Bitbucket,
}

/// A normalized, explicit repository selection. Construction validates syntax;
/// authorization of ownership and destinations belongs to GitCommandAuthority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForgeRepository {
    host: String,
    owner: String,
    repo: String,
    azure_project: Option<String>,
}
impl ForgeRepository {
    pub fn new(host: &str, owner: &str, repo: &str) -> ForgeResult<Self> {
        if host.len() > 253
            || host.is_empty()
            || host.split('.').any(|s| {
                s.is_empty()
                    || s.len() > 63
                    || s.starts_with('-')
                    || s.ends_with('-')
                    || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
            || !slug(owner)
            || !slug(repo)
        {
            return Err(ForgeError::InvalidInput);
        }
        Ok(Self {
            host: host.to_ascii_lowercase(),
            owner: owner.into(),
            repo: repo.into(),
            azure_project: None,
        })
    }
    /// Explicit Azure selection, including legacy organization.visualstudio.com URLs.
    /// Project/repository names may contain spaces, but never URL/path syntax.
    pub fn azure(host: &str, organization: &str, project: &str, repo: &str) -> ForgeResult<Self> {
        if !slug(organization) || !azure_component(project) || !azure_component(repo) {
            return Err(ForgeError::InvalidInput);
        }
        let host = host.to_ascii_lowercase();
        if host != "dev.azure.com"
            && host != format!("{}.visualstudio.com", organization.to_ascii_lowercase())
        {
            return Err(ForgeError::InvalidInput);
        }
        Ok(Self {
            host,
            owner: organization.into(),
            repo: repo.into(),
            azure_project: Some(project.into()),
        })
    }
    /// GitLab permits nested groups. The caller still supplies a canonical parsed
    /// remote; this is validation, never provider inference or target authorization.
    pub fn gitlab(host: &str, namespace: &str, repo: &str) -> ForgeResult<Self> {
        if namespace.len() > 1024 || namespace.split('/').any(|part| !slug(part)) {
            return Err(ForgeError::InvalidInput);
        }
        let mut selection = Self::new(host, namespace.split('/').next().unwrap_or(""), repo)?;
        selection.owner = namespace.into();
        Ok(selection)
    }
    pub fn organization_url(&self) -> ForgeResult<String> {
        if self.azure_project.is_none() {
            return Err(ForgeError::InvalidInput);
        }
        Ok(if self.host == "dev.azure.com" {
            format!("https://{}/{}", self.host, self.owner)
        } else {
            format!("https://{}", self.host)
        })
    }
    pub fn host(&self) -> &str {
        &self.host
    }
    pub fn target(&self) -> String {
        if self.azure_project.is_some() {
            return self.web_url().trim_start_matches("https://").to_owned();
        }
        format!("{}/{}/{}", self.host, self.owner, self.repo)
    }
    pub fn web_url(&self) -> String {
        if let Some(project) = &self.azure_project {
            let mut url =
                url::Url::parse(&format!("https://{}", self.host)).expect("validated host");
            let mut path = url.path_segments_mut().expect("HTTPS base");
            if self.host == "dev.azure.com" {
                path.push(&self.owner);
            }
            path.extend([project.as_str(), "_git", self.repo.as_str()]);
            drop(path);
            return url.into();
        }
        format!("https://{}", self.target())
    }
    pub fn api_path(&self) -> String {
        format!("repos/{}/{}", self.owner, self.repo)
    }
    pub fn create_pr_url(
        &self,
        provider: ForgeProvider,
        head: &str,
        base: Option<&str>,
    ) -> ForgeResult<String> {
        branch(head)?;
        branch(base.unwrap_or("main"))?;
        if (provider == ForgeProvider::AzureDevops) != self.azure_project.is_some() {
            return Err(ForgeError::InvalidInput);
        }
        let mut url = url::Url::parse(&self.web_url()).map_err(|_| ForgeError::InvalidInput)?;
        match provider {
            ForgeProvider::Github => {
                url.path_segments_mut()
                    .map_err(|_| ForgeError::InvalidInput)?
                    .push("compare")
                    .push(&format!("{}...{}", base.unwrap_or("main"), head));
                url.query_pairs_mut().append_pair("expand", "1");
            }
            ForgeProvider::Gitlab => {
                url.path_segments_mut()
                    .map_err(|_| ForgeError::InvalidInput)?
                    .extend(["-", "merge_requests", "new"]);
                url.query_pairs_mut()
                    .append_pair("merge_request[source_branch]", head);
            }
            ForgeProvider::Gitea => {
                url.path_segments_mut()
                    .map_err(|_| ForgeError::InvalidInput)?
                    .push("compare")
                    .push(&format!("{}...{}", base.unwrap_or("main"), head));
            }
            ForgeProvider::Bitbucket => {
                url.path_segments_mut()
                    .map_err(|_| ForgeError::InvalidInput)?
                    .extend(["pull-requests", "new"]);
                url.query_pairs_mut().append_pair("source", head);
            }
            ForgeProvider::AzureDevops => {
                url.path_segments_mut()
                    .map_err(|_| ForgeError::InvalidInput)?
                    .push("pullrequestcreate");
                url.query_pairs_mut()
                    .append_pair("sourceRef", &format!("refs/heads/{head}"));
                if let Some(base) = base {
                    url.query_pairs_mut()
                        .append_pair("targetRef", &format!("refs/heads/{base}"));
                }
            }
        }
        Ok(url.into())
    }
}
fn azure_component(s: &str) -> bool {
    !s.trim().is_empty()
        && s.len() <= 255
        && s != "."
        && s != ".."
        && !s.starts_with('-')
        && !s.chars().any(|c| c.is_control() || "/\\?#%:".contains(c))
}
impl ForgeProvider {
    /// Matches the TS factory; no global cache containing another owner's credentials.
    pub fn from_selector(selector: &str) -> Option<Self> {
        match selector {
            "github" => Some(Self::Github),
            "gitlab" => Some(Self::Gitlab),
            "gitea" => Some(Self::Gitea),
            "azure-devops" => Some(Self::AzureDevops),
            "bitbucket" => Some(Self::Bitbucket),
            _ => None,
        }
    }
    /// Compatibility aliases for the canonical *owner-scoped* credential resolver.
    /// These names never cause reads from the process environment here.
    pub fn credential_aliases(self) -> &'static [&'static str] {
        match self {
            Self::Github => &["GH_TOKEN", "GITHUB_TOKEN"],
            Self::Gitlab => &["GITLAB_TOKEN", "GITLAB_PAT"],
            Self::Gitea => &["GITEA_TOKEN", "GITEA_PAT"],
            Self::AzureDevops => &["AZURE_DEVOPS_PAT", "AZURE_DEVOPS_TOKEN"],
            Self::Bitbucket => &["BITBUCKET_TOKEN", "BITBUCKET_APP_PASSWORD"],
        }
    }
}
fn slug(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 255
        && s != "."
        && s != ".."
        && !s.starts_with('-')
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
pub(crate) fn branch(s: &str) -> ForgeResult<()> {
    if s.is_empty()
        || s.len() > 1024
        || s == "@"
        || s.starts_with('-')
        || s.starts_with('/')
        || s.ends_with('/')
        || s.ends_with('.')
        || s.contains("..")
        || s.contains("@{")
        || s.contains("//")
        || s.split('/')
            .any(|p| p.starts_with('.') || p.ends_with(".lock"))
        || s.chars().any(|c| c.is_control() || " ~^:?*[\\".contains(c))
    {
        return Err(ForgeError::InvalidInput);
    }
    Ok(())
}
pub(crate) fn bounded_text(s: &str, max: usize) -> ForgeResult<()> {
    if s.len() > max || s.contains('\0') {
        Err(ForgeError::InvalidInput)
    } else {
        Ok(())
    }
}

/// One owner-scoped repository and credential, provided by the existing user-secret
/// or installation-token service. Intentionally neither Debug nor Serialize.
pub struct ForgeSession {
    owner: String,
    root: PathBuf,
    repository: ForgeRepository,
    token: String,
    authority: GitCommandAuthority,
    pool: ProcessPool,
}
impl ForgeSession {
    pub fn new(
        owner: String,
        root: PathBuf,
        repository: ForgeRepository,
        token: String,
        authority: GitCommandAuthority,
        pool: ProcessPool,
    ) -> ForgeResult<Self> {
        if owner.trim().is_empty()
            || owner.len() > 512
            || owner.chars().any(char::is_control)
            || !root.is_absolute()
            || root
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(ForgeError::InvalidInput);
        }
        if token.trim().is_empty() {
            return Err(ForgeError::AuthenticationRequired);
        }
        if token.len() > 16 * 1024 || token.chars().any(char::is_control) {
            return Err(ForgeError::InvalidInput);
        }
        Ok(Self {
            owner,
            root,
            repository,
            token,
            authority,
            pool,
        })
    }
    pub fn repository(&self) -> &ForgeRepository {
        &self.repository
    }
    pub(crate) fn redact(&self, text: &str) -> String {
        text.replace(&self.token, "[REDACTED]")
    }
    /// Reauthorizes every effect, including reads. The callback must inspect exact
    /// argv/stdin, repository and root at execution time (symlinks and revocation).
    pub(crate) async fn gh(
        &self,
        operation: &str,
        args: Vec<String>,
        input: Option<String>,
        limit: usize,
        cancel: ProcessCancellation,
    ) -> ForgeResult<String> {
        if cancel.is_cancelled() {
            return Err(ForgeError::Cancelled);
        }
        if args.iter().any(|s| s.contains('\0'))
            || args.len() > 100
            || args.iter().map(String::len).sum::<usize>() > 64 * 1024
            || input
                .as_ref()
                .is_some_and(|s| s.len() > 1024 * 1024 || s.contains('\0'))
            || limit == 0
            || limit > 10 * 1024 * 1024
        {
            return Err(ForgeError::InvalidInput);
        }
        if self.repository.azure_project.is_some() {
            return Err(ForgeError::InvalidInput);
        }
        let mut environment = HashMap::from([
            ("GH_HOST".into(), self.repository.host.clone()),
            ("GH_PROMPT_DISABLED".into(), "1".into()),
            ("GH_PAGER".into(), "cat".into()),
            ("PAGER".into(), "cat".into()),
            ("GIT_TERMINAL_PROMPT".into(), "0".into()),
            ("GH_TOKEN".into(), self.token.clone()),
            ("GH_ENTERPRISE_TOKEN".into(), self.token.clone()),
        ]);
        // GH_TOKEN is used for github.com; enterprise must use its separate key.
        if self.repository.host != "github.com" {
            environment.remove("GH_TOKEN");
        } else {
            environment.remove("GH_ENTERPRISE_TOKEN");
        }
        self.command(
            "github",
            "gh",
            operation,
            args,
            input,
            limit,
            environment,
            cancel,
        )
        .await
    }
    // Mirrors the TS forge provider callback signature; bundling into a struct
    // would ripple through every forge implementation.
    #[allow(clippy::too_many_arguments)]
    async fn command(
        &self,
        provider: &str,
        program: &str,
        operation: &str,
        args: Vec<String>,
        input: Option<String>,
        limit: usize,
        environment: HashMap<String, String>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<String> {
        if cancel.is_cancelled() {
            return Err(ForgeError::Cancelled);
        }
        if args.len() > 100
            || args.iter().any(|s| s.contains('\0'))
            || args.iter().map(String::len).sum::<usize>() > 64 * 1024
            || input
                .as_ref()
                .is_some_and(|s| s.len() > 1024 * 1024 || s.contains('\0'))
            || limit == 0
            || limit > 10 * 1024 * 1024
        {
            return Err(ForgeError::InvalidInput);
        }
        let input = input.map(String::into_bytes);
        let request = GitCommandRequest {
            owner: self.owner.clone(),
            operation: format!("forge.{provider}.{operation}:{}", self.repository.target()),
            program: program.into(),
            cwd: self.root.clone(),
            arguments: args.clone(),
            environment: environment.clone(),
            input: input.clone(),
        };
        let authorized = tokio::select! {
            _ = cancel.wait_cancelled() => return Err(ForgeError::Cancelled),
            result = tokio::time::timeout(Duration::from_secs(5), (self.authority)(request, cancel.clone())) =>
                result.map_err(|_| ForgeError::TimedOut)?.map_err(|_| ForgeError::Denied)?,
        };
        // Only executable resolution and additional reviewed environment are allowed.
        // Never silently execute a different command or credential after consent.
        if authorized.timeout.is_zero()
            || authorized.output_limit == 0
            || authorized.argv.len() != args.len() + 1
            || authorized.argv[1..] != args
            || !PathBuf::from(&authorized.argv[0]).is_absolute()
            || authorized.cwd != self.root
            || authorized.input != input
            || environment
                .iter()
                .any(|(k, v)| authorized.environment.get(k) != Some(v))
            || (provider == "azure-devops"
                && authorized.environment.keys().any(|k| {
                    k.starts_with("AZURE_")
                        && k != "AZURE_CONFIG_DIR"
                        && !environment.contains_key(k)
                }))
            || ["GH_REPO", "GITHUB_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]
                .iter()
                .any(|k| authorized.environment.contains_key(*k))
            || (provider != "github" && authorized.environment.keys().any(|k| k.starts_with("GH_")))
            || (self.repository.host != "github.com"
                && authorized.environment.contains_key("GH_TOKEN"))
            || (self.repository.host == "github.com"
                && authorized.environment.contains_key("GH_ENTERPRISE_TOKEN"))
        {
            return Err(ForgeError::Denied);
        }
        let mut authorized = authorized;
        authorized.timeout = authorized.timeout.min(Duration::from_secs(30));
        authorized.output_limit = authorized.output_limit.min(limit);
        let result = self
            .pool
            .run_captured(authorized, cancel)
            .await
            .map_err(|_| ForgeError::CapacityOrProcessFailure)?;
        if result.cancelled {
            return Err(ForgeError::Cancelled);
        }
        if result.timed_out {
            return Err(ForgeError::TimedOut);
        }
        if result.truncated {
            return Err(ForgeError::OutputLimit);
        }
        if result.exit_code != Some(0) {
            return Err(ForgeError::CommandFailed);
        }
        let text = String::from_utf8(result.stdout).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(self.redact(&text))
    }
    // Conflict workspaces use the same scoped authority and shared supervised pool.
    // No credential is exported: the authority supplies destination-scoped Git auth.
    pub(crate) fn conflict_context(
        &self,
    ) -> (&str, &std::path::Path, GitCommandAuthority, ProcessPool) {
        (
            &self.owner,
            &self.root,
            self.authority.clone(),
            self.pool.clone(),
        )
    }
    pub(crate) async fn gh_json(
        &self,
        op: &str,
        args: Vec<String>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        let text = self.gh(op, args, None, 10 * 1024 * 1024, cancel).await?;
        let value: Value =
            serde_json::from_str(&text).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(redact_json(value, &self.token))
    }
    pub(crate) fn pr_args(&self, action: &str, selector: &str) -> Vec<String> {
        vec![
            "pr".into(),
            action.into(),
            selector.into(),
            "--repo".into(),
            self.repository.target(),
        ]
    }
}

pub struct GitHubForge {
    session: ForgeSession,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgePrInput {
    pub title: String,
    pub base_branch: String,
    pub head_branch: String,
    pub body: String,
}
impl GitHubForge {
    pub fn new(session: ForgeSession) -> Self {
        Self { session }
    }
    pub fn session(&self) -> &ForgeSession {
        &self.session
    }
    pub async fn check_cli_available(&self, cancel: ProcessCancellation) -> ForgeResult<bool> {
        self.session
            .gh(
                "cli-status",
                vec!["--version".into()],
                None,
                64 * 1024,
                cancel,
            )
            .await
            .map(|_| true)
    }
    pub async fn check_auth(&self, cancel: ProcessCancellation) -> ForgeResult<Value> {
        let data = self
            .session
            .gh_json(
                "auth-status",
                vec![
                    "api".into(),
                    "--hostname".into(),
                    self.session.repository.host.clone(),
                    "user".into(),
                ],
                cancel,
            )
            .await?;
        let login = data["login"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or(ForgeError::MalformedResponse)?;
        Ok(json!({"authenticated": true, "username": login}))
    }
    pub async fn get_default_branch(
        &self,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Option<String>> {
        let data = self
            .session
            .gh_json(
                "default-branch",
                vec![
                    "repo".into(),
                    "view".into(),
                    self.session.repository.target(),
                    "--json".into(),
                    "defaultBranchRef".into(),
                ],
                cancel,
            )
            .await?;
        if !data.is_object() || data.get("defaultBranchRef").is_none() {
            return Err(ForgeError::MalformedResponse);
        }
        if data["defaultBranchRef"].is_null() {
            return Ok(None);
        }
        let name = data["defaultBranchRef"]["name"]
            .as_str()
            .ok_or(ForgeError::MalformedResponse)?;
        branch(name).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(Some(name.into()))
    }
    pub async fn find_existing_pr(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Option<Value>> {
        branch(head)?;
        let args = vec![
            "pr".into(),
            "list".into(),
            "--repo".into(),
            self.session.repository.target(),
            "--head".into(),
            head.into(),
            "--state".into(),
            "all".into(),
            "--limit".into(),
            "100".into(),
            "--json".into(),
            "number,url,title,state,baseRefName,headRefName".into(),
        ];
        let data = self.session.gh_json("find-pr", args, cancel).await?;
        let rows = data.as_array().ok_or(ForgeError::MalformedResponse)?;
        if rows.len() > 100
            || rows.iter().any(|p| {
                validate_pr_identity(p, &self.session.repository).is_err()
                    || p["headRefName"].as_str() != Some(head)
            })
        {
            return Err(ForgeError::MalformedResponse);
        }
        let selected = rows
            .iter()
            .find(|p| p["state"] == "OPEN")
            .or_else(|| rows.first());
        Ok(selected.map(|p| forge_pr(p, "opened_existing")))
    }
    pub async fn create_pr(
        &self,
        input: ForgePrInput,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        branch(&input.head_branch)?;
        branch(&input.base_branch)?;
        bounded_text(&input.title, 4096)?;
        bounded_text(&input.body, 1024 * 1024)?;
        if input.title.trim().is_empty() {
            return Err(ForgeError::InvalidInput);
        }
        let args = vec![
            "pr".into(),
            "create".into(),
            "--repo".into(),
            self.session.repository.target(),
            "--base".into(),
            input.base_branch.clone(),
            "--head".into(),
            input.head_branch.clone(),
            format!("--title={}", input.title),
            "--body-file".into(),
            "-".into(),
        ];
        let output = self
            .session
            .gh("create-pr", args, Some(input.body), 64 * 1024, cancel)
            .await?;
        let prefix = format!("{}/pull/", self.session.repository.web_url());
        let created = output
            .lines()
            .find(|s| s.starts_with(&prefix))
            .ok_or(ForgeError::MalformedResponse)?;
        let number = created
            .strip_prefix(&prefix)
            .and_then(|s| s.parse::<u64>().ok())
            .filter(|n| (1..=MAX_PR_NUMBER).contains(n))
            .ok_or(ForgeError::MalformedResponse)?;
        Ok(
            json!({"status":"created", "url":created, "number":number, "title":self.session.redact(&input.title),
            "baseBranch":input.base_branch,"headBranch":input.head_branch,"state":"open"}),
        )
    }
    pub async fn get_pr_checks(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        branch(head)?;
        let pr = self
            .find_existing_pr(head, cancel.clone())
            .await?
            .ok_or(ForgeError::CommandFailed)?;
        let number = pr["number"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or(ForgeError::MalformedResponse)?;
        let mut args = self.session.pr_args("view", &number.to_string());
        args.extend(["--json".into(), "statusCheckRollup".into()]);
        let value = self.session.gh_json("pr-checks", args, cancel).await?;
        let checks = value["statusCheckRollup"]
            .as_array()
            .ok_or(ForgeError::MalformedResponse)?;
        Ok(Value::Array(checks.iter().map(|p| json!({
            "name":p["name"].as_str().or(p["context"].as_str()).unwrap_or("Check"),
            "state":p["status"].as_str().or(p["state"].as_str()).unwrap_or(""),
            "conclusion":p["conclusion"].as_str().unwrap_or(""),
            "startedAt":p["startedAt"].as_str().unwrap_or(""),
            "completedAt":p["completedAt"].as_str().unwrap_or(""),
            "detailsUrl":p["detailsUrl"].as_str().or(p["targetUrl"].as_str()).unwrap_or("")
        })).collect()))
    }
    pub async fn pr_diff_stats(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        branch(head)?;
        let pr = self
            .find_existing_pr(head, cancel.clone())
            .await?
            .ok_or(ForgeError::CommandFailed)?;
        let number = pr["number"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or(ForgeError::MalformedResponse)?;
        let mut args = self.session.pr_args("view", &number.to_string());
        args.extend(["--json".into(), "changedFiles,additions,deletions".into()]);
        let data = self.session.gh_json("pr-diff-stats", args, cancel).await?;
        let files = data["changedFiles"]
            .as_u64()
            .ok_or(ForgeError::MalformedResponse)?;
        Ok(
            json!({"files":files,"insertions":data["additions"].as_u64().unwrap_or(0),
            "deletions":data["deletions"].as_u64().unwrap_or(0),"hasChanges":files>0}),
        )
    }
}
fn redact_json(value: Value, token: &str) -> Value {
    match value {
        Value::String(s) => Value::String(s.replace(token, "[REDACTED]")),
        Value::Array(items) => {
            Value::Array(items.into_iter().map(|v| redact_json(v, token)).collect())
        }
        Value::Object(items) => Value::Object(
            items
                .into_iter()
                .map(|(k, v)| (k.replace(token, "[REDACTED]"), redact_json(v, token)))
                .collect(),
        ),
        value => value,
    }
}
pub(crate) const MAX_PR_NUMBER: u64 = 9_007_199_254_740_991;

/// Remote output is untrusted: it must identify the selected repository, never
/// supply an unrelated clickable target or an unsafe numeric selector.
pub(crate) fn validate_pr_identity(p: &Value, repo: &ForgeRepository) -> ForgeResult<()> {
    let number = p["number"]
        .as_u64()
        .filter(|n| (1..=MAX_PR_NUMBER).contains(n))
        .ok_or(ForgeError::MalformedResponse)?;
    let expected = format!("{}/pull/{number}", repo.web_url());
    if !p["url"]
        .as_str()
        .is_some_and(|url| url.eq_ignore_ascii_case(&expected))
    {
        return Err(ForgeError::MalformedResponse);
    }
    Ok(())
}

fn forge_pr(p: &Value, status: &str) -> Value {
    json!({"status":status,"url":p["url"].as_str().unwrap_or(""),"number":p["number"].as_u64().unwrap_or(0),
        "title":p["title"].as_str().unwrap_or(""),"baseBranch":p["baseRefName"].as_str().unwrap_or(""),
        "headBranch":p["headRefName"].as_str().unwrap_or(""),
        "state":match p["state"].as_str() {Some("MERGED")=>"merged",Some("CLOSED")=>"closed",_=>"open"}})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_target_and_branch_injection() {
        for host in [
            "https://github.com",
            "a@github.com",
            "github.com/x",
            "a:443",
            "-bad",
        ] {
            assert!(ForgeRepository::new(host, "owner", "repo").is_err());
        }
        assert!(ForgeRepository::new("github.com", "../owner", "repo").is_err());
        for head in ["@", "--repo=other", "a\n", "a..b", "a.lock", "a b", "a@{b"] {
            assert!(branch(head).is_err());
        }
        assert!(branch("feature/quote'and\"dollar$").is_ok()); // safe as one argv value
    }
    #[test]
    fn web_links_encode_branches() {
        let repo = ForgeRepository::new("github.com", "owner", "repo").unwrap();
        let link = repo
            .create_pr_url(ForgeProvider::Github, "feature/a#b", Some("main"))
            .unwrap();
        assert!(link.contains("feature%2Fa%23b"));
        assert!(link.ends_with("?expand=1"));
    }
    #[test]
    fn decoded_json_credentials_are_redacted() {
        let secret = "token-with-\"quote";
        let value = serde_json::from_str::<Value>(
            &serde_json::to_string(&json!({"nested":[secret]})).unwrap(),
        )
        .unwrap();
        assert_eq!(redact_json(value, secret), json!({"nested":["[REDACTED]"]}));
    }
    #[test]
    fn merged_forge_state_is_preserved() {
        assert_eq!(
            forge_pr(&json!({"state":"MERGED"}), "opened_existing")["state"],
            "merged"
        );
    }
    #[test]
    fn rejects_remote_pr_identity_escapes() {
        let repo = ForgeRepository::new("github.com", "owned", "repo").unwrap();
        for value in [
            json!({"number":0,"url":"https://github.com/owned/repo/pull/0"}),
            json!({"number":1,"url":"https://evil.example/owned/repo/pull/1"}),
            json!({"number":1,"url":"https://github.com/other/repo/pull/1"}),
            json!({"number":1,"url":"https://github.com/owned/repo/pull/1?x=1"}),
            json!({"number":MAX_PR_NUMBER+1,"url":""}),
            json!({"number":"1","url":"https://github.com/owned/repo/pull/1"}),
        ] {
            assert_eq!(
                validate_pr_identity(&value, &repo),
                Err(ForgeError::MalformedResponse)
            );
        }
        assert_eq!(
            validate_pr_identity(
                &json!({"number":1,"url":"https://github.com/owned/repo/pull/1"}),
                &repo
            ),
            Ok(())
        );
    }

    #[tokio::test]
    async fn changed_authorized_argv_and_ambient_routing_are_denied() {
        use crate::execution::process_runner::ProcessRequest;
        use std::{num::NonZeroU16, sync::Arc};
        for change in 0..7 {
            let authority: GitCommandAuthority = Arc::new(move |request, _| {
                Box::pin(async move {
                    let mut argv = vec!["/must-never-execute/gh".to_owned()];
                    argv.extend(request.arguments);
                    let mut environment = request.environment;
                    let mut cwd = request.cwd;
                    let mut input = request.input;
                    let mut timeout = Duration::from_secs(30);
                    let mut output_limit = 65536;
                    match change {
                        0 => argv.push("--help".into()),
                        1 => {
                            environment.insert("GH_REPO".into(), "other/owner".into());
                        }
                        2 => cwd = PathBuf::from("/other"),
                        3 => input = Some(b"changed".to_vec()),
                        4 => {
                            environment.insert("GH_TOKEN".into(), "different-token".into());
                        }
                        5 => timeout = Duration::ZERO,
                        _ => output_limit = 0,
                    }
                    Ok(ProcessRequest {
                        argv,
                        cwd,
                        environment,
                        input,
                        timeout,
                        output_limit,
                    })
                })
            });
            let session = ForgeSession::new(
                "alice".into(),
                PathBuf::from("/owned"),
                ForgeRepository::new("github.com", "owned", "repo").unwrap(),
                "private-token".into(),
                authority,
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            )
            .unwrap();
            assert_eq!(
                GitHubForge::new(session)
                    .check_cli_available(ProcessCancellation::default())
                    .await,
                Err(ForgeError::Denied)
            );
        }
    }
    #[tokio::test]
    async fn cancellation_interrupts_pending_authorization() {
        use std::{num::NonZeroU16, sync::Arc};
        let entered = Arc::new(tokio::sync::Notify::new());
        let observed = entered.clone();
        let authority: GitCommandAuthority = Arc::new(move |_, _| {
            let entered = entered.clone();
            Box::pin(async move {
                entered.notify_one();
                std::future::pending().await
            })
        });
        let forge = GitHubForge::new(
            ForgeSession::new(
                "alice".into(),
                PathBuf::from("/owned"),
                ForgeRepository::new("github.com", "owned", "repo").unwrap(),
                "private-token".into(),
                authority,
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            )
            .unwrap(),
        );
        let cancel = ProcessCancellation::default();
        let (result, ()) = tokio::join!(forge.check_cli_available(cancel.clone()), async {
            observed.notified().await;
            cancel.cancel();
        },);
        assert_eq!(result, Err(ForgeError::Cancelled));
    }

    #[test]
    fn session_rejects_unscoped_roots_and_credentials() {
        use std::{num::NonZeroU16, sync::Arc};
        let authority: GitCommandAuthority =
            Arc::new(|_, _| Box::pin(async { panic!("must not authorize invalid sessions") }));
        for (root, token, expected) in [
            ("relative", "token", ForgeError::InvalidInput),
            ("/owned/../other", "token", ForgeError::InvalidInput),
            ("/owned", "", ForgeError::AuthenticationRequired),
            ("/owned", "token\n", ForgeError::InvalidInput),
        ] {
            let result = ForgeSession::new(
                "alice".into(),
                PathBuf::from(root),
                ForgeRepository::new("github.com", "owned", "repo").unwrap(),
                token.into(),
                authority.clone(),
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            );
            assert!(matches!(result, Err(error) if error == expected));
        }
    }

    #[tokio::test]
    async fn cancellation_and_denial_do_not_launch_process() {
        use std::{
            num::NonZeroU16,
            sync::{
                Arc,
                atomic::{AtomicUsize, Ordering},
            },
        };
        let calls = Arc::new(AtomicUsize::new(0));
        let captured = calls.clone();
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            let calls = captured.clone();
            Box::pin(async move {
                calls.fetch_add(1, Ordering::SeqCst);
                assert_eq!(request.owner, "alice");
                assert_eq!(request.arguments, vec!["--version"]);
                assert!(request.operation.ends_with("github.com/owned/repo"));
                Err("secret-bearing denial must not escape".into())
            })
        });
        let forge = GitHubForge::new(
            ForgeSession::new(
                "alice".into(),
                PathBuf::from("/owned"),
                ForgeRepository::new("github.com", "owned", "repo").unwrap(),
                "private-token".into(),
                authority,
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            )
            .unwrap(),
        );
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        assert_eq!(
            forge.check_cli_available(cancel).await,
            Err(ForgeError::Cancelled)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            forge
                .check_cli_available(ProcessCancellation::default())
                .await,
            Err(ForgeError::Denied)
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(forge.session.redact("private-token"), "[REDACTED]");
    }
}

/// Azure CLI adapter. Requires an explicit PAT and exact-command authority; it never
/// invokes `az login`, extension installation, credential lookup, or shell expansion.
pub struct AzureDevopsForge {
    session: ForgeSession,
}
impl AzureDevopsForge {
    pub fn new(session: ForgeSession) -> ForgeResult<Self> {
        session.repository.organization_url()?;
        Ok(Self { session })
    }
    fn args(&self, group: &[&str]) -> ForgeResult<Vec<String>> {
        let repo = &self.session.repository;
        let mut args: Vec<String> = group.iter().map(|s| (*s).into()).collect();
        args.extend([
            "--organization".into(),
            repo.organization_url()?,
            format!(
                "--project={}",
                repo.azure_project
                    .as_deref()
                    .ok_or(ForgeError::InvalidInput)?
            ),
            format!("--repository={}", repo.repo),
            "--output=json".into(),
            "--only-show-errors".into(),
        ]);
        Ok(args)
    }
    async fn execute(
        &self,
        operation: &str,
        args: Vec<String>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<String> {
        let environment = HashMap::from([
            ("AZURE_DEVOPS_EXT_PAT".into(), self.session.token.clone()),
            ("AZURE_EXTENSION_USE_DYNAMIC_INSTALL".into(), "no".into()),
            ("AZURE_CORE_COLLECT_TELEMETRY".into(), "false".into()),
            ("AZURE_CORE_NO_COLOR".into(), "true".into()),
        ]);
        self.session
            .command(
                "azure-devops",
                "az",
                operation,
                args,
                None,
                2 * 1024 * 1024,
                environment,
                cancel,
            )
            .await
    }
    async fn json(
        &self,
        operation: &str,
        args: Vec<String>,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        let text = self.execute(operation, args, cancel).await?;
        let value: Value =
            serde_json::from_str(&text).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(redact_json(value, &self.session.token))
    }
    pub async fn check_cli_available(&self, cancel: ProcessCancellation) -> ForgeResult<bool> {
        self.execute(
            "cli-status",
            vec!["version".into(), "--output=json".into()],
            cancel,
        )
        .await
        .map(|_| true)
    }
    /// Validates this PAT against this repository, rather than trusting an ambient
    /// Azure account login or claiming that possession of a token proves access.
    pub async fn check_auth(&self, cancel: ProcessCancellation) -> ForgeResult<Value> {
        let data = self
            .json("auth-status", self.args(&["repos", "show"])?, cancel)
            .await?;
        self.validate_repository(&data)?;
        Ok(json!({"authenticated":true}))
    }
    fn validate_repository(&self, data: &Value) -> ForgeResult<()> {
        if data["name"].as_str() != Some(self.session.repository.repo.as_str())
            || data["project"]["name"].as_str() != self.session.repository.azure_project.as_deref()
        {
            return Err(ForgeError::MalformedResponse);
        }
        Ok(())
    }
    pub async fn get_default_branch(
        &self,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Option<String>> {
        let data = self
            .json("default-branch", self.args(&["repos", "show"])?, cancel)
            .await?;
        self.validate_repository(&data)?;
        let Some(value) = data["defaultBranch"].as_str() else {
            return Ok(None);
        };
        let value = value
            .strip_prefix("refs/heads/")
            .ok_or(ForgeError::MalformedResponse)?;
        branch(value).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(Some(value.into()))
    }
    fn normalize_pr(
        &self,
        value: &Value,
        status: &str,
        expected_head: &str,
        expected_base: Option<&str>,
    ) -> ForgeResult<Value> {
        let number = value["pullRequestId"]
            .as_u64()
            .filter(|n| (1..=MAX_PR_NUMBER).contains(n))
            .ok_or(ForgeError::MalformedResponse)?;
        let base = value["targetRefName"]
            .as_str()
            .and_then(|s| s.strip_prefix("refs/heads/"))
            .ok_or(ForgeError::MalformedResponse)?;
        let head = value["sourceRefName"]
            .as_str()
            .and_then(|s| s.strip_prefix("refs/heads/"))
            .ok_or(ForgeError::MalformedResponse)?;
        branch(base).map_err(|_| ForgeError::MalformedResponse)?;
        branch(head).map_err(|_| ForgeError::MalformedResponse)?;
        if head != expected_head
            || expected_base.is_some_and(|b| b != base)
            || value["status"] != "active"
        {
            return Err(ForgeError::MalformedResponse);
        }
        self.validate_repository(&value["repository"])?;
        let title = value["title"]
            .as_str()
            .ok_or(ForgeError::MalformedResponse)?;
        bounded_text(title, 4096).map_err(|_| ForgeError::MalformedResponse)?;
        Ok(
            json!({"status":status,"number":number,"url":format!("{}/pullrequest/{number}",self.session.repository.web_url()),
            "title":title,"baseBranch":base,"headBranch":head,"state":"open"}),
        )
    }
    pub async fn find_existing_pr(
        &self,
        head: &str,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Option<Value>> {
        branch(head)?;
        let mut args = self.args(&["repos", "pr", "list"])?;
        args.extend([
            format!("--source-branch={head}"),
            "--status=active".into(),
            "--top=1".into(),
        ]);
        let data = self.json("find-pr", args, cancel).await?;
        let rows = data
            .as_array()
            .filter(|rows| rows.len() <= 1)
            .ok_or(ForgeError::MalformedResponse)?;
        rows.first()
            .map(|v| self.normalize_pr(v, "opened_existing", head, None))
            .transpose()
    }
    pub async fn create_pr(
        &self,
        input: ForgePrInput,
        cancel: ProcessCancellation,
    ) -> ForgeResult<Value> {
        branch(&input.head_branch)?;
        branch(&input.base_branch)?;
        bounded_text(&input.title, 4096)?;
        bounded_text(&input.body, 48 * 1024)?;
        // Azure's CLI supports @file expansion. Never allow caller text to select a
        // local file; there are no scratch files or implicit filesystem effects.
        if input.title.trim().is_empty() || input.body.trim_start().starts_with('@') {
            return Err(ForgeError::InvalidInput);
        }
        let mut args = self.args(&["repos", "pr", "create"])?;
        args.extend([
            format!("--source-branch={}", input.head_branch),
            format!("--target-branch={}", input.base_branch),
            format!("--title={}", input.title),
            format!("--description={}", input.body),
            "--detect=false".into(),
        ]);
        let data = self.json("create-pr", args, cancel).await?;
        self.normalize_pr(
            &data,
            "created",
            &input.head_branch,
            Some(&input.base_branch),
        )
    }
}

#[cfg(test)]
mod azure_tests {
    use super::*;
    use std::{num::NonZeroU16, sync::Arc};

    fn repository() -> ForgeRepository {
        ForgeRepository::azure("dev.azure.com", "owned", "My Project", "My Repo").unwrap()
    }
    fn session(authority: GitCommandAuthority) -> ForgeSession {
        ForgeSession::new(
            "alice".into(),
            PathBuf::from("/owned"),
            repository(),
            "private-pat".into(),
            authority,
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
        )
        .unwrap()
    }
    #[test]
    fn azure_urls_and_selector_aliases() {
        let repo = repository();
        assert_eq!(
            repo.web_url(),
            "https://dev.azure.com/owned/My%20Project/_git/My%20Repo"
        );
        assert_eq!(
            repo.organization_url().unwrap(),
            "https://dev.azure.com/owned"
        );
        let link = url::Url::parse(
            &repo
                .create_pr_url(ForgeProvider::AzureDevops, "topic/a", Some("main"))
                .unwrap(),
        )
        .unwrap();
        assert!(link.path().ends_with("/pullrequestcreate"));
        assert_eq!(
            link.query_pairs()
                .find(|(k, _)| k == "sourceRef")
                .unwrap()
                .1,
            "refs/heads/topic/a"
        );
        let legacy =
            ForgeRepository::azure("owned.visualstudio.com", "owned", "Project", "Repo").unwrap();
        assert_eq!(
            legacy.web_url(),
            "https://owned.visualstudio.com/Project/_git/Repo"
        );
        assert_eq!(
            legacy.organization_url().unwrap(),
            "https://owned.visualstudio.com"
        );
        assert_eq!(
            ForgeProvider::from_selector("azure-devops"),
            Some(ForgeProvider::AzureDevops)
        );
        for selector in ["none", "unknown", "azure", "", "--help"] {
            assert_eq!(ForgeProvider::from_selector(selector), None);
        }
        assert_eq!(
            ForgeProvider::AzureDevops.credential_aliases(),
            &["AZURE_DEVOPS_PAT", "AZURE_DEVOPS_TOKEN"]
        );
        assert_eq!(
            ForgeProvider::Gitlab.credential_aliases(),
            &["GITLAB_TOKEN", "GITLAB_PAT"]
        );
        for (host, project, repo) in [
            ("evil.example", "Project", "Repo"),
            ("other.visualstudio.com", "Project", "Repo"),
            ("dev.azure.com", "../escape", "Repo"),
            ("dev.azure.com", "Project", "x%2fy"),
            ("dev.azure.com", "Project", "--help"),
        ] {
            assert_eq!(
                ForgeRepository::azure(host, "owned", project, repo),
                Err(ForgeError::InvalidInput)
            );
        }
        assert_eq!(
            repository().create_pr_url(ForgeProvider::Github, "topic", None),
            Err(ForgeError::InvalidInput)
        );
    }
    fn pr() -> Value {
        json!({"pullRequestId":42,"sourceRefName":"refs/heads/topic/a","targetRefName":"refs/heads/main","status":"active",
            "title":"A PR", "repository":{"name":"My Repo","project":{"name":"My Project"}}})
    }
    #[test]
    fn azure_normalization_rejects_wrong_repository_and_branch() {
        let authority: GitCommandAuthority =
            Arc::new(|_, _| Box::pin(async { panic!("pure normalization") }));
        let forge = AzureDevopsForge::new(session(authority)).unwrap();
        let value = forge
            .normalize_pr(&pr(), "created", "topic/a", Some("main"))
            .unwrap();
        assert_eq!(
            value["url"],
            "https://dev.azure.com/owned/My%20Project/_git/My%20Repo/pullrequest/42"
        );
        assert_eq!(value["number"], 42);
        for (pointer, replacement) in [
            ("/repository/name", json!("other")),
            ("/repository/project/name", json!("other")),
            ("/sourceRefName", json!("refs/heads/other")),
            ("/targetRefName", json!("refs/heads/../escape")),
            ("/pullRequestId", json!(0)),
            ("/status", json!("completed")),
        ] {
            let mut invalid = pr();
            *invalid.pointer_mut(pointer).unwrap() = replacement;
            assert_eq!(
                forge.normalize_pr(&invalid, "created", "topic/a", Some("main")),
                Err(ForgeError::MalformedResponse)
            );
        }
    }
    #[tokio::test]
    async fn azure_exact_scope_and_literal_arguments_require_authority() {
        let authority: GitCommandAuthority = Arc::new(|request, _| {
            Box::pin(async move {
                assert_eq!(request.owner, "alice");
                assert_eq!(request.program, "az");
                assert_eq!(
                    request.operation,
                    "forge.azure-devops.create-pr:dev.azure.com/owned/My%20Project/_git/My%20Repo"
                );
                assert_eq!(request.environment["AZURE_DEVOPS_EXT_PAT"], "private-pat");
                assert_eq!(
                    request.environment["AZURE_EXTENSION_USE_DYNAMIC_INSTALL"],
                    "no"
                );
                assert!(
                    request
                        .arguments
                        .contains(&"--title=--help $(touch forbidden)".into())
                );
                assert!(
                    request
                        .arguments
                        .contains(&"--description=literal body\nsecond line".into())
                );
                assert!(request.arguments.contains(&"--project=My Project".into()));
                assert!(request.arguments.iter().all(|s| !s.contains("private-pat")));
                assert!(request.input.is_none());
                Err("denial is secret".into())
            })
        });
        let forge = AzureDevopsForge::new(session(authority)).unwrap();
        assert_eq!(
            forge
                .create_pr(
                    ForgePrInput {
                        title: "--help $(touch forbidden)".into(),
                        head_branch: "topic/a".into(),
                        base_branch: "main".into(),
                        body: "literal body\nsecond line".into()
                    },
                    ProcessCancellation::default()
                )
                .await,
            Err(ForgeError::Denied)
        );
    }
    #[tokio::test]
    async fn azure_file_expansion_and_precancellation_never_authorize() {
        let authority: GitCommandAuthority =
            Arc::new(|_, _| Box::pin(async { panic!("no effect allowed") }));
        let forge = AzureDevopsForge::new(session(authority)).unwrap();
        assert_eq!(
            forge
                .create_pr(
                    ForgePrInput {
                        title: "A PR".into(),
                        head_branch: "topic/a".into(),
                        base_branch: "main".into(),
                        body: "@/private/file".into()
                    },
                    ProcessCancellation::default()
                )
                .await,
            Err(ForgeError::InvalidInput)
        );
        let cancel = ProcessCancellation::default();
        cancel.cancel();
        assert_eq!(
            forge.find_existing_pr("topic/a", cancel).await,
            Err(ForgeError::Cancelled)
        );
    }
    #[cfg(unix)]
    fn fixture(response: &Value) -> AzureDevopsForge {
        use crate::execution::process_runner::ProcessRequest;
        use std::os::unix::fs::PermissionsExt;
        // Project-local fixture artifacts; never use CWD or the system temp directory.
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/parallel-implementation/azure-fixtures")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&dir).unwrap();
        let dir = std::fs::canonicalize(dir).unwrap();
        let executable = dir.join("az");
        let body = response.to_string().replace('\'', "'\\''");
        std::fs::write(&executable,format!("#!/bin/sh\n[ \"$AZURE_DEVOPS_EXT_PAT\" = private-pat ] || exit 77\nprintf '%s' '{body}'\n")).unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = dir.clone();
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
                    timeout: Duration::from_secs(2),
                    output_limit: 65536,
                })
            })
        });
        AzureDevopsForge::new(
            ForgeSession::new(
                "alice".into(),
                root,
                repository(),
                "private-pat".into(),
                authority,
                ProcessPool::new(NonZeroU16::new(1).unwrap()),
            )
            .unwrap(),
        )
        .unwrap()
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn azure_supervised_fixture_success_empty_and_malformed_results() {
        let forge = fixture(
            &json!({"name":"My Repo","project":{"name":"My Project"},"defaultBranch":"refs/heads/main"}),
        );
        assert_eq!(
            forge
                .check_auth(ProcessCancellation::default())
                .await
                .unwrap(),
            json!({"authenticated":true})
        );
        assert_eq!(
            forge
                .get_default_branch(ProcessCancellation::default())
                .await
                .unwrap(),
            Some("main".into())
        );
        assert_eq!(
            fixture(&json!([]))
                .find_existing_pr("topic/a", ProcessCancellation::default())
                .await
                .unwrap(),
            None
        );
        let existing = fixture(&json!([pr()]))
            .find_existing_pr("topic/a", ProcessCancellation::default())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(existing["status"], "opened_existing");
        let created = fixture(&pr())
            .create_pr(
                ForgePrInput {
                    title: "A PR".into(),
                    body: "body".into(),
                    head_branch: "topic/a".into(),
                    base_branch: "main".into(),
                },
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(created["status"], "created");
        assert_eq!(
            fixture(&json!({"token":"private-pat"}))
                .find_existing_pr("topic/a", ProcessCancellation::default())
                .await,
            Err(ForgeError::MalformedResponse)
        );
    }
}
