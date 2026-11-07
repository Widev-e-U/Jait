//! Internal channel coordination drafts; not wired to the gateway runtime.
#![allow(dead_code)]
mod consent_claim;
#[cfg(test)]
mod consent_claim_tests;
mod session_ownership;

mod manager_pipeline;
