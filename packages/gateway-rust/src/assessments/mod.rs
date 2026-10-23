//! Typed scoped assessment engines, evidence, findings and verification belong here.
//! Enforce targets, exclusions, methods, expiry, vantage and execution budgets in code.
//! Preserve generic SSRF guards; raw evidence is untrusted. Assessment adapters remain unported.

pub mod scope;

pub mod service;
pub mod store;

pub mod workbench;
pub mod workbench_engines;
pub mod workbench_policy;
pub mod workbench_store;
