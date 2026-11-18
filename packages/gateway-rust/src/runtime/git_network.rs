//! Per-destination consent for network Git operations.
//!
//! A fetch, pull or push contacts a remote that the repository's own configuration names, so
//! it needs the owner's approval for that exact host and port. The route asks through
//! [`gate`]: the remote is resolved to its destination, the owner is prompted through the
//! consent queue (session `git-network:<owner>`) and an approval is recorded as a
//! [`GitDestinationGrant`] for the owner, project root, operation and destination. The
//! command authority then checks the grant again, against a fresh resolution, immediately
//! before the child starts. A grant is never built from request data.
//!
//! Limits: only `https` remotes with a lowercase DNS host are accepted (no IP literals, no
//! ssh, no userinfo); proxies, repository-local credential, http, url, filter and include
//! configuration are refused; redirects are disabled for the child. DNS is not pinned, and
//! the remote's URL could in principle be rewritten between the check and the child starting.
use super::git_mount::{find_git, git_environment};
use crate::{
    db::identifiers::uuidv7,
    execution::process_runner::ProcessCancellation,
    routes::git::{NetworkGate, NetworkRequest, destination_grant::GitDestinationGrant},
    security::{
        consent_manager::{ConsentManager, ConsentRequestPolicy, RequestConsent},
        contracts::Risk,
        tool_permissions::{ConsentLevel, PolicySource},
    },
};
use serde_json::{Map, json};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const GRANT_TTL: Duration = Duration::from_secs(10 * 60);
const PROMPT_TIMEOUT_MS: f64 = 45_000.0;
const NODE: &str = "local";
const MAX_GRANTS: usize = 256;

/// Settings applied to every network child on top of the common sanitized environment.
pub(crate) const PINNED_CONFIG: &[(&str, &str)] = &[
    ("http.followRedirects", "false"),
    ("fetch.recurseSubmodules", "false"),
    ("submodule.recurse", "false"),
    ("push.recurseSubmodules", "no"),
];

/// Operation name for GitHub API calls made through `gh` (status, auth check, PR checks).
pub(crate) const FORGE_OPERATION: &str = "forge";

/// The only forge destination: github.com over https.
pub(crate) fn forge_destination() -> Destination {
    Destination {
        host: "github.com".into(),
        port: 443,
    }
}

/// The consent queue session that carries a user's network Git prompts.
pub fn consent_session(owner: &str) -> String {
    format!("git-network:{owner}")
}

/// A user owns exactly their own network Git consent session.
pub fn owns_consent_session(session: &str, user: &str) -> bool {
    session == consent_session(user)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Destination {
    pub host: String,
    pub port: u16,
}

/// Exact host and port of an `https` remote URL, or why it cannot be authorized.
pub fn parse_destination(url: &str) -> Result<Destination, String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or("Only https remotes can be authorized")?;
    if rest
        .chars()
        .any(|c| c.is_control() || c.is_whitespace() || c == '\\' || c == '%')
    {
        return Err("Remote URL is not supported".into());
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains(['@', '[', ']']) {
        return Err("Remote URL is not supported".into());
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => {
            if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
                return Err("Remote URL is not supported".into());
            }
            (
                host,
                port.parse::<u16>()
                    .map_err(|_| "Remote URL is not supported")?,
            )
        }
        None => (authority, 443),
    };
    let host = host.to_ascii_lowercase();
    // The grant type owns the host spelling rules; probe it with a throwaway grant.
    GitDestinationGrant::issue(
        "probe".into(),
        NODE.into(),
        "/".into(),
        "probe".into(),
        host.clone(),
        port,
        Instant::now() + Duration::from_secs(1),
    )
    .ok_or("Remote host is not supported")?;
    Ok(Destination { host, port })
}

pub fn valid_remote(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && !name.starts_with(['-', '/', '.'])
        && !name.ends_with(['/', '.'])
        && !name.contains("..")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'/'))
}

/// Why this `git config --show-scope --list` output makes a network command unsafe.
fn config_denied(listing: &str) -> Option<String> {
    for line in listing.lines() {
        let Some((scope, entry)) = line.split_once('\t') else {
            continue;
        };
        let key = entry
            .split_once('=')
            .map_or(entry, |(key, _)| key)
            .to_ascii_lowercase();
        // `command` scope is only what our own cleared environment injects (hardening values
        // such as `core.sshCommand=false`); no caller input can reach it.
        if scope == "command" {
            continue;
        }
        // A proxy or helper program changes where, or through what, the child connects.
        let anywhere = key.contains("proxy")
            || key.starts_with("core.sshcommand")
            || (key.starts_with("remote.")
                && ["vcs", "receivepack", "uploadpack"]
                    .iter()
                    .any(|suffix| key.ends_with(&format!(".{suffix}"))));
        // The user's own global and system files are trusted; a repository's are not.
        let repository = matches!(scope, "local" | "worktree");
        let untrusted = repository
            && [
                "credential.",
                "http.",
                "url.",
                "filter.",
                "include",
                "core.askpass",
            ]
            .iter()
            .any(|prefix| key.starts_with(prefix));
        if anywhere || untrusted {
            return Some(format!(
                "Git configuration `{key}` is not allowed for network operations"
            ));
        }
    }
    None
}

