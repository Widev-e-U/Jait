//! Owned, bounded background helper supervisor; dropping it cancels tasks and
//! aborts their futures so each provider lease signals supervised cleanup.
use super::{
    delegation::{self, DelegationHost, HelperRequest},
    tools::{BackgroundTask, BackgroundTasks, CancelTask, TaskStatus},
};
use std::time::Duration;
use tokio::{sync::watch, task::JoinSet};
struct Cancel(watch::Sender<bool>);
impl CancelTask for Cancel {
    fn cancel(&mut self) {
        let _ = self.0.send(true);
    }
}
pub struct BackgroundSupervisor {
    pub tasks: BackgroundTasks,
    workers: JoinSet<(String, Result<String, String>)>,
    capacity: usize,
}
impl BackgroundSupervisor {
    pub fn new(capacity: usize) -> Self {
        Self {
            tasks: BackgroundTasks::new(capacity),
            workers: JoinSet::new(),
            capacity,
        }
    }
    pub async fn start(
        &mut self,
        host: &(impl DelegationHost + ?Sized),
        request: HelperRequest,
        duration_ms: u64,
        now: u64,
    ) -> Result<String, String> {
        if self.tasks.list().len() >= self.capacity || self.workers.len() >= self.capacity {
            return Err("Background helper capacity reached".into());
        }
        if request.question.len() > 256 * 1024
            || request.question.trim().is_empty()
            || request.working_directory.len() > 8192
        {
            return Err("Invalid voice helper request".into());
        }
        let id = format!("voice-task-{}", uuid::Uuid::new_v4());
        let title = format!(
            "Voice: {}",
            request.question.chars().take(40).collect::<String>()
        );
        let question = delegation::format_question(&request.question);
        let deadline =
            tokio::time::Instant::now() + Duration::from_millis(duration_ms.clamp(5000, 120000));
        let helper = tokio::time::timeout_at(deadline, host.create_helper(request))
            .await
            .map_err(|_| "Voice helper startup timed out")??;
        let task = BackgroundTask {
            id: id.clone(),
            title,
            thread_id: helper.thread_id.clone(),
            session_id: Some(helper.session_id.clone()),
            provider_id: helper.provider_id.clone(),
            status: TaskStatus::Running,
            cancelled: false,
            result: None,
            error: None,
            started_at: now,
        };
        let (cancel, receiver) = watch::channel(false);
        self.tasks.register(task, Some(Box::new(Cancel(cancel))))?;
        let worker_id = id.clone();
        self.workers.spawn(async move {
            (
                worker_id,
                delegation::run_started(helper, question, deadline, duration_ms, receiver).await,
            )
        });
        Ok(id)
    }
    /// Connection owner drains completions to enqueue voice announcements.
    /// Completed/cancelled task records are retained until explicit removal,
    /// subject to the fixed capacity rather than unbounded timer accumulation.
    pub fn poll(&mut self) -> Vec<BackgroundTask> {
        let mut completed = vec![];
        while let Some(joined) = self.workers.try_join_next() {
            if let Ok((id, result)) = joined
                && self.tasks.finish(&id, result).unwrap_or(false)
                && let Some(task) = self.tasks.get(&id)
            {
                completed.push(task.clone());
            }
        }
        completed
    }
    pub fn clear(&mut self) {
        self.tasks.clear();
        self.workers.abort_all();
    }
}
impl Drop for BackgroundSupervisor {
    fn drop(&mut self) {
        self.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::super::{
        delegation::{HelperEvent, HelperLease, HelperSession, ProviderSelection},
        tools::ToolContext,
    };
    use super::*;
    use crate::voice::VoiceFuture;
    use std::{
        collections::BTreeMap,
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
    };
    struct Host(Arc<AtomicUsize>);
    struct Lease {
        count: Arc<AtomicUsize>,
        _sender: tokio::sync::mpsc::Sender<HelperEvent>,
    }
    impl Drop for Lease {
        fn drop(&mut self) {
            self.count.fetch_add(1, Ordering::SeqCst);
        }
    }
    impl HelperLease for Lease {
        fn send<'a>(&'a mut self, _: &'a str) -> VoiceFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }
        fn record_answer<'a>(&'a mut self, _: &'a str) -> VoiceFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }
        fn record_error<'a>(&'a mut self, _: &'a str) -> VoiceFuture<'a, ()> {
            Box::pin(async { Ok(()) })
        }
        fn stop_and_delete(&mut self) -> VoiceFuture<'_, ()> {
            Box::pin(async { Ok(()) })
        }
    }
    impl DelegationHost for Host {
        fn create_helper(&self, _: HelperRequest) -> VoiceFuture<'_, HelperSession> {
            let count = self.0.clone();
            Box::pin(async move {
                let (tx, rx) = tokio::sync::mpsc::channel(8);
                Ok(HelperSession {
                    thread_id: "thread".into(),
                    session_id: "session".into(),
                    provider_id: "codex".into(),
                    lease: Box::new(Lease { count, _sender: tx }),
                    events: rx,
                })
            })
        }
    }
    #[tokio::test]
    async fn cancel_background_retains_terminal_status_and_drops_owned_lease() {
        let count = Arc::new(AtomicUsize::new(0));
        let host = Host(count.clone());
        let mut supervisor = BackgroundSupervisor::new(1);
        let request = HelperRequest {
            question: "question".into(),
            working_directory: "/authorized".into(),
            selection: ProviderSelection {
                provider: "codex".into(),
                model: None,
                runtime_mode: "read-only".into(),
            },
            context: ToolContext {
                session_id: "voice-user".into(),
                action_id: "a".into(),
                project_root: "/authorized".into(),
                requested_by: "voice-assistant".into(),
                user_id: "user".into(),
                api_keys: BTreeMap::new(),
            },
        };
        let id = supervisor.start(&host, request, 5000, 0).await.unwrap();
        assert_eq!(supervisor.tasks.get(&id).unwrap().thread_id, "thread");
        assert!(supervisor.tasks.cancel(&id));
        let _joined = tokio::time::timeout(Duration::from_secs(1), supervisor.workers.join_next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(supervisor.poll().is_empty());
        assert_eq!(
            supervisor.tasks.get(&id).unwrap().status,
            TaskStatus::Cancelled
        );
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}
