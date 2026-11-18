//! Bounded retry policy for a caller-owned desktop smoke directory.
//!
//! This module has no filesystem authority. The caller must provide an operation
//! bound to the explicitly created temporary directory, with race-resistant
//! path and symlink handling on its platform. In particular, validating a path
//! and then recursively deleting by name is not sufficient when an attacker can
//! replace an ancestor or entry. No production adapter is supplied here.
use std::{io, time::Duration};

pub const BACKOFF: [Duration; 6] = [
    Duration::from_millis(100),
    Duration::from_millis(250),
    Duration::from_millis(500),
    Duration::from_millis(1000),
    Duration::from_millis(2000),
    Duration::from_millis(3000),
];

/// Authority supplied by the owner of one explicit temporary directory.
/// `remove` must never follow a symlink outside that directory, including if
/// entries or ancestors change concurrently. It must treat an absent directory
/// as success. The implementation owns all platform-specific safety guarantees.
pub trait ScopedCleanup {
    fn remove(&mut self) -> io::Result<()>;
    /// Human-readable identity for the final warning; never used for deletion.
    fn scope_label(&self) -> &str;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CleanupOutcome {
    Removed,
    /// The final error was passed to the warning callback; it is nonfatal.
    Warned,
    Cancelled,
}

/// Retry every error as in the reference, warning once after the seventh failure.
/// `wait` returns false when cancellation interrupts a delay. `cancelled` is
/// checked before each attempt, including the first. A running `remove` is not
/// interruptible here; the caller must bound it and must not detach work on
/// cancellation. Warning delivery is owned by the caller.
pub fn cleanup(
    scope: &mut impl ScopedCleanup,
    mut cancelled: impl FnMut() -> bool,
    mut wait: impl FnMut(Duration) -> bool,
    mut warn: impl FnMut(&str, &io::Error),
) -> CleanupOutcome {
    for attempt in 0..=BACKOFF.len() {
        if cancelled() {
            return CleanupOutcome::Cancelled;
        }
        match scope.remove() {
            Ok(()) => return CleanupOutcome::Removed,
            Err(error) if attempt == BACKOFF.len() => {
                warn(scope.scope_label(), &error);
                return CleanupOutcome::Warned;
            }
            Err(_) => {
                if !wait(BACKOFF[attempt]) {
                    return CleanupOutcome::Cancelled;
                }
            }
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake {
        failures: usize,
        calls: usize,
    }
    impl ScopedCleanup for Fake {
        fn remove(&mut self) -> io::Result<()> {
            self.calls += 1;
            if self.calls <= self.failures {
                Err(io::Error::other("busy"))
            } else {
                Ok(())
            }
        }
        fn scope_label(&self) -> &str {
            "owned smoke directory"
        }
    }

    #[test]
    fn retries_with_reference_delays_and_warns_once() {
        let mut scope = Fake {
            failures: 7,
            calls: 0,
        };
        let mut delays = Vec::new();
        let mut warnings = Vec::new();
        let result = cleanup(
            &mut scope,
            || false,
            |d| {
                delays.push(d);
                true
            },
            |label, error| warnings.push((label.to_owned(), error.to_string())),
        );
        assert_eq!(result, CleanupOutcome::Warned);
        assert_eq!(scope.calls, 7);
        assert_eq!(delays, BACKOFF);
        assert_eq!(
            warnings,
            vec![("owned smoke directory".to_owned(), "busy".to_owned())]
        );
    }

    #[test]
    fn success_and_cancellation_stop_further_attempts() {
        let mut scope = Fake {
            failures: 2,
            calls: 0,
        };
        let mut waits = 0;
        let result = cleanup(
            &mut scope,
            || false,
            |_| {
                waits += 1;
                true
            },
            |_, _| panic!("unexpected warning"),
        );
        assert_eq!(result, CleanupOutcome::Removed);
        assert_eq!((scope.calls, waits), (3, 2));
        let mut scope = Fake {
            failures: 7,
            calls: 0,
        };
        assert_eq!(
            cleanup(
                &mut scope,
                || false,
                |_| false,
                |_, _| panic!("unexpected warning")
            ),
            CleanupOutcome::Cancelled
        );
        assert_eq!(scope.calls, 1);
        assert_eq!(
            cleanup(
                &mut scope,
                || true,
                |_| panic!("unexpected wait"),
                |_, _| panic!("unexpected warning")
            ),
            CleanupOutcome::Cancelled
        );
        assert_eq!(scope.calls, 1);
    }
}
