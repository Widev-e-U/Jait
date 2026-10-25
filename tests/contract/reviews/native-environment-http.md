# Native environment HTTP composition review

Scope: `routes/environment.ts`. Authenticated read-only aggregation uses real
native SQLite repositories for assistant profiles, active projects/session counts,
repositories and network-host records, plus the native provider registry. Node
views are an explicit control-plane port; no discovery/scanning, provider engine
or default production mounting is credited. Network-host and provider lists retain
the source's authenticated global scope; user filtering of assistants, projects,
sessions and repositories is exact. Wider cutover/privacy gates remain separate.

The reference driver uses actual `createServer`, which registers the production
route, actual auth/SQLite/domain repositories and scripted node/provider I/O.
Server startup availability probes occur before the route scenario and are
excluded from its trace; request-time probes are retained exactly. Every returned
field, status, content type and request-time node/provider call is compared.
Owned/foreign rows, archived projects/sessions, session counts, local/connected/
missing nodes, duplicate filesystem names, provider state/failure, all optional
dependencies, HEAD, denied users and missing-table failures have coverage.
Reference order is preserved: node registry, projects, filesystem nodes, repos,
provider checks, server timestamp, then stored host decoding. Failures cannot
return partial snapshots or read later dependencies early.

Network-host values use the existing lossless ECMAScript JSON document, preserving
integer-index ordering, IEEE-754 rounding, non-finite numbers and lone UTF-16
surrogates. Exact HTTP text checks cover those cases, 500 valid nesting levels,
and supplementary-character parse failures. A new iterative diagnostic helper is
compared against the actual Bun 1.3.10 parser across malformed literals, all ASCII
characters in several grammar contexts, numbers/strings and Unicode cases;
20,000 levels of invalid nesting do not recurse. Diagnostics are a focused Bun
compatibility surface, not a replacement for a general JavaScript runtime.

Five focused native checks plus four protocol guards pass; both original Vitest
tests pass. Seven intentional mutations (project owner, archived rows, counts,
first-vs-last node mapping, SSH strictness, UTF-16 error units and corrupt-JSON
message) failed behavioral assertions and were restored byte-exactly. The restored
target passes. Adding the valid deep-wire case changed tests only. Evidence:
`.jait/artifacts/gateway-rust/environment-http/`. Full gate controls credit.

A proposed null default-branch fixture was rejected by the real database NOT NULL
constraint before the route ran; it is not a claimed route behavior or a relaxed
assertion. Valid seeded rows include both required network observation timestamps.
No TypeScript production behavior or original assertions were changed.

Reference SHA256: 1b3ba9ed1884f5d39584fe29b785c7565d9bbce09b7feb36550932213612e829

Runtime refresh (2026-10-25): the actual reference now uses Bun 1.4.0 / ICU
78.3. Its missing-table response includes `code: "SQLITE_ERROR"`; native
composition preserves that field. The existing differential regression drops
each of the four repository tables independently, and retains separate malformed
stored-JSON failures. No reference output or assertion is normalized or relaxed.
Evidence: `.jait/artifacts/gateway-rust/channels-http/environment-refresh.log`.
