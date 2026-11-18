//! Local preview process ownership; deliberately not connected to the runtime.
//! One host belongs to one authenticated owner and must be serialized by its caller.
//! Launch authorization remains the responsibility of `LocalPreviewRunner`'s
//! trusted authority. This slice does not create browsers or implement HTTP APIs.
use super::preview::{PreviewAction, PreviewGeneration, PreviewOwner, PreviewResources};
use super::preview_process::{
    LocalPreviewRunner, PreviewProcess, PreviewStartError, PreviewStartInput,
};
use super::preview_runner::ProjectSnapshot;
use crate::execution::process_runner::ProcessCancellation;
use std::{collections::HashMap, sync::Arc};
use tokio::task::JoinHandle;

pub struct LocalStart {
    pub session_id: String,
    /// Must originate from the authorized filesystem resolver.
    pub project: ProjectSnapshot,
    pub command: Option<String>,
    pub target: String,
    pub port: Option<u16>,
    pub framework_hint: Option<String>,
    pub shared_with_agent: bool,
}

enum Effect {
    Starting {
        cancel: ProcessCancellation,
        task: JoinHandle<Result<PreviewProcess, PreviewStartError>>,
    },
    Running(PreviewProcess),
    Cleaning(JoinHandle<Result<(), String>>),
    /// A cleanup error cannot be treated as proof that the process group is gone.
    CleanupUnconfirmed,
}

pub struct PreviewHost {
    owner_id: String,
    owner: PreviewOwner,
    runner: Arc<LocalPreviewRunner>,
    effects: HashMap<String, Effect>,
}

