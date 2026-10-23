# Session reference freshness refresh, 2026-10-22

The frozen native gate rejected stale reference hashes for services/sessions.ts
and services/session-waits.ts. Comparison with the previously reviewed source
finds exactly two changes: deleting loop metadata from question forks, and
adding callback subscriptions to wait changes.

The native fork now deletes only the top-level loop property while preserving
raw metadata values and property ordering. A regression with object, false and
null loop values fails before the native change and passes afterward. It checks
the copied session and original parent; the existing immutable-history,
ownership and transactional-failure contracts remain required.

The native wait registry now supports identity-deduplicated subscribers and
repeatable unsubscribe closures. Broadcaster and subscribers receive one shared
change handle. The native callback API uses Rc<RefCell<SessionWaitChange>> so
retained events, changed session IDs and replaced waits arrays retain the
reference's object identity. Wait record handles remain shared. Emission visits
a live listener list with tombstones, supports reentrant delivery and additions,
skips removed callbacks and stops on error after committing state. Tombstones
are compacted after the last active emission. The old unsubscribe closure also
removes a later registration of the same callback. clearForTests intentionally
retains subscribers, matching the updated source.

The new Rust-owned comparison target executes the actual TypeScript service.
Four focused checks cover duplicate identity, unsubscribe/re-add, broadcaster
ordering, live additions/deletions, retained shared events, record/array changes,
nested emissions, committed state on callback errors and test reset behavior.
Existing wait and session suites still run. Three deliberate native regressions
exercise deduplication, shared event identity and retained reset subscriptions;
the fork also has failing-before/passing-after evidence.

Evidence is in .jait/artifacts/gateway-rust/security-workbench/. Full frozen
validation remains necessary. Refreshing these two previously credited rows
adds no source-component credit and grants no reference test-declaration
reconstruction, production activation or replacement-readiness credit.

Catalog data refresh: shared/capability-catalog.ts added exactly the goal_loop chat feature and loop. prefix. The native static asset was regenerated from the actual current TypeScript driver; all existing catalog comparisons pass. The catalog implementation and direct reference fingerprint are unchanged; this adds no component credit.
