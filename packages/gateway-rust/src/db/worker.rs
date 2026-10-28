//! A SQLite connection lives on one dedicated thread with a bounded mailbox.
//! Async callers never wait on a SQLite mutex or occupy the blocking thread pool.
use rusqlite::Connection;
use std::{
    error::Error,
    fmt, io,
    num::NonZeroU16,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
};
use tokio::sync::{mpsc, oneshot, watch};

pub type OperationError = Box<dyn Error + Send + Sync>;
type Job = Box<dyn FnOnce(&Connection) + Send>;

#[derive(Debug)]
pub enum DatabaseError {
    Busy,
    Closed,
    WorkerUnavailable,
    WorkerPanicked,
    Operation(OperationError),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Busy => "database queue is full",
            Self::Closed => "database worker is closed",
            Self::WorkerUnavailable => "database worker is unavailable",
            Self::WorkerPanicked => "database operation panicked",
            Self::Operation(_) => "database operation failed",
        })
    }
}

impl Error for DatabaseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Operation(error) => Some(error.as_ref()),
            _ => None,
        }
    }
}

struct Inner {
    sender: Mutex<Option<mpsc::Sender<Job>>>,
    finished: watch::Receiver<bool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone)]
pub struct DatabaseWorker {
    inner: Arc<Inner>,
    job_guard: Option<Arc<dyn Send + Sync>>,
}

impl DatabaseWorker {
    /// Takes an explicit connection; never discovers state paths or opens live data.
    pub fn new(connection: Connection, capacity: NonZeroU16) -> io::Result<Self> {
        let (sender, mut receiver) = mpsc::channel::<Job>(usize::from(capacity.get()));
        let (finished, completion) = watch::channel(false);
        let thread = thread::Builder::new()
            .name("jait-sqlite".into())
            .spawn(move || {
                while let Some(job) = receiver.blocking_recv() {
                    job(&connection);
                }
                drop(connection);
                let _ = finished.send(true);
            })?;
        Ok(Self {
            job_guard: None,
            inner: Arc::new(Inner {
                sender: Mutex::new(Some(sender)),
                finished: completion,
                thread: Mutex::new(Some(thread)),
            }),
        })
    }

    /// Retain an admission lease through queued/started SQL even if its caller
    /// drops the future. Shares the existing connection, thread and mailbox.
    pub fn with_job_guard(&self, guard: Arc<dyn Send + Sync>) -> Self {
        Self {
            inner: self.inner.clone(),
            job_guard: Some(Arc::new((self.job_guard.clone(), guard))),
        }
    }

