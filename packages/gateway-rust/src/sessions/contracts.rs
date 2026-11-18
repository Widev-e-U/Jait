//! Source `sessions/contracts.ts`: record and asynchronous router declarations only.
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDescriptor {
    pub id: String,
    pub name: String,
    pub project_id: String,
    pub created_at: String,
    pub last_activity_at: String,
}
pub trait SessionRouter {
    type Error;
    fn create<'a>(
        &'a mut self,
        name: &'a str,
        project_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionDescriptor, Self::Error>>;
    fn list<'a>(
        &'a mut self,
        project_id: Option<&'a str>,
    ) -> BoxFuture<'a, Result<Vec<SessionDescriptor>, Self::Error>>;
    fn activate<'a>(&'a mut self, session_id: &'a str) -> BoxFuture<'a, Result<(), Self::Error>>;
    fn get_active<'a>(
        &'a mut self,
        project_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<SessionDescriptor>, Self::Error>>;
}
