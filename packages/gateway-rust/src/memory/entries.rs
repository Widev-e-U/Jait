//! Native memory records. Unknown imported scope strings remain data, not authority.
use serde::{Deserialize, Deserializer, Serialize, Serializer};
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MemoryScope {
    Project,
    Contact,
    Other(String),
}
impl MemoryScope {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Project => "project",
            Self::Contact => "contact",
            Self::Other(value) => value,
        }
    }
}
impl Serialize for MemoryScope {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}
impl<'de> Deserialize<'de> for MemoryScope {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match String::deserialize(deserializer)?.as_str() {
            "project" => Self::Project,
            "contact" => Self::Contact,
            value => Self::Other(value.into()),
        })
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemorySource {
    #[serde(rename = "type")]
    pub kind: String,
    pub id: String,
    pub surface: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub id: String,
    pub scope: MemoryScope,
    pub content: String,
    pub source: MemorySource,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}
/// Synchronous native storage is invoked on the bounded database worker.
/// Explicit `now` values are canonical UTC ISO strings, after native date decoding.
pub trait MemoryBackend {
    type Error;
    fn save(&self, entry: &MemoryEntry) -> Result<(), Self::Error>;
    fn update(&self, entry: &MemoryEntry) -> Result<(), Self::Error>;
    fn list(&self, scope: Option<&MemoryScope>) -> Result<Vec<MemoryEntry>, Self::Error>;
    fn forget(&self, id: &str) -> Result<bool, Self::Error>;
    fn forget_expired(&self, now: Option<&str>) -> Result<usize, Self::Error>;
}