    /// Jobs cancelled before dispatch are skipped. Once started, a transaction can
    /// finish even if the caller disconnects; arbitrary blocking closures cannot be aborted.
    pub async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, OperationError> + Send + 'static,
    ) -> Result<T, DatabaseError> {
        let (response, receive) = oneshot::channel();
        let guard = self.job_guard.clone();
        let job: Job = Box::new(move |connection| {
            if response.is_closed() {
                return;
            }
            let result = match catch_unwind(AssertUnwindSafe(|| operation(connection))) {
                Ok(result) => result.map_err(DatabaseError::Operation),
                Err(_) => Err(DatabaseError::WorkerPanicked),
            };
            // SQL and captured work have finished. Release job admission before
            // waking the caller, so a completed call can admit its successor.
            // Cancelled jobs still hold the guard until this completion point.
            drop(guard);
            let _ = response.send(result);
        });
        {
            // This lock only covers nonblocking admission and close, never SQL or await.
            let sender = self
                .inner
                .sender
                .lock()
                .map_err(|_| DatabaseError::WorkerUnavailable)?;
            sender
                .as_ref()
                .ok_or(DatabaseError::Closed)?
                .try_send(job)
                .map_err(|error| match error {
                    mpsc::error::TrySendError::Full(_) => DatabaseError::Busy,
                    mpsc::error::TrySendError::Closed(_) => DatabaseError::WorkerUnavailable,
                })?;
        }
        receive
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?
    }

    /// Stop admission, drain accepted jobs, close SQLite, and join the worker.
    /// Concurrent shutdown callers all observe the same completed database close.
    pub async fn shutdown(&self) -> Result<(), DatabaseError> {
        self.inner
            .sender
            .lock()
            .map_err(|_| DatabaseError::WorkerUnavailable)?
            .take();
        let mut finished = self.inner.finished.clone();
        finished
            .wait_for(|done| *done)
            .await
            .map_err(|_| DatabaseError::WorkerUnavailable)?;
        let thread = self
            .inner
            .thread
            .lock()
            .map_err(|_| DatabaseError::WorkerUnavailable)?
            .take();
        if let Some(thread) = thread {
            tokio::task::spawn_blocking(move || thread.join())
                .await
                .map_err(|_| DatabaseError::WorkerUnavailable)?
                .map_err(|_| DatabaseError::WorkerUnavailable)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn worker(capacity: u16) -> DatabaseWorker {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE counter(value INTEGER); INSERT INTO counter VALUES(0);")
            .unwrap();
        DatabaseWorker::new(db, NonZeroU16::new(capacity).unwrap()).unwrap()
    }

    /// A job cancelled by its caller stays in the bounded mailbox until the worker
    /// thread pops it, which happens only after the previous job has returned its
    /// response. Wait for that free slot instead of racing it.
    async fn wait_for_mailbox_space(worker: &DatabaseWorker) {
        for _ in 0..1_000 {
            let has_space = {
                let sender = worker.inner.sender.lock().unwrap();
                sender.as_ref().unwrap().capacity() > 0
            };
            if has_space {
                return;
            }
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        panic!("worker mailbox did not drain the cancelled job");
    }

    #[tokio::test]
    async fn serializes_transactions_and_closes_for_all_clones() {
        let worker = worker(32);
        let mut tasks = Vec::new();
        for _ in 0..16 {
            let worker = worker.clone();
            tasks.push(tokio::spawn(async move {
                worker
                    .run(|db| {
                        db.execute("UPDATE counter SET value=value+1", [])?;
                        Ok(())
                    })
                    .await
                    .unwrap();
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
        assert_eq!(
            worker
                .run(|db| Ok(
                    db.query_row("SELECT value FROM counter", [], |row| row.get::<_, i64>(0))?
                ))
                .await
                .unwrap(),
            16
        );
        let clone = worker.clone();
        let (first, second) = tokio::join!(worker.shutdown(), clone.shutdown());
        first.unwrap();
        second.unwrap();
        assert!(matches!(
            clone.run(|_| Ok(())).await,
            Err(DatabaseError::Closed)
        ));
    }

    #[tokio::test]
    async fn overload_and_cancelled_queued_writes_have_no_effect() {
        let worker = worker(1);
        let (entered, started) = oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let active = worker.clone();
        let first = tokio::spawn(async move {
            active
                .run(move |db| {
                    let _ = entered.send(());
                    let _ = wait.recv();
                    db.execute("UPDATE counter SET value=value+1", [])?;
                    Ok(())
                })
                .await
                .unwrap();
        });
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        let queued = worker.clone();
        let second = tokio::spawn(async move {
            queued
                .run(|db| {
                    db.execute("UPDATE counter SET value=value+100", [])?;
                    Ok(())
                })
                .await
        });
        tokio::task::yield_now().await;
        assert_eq!(
            worker
                .inner
                .sender
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .capacity(),
            0
        );
        assert!(matches!(
            worker.run(|_| Ok(())).await,
            Err(DatabaseError::Busy)
        ));
        second.abort();
        let _ = second.await;
        release.send(()).unwrap();
        first.await.unwrap();
        wait_for_mailbox_space(&worker).await;
        assert_eq!(
            worker
                .run(|db| Ok(
                    db.query_row("SELECT value FROM counter", [], |row| row.get::<_, i64>(0))?
                ))
                .await
                .unwrap(),
            1
        );
        worker.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn operation_errors_and_panics_do_not_kill_the_worker() {
        let worker = worker(1);
        let failure = worker
            .run(|db| {
                db.execute("INSERT INTO absent_table VALUES('private value')", [])?;
                Ok(())
            })
            .await
            .unwrap_err();
        assert_eq!(failure.to_string(), "database operation failed");
        assert!(failure.source().is_some());
        assert!(matches!(
            worker.run::<()>(|_| panic!("fixture panic")).await,
            Err(DatabaseError::WorkerPanicked)
        ));
        assert_eq!(worker.run(|_| Ok(42)).await.unwrap(), 42);
        worker.shutdown().await.unwrap();
    }
}

#[cfg(test)]
mod guarded_tests {
    use super::*;
    use std::time::Duration;
    #[tokio::test]
    async fn started_cancelled_job_retains_nested_guards_through_commit() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE counter(value INTEGER)")
            .unwrap();
        let worker = DatabaseWorker::new(c, NonZeroU16::new(2).unwrap()).unwrap();
        let outer = Arc::new(());
        let inner = Arc::new(());
        let weak_outer = Arc::downgrade(&outer);
        let weak_inner = Arc::downgrade(&inner);
        let scoped = worker.with_job_guard(outer).with_job_guard(inner);
        let (entered, started) = oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let task = tokio::spawn(async move {
            scoped
                .run(move |c| {
                    entered.send(()).unwrap();
                    wait.recv_timeout(Duration::from_secs(5)).unwrap();
                    c.execute("INSERT INTO counter VALUES(42)", [])?;
                    Ok(())
                })
                .await
        });
        tokio::time::timeout(Duration::from_secs(5), started)
            .await
            .unwrap()
            .unwrap();
        task.abort();
        let _ = task.await;
        assert!(weak_outer.upgrade().is_some());
        assert!(weak_inner.upgrade().is_some());
        release.send(()).unwrap();
        assert_eq!(
            worker
                .run(|c| Ok(c.query_row("SELECT value FROM counter", [], |r| r.get::<_, i64>(0))?))
                .await
                .unwrap(),
            42
        );
        assert!(weak_outer.upgrade().is_none());
        assert!(weak_inner.upgrade().is_none());
        worker.shutdown().await.unwrap();
    }
}
