//! Mail/calendar/channels, browser, plugins and voice adapter boundaries belong here.
//! Add each adapter's dependencies only with its real native protocol implementation.
//! No gateway TypeScript sidecar. Native integrations remain unported.

pub mod channel_assistant;
pub mod channel_contracts;
pub mod os_control;
