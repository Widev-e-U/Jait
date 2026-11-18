//! Public source declarations. Unknown legacy storage scopes stay in entries.rs,
//! and cannot be promoted into this closed public scope without validation.
pub use super::entries::MemorySource;
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryScope {
    Project,
    Contact,
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
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMemoryInput {
    pub scope: MemoryScope,
    pub content: String,
    pub source: MemorySource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}
/// A Date argument, not a JSON timestamp string. JS permits invalid dates and
/// non-finite construction inputs; the owning engine decides how to use them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MemoryDate {
    millis: Option<i64>,
}
impl MemoryDate {
    pub fn from_millis(value: f64) -> Self {
        Self {
            millis: if value.is_finite() && value.abs() <= 8_640_000_000_000_000.0 {
                Some(value.trunc() as i64)
            } else {
                None
            },
        }
    }
    pub fn millis(self) -> Option<i64> {
        self.millis
    }
}
impl Serialize for MemoryDate {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.millis
            .map(|ms| crate::time::iso(ms).expect("TimeClip date"))
            .serialize(serializer)
    }
}
#[derive(Clone, Debug)]
pub struct SearchMemoryInput {
    pub query: String,
    pub scope: Option<MemoryScope>,
    pub limit: Option<f64>,
    pub now: Option<MemoryDate>,
}
pub trait MemoryBackend {
    type Error;
    fn save(&mut self, entry: MemoryEntry) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn update(&mut self, entry: MemoryEntry) -> BoxFuture<'_, Result<(), Self::Error>>;
    fn list(
        &mut self,
        scope: Option<MemoryScope>,
    ) -> BoxFuture<'_, Result<Vec<MemoryEntry>, Self::Error>>;
    fn forget<'a>(&'a mut self, id: &'a str) -> BoxFuture<'a, Result<bool, Self::Error>>;
    fn forget_expired(
        &mut self,
        now: Option<MemoryDate>,
    ) -> BoxFuture<'_, Result<f64, Self::Error>>;
}
pub trait MemoryService {
    type Error;
    fn save(&mut self, entry: SaveMemoryInput) -> BoxFuture<'_, Result<MemoryEntry, Self::Error>>;
    fn list(
        &mut self,
        scope: Option<MemoryScope>,
    ) -> BoxFuture<'_, Result<Vec<MemoryEntry>, Self::Error>>;
    fn search<'a>(
        &'a mut self,
        query: &'a str,
        limit: Option<f64>,
        scope: Option<MemoryScope>,
    ) -> BoxFuture<'a, Result<Vec<MemoryEntry>, Self::Error>>;
    fn forget<'a>(&'a mut self, id: &'a str) -> BoxFuture<'a, Result<bool, Self::Error>>;
    fn forget_expired(
        &mut self,
        now: Option<MemoryDate>,
    ) -> BoxFuture<'_, Result<f64, Self::Error>>;
    fn flush_pre_compaction<'a>(
        &'a mut self,
        session_id: &'a str,
        snippets: Vec<String>,
    ) -> BoxFuture<'a, Result<f64, Self::Error>>;
}
impl From<MemoryEntry> for super::entries::MemoryEntry {
    fn from(entry: MemoryEntry) -> Self {
        Self {
            id: entry.id,
            scope: match entry.scope {
                MemoryScope::Project => super::entries::MemoryScope::Project,
                MemoryScope::Contact => super::entries::MemoryScope::Contact,
            },
            content: entry.content,
            source: entry.source,
            created_at: entry.created_at,
            updated_at: entry.updated_at,
            expires_at: entry.expires_at,
        }
    }
}
impl TryFrom<super::entries::MemoryEntry> for MemoryEntry {
    type Error = String;
    fn try_from(entry: super::entries::MemoryEntry) -> Result<Self, Self::Error> {
        let scope = match entry.scope {
            super::entries::MemoryScope::Project => MemoryScope::Project,
            super::entries::MemoryScope::Contact => MemoryScope::Contact,
            super::entries::MemoryScope::Other(value) => {
                return Err(format!("unknown public memory scope: {value}"));
            }
        };
        Ok(Self {
            id: entry.id,
            scope,
            content: entry.content,
            source: entry.source,
            created_at: entry.created_at,
            updated_at: entry.updated_at,
            expires_at: entry.expires_at,
        })
    }
}

impl From<SaveMemoryInput> for super::engine::SaveMemoryInput {
    fn from(input: SaveMemoryInput) -> Self {
        Self {
            scope: match input.scope {
                MemoryScope::Project => super::entries::MemoryScope::Project,
                MemoryScope::Contact => super::entries::MemoryScope::Contact,
            },
            content: input.content,
            source: input.source,
            expires_at: input.expires_at,
        }
    }
}
