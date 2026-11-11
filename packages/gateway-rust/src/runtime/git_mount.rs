//! Authority for the `/api/git/*` routes in the composed gateway.
//!
//! A request is granted only for the exact root of a project the caller owns. Commands are limited
//! to local Git operations plus fetch, pull and push of an explicitly named https remote; hooks,
//! fsmonitor and ssh commands are switched off through `GIT_CONFIG_*` and repository discovery
//! cannot leave the root. A network command runs only while the owner holds an unexpired
//! per-destination grant (see `git_network`); worktrees and global config writes are refused, so
//! those routes answer with the denial instead of acting.
use super::git_network as network;
use crate::{
    execution::process_runner::ProcessRequest,
    routes::{
        auth::AuthState,
        git::{
            GitAuthority, GitAuthorizationRequest, GitCommandAuthority, GitCommandRequest, GitGrant,
        },
    },
    services::projects::ProjectService,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

const IDENTITY_KEYS: [&str; 2] = ["user.name", "user.email"];

pub fn git_authority(
    auth: &AuthState,
    network: Option<Arc<network::NetworkGuard>>,
) -> GitAuthority {
    let auth = auth.clone();
    Arc::new(move |request: GitAuthorizationRequest, _| {
        let auth = auth.clone();
        let network = network.clone();
        Box::pin(async move {
            let cwd = request
                .body
                .get("cwd")
                .and_then(|v| v.as_str())
                .map(PathBuf::from)
                .ok_or("Missing cwd")?;
            let owner = request.owner.clone();
            let roots = auth
                .with_database(move |db| {
                    let service = ProjectService::new(db);
                    let projects = service.list(Some("active"), Some(&owner), None)?;
                    let mut roots = Vec::new();
                    for project in &projects {
                        if let Some(root) =
                            service.effective_root_for_record(Some(project), Some(&owner))?
                        {
                            roots.push(root);
                        }
                    }
                    Ok(roots)
                })
                .await
                .map_err(|_| "Project lookup failed".to_owned())?;
            let wanted = cwd
                .canonicalize()
                .map_err(|_| "Git root is unavailable".to_owned())?;
            let root = roots
                .iter()
                .filter_map(|r| Path::new(r).canonicalize().ok())
                .find(|r| *r == wanted)
                .ok_or("Git root is not one of your projects")?;
            Ok(GitGrant {
                owner: request.owner,
                command_authority: command_authority(root.clone(), network),
                root,
                allow_worktree_reads: true,
            })
        })
    })
}

/// Arguments that make Git run another program or read outside the repository.
fn dangerous(arg: &str) -> bool {
    matches!(arg, "-c" | "-C")
        || [
            "--output",
            "--exec",
            "--upload-pack",
            "--receive-pack",
            "--ext-diff",
            "--no-index",
            "--git-dir",
            "--work-tree",
            "--config-env",
        ]
        .iter()
        .any(|p| arg == *p || arg.starts_with(&format!("{p}=")))
}

fn permitted(arguments: &[String]) -> Result<(), &'static str> {
    let Some(subcommand) = arguments.first().map(String::as_str) else {
        return Err("Empty git command");
    };
    if arguments.iter().any(|a| dangerous(a)) {
        return Err("Git option is not authorized");
    }
    let rest: Vec<&str> = arguments[1..].iter().map(String::as_str).collect();
    match subcommand {
        "rev-parse" | "rev-list" | "merge-base" | "for-each-ref" | "status" | "show" | "diff"
        | "symbolic-ref" | "branch" | "add" | "reset" | "checkout" | "init" => Ok(()),
        // Local commit with a message only; hooks are disabled by the command environment.
        "commit" => match rest.as_slice() {
            ["-m", _] => Ok(()),
            _ => Err("Git commit option is not authorized"),
        },
        "remote" => match rest.as_slice() {
            [] | ["get-url", _] => Ok(()),
            _ => Err("Remote changes are not authorized"),
        },
        "config" => match rest.as_slice() {
            // identity reads/writes, local or (read-only) global
            [key] | ["--global", key] if IDENTITY_KEYS.contains(key) => Ok(()),
            [key, _] if IDENTITY_KEYS.contains(key) => Ok(()),
            ["--default", "", "--get", key]
                if key.starts_with("branch.") && key.ends_with(".remote") =>
            {
                Ok(())
            }
            _ => Err("Git config change is not authorized"),
        },
        _ => Err("Git command is not authorized"),
    }
}

pub(super) fn find_git() -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join("git"))
            .find(|p| p.is_file())
    })
}

