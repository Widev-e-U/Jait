//! Native lifecycle checks that need real task scheduling rather than scripted results.
use super::{
    engine::GraphError,
    runner::RunResult,
    service::{Build, CodeGraphService},
};
use crate::execution::process_runner::ProcessCancellation;
use rusqlite::Connection;
use serde_json::json;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicUsize, Ordering},
};
use tokio::sync::Notify;
const SCHEMA: &str = "CREATE TABLE code_graph_indexes (id TEXT PRIMARY KEY,user_id TEXT,repository_id TEXT,project_root TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'graphify',status TEXT NOT NULL DEFAULT 'missing',graph_path TEXT,graph_version TEXT,source_revision TEXT,graphify_version TEXT,stats TEXT,graphrag_status TEXT NOT NULL DEFAULT 'not-prepared',graphrag_path TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)";
fn workspace() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/code-graph/native")
        .join(uuid::Uuid::new_v4().to_string())
}
fn service(work: &std::path::Path, build: Build) -> Arc<CodeGraphService> {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(SCHEMA).unwrap();
    Arc::new(CodeGraphService::new(
        Arc::new(Mutex::new(db)),
        work.join("data").to_str().unwrap().into(),
        "/not-this-project".into(),
        build,
        Arc::new(|_| Box::pin(async { None })),
    ))
}
#[tokio::test]
async fn dropped_subscriber_preserves_shared_build_and_original_cancellation_signal() {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let work = workspace();
        let project = work.join("project").to_str().unwrap().to_owned();
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let builds = Arc::new(AtomicUsize::new(0));
        let signal = ProcessCancellation::default();
        let original = signal.clone();
        let build: Build = {
            let entered = entered.clone();
            let release = release.clone();
            let builds = builds.clone();
            Arc::new(move |p| {
                builds.fetch_add(1, Ordering::SeqCst);
                let entered = entered.clone();
                let release = release.clone();
                let original = original.clone();
                Box::pin(async move {
                    entered.notify_one();
                    release.notified().await;
                    original.cancel();
                    assert!(
                        p.signal.as_ref().unwrap().is_cancelled(),
                        "same cancellation capability must reach extraction"
                    );
                    let path = std::path::Path::new(&p.output_dir).join("graph.json");
                    tokio::fs::write(&path, "{\"nodes\":[{\"id\":\"a\"}]}")
                        .await
                        .unwrap();
                    Ok(RunResult {
                        graph_path: path.to_str().unwrap().into(),
                        version: None,
                        stdout: String::new(),
                        stderr: String::new(),
                    })
                })
            })
        };
        let service = service(&work, build);
        let first = {
            let service = service.clone();
            let project = project.clone();
            tokio::spawn(async move {
                service
                    .index(&project, Some("alice".into()), None, Some(signal))
                    .await
            })
        };
        entered.notified().await;
        first.abort();
        let _ = first.await;
        assert_eq!(
            service.get_index(&project, Some("alice")).await.unwrap()["status"],
            "building"
        );
        let second = service.index(&project, Some("alice".into()), None, None);
        tokio::pin!(second);
        assert!(matches!(
            futures_util::poll!(&mut second),
            std::task::Poll::Pending
        ));
        release.notify_one();
        assert_eq!(second.await.unwrap()["status"], "ready");
        assert_eq!(builds.load(Ordering::SeqCst), 1);
    })
    .await
    .expect("shared build must complete promptly");
}
#[tokio::test]
async fn panicked_build_is_removed_and_can_be_retried() {
    let work = workspace();
    let project = work.join("project").to_str().unwrap().to_owned();
    let attempts = Arc::new(AtomicUsize::new(0));
    let build: Build = {
        let attempts = attempts.clone();
        Arc::new(move |request| {
            let attempt = attempts.fetch_add(1, Ordering::SeqCst);
            Box::pin(async move {
                assert_ne!(attempt, 0, "test build panic");
                let path = std::path::Path::new(&request.output_dir).join("graph.json");
                tokio::fs::write(&path, "{\"nodes\":[]}").await.unwrap();
                Ok(RunResult {
                    graph_path: path.to_str().unwrap().into(),
                    version: None,
                    stdout: String::new(),
                    stderr: String::new(),
                })
            })
        })
    };
    let service = service(&work, build);
    let first = service
        .index(&project, Some("alice".into()), None, None)
        .await;
    assert!(first.is_err(), "the task panic remains an error");
    let second = service
        .index(&project, Some("alice".into()), None, None)
        .await
        .unwrap();
    assert_eq!(second["status"], "ready");
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    tokio::fs::remove_dir_all(work).await.unwrap();
}

