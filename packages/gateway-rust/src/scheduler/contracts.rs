//! Public scheduler records and asynchronous service contract; no scheduler engine activation.
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJob {
    pub id: String,
    pub name: String,
    pub cron: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}
/// `Omit<ScheduledJob, "id" | "createdAt" | "updatedAt">`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateScheduledJob {
    pub name: String,
    pub cron: String,
    pub enabled: bool,
}
pub trait SchedulerService {
    type Error;
    fn create(
        &mut self,
        job: CreateScheduledJob,
    ) -> BoxFuture<'_, Result<ScheduledJob, Self::Error>>;
    fn list(&mut self) -> BoxFuture<'_, Result<Vec<ScheduledJob>, Self::Error>>;
    fn remove<'a>(&'a mut self, id: &'a str) -> BoxFuture<'a, Result<bool, Self::Error>>;
    fn trigger<'a>(&'a mut self, id: &'a str) -> BoxFuture<'a, Result<(), Self::Error>>;
}
