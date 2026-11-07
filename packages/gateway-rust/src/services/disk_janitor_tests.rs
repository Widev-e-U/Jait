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

#[cfg(target_os = "linux")]
#[tokio::test]
async fn nested_activity_blocks_scratch_at_plan_and_again_before_reap() {
    let root = directory();
    let tree = root.join("temp/jait-old");
    let file = tree.join("nested/data");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "active").unwrap();
    let service = service(&root);
    let now_time = SystemTime::now() + Duration::from_millis(4 * DAY);
    let now = now_time.duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
    let plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    let entry = plan
        .entries
        .iter()
        .find(|entry| entry.path == tree)
        .unwrap()
        .clone();
    fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(now_time))
        .unwrap();
    let fresh_plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    assert!(!fresh_plan.entries.iter().any(|entry| entry.path == tree));
    assert!(fresh_plan.errors.is_empty(), "{:?}", fresh_plan.errors);
    assert!(!fresh_plan.truncated);
    let guard = Arc::new(Arc::new(Semaphore::new(1)).acquire_owned().await.unwrap());
    let result = service
        .reap(
            &entry,
            now,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
            guard,
        )
        .await;
    assert!(result.is_err(), "recent nested data must prevent deletion");
    assert_eq!(fs::read(&file).unwrap(), b"active");
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[test]
fn nested_activity_scan_fails_closed_on_cancel_and_budget_exhaustion() {
    let root = directory();
    fs::write(root.join("child"), "data").unwrap();
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    assert!(
        newest_mtime(
            &root,
            &mut Budget::new(
                10,
                Duration::from_secs(1),
                cancel,
                ProcessCancellation::default()
            )
        )
        .is_err()
    );
    assert!(
        newest_mtime(
            &root,
            &mut Budget::new(
                1,
                Duration::from_secs(1),
                ProcessCancellation::default(),
                ProcessCancellation::default()
            )
        )
        .is_err()
    );
    assert!(root.join("child").exists());
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[test]
fn sticky_owner_decision_and_identity_checks_fail_closed() {
    use std::os::unix::fs::PermissionsExt;
    assert!(sticky_owner_blocked(0o1777, 1001, 1000));
    assert!(!sticky_owner_blocked(0o1777, 1000, 1000));
    assert!(!sticky_owner_blocked(0o0777, 1001, 1000));
    let root = directory();
    fs::set_permissions(&root, fs::Permissions::from_mode(0o1777)).unwrap();
    let child = root.join("jait-owned");
    fs::write(&child, "data").unwrap();
    let actual = stamp(&fs::symlink_metadata(&child).unwrap()).unwrap();
    let budget = || {
        Budget::new(
            10,
            Duration::from_secs(1),
            ProcessCancellation::default(),
            ProcessCancellation::default(),
        )
    };
    assert!(!sticky_foreign_owned(&root, &child, &actual, &mut budget()).unwrap());
    let real_uid = unsafe { libc::getuid() };
    let other_uid = if real_uid == 0 { 1 } else { 0 };
    assert!(
        scoped_io::sticky_foreign_owned_as(&root, &child, &actual, &mut budget(), other_uid)
            .unwrap()
    );
    let mut changed = actual.clone();
    changed.inode ^= 1;
    assert!(sticky_foreign_owned(&root, &child, &changed, &mut budget()).is_err());
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    assert!(
        sticky_foreign_owned(
            &root,
            &child,
            &actual,
            &mut Budget::new(
                10,
                Duration::from_secs(1),
                cancel,
                ProcessCancellation::default()
            )
        )
        .is_err()
    );
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn sticky_owned_scratch_is_in_dry_run_and_count_is_reported() {
    use std::os::unix::fs::PermissionsExt;
    let root = directory();
    let temp = root.join("temp");
    fs::create_dir_all(&temp).unwrap();
    fs::set_permissions(&temp, fs::Permissions::from_mode(0o1777)).unwrap();
    fs::write(temp.join("jait-owned"), "data").unwrap();
    let service = service(&root);
    let now = (SystemTime::now() + Duration::from_millis(4 * DAY))
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let report = service
        .run(
            now,
            true,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(report.blocked_foreign_owned, 0);
    assert_eq!(report.temp_scratch.len(), 1);
    assert_eq!(
        serde_json::to_value(&report).unwrap()["blockedForeignOwned"],
        0
    );
    assert!(temp.join("jait-owned").exists());
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn worktree_branch_drift_rejects_before_any_removal() {
    let root = directory();
    let tree = root.join("worktrees/repo/topic");
    fs::create_dir_all(&tree).unwrap();
    fs::write(tree.join("data"), "keep").unwrap();
    let service = service(&root);
    let path = tree.to_string_lossy().into_owned();
    service.db.run(move |db| {
        db.execute("INSERT INTO agent_threads VALUES('done','completed','before','2000-01-01T00:00:00Z',?)", [path])?;
        Ok(())
    }).await.unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 4 * DAY;
    let plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    let entry = plan
        .entries
        .iter()
        .find(|entry| entry.path == tree)
        .unwrap()
        .clone();
    service
        .db
        .run(|db| {
            db.execute(
                "UPDATE agent_threads SET branch='after' WHERE id='done'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    let guard = Arc::new(Arc::new(Semaphore::new(1)).acquire_owned().await.unwrap());
    let err = service
        .reap(
            &entry,
            now,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
            guard,
        )
        .await
        .unwrap_err();
    assert!(matches!(err, ReapError::Other(message) if message.contains("branch changed")));
    assert_eq!(fs::read(tree.join("data")).unwrap(), b"keep");
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn scan_failure_marks_report_truncated_and_keeps_candidate() {
    let root = directory();
    let tree = root.join("temp/jait-deep");
    let mut nested = tree.clone();
    for _ in 0..66 {
        nested.push("d");
    }
    fs::create_dir_all(&nested).unwrap();
    fs::write(nested.join("data"), "keep").unwrap();
    let service = service(&root);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 4 * DAY;
    let report = service
        .run(
            now,
            true,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(report.truncated);
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("depth limit")),
        "{:?}",
        report.errors
    );
    assert!(!report.temp_scratch.iter().any(|entry| entry.path == tree));
    assert!(nested.join("data").exists());
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn dropped_git_caller_cancels_child_before_releasing_effect_leases() {
    use std::sync::atomic::{AtomicBool, Ordering};
    struct Marker(Arc<AtomicBool>);
    impl Drop for Marker {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let root = directory();
    let entry_released = Arc::new(AtomicBool::new(false));
    let git_released = Arc::new(AtomicBool::new(false));
    let entry_lease: Arc<dyn Send + Sync> = Arc::new(Marker(entry_released.clone()));
    let git_lease: Arc<dyn Send + Sync> = Arc::new(Marker(git_released.clone()));
    let permit = Arc::new(Arc::new(Semaphore::new(1)).acquire_owned().await.unwrap());
    let request = ProcessRequest {
        argv: vec![
            "/bin/sh".into(),
            "-c".into(),
            "echo $$ > child.pid; exec /bin/sleep 30".into(),
        ],
        cwd: root.clone(),
        environment: HashMap::new(),
        input: None,
        timeout: Duration::from_secs(10),
        output_limit: 1024,
    };
    let caller = tokio::spawn(run_git_supervised(
        ProcessPool::new(NonZeroU16::new(1).unwrap()),
        request,
        ProcessCancellation::default(),
        ProcessCancellation::default(),
        entry_lease,
        git_lease,
        permit,
    ));
    let pid: i32 = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(contents) = fs::read_to_string(root.join("child.pid"))
                && let Ok(pid) = contents.trim().parse()
            {
                break pid;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert!(!entry_released.load(Ordering::SeqCst));
    assert!(!git_released.load(Ordering::SeqCst));
    caller.abort();
    let _ = caller.await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while !entry_released.load(Ordering::SeqCst) || !git_released.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    // The supervised runner waits for the direct child before it releases the leases.
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH));
    fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn stop_and_drain_waits_for_retained_run_permit_and_refuses_new_run() {
    let root = directory();
    let service = Arc::new(service(&root));
    let permit = service.running.clone().acquire_owned().await.unwrap();
    let drain_service = service.clone();
    let drain = tokio::spawn(async move { drain_service.stop_and_drain().await });
    tokio::time::timeout(Duration::from_secs(2), service.stopped.wait_cancelled())
        .await
        .unwrap();
    assert!(!drain.is_finished());
    let report = service
        .run(
            0,
            false,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("stopped"));
    drop(permit);
    tokio::time::timeout(Duration::from_secs(2), drain)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn empty_worktree_containers_are_reported_in_dry_run_but_removal_fails_closed() {
    let root = directory();
    let old_dir = root.join("worktrees/old");
    let new_dir = root.join("worktrees/new");
    let occupied = root.join("worktrees/occupied");
    for path in [&old_dir, &new_dir, &occupied] {
        fs::create_dir_all(path).unwrap();
    }
    // Even a dangling symlink counts as contents.
    std::os::unix::fs::symlink("missing", occupied.join("link")).unwrap();
    let old_time = SystemTime::now() - Duration::from_millis(2 * DAY);
    fs::File::open(&old_dir)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old_time))
        .unwrap();
    fs::File::open(&occupied)
        .unwrap()
        .set_times(fs::FileTimes::new().set_modified(old_time))
        .unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let service = service(&root);
    let dry = service
        .run(
            now,
            true,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(dry.errors.is_empty(), "{:?}", dry.errors);
    assert_eq!(dry.worktrees.len(), 1);
    assert_eq!(dry.worktrees[0].path, old_dir);
    assert_eq!(dry.worktrees[0].reason, "empty worktree container");
    assert_eq!(dry.bytes_reclaimed, 0);
    assert!(old_dir.exists());
    let done = service
        .run(
            now,
            false,
            Arc::new(Authority(true)),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(done.errors.len(), 1, "{:?}", done.errors);
    assert!(done.errors[0].contains("enforceable parent namespace exclusion"));
    assert!(done.worktrees.is_empty());
    assert!(old_dir.exists());
    assert!(new_dir.exists());
    assert!(occupied.join("link").symlink_metadata().is_ok());
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn planned_container_rechecks_when_contents_appear() {
    let root = directory();
    let container = root.join("worktrees/repo");
    fs::create_dir_all(&container).unwrap();
    let service = service(&root);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
        + 2 * DAY;
    let plan = service
        .plan(now, ProcessCancellation::default())
        .await
        .unwrap();
    assert_eq!(plan.entries.len(), 1);
    fs::write(container.join("new-file"), "keep").unwrap();
    let permit = Arc::new(service.running.clone().acquire_owned().await.unwrap());
    assert!(
        service
            .reap(
                &plan.entries[0],
                now,
                Arc::new(Authority(true)),
                ProcessCancellation::default(),
                permit
            )
            .await
            .is_err()
    );
    assert_eq!(
        fs::read_to_string(container.join("new-file")).unwrap(),
        "keep"
    );
    // Exercise the final non-recursive removal guard even with a stale stamp.
    let mut budget = Budget::new(
        100,
        Duration::from_secs(1),
        ProcessCancellation::default(),
        ProcessCancellation::default(),
    );
    assert!(remove_empty_container(&container, &plan.entries[0].stamp, &mut budget).is_err());
    assert!(container.join("new-file").exists());
    service.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn warnings_preserve_typed_failures_and_deduplicate_per_instance() {
    let root = directory();
    let janitor = service(&root);
    let other = service(&root);
    let mut report = DiskJanitorReport {
        enabled: true,
        dry_run: false,
        worktrees: vec![],
        temp_scratch: vec![],
        sandbox_storage: vec![],
        bytes_reclaimed: 0,
        blocked_foreign_owned: 0,
        removal_failures: vec![RemovalFailure {
            path: root.join("temp/jait-blocked"),
            kind: EntryKind::TempScratch,
            permission_denied: true,
            raw_os_error: Some(libc::EACCES),
            message: "denied".into(),
        }],
        errors: vec!["denied".into()],
        skipped_reason: None,
        truncated: false,
    };
    report.dry_run = true;
    assert!(janitor.warning_for_report(&report).is_none());
    report.dry_run = false;
    assert!(
        janitor
            .warning_for_report(&report)
            .unwrap()
            .body
            .contains("jait-blocked")
    );
    assert!(janitor.warning_for_report(&report).is_none());
    assert!(other.warning_for_report(&report).is_some());
    report.blocked_foreign_owned = 2;
    assert!(
        janitor
            .warning_for_report(&report)
            .unwrap()
            .body
            .contains("2 jait-*")
    );
    report.skipped_reason = Some("stopped".into());
    report.blocked_foreign_owned = 3;
    assert!(janitor.warning_for_report(&report).is_none());
    report.skipped_reason = None;
    assert!(janitor.warning_for_report(&report).is_some());
    let entry = ReapedEntry {
        path: root.join("temp/jait-x"),
        bytes: 0,
        reason: String::new(),
        kind: EntryKind::TempScratch,
        branch: None,
        root: root.join("temp"),
        stamp: Stamp {
            modified_ms: 0,
            size: 0,
            directory: true,
            device: 0,
            inode: 0,
        },
    };
    match removal_failure(&entry, io::Error::from_raw_os_error(libc::EACCES)) {
        ReapError::Removal(failure) => {
            assert!(failure.permission_denied);
            assert_eq!(failure.raw_os_error, Some(libc::EACCES));
        }
        _ => panic!("expected typed removal failure"),
    }
    fs::remove_dir_all(root).unwrap();
}
