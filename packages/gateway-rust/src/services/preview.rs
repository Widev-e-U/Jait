//! Bounded preview session state and host-directed lifecycle.
//!
//! The host serializes access, authorizes and performs effects, cancels pending
//! work, and acknowledges cleanup. This module is not runtime wiring.
use std::collections::VecDeque;

pub const MAX_PREVIEW_LOGS: usize = 400;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewLogStream {
    Stdout,
    Stderr,
    System,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewLogEntry {
    pub id: u64,
    pub stream: PreviewLogStream,
    pub text: String,
    pub timestamp: String,
}

/// Shared across a service's sessions, as in the TypeScript implementation.
#[derive(Debug)]
pub struct PreviewLogIds {
    next: u64,
}

impl Default for PreviewLogIds {
    fn default() -> Self {
        Self { next: 1 }
    }
}

#[derive(Debug, Default)]
pub struct PreviewLogs {
    entries: VecDeque<PreviewLogEntry>,
}

// ECMAScript trimEnd whitespace, including BOM but excluding U+0085.
fn js_whitespace(c: char) -> bool {
    matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

impl PreviewLogs {
    /// Append nonempty lines and return whether `updatedAt` must be refreshed.
    /// Exhaustion fails before modifying either the buffer or ID sequence.
    pub fn append<F>(
        &mut self,
        ids: &mut PreviewLogIds,
        stream: PreviewLogStream,
        text: &str,
        mut now: F,
    ) -> Result<bool, &'static str>
    where
        F: FnMut() -> String,
    {
        // Removing CR before trimEnd is equivalent to trimming both from the
        // end, then filtering CR inside the retained line. Iterate twice to
        // check ID exhaustion without allocating a copy of the whole chunk.
        let lines = || {
            text.split('\n')
                .map(|line| line.trim_end_matches(|c| c == '\r' || js_whitespace(c)))
                .filter(|line| !line.is_empty())
        };
        let count = lines().count();
        if count == 0 {
            return Ok(false);
        }
        let next = ids
            .next
            .checked_add(u64::try_from(count).map_err(|_| "preview log ID exhausted")?)
            .ok_or("preview log ID exhausted")?;
        for line in lines() {
            self.entries.push_back(PreviewLogEntry {
                id: ids.next,
                stream,
                text: line.chars().filter(|c| *c != '\r').collect(),
                timestamp: now(),
            });
            ids.next += 1;
            if self.entries.len() > MAX_PREVIEW_LOGS {
                self.entries.pop_front();
            }
        }
        debug_assert_eq!(ids.next, next);
        Ok(true)
    }

    pub fn since(&self, since_id: u64) -> Vec<PreviewLogEntry> {
        self.entries
            .iter()
            .filter(|entry| entry.id > since_id)
            .cloned()
            .collect()
    }
}

/// The host must hold this owner behind one serialization boundary. Effects are
/// deliberately represented as instructions: possession of a session ID alone
/// does not authorize spawning a process or opening a browser.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PreviewStatus {
    Starting,
    Ready,
    Stopping,
    Stopped,
    Error,
}

/// Opaque generation identifies one start, including callbacks arriving late.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreviewGeneration(u64);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewResources {
    /// Host-owned opaque handles, never executable commands or URLs.
    pub runner: Option<String>,
    pub browser: Option<String>,
}

impl PreviewResources {
    fn empty() -> Self {
        Self {
            runner: None,
            browser: None,
        }
    }
}

#[derive(Debug)]
pub struct OwnedPreview {
    pub session_id: String,
    pub generation: PreviewGeneration,
    pub status: PreviewStatus,
    pub shared_with_agent: bool,
    pub last_error: Option<String>,
    pub logs: PreviewLogs,
    resources: PreviewResources,
    retain_error_after_cleanup: bool,
}

/// Instructions to the authorized host. Cancellation must be followed by
/// cleanup and `finish_stop`; a late successful start must also be cleaned up.
#[derive(Debug, PartialEq, Eq)]
pub enum PreviewAction {
    Start(PreviewGeneration),
    CancelAndCleanup {
        generation: PreviewGeneration,
        resources: PreviewResources,
    },
    CleanupLate(PreviewResources),
    None,
}

