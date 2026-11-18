# Native node state manager

Reference: `packages/gateway/src/services/node-state-manager.ts`.
Native: `packages/gateway-rust/src/services/node_state_manager.rs`.
Target: `gateway_rust_node_state`; driver: `nativenodestate.ts`.

Eight differential tests run the actual TypeScript class, controlling only its
Date constructor. Stateful traces compare all return values and clock-call counts:
defaults; partial and nullish capability merges; explicit false/empty resets;
protocol version inheritance, zero and fractions; every platform and role;
client reassignment; gateway exemption on client disconnect; direct gateway removal;
missing IDs; disconnection/reconnection; insertion order; and snapshot metadata.
One larger trace exercises 80 registrations and later replacement/disconnection.
Independent managers and special Map keys are covered without prototype lookup.

Display names use compiled ICU collation, preserving stable ties including canonically
equivalent strings. The differential corpus includes accents, case, punctuation,
spaces, digits, NUL, emoji and multiple scripts. The compiled root default matches
the reference en-US collation for this corpus. The constructor accepts a configured
collator for other host locales; runtime activation must match the gateway locale
and audit changes to ICU collation data. This is not a claim of exhaustive Unicode
or cross-version locale parity. Both Cargo lockfiles pin the ICU implementation/data.

Five native tests independently verify connection time retention, exact false/empty
updates, client/gateway ownership, stable collation, remove/reinsert order, no-op
clock counts, owned snapshots, and the real UTC millisecond clock format.
Four deliberate mutations (connection time reset, gateway exemption removal, ignoring
false voice updates, lexical sorting) fail assertions in both suites; each edit is
restored in a finally block, and both suites pass again. Evidence is under
`.jait/artifacts/gateway-rust/node-registry-*.log` and the two mutation JSON reports.
Strict Clippy passes with the real implementation.

Typed inputs follow shared NodePlatform/NodeRole/NodeSurfaceType values and finite
JSON protocol numbers; nullish optional fields preserve source fallbacks. Native
return values are owned snapshots or immutable borrows: JS external mutation of
returned objects and capability-array aliasing are outside the native ownership
contract. The injected clock supplies one ISO timestamp per actual source Date
construction. Registry metadata is in-memory and local to its manager instance.

This manager records advertised capabilities only; it grants no node permissions.
Existing authentication, node permissions and routing/consent remain required by
callers. Production websocket registration/dispatch is not activated. Native credit
requires the complete source-bound gate; focused tests alone do not grant credit.
