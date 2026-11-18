use super::{
    engine::{ExecOutput, Executor},
    runtime::GraphifyRuntime,
};
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::sync::Notify;
#[tokio::test]
async fn separate_runtime_handles_share_install_work_after_the_first_waiter_is_dropped() {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let count = Arc::new(AtomicUsize::new(0));
        let execute: Executor = {
            let entered = entered.clone();
            let release = release.clone();
            let count = count.clone();
            Arc::new(move |request| {
                assert_eq!(request.args, vec!["--version"]);
                count.fetch_add(1, Ordering::SeqCst);
                let entered = entered.clone();
                let release = release.clone();
                Box::pin(async move {
                    entered.notify_one();
                    release.notified().await;
                    Ok(ExecOutput {
                        stdout: "graphify 0.9.30".into(),
                        stderr: String::new(),
                    })
                })
            })
        };
        let state = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/runtime-sharing")
            .join(uuid::Uuid::new_v4().to_string())
            .to_str()
            .unwrap()
            .to_owned();
        let first = GraphifyRuntime::new(state.clone(), BTreeMap::new(), execute.clone());
        let second = GraphifyRuntime::new(state, BTreeMap::new(), execute);
        let original = tokio::spawn(async move { first.ensure().await });
        entered.notified().await;
        original.abort();
        let _ = original.await;
        let pending = second.ensure();
        tokio::pin!(pending);
        assert!(matches!(
            futures_util::poll!(&mut pending),
            std::task::Poll::Pending
        ));
        release.notify_one();
        assert!(pending.await.unwrap().ready);
        assert_eq!(count.load(Ordering::SeqCst), 1);
        release.notify_one();
        assert!(second.ensure().await.unwrap().ready);
        assert_eq!(
            count.load(Ordering::SeqCst),
            2,
            "completed work must clear the shared registry key"
        );
    })
    .await
    .expect("shared runtime installation must finish promptly");
}