impl PreviewHost {
    pub fn new(
        owner_id: String,
        max_sessions: usize,
        runner: Arc<LocalPreviewRunner>,
    ) -> Result<Self, &'static str> {
        if owner_id.is_empty() || owner_id.len() > 1024 || max_sessions == 0 {
            return Err("invalid preview host configuration");
        }
        Ok(Self {
            owner_id,
            owner: PreviewOwner::new(max_sessions),
            runner,
            effects: HashMap::new(),
        })
    }

    pub fn state(&self, session_id: &str) -> Option<&super::preview::OwnedPreview> {
        self.owner.get(session_id)
    }

    /// Observe one running process without consuming its cleanup handle. The
    /// serialized host supervisor must call this for active sessions; no task or
    /// timer is created per preview. Returns true only on the first exit report.
    pub fn observe_exit(&mut self, session_id: &str) -> bool {
        if !matches!(self.effects.get(session_id), Some(Effect::Running(process)) if process.is_finished())
        {
            return false;
        }
        let Some(session) = self.owner.get(session_id) else {
            return false;
        };
        self.owner.process_exited(
            session_id,
            session.generation,
            "Preview process exited".to_owned(),
        )
    }

    /// Admission is synchronous; the caller can subsequently cancel startup.
    pub fn start(&mut self, input: LocalStart) -> Result<PreviewGeneration, &'static str> {
        let PreviewAction::Start(generation) = self
            .owner
            .start(&input.session_id, input.shared_with_agent)?
        else {
            unreachable!()
        };
        let id = input.session_id.clone();
        let owner_id = self.owner_id.clone();
        let runner = self.runner.clone();
        let cancel = ProcessCancellation::default();
        let task_cancel = cancel.clone();
        let task = tokio::spawn(async move {
            runner
                .start(
                    PreviewStartInput {
                        owner_id: &owner_id,
                        session_id: &input.session_id,
                        project: &input.project,
                        command: input.command.as_deref(),
                        target: &input.target,
                        port: input.port,
                        framework_hint: input.framework_hint.as_deref(),
                    },
                    task_cancel,
                )
                .await
        });
        self.effects.insert(id, Effect::Starting { cancel, task });
        Ok(generation)
    }

    /// Harvest a completed startup without blocking the serialized owner.
    pub async fn complete_start(&mut self, session_id: &str) -> Result<bool, String> {
        let Some(Effect::Starting { task, .. }) = self.effects.get_mut(session_id) else {
            return Ok(false);
        };
        if !task.is_finished() {
            return Ok(false);
        }
        let result = task
            .await
            .map_err(|_| {
                PreviewStartError::CleanupUnconfirmed("Preview startup task failed".to_string())
            })
            .and_then(|r| r);
        let generation = self
            .owner
            .get(session_id)
            .ok_or("Preview state missing")?
            .generation;
        match result {
            Ok(mut process) => {
                let resources = PreviewResources {
                    runner: Some(session_id.to_owned()),
                    browser: None,
                };
                match self.owner.started(session_id, generation, resources) {
                    PreviewAction::None => {
                        self.effects
                            .insert(session_id.to_owned(), Effect::Running(process));
                    }
                    _ => {
                        // Store the cleanup task before awaiting it: a dropped caller
                        // must leave a joinable owner for a subsequent stop attempt.
                        let task = tokio::spawn(async move { process.stop().await.map(|_| ()) });
                        self.effects
                            .insert(session_id.to_owned(), Effect::Cleaning(task));
                        if let Some(Effect::Cleaning(task)) = self.effects.get_mut(session_id) {
                            match task.await {
                                Ok(Ok(())) => {
                                    self.effects.remove(session_id);
                                }
                                _ => {
                                    self.effects
                                        .insert(session_id.to_owned(), Effect::CleanupUnconfirmed);
                                    return Err("Preview cleanup unconfirmed".into());
                                }
                            }
                        }
                    }
                }
            }
            Err(error) => {
                let (message, clean) = match error {
                    PreviewStartError::NoProcess(message) => (message, true),
                    PreviewStartError::CleanupUnconfirmed(message) => (message, false),
                };
                let action = self.owner.failed(
                    session_id,
                    generation,
                    message,
                    PreviewResources {
                        runner: None,
                        browser: None,
                    },
                );
                if clean {
                    self.effects.remove(session_id);
                    if matches!(action, PreviewAction::CancelAndCleanup { .. }) {
                        self.owner.finish_stop(session_id, generation, true);
                    }
                } else {
                    self.effects
                        .insert(session_id.to_owned(), Effect::CleanupUnconfirmed);
                }
            }
        }
        Ok(true)
    }

    /// Cancel startup and await its completion, or stop the owned process. If this
    /// future is dropped, handles remain in the host for a subsequent stop call.
    pub async fn stop(&mut self, session_id: &str) -> Result<(), String> {
        let action = self.owner.stop(session_id);
        let generation = match action {
            PreviewAction::CancelAndCleanup { generation, .. } => generation,
            PreviewAction::None => match self.owner.get(session_id) {
                Some(s) => s.generation,
                None => return Ok(()),
            },
            _ => return Err("Unexpected preview stop action".into()),
        };
        if let Some(Effect::Starting { cancel, task }) = self.effects.get_mut(session_id) {
            cancel.cancel();
            let result = task.await;
            match result {
                Ok(Ok(process)) => {
                    self.effects
                        .insert(session_id.to_owned(), Effect::Running(process));
                }
                Ok(Err(PreviewStartError::NoProcess(_))) => {
                    self.effects.remove(session_id);
                }
                Ok(Err(PreviewStartError::CleanupUnconfirmed(_))) => {
                    self.effects
                        .insert(session_id.to_owned(), Effect::CleanupUnconfirmed);
                }
                Err(_) => {
                    self.effects
                        .insert(session_id.to_owned(), Effect::CleanupUnconfirmed);
                }
            }
        }
        if matches!(self.effects.get(session_id), Some(Effect::Running(_))) {
            let Some(Effect::Running(mut process)) = self.effects.remove(session_id) else {
                unreachable!()
            };
            let task = tokio::spawn(async move { process.stop().await.map(|_| ()) });
            self.effects
                .insert(session_id.to_owned(), Effect::Cleaning(task));
        }
        if let Some(Effect::Cleaning(task)) = self.effects.get_mut(session_id) {
            match task.await {
                Ok(Ok(())) => {
                    self.effects.remove(session_id);
                }
                _ => {
                    self.effects
                        .insert(session_id.to_owned(), Effect::CleanupUnconfirmed);
                }
            }
        }
        if self.effects.contains_key(session_id) {
            return Err("Preview cleanup unconfirmed".into());
        }
        if !self.owner.finish_stop(session_id, generation, true) {
            return Err("Preview cleanup acknowledgement rejected".into());
        }
        Ok(())
    }
}

