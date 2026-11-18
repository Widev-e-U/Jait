//! W1 consumer-level verification: `services/maintenance.ts` -> `services/maintenance.rs`.
//!
//! PROVENANCE OF EXPECTATIONS
//! * Defaults are taken from the REAL TypeScript implementation, re-read directly:
//!     sed -n '55,63p' packages/gateway/src/services/maintenance.ts
//!   -> `DEFAULT_CHECKS = [Typecheck:"bun run typecheck", Tests:"bun run test", Lint:"bun run lint"]`
//!      and `const DEFAULT_TIMEOUT_MS = 120_000;`  (TS: `config?.checks ?? DEFAULT_CHECKS`,
//!      `config?.timeoutMs ?? DEFAULT_TIMEOUT_MS` — i.e. every field optional, camelCase wire shape).
//! * The HTTP/tool surfaces of this component are already covered by the existing contract tests
//!   `gateway_rust_maintenance_http.rs` / `gateway_rust_maintenance_tool.rs` (drivers
//!   `drivers/nativemaintenancehttp.ts`, `drivers/nativemaintenancetool.ts`). This file covers the
//!   service core instead: `MaintenanceService::new`/`plan`/`run_for_repo` gate ordering. TS has no
//!   service-level bounds or authority layer (those are native hardening), so those cases are
//!   marked NATIVE-INVARIANT and assert the exact native strings from
//!   `packages/gateway-rust/src/services/maintenance.rs:171-260`.
use jait_gateway::db::worker::DatabaseWorker;
use jait_gateway::execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest};
use jait_gateway::runtime::blocking::BlockingLane;
use jait_gateway::services::maintenance::{
    MaintenanceAuthority, MaintenanceCheck, MaintenanceConfig, MaintenanceRunRecord,
    MaintenanceService,
};
use jait_gateway::services::repositories::{CreateRepository, RepositoryRecord, RepositoryService};
use serde_json::Value;
use std::collections::HashMap;
use std::num::NonZeroU16;
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------- fixture ----

#[derive(Default)]
struct StubAuthority {
    denied: bool,
    leased: Mutex<Vec<String>>,
}

