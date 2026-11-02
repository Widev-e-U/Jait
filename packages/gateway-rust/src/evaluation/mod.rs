//! Evaluation support (native port of `packages/gateway/src/evaluation/*`).

pub mod agent_eval;
pub mod agent_eval_execution;
pub mod isolated_gateway;

pub mod isolated_gateway_child;

// Compile the unregistered transport only for its focused draft tests.
#[cfg(test)]
mod agent_eval_chat;

// Linux capability primitives; runtime handoff and recovery are not yet wired.
#[cfg(target_os = "linux")]
pub mod cgroup_observation;
#[cfg(target_os = "linux")]
pub mod descriptor_transfer;
#[cfg(target_os = "linux")]
pub mod recovery;
