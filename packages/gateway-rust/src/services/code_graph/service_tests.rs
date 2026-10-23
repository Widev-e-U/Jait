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
            service.get_index(&project, Some("alice")).unwrap()["status"],
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
        let index = service.get_index(&project, Some("alice")).unwrap();
        assert_eq!(index["status"], "error");
        assert_eq!(index["error"], "cancelled extraction");
        assert_eq!(
            service.get_index(&project, Some("bob")).unwrap()["status"],
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
#[test]
fn owner_paths_and_lexical_root_guards_are_independent_of_process_cwd() {
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
        service.get_index("/repo", Some("alice")).unwrap()["status"],
        json!("missing")
    );
}
