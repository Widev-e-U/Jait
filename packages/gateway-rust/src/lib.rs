//! Native gateway. See docs/gateway-rust-architecture.md for ownership and stack decisions.
//! Reserved domain modules define boundaries; they do not represent migrated features.
//!
//! `result_large_err` is allowed crate-wide: axum handlers return `Response`
//! directly, and helper functions carry that same type in their `Err` variant.
#![allow(clippy::result_large_err)]
pub mod app_config;
pub mod assessments;
pub mod bundle_web;
mod channels;
pub mod config;
pub mod contracts;
pub mod coordination;
pub mod copy_shell_integration;
pub mod db;
// Compiled in the lib as well as through src/bin/jait-embed-shell-integration.rs,
// so the contract crate can link the asset generator instead of it existing
// only behind a bin-local `#[path]` include.
pub mod embed_shell_integration;
pub mod evaluation;
pub mod execution;
pub mod health;
pub mod integrations;
pub mod memory;
pub mod network_scan;
pub mod nodes;
pub mod observability;
pub mod os_control;
pub mod packaging;
pub mod providers;
pub mod routes;
pub mod runtime;
pub mod scheduler;
pub mod security;
pub mod services;
pub mod state_directory;
pub mod surfaces;
mod text;
pub mod tools;
pub mod transport;
pub mod update;
pub mod ws;
pub mod ws_user_authority;

// Preserve the public API used by the existing native acceptance suite.
pub use runtime::Gateway;
pub const VERSION: &str = env!("JAIT_GATEWAY_VERSION");

pub mod time;

pub mod prompts;

pub mod identifiers;
pub mod plugins;

pub mod context_overhead;

pub mod sessions;

pub mod cli_args;
pub mod cli_doctor;

pub mod voice;

pub mod voice_assistant;

pub mod pty_broker_client;
