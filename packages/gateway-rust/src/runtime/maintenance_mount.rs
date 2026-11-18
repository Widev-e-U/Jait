//! Production maintenance backend. Reads are served from `scheduled_job_runs`.
//! Running a check executes repository commands that may mutate files, so the
//! authority refuses every execution until the consent engine can approve it.
use crate::{
    db::worker::DatabaseWorker,
    execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest},
    routes::maintenance::MaintenanceBackend,
    runtime::blocking::BlockingLane,
    services::{
        maintenance::{
            MaintenanceAuthority, MaintenanceCheck, MaintenanceConfig, MaintenanceRunRecord,
            MaintenanceService,
        },
        repositories::RepositoryRecord,
    },
    tools::maintenance::MaintenanceError,
};
use futures_util::future::BoxFuture;
use serde_json::Value;
use std::{collections::HashMap, num::NonZeroU16, sync::Arc};

const EXECUTION_DISABLED: &str =
    "Maintenance checks require shell consent, which is not available in the Rust gateway yet";

struct ReadOnlyAuthority;
impl MaintenanceAuthority for ReadOnlyAuthority {
    fn repository(&self, _: &RepositoryRecord) -> Result<Arc<dyn Send + Sync>, String> {
        Err(EXECUTION_DISABLED.into())
    }
    fn check(
        &self,
        _: &RepositoryRecord,
        _: &MaintenanceCheck,
        _: &ProcessRequest,
    ) -> Result<Arc<dyn Send + Sync>, String> {
        Err(EXECUTION_DISABLED.into())
    }
    fn propose_plan(
        &self,
        _: &RepositoryRecord,
        _: &[Value],
    ) -> Result<Arc<dyn Send + Sync>, String> {
        Err(EXECUTION_DISABLED.into())
    }
    // Callers are authenticated by the route before any read reaches the service.
    fn read_run(&self, _: &MaintenanceRunRecord) -> Result<(), String> {
        Ok(())
    }
}

pub struct ServiceBackend(MaintenanceService);
impl ServiceBackend {
    pub fn new(db: DatabaseWorker) -> Result<Self, String> {
        Ok(Self(MaintenanceService::new(
            db,
            BlockingLane::new(NonZeroU16::new(2).unwrap()),
            ProcessPool::new(NonZeroU16::new(2).unwrap()),
            HashMap::new(),
            vec!["/bin/sh".into(), "-c".into()],
            Arc::new(ReadOnlyAuthority),
        )?))
    }
}
fn message(e: String) -> MaintenanceError {
    MaintenanceError::Message(e)
}
fn json<T: serde::Serialize>(value: &T) -> Result<Value, MaintenanceError> {
    serde_json::to_value(value).map_err(|e| message(e.to_string()))
}
impl MaintenanceBackend for ServiceBackend {
    fn list_runs(
        &self,
        job_id: Option<String>,
        limit: f64,
    ) -> BoxFuture<'_, Result<Vec<Value>, MaintenanceError>> {
        Box::pin(async move {
            let limit = if limit.is_finite() {
                limit.max(0.0) as usize
            } else {
                20
            };
            let runs = self.0.list_runs(job_id, limit).await.map_err(message)?;
            runs.iter().map(json).collect()
        })
    }
    fn get_run(&self, id: String) -> BoxFuture<'_, Result<Option<Value>, MaintenanceError>> {
        Box::pin(async move {
            self.0
                .get_run(&id)
                .await
                .map_err(message)?
                .as_ref()
                .map(json)
                .transpose()
        })
    }
    fn run_for_repo(
        &self,
        repo_id: String,
        job_id: String,
    ) -> BoxFuture<'_, Result<Value, MaintenanceError>> {
        Box::pin(async move {
            let result = self
                .0
                .run_for_repo(
                    &repo_id,
                    &job_id,
                    MaintenanceConfig::default(),
                    ProcessCancellation::default(),
                )
                .await
                .map_err(message)?;
            json(&result)
        })
    }
}
