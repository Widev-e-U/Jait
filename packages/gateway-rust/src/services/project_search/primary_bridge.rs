//! Adapter for a root already authorized and pinned by the calling runtime.
//! Invoke on the shared filesystem blocking lane, with cancellation on caller drop.
use super::{
    Budgets, Cancellation, Error, ProjectRoot, SearchMode, SearchOptions, SearchResult,
    search_project_auto,
};
use crate::services::primary_link::{
    ProjectSearchBridge, ProjectSearchFailure, ProjectSearchMode, ProjectSearchRequest,
    RawContentHit, RawFileHit, RawSearchResult,
};

pub struct PinnedPrimarySearchBridge<'a> {
    pub root: &'a ProjectRoot,
    pub budgets: &'a Budgets,
    pub cancel: &'a Cancellation,
}

impl ProjectSearchBridge for PinnedPrimarySearchBridge<'_> {
    fn search_project(
        &self,
        request: &ProjectSearchRequest,
    ) -> Result<RawSearchResult, ProjectSearchFailure> {
        if request.root != self.root.path() {
            return Err(ProjectSearchFailure::input(
                "project search root is not authorized",
            ));
        }
        let options = SearchOptions {
            query: request.query.clone(),
            mode: match request.mode {
                ProjectSearchMode::Files => SearchMode::Files,
                ProjectSearchMode::Content => SearchMode::Content,
            },
            limit: request.limit,
            include: request.include.clone(),
            is_regexp: request.is_regexp,
            include_ignored_files: request.include_ignored_files,
        };
        let result = search_project_auto(self.root, &options, self.budgets, self.cancel).map_err(
            |error| match error {
                Error::RegexpRequiresRipgrep => ProjectSearchFailure::unavailable(
                    "Regular expression search requires ripgrep",
                    "regexp_requires_rg",
                ),
                other => ProjectSearchFailure::input(other.to_string()),
            },
        )?;
        Ok(match result {
            SearchResult::Files {
                query,
                files,
                limited,
            } => RawSearchResult::Files {
                query,
                limited,
                files: files
                    .into_iter()
                    .map(|f| RawFileHit {
                        path: f.path,
                        relative_path: f.relative_path,
                        name: f.name,
                        score: f.score,
                    })
                    .collect(),
            },
            SearchResult::Content {
                query,
                matches,
                limited,
            } => RawSearchResult::Content {
                query,
                limited,
                matches: matches
                    .into_iter()
                    .map(|m| RawContentHit {
                        file: m.file,
                        relative_path: m.relative_path,
                        line: m.line,
                        content: m.content,
                        score: m.score,
                    })
                    .collect(),
            },
        })
    }
}

/// Search operations for an already-authorized primary-link connection.
/// The caller supplies its existing filesystem lane and authorized root; this
/// does not authenticate a connection or grant access to any other operation.
pub struct PrimarySearchDispatch {
    pub root: ProjectRoot,
    pub lane: crate::runtime::blocking::BlockingLane,
}

pub enum PrimarySearchCall {
    Fs(serde_json::Map<String, serde_json::Value>),
    Tool(serde_json::Map<String, serde_json::Value>),
}

impl PrimarySearchDispatch {
    pub async fn run(&self, call: PrimarySearchCall) -> Result<serde_json::Value, String> {
        let root = self.root.clone();
        run_cancellable(&self.lane, move |cancel| {
            let budgets = Budgets::default();
            let bridge = PinnedPrimarySearchBridge {
                root: &root,
                budgets: &budgets,
                cancel: &cancel,
            };
            match call {
                PrimarySearchCall::Fs(args) => {
                    let result = crate::services::primary_link::search_project_op(&bridge, &args)
                        .map_err(|e| e.to_string())?;
                    serde_json::to_value(result).map_err(|e| e.to_string())
                }
                PrimarySearchCall::Tool(args) => {
                    Ok(crate::services::primary_link::run_primary_search_tool(
                        &bridge,
                        &args,
                        Some(root.path()),
                    ))
                }
            }
        })
        .await
    }
}

