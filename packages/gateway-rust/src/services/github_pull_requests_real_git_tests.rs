//! Focused integration of the canonical conflict commands with real local Git.
//! Only the test transport maps the two exact HTTPS destinations to private
//! fixture repositories. This establishes merge/index/push semantics, not HTTPS
//! confinement, real forge credentials, or runtime workspace authority.
use super::*;
use crate::{
    execution::process_runner::{ProcessPool, ProcessRequest},
    routes::git::GitCommandAuthority,
};
use std::{
    collections::{BTreeMap, HashMap},
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

struct Fixture {
    root: PathBuf,
    shim: PathBuf,
    pool: ProcessPool,
    snapshot: ConflictSnapshot,
}
impl Fixture {
    async fn new() -> Self {
        use std::os::unix::fs::PermissionsExt;
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/parallel-implementation/real-git-conflicts")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).unwrap();
        let root = std::fs::canonicalize(root).unwrap();
        let shim = root.join("fixture-git");
        let script = format!(
            r#"#!/usr/bin/python3
import os, sys
# Exact fixture-only URL mapping. All other arguments remain unchanged.
roots = {{"https://github.com/base/repo": {base}, "https://github.com/fork/repo": {fork}}}
args = [roots.get(arg, arg) for arg in sys.argv[1:]]
os.execve("/usr/bin/git", ["/usr/bin/git", "-c", "protocol.file.allow=always", *args], os.environ)
"#,
            base = serde_json::to_string(&root.join("base.git").to_string_lossy()).unwrap(),
            fork = serde_json::to_string(&root.join("fork.git").to_string_lossy()).unwrap()
        );
        std::fs::write(&shim, script).unwrap();
        std::fs::set_permissions(&shim, std::fs::Permissions::from_mode(0o700)).unwrap();
        let mut f = Self {
            root,
            shim,
            pool: ProcessPool::new(NonZeroU16::new(1).unwrap()),
            snapshot: ConflictSnapshot {
                base_url: "https://github.com/base/repo".into(),
                head_url: "https://github.com/fork/repo".into(),
                base_branch: "main".into(),
                head_branch: "topic".into(),
                base_oid: String::new(),
                head_oid: String::new(),
            },
        };
        f.git(&f.root, &["init", "--bare", "--template=", "base.git"])
            .await;
        f.git(&f.root, &["init", "--bare", "--template=", "fork.git"])
            .await;
        f.git(
            &f.root,
            &["init", "--initial-branch=main", "--template=", "seed"],
        )
        .await;
        let seed = f.root.join("seed");
        for name in ["file", "delete"] {
            std::fs::write(seed.join(name), "common\n").unwrap();
        }
        f.git(&seed, &["add", "--", "file", "delete"]).await;
        f.git(&seed, &["commit", "-m", "common"]).await;
        f.git(&seed, &["checkout", "-b", "topic"]).await;
        std::fs::write(seed.join("file"), "topic\n").unwrap();
        f.git(&seed, &["rm", "--", "delete"]).await;
        f.git(&seed, &["add", "--", "file"]).await;
        f.git(&seed, &["commit", "-m", "topic changes"]).await;
        f.snapshot.head_oid = f.git(&seed, &["rev-parse", "HEAD"]).await.trim().into();
        f.git(
            &seed,
            &["push", "--", "../fork.git", "HEAD:refs/heads/topic"],
        )
        .await;
        f.git(&seed, &["checkout", "main"]).await;
        for name in ["file", "delete"] {
            std::fs::write(seed.join(name), "base\n").unwrap();
        }
        f.git(&seed, &["add", "--", "file", "delete"]).await;
        f.git(&seed, &["commit", "-m", "base changes"]).await;
        f.snapshot.base_oid = f.git(&seed, &["rev-parse", "HEAD"]).await.trim().into();
        f.git(
            &seed,
            &["push", "--", "../base.git", "HEAD:refs/heads/main"],
        )
        .await;
        f
    }
    async fn git(&self, cwd: &Path, args: &[&str]) -> String {
        let mut argv = vec![
            "/usr/bin/git".into(),
            "-c".into(),
            "user.name=Fixture".into(),
            "-c".into(),
            "user.email=fixture@localhost".into(),
            "-c".into(),
            "commit.gpgSign=false".into(),
        ];
        argv.extend(args.iter().map(|a| (*a).into()));
        let result = self
            .pool
            .run_captured(
                ProcessRequest {
                    argv,
                    cwd: cwd.to_path_buf(),
                    environment: HashMap::from([
                        ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
                        ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
                        ("GIT_TERMINAL_PROMPT".into(), "0".into()),
                        ("LC_ALL".into(), "C".into()),
                    ]),
                    input: None,
                    timeout: Duration::from_secs(5),
                    output_limit: CONFLICT_BYTES,
                },
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(
            result.exit_code,
            Some(0),
            "Git {args:?}: {}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(!result.timed_out && !result.cancelled && !result.truncated);
        String::from_utf8(result.stdout).unwrap()
    }
    fn authority(&self) -> GitCommandAuthority {
        let shim = self.shim.clone();
        Arc::new(move |r, _| {
            let mut argv = vec![shim.to_string_lossy().into_owned()];
            argv.extend(r.arguments);
            Box::pin(async move {
                Ok(ProcessRequest {
                    argv,
                    cwd: r.cwd,
                    environment: r.environment,
                    input: r.input,
                    timeout: Duration::from_secs(5),
                    output_limit: CONFLICT_BYTES,
                })
            })
        })
    }
    fn lease(&self, name: &str) -> Lease {
        let root = self.root.join(name);
        std::fs::create_dir(&root).unwrap();
        Lease {
            root,
            effects: vec![],
        }
    }
    fn engine<'a>(&self, lease: &'a mut Lease) -> ConflictGit<'a> {
        ConflictGit {
            lease,
            authority: self.authority(),
            pool: self.pool.clone(),
            owner: "alice".into(),
            repository: "github.com/base/repo".into(),
            number: 7,
            cancel: ProcessCancellation::default(),
            budget: 16 * 1024 * 1024,
            commands: 0,
            push_dispatched: false,
        }
    }
}
struct Lease {
    root: PathBuf,
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
        assert_eq!(effect.root, self.root);
        self.effects.push(effect);
        Box::pin(async { Ok(()) })
    }
}

