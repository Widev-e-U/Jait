# Native tool permission review

Reference: `packages/gateway/src/security/tool-permissions.ts`. Native:
`security/tool_permissions.rs`. Full gate controls component credit; no production wiring.

All exported behavior is ported: unknown tools resolve to dangerous/high policy with
provenance, configured lookup preserves the declared tool name even for alias-map keys,
consent thresholds respect session approvals, and command/path deny lists take precedence.
Empty and absent lists retain the reference semantics. Missing permission returns allowed
from list checks but requires consent from the consent helper; these helpers must remain
behind the executor's full path, policy and scope checks. Malformed policy enum values are
rejected at the native type boundary rather than interpreted as approval.

Irreversible-command patterns retain source order, exact reason text, ASCII word boundaries,
ECMAScript whitespace, negative lookaheads, line boundaries and case sensitivity. The
established `regress` ECMAScript regex engine (0.12.0, locked, utf16 feature) handles
lookarounds. Dynamic globs preserve the reference replacement order, including the existing
`<<GLOBSTAR>>` placeholder behavior. UCS-2 patterns and inputs preserve single-code-unit `?`
and astral literals. Legacy `/i` canonicalization is applied explicitly: the engine's default
case folding incorrectly accepted `ſ` against `s`; the failing differential case now passes.
The first and restored runs are `tool-permissions-first.log` / `tool-permissions-after.log`.

Ten passing checks comprise six focused component checks plus four driver transport guards.
The real TypeScript exports run without mocks or executing commands. Hundreds of vectors
cover all trust levels (including fractional/NaN/infinity), unknown policy, approvals,
allow/deny conflicts, regex metacharacters, slash boundaries, newlines, Unicode folding,
emoji, all ten irreversible patterns and their exclusions. Two restored mutations (dangerous
consent bypass and inverted denied-pattern match) fail their corresponding assertions;
logs are in `permission-mutations/`. Strict native Clippy passes.

This is policy behavior, not an assessment adapter or hardened shell parser. Known reference
false positives remain intact; command strings and paths are never executed. Unicode
canonicalization uses the host Rust uppercase table; cross-version Unicode equivalence
outside tested cases and lone surrogate inputs at the JSON boundary are not established.
No regex resource bound is added beyond the caller's existing input/execution budget.
Dependency impact: adds locked `regress` 0.12.0 to the native gateway and both native/contract
locks. No database migration, production TypeScript edit, service restart or activation.
