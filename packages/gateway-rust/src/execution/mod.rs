//! Tool dispatch, child processes, PTY, filesystem and OS execution belong here.
//! Require validated policy/consent before effects; bound output and reap descendants.
//! Generic execution does not grant assessment scope. Execution remains unported.

// Candidate lifecycle only; no runtime or effect authority is registered here.
#[allow(dead_code)]
pub(crate) mod desktop_host_config;
// Candidate desktop lifecycle remains unconnected until runtime composition.
#[allow(dead_code)]
pub(crate) mod desktop_parent_pipe;

pub mod command_timeout;
pub mod command_wait;
pub mod completion_output;
pub mod shell_prompt;

#[cfg(unix)]
pub mod local_deploy;

pub mod process_runner;

pub mod command_syntax;

pub mod smoke_process;

// Staged runtime surface: no runtime caller is wired up yet, so its internal
// helpers are dead code by construction. Remove this allow once execution
// dispatch uses it. The module itself is `pub` so the contract crate can link
// its public surface; a `pub(crate)` module is unreachable from a consumer
// crate (E0603) and blocks contract evidence for bin/matrix-stack.mjs.
#[allow(dead_code)]
pub mod matrix_stack;
