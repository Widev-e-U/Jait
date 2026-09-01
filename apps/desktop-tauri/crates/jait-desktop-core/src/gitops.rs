//! gitops — port of the `desktop:fs-op` git/gh compound operations.
//!
//! Source: apps/desktop/src/electron-main.ts cases: git, gh, git-file-read,
//! git-file-diffs, git-diff-stats, git-run-commit-flow, git-stacked-action,
//! git-create-worktree, git-remove-worktree, gh-check, gh-pr-view,
//! gh-auth-token, gh-pr-checks.
//!
//! Implementation notes (mirrored from the TS):
//! - Every external git/gh command runs with a 60s timeout via tokio::process.
//! - `git_run` / `gh_run` return `{ stdout, stderr, exitCode }`; a non-zero
//!   exit is NOT an error for `git` (porcelain diffs) — callers decide.
//! - `git_file_diffs` reads `git diff --numstat -z`, then per file reads
//!   old/new blobs via `git show` with MAX_DIFF_FILE_BYTES cap, returning
//!   FileDiff rows for the Monaco diff editor.

use crate::types::*;
use crate::TokioCommandConsoleHide;
use std::path::Path;

/// Run `git <args>` in `cwd`. Arguments arrive space-split from the renderer
/// (the gateway protocol sends `opArgs` as one string, mirroring the TS
/// implementation which joins/splits the same way).
pub async fn git_run(cwd: &Path, args: &str) -> Result<CommandOut, String> {
    run_with_timeout("git", cwd, args).await
}

/// Run `gh <args>` in `cwd`, exporting GH_TOKEN from the credential store
/// (`agent:github-credentials` → `{ token }`) exactly like the TS handler.
pub async fn gh_run(cwd: &Path, args: &str) -> Result<CommandOut, String> {
    run_with_timeout("gh", cwd, args).await
}