impl Drop for PreviewHost {
    fn drop(&mut self) {
        for effect in self.effects.values_mut() {
            match effect {
                Effect::Starting { cancel, task } => {
                    cancel.cancel();
                    task.abort();
                }
                Effect::Cleaning(task) => task.abort(),
                _ => {}
            }
        }
        // Running leases cancel and abort their owned process tasks on drop.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::process_runner::ProcessPool;
    use std::{
        collections::HashSet,
        num::NonZeroU16,
        sync::atomic::{AtomicUsize, Ordering},
    };

    #[tokio::test]
    async fn denied_launch_releases_capacity_after_stop_and_never_spawns() {
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        let runner = Arc::new(LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(move |_| {
                seen.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Err("denied".into()) })
            }),
        ));
        let mut host = PreviewHost::new("owner".into(), 1, runner).unwrap();
        host.start(LocalStart {
            session_id: "session".into(),
            project: ProjectSnapshot {
                root: "/approved/app".into(),
                package: None,
                files: HashSet::new(),
                ancestor_locks: vec![],
                applications: vec![],
            },
            command: Some("npm run dev".into()),
            target: String::new(),
            port: Some(5173),
            framework_hint: None,
            shared_with_agent: false,
        })
        .unwrap();
        while !host.complete_start("session").await.unwrap() {
            tokio::task::yield_now().await;
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            host.state("session").unwrap().last_error.as_deref(),
            Some("denied")
        );
        host.stop("session").await.unwrap();
        assert!(host.state("session").is_none());
        host.start(LocalStart {
            session_id: "next".into(),
            project: ProjectSnapshot {
                root: "/approved/app".into(),
                package: None,
                files: HashSet::new(),
                ancestor_locks: vec![],
                applications: vec![],
            },
            command: Some("npm run dev".into()),
            target: String::new(),
            port: Some(5173),
            framework_hint: None,
            shared_with_agent: false,
        })
        .expect("confirmed no-process denial releases capacity");
    }
    #[tokio::test]
    async fn late_start_cleanup_survives_cancelled_completion() {
        use crate::execution::process_runner::ProcessResult;
        let runner = Arc::new(LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(|_| Box::pin(async { Err("unused".into()) })),
        ));
        let mut host = PreviewHost::new("owner".into(), 1, runner).unwrap();
        host.owner.start("late", false).unwrap();
        host.owner.stop("late");
        let (release, wait) = tokio::sync::oneshot::channel::<()>();
        let process_task = tokio::spawn(async move {
            let _ = wait.await;
            Ok(ProcessResult {
                output: String::new(),
                exit_code: Some(0),
                timed_out: false,
                cancelled: true,
                truncated: false,
            })
        });
        let process = PreviewProcess::for_test(process_task);
        let task = tokio::spawn(async move { Ok(process) });
        while !task.is_finished() {
            tokio::task::yield_now().await;
        }
        host.effects.insert(
            "late".into(),
            Effect::Starting {
                cancel: ProcessCancellation::default(),
                task,
            },
        );
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(30),
                host.complete_start("late")
            )
            .await
            .is_err()
        );
        assert!(matches!(
            host.effects.get("late"),
            Some(Effect::Cleaning(_))
        ));
        release.send(()).unwrap();
        host.stop("late").await.unwrap();
        assert!(host.state("late").is_none());
    }
    #[tokio::test]
    async fn dropping_host_aborts_process_during_pending_cleanup() {
        struct DropSignal(Option<tokio::sync::oneshot::Sender<()>>);
        impl Drop for DropSignal {
            fn drop(&mut self) {
                if let Some(sender) = self.0.take() {
                    let _ = sender.send(());
                }
            }
        }
        let runner = Arc::new(LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(|_| Box::pin(async { Err("unused".into()) })),
        ));
        let mut host = PreviewHost::new("owner".into(), 1, runner).unwrap();
        let (dropped_tx, dropped_rx) = tokio::sync::oneshot::channel();
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        let process_task = tokio::spawn(async move {
            let _guard = DropSignal(Some(dropped_tx));
            let _ = ready_tx.send(());
            std::future::pending::<Result<crate::execution::process_runner::ProcessResult, String>>(
            )
            .await
        });
        ready_rx.await.unwrap();
        let mut process = PreviewProcess::for_test(process_task);
        let cleanup = tokio::spawn(async move { process.stop().await.map(|_| ()) });
        tokio::task::yield_now().await;
        host.effects
            .insert("pending".into(), Effect::Cleaning(cleanup));
        drop(host);
        tokio::time::timeout(std::time::Duration::from_secs(1), dropped_rx)
            .await
            .expect("process task must be aborted with host")
            .unwrap();
    }
    #[tokio::test]
    async fn observing_exit_marks_error_and_retains_cleanup() {
        use super::super::preview::PreviewStatus;
        use crate::execution::process_runner::ProcessResult;
        let runner = Arc::new(LocalPreviewRunner::new(
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
            Arc::new(|_| Box::pin(async { Err("unused".into()) })),
        ));
        let mut host = PreviewHost::new("owner".into(), 1, runner).unwrap();
        let PreviewAction::Start(generation) = host.owner.start("session", false).unwrap() else {
            unreachable!()
        };
        assert_eq!(
            host.owner.started(
                "session",
                generation,
                PreviewResources {
                    runner: Some("session".into()),
                    browser: None
                }
            ),
            PreviewAction::None
        );
        let (release, wait) = tokio::sync::oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            let _ = wait.await;
            Ok(ProcessResult {
                output: String::new(),
                exit_code: Some(1),
                timed_out: false,
                cancelled: false,
                truncated: false,
            })
        });
        host.effects.insert(
            "session".into(),
            Effect::Running(PreviewProcess::for_test(task)),
        );
        assert!(!host.observe_exit("session"));
        release.send(()).unwrap();
        while !matches!(host.effects.get("session"), Some(Effect::Running(process)) if process.is_finished())
        {
            tokio::task::yield_now().await;
        }
        assert!(host.observe_exit("session"));
        assert_eq!(host.state("session").unwrap().status, PreviewStatus::Error);
        assert!(!host.observe_exit("session"));
        assert!(matches!(
            host.effects.get("session"),
            Some(Effect::Running(_))
        ));
        host.stop("session").await.unwrap();
        assert!(host.state("session").is_none());
    }
}
