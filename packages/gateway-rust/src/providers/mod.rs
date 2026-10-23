//! Model/provider protocols and capabilities belong here, behind a common stream API.
//! Reuse pooled HTTP clients; use local protocol peers for deterministic acceptance.
//! Provider adapters and outbound clients remain unported.

pub mod acp_terminal;
pub mod jait_mcp;
pub mod registry;
pub mod todo_result;

pub mod opencode_credentials;
pub mod snapshot;

pub mod provider_auth;

pub mod pi_mcp_provision;

pub mod codex_event_mapper;

pub mod usage;

pub mod acp_registry;

pub mod acp_binary_launcher;

pub mod model_fetchers;

pub mod remote_cli;

pub mod openai_stream;

pub mod context_control;
