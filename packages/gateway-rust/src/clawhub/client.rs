//! ClawHub client entry point.
//!
//! The skills integration owns the canonical implementation and effect boundary.
//! Re-export it here so callers share its admission, SSRF, cancellation and archive
//! protections instead of introducing a second outbound client.
pub use crate::integrations::clawhub::{
    ArchiveFile, ClawHubClient, ClawHubSearchResult, ClawHubSkillDetail, ClawHubSkillList,
    ClawHubVersion, DEFAULT_REGISTRY, MAX_API_BYTES, MAX_ARCHIVE_BYTES, MAX_ARCHIVE_ENTRIES,
    MAX_DOWNLOAD_BYTES, SkillSort, decode_zip, validate_slug,
};
