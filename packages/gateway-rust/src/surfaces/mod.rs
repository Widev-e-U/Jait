//! Managed surfaces, static assets and preview lifecycle belong here.
//! Preserve path/origin/ownership boundaries; stream large assets instead of copying them.
//! Frontend hosting and surface management remain unported.
pub mod registry;
pub mod shell_integration_assets;
pub mod terminal_output;

#[cfg(unix)]
pub mod local_terminal;

pub mod contracts;

pub mod filesystem;

pub mod remote_filesystem;

pub mod browser;

pub mod playwright_bridge;

pub mod remote_terminal;
