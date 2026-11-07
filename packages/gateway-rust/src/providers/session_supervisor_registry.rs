//! Unregistered draft: bounded ownership and draining for Unix session supervisors.
//!
//! The caller must retain this registry until drain completes, and keep the Tokio
//! runtime alive. Natural child exits are not observed by the underlying supervisor.
#![cfg(unix)]

use std::{collections::BTreeMap, io, sync::{Arc, Mutex}, time::Duration};
use tokio::sync::watch;
use super::session_supervisor::{SessionPipes, SessionSupervisor, ShutdownResult};

type Completion = Result<Arc<ShutdownResult>, String>;

struct Entry {
    stop: watch::Sender<bool>,
    completion: watch::Receiver<Option<Completion>>,
}
fn track(mut supervisor: SessionSupervisor) -> Entry {
    let (stop, mut stop_rx) = watch::channel(false);
    let (result_tx, completion) = watch::channel(None);
    tokio::spawn(async move {
        let stop_requested = async {
            if !*stop_rx.borrow() { let _ = stop_rx.changed().await; }
        };
        let result = tokio::select! {
            result = supervisor.observe() => result,
            _ = stop_requested => supervisor.shutdown().await,
        };
        // An error reports missing supervision, never successful cleanup.
        result_tx.send_replace(Some(result.map_err(|error| error.to_string())));
    });
    Entry { stop, completion }
}

struct State {
    draining: bool,
    next_id: u64,
    entries: BTreeMap<u64, Entry>,
}

/// Retains all admitted supervisors and their outcomes until the registry drops.
/// Capacity bounds both active and completed entries; callers must explicitly
/// retrieve and retire completed results to reclaim capacity.
pub struct SessionSupervisorRegistry {
    capacity: usize,
    state: Mutex<State>,
}

pub struct DrainReport {
    pub completed: BTreeMap<u64, Completion>,
    /// IDs still awaiting a result when the deadline expired.
    pub pending: Vec<u64>,
}

impl SessionSupervisorRegistry {
    pub fn new(capacity: usize) -> Self {
        Self { capacity, state: Mutex::new(State { draining: false, next_id: 1, entries: BTreeMap::new() }) }
    }

