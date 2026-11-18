//! Agent/team/thread orchestration and turn ownership belong here.
//! Services own persisted records; coordination owns active task lifecycles.
//! Bounded mailboxes and explicit cancellation are required. Coordination remains unported.
