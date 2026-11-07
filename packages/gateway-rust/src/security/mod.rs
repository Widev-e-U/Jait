pub mod agent_sandbox_owner;
pub mod control_access;
pub mod http_auth;
pub mod ownership;
pub mod preview_token;
pub mod request_origin;
pub mod ssrf_guard;
pub mod trust_engine;
pub mod worktree_sandbox;
pub mod ws_verifier;

pub mod assessment_lease;
pub mod trust_worker;

pub mod path_guard;

pub mod contracts;

pub mod tool_permissions;

pub mod consent_manager;
// Staged bookkeeping only; it grants no authority and has no route integration.
#[allow(dead_code)]
pub(crate) mod consent_batch_operation;
// Staged consent-replay surface: the store and lifecycle are not yet wired to
// request handling, so their items are dead code by construction.
#[allow(dead_code)]
pub(crate) mod consent_replay;
#[allow(dead_code)]
pub(crate) mod consent_replay_lifecycle;
#[allow(dead_code)]
pub(crate) mod consent_replay_store;

pub mod tool_profiles;

pub mod consent_executor;

pub mod sandbox_background_process;

pub mod sandbox_manager;

pub mod engines;
pub mod host_software;
pub mod index;
pub mod protocols;
