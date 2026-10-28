use super::*;
use std::{collections::HashMap, num::NonZeroU16};
fn directory() -> PathBuf {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    while !root.join("packages/gateway-rust").exists() {
        assert!(root.pop());
    }
    let path = root
        .join(".jait/artifacts/gateway-rust/parallel-implementation/fixtures")
        .join(crate::db::identifiers::uuidv7().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn service(root: &Path) -> DiskJanitor {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE agent_threads(id TEXT,status TEXT,branch TEXT,updated_at TEXT,working_directory TEXT)").unwrap();
    DiskJanitor::new(
        DatabaseWorker::new(db, NonZeroU16::new(2).unwrap()).unwrap(),
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
        ProcessPool::new(NonZeroU16::new(1).unwrap()),
        HashMap::new(),
        DiskJanitorPolicy::default(),
        DiskJanitorRoots {
            worktrees: root.join("worktrees"),
            sandbox_storage: root.join("temp/jait-windows-sandbox"),
            temp: root.join("temp"),
        },
    )
}
struct Authority(bool);
impl JanitorAuthority for Authority {
    fn lease_entry(&self, _: &ReapedEntry) -> Result<Arc<dyn Send + Sync>, String> {
        if self.0 {
            Ok(Arc::new(()))
        } else {
            Err("denied".into())
        }
    }
    fn authorize_git(
        &self,
        _: &ReapedEntry,
        _: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String> {
        Err("no git effects in fixture".into())
    }
}
#[test]
fn decisions_exclude_live_unknown_recent_and_invalid_dates() {
    let p = DiskJanitorPolicy::default();
    let mut t = Thread {
        status: "running".into(),
        branch: None,
        updated_at: "2000-01-01T00:00:00Z".into(),
    };
    assert!(decision(Some(&t), 10 * DAY, 0, &p).is_none());
    t.status = "completed".into();
    t.updated_at = "invalid".into();
    assert!(decision(Some(&t), 10 * DAY, 0, &p).is_none());
    assert!(decision(None, DAY - 1, 0, &p).is_none());
    assert!(decision(None, DAY, 0, &p).is_some());
}
#[cfg(target_os = "linux")]
#[tokio::test]
async fn deterministic_plan_excludes_sandbox_root_and_authority_controls_actual_delete() {
    let root = directory();
    fs::create_dir_all(root.join("temp/jait-windows-sandbox/vm")).unwrap();
    fs::create_dir_all(root.join("temp/jait-old/sub")).unwrap();
    fs::write(root.join("temp/jait-old/sub/data"), "1234").unwrap();
    fs::write(root.join("temp/unrelated"), "keep").unwrap();
    let service = service(&root);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 4 * DAY;
    let plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    assert_eq!(plan.entries.len(), 2);
    assert!(
        plan.entries
            .iter()
            .all(|e| e.path != root.join("temp/jait-windows-sandbox"))
    );
    let denied = service
        .run(
            now,
            false,
            Arc::new(Authority(false)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(denied.bytes_reclaimed, 0);
    assert!(root.join("temp/jait-old/sub/data").exists());
    let done = service
        .run(
            now,
            false,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(done.errors.is_empty(), "{:?}", done.errors);
    assert_eq!(done.bytes_reclaimed, 4);
    assert!(!root.join("temp/jait-old").exists());
    assert!(root.join("temp/jait-windows-sandbox").exists());
    assert!(root.join("temp/unrelated").exists());
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
#[cfg(target_os = "linux")]
#[test]
fn fd_cleanup_unlinks_inner_symlink_without_following_and_respects_cancel() {
    let root = directory();
    let tree = root.join("tree");
    fs::create_dir(&tree).unwrap();
    let outside = root.join("outside");
    fs::write(&outside, "keep").unwrap();
    std::os::unix::fs::symlink(&outside, tree.join("link")).unwrap();
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    assert!(
        remove_bounded(
            &tree,
            &mut Budget::new(
                20,
                Duration::from_secs(1),
                cancel,
                ProcessCancellation::default()
            ),
            None
        )
        .is_err()
    );
    assert!(tree.exists());
    remove_bounded(
        &tree,
        &mut Budget::new(
            20,
            Duration::from_secs(1),
            ProcessCancellation::default(),
            ProcessCancellation::default(),
        ),
        None,
    )
    .unwrap();
    assert_eq!(fs::read_to_string(outside).unwrap(), "keep");
    fs::remove_dir_all(root).unwrap();
}
#[tokio::test]
async fn any_live_owner_and_failed_database_exclude_orphan_cleanup() {
    let root = directory();
    let tree = root.join("worktrees/repo/owned%_");
    fs::create_dir_all(&tree).unwrap();
    let service = service(&root);
    let path = tree.to_string_lossy().into_owned();
    service
        .db
        .run(move |db| {
            db.execute(
                "INSERT INTO agent_threads VALUES('live','running',NULL,'2000-01-01',?)",
                [path.clone()],
            )?;
            db.execute(
                "INSERT INTO agent_threads VALUES('new','completed',NULL,'2020-01-01',?)",
                [path],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 4 * DAY;
    assert!(
        service
            .plan(now, ProcessCancellation::default())
            .await
            .unwrap()
            .entries
            .is_empty()
    );
    service.db.shutdown().await.unwrap();
    let plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    assert!(plan.entries.is_empty());
    assert!(!plan.errors.is_empty());
    fs::remove_dir_all(root).unwrap();
}
#[cfg(target_os = "linux")]
#[tokio::test]
async fn native_git_cleanup_removes_only_selected_worktree_and_preserves_branch() {
    struct GitAuthority;
    impl JanitorAuthority for GitAuthority {
        fn lease_entry(&self, _: &ReapedEntry) -> Result<Arc<dyn Send + Sync>, String> {
            Ok(Arc::new(()))
        }
        fn authorize_git(
            &self,
            entry: &ReapedEntry,
            request: &ProcessRequest,
        ) -> Result<Arc<dyn Send + Sync>, String> {
            assert_eq!(
                request.argv,
                vec![
                    "git",
                    "worktree",
                    "remove",
                    "--force",
                    "--",
                    entry.path.to_str().unwrap()
                ]
            );
            Ok(Arc::new(()))
        }
    }
    let root = directory();
    let main = root.join("main");
    let tree = root.join("worktrees/repo/topic");
    fs::create_dir_all(tree.parent().unwrap()).unwrap();
    let pool = ProcessPool::new(NonZeroU16::new(1).unwrap());
    async fn git(pool: &ProcessPool, root: &Path, args: Vec<String>) -> String {
        let out = pool
            .run(
                ProcessRequest {
                    argv: std::iter::once("/usr/bin/git".into()).chain(args).collect(),
                    cwd: root.into(),
                    environment: HashMap::from([("PATH".into(), "/usr/bin:/bin".into())]),
                    input: None,
                    timeout: Duration::from_secs(5),
                    output_limit: 64000,
                },
                ProcessCancellation::default(),
            )
            .await
            .unwrap();
        assert_eq!(out.exit_code, Some(0), "{}", out.output);
        out.output
    }
    git(
        &pool,
        &root,
        vec![
            "init".into(),
            "--initial-branch=main".into(),
            main.to_string_lossy().into_owned(),
        ],
    )
    .await;
    git(
        &pool,
        &main,
        [
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
    )
    .await;
    git(
        &pool,
        &main,
        vec![
            "worktree".into(),
            "add".into(),
            "-b".into(),
            "keep".into(),
            tree.to_string_lossy().into_owned(),
        ],
    )
    .await;
    let mut service = service(&root);
    service.environment = HashMap::from([("PATH".into(), "/usr/bin:/bin".into())]);
    let path = tree.to_string_lossy().into_owned();
    service.db.run(move|db|{db.execute("INSERT INTO agent_threads VALUES('terminal','completed','keep','2000-01-01T00:00:00Z',?)",[path])?;Ok(())}).await.unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 4 * DAY;
    let report = service
        .run(
            now,
            false,
            Arc::new(GitAuthority),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(report.errors.is_empty(), "{:?}", report.errors);
    assert_eq!(report.worktrees.len(), 1);
    assert!(!tree.exists());
    assert!(
        git(
            &pool,
            &main,
            vec![
                "show-ref".into(),
                "--verify".into(),
                "refs/heads/keep".into()
            ]
        )
        .await
        .contains("refs/heads/keep")
    );
    let list = git(
        &pool,
        &main,
        vec!["worktree".into(), "list".into(), "--porcelain".into()],
    )
    .await;
    assert!(!list.contains(tree.to_str().unwrap()));
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
