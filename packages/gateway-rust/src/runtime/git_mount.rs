//! Authority for the `/api/git/*` routes in the composed gateway.
//!
//! A request is granted only for the exact root of a project the caller owns. Commands are limited
//! to local, non-network Git operations; hooks, fsmonitor and ssh commands are switched off through
//! `GIT_CONFIG_*` and repository discovery cannot leave the root. Network operations (fetch, pull,
//! push), worktrees and global config writes are refused until they have a consent and destination
//! model, so those routes answer with the denial instead of acting.
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

pub fn git_authority(auth: &AuthState) -> GitAuthority {
    let auth = auth.clone();
    Arc::new(move |request: GitAuthorizationRequest, _| {
        let auth = auth.clone();
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
                command_authority: command_authority(root.clone()),
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

fn find_git() -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join("git"))
            .find(|p| p.is_file())
    })
}

fn command_authority(root: PathBuf) -> GitCommandAuthority {
    Arc::new(move |request: GitCommandRequest, _| {
        let root = root.clone();
        Box::pin(async move {
            permitted(&request.arguments)?;
            if request.program != "git" || request.cwd != root {
                return Err("Git command is not authorized for this directory".into());
            }
            // `.git` must be a real directory (or not exist yet): a gitfile can point anywhere.
            match std::fs::symlink_metadata(root.join(".git")) {
                Ok(m) if m.is_dir() => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err("Git directory is not inside the project".into()),
            }
            let git = find_git().ok_or("git is not installed")?;
            let mut environment: HashMap<String, String> = request.environment.clone();
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
            for (i, (key, value)) in [
                ("core.hooksPath", "/dev/null"),
                ("core.fsmonitor", "false"),
                ("core.sshCommand", "false"),
                ("core.pager", "cat"),
                ("diff.external", ""),
            ]
            .iter()
            .enumerate()
            {
                environment.insert(format!("GIT_CONFIG_KEY_{i}"), (*key).into());
                environment.insert(format!("GIT_CONFIG_VALUE_{i}"), (*value).into());
            }
            environment.insert("GIT_CONFIG_COUNT".into(), "5".into());
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
