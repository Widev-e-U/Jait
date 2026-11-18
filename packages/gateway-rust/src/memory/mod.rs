//! Caller-scoped memory storage, ranking, replacement and fact extraction.
//! Provider injection and HTTP/tool authorization remain separate migration work.
pub mod engine;
pub mod entries;
pub mod scoring;
pub mod sqlite_backend;

pub mod contracts;