#[derive(Debug)]
pub struct PreviewOwner {
    sessions: std::collections::HashMap<String, OwnedPreview>,
    max_sessions: usize,
    next_generation: u64,
    pub log_ids: PreviewLogIds,
}

impl PreviewOwner {
    pub fn new(max_sessions: usize) -> Self {
        Self {
            sessions: Default::default(),
            max_sessions,
            next_generation: 1,
            log_ids: Default::default(),
        }
    }

    pub fn get(&self, session_id: &str) -> Option<&OwnedPreview> {
        self.sessions.get(session_id)
    }

    /// Caller must independently authorize the requested target and effects.
    /// Existing entries are not replaced until their cleanup is acknowledged.
    pub fn start(&mut self, session_id: &str, shared: bool) -> Result<PreviewAction, &'static str> {
        if session_id.is_empty() || session_id.len() > 1024 {
            return Err("invalid session ID");
        }
        if self.sessions.contains_key(session_id) {
            return Err("preview already exists");
        }
        if self.sessions.len() >= self.max_sessions {
            return Err("preview capacity reached");
        }
        let next = self
            .next_generation
            .checked_add(1)
            .ok_or("preview generation exhausted")?;
        let generation = PreviewGeneration(self.next_generation);
        self.next_generation = next;
        self.sessions.insert(
            session_id.to_owned(),
            OwnedPreview {
                session_id: session_id.to_owned(),
                generation,
                status: PreviewStatus::Starting,
                shared_with_agent: shared,
                last_error: None,
                logs: PreviewLogs::default(),
                resources: PreviewResources::empty(),
                retain_error_after_cleanup: false,
            },
        );
        Ok(PreviewAction::Start(generation))
    }

    /// On cancellation or replacement the host retains ownership of late handles.
    pub fn started(
        &mut self,
        session_id: &str,
        generation: PreviewGeneration,
        resources: PreviewResources,
    ) -> PreviewAction {
        match self.sessions.get_mut(session_id) {
            Some(session)
                if session.generation == generation
                    && session.status == PreviewStatus::Starting =>
            {
                session.resources = resources;
                session.status = PreviewStatus::Ready;
                PreviewAction::None
            }
            _ => PreviewAction::CleanupLate(resources),
        }
    }

    /// The host must include any acquired handles even when startup failed.
    pub fn failed(
        &mut self,
        session_id: &str,
        generation: PreviewGeneration,
        error: String,
        resources: PreviewResources,
    ) -> PreviewAction {
        match self.sessions.get_mut(session_id) {
            Some(session)
                if session.generation == generation
                    && session.status == PreviewStatus::Starting =>
            {
                session.last_error = Some(error);
                session.retain_error_after_cleanup = true;
                session.status = PreviewStatus::Stopping;
                PreviewAction::CancelAndCleanup {
                    generation,
                    resources,
                }
            }
            _ => PreviewAction::CleanupLate(resources),
        }
    }

    /// Record an unexpected process exit while retaining handles for a later stop.
    /// The host also appends the exit message as stderr, as in TypeScript.
    pub fn process_exited(
        &mut self,
        session_id: &str,
        generation: PreviewGeneration,
        error: String,
    ) -> bool {
        let Some(session) = self.sessions.get_mut(session_id) else {
            return false;
        };
        if session.generation != generation || session.status != PreviewStatus::Ready {
            return false;
        }
        session.status = PreviewStatus::Error;
        session.last_error = Some(error);
        true
    }

    pub fn stop(&mut self, session_id: &str) -> PreviewAction {
        match self.sessions.get_mut(session_id) {
            Some(session)
                if matches!(
                    session.status,
                    PreviewStatus::Starting | PreviewStatus::Ready | PreviewStatus::Error
                ) =>
            {
                session.retain_error_after_cleanup = false;
                session.status = PreviewStatus::Stopping;
                PreviewAction::CancelAndCleanup {
                    generation: session.generation,
                    resources: std::mem::replace(&mut session.resources, PreviewResources::empty()),
                }
            }
            // An explicit stop during failure cleanup supersedes retention of
            // the error session. The existing cleanup still owns its handles.
            Some(session) if session.status == PreviewStatus::Stopping => {
                session.retain_error_after_cleanup = false;
                PreviewAction::None
            }
            _ => PreviewAction::None,
        }
    }

    /// Call only after pending work is joined and every returned handle is cleaned.
    /// Failed cleanup keeps the slot occupied; the host retains the returned
    /// handles and must retry cleanup before acknowledging success.
    pub fn finish_stop(
        &mut self,
        session_id: &str,
        generation: PreviewGeneration,
        cleanup_succeeded: bool,
    ) -> bool {
        let Some(session) = self.sessions.get(session_id) else {
            return false;
        };
        if session.generation != generation
            || session.status != PreviewStatus::Stopping
            || !cleanup_succeeded
        {
            return false;
        }
        if session.retain_error_after_cleanup {
            // Retain failed startup state and logs until an explicit stop.
            let session = self.sessions.get_mut(session_id).unwrap();
            session.status = PreviewStatus::Error;
        } else {
            self.sessions.remove(session_id);
        }
        true
    }

    pub fn set_shared(&mut self, session_id: &str, shared: bool) -> bool {
        let Some(session) = self.sessions.get_mut(session_id) else {
            return false;
        };
        session.shared_with_agent = shared;
        true
    }

    /// Appends only for the live generation; stale output cannot contaminate a restart.
    pub fn append_log<F: FnMut() -> String>(
        &mut self,
        session_id: &str,
        generation: PreviewGeneration,
        stream: PreviewLogStream,
        text: &str,
        now: F,
    ) -> Result<bool, &'static str> {
        let Some(session) = self.sessions.get_mut(session_id) else {
            return Ok(false);
        };
        if session.generation != generation || session.status == PreviewStatus::Stopping {
            return Ok(false);
        }
        session.logs.append(&mut self.log_ids, stream, text, now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_retains_capacity_and_cleans_late_results() {
        let mut owner = PreviewOwner::new(1);
        let PreviewAction::Start(generation) = owner.start("one", true).unwrap() else {
            panic!()
        };
        assert!(matches!(
            owner.stop("one"),
            PreviewAction::CancelAndCleanup { .. }
        ));
        let handles = PreviewResources {
            runner: Some("runner".into()),
            browser: None,
        };
        assert_eq!(
            owner.started("one", generation, handles.clone()),
            PreviewAction::CleanupLate(handles)
        );
        assert!(!owner.finish_stop("one", generation, false));
        assert!(owner.start("two", false).is_err());
        assert!(owner.finish_stop("one", generation, true));
        let PreviewAction::Start(next) = owner.start("one", false).unwrap() else {
            panic!()
        };
        assert_ne!(generation, next);
        assert!(!owner.finish_stop("one", generation, true));
        assert!(!owner
            .append_log("one", generation, PreviewLogStream::Stdout, "stale", || "t"
                .into())
            .unwrap());
    }

    #[test]
    fn stop_during_failed_start_cleanup_removes_session_after_acknowledgment() {
        let mut owner = PreviewOwner::new(1);
        let PreviewAction::Start(generation) = owner.start("one", false).unwrap() else {
            panic!()
        };
        let resources = PreviewResources { runner: Some("runner".into()), browser: None };
        assert!(matches!(owner.failed("one", generation, "failed".into(), resources),
            PreviewAction::CancelAndCleanup { .. }));
        assert_eq!(owner.stop("one"), PreviewAction::None);
        assert!(!owner.finish_stop("one", generation, false));
        assert!(owner.get("one").is_some());
        assert!(owner.finish_stop("one", generation, true));
        assert!(owner.get("one").is_none());
        assert!(owner.start("two", false).is_ok());
    }

    #[test]
    fn failure_requires_cleanup_and_sharing_can_be_changed() {
        let mut owner = PreviewOwner::new(1);
        let PreviewAction::Start(generation) = owner.start("one", true).unwrap() else {
            panic!()
        };
        assert!(owner
            .append_log(
                "one",
                generation,
                PreviewLogStream::Stderr,
                "startup failed",
                || "t".into()
            )
            .unwrap());
        assert!(owner.set_shared("one", false));
        assert!(!owner.get("one").unwrap().shared_with_agent);
        let handles = PreviewResources {
            runner: None,
            browser: Some("browser".into()),
        };
        assert_eq!(
            owner.failed("one", generation, "failed".into(), handles.clone()),
            PreviewAction::CancelAndCleanup {
                generation,
                resources: handles
            }
        );
        assert_eq!(
            owner.get("one").unwrap().last_error.as_deref(),
            Some("failed")
        );
        assert!(!owner.finish_stop("one", generation, false));
        assert!(owner.finish_stop("one", generation, true));
        let session = owner.get("one").unwrap();
        assert_eq!(session.status, PreviewStatus::Error);
        assert_eq!(session.logs.since(0)[0].text, "startup failed");
        assert_eq!(session.last_error.as_deref(), Some("failed"));
        assert!(matches!(
            owner.stop("one"),
            PreviewAction::CancelAndCleanup { .. }
        ));
        assert_eq!(
            owner.get("one").unwrap().last_error.as_deref(),
            Some("failed")
        );
        assert!(owner.finish_stop("one", generation, true));
        assert!(owner.get("one").is_none());
    }

    #[test]
    fn process_exit_preserves_resources_until_stop() {
        let mut owner = PreviewOwner::new(1);
        let PreviewAction::Start(generation) = owner.start("one", false).unwrap() else {
            panic!()
        };
        let resources = PreviewResources {
            runner: Some("runner".into()),
            browser: Some("browser".into()),
        };
        assert_eq!(
            owner.started("one", generation, resources.clone()),
            PreviewAction::None
        );
        assert!(owner.process_exited("one", generation, "process exited".into()));
        assert_eq!(owner.get("one").unwrap().status, PreviewStatus::Error);
        assert_eq!(
            owner.stop("one"),
            PreviewAction::CancelAndCleanup {
                generation,
                resources
            }
        );
        assert!(!owner.process_exited("one", generation, "late".into()));
        assert!(owner.finish_stop("one", generation, true));
        assert!(owner.get("one").is_none());
    }

    #[test]
    fn accepts_large_lines_and_removes_embedded_carriage_returns() {
        let mut logs = PreviewLogs::default();
        let mut ids = PreviewLogIds::default();
        let text = format!("{}\rX\r ", "x".repeat(65537));
        assert!(logs
            .append(&mut ids, PreviewLogStream::Stdout, &text, || "t".into())
            .unwrap());
        assert_eq!(logs.since(0)[0].text, format!("{}X", "x".repeat(65537)));
    }

    #[test]
    fn normalizes_lines_and_keeps_leading_whitespace() {
        let mut logs = PreviewLogs::default();
        let mut ids = PreviewLogIds::default();
        assert!(logs
            .append(
                &mut ids,
                PreviewLogStream::Stdout,
                "  a\r\n\u{feff}\n b\u{a0}\n\u{85}",
                || "time".into()
            )
            .unwrap());
        let entries = logs.since(0);
        assert_eq!(
            entries.iter().map(|e| e.text.as_str()).collect::<Vec<_>>(),
            ["  a", " b", "\u{85}"]
        );
        assert_eq!(entries.iter().map(|e| e.id).collect::<Vec<_>>(), [1, 2, 3]);
        assert!(!logs
            .append(
                &mut ids,
                PreviewLogStream::System,
                " \r\n\u{feff}",
                || panic!("no timestamp")
            )
            .unwrap());
    }

    #[test]
    fn bounds_each_session_and_shares_ids() {
        let mut ids = PreviewLogIds::default();
        let mut a = PreviewLogs::default();
        let mut b = PreviewLogs::default();
        a.append(
            &mut ids,
            PreviewLogStream::System,
            &"x\n".repeat(401),
            || "t".into(),
        )
        .unwrap();
        b.append(&mut ids, PreviewLogStream::Stderr, "y", || "t".into())
            .unwrap();
        assert_eq!(a.since(0).len(), 400);
        assert_eq!(a.since(0)[0].id, 2);
        assert_eq!(a.since(400)[0].id, 401);
        assert_eq!(b.since(0)[0].id, 402);
    }

    #[test]
    fn exhausted_ids_do_not_partially_append() {
        let mut ids = PreviewLogIds { next: u64::MAX - 1 };
        let mut logs = PreviewLogs::default();
        assert!(logs
            .append(&mut ids, PreviewLogStream::System, "a\nb", || "t".into())
            .is_err());
        assert!(logs.since(0).is_empty());
        assert_eq!(ids.next, u64::MAX - 1);
    }
}