async fn run_git(root: &Path, arguments: &[&str]) -> Result<String, String> {
    let git = find_git().ok_or("git is not installed")?;
    let child = tokio::process::Command::new(git)
        .args(arguments)
        .current_dir(root)
        .env_clear()
        .envs(git_environment(root, HashMap::new(), &[]))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "git could not be started")?;
    let output = tokio::time::timeout(Duration::from_secs(5), child.wait_with_output())
        .await
        .map_err(|_| "git timed out")?
        .map_err(|_| "git failed")?;
    if !output.status.success() {
        return Err("git failed".into());
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The exact destination git would contact for `remote`, after configuration checks.
pub async fn resolve_destination(
    root: &Path,
    remote: &str,
    push: bool,
) -> Result<Destination, String> {
    if !valid_remote(remote) {
        return Err("Remote name is not supported".into());
    }
    let listing = run_git(root, &["config", "--show-scope", "--list"])
        .await
        .map_err(|_| "Git configuration is unavailable".to_owned())?;
    if let Some(reason) = config_denied(&listing) {
        return Err(reason);
    }
    let mut arguments = vec!["remote", "get-url"];
    if push {
        arguments.push("--push");
    }
    arguments.push(remote);
    let url = run_git(root, &arguments)
        .await
        .map_err(|_| format!("Remote `{remote}` is not configured"))?;
    parse_destination(url.lines().next().unwrap_or_default().trim())
}

/// Holds the grants the owner has approved. Shared by the gate and the command authority.
pub struct NetworkGuard {
    consent: ConsentManager,
    grants: Mutex<Vec<GitDestinationGrant>>,
}

struct PendingPrompt {
    manager: ConsentManager,
    id: Option<String>,
}
impl Drop for PendingPrompt {
    fn drop(&mut self) {
        if let Some(id) = self.id.take()
            && let Some(claim) = self.manager.claim_cancelled(&id)
        {
            let manager = self.manager.clone();
            tokio::task::spawn_blocking(move || {
                let _ = manager.finalize_cancelled(claim);
            });
        }
    }
}

impl NetworkGuard {
    pub fn new(consent: ConsentManager) -> Arc<Self> {
        Arc::new(Self {
            consent,
            grants: Mutex::new(Vec::new()),
        })
    }

    /// Exact check at this instant; the caller holds no lease beyond it.
    pub fn permits(
        &self,
        owner: &str,
        root: &Path,
        operation: &str,
        destination: &Destination,
    ) -> bool {
        let mut grants = self.grants.lock().unwrap();
        grants.retain(GitDestinationGrant::is_active);
        grants.iter().any(|grant| {
            grant.permits(
                owner,
                NODE,
                root,
                operation,
                &destination.host,
                destination.port,
            )
        })
    }

    /// Approve `destination` for `operation`, prompting the owner unless already approved.
    pub async fn authorize(
        &self,
        owner: &str,
        root: &Path,
        operation: &str,
        destination: &Destination,
        cancel: &ProcessCancellation,
    ) -> Result<(), String> {
        if self.permits(owner, root, operation, destination) {
            return Ok(());
        }
        let label = format!("{}:{}", destination.host, destination.port);
        let mut preview = Map::new();
        preview.insert("operation".into(), json!(operation));
        preview.insert("destination".into(), json!(label));
        preview.insert("project".into(), json!(root.to_string_lossy()));
        let description = format!("Git {operation} over the network");
        let mut handle = self.consent.request_consent(RequestConsent {
            action_id: format!("git-network:{}", uuidv7()),
            tool_name: format!("git.{operation}"),
            summary: format!(
                "Allow git {operation} to {label} for {} for the next {} minutes",
                root.display(),
                GRANT_TTL.as_secs() / 60
            ),
            preview,
            risk: if operation == "push" {
                Risk::High
            } else {
                Risk::Medium
            },
            policy: ConsentRequestPolicy {
                consent_level: ConsentLevel::Dangerous,
                description,
                known_tool: true,
                source: PolicySource::Profile,
            },
            session_id: consent_session(owner),
            timeout_ms: Some(PROMPT_TIMEOUT_MS),
        })?;
        let mut pending = PendingPrompt {
            manager: self.consent.clone(),
            id: Some(handle.id.clone()),
        };
        let decision = tokio::select! {
            biased;
            () = cancel.wait_cancelled() => return Err("Cancelled".into()),
            decision = handle.wait() => decision?,
        };
        pending.id = None;
        if !decision.approved {
            return Err(format!("Network access to {label} was not approved"));
        }
        let grant = GitDestinationGrant::issue(
            owner.to_owned(),
            NODE.to_owned(),
            root.to_path_buf(),
            operation.to_owned(),
            destination.host.clone(),
            destination.port,
            Instant::now() + GRANT_TTL,
        )
        .ok_or("Network destination could not be authorized")?;
        let mut grants = self.grants.lock().unwrap();
        grants.retain(GitDestinationGrant::is_active);
        if grants.len() >= MAX_GRANTS {
            return Err("Too many active network approvals".into());
        }
        grants.push(grant);
        Ok(())
    }
}

/// The gate a `GitRoutes` calls before it runs a network command.
pub fn gate(guard: Arc<NetworkGuard>) -> NetworkGate {
    Arc::new(
        move |request: NetworkRequest, cancel: ProcessCancellation| {
            let guard = guard.clone();
            Box::pin(async move {
                // Forge calls go to the forge's API host, not to a remote's git endpoint, and
                // only github.com is supported; the repository itself travels in the command.
                if request.operation == FORGE_OPERATION {
                    return guard
                        .authorize(
                            &request.owner,
                            &request.root,
                            FORGE_OPERATION,
                            &forge_destination(),
                            &cancel,
                        )
                        .await;
                }
                let push = request.operation == "push";
                for remote in &request.remotes {
                    let destination = resolve_destination(&request.root, remote, push).await?;
                    guard
                        .authorize(
                            &request.owner,
                            &request.root,
                            &request.operation,
                            &destination,
                            &cancel,
                        )
                        .await?;
                }
                Ok(())
            })
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destinations_are_exact_https_hosts() {
        let d = parse_destination("https://Git.Example.com/org/repo.git").unwrap();
        assert_eq!((d.host.as_str(), d.port), ("git.example.com", 443));
        let d = parse_destination("https://git.example.com:8443/x").unwrap();
        assert_eq!(d.port, 8443);
        for bad in [
            "http://git.example.com/x",
            "git@github.com:org/repo.git",
            "ssh://git.example.com/x",
            "https://user@git.example.com/x",
            "https://user:pw@git.example.com/x",
            "https://127.0.0.1/x",
            "https://[::1]/x",
            "https://git.example.com:/x",
            "https://git.example.com:99999/x",
            "https://git.example.com:0/x",
            "https://git.example.com\\@evil.com/x",
            "https://git%2eexample.com/x",
            "https://",
            "/local/path",
        ] {
            assert!(parse_destination(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn remote_names_cannot_be_options_or_paths() {
        for ok in ["origin", "up-stream", "team/fork", "a.b"] {
            assert!(valid_remote(ok), "{ok}");
        }
        for bad in [
            "", "-u", "--all", "../x", "/abs", "a..b", "x y", "a;b", "x.",
        ] {
            assert!(!valid_remote(bad), "{bad}");
        }
    }

    #[test]
    fn unsafe_configuration_is_refused() {
        let global = "global\tuser.name=A\nglobal\turl.ssh://git@x/.insteadof=https://x/\nglobal\tcredential.helper=store\n";
        assert!(config_denied(global).is_none());
        for listing in [
            "global\thttp.proxy=http://p\n",
            "local\tremote.origin.proxy=http://p\n",
            "local\tcore.gitproxy=cmd\n",
            "local\tcredential.helper=!sh -c x\n",
            "local\thttp.extraheader=X\n",
            "local\turl.https://evil/.insteadof=https://good/\n",
            "local\tfilter.x.smudge=cmd\n",
            "local\tinclude.path=/tmp/x\n",
            "worktree\tcore.askpass=cmd\n",
            "local\tremote.origin.uploadpack=cmd\n",
        ] {
            assert!(config_denied(listing).is_some(), "{listing}");
        }
    }

    #[tokio::test]
    async fn grants_are_exact_and_need_consent() {
        let guard = NetworkGuard::new(ConsentManager::default());
        let root = Path::new("/repo");
        let dest = Destination {
            host: "git.example.com".into(),
            port: 443,
        };
        assert!(!guard.permits("owner", root, "fetch", &dest));
        guard.grants.lock().unwrap().push(
            GitDestinationGrant::issue(
                "owner".into(),
                NODE.into(),
                root.into(),
                "fetch".into(),
                dest.host.clone(),
                dest.port,
                Instant::now() + Duration::from_secs(5),
            )
            .unwrap(),
        );
        assert!(guard.permits("owner", root, "fetch", &dest));
        assert!(!guard.permits("owner", root, "push", &dest));
        assert!(!guard.permits("other", root, "fetch", &dest));
        assert!(!guard.permits("owner", Path::new("/repo2"), "fetch", &dest));
        let other = Destination {
            host: "evil.example.com".into(),
            port: 443,
        };
        assert!(!guard.permits("owner", root, "fetch", &other));
    }

    #[test]
    fn consent_session_belongs_to_its_user_only() {
        assert!(owns_consent_session("git-network:u1", "u1"));
        assert!(!owns_consent_session("git-network:u1", "u2"));
        assert!(!owns_consent_session("u1", "u1"));
    }
}
