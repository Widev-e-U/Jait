//! Unmounted, in-memory bookkeeping for bounded consent continuation.
//!
//! This module does not authenticate users, scan queues, claim requests, or run
//! effects. A host must authorize every call and capture the exclusive boundary
//! under the same authority/queue discipline as its eventual claims. Returned
//! windows alone confer no authority. State is volatile: a restart makes any
//! dispatched work indeterminate, so this is not a durable replay guarantee.
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

const MAX_OPERATIONS: usize = 256;
const MAX_FIELD_BYTES: usize = 512;
const MAX_SCAN_ENTRIES: usize = 128;
const MAX_IDS: usize = 128;
const MAX_RESULT_BYTES: usize = 16 * 1024;
const MAX_LIFETIME: Duration = Duration::from_secs(300);

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Intent {
    SessionOverride,
    Notification { origin_request_id: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Binding {
    pub principal: String,
    pub session: String,
    pub intent: Intent,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct StepResult {
    /// First sequence not examined; boundary is exclusive.
    pub next_cursor: u64,
    /// Number of queue entries examined by the scanner, including expired entries.
    pub scanned_entries: usize,
    pub request_ids: Vec<String>,
    pub complete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Window {
    pub cursor: u64,
    pub boundary: u64,
    /// The trusted scanner must stop at this many examined entries.
    pub max_scan_entries: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Begin {
    Execute(Window),
    Replay(StepResult),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Invalid,
    Capacity,
    Duplicate,
    NotFound,
    Unauthorized,
    Expired,
    Busy,
    OutOfOrder,
    Complete,
    Indeterminate,
}

struct Operation {
    binding: Binding,
    expires: Instant,
    boundary: u64,
    cursor: u64,
    next_step: u64,
    in_flight: bool,
    indeterminate: bool,
    complete: bool,
    // Only the latest result is retained; older replay requests fail closed.
    last: Option<(u64, StepResult)>,
}

#[derive(Default)]
pub(crate) struct ConsentBatchOperations {
    operations: HashMap<String, Operation>,
}

fn valid_field(s: &str) -> bool {
    !s.trim().is_empty() && s.len() <= MAX_FIELD_BYTES
}
fn valid_binding(binding: &Binding) -> bool {
    valid_field(&binding.principal)
        && valid_field(&binding.session)
        && binding
            .reason
            .as_ref()
            .is_none_or(|s| s.len() <= MAX_FIELD_BYTES)
        && match &binding.intent {
            Intent::SessionOverride => true,
            Intent::Notification { origin_request_id } => valid_field(origin_request_id),
        }
}

impl ConsentBatchOperations {
    /// IDs must be generated uniquely and unguessably by the host and never
    /// reused, including after expiry or process restart. `boundary` is the
    /// manager's exclusive next sequence, captured at operation creation.
    pub(crate) fn create(
        &mut self,
        id: String,
        binding: Binding,
        boundary: u64,
        now: Instant,
        lifetime: Duration,
    ) -> Result<(), Error> {
        if !valid_field(&id)
            || !valid_binding(&binding)
            || lifetime.is_zero()
            || lifetime > MAX_LIFETIME
        {
            return Err(Error::Invalid);
        }
        let expires = now.checked_add(lifetime).ok_or(Error::Invalid)?;
        // Do not turn an immediate retry of an expired ID into a new operation.
        // The host must still prevent reuse after cleanup or restart.
        if self.operations.contains_key(&id) {
            return Err(Error::Duplicate);
        }
        // Retain in-flight operations even after expiry: their effects may still
        // settle, and forgetting them would make their outcome ambiguous.
        self.operations
            .retain(|_, op| op.in_flight || now < op.expires);
        if self.operations.len() >= MAX_OPERATIONS {
            return Err(Error::Capacity);
        }
        self.operations.insert(
            id,
            Operation {
                binding,
                expires,
                boundary,
                cursor: 0,
                next_step: 0,
                in_flight: false,
                indeterminate: false,
                complete: false,
                last: None,
            },
        );
        Ok(())
    }

    /// Binding equality is a confused-deputy guard, not authentication. The host
    /// must independently authorize before every call, including replay.
    pub(crate) fn begin(
        &mut self,
        id: &str,
        binding: &Binding,
        step: u64,
        now: Instant,
    ) -> Result<Begin, Error> {
        let op = self.operations.get_mut(id).ok_or(Error::NotFound)?;
        if &op.binding != binding {
            return Err(Error::Unauthorized);
        }
        if now >= op.expires {
            return Err(Error::Expired);
        }
        if op.indeterminate {
            return Err(Error::Indeterminate);
        }
        if op.in_flight {
            return Err(Error::Busy);
        }
        if let Some((last_step, result)) = &op.last
            && step == *last_step
        {
            return Ok(Begin::Replay(result.clone()));
        }
        if step != op.next_step {
            return Err(Error::OutOfOrder);
        }
        if op.complete {
            return Err(Error::Complete);
        }
        op.in_flight = true;
        Ok(Begin::Execute(Window {
            cursor: op.cursor,
            boundary: op.boundary,
            max_scan_entries: MAX_SCAN_ENTRIES,
        }))
    }

    /// Called only after the host has finalized every effect and established a
    /// truthful bounded result. Invalid input poisons the operation: work may
    /// already have happened and must not be dispatched again.
    pub(crate) fn finish(
        &mut self,
        id: &str,
        binding: &Binding,
        step: u64,
        result: StepResult,
    ) -> Result<(), Error> {
        let op = self.operations.get_mut(id).ok_or(Error::NotFound)?;
        if &op.binding != binding {
            return Err(Error::Unauthorized);
        }
        if !op.in_flight || step != op.next_step {
            return Err(Error::OutOfOrder);
        }
        let bytes = result
            .request_ids
            .iter()
            .try_fold(0usize, |n, s| n.checked_add(s.len()));
        let ids_unique = result.request_ids.len() <= MAX_IDS
            && result.request_ids.iter().collect::<HashSet<_>>().len() == result.request_ids.len();
        let valid = result.next_cursor >= op.cursor
            && result.next_cursor <= op.boundary
            && (result.complete == (result.next_cursor == op.boundary))
            && (result.complete || result.next_cursor > op.cursor)
            && result.scanned_entries <= MAX_SCAN_ENTRIES
            // A scanner examines each sequence at most once. It can skip gaps
            // without scanning, but only a completed scan may advance through
            // an entirely empty remainder.
            && (result.scanned_entries as u64) <= result.next_cursor.saturating_sub(op.cursor)
            && (result.complete || result.scanned_entries > 0)
            && result.request_ids.len() <= result.scanned_entries
            && result.request_ids.len() <= MAX_IDS
            && ids_unique
            && result.request_ids.iter().all(|s| valid_field(s))
            && bytes.is_some_and(|n| n <= MAX_RESULT_BYTES)
            && op.next_step.checked_add(1).is_some();
        op.in_flight = false;
        if !valid {
            op.indeterminate = true;
            return Err(Error::Indeterminate);
        }
        op.cursor = result.next_cursor;
        op.complete = result.complete;
        op.last = Some((step, result));
        op.next_step += 1;
        Ok(())
    }

    /// Use when a dispatched step cannot establish its effects. Never retry it.
    pub(crate) fn mark_indeterminate(
        &mut self,
        id: &str,
        binding: &Binding,
        step: u64,
    ) -> Result<(), Error> {
        let op = self.operations.get_mut(id).ok_or(Error::NotFound)?;
        if &op.binding != binding {
            return Err(Error::Unauthorized);
        }
        if !op.in_flight || step != op.next_step {
            return Err(Error::OutOfOrder);
        }
        op.in_flight = false;
        op.indeterminate = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding() -> Binding {
        Binding {
            principal: "user".into(),
            session: "session".into(),
            intent: Intent::SessionOverride,
            reason: None,
        }
    }
    fn create(ops: &mut ConsentBatchOperations, id: &str, boundary: u64, now: Instant) {
        ops.create(id.into(), binding(), boundary, now, Duration::from_secs(30))
            .unwrap();
    }
    fn result(cursor: u64, complete: bool, ids: &[&str]) -> StepResult {
        StepResult {
            next_cursor: cursor,
            scanned_entries: ids.len(),
            complete,
            request_ids: ids.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn independent_windows_replay_and_order_are_bounded_by_snapshot() {
        let now = Instant::now();
        let mut ops = ConsentBatchOperations::default();
        create(&mut ops, "a", 10, now);
        create(&mut ops, "b", 20, now);
        assert_eq!(
            ops.begin("a", &binding(), 0, now),
            Ok(Begin::Execute(Window {
                cursor: 0,
                boundary: 10,
                max_scan_entries: MAX_SCAN_ENTRIES,
            }))
        );
        assert_eq!(ops.begin("a", &binding(), 0, now), Err(Error::Busy));
        assert_eq!(
            ops.begin("b", &binding(), 0, now),
            Ok(Begin::Execute(Window {
                cursor: 0,
                boundary: 20,
                max_scan_entries: MAX_SCAN_ENTRIES,
            }))
        );
        ops.finish("a", &binding(), 0, result(5, false, &["one"]))
            .unwrap();
        assert_eq!(
            ops.begin("a", &binding(), 0, now),
            Ok(Begin::Replay(result(5, false, &["one"])))
        );
        assert_eq!(ops.begin("a", &binding(), 2, now), Err(Error::OutOfOrder));
        assert_eq!(
            ops.begin("a", &binding(), 1, now),
            Ok(Begin::Execute(Window {
                cursor: 5,
                boundary: 10,
                max_scan_entries: MAX_SCAN_ENTRIES,
            }))
        );
        ops.finish("a", &binding(), 1, result(10, true, &[]))
            .unwrap();
        assert_eq!(ops.begin("a", &binding(), 0, now), Err(Error::OutOfOrder));
        assert_eq!(
            ops.begin("a", &binding(), 1, now),
            Ok(Begin::Replay(result(10, true, &[])))
        );
        assert_eq!(ops.begin("a", &binding(), 2, now), Err(Error::Complete));
    }

    #[test]
    fn impossible_scan_progress_poisoned_without_retry() {
        let now = Instant::now();
        for invalid in [
            StepResult {
                next_cursor: 1,
                scanned_entries: 2,
                request_ids: vec![],
                complete: false,
            },
            StepResult {
                next_cursor: 2,
                scanned_entries: 0,
                request_ids: vec![],
                complete: false,
            },
        ] {
            let mut ops = ConsentBatchOperations::default();
            create(&mut ops, "a", 5, now);
            ops.begin("a", &binding(), 0, now).unwrap();
            assert_eq!(
                ops.finish("a", &binding(), 0, invalid),
                Err(Error::Indeterminate)
            );
            assert_eq!(
                ops.begin("a", &binding(), 0, now),
                Err(Error::Indeterminate)
            );
        }
        // An empty remainder can legitimately skip straight to the boundary.
        let mut ops = ConsentBatchOperations::default();
        create(&mut ops, "b", 5, now);
        ops.begin("b", &binding(), 0, now).unwrap();
        ops.finish(
            "b",
            &binding(),
            0,
            StepResult {
                next_cursor: 5,
                scanned_entries: 0,
                request_ids: vec![],
                complete: true,
            },
        )
        .unwrap();
    }

    #[test]
    fn binding_expiry_and_uncertain_effects_fail_closed() {
        let now = Instant::now();
        let mut ops = ConsentBatchOperations::default();
        create(&mut ops, "a", 5, now);
        let mut other = binding();
        other.principal = "other".into();
        assert_eq!(ops.begin("a", &other, 0, now), Err(Error::Unauthorized));
        assert!(matches!(
            ops.begin("a", &binding(), 0, now),
            Ok(Begin::Execute(_))
        ));
        ops.mark_indeterminate("a", &binding(), 0).unwrap();
        assert_eq!(
            ops.begin("a", &binding(), 0, now),
            Err(Error::Indeterminate)
        );
        assert_eq!(
            ops.begin("a", &binding(), 0, now + Duration::from_secs(30)),
            Err(Error::Expired)
        );
    }

    #[test]
    fn invalid_completion_poisoned_instead_of_retried() {
        let now = Instant::now();
        for bad in [
            result(0, false, &[]),
            result(6, true, &[]),
            result(3, true, &[]),
            result(3, false, &["a", "a"]),
        ] {
            let mut ops = ConsentBatchOperations::default();
            create(&mut ops, "a", 5, now);
            ops.begin("a", &binding(), 0, now).unwrap();
            assert_eq!(
                ops.finish("a", &binding(), 0, bad),
                Err(Error::Indeterminate)
            );
            assert_eq!(
                ops.begin("a", &binding(), 0, now),
                Err(Error::Indeterminate)
            );
        }
    }

    #[test]
    fn quotas_keep_in_flight_expired_operations_and_allow_other_expiry_cleanup() {
        let now = Instant::now();
        let mut ops = ConsentBatchOperations::default();
        for i in 0..MAX_OPERATIONS {
            create(&mut ops, &i.to_string(), 1, now);
        }
        assert_eq!(
            ops.create("extra".into(), binding(), 1, now, Duration::from_secs(1)),
            Err(Error::Capacity)
        );
        ops.begin("0", &binding(), 0, now).unwrap();
        ops.create(
            "extra".into(),
            binding(),
            1,
            now + Duration::from_secs(30),
            Duration::from_secs(1),
        )
        .unwrap();
        assert!(ops.operations.contains_key("0"));
        assert!(!ops.operations.contains_key("1"));
    }

    #[test]
    fn expired_id_retry_cannot_replace_an_uncertain_operation() {
        let now = Instant::now();
        let mut ops = ConsentBatchOperations::default();
        create(&mut ops, "a", 5, now);
        ops.begin("a", &binding(), 0, now).unwrap();
        ops.mark_indeterminate("a", &binding(), 0).unwrap();
        let expired = now + Duration::from_secs(30);
        assert_eq!(
            ops.create("a".into(), binding(), 5, expired, Duration::from_secs(1)),
            Err(Error::Duplicate)
        );
        assert_eq!(ops.begin("a", &binding(), 0, expired), Err(Error::Expired));
    }

    #[test]
    fn scan_budget_and_claim_count_are_checked_before_replay() {
        let now = Instant::now();
        for (scanned, ids) in [
            (MAX_SCAN_ENTRIES + 1, vec![]),
            (0, vec!["claimed".to_string()]),
        ] {
            let mut ops = ConsentBatchOperations::default();
            create(&mut ops, "a", 10, now);
            ops.begin("a", &binding(), 0, now).unwrap();
            let bad = StepResult {
                next_cursor: 5,
                scanned_entries: scanned,
                request_ids: ids,
                complete: false,
            };
            assert_eq!(
                ops.finish("a", &binding(), 0, bad),
                Err(Error::Indeterminate)
            );
            assert_eq!(
                ops.begin("a", &binding(), 0, now),
                Err(Error::Indeterminate)
            );
        }
        let mut ops = ConsentBatchOperations::default();
        create(&mut ops, "a", MAX_SCAN_ENTRIES as u64 + 1, now);
        ops.begin("a", &binding(), 0, now).unwrap();
        let expired_only = StepResult {
            next_cursor: MAX_SCAN_ENTRIES as u64,
            scanned_entries: MAX_SCAN_ENTRIES,
            request_ids: vec![],
            complete: false,
        };
        ops.finish("a", &binding(), 0, expired_only.clone())
            .unwrap();
        assert_eq!(
            ops.begin("a", &binding(), 0, now),
            Ok(Begin::Replay(expired_only))
        );
    }

    #[test]
    fn notification_binding_and_empty_snapshot() {
        let now = Instant::now();
        let mut ops = ConsentBatchOperations::default();
        let b = Binding {
            intent: Intent::Notification {
                origin_request_id: "origin".into(),
            },
            ..binding()
        };
        ops.create("n".into(), b.clone(), 0, now, Duration::from_secs(1))
            .unwrap();
        assert_eq!(ops.begin("n", &binding(), 0, now), Err(Error::Unauthorized));
        assert_eq!(
            ops.begin("n", &b, 0, now),
            Ok(Begin::Execute(Window {
                cursor: 0,
                boundary: 0,
                max_scan_entries: MAX_SCAN_ENTRIES,
            }))
        );
        ops.finish("n", &b, 0, result(0, true, &[])).unwrap();
    }
}