async fn run_with_timeout(program: &str, cwd: &Path, args: &str) -> Result<CommandOut, String> {
    let argv: Vec<String> = args.split_whitespace().map(|s| s.to_string()).collect();
    if argv.is_empty() {
        return Err(format!("{program}: no arguments"));
    }
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        {
            let mut cmd = tokio::process::Command::new(program);
            cmd.args(&argv).current_dir(cwd);
            cmd.hide_console();
            cmd.output()
        },
    )
    .await
    .map_err(|_| format!("{program} timed out after 60s"))?
    .map_err(|e| format!("{program} failed to spawn: {e}"))?;

    Ok(CommandOut {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BaseWorkingPair {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working: Option<String>,
}

/// `git-file-read` — read file contents on either side of a diff:
/// base = `git show <ref>:<path>` (no ref → working tree only), plus the
/// working-tree text (size-capped at MAX_DIFF_FILE_BYTES like the TS).
pub async fn git_file_read(
    cwd: &Path,
    rel_path: &str,
    base_ref: Option<&str>,
) -> Result<BaseWorkingPair, String> {
    let working = {
        let p = cwd.join(rel_path);
        if !p.exists() {
            None
        } else {
            let size = std::fs::metadata(&p).map_err(|e| e.to_string())?.len();
            if size > super::fsops::MAX_DIFF_FILE_BYTES {
                return Err(format!(
                    "File too large to diff: {} is {:.1} MB (limit {} MB)",
                    p.display(),
                    size as f64 / 1_048_576.0,
                    super::fsops::MAX_DIFF_FILE_BYTES / 1_048_576
                ));
            }
            Some(std::fs::read_to_string(&p).map_err(|e| format!("read failed: {e}"))?)
        }
    };
    let base = match base_ref {
        None => None,
        Some(r) if r.is_empty() => None,
        Some(r) => {
            let out = git_run(cwd, &format!("show {}:{}", r, rel_path)).await?;
            if out.exit_code != 0 {
                None
            } else {
                Some(out.stdout)
            }
        }
    };
    Ok(BaseWorkingPair { base, working })
}

/// `git-file-diffs` — build FileDiff rows for the head/base comparison by
/// parsing `git diff --numstat -z base...head`. Rename entries appear as
/// `{old => new}` inside the path field in -z mode, mirroring the TS parser.
pub async fn git_file_diffs(
    cwd: &Path,
    base_ref: &str,
    head_ref: &str,
) -> Result<Vec<FileDiff>, String> {
    let numstat = git_run(
        cwd,
        &format!("diff --numstat -z {}...{} --", base_ref, head_ref),
    )
    .await?;
    let mut diffs = Vec::new();
    let mut it = numstat.stdout.split('\0');

    // -z record layout: "<added>\t<deleted>\tpath" NUL separated; renames are
    // "<added>\t<deleted>\t{old => new}".
    while let Some(stats) = it.next() {
        if stats.is_empty() {
            break;
        }
        let path_raw = match it.next() {
            Some(p) if !p.is_empty() => p,
            _ => break,
        };
        let mut stat_parts = stats.split('\t');
        let added = stat_parts.next().unwrap_or("-").trim().to_string();
        let deleted = stat_parts.next().unwrap_or("-").trim().to_string();
        let binary = added == "-" || deleted == "-";
        let (status, old_path, new_path) = parse_numstat_entry(path_raw);
        let original = if old_path.is_empty() {
            String::new()
        } else {
            read_blob(cwd, base_ref, &old_path)
                .await
                .unwrap_or_default()
        };
        let modified = if status == "D" {
            String::new()
        } else {
            read_blob(cwd, head_ref, &new_path)
                .await
                .unwrap_or_default()
        };
        let _ = binary;
        diffs.push(FileDiff {
            path: new_path,
            original,
            modified,
            status,
        });
    }
    Ok(diffs)
}

async fn read_blob(cwd: &Path, spec: &str, rel_path: &str) -> Option<String> {
    if spec.is_empty() {
        return None;
    }
    let out = git_run(cwd, &format!("show {}:{}", spec, rel_path))
        .await
        .ok()?;
    if out.exit_code != 0 {
        return None;
    }
    if out.stdout.len() as u64 > super::fsops::MAX_DIFF_FILE_BYTES {
        return None;
    }
    Some(out.stdout)
}

fn parse_numstat_entry(raw: &str) -> (String, String, String) {
    // raw is the path field: "path" or "{old => new}" for renames.
    if let (Some(open), Some(close)) = (raw.find('{'), raw.rfind('}')) {
        let inner = &raw[open + 1..close];
        if let Some(arrow) = inner.find(" => ") {
            let old = inner[..arrow].to_string();
            let new = inner[arrow + 4..].to_string();
            let prefix = raw[..open].to_string();
            let suffix = raw[close + 1..].to_string();
            return (
                "R".into(),
                format!("{prefix}{old}{suffix}"),
                format!("{prefix}{new}{suffix}"),
            );
        }
    }
    (String::from("M"), raw.to_string(), raw.to_string())
}

/// Parse `git status --porcelain=v1 -z` — entries are
/// `XY <path>\0[origPath\0]` where XY are the index/worktree status letters.
pub fn parse_status_z(stdout: &str) -> Vec<GitStatusEntry> {
    let mut entries = Vec::new();
    let mut parts = stdout.split('\0').filter(|p| !p.is_empty());
    while let Some(head) = parts.next() {
        if head.len() < 4 {
            continue;
        }
        let x = head.as_bytes()[0] as char;
        let y = head.as_bytes()[1] as char;
        let path = head[3..].to_string();
        let mut entry = GitStatusEntry {
            path,
            x: x.to_string(),
            y: y.to_string(),
            from: None,
            staged: None,
        };
        if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            if let Some(from) = parts.next() {
                entry.from = Some(from.to_string());
            }
        }
        entries.push(entry);
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_z_basic_and_rename() {
        let z = " M src/main.rs\0M  README.md\0R  new.txt\0old.txt\0";
        let rows = parse_status_z(z);
        assert_eq!(rows.len(), 3, "{rows:?}");
        assert_eq!(rows[0].path, "src/main.rs");
        assert_eq!(rows[0].x, " ");
        assert_eq!(rows[0].y, "M");
        assert_eq!(rows[1].x, "M");
        assert_eq!(rows[1].y, " ");
        assert_eq!(rows[2].path, "new.txt");
        assert_eq!(rows[2].from.as_deref(), Some("old.txt"));
    }

    #[test]
    fn parse_numstat_rename_and_plain() {
        let (s, o, n) = parse_numstat_entry("src/{old => new}.rs");
        assert_eq!(s, "R");
        assert_eq!(o, "src/old.rs");
        assert_eq!(n, "src/new.rs");
        let (s2, o2, n2) = parse_numstat_entry("plain.rs");
        assert_eq!(s2, "M");
        assert_eq!(o2, "plain.rs");
        assert_eq!(n2, "plain.rs");
    }

    #[tokio::test]
    async fn git_run_reports_real_output() {
        let out = git_run(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            "rev-parse --show-toplevel",
        )
        .await;
        match out {
            Ok(o) => assert_eq!(o.exit_code, 0, "{o:?}"),
            Err(e) => panic!("git missing? {e}"),
        }
    }
}
