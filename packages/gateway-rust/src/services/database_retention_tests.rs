use super::*;
use std::{future::Future, num::NonZeroU16};
fn fixture() -> DatabaseWorker {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE messages(id TEXT PRIMARY KEY,content TEXT,context_flow TEXT,tool_calls TEXT,created_at TEXT);
    CREATE TABLE agent_threads(id TEXT PRIMARY KEY,session_id TEXT,status TEXT);
    CREATE TABLE agent_thread_activities(id TEXT PRIMARY KEY,thread_id TEXT,kind TEXT,summary TEXT,payload TEXT,created_at TEXT);
    CREATE VIRTUAL TABLE agent_thread_activities_fts USING fts5(body,kind UNINDEXED,thread_id UNINDEXED,activity_id UNINDEXED,created_at UNINDEXED);
    CREATE TABLE audit_log(id TEXT PRIMARY KEY,timestamp TEXT,inputs TEXT,outputs TEXT,side_effects TEXT);
    CREATE TABLE sessions(id TEXT PRIMARY KEY,status TEXT,last_active_at TEXT,viewed_at TEXT);
    INSERT INTO messages VALUES('m','keep user content','{\"provider\":\"p\",\"rounds\":[{\"messages\":[\"secret\"],\"metrics\":{\"n\":2}}]}','[{\"callId\":\"call\",\"tool\":\"read\",\"args\":{},\"ok\":true}]','2000-01-01');
    INSERT INTO agent_threads VALUES('live','live-session','running');
    INSERT INTO agent_thread_activities VALUES('keep','live','thinking','keep',NULL,'2000-01-01');
    INSERT INTO agent_thread_activities VALUES('delete',NULL,'thinking','old',NULL,'2000-01-01');
    INSERT INTO agent_thread_activities_fts(rowid,body) VALUES(1,'not searchable'),(2,'not searchable'),(500,'orphan');
    INSERT INTO audit_log VALUES('a','2000-01-01','private','private','private');
    INSERT INTO sessions VALUES('old','active','2000-01-01',NULL),('viewed','active','2000-01-01','2030-01-01'),('live-session','active','2000-01-01',NULL);").unwrap();
    DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap()
}
struct Allow;
impl RetentionAuthority for Allow {
    fn authorize(&self, _: &RetentionStep) -> Result<Arc<dyn Send + Sync>, String> {
        Ok(Arc::new(()))
    }
}
struct Deny;
impl RetentionAuthority for Deny {
    fn authorize(&self, _: &RetentionStep) -> Result<Arc<dyn Send + Sync>, String> {
        Err("denied".into())
    }
}
fn date() -> DateTime<Utc> {
    DateTime::parse_from_rfc3339("2026-10-26T00:00:00Z")
        .unwrap()
        .with_timezone(&Utc)
}
#[test]
fn compact_preserves_round_metrics_and_bounds_bytes() {
    let raw=json!({"provider":"p","model":"model","rounds":(0..200).map(|i|json!({"round":i,"messages":["large"],"metrics":{"tokens":i}})).collect::<Vec<_>>()}).to_string();
    let compact = retained_context_flow(&raw, raw.len());
    let out: Value = serde_json::from_str(&compact).unwrap();
    assert!(compact.len() <= 64000);
    assert_eq!(out["rounds"].as_array().unwrap().len(), 100);
    assert_eq!(out["rounds"][1]["round"], 101);
    assert_eq!(out["rounds"][0]["messages"], json!([]));
    assert_eq!(out["retentionCompacted"], true);
    assert_eq!(
        serde_json::from_str::<Value>(&retained_context_flow("", PARSE_LIMIT + 1)).unwrap()["truncatedBytes"],
        PARSE_LIMIT + 1
    );
}
#[tokio::test]
async fn authorized_batches_preserve_content_live_threads_and_viewed_sessions() {
    let db = fixture();
    let service = DatabaseRetentionService::new(db.clone(), DatabaseRetentionPolicy::default());
    let before = service.inspect(date()).await.unwrap();
    assert_eq!(before.candidates["staleSessions"].rows, 1);
    assert_eq!(before.candidates["transientActivities"].rows, 1);
    let report = service
        .run_once(
            date(),
            false,
            None,
            Arc::new(Allow),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert!(report.errors.is_empty(), "{:?}", report.errors);
    assert_eq!(report.processed["staleSessionsArchived"], 1);
    assert_eq!(report.processed["auditRowsDeleted"], 0);
    assert_eq!(report.processed["transientActivitiesDeleted"], 1);
    db.run(|db| {
        assert_eq!(
            db.query_row("SELECT content FROM messages WHERE id='m'", [], |r| r
                .get::<_, String>(0))?,
            "keep user content"
        );
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM agent_thread_activities WHERE id='keep'",
                [],
                |r| r.get::<_, i64>(0)
            )?,
            1
        );
        assert_eq!(
            db.query_row(
                "SELECT status FROM sessions WHERE id='live-session'",
                [],
                |r| r.get::<_, String>(0)
            )?,
            "active"
        );
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM audit_log WHERE inputs IS NULL",
                [],
                |r| r.get::<_, i64>(0)
            )?,
            1
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}
#[tokio::test]
async fn denial_and_precancel_have_no_effect_and_budget_is_real() {
    let db = fixture();
    let service = DatabaseRetentionService::new(db.clone(), DatabaseRetentionPolicy::default());
    let denied = service
        .run_once(
            date(),
            false,
            None,
            Arc::new(Deny),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(denied.batches, 0);
    assert_eq!(denied.errors.len(), 1);
    let c = ProcessCancellation::default();
    c.cancel();
    let report = service
        .run_once(date(), false, None, Arc::new(Allow), c)
        .await
        .unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("stopped"));
    let report = service
        .run_once(
            date(),
            false,
            Some(1),
            Arc::new(Allow),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(report.batches, 1);
    assert_eq!(report.processed["contextFlowsCompacted"], 0);
    db.shutdown().await.unwrap();
}
#[tokio::test]
async fn cancellation_at_effect_rolls_back_the_batch() {
    struct Cancel(ProcessCancellation);
    impl RetentionAuthority for Cancel {
        fn authorize(&self, _: &RetentionStep) -> Result<Arc<dyn Send + Sync>, String> {
            self.0.cancel();
            Ok(Arc::new(()))
        }
    }
    let db = fixture();
    let service = DatabaseRetentionService::new(db.clone(), DatabaseRetentionPolicy::default());
    let cancel = ProcessCancellation::default();
    let report = service
        .run_once(
            date(),
            false,
            None,
            Arc::new(Cancel(cancel.clone())),
            cancel,
        )
        .await
        .unwrap();
    assert_eq!(report.batches, 0);
    assert_eq!(
        db.run(|db| Ok(db.query_row(
            "SELECT COUNT(*) FROM agent_thread_activities_fts",
            [],
            |r| r.get::<_, i64>(0)
        )?))
        .await
        .unwrap(),
        3
    );
    db.shutdown().await.unwrap();
}

// Deliberately high scan work with a scalar result: a row LIMIT cannot bound it.
const LONG_SCAN: &str = "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n";
const SUCCESSOR_SCAN: &str = "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) SELECT sum(x) FROM n";
fn test_bounds() -> RetentionBounds {
    RetentionBounds::new(
        ProcessCancellation::default(),
        ProcessCancellation::default(),
    )
}
fn assert_interrupted(error: rusqlite::Error) {
    assert!(
        matches!(&error, rusqlite::Error::SqliteFailure(code, _) if code.code == rusqlite::ErrorCode::OperationInterrupted),
        "{error:?}"
    );
}

#[tokio::test]
async fn scan_budget_interrupts_and_rolls_back_without_poisoning_successor() {
    let db = fixture();
    let bounds = test_bounds();
    bounds.remaining.store(5000, Ordering::Relaxed);
    let sql_bounds = bounds.clone();
    let result = db
        .run(move |db| -> Result<(), crate::db::worker::OperationError> {
            db.busy_timeout(Duration::from_millis(137))?;
            let tx = db.unchecked_transaction()?;
            let _scope = RetentionSqlScope::new(&tx, &sql_bounds)?;
            tx.execute("UPDATE messages SET content='must roll back'", [])?;
            let error = tx
                .query_row(LONG_SCAN, [], |r| r.get::<_, i64>(0))
                .unwrap_err();
            assert_interrupted(error);
            sql_bounds.check()?;
            panic!("scan exhaustion must fail the batch");
        })
        .await;
    assert!(result.is_err());
    assert_eq!(bounds.reason(), Some("scan-budget"));
    // The expired bounds and later cancellation must not apply to another job.
    bounds.cancel.cancel();
    db.run(|db| {
        assert!(db.is_autocommit());
        assert_eq!(
            db.query_row("PRAGMA busy_timeout", [], |r| r.get::<_, i64>(0))?,
            137
        );
        assert_eq!(
            db.query_row("SELECT content FROM messages", [], |r| r
                .get::<_, String>(0))?,
            "keep user content"
        );
        assert_eq!(
            db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
            50005000
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn elapsed_deadline_interrupts_a_running_sqlite_scan() {
    let db = fixture();
    let reason = db
        .run(move |db| {
            let mut bounds = test_bounds();
            bounds.remaining.store(u64::MAX, Ordering::Relaxed);
            // Set the deadline on the DB thread so admission delay cannot turn this
            // into a test of pre-start expiry instead of scan interruption.
            bounds.deadline = Instant::now() + Duration::from_millis(20);
            let began = Instant::now();
            let _scope = RetentionSqlScope::new(db, &bounds)?;
            assert_interrupted(
                db.query_row(LONG_SCAN, [], |r| r.get::<_, i64>(0))
                    .unwrap_err(),
            );
            assert!(began.elapsed() < Duration::from_secs(2));
            Ok(bounds.reason())
        })
        .await
        .unwrap();
    assert_eq!(reason, Some("duration-budget"));
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn cancellation_interrupts_started_scan_and_restores_connection() {
    let db = fixture();
    let bounds = test_bounds();
    bounds.remaining.store(u64::MAX, Ordering::Relaxed);
    let (entered, started) = tokio::sync::oneshot::channel();
    let worker = db.clone();
    let sql_bounds = bounds.clone();
    let job = tokio::spawn(async move {
        run_bounded(&worker, &sql_bounds.clone(), move |db| {
            let tx = db.unchecked_transaction()?;
            let _scope = RetentionSqlScope::new(&tx, &sql_bounds)?;
            tx.execute("UPDATE messages SET content='must roll back'", [])?;
            let _ = entered.send(());
            tx.query_row(LONG_SCAN, [], |r| r.get::<_, i64>(0))?;
            Ok(())
        })
        .await
    });
    started.await.unwrap();
    bounds.cancel.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), job)
        .await
        .unwrap()
        .unwrap();
    assert!(result.is_err());
    db.run(|db| {
        assert!(db.is_autocommit());
        assert_eq!(
            db.query_row("SELECT content FROM messages", [], |r| r
                .get::<_, String>(0))?,
            "keep user content"
        );
        assert_eq!(
            db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
            50005000
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn caller_drop_interrupts_owned_work_and_releases_lease_after_cleanup() {
    let db = fixture();
    let service = Arc::new(DatabaseRetentionService::new(
        db.clone(),
        DatabaseRetentionPolicy::default(),
    ));
    let permit = service.running.clone().try_acquire_owned().unwrap();
    let worker = db.with_job_guard(Arc::new(permit));
    let bounds = test_bounds();
    bounds.remaining.store(u64::MAX, Ordering::Relaxed);
    let abandoned = bounds.abandoned.clone();
    let (entered, started) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(async move {
        let _cancel_on_drop = CancelOnDrop(bounds.abandoned.clone());
        let sql_bounds = bounds.clone();
        run_bounded(&worker, &bounds, move |db| {
            let tx = db.unchecked_transaction()?;
            let _scope = RetentionSqlScope::new(&tx, &sql_bounds)?;
            tx.execute("UPDATE messages SET content='must roll back'", [])?;
            let _ = entered.send(());
            tx.query_row(LONG_SCAN, [], |r| r.get::<_, i64>(0))?;
            Ok(())
        })
        .await
    });
    started.await.unwrap();
    assert!(service.running.clone().try_acquire_owned().is_err());
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(abandoned.is_cancelled());
    tokio::time::timeout(
        Duration::from_secs(2),
        db.run(|db| {
            assert!(db.is_autocommit());
            assert_eq!(
                db.query_row("SELECT content FROM messages", [], |r| r
                    .get::<_, String>(0))?,
                "keep user content"
            );
            assert_eq!(
                db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
                50005000
            );
            Ok(())
        }),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(service.running.clone().try_acquire_owned().is_ok());
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn queued_cancellation_does_not_interrupt_unrelated_database_job() {
    let db = fixture();
    let service = Arc::new(DatabaseRetentionService::new(
        db.clone(),
        DatabaseRetentionPolicy::default(),
    ));
    let (entered, started) = tokio::sync::oneshot::channel();
    let (release, wait) = std::sync::mpsc::channel();
    let worker = db.clone();
    let predecessor = tokio::spawn(async move {
        worker
            .run(move |db| {
                let _ = entered.send(());
                wait.recv_timeout(Duration::from_secs(3))?;
                Ok(db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?)
            })
            .await
    });
    started.await.unwrap();
    let cancel = ProcessCancellation::default();
    // Poll deterministically until this retention request is waiting on its DB
    // response; it cannot obtain authority while the predecessor owns SQLite.
    let pending = service.run_once(date(), false, None, Arc::new(Deny), cancel.clone());
    tokio::pin!(pending);
    assert!(
        std::future::poll_fn(|cx| std::task::Poll::Ready(pending.as_mut().poll(cx)))
            .await
            .is_pending()
    );
    cancel.cancel();
    let report = tokio::time::timeout(Duration::from_secs(1), &mut pending)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("stopped"));
    assert!(report.errors.is_empty());
    assert_eq!(report.batches, 0);
    // The cancelled mailbox entry still owns admission until the DB worker
    // dequeues it; a replacement run cannot overtake cleanup.
    assert!(service.running.clone().try_acquire_owned().is_err());
    release.send(()).unwrap();
    assert_eq!(predecessor.await.unwrap().unwrap(), 50005000);
    db.run(|db| {
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM agent_thread_activities_fts",
                [],
                |r| r.get::<_, i64>(0)
            )?,
            3
        );
        assert_eq!(
            db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
            50005000
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn inspection_reports_unscanned_candidates_as_unknown_on_scan_exhaustion() {
    let db = fixture();
    db.run(|db| {
        db.execute_batch("DROP TABLE messages;
            CREATE VIEW messages AS WITH RECURSIVE scan(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM scan WHERE x<1000000000)
            SELECT CAST(x AS TEXT) AS id,NULL AS content,printf('%d',x) AS context_flow,NULL AS tool_calls,'2000-01-01' AS created_at FROM scan;")?;
        Ok(())
    }).await.unwrap();
    let service = DatabaseRetentionService::new(db.clone(), DatabaseRetentionPolicy::default());
    let bounds = test_bounds();
    bounds.remaining.store(5000, Ordering::Relaxed);
    let report = service
        .inspect_with_bounds(date(), db.clone(), bounds)
        .await
        .unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("scan-budget"));
    assert_eq!(report.candidates["unsearchableFtsRows"].rows, 3);
    assert!(!report.candidates["unsearchableFtsRows"].bounded);
    assert!(report.candidates["oversizedContextFlows"].bounded);
    assert!(report.candidates["staleSessions"].bounded);
    assert_eq!(report.batches, 0);
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn unwind_restores_busy_policy_and_hook_before_rollback() {
    let db = fixture();
    let bounds = test_bounds();
    let job = db
        .run(move |db| -> Result<(), crate::db::worker::OperationError> {
            db.busy_timeout(Duration::from_millis(219))?;
            let tx = db.unchecked_transaction()?;
            let _scope = RetentionSqlScope::new(&tx, &bounds)?;
            assert_eq!(
                tx.query_row("PRAGMA busy_timeout", [], |r| r.get::<_, i64>(0))?,
                0
            );
            tx.execute("UPDATE messages SET content='must roll back'", [])?;
            bounds.cancel.cancel();
            panic!("deliberate retention unwind");
        })
        .await;
    assert!(matches!(job, Err(DatabaseError::WorkerPanicked)));
    db.run(|db| {
        assert!(db.is_autocommit());
        assert_eq!(
            db.query_row("PRAGMA busy_timeout", [], |r| r.get::<_, i64>(0))?,
            219
        );
        assert_eq!(
            db.query_row("SELECT content FROM messages", [], |r| r
                .get::<_, String>(0))?,
            "keep user content"
        );
        assert_eq!(
            db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
            50005000
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn explicit_inspection_cancellation_and_stop_do_not_claim_zero_coverage() {
    let db = fixture();
    let service = DatabaseRetentionService::new(db.clone(), DatabaseRetentionPolicy::default());
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    let report = service.inspect_cancellable(date(), cancel).await.unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("stopped"));
    assert!(
        report
            .candidates
            .values()
            .all(|candidate| candidate.bounded)
    );
    service.stop();
    let report = service.inspect(date()).await.unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("stopped"));
    assert!(
        report
            .candidates
            .values()
            .all(|candidate| candidate.bounded)
    );
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn mutation_trigger_scan_is_interrupted_without_reporting_a_committed_batch() {
    let db = fixture();
    let original = db.run(|db| {
        db.execute_batch("CREATE TRIGGER slow_retention AFTER UPDATE OF context_flow ON messages BEGIN
            SELECT (WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n);
            END;")?;
        Ok(db.query_row("SELECT context_flow FROM messages", [], |r| r.get::<_, String>(0))?)
    }).await.unwrap();
    let service = DatabaseRetentionService::new(
        db.clone(),
        DatabaseRetentionPolicy {
            search_index_cleanup_enabled: false,
            ..DatabaseRetentionPolicy::default()
        },
    );
    let report = service
        .run_once(
            date(),
            false,
            None,
            Arc::new(Allow),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(report.skipped_reason.as_deref(), Some("scan-budget"));
    assert!(report.errors.is_empty());
    assert_eq!(report.batches, 0);
    assert!(report.processed.values().all(|count| *count == 0));
    db.run(move |db| {
        assert!(db.is_autocommit());
        assert_eq!(
            db.query_row("SELECT context_flow FROM messages", [], |r| r
                .get::<_, String>(0))?,
            original
        );
        // Remove the deliberately expensive trigger and prove ordinary writes
        // remain usable after this run's progress handler has gone away.
        db.execute_batch("DROP TRIGGER slow_retention; UPDATE messages SET content='successor';")?;
        assert_eq!(
            db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))?,
            50005000
        );
        Ok(())
    })
    .await
    .unwrap();
    db.shutdown().await.unwrap();
}

#[test]
fn scan_instruction_budget_is_shared_across_job_scopes() {
    let db = Connection::open_in_memory().unwrap();
    let bounds = test_bounds();
    bounds.remaining.store(50000, Ordering::Relaxed);
    let first_remaining = {
        let _scope = RetentionSqlScope::new(&db, &bounds).unwrap();
        db.query_row("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100) SELECT sum(x) FROM n", [], |r| r.get::<_, i64>(0)).unwrap();
        bounds.remaining.load(Ordering::Relaxed)
    };
    assert!(first_remaining < 50000);
    {
        let _scope = RetentionSqlScope::new(&db, &bounds).unwrap();
        assert_interrupted(
            db.query_row(LONG_SCAN, [], |r| r.get::<_, i64>(0))
                .unwrap_err(),
        );
    }
    assert_eq!(bounds.reason(), Some("scan-budget"));
    assert_eq!(
        db.query_row(SUCCESSOR_SCAN, [], |r| r.get::<_, i64>(0))
            .unwrap(),
        50005000
    );
}