impl MaintenanceAuthority for StubAuthority {
    fn repository(&self, repo: &RepositoryRecord) -> Result<Arc<dyn Send + Sync>, String> {
        self.leased.lock().unwrap().push(repo.id.clone());
        if self.denied {
            return Err("denied".into());
        }
        Ok(Arc::new(()))
    }
    fn check(
        &self,
        _repo: &RepositoryRecord,
        _check: &MaintenanceCheck,
        _request: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String> {
        Ok(Arc::new(()))
    }
    fn propose_plan(
        &self,
        _repo: &RepositoryRecord,
        _tasks: &[Value],
    ) -> Result<Arc<dyn Send + Sync>, String> {
        Ok(Arc::new(()))
    }
    fn read_run(&self, _run: &MaintenanceRunRecord) -> Result<(), String> {
        Ok(())
    }
}

fn worker(stored_path: Option<&str>) -> (DatabaseWorker, Option<String>) {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    jait_gateway::db::migrate_database(&connection).unwrap();
    let mut created = None;
    if let Some(path) = stored_path {
        let record = RepositoryService::new(&connection)
            .create(CreateRepository {
                name: "demo".into(),
                local_path: path.to_string(),
                user_id: Some("user-1".into()),
                device_id: None,
                default_branch: Some("main".into()),
                github_url: None,
                forge_url: None,
            })
            .unwrap();
        created = Some(record.id);
    }
    (
        DatabaseWorker::new(connection, NonZeroU16::new(1).unwrap()).unwrap(),
        created,
    )
}

fn service_with_id(
    stored_path: Option<&str>,
    authority: Arc<StubAuthority>,
) -> (MaintenanceService, Option<String>) {
    let (db, id) = worker(stored_path);
    let svc = MaintenanceService::new(
        db,
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
        ProcessPool::new(NonZeroU16::new(1).unwrap()),
        HashMap::new(),
        vec!["/bin/sh".into(), "-c".into()],
        authority,
    )
    .expect("valid shell");
    (svc, id)
}

fn service(stored_path: Option<&str>, authority: Arc<StubAuthority>) -> MaintenanceService {
    service_with_id(stored_path, authority).0
}

fn temp_repo_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/verify-w1/fixtures")
        .join(format!("jait-w1-maint-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::canonicalize(&dir).unwrap()
}

// ------------------------------------------------------------------ tests ----

#[test]
fn maintenance_defaults_match_ts_configuration() {
    let config = MaintenanceConfig::default();
    let got: Vec<(String, String)> = config
        .checks
        .iter()
        .map(|c| (c.name.clone(), c.command.clone()))
        .collect();
    assert_eq!(
        got,
        vec![
            ("Typecheck".to_string(), "bun run typecheck".to_string()),
            ("Tests".to_string(), "bun run test".to_string()),
            ("Lint".to_string(), "bun run lint".to_string()),
        ],
        "default checks must equal TS DEFAULT_CHECKS"
    );
    assert_eq!(config.timeout_ms, 120_000, "DEFAULT_TIMEOUT_MS parity");
    assert_eq!(config.preferred_provider, None);

    // camelCase wire shape, all fields optional — mirrors `config?.checks ?? DEFAULT_CHECKS`.
    let parsed: MaintenanceConfig = serde_json::from_value(serde_json::json!({
        "timeoutMs": 500,
        "checks": [{"name": "A", "command": "b"}],
        "preferredProvider": "cursor"
    }))
    .expect("camelCase deserialization");
    assert_eq!(parsed.timeout_ms, 500);
    assert_eq!(parsed.checks.len(), 1);
    assert_eq!(parsed.checks[0].name, "A");
    assert_eq!(parsed.checks[0].command, "b");
    assert_eq!(parsed.preferred_provider.as_deref(), Some("cursor"));
    let empty: MaintenanceConfig = serde_json::from_value(serde_json::json!({})).unwrap();
    assert_eq!(empty.timeout_ms, 120_000);
    assert_eq!(empty.checks.len(), 3);
}

#[test]
fn maintenance_rejects_invalid_shell_prefix() {
    // NATIVE-INVARIANT: maintenance.rs:171-183 — shell is an explicit argv prefix, never inferred.
    let cases: Vec<Vec<String>> = vec![
        vec![],
        vec!["".into()],
        vec!["sh".into(), "bad\0arg".into()],
        (0..9).map(|i| format!("a{i}")).collect(),
    ];
    for shell in cases {
        let err = MaintenanceService::new(
            worker(None).0,
            BlockingLane::new(NonZeroU16::new(1).unwrap()),
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            HashMap::new(),
            shell.clone(),
            Arc::new(StubAuthority::default()),
        )
        .err()
        .unwrap_or_else(|| panic!("invalid shell accepted: {shell:?}"));
        assert_eq!(err, "invalid maintenance shell", "shell={shell:?}");
    }
}

#[tokio::test]
async fn maintenance_plan_rejects_out_of_bounds_input() {
    let authority = Arc::new(StubAuthority::default());
    let svc = service(None, authority.clone());
    let base = MaintenanceConfig::default();

    // NATIVE-INVARIANT: bounds have no TS service-level counterpart (TS validates at HTTP edge).
    let cases: Vec<(String, MaintenanceConfig, &str)> = vec![
        (String::new(), base.clone(), "invalid maintenance job id"),
        ("x".repeat(513), base.clone(), "invalid maintenance job id"),
        (
            "job".to_string(),
            MaintenanceConfig {
                timeout_ms: 0,
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
        (
            "job".to_string(),
            MaintenanceConfig {
                timeout_ms: 600_001,
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
        (
            "job".to_string(),
            MaintenanceConfig {
                checks: (0..33)
                    .map(|i| MaintenanceCheck {
                        name: format!("c{i}"),
                        command: "true".into(),
                    })
                    .collect(),
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
        (
            "job".to_string(),
            MaintenanceConfig {
                checks: vec![MaintenanceCheck {
                    name: String::new(),
                    command: "true".into(),
                }],
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
        (
            "job".to_string(),
            MaintenanceConfig {
                checks: vec![MaintenanceCheck {
                    name: "n".into(),
                    command: "e\0vil".into(),
                }],
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
        (
            "job".to_string(),
            MaintenanceConfig {
                checks: vec![MaintenanceCheck {
                    name: "n".to_string() + &"x".repeat(256),
                    command: "true".into(),
                }],
                ..base.clone()
            },
            "maintenance configuration exceeds bounds",
        ),
    ];
    for (job_id, config, expected) in cases {
        let err = svc
            .plan("repo-1", &job_id, config)
            .await
            .expect_err("must reject");
        assert_eq!(err, expected, "job_id={job_id:?}");
    }
    assert!(
        authority.leased.lock().unwrap().is_empty(),
        "validation must precede any lease"
    );
}

#[tokio::test]
async fn maintenance_plan_reports_missing_repo_non_canonical_path_and_denial() {
    let authority = Arc::new(StubAuthority::default());
    let svc = service(None, authority.clone());
    let config = MaintenanceConfig::default();

    let err = svc
        .plan("ghost", "job", config.clone())
        .await
        .expect_err("missing repo");
    assert_eq!(err, "Repository not found: ghost");

    // Lease is requested before path validation, and denial short-circuits verbatim.
    let dir = temp_repo_dir("deny");
    let denying = Arc::new(StubAuthority {
        denied: true,
        leased: Mutex::new(Vec::new()),
    });
    let (denied, denied_id) = service_with_id(Some(dir.to_str().unwrap()), denying.clone());
    let denied_id = denied_id.expect("repo persisted");
    let err = denied
        .plan(&denied_id, "job", config.clone())
        .await
        .expect_err("denied");
    assert_eq!(err, "denied");
    assert_eq!(
        denying.leased.lock().unwrap().as_slice(),
        [denied_id.clone()]
    );

    // Relative stored path => non canonical.
    let rel = temp_repo_dir("rel");
    let (relative_svc, relative_id) =
        service_with_id(Some("relative/path"), Arc::new(StubAuthority::default()));
    let relative_id = relative_id.expect("repo persisted");
    let err = relative_svc
        .plan(&relative_id, "job", config.clone())
        .await
        .expect_err("relative");
    assert_eq!(err, "repository path is inaccessible or non canonical");

    // Redundant `.` components / trailing separators are accepted: `PathBuf` equality ignores
    // them, so `canonicalize(path) == path` still holds (asserted here so a future change to
    // `validate_repo_path` cannot silently start rejecting them).
    let dotted = format!("{}/./", rel.to_str().unwrap());
    let (dotted_svc, dotted_id) =
        service_with_id(Some(&dotted), Arc::new(StubAuthority::default()));
    let dotted_id = dotted_id.expect("repo persisted");
    let plan = dotted_svc
        .plan(&dotted_id, "job", config.clone())
        .await
        .expect("redundant `.` components are path-equal to the canonical form");
    assert_eq!(plan.repo.local_path, dotted);

    // Empty local_path is not absolute => refusal.
    let (empty_svc, empty_id) = service_with_id(Some(""), Arc::new(StubAuthority::default()));
    let empty_id = empty_id.expect("repo persisted");
    let err = empty_svc
        .plan(&empty_id, "job", config.clone())
        .await
        .expect_err("empty path");
    assert_eq!(err, "repository path is inaccessible or non canonical");

    // Missing directory => same refusal.
    let (missing_svc, missing_id) = service_with_id(
        Some("/nonexistent/jait-w1/nope"),
        Arc::new(StubAuthority::default()),
    );
    let missing_id = missing_id.expect("repo persisted");
    let err = missing_svc
        .plan(&missing_id, "job", config.clone())
        .await
        .expect_err("missing dir");
    assert_eq!(err, "repository path is inaccessible or non canonical");

    let _ = std::fs::remove_dir_all(&dir);
    let _ = std::fs::remove_dir_all(&rel);
}

#[tokio::test]
async fn maintenance_plan_preserves_check_order_and_returns_repo_record() {
    let dir = temp_repo_dir("ok");
    let authority = Arc::new(StubAuthority::default());
    let (svc, repo_id) = service_with_id(Some(dir.to_str().unwrap()), authority.clone());
    let repo_id = repo_id.expect("repo persisted");

    let plan = svc
        .plan(
            &repo_id,
            "nightly",
            MaintenanceConfig {
                checks: vec![
                    MaintenanceCheck {
                        name: "Second".into(),
                        command: "true".into(),
                    },
                    MaintenanceCheck {
                        name: "First".into(),
                        command: "false".into(),
                    },
                ],
                timeout_ms: 5_000,
                preferred_provider: Some("cursor".into()),
            },
        )
        .await
        .expect("plan ok");

    assert_eq!(plan.job_id, "nightly");
    assert_eq!(plan.timeout_ms, 5_000);
    assert_eq!(plan.repo.id, repo_id);
    assert_eq!(plan.repo.name, "demo");
    assert_eq!(
        plan.checks
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>(),
        vec!["Second", "First"],
        "TS iterates config.checks in order; the plan must not reorder"
    );
    assert_eq!(
        authority.leased.lock().unwrap().as_slice(),
        [repo_id.clone()],
        "exactly one repo lease"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn maintenance_run_for_repo_refuses_when_cancelled() {
    // NATIVE-INVARIANT: run_for_repo() checks cancellation before acquiring a permit or planning.
    let svc = service(None, Arc::new(StubAuthority::default()));
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    let err = svc
        .run_for_repo("1", "job", MaintenanceConfig::default(), cancel)
        .await
        .expect_err("cancelled");
    assert_eq!(err, "maintenance stopped");
}

// ------------------------------------------------ run path (executeRun / createFixPlan) ----
//
// The tests above cover only plan(); these exercise the actual run path: executing checks,
// persisting scheduled_job_runs, and proposing the fix Plan. A file-backed database is used so a
// second connection can assert on what executeRun() committed.
//
// Expectations are derived from packages/gateway/src/services/maintenance.ts:
//   * summary line  `${passed ? "✓" : "✗"} ${name} (${duration}ms)`            (~L150)
//   * status        `allPassed ? "completed" : "failed"`                       (~L160)
//   * error         `"Failing: " + output.slice(0, 2000)` per failure, joined
//                   with "\n---\n", then sliced to 50_000                    (~L165-180)
//   * plan title    `Maintenance: ${n} check(s) failed — ${date}`             (L258)
//   * fix task      title `Fix ${name} failures`, description template       (L243-253)
//
// DOCUMENTED DIVERGENCE (not asserted as equal): TS renders the plan date with
// toLocaleDateString() (e.g. "11/4/2026"), which is host-locale dependent; the native port
// renders an ISO `YYYY-MM-DD` day. Tests therefore pin the stable prefix plus an ISO-shaped
// suffix taken from the run's own completed_at.

fn file_backed(dir: &std::path::Path) -> (MaintenanceService, String, rusqlite::Connection) {
    let db_path = dir.join("jait-maintenance.db");
    let connection = rusqlite::Connection::open(&db_path).unwrap();
    jait_gateway::db::migrate_database(&connection).unwrap();
    let repo = RepositoryService::new(&connection)
        .create(CreateRepository {
            name: "demo".into(),
            local_path: dir.to_str().unwrap().to_string(),
            user_id: Some("user-1".into()),
            device_id: None,
            default_branch: Some("main".into()),
            github_url: None,
            forge_url: None,
        })
        .unwrap();
    let inspector = rusqlite::Connection::open(&db_path).unwrap();
    let db = DatabaseWorker::new(connection, NonZeroU16::new(1).unwrap()).unwrap();
    let svc = MaintenanceService::new(
        db,
        BlockingLane::new(NonZeroU16::new(1).unwrap()),
        ProcessPool::new(NonZeroU16::new(1).unwrap()),
        HashMap::new(),
        vec!["/bin/sh".into(), "-c".into()],
        Arc::new(StubAuthority::default()),
    )
    .expect("valid shell");
    (svc, repo.id, inspector)
}

fn one_check(name: &str, command: &str) -> MaintenanceConfig {
    MaintenanceConfig {
        checks: vec![MaintenanceCheck {
            name: name.into(),
            command: command.into(),
        }],
        timeout_ms: 20_000,
        preferred_provider: None,
    }
}

#[tokio::test]
async fn maintenance_run_executes_check_and_persists_completed_run() {
    let dir = temp_repo_dir("run-ok");
    let (svc, repo_id, db) = file_backed(&dir);

    let run = svc
        .run_for_repo(
            &repo_id,
            "nightly",
            one_check("Pass", "printf ok"),
            ProcessCancellation::default(),
        )
        .await
        .expect("run ok");

    assert!(run.all_passed, "exit 0 must count as a pass");
    assert!(!run.cancelled);
    assert_eq!(run.repo_id, repo_id);
    assert_eq!(run.repo_name, "demo");
    assert_eq!(run.checks.len(), 1);
    let check = &run.checks[0];
    assert!(check.passed);
    assert!(!check.timed_out);
    assert_eq!(check.output, "ok");
    assert_eq!(
        run.plan_id, None,
        "createFixPlan() is only called when at least one check fails"
    );

    // executeRun()'s summary format: every check contributes one `✓|✗ <name> (<ms>ms)` line.
    let expected_summary = format!("✓ Pass ({}ms)", check.duration_ms);
    assert_eq!(check_summary(&run), expected_summary);

    let row = db
        .query_row(
            "SELECT status, output, error, plan_id, job_id FROM scheduled_job_runs WHERE id = ?1",
            [&run.id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )
        .expect("run row persisted");
    assert_eq!(row.0, "completed");
    assert_eq!(row.1, expected_summary);
    assert_eq!(row.2, None, "a passing run stores a NULL error");
    assert_eq!(row.3, None);
    assert_eq!(row.4, "nightly");

    let _ = std::fs::remove_dir_all(&dir);
}

/// The summary line(s) executeRun() builds and persists as scheduled_job_runs.output.
fn check_summary(run: &jait_gateway::services::maintenance::MaintenanceRunResult) -> String {
    run.checks
        .iter()
        .map(|c| {
            format!(
                "{} {} ({}ms)",
                if c.passed { "✓" } else { "✗" },
                c.name,
                c.duration_ms
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[tokio::test]
async fn maintenance_run_failure_records_error_and_proposes_fix_plan() {
    let dir = temp_repo_dir("run-fail");
    let (svc, repo_id, db) = file_backed(&dir);

    let run = svc
        .run_for_repo(
            &repo_id,
            "nightly",
            one_check("Failing", "echo boom >&2; exit 3"),
            ProcessCancellation::default(),
        )
        .await
        .expect("run returns Ok even when checks fail");

    assert!(!run.all_passed);
    let check = &run.checks[0];
    assert!(!check.passed);
    assert!(check.output.contains("boom"));
    assert_eq!(check.command, "echo boom >&2; exit 3");
    assert_eq!(
        check_summary(&run),
        format!("✗ Failing ({}ms)", check.duration_ms)
    );

    // --- run row: status/error follow the TS failure branch.
    let (status, output, error, plan_id) = db
        .query_row(
            "SELECT status, output, error, plan_id FROM scheduled_job_runs WHERE id = ?1",
            [&run.id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .expect("run row persisted");
    assert_eq!(status, "failed");
    assert_eq!(output, check_summary(&run));
    let error = error.expect("a failing run stores its failures");
    assert!(error.starts_with("Failing: "), "got {error:?}");
    assert!(
        error.contains("boom"),
        "per-failure output is included: {error:?}"
    );

    let plan_id = plan_id.expect("createFixPlan() must run when a check fails");
    assert_eq!(run.plan_id.as_deref(), Some(plan_id.as_str()));

    // --- plan + proposed task: exact TS literals (native stores tasks as a JSON column).
    let (title, tasks_json): (String, String) = db
        .query_row(
            "SELECT title, tasks FROM automation_plans WHERE id = ?1",
            [&plan_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .expect("plan persisted");
    let prefix = "Maintenance: 1 check(s) failed — ";
    let suffix = title
        .strip_prefix(prefix)
        .unwrap_or_else(|| panic!("unexpected plan title {title:?}"));
    // TS renders this day with `new Date().toLocaleDateString()`. Measured reference output
    // (bun, same runtime as production) is unpadded en-US `M/D/YYYY` in the host zone:
    // TZ=UTC "11/5/2026", TZ=America/New_York "11/4/2026", TZ=Asia/Tokyo "11/5/2026" for
    // 2026-11-05T02:30:00Z. Assert that shape here; the host-local day and year rollover are
    // pinned by the crate-side differential tests, which run once per measured zone.
    let parts: Vec<&str> = suffix.split('/').collect();
    assert_eq!(parts.len(), 3, "expected an M/D/YYYY day, got {suffix:?}");
    assert!(
        parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())),
        "expected only digits and slashes, got {suffix:?}"
    );
    assert!(
        parts[0].len() <= 2 && parts[1].len() <= 2 && parts[2].len() == 4,
        "expected an unpadded month and day with a 4-digit year, got {suffix:?}"
    );

    let tasks: Vec<serde_json::Value> =
        serde_json::from_str(&tasks_json).expect("plan tasks are a JSON array");
    assert_eq!(tasks.len(), 1, "exactly one fix task per failing check");
    let task = &tasks[0];
    assert_eq!(task["title"], serde_json::json!("Fix Failing failures"));
    assert_eq!(
        task["status"],
        serde_json::json!("proposed"),
        "tasks wait for user approval"
    );
    assert_eq!(
        task["description"],
        serde_json::json!(format!(
            "The `{}` check failed. Fix the errors below.\n\n```\n{}\n```\n\nRun the same command again after fixing to verify.",
            check.command, check.output
        ))
    );

    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn maintenance_run_truncates_oversized_check_output_to_50k() {
    let dir = temp_repo_dir("run-trunc");
    let (svc, repo_id, _db) = file_backed(&dir);

    let run = svc
        .run_for_repo(
            &repo_id,
            "nightly",
            one_check("Noisy", "head -c 60000 /dev/zero | tr '\\0' a"),
            ProcessCancellation::default(),
        )
        .await
        .expect("run ok");

    let check = &run.checks[0];
    assert!(check.passed);
    assert!(
        check.truncated,
        "output over the cap must be marked truncated"
    );
    assert_eq!(
        check.output.len(),
        50_000,
        "TS slices check output to 50_000; the native port must match"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
