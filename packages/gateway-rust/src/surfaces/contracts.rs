//! Public surface declarations, with primitive-only metadata and optional callback slots.
pub use super::registry::{SurfaceStartInput, SurfaceState};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SurfaceMetadataValue {
    Text(String),
    Number(serde_json::Number),
    Boolean(bool),
    Null,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SurfaceStopInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceSnapshot {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub state: SurfaceState,
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    pub metadata: HashMap<String, SurfaceMetadataValue>,
}
pub type OutputCallback = Arc<dyn Fn(String) + Send + Sync>;
pub type StateChangeCallback = Arc<dyn Fn(SurfaceState) + Send + Sync>;
#[derive(Default)]
pub struct SurfaceCallbacks {
    pub on_output: Option<OutputCallback>,
    pub on_state_change: Option<StateChangeCallback>,
}
pub trait Surface: Send + Sync {
    type Error;
    fn id(&self) -> &str;
    fn kind(&self) -> &str;
    fn state(&self) -> SurfaceState;
    fn session_id(&self) -> Option<&str>;
    fn start(&mut self, input: SurfaceStartInput) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn stop(&mut self, input: Option<SurfaceStopInput>) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn snapshot(&self) -> Result<SurfaceSnapshot, Self::Error>;
    fn callbacks(&mut self) -> &mut SurfaceCallbacks;
}
pub trait SurfaceFactory {
    type Surface: Surface;
    fn kind(&self) -> &str;
    fn create(&self, id: &str) -> Result<Self::Surface, <Self::Surface as Surface>::Error>;
}
impl TryFrom<super::registry::SurfaceSnapshot> for SurfaceSnapshot {
    type Error = serde_json::Error;
    fn try_from(snapshot: super::registry::SurfaceSnapshot) -> Result<Self, Self::Error> {
        serde_json::from_value(serde_json::to_value(snapshot)?)
    }
}