/// The environment every Git child gets: no inherited config beyond the user's own, no
/// hooks, fsmonitor, ssh command or prompts, and discovery capped at the project root.
/// `extra_config` pins further `-c` style values (highest precedence).
pub(crate) fn git_environment(
    root: &Path,
    mut environment: HashMap<String, String>,
    extra_config: &[(&str, &str)],
) -> HashMap<String, String> {
    for key in ["PATH", "HOME", "LANG", "LC_ALL", "USER"] {
        if let Ok(value) = std::env::var(key) {
            environment.insert(key.into(), value);
        }
    }
    environment.insert("GIT_TERMINAL_PROMPT".into(), "0".into());
    if let Some(parent) = root.parent() {
        environment.insert(
            "GIT_CEILING_DIRECTORIES".into(),
            parent.to_string_lossy().into_owned(),
        );
    }
    let config = [
        ("core.hooksPath", "/dev/null"),
        ("core.fsmonitor", "false"),
        ("core.sshCommand", "false"),
        ("core.pager", "cat"),
        ("diff.external", ""),
    ];
    let config = config.iter().chain(extra_config);
    let mut count = 0;
    for (i, (key, value)) in config.enumerate() {
        environment.insert(format!("GIT_CONFIG_KEY_{i}"), (*key).into());
        environment.insert(format!("GIT_CONFIG_VALUE_{i}"), (*value).into());
        count = i + 1;
    }
    environment.insert("GIT_CONFIG_COUNT".into(), count.to_string());
    environment
}

/// Network commands the routes may run, always with an explicit remote name so the
/// destination that was consented to is the one contacted. Returns `(operation, remote)`.
fn network_command(arguments: &[String]) -> Option<(&'static str, &str)> {
    let rest: Vec<&str> = arguments.iter().map(String::as_str).collect();
    match rest.as_slice() {
        ["fetch", "--prune", remote] if network::valid_remote(remote) => Some(("fetch", remote)),
        ["pull", "--ff-only", remote] if network::valid_remote(remote) => Some(("fetch", remote)),
        ["push", remote] if network::valid_remote(remote) => Some(("push", remote)),
        _ => None,
    }
}

fn command_authority(
    root: PathBuf,
    network: Option<Arc<network::NetworkGuard>>,
) -> GitCommandAuthority {
    Arc::new(move |request: GitCommandRequest, _| {
        let root = root.clone();
        let network = network.clone();
        Box::pin(async move {
            if request.program != "git" || request.cwd != root {
                return Err("Git command is not authorized for this directory".into());
            }
            // `.git` must be a real directory (or not exist yet): a gitfile can point anywhere.
            match std::fs::symlink_metadata(root.join(".git")) {
                Ok(m) if m.is_dir() => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err("Git directory is not inside the project".into()),
            }
            let mut extra: &[(&str, &str)] = &[];
            let mut protocols = None;
            if request
                .arguments
                .first()
                .is_some_and(|a| matches!(a.as_str(), "fetch" | "pull" | "push"))
            {
                if request.arguments.iter().any(|a| dangerous(a)) {
                    return Err("Git option is not authorized".into());
                }
                let (operation, remote) = network_command(&request.arguments)
                    .ok_or("Git network command is not authorized")?;
                let guard = network
                    .as_ref()
                    .ok_or("Network Git operations are not authorized")?;
                let destination =
                    network::resolve_destination(&root, remote, operation == "push").await?;
                if !guard.permits(&request.owner, &root, operation, &destination) {
                    return Err(format!(
                        "Network access to {}:{} is not approved for this project",
                        destination.host, destination.port
                    ));
                }
                extra = network::PINNED_CONFIG;
                protocols = Some("https");
            } else {
                permitted(&request.arguments)?;
            }
            let git = find_git().ok_or("git is not installed")?;
            let mut environment = git_environment(&root, request.environment.clone(), extra);
            if let Some(protocols) = protocols {
                environment.insert("GIT_ALLOW_PROTOCOL".into(), protocols.into());
            }
            Ok(ProcessRequest {
                argv: [vec![git.to_string_lossy().into_owned()], request.arguments].concat(),
                cwd: request.cwd,
                environment,
                input: request.input,
                timeout: Duration::from_secs(30),
                output_limit: 512 * 1024,
            })
        })
    })
}

#[cfg(test)]
mod tests {
    use super::permitted;
    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| (*s).into()).collect()
    }
    #[test]
    fn network_worktree_global_writes_and_option_injection_are_refused() {
        for denied in [
            &["fetch", "--prune"][..],
            &["pull", "--ff-only"],
            &["push"],
            &["worktree", "remove", "x"],
            &["config", "--global", "user.name", "x"],
            &["config", "core.hooksPath", "/tmp"],
            &["config", "alias.x", "!sh"],
            &["remote", "add", "x", "y"],
            &["diff", "--ext-diff"],
            &["show", "--output=/tmp/x", "HEAD"],
            &["-c", "core.pager=x", "status"],
        ] {
            assert!(permitted(&args(denied)).is_err(), "{denied:?}");
        }
        for ok in [
            &["status", "--porcelain"][..],
            &["config", "user.name", "A"],
            &["config", "--global", "user.email"],
            &["remote", "get-url", "origin"],
            &["checkout", "-b", "x"],
        ] {
            assert!(permitted(&args(ok)).is_ok(), "{ok:?}");
        }
    }
}
