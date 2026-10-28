use super::*;
use std::{
    fs,
    num::NonZeroU16,
    sync::atomic::{AtomicBool, Ordering},
};
fn directory() -> PathBuf {
    let mut root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    while !root.join("packages/gateway-rust").exists() {
        assert!(root.pop());
    }
    let path = root
        .join(".jait/artifacts/gateway-rust/parallel-implementation/fixtures")
        .join(uuidv7().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
struct Authority {
    allow_checks: bool,
    entered: AtomicBool,
}
impl MaintenanceAuthority for Authority {
    fn repository(&self, _: &RepositoryRecord) -> Result<Arc<dyn Send + Sync>, String> {
        Ok(Arc::new(()))
    }
    fn check(
        &self,
        _: &RepositoryRecord,
        _: &MaintenanceCheck,
        _: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String> {
        self.entered.store(true, Ordering::Release);
        if self.allow_checks {
            Ok(Arc::new(()))
        } else {
            Err("denied".into())
        }
    }
    fn propose_plan(
        &self,
        _: &RepositoryRecord,
        tasks: &[Value],
    ) -> Result<Arc<dyn Send + Sync>, String> {
        assert!(tasks.iter().all(|t| t["status"] == "proposed"));
        Ok(Arc::new(()))
    }
    fn read_run(&self, _: &MaintenanceRunRecord) -> Result<(), String> {
        Ok(())
    }
}
fn fixture(root: &std::path::Path, auth: Arc<Authority>) -> MaintenanceService {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE automation_repositories(id TEXT PRIMARY KEY,user_id TEXT,device_id TEXT,name TEXT,default_branch TEXT,local_path TEXT,github_url TEXT,strategy TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE scheduled_job_runs(id TEXT PRIMARY KEY,job_id TEXT,status TEXT,triggered_by TEXT,output TEXT,error TEXT,plan_id TEXT,started_at TEXT,completed_at TEXT);
    CREATE TABLE automation_plans(id TEXT PRIMARY KEY,repo_id TEXT,user_id TEXT,title TEXT,status TEXT,tasks TEXT,created_at TEXT,updated_at TEXT);").unwrap();
    for id in ["repo", "repo2"] {
        db.execute("INSERT INTO automation_repositories VALUES(?,'owner',NULL,?,'main',?,NULL,NULL,'2020','2020')",params![id,id,root.to_string_lossy()]).unwrap();
    }
    MaintenanceService::new(
        DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap(),
        BlockingLane::new(NonZeroU16::new(2).unwrap()),
        ProcessPool::new(NonZeroU16::new(2).unwrap()),
        HashMap::from([("PATH".into(), "/usr/bin:/bin".into())]),
        vec!["/bin/sh".into(), "-c".into()],
        auth,
    )
    .unwrap()
}
fn config(commands: &[&str]) -> MaintenanceConfig {
    MaintenanceConfig {
        checks: commands
            .iter()
            .enumerate()
            .map(|(i, c)| MaintenanceCheck {
                name: format!("Check {i}"),
                command: (*c).into(),
            })
            .collect(),
        timeout_ms: 500,
        preferred_provider: None,
    }
}
#[cfg(unix)]
#[tokio::test]
async fn check_failures_create_only_proposed_tasks_and_persist_terminal_record() {
    let root = directory();
    let service = fixture(
        &root,
        Arc::new(Authority {
            allow_checks: true,
            entered: AtomicBool::new(false),
        }),
    );
    let result = service
        .run_for_repo(
            "repo",
            "job",
            config(&["printf success", "printf failure >&2; exit 2"]),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(!result.all_passed);
    assert!(result.checks[0].passed);
    assert_eq!(result.checks[1].output, "failure");
    assert!(result.plan_id.is_some());
    let run = service.get_run(&result.id).await.unwrap().unwrap();
    assert_eq!(run.status, "failed");
    assert_eq!(run.plan_id, result.plan_id);
    service
        .0
        .db
        .run(|db| {
            let tasks: String =
                db.query_row("SELECT tasks FROM automation_plans", [], |r| r.get(0))?;
            let tasks: Value = serde_json::from_str(&tasks)?;
            assert_eq!(tasks[0]["status"], "proposed");
            assert_eq!(tasks.as_array().unwrap().len(), 1);
            Ok(())
        })
        .await
        .unwrap();
    service.shutdown().await.unwrap();
    service.0.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
#[cfg(unix)]
#[tokio::test]
async fn denied_commands_cannot_write_and_run_all_does_not_cancel_its_parent() {
    let root = directory();
    let service = fixture(
        &root,
        Arc::new(Authority {
            allow_checks: false,
            entered: AtomicBool::new(false),
        }),
    );
    let cancel = ProcessCancellation::default();
    let results = service
        .run_all(
            "owner",
            "job",
            config(&["printf forbidden > forbidden"]),
            cancel.clone(),
        )
        .await
        .unwrap();
    assert_eq!(results.len(), 2);
    assert!(!cancel.is_cancelled());
    assert!(results.iter().all(|r| !r.as_ref().unwrap().all_passed));
    assert!(!root.join("forbidden").exists());
    service.shutdown().await.unwrap();
    service.0.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
#[cfg(unix)]
#[tokio::test]
async fn dropped_caller_cancels_owned_child_and_shutdown_finalizes_without_fix_plan() {
    let root = directory();
    let auth = Arc::new(Authority {
        allow_checks: true,
        entered: AtomicBool::new(false),
    });
    let service = fixture(&root, auth.clone());
    let runner = service.clone();
    let task = tokio::spawn(async move {
        runner
            .run_for_repo(
                "repo",
                "job",
                config(&["sleep 5"]),
                ProcessCancellation::default(),
            )
            .await
    });
    tokio::time::timeout(Duration::from_secs(5), async {
        while !auth.entered.load(Ordering::Acquire) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    task.abort();
    let _ = task.await;
    service.shutdown().await.unwrap();
    let runs = service.list_runs(None, 50).await.unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, "failed");
    assert!(runs[0].completed_at.is_some());
    assert!(runs[0].plan_id.is_none());
    service.0.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
#[cfg(unix)]
#[tokio::test]
async fn timeout_is_failure_and_output_is_bounded() {
    let root = directory();
    let service = fixture(
        &root,
        Arc::new(Authority {
            allow_checks: true,
            entered: AtomicBool::new(false),
        }),
    );
    let mut c = config(&["sleep 5"]);
    c.timeout_ms = 20;
    let result = service
        .run_for_repo("repo", "job", c, ProcessCancellation::default())
        .await
        .unwrap();
    assert!(!result.all_passed);
    assert!(result.checks[0].timed_out);
    assert!(result.checks[0].output.len() <= 50_000);
    service.shutdown().await.unwrap();
    service.0.db.shutdown().await.unwrap();
    fs::remove_dir_all(root).unwrap();
}
