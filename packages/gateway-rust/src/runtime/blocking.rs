//! Admission control for blocking work. Give database and CPU work separate lanes.
//! A dropped caller cannot abort a running blocking operation; its permit stays held.
use std::{
    io,
    num::NonZeroU16,
    sync::{Arc, Mutex},
};
use tokio::sync::{Semaphore, TryAcquireError, watch};

struct LaneState {
    closed: bool,
    active: usize,
}

struct ActiveWork {
    state: Arc<Mutex<LaneState>>,
    active: watch::Sender<usize>,
}
impl Drop for ActiveWork {
    fn drop(&mut self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.active -= 1;
        self.active.send_replace(state.active);
    }
}

#[derive(Clone)]
pub struct BlockingLane {
    permits: Arc<Semaphore>,
    state: Arc<Mutex<LaneState>>,
    active: watch::Sender<usize>,
}

impl BlockingLane {
    pub fn new(parallelism: NonZeroU16) -> Self {
        let (active, _) = watch::channel(0);
        Self {
            state: Arc::new(Mutex::new(LaneState {
                closed: false,
                active: 0,
            })),
            active,
            permits: Arc::new(Semaphore::new(usize::from(parallelism.get()))),
        }
    }

    /// Reject overload before spawning. Callers map this to their domain/wire contract.
    /// Running closures must enforce their own I/O deadlines and transaction boundaries.
    pub async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce() -> T + Send + 'static,
    ) -> io::Result<T> {
        let (permit, active) = {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if state.closed {
                return Err(io::Error::new(
                    io::ErrorKind::BrokenPipe,
                    "blocking lane is closed",
                ));
            }
            let permit = self
                .permits
                .clone()
                .try_acquire_owned()
                .map_err(|error| match error {
                    TryAcquireError::NoPermits => {
                        io::Error::new(io::ErrorKind::WouldBlock, "blocking lane is full")
                    }
                    TryAcquireError::Closed => {
                        io::Error::new(io::ErrorKind::BrokenPipe, "blocking lane is closed")
                    }
                })?;
            state.active += 1;
            self.active.send_replace(state.active);
            let active = ActiveWork {
                state: self.state.clone(),
                active: self.active.clone(),
            };
            (permit, active)
        };
        tokio::task::spawn_blocking(move || {
            let _active = active;
            let _permit = permit;
            operation()
        })
        .await
        .map_err(|_| io::Error::other("blocking worker failed"))
    }

    /// Stop new admissions. Existing operations retain their permits until completion.
    pub fn close(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.closed = true;
        self.permits.close();
    }

    /// Close admission and wait for every admitted closure, including abandoned callers.
    /// A running closure must finish on its own; this does not cancel or bound it.
    pub async fn close_and_drain(&self) {
        let mut active = self.active.subscribe();
        self.close();
        while *active.borrow_and_update() != 0 {
            if active.changed().await.is_err() {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn overload_and_dropped_callers_cannot_exceed_active_work_limit() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let worker_lane = lane.clone();
        let caller = tokio::spawn(async move {
            worker_lane
                .run(move || {
                    let _ = entered.send(());
                    let _ = wait.recv();
                })
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        caller.abort();
        let _ = caller.await;
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        release.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match lane.run(|| 42).await {
                    Ok(value) => break assert_eq!(value, 42),
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        tokio::task::yield_now().await;
                    }
                    Err(error) => panic!("{error}"),
                }
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn close_rejects_work_before_any_effect() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        lane.close();
        assert_eq!(
            lane.run(|| panic!("closed lane executed work"))
                .await
                .unwrap_err()
                .kind(),
            io::ErrorKind::BrokenPipe
        );
    }

    #[tokio::test]
    async fn drain_waits_for_abandoned_work_and_rejects_new_work() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let worker = lane.clone();
        let caller = tokio::spawn(async move {
            worker
                .run(move || {
                    entered.send(()).unwrap();
                    wait.recv().unwrap();
                })
                .await
        });
        started.await.unwrap();
        caller.abort();
        let _ = caller.await;
        lane.close();
        let shutdown = lane.close_and_drain();
        let second_shutdown = lane.close_and_drain();
        tokio::pin!(shutdown, second_shutdown);
        assert!(futures_util::poll!(shutdown.as_mut()).is_pending());
        assert!(futures_util::poll!(second_shutdown.as_mut()).is_pending());
        assert_eq!(
            lane.run(|| ()).await.unwrap_err().kind(),
            io::ErrorKind::BrokenPipe
        );
        release.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(5), shutdown)
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), second_shutdown)
            .await
            .unwrap();
        lane.close_and_drain().await;
    }

    #[tokio::test]
    async fn panics_release_capacity_without_leaking_payloads() {
        let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
        let error = lane
            .run(|| panic!("private worker payload"))
            .await
            .unwrap_err();
        assert_eq!(error.to_string(), "blocking worker failed");
        assert_eq!(lane.run(|| 42).await.unwrap(), 42);
    }
}
