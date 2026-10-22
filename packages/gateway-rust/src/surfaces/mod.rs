//! Managed surfaces, static assets and preview lifecycle belong here.
//! Preserve path/origin/ownership boundaries; stream large assets instead of copying them.
//! Frontend hosting and surface management remain unported.
pub mod registry;
pub mod terminal_output;

pub mod contracts;

pub mod filesystem;

pub mod remote_filesystem;
