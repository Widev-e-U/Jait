# Native path guards, architecture storage and Mermaid tools

References: security/path-guard.ts, services/architecture-diagrams.ts,
tools/architecture-tools.ts and tools/diagram-tools.ts.
Target: gateway_rust_diagrams. Eleven tests (seven domain and four transport)
compare real TypeScript modules with the native implementations.

Path checks cover POSIX normalization, absolute/relative paths, traversal,
null-byte/error precedence, global/custom denials and case comparisons, the
reference's ..-prefix rejection, root access, final internal/external/dangling
and cyclic symlinks, absent files and disabled checks. Linux is the tested
platform. Like the reference, this is a lexical guard with an optional final
entry symlink check; parent symlinks are not traversed by that optional check.
This work preserves policy and does not expand authorization.

Architecture storage uses real disposable SQLite plus project-local files:
file-first reads, blank/missing/unreadable-file database fallback, per-user and
null-owner rows, empty owner semantics, trim behavior, insert/update identity,
ordered lists, invalid UTF-8 replacement and validation errors.
Failing SQL triggers prove file writes survive failed DB updates/inserts.
A failed file write preserves the database. A dropped table and missing stores
exercise failure paths. Run synchronous storage on the bounded worker.

Tool contracts compare all metadata, exact result/messages, UTF-16 limits
(20,000 diagram units and 200 title units), invalid/null/missing input,
Unicode trimming, optional store/WS, session targeting and authenticated
context ownership. Request IDs are checked for 21-character URL-safe layout
and reuse in UI/result payloads; their random values alone are normalized.
Store failure precedes UI delivery; UI delivery failure leaves saved data.
Architecture UI commands use an injected sink, preserving the existing
transport boundary; full websocket runtime remains separate.

Five mutations (custom denial removal, file-first bypass, diagram size cap,
architecture ownership omission and quota epsilon in the companion target)
each cause assertion failures, with restored passing tests. Evidence:
.jait/artifacts/gateway-rust/path-denied-mutation.log,
diagram-file-mutation.log, diagram-limit-mutation.log,
architecture-owner-mutation.log, diagrams-tests.log and slice-contract-clippy.log.
