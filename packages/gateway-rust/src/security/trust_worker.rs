//! A persistent trust cache behind the bounded SQLite worker. The cache outlives
//! each SQL job, including failed writes and external changes to persisted rows.
use super::trust_engine::{TrustCache, TrustEngine, TrustState};
use crate::db::worker::{DatabaseError, DatabaseWorker, OperationError};
use rusqlite::Connection;
use std::num::NonZeroU16;
#[derive(Clone)]
pub struct TrustWorker {
    worker: DatabaseWorker,
    cache: TrustCache,
    persistent: bool,
}
impl TrustWorker {
    pub fn new(
        connection: Option<Connection>,
        capacity: NonZeroU16,
    ) -> Result<Self, OperationError> {
        let persistent = connection.is_some();
        let connection = match connection {
            Some(db) => db,
            None => Connection::open_in_memory()?,
        };
        Ok(Self {
            worker: DatabaseWorker::new(connection, capacity)?,
            cache: TrustCache::default(),
            persistent,
        })
    }
    /// Persistent trust on an already-owned database worker, so no second connection
    /// to the same file exists.
    pub fn from_worker(worker: DatabaseWorker) -> Self {
        Self {
            worker,
            cache: TrustCache::default(),
            persistent: true,
        }
    }
    async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&mut TrustEngine<'_>) -> Result<T, OperationError> + Send + 'static,
    ) -> Result<T, DatabaseError> {
        let cache = self.cache.clone();
        let persistent = self.persistent;
        self.worker
            .run(move |db| {
                operation(&mut TrustEngine::with_cache(
                    persistent.then_some(db),
                    cache,
                ))
            })
            .await
    }
    pub async fn get(&self, action: String) -> Result<TrustState, DatabaseError> {
        self.run(move |engine| Ok(engine.get_state(&action)?)).await
    }
    pub async fn list(&self) -> Result<Vec<TrustState>, DatabaseError> {
        self.run(move |engine| Ok(engine.list_all()?)).await
    }
    pub async fn reset(&self, action: String) -> Result<TrustState, DatabaseError> {
        self.run(move |engine| Ok(engine.reset(&action))).await
    }
    pub async fn approve(&self, action: String) -> Result<TrustState, DatabaseError> {
        self.run(move |engine| Ok(engine.record_approval(&action)?))
            .await
    }
    pub async fn revert(&self, action: String) -> Result<TrustState, DatabaseError> {
        self.run(move |engine| Ok(engine.record_revert(&action)?))
            .await
    }
    pub async fn shutdown(&self) -> Result<(), DatabaseError> {
        self.worker.shutdown().await
    }
}
