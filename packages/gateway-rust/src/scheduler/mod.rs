//! Durable job scheduling with SQLite state and explicit Tokio timer lifecycle.
//! Dispatch adapters revalidate authorization and expiry on each run.
//! Database operations never span external tool execution.

pub mod contracts;
pub mod cron;
pub mod hooks;
pub mod minute;
pub mod service;