async fn run_cancellable<T: Send + 'static>(
    lane: &crate::runtime::blocking::BlockingLane,
    operation: impl FnOnce(Cancellation) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    struct CancelOnDrop(Cancellation);
    impl Drop for CancelOnDrop {
        fn drop(&mut self) {
            self.0.cancel();
        }
    }
    let cancel = Cancellation::default();
    let _guard = CancelOnDrop(cancel.clone());
    lane.run(move || operation(cancel))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod cancellation_tests {
    use super::*;
    use std::{num::NonZeroU16, time::Duration};

    #[tokio::test]
    async fn dispatch_enforces_pinned_root_for_fs_and_tool_calls() {
        use super::super::tests::Fixture;
        use serde_json::json;

        let fixture = Fixture::new();
        fixture.put("needle.txt", "needle\n");
        let dispatch = PrimarySearchDispatch {
            root: fixture.root(),
            lane: crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap()),
        };
        let args = |value: serde_json::Value| value.as_object().unwrap().clone();
        let root = fixture.0.to_str().unwrap();
        let result = dispatch
            .run(PrimarySearchCall::Fs(args(json!({
                "path": root, "query": "needle", "mode": "files"
            }))))
            .await
            .unwrap();
        assert_eq!(result["files"][0]["path"], "needle.txt");

        let error = dispatch
            .run(PrimarySearchCall::Fs(args(json!({
                "path": fixture.0.join(".."), "query": "needle"
            }))))
            .await
            .unwrap_err();
        assert!(error.contains("project search root is not authorized"));
        let denied = dispatch
            .run(PrimarySearchCall::Tool(args(json!({
                "path": "..", "pattern": "needle", "mode": "files"
            }))))
            .await
            .unwrap();
        assert_eq!(denied["ok"], false);
        assert_eq!(denied["message"], "project search root is not authorized");
        dispatch.lane.close_and_drain().await;
    }

    #[tokio::test]
    async fn dropped_caller_signals_admitted_work_and_retains_lane() {
        let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
        let worker_lane = lane.clone();
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let (observed, done) = tokio::sync::oneshot::channel();
        let caller = tokio::spawn(async move {
            run_cancellable(&worker_lane, move |cancel| {
                entered.send(()).unwrap();
                wait.recv().unwrap();
                observed.send(cancel.is_cancelled()).unwrap();
                Ok(())
            })
            .await
        });
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        caller.abort();
        let _ = caller.await;
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
        release.send(()).unwrap();
        assert!(
            tokio::time::timeout(Duration::from_secs(5), done)
                .await
                .unwrap()
                .unwrap()
        );
        tokio::time::timeout(Duration::from_secs(5), lane.close_and_drain())
            .await
            .unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn dropped_caller_cancels_supervised_search() {
        use super::super::tests::Fixture;
        use super::super::{Error, SearchMode, SearchOptions, search_project_auto_with_program};
        use std::{os::unix::fs::PermissionsExt, time::Instant};

        let fixture = Fixture::new();
        let program = fixture.0.join("blocking-rg");
        let ready = fixture.0.join("blocking-rg.ready");
        std::fs::write(
            &program,
            "#!/bin/sh\n: > \"$0.ready\"\nwhile :; do :; done\n",
        )
        .unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
        let root = fixture.root();
        let lane = crate::runtime::blocking::BlockingLane::new(NonZeroU16::new(1).unwrap());
        let worker_lane = lane.clone();
        let (result_tx, result_rx) = tokio::sync::oneshot::channel();
        let caller = tokio::spawn(async move {
            run_cancellable(&worker_lane, move |cancel| {
                let options = SearchOptions {
                    query: "needle".into(),
                    mode: SearchMode::Content,
                    ..Default::default()
                };
                let result = search_project_auto_with_program(
                    &root,
                    &options,
                    &Budgets::default(),
                    &cancel,
                    program.as_os_str(),
                );
                let _ = result_tx.send(matches!(result, Err(Error::Cancelled)));
                Ok(())
            })
            .await
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready.exists() && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(ready.exists(), "supervised search did not start");
        caller.abort();
        let _ = caller.await;
        assert!(
            tokio::time::timeout(Duration::from_secs(5), result_rx)
                .await
                .unwrap()
                .unwrap(),
            "search did not report cancellation"
        );
        tokio::time::timeout(Duration::from_secs(5), lane.close_and_drain())
            .await
            .unwrap();
    }
}