    /// Spawn and admit atomically against drain. No child is spawned once drain
    /// starts or the registry is full. The mutex is held only during spawn/setup.
    pub fn spawn(&self, command: &mut tokio::process::Command, escalation_delay: Duration) -> io::Result<(u64, SessionPipes)> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state.draining { return Err(io::Error::new(io::ErrorKind::BrokenPipe, "session registry is draining")); }
        if state.entries.len() >= self.capacity { return Err(io::Error::new(io::ErrorKind::WouldBlock, "session registry is full")); }
        if state.next_id == u64::MAX { return Err(io::Error::new(io::ErrorKind::Other, "session IDs exhausted")); }
        tokio::runtime::Handle::try_current().map_err(|_| io::Error::new(io::ErrorKind::Other, "session registry requires a Tokio runtime"))?;
        let (supervisor, pipes) = SessionSupervisor::spawn(command, escalation_delay)?;
        let id = state.next_id;
        state.next_id += 1;
        state.entries.insert(id, track(supervisor));
        Ok((id, pipes))
    }

    /// Retrieve and retire a completed entry. Pending or unknown IDs return
    /// None; pending entries remain owned. The caller must inspect the outcome.
    pub fn take_completed(&self, id: u64) -> Option<Completion> {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        let entry = state.entries.get(&id)?;
        let result = match entry.completion.borrow().clone() {
            Some(result) => result,
            None if entry.completion.has_changed().is_err() => {
                // The sender may publish and close between the first borrow and
                // the closed check, so inspect its final value once more.
                entry.completion.borrow().clone().unwrap_or_else(||
                    Err("supervisor task ended without a result".into()))
            }
            None => return None,
        };
        state.entries.remove(&id);
        Some(result)
    }

    /// Stop one session. Its outcome remains available to a later drain.
    pub fn request_stop(&self, id: u64) -> bool {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.entries.get(&id).is_some_and(|entry| entry.stop.send(true).is_ok())
    }

    /// Synchronously close admission and request all existing sessions stop.
    /// This may be called from a shutdown guard before any async drain is polled.
    pub fn begin_drain(&self) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        state.draining = true;
        for entry in state.entries.values() { let _ = entry.stop.send(true); }
    }

    /// Begin draining when first polled, then await outcomes until the deadline.
    /// Cancellation after polling does not cancel the independent shutdown tasks.
    pub async fn drain(&self, timeout: Duration) -> DrainReport {
        self.begin_drain();
        let entries: Vec<_> = {
            let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
            state.entries.iter().map(|(&id, entry)| (id, entry.completion.clone())).collect()
        };
        let deadline = tokio::time::Instant::now() + timeout;
        let mut completed = BTreeMap::new();
        let mut pending = Vec::new();
        for (id, mut receiver) in entries {
            let result = loop {
                if let Some(result) = receiver.borrow().clone() { break Some(result); }
                match tokio::time::timeout_at(deadline, receiver.changed()).await {
                    Ok(Ok(())) => {},
                    Ok(Err(_)) => break Some(Err("supervisor task ended without a result".into())),
                    Err(_) => break None,
                }
            };
            match result { Some(result) => { completed.insert(id, result); }, None => pending.push(id) }
        }
        DrainReport { completed, pending }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::process::Command;

    fn spawn(registry: &SessionSupervisorRegistry, delay: Duration) -> io::Result<u64> {
        let mut command = Command::new("sh");
        command.arg("-c").arg("exec sleep 30");
        registry.spawn(&mut command, delay).map(|(id, _)| id)
    }

    #[tokio::test]
    async fn drain_rejects_admission_and_retains_results() {
        let registry = SessionSupervisorRegistry::new(2);
        let id = spawn(&registry, Duration::from_millis(20)).unwrap();
        let report = registry.drain(Duration::from_secs(2)).await;
        assert!(report.pending.is_empty());
        assert!(report.completed[&id].as_ref().unwrap().exit.is_ok());
        assert_eq!(spawn(&registry, Duration::from_millis(1)).unwrap_err().kind(), io::ErrorKind::BrokenPipe);
        assert!(registry.drain(Duration::ZERO).await.completed.contains_key(&id));
    }

    #[tokio::test]
    async fn begin_drain_works_without_polling_drain_future() {
        let registry = SessionSupervisorRegistry::new(2);
        let first = spawn(&registry, Duration::from_millis(1)).unwrap();
        let unpolled = registry.drain(Duration::from_secs(1));
        drop(unpolled);
        // Constructing and dropping an unpolled future does not start draining.
        let second = spawn(&registry, Duration::from_millis(1)).unwrap();
        registry.begin_drain();
        assert_eq!(spawn(&registry, Duration::ZERO).unwrap_err().kind(), io::ErrorKind::BrokenPipe);
        let report = registry.drain(Duration::from_secs(2)).await;
        assert!(report.pending.is_empty());
        for id in [first, second] {
            assert!(report.completed[&id].as_ref().unwrap().exit.is_ok());
        }
    }

    #[tokio::test]
    async fn deadline_and_cancelled_wait_preserve_cleanup_for_retry() {
        let registry = SessionSupervisorRegistry::new(1);
        let id = spawn(&registry, Duration::from_millis(100)).unwrap();
        let mut drain = Box::pin(registry.drain(Duration::from_secs(2)));
        assert!(tokio::time::timeout(Duration::from_millis(5), &mut drain).await.is_err());
        drop(drain);
        let report = registry.drain(Duration::ZERO).await;
        assert_eq!(report.pending, vec![id]);
        let report = registry.drain(Duration::from_secs(2)).await;
        assert!(report.pending.is_empty());
        assert!(report.completed[&id].as_ref().unwrap().exit.is_ok());
    }

    #[tokio::test]
    async fn completed_result_can_be_retired_to_reclaim_capacity() {
        let registry = SessionSupervisorRegistry::new(1);
        let id = spawn(&registry, Duration::from_millis(1)).unwrap();
        assert!(registry.take_completed(id).is_none());
        assert_eq!(spawn(&registry, Duration::ZERO).unwrap_err().kind(), io::ErrorKind::WouldBlock);
        assert!(registry.request_stop(id));
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            if let Some(result) = registry.take_completed(id) { assert!(result.unwrap().exit.is_ok()); break; }
            assert!(tokio::time::Instant::now() < deadline);
            tokio::task::yield_now().await;
        }
        let next = spawn(&registry, Duration::from_millis(1)).unwrap();
        assert_ne!(id, next);
        assert!(registry.drain(Duration::from_secs(2)).await.completed[&next].as_ref().unwrap().exit.is_ok());
    }

    #[tokio::test]
    async fn inner_task_failure_is_visible_without_stop() {
        let registry = SessionSupervisorRegistry::new(1);
        registry.state.lock().unwrap().entries.insert(99, track(SessionSupervisor::failed_for_test()));
        let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
        let failure = loop {
            if let Some(result) = registry.take_completed(99) { break result.unwrap_err(); }
            assert!(tokio::time::Instant::now() < deadline);
            tokio::task::yield_now().await;
        };
        assert!(failure.contains("stopped before cleanup"));
        let id = spawn(&registry, Duration::from_millis(1)).unwrap();
        assert!(registry.drain(Duration::from_secs(2)).await.completed[&id].as_ref().unwrap().exit.is_ok());
    }

    #[tokio::test]
    async fn task_failure_can_be_retrieved_and_retired() {
        let registry = SessionSupervisorRegistry::new(1);
        let (stop, _stop_rx) = watch::channel(false);
        let (result_tx, completion) = watch::channel(None);
        registry.state.lock().unwrap().entries.insert(99, Entry { stop, completion });
        assert!(registry.take_completed(99).is_none());
        drop(result_tx);
        assert_eq!(registry.take_completed(99).unwrap().unwrap_err(), "supervisor task ended without a result");
        assert!(registry.take_completed(99).is_none());
        let id = spawn(&registry, Duration::from_millis(1)).unwrap();
        assert!(registry.drain(Duration::from_secs(2)).await.completed[&id].as_ref().unwrap().exit.is_ok());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn concurrent_spawn_and_drain_do_not_lose_a_child() {
        let registry = Arc::new(SessionSupervisorRegistry::new(1));
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let worker_registry = registry.clone();
        let worker_barrier = barrier.clone();
        let worker = tokio::spawn(async move {
            worker_barrier.wait().await;
            spawn(&worker_registry, Duration::from_millis(1))
        });
        barrier.wait().await;
        let report = registry.drain(Duration::from_secs(2)).await;
        match worker.await.unwrap() {
            Ok(id) => assert!(report.completed.contains_key(&id)),
            Err(error) => assert_eq!(error.kind(), io::ErrorKind::BrokenPipe),
        }
        assert!(report.pending.is_empty());
    }
}
