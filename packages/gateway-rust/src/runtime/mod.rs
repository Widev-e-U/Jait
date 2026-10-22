//! Process lifecycle and bounded work. Domain services do not own the runtime.
pub mod blocking;
mod server;

pub use server::Gateway;

pub mod command;

pub mod application;

pub mod chat_turn;

pub mod chat_store;

#[cfg(test)]
mod chat_flow_tests;

pub mod chat_sessions;

pub mod chat_projection;

pub mod chat_config;

pub mod chat_events;

#[cfg(test)]
mod chat_application_tests;
