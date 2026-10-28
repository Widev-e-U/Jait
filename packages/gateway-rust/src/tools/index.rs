//! Port of `packages/gateway/src/tools/index.ts`.
//!
//! The TS module has two halves:
//!
//! 1. A re-export barrel for the whole tools cluster (lines 1–161). That half is
//!    mirrored by `tools/mod.rs`, which declares the native modules one-for-one.
//!    Individual renames/missing items are documented per module, not repeated here.
//! 2. `createToolRegistry(surfaceRegistry, deps)` (lines 385+), which constructs a
//!    `ToolRegistry` and registers ~60 tools by pulling in surface registry, scheduler,
//!    session/thread/memory/reminder services, WS control plane, hooks, chat loops,
//!    GitHub-App env resolution, MCP manager and the Fastify app getter.
//!
//! Only the second half contains logic that is not already covered elsewhere. Its
//! registration body is a composition root over services that are themselves separate
//! originals; porting it faithfully requires those services to be mounted natively
//! first. What *is* pure and independently testable is reproduced here:
//! `personaAgentIdForContext`, the ownership guard that decides whether a tool call
//! may borrow a saved persona agent's identity.
//!
//! Gaps (see also `native-coverage.json`):
//! - `createToolRegistry` composition/registration order is **not** ported; runtime
//!   tool mounting remains a separate integration item and is not claimed as coverage.
//! - `ToolRegistryDeps` is a TS structural type over ~50 optional services; no native
//!   struct is invented until those services exist natively.
//! - The barrel's re-export list is covered by `tools/mod.rs` module declarations, not
//!   by a second list here (duplicating it would drift).

/// The subset of `ThreadService` that persona resolution depends on.
///
/// TS calls `deps.threadService.getById(threadId)` and
/// `deps.threadService.getPersonaAgent(personaAgentId, userId)`. Both are injected so
/// the guard stays pure and testable without a live thread store.
pub trait PersonaThreadLookup {
    /// `threadService.getById(threadId)` — owner plus optional persona link.
    fn thread_for(&self, thread_id: &str) -> Option<ThreadOwner>;

    /// `threadService.getPersonaAgent(personaAgentId, userId)` — `true` when the
    /// persona agent exists and belongs to `user_id`.
    fn has_persona_agent(&self, persona_agent_id: &str, user_id: &str) -> bool;
}

/// The fields of a thread that `personaAgentIdForContext` reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreadOwner {
    pub user_id: String,
    pub persona_agent_id: Option<String>,
}

/// Resolve the persona agent a tool call may act as.
///
/// Mirrors TS:
/// ```text
/// if (!deps.threadService || !userId || !threadId) return undefined;
/// const thread = deps.threadService.getById(threadId);
/// if (!thread || thread.userId !== userId || !thread.personaAgentId) return undefined;
/// return deps.threadService.getPersonaAgent(thread.personaAgentId, userId)
///   ? thread.personaAgentId
///   : undefined;
/// ```
///
/// A plain chat (no thread), a thread owned by another user, or a persona agent that
/// is missing/foreign all yield `None` — identity is never borrowed across users.
pub fn persona_agent_id_for_context(
    threads: Option<&dyn PersonaThreadLookup>,
    user_id: Option<&str>,
    thread_id: Option<&str>,
) -> Option<String> {
    // `!deps.threadService` — no thread service means no persona identity at all.
    let threads = threads?;
    // JS truthiness: an absent *or empty* id is falsy.
    let user_id = user_id.filter(|value| !value.is_empty())?;
    let thread_id = thread_id.filter(|value| !value.is_empty())?;

    let thread = threads.thread_for(thread_id)?;
    if thread.user_id != user_id {
        return None;
    }
    let persona_agent_id = thread.persona_agent_id?;
    // `!thread.personaAgentId` also rejects the empty string.
    if persona_agent_id.is_empty() {
        return None;
    }
    if threads.has_persona_agent(&persona_agent_id, user_id) {
        Some(persona_agent_id)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeThreads {
        threads: Vec<(String, ThreadOwner)>,
        owned_personas: Vec<(String, String)>,
    }

    impl FakeThreads {
        fn with_thread(mut self, id: &str, user_id: &str, persona: Option<&str>) -> Self {
            self.threads.push((
                id.to_string(),
                ThreadOwner {
                    user_id: user_id.to_string(),
                    persona_agent_id: persona.map(str::to_string),
                },
            ));
            self
        }

        fn with_persona(mut self, persona: &str, user_id: &str) -> Self {
            self.owned_personas
                .push((persona.to_string(), user_id.to_string()));
            self
        }
    }

    impl PersonaThreadLookup for FakeThreads {
        fn thread_for(&self, thread_id: &str) -> Option<ThreadOwner> {
            self.threads
                .iter()
                .find(|(id, _)| id == thread_id)
                .map(|(_, owner)| owner.clone())
        }

        fn has_persona_agent(&self, persona_agent_id: &str, user_id: &str) -> bool {
            self.owned_personas
                .iter()
                .any(|(persona, owner)| persona == persona_agent_id && owner == user_id)
        }
    }

    #[test]
    fn no_thread_service_never_yields_a_persona() {
        assert_eq!(
            persona_agent_id_for_context(None, Some("user-1"), Some("thread-1")),
            None
        );
    }

    #[test]
    fn missing_or_empty_ids_short_circuit() {
        let threads = FakeThreads::default()
            .with_thread("thread-1", "user-1", Some("persona-1"))
            .with_persona("persona-1", "user-1");

        assert_eq!(persona_agent_id_for_context(Some(&threads), None, Some("thread-1")), None);
        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), None),
            None
        );
        // JS treats "" as falsy, so the empty-string cases must also be rejected.
        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some(""), Some("thread-1")),
            None
        );
        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("")),
            None
        );
    }

    #[test]
    fn unknown_thread_yields_no_persona() {
        let threads = FakeThreads::default();
        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-x")),
            None
        );
    }

    #[test]
    fn another_users_thread_is_rejected() {
        let threads = FakeThreads::default()
            .with_thread("thread-1", "user-2", Some("persona-1"))
            .with_persona("persona-1", "user-2");

        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-1")),
            None
        );
    }

    #[test]
    fn thread_without_persona_yields_none() {
        let threads = FakeThreads::default().with_thread("thread-1", "user-1", None);
        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-1")),
            None
        );
    }

    #[test]
    fn empty_persona_id_on_the_thread_is_rejected() {
        let threads = FakeThreads::default()
            .with_thread("thread-1", "user-1", Some(""))
            .with_persona("", "user-1");

        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-1")),
            None
        );
    }

    #[test]
    fn persona_that_does_not_belong_to_the_user_is_rejected() {
        let threads = FakeThreads::default()
            .with_thread("thread-1", "user-1", Some("persona-1"))
            .with_persona("persona-1", "user-2");

        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-1")),
            None
        );
    }

    #[test]
    fn owned_persona_is_returned_verbatim() {
        let threads = FakeThreads::default()
            .with_thread("thread-1", "user-1", Some("persona-1"))
            .with_persona("persona-1", "user-1");

        assert_eq!(
            persona_agent_id_for_context(Some(&threads), Some("user-1"), Some("thread-1")),
            Some("persona-1".to_string())
        );
    }
}
