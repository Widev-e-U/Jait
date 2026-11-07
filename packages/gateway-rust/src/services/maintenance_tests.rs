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
#[test]
fn fix_plan_title_uses_local_day_not_the_utc_day() {
    // `new Date(value).toLocaleDateString()` renders in local time, so an instant just
    // after UTC midnight belongs to the previous local day west of Greenwich.
    let instant = chrono::DateTime::parse_from_rfc3339("2026-11-05T02:30:00Z").unwrap();
    let west = instant.with_timezone(&chrono::FixedOffset::west_opt(5 * 3600).unwrap());
    let date = js_locale_date(west);
    assert_eq!(date, "11/4/2026");
    assert_eq!(
        format!("Maintenance: {} check(s) failed — {date}", 1),
        "Maintenance: 1 check(s) failed — 11/4/2026"
    );
}
#[test]
fn locale_date_is_unpadded_and_rolls_the_year_in_local_time() {
    let new_year = chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z").unwrap();
    assert_eq!(js_locale_date(new_year), "1/1/2026");
    let late = chrono::DateTime::parse_from_rfc3339("2026-12-31T23:59:59Z").unwrap();
    let east = late.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap());
    assert_eq!(js_locale_date(east), "1/1/2027");
    let padded = chrono::DateTime::parse_from_rfc3339("2026-03-09T12:00:00Z").unwrap();
    assert_eq!(js_locale_date(padded), "3/9/2026");
}
#[test]
fn default_locale_date_agrees_with_measured_reference_per_time_zone() {
    // Expected strings were measured from the reference runtime with the same TZ:
    //   TZ=UTC              new Date("2026-11-05T02:30:00Z").toLocaleDateString() -> "11/5/2026"
    //   TZ=America/New_York                                           -> "11/4/2026"
    //   TZ=Asia/Tokyo                                                 -> "11/5/2026"
    //   TZ=UTC              new Date("2026-01-01T00:00:00Z")          -> "1/1/2026"
    //   TZ=America/New_York                                           -> "12/31/2025"
    let expected = match std::env::var("TZ").ok().as_deref() {
        Some("UTC") => Some(("11/5/2026", "1/1/2026")),
        Some("America/New_York") => Some(("11/4/2026", "12/31/2025")),
        Some("Asia/Tokyo") => Some(("11/5/2026", "1/1/2026")),
        _ => None,
    };
    // Without a measured zone this test cannot check anything, and passing silently would
    // overstate the evidence; the harness runs it once per zone.
    let Some((late, new_year)) = expected else {
        eprintln!("skipped: set TZ to a measured zone (UTC, America/New_York, Asia/Tokyo)");
        return;
    };
    assert_eq!(
        js_default_locale_date("2026-11-05T02:30:00Z").unwrap(),
        late
    );
    assert_eq!(
        js_default_locale_date("2026-01-01T00:00:00Z").unwrap(),
        new_year
    );
}
#[test]
fn default_locale_date_accepts_only_rfc3339_instants() {
    assert!(js_default_locale_date("2026-11-05T13:40:49.827Z").is_ok());
    assert_eq!(
        js_default_locale_date("2026-11-05T13:40:49Z").unwrap(),
        js_locale_date(
            chrono::DateTime::parse_from_rfc3339("2026-11-05T13:40:49Z")
                .unwrap()
                .with_timezone(&chrono::Local)
        )
    );
    assert!(js_default_locale_date("").is_err());
    assert!(js_default_locale_date("2026-11-05").is_err());
    assert!(js_default_locale_date("not a date").is_err());
}