#[tokio::test]
async fn legacy_graph_path_requires_reindex_before_read_or_export() {
    let work = workspace();
    let project = work.join("project").to_str().unwrap().to_owned();
    let build: Build = Arc::new(|_| Box::pin(async { Err(GraphError::error("unused")) }));
    let service = service(&work, build);
    let stored_project = service.normalize_project_root(&project).unwrap();
    service
        .save(
            &stored_project,
            Some("alice"),
            json!({"status":"ready","graphPath":"/"}),
        )
        .await
        .unwrap();
    let error = service
        .snapshot(&project, Some("alice"), None)
        .await
        .err()
        .unwrap();
    assert!(error.message.contains("reindex required"));
    let error = service
        .prepare_graph_rag(&project, Some("alice"))
        .await
        .err()
        .unwrap();
    assert!(error.message.contains("reindex required"));
    let index = service.get_index(&project, Some("alice")).await.unwrap();
    assert_eq!(index["graphRagStatus"], "not-prepared");
}

#[tokio::test]
async fn failed_builds_leave_scope_isolated_and_can_be_retried() {
    let work = workspace();
    let project = work.join("project").to_str().unwrap().to_owned();
    let build: Build =
        Arc::new(|_| Box::pin(async { Err(GraphError::error("cancelled extraction")) }));
    let service = service(&work, build);
    for _ in 0..2 {
        assert_eq!(
            service
                .index(&project, Some("alice".into()), None, None)
                .await
                .unwrap_err()
                .message,
            "cancelled extraction"
        );
        let index = service.get_index(&project, Some("alice")).await.unwrap();
        assert_eq!(index["status"], "error");
        assert_eq!(index["error"], "cancelled extraction");
        assert_eq!(
            service.get_index(&project, Some("bob")).await.unwrap()["status"],
            "missing"
        );
    }
}
#[tokio::test]
async fn git_revision_port_uses_parallel_argv_reads_and_preserves_failure_semantics() {
    use super::engine::{ExecOutput, Executor};
    use std::collections::BTreeMap;
    for (status, error, expected) in [
        ("", false, Some("abc")),
        ("\n", false, Some("abc:dirty")),
        ("", true, None),
    ] {
        let events = Arc::new(Mutex::new(vec![]));
        let log = events.clone();
        let execute: Executor = Arc::new(move |request| {
            assert_eq!(request.command, "git");
            assert_eq!(request.env.get("PATH").unwrap(), "/explicit/bin");
            assert!(request.signal.is_none());
            let head = request.args[2] == "rev-parse";
            log.lock().unwrap().push(request.args);
            Box::pin(async move {
                if error && head {
                    return Err(GraphError::error("not a git repository"));
                }
                Ok(ExecOutput {
                    stdout: if head {
                        " \u{feff}abc\n".into()
                    } else {
                        status.into()
                    },
                    stderr: String::new(),
                })
            })
        });
        let revision = CodeGraphService::revision_executor(
            execute,
            BTreeMap::from([("PATH".into(), "/explicit/bin".into())]),
        );
        assert_eq!(
            revision("/repo;touch /no".into()).await.as_deref(),
            expected
        );
        assert_eq!(
            *events.lock().unwrap(),
            vec![
                vec!["-C", "/repo;touch /no", "rev-parse", "HEAD"],
                vec!["-C", "/repo;touch /no", "status", "--porcelain"]
            ]
        );
    }
}
#[tokio::test]
async fn owner_paths_and_lexical_root_guards_are_independent_of_process_cwd() {
    let work = workspace();
    let service = service(&work, Arc::new(|_| Box::pin(async { unreachable!() })));
    assert_ne!(
        service.output_directory("/repo", Some("alice")),
        service.output_directory("/repo", Some("bob"))
    );
    assert_eq!(
        service.normalize_project_root(" /repo/x/../ ").unwrap(),
        "/repo"
    );
    assert!(
        service
            .normalize_project_root("/")
            .unwrap_err()
            .message
            .contains("Refusing to index")
    );
    assert_eq!(
        service
            .normalize_project_root("relative")
            .unwrap_err()
            .message,
        "projectRoot must be absolute"
    );
    assert_eq!(
        service.get_index("/repo", Some("alice")).await.unwrap()["status"],
        json!("missing")
    );
}

