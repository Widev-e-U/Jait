# Native core platform action dispatcher

Reference: `packages/gateway/src/tools/core/jait.ts`. Native `tools/core_jait.rs`
implements every action: memory save/search/forget, reminder save/list/update/
forget, cron add/list/update/remove, and gateway status. Embedded metadata is
compared with the real factory; JSON input and separate trusted context retain
owner, session, action attribution and explicit process-root behavior.

`nativecorejait.ts` imports the actual production factory and replaces only its
explicit service ports and Date.now clock. Ten scenarios (106 sequential action
steps) compare complete service/method/argument order, returned data, error status
and UTF-16 message code units. Cases exercise unavailable dependencies before
required-field validation, reminders selected through memory.save, owner-present
and owner-absent requests, null/missing/false/zero values, Unicode/truncated
previews, TTL negative/zero/fraction/TimeClip failures, reminder-first forgetting,
reminder patch status and null data, cron first-underscore normalization, cwd
selection, job update/remove misses, aggregate counts and twelve-line status
budgets, and both Error and non-Error failures at each service boundary.

The explicit Option<Value> port result preserves missing versus null values.
Preview rendering reuses the already reviewed UTF-16 implementation. TTL dates
use the native ISO formatter after JavaScript TimeClip/truncation. Invalid typed
service replies produce a bounded platform error rather than indexing unchecked
records. Arbitrary non-JSON JavaScript objects/coercions are outside the typed
port profile. Native generic context remains a caller-owned dependency.

Five deliberate regressions are caught and restored: lost owner, skipped
reminder-first forget, global rather than first underscore replacement, wrong TTL
unit, and lost status preview bound. See core-tools-mutations.json and per-mutant
logs under `.jait/artifacts/gateway-rust/`. Restored focused contracts pass; full
frozen validation controls source-bound credit. These are dispatcher semantics,
not implementation credit for the reminder store, scheduler engine, memory
transport, tool registry/consent activation, or production replacement.
