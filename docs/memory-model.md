# Jait Memory Model

Jait memory is local-first context that helps future turns without expanding every prompt with the full chat history. The gateway owns persistence and retrieval; the web UI exposes review and control surfaces.

## What Gets Saved

Memory records should capture durable facts that remain useful beyond the current turn:

- Stable user preferences, such as UI density, workflow style, preferred tools, or answer format.
- Durable project facts, such as repository conventions, architecture decisions, deployment constraints, and recurring commands.
- Repeated corrections, especially when the user corrects an assumption or asks Jait to remember a preference.
- Successful workflows that are likely to be reused, including test commands, preview setup, or release steps.
- Explicit reminders saved through memory tools.

Memory should not save transient chat details, secrets, one-off command output, short-lived debugging guesses, or broad summaries that cannot be traced back to a source.

## Retrieval And Prompt Limits

Retrieval should be scoped before it is broad:

- Coding work defaults to project-scoped memory.
- Contact or global memories are included only when the user asks about personal preferences, prior facts, or "based on what you know" context.
- Search combines lexical matches, tags, scope, recency, reminder status, and embedding similarity where available.
- Per-turn prompt injection should use a compact `<relevant_memory>` block with source IDs.
- The default target is 3-5 highly relevant memories, bounded by a strict token budget rather than a global memory dump.

If retrieved memories conflict, the assistant should surface the conflict or prefer the newest higher-confidence record rather than silently merging incompatible facts.

## Privacy Boundaries

Memory records stay in the local Jait data store unless the user explicitly exports or syncs them. Secrets should be stored through secret/API-key mechanisms, not memory. Memory retrieval must respect project and contact scope so unrelated projects do not inherit private context by default.

## User Controls

Users must be able to inspect and edit memory records. The Memory page should expose:

- Source session or thread.
- Scope, tags, age, usage count, and last retrieved time.
- Archive, restore, delete, and edit actions.
- Provenance when a response materially used memory.
- Feedback controls for "should have remembered this" and "wrong memory used".

## Migration Direction

Legacy append-only `MEMORY.md` behavior should move toward editable canonical records in SQLite. `MEMORY.md` can remain as a human-readable export, but it should not be the source of truth. Migration should deduplicate repeated facts, preserve source provenance, and keep existing user data intact.