#[tokio::test]
async fn real_git_conflict_preview_resolution_and_already_current() {
    let f = Fixture::new().await;
    let mut preview = f.lease("preview");
    let result = f
        .engine(&mut preview)
        .execute(&f.snapshot, None)
        .await
        .unwrap();
    let ConflictOutcome::Conflicts(files) = result else {
        panic!("expected conflicts")
    };
    assert_eq!(files.len(), 2);
    let text = files.iter().find(|file| file.path == "file").unwrap();
    assert_eq!(text.ours, ConflictContent::Text("topic\n".into()));
    assert_eq!(text.theirs, ConflictContent::Text("base\n".into()));
    let deleted = files.iter().find(|file| file.path == "delete").unwrap();
    assert_eq!(deleted.ours, ConflictContent::Missing);
    assert_eq!(deleted.theirs, ConflictContent::Text("base\n".into()));
    assert!(
        !preview
            .effects
            .iter()
            .any(|e| e.kind == ConflictEffectKind::Push)
    );
    assert_eq!(
        f.git(&f.root.join("fork.git"), &["rev-parse", "topic"])
            .await
            .trim(),
        f.snapshot.head_oid
    );

    let choices = BTreeMap::from([
        ("file".into(), ConflictSide::Theirs),
        ("delete".into(), ConflictSide::Ours),
    ]);
    let mut resolved = f.lease("resolved");
    assert_eq!(
        f.engine(&mut resolved)
            .execute(&f.snapshot, Some(&choices))
            .await
            .unwrap(),
        ConflictOutcome::Pushed
    );
    assert_eq!(
        f.git(&f.root.join("fork.git"), &["show", "topic:file"])
            .await,
        "base\n"
    );
    assert_eq!(f.git(&resolved.root, &["ls-files", "-u", "-z"]).await, "");
    assert!(!resolved.root.join("delete").exists());
    let parents = f
        .git(
            &f.root.join("fork.git"),
            &["rev-list", "--parents", "-n", "1", "topic"],
        )
        .await;
    assert_eq!(
        parents.split_whitespace().skip(1).collect::<Vec<_>>(),
        vec![f.snapshot.head_oid.as_str(), f.snapshot.base_oid.as_str()]
    );
    assert_eq!(
        f.git(&f.root.join("base.git"), &["rev-parse", "main"])
            .await
            .trim(),
        f.snapshot.base_oid
    );

    let mut updated = f.snapshot.clone();
    updated.head_oid = f
        .git(&f.root.join("fork.git"), &["rev-parse", "topic"])
        .await
        .trim()
        .into();
    let mut current = f.lease("current");
    assert_eq!(
        f.engine(&mut current)
            .execute(&updated, None)
            .await
            .unwrap(),
        ConflictOutcome::Merged
    );
    assert_eq!(
        f.git(&f.root.join("fork.git"), &["rev-parse", "topic"])
            .await
            .trim(),
        updated.head_oid
    );
    assert!(
        !current
            .effects
            .iter()
            .any(|e| e.kind == ConflictEffectKind::Commit)
    );
}

#[tokio::test]
async fn real_git_snapshot_drift_stops_before_checkout_or_push() {
    let f = Fixture::new().await;
    let mut stale = f.snapshot.clone();
    stale.head_oid = stale.base_oid.clone();
    let mut lease = f.lease("stale");
    assert_eq!(
        f.engine(&mut lease)
            .execute(&stale, None)
            .await
            .unwrap_err(),
        ConflictError::SnapshotChanged
    );
    assert!(!lease.effects.iter().any(|e| matches!(
        e.kind,
        ConflictEffectKind::Checkout | ConflictEffectKind::Push
    )));
    assert_eq!(
        f.git(&f.root.join("fork.git"), &["rev-parse", "topic"])
            .await
            .trim(),
        f.snapshot.head_oid
    );
}