#[tokio::test]
async fn worker_backed_index_storage_is_owner_scoped() {
    use crate::db::worker::DatabaseWorker;
    use std::num::NonZeroU16;
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(SCHEMA).unwrap();
    let worker = DatabaseWorker::new(db, NonZeroU16::new(4).unwrap()).unwrap();
    let service = CodeGraphService::with_worker(
        worker.clone(),
        "/data".into(),
        "/home".into(),
        Arc::new(|_| Box::pin(async { Err(GraphError::error("unused")) })),
        Arc::new(|_| Box::pin(async { None })),
    );
    service
        .save("/repo", Some("alice"), json!({"status":"building"}))
        .await
        .unwrap();
    assert_eq!(
        service.get_index("/repo", Some("alice")).await.unwrap()["status"],
        "building"
    );
    assert_eq!(
        service.get_index("/repo", Some("bob")).await.unwrap()["status"],
        "missing"
    );
    worker.shutdown().await.unwrap();
    assert!(service.get_index("/repo", Some("alice")).await.is_err());
}

#[tokio::test]
async fn distinct_owner_and_root_pairs_do_not_share_builds() {
    let work = workspace();
    let (entered, mut received) = tokio::sync::mpsc::unbounded_channel();
    let release = Arc::new(tokio::sync::Semaphore::new(0));
    let build_release = release.clone();
    let build: Build = Arc::new(move |request| {
        let entered = entered.clone();
        let release = build_release.clone();
        Box::pin(async move {
            entered.send(request.project_root).unwrap();
            release.acquire().await.unwrap().forget();
            Err(GraphError::error("finished"))
        })
    });
    let service = service(&work, build);
    let first = {
        let service = service.clone();
        tokio::spawn(async move {
            service
                .index("/c", Some("alice:/b".into()), None, None)
                .await
        })
    };
    let second = {
        let service = service.clone();
        tokio::spawn(async move {
            service
                .index("/b:/c", Some("alice".into()), None, None)
                .await
        })
    };
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let a = received.recv().await.unwrap();
        let b = received.recv().await.unwrap();
        assert_ne!(a, b);
    })
    .await
    .expect("both distinct builds must start");
    release.add_permits(2);
    assert!(first.await.unwrap().is_err());
    assert!(second.await.unwrap().is_err());
}

#[test]
fn output_namespace_matches_typescript_owner_default_and_root_boundaries() {
    let work = workspace();
    let build: Build = Arc::new(|_| Box::pin(async { Err(GraphError::error("unused")) }));
    let service = service(&work, build);
    let directory = |root, owner| service.output_directory(root, owner);
    // `${userId ?? "system"}`: an absent owner is exactly the "system" owner,
    // while an explicitly empty owner is a distinct (empty) owner.
    assert_eq!(directory("/repo", None), directory("/repo", Some("system")));
    assert_ne!(directory("/repo", None), directory("/repo", Some("")));
    assert_ne!(
        directory("/c", Some("alice:/b")),
        directory("/b:/c", Some("alice"))
    );
    assert_ne!(
        directory("/repo", Some("alice")),
        directory("/repo", Some("bob"))
    );
    // The reference joins <dataRoot>/<24 hex>/graphify with no version segment.
    let output = directory("/repo", Some("alice"));
    assert!(!output.contains("/v2/"));
    assert!(output.ends_with("/graphify"));
    let key = output
        .trim_end_matches("/graphify")
        .rsplit('/')
        .next()
        .unwrap();
    assert_eq!(key.len(), 24);
    assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
}

#[tokio::test]
async fn build_returning_foreign_graph_path_is_rejected() {
    let work = workspace();
    let project = work.join("project").to_str().unwrap().to_owned();
    let build: Build = Arc::new(|_| {
        Box::pin(async {
            Ok(RunResult {
                graph_path: "/foreign/graph.json".into(),
                version: None,
                stdout: String::new(),
                stderr: String::new(),
            })
        })
    });
    let service = service(&work, build);
    let error = service
        .index(&project, Some("alice".into()), None, None)
        .await
        .err()
        .unwrap();
    assert!(error.message.contains("reindex required"));
    assert_eq!(
        service.get_index(&project, Some("alice")).await.unwrap()["status"],
        "error"
    );
    tokio::fs::remove_dir_all(work).await.unwrap();
}

#[tokio::test]
async fn pre_cancelled_index_has_no_filesystem_or_database_effects() {
    let work = workspace();
    let project = work.join("project").to_str().unwrap().to_owned();
    let build: Build = Arc::new(|_| panic!("cancelled build must not run"));
    let service = service(&work, build);
    let output = service.output_directory(&project, Some("alice"));
    let signal = crate::execution::process_runner::ProcessCancellation::default();
    signal.cancel();
    let error = service
        .index(&project, Some("alice".into()), None, Some(signal))
        .await
        .expect_err("cancelled index must fail");
    assert_eq!(error.name, "AbortError");
    assert!(!std::path::Path::new(&output).exists());
    assert_eq!(
        service.get_index(&project, Some("alice")).await.unwrap()["status"],
        "missing"
    );
    if work.exists() {
        tokio::fs::remove_dir_all(work).await.unwrap();
    }
}
