# Native repository todo tool

Reference: packages/gateway/src/tools/repo-proposal-tools.ts.
Native: tools/repo_todos.rs and repo-todo-metadata.json.

The full jait.todos factory preserves metadata, repository selection and input
normalization, previews, CRUD calls, ownership checks and optional thread
provenance. Explicit repository selection cannot fall back when missing.
Project inference preserves the reference's first string-prefix match and
subsequent name fallback; it does not grant filesystem access or widen the
repository service's authorized list. Updates/removals require both repository
and stored owner equality, including explicit null versus missing ownership.

Optional status/priority fields are filtered, tags are trimmed/lowercased,
deduplicated and capped at twelve, and dueDate preserves omitted versus null.
Its date validation remains the original syntactic YYYY-MM-DD check; this port
does not add a calendar-validity rule. Preview messages preserve whitespace
normalization, UTF-16 clipping, counts and priority/date suffixes. Thread ID/title
are nullable provenance, not an instruction to create or run work.

The native adapter forwards the original context capability through a closed
service port. Repository/proposal persistence and thread lifecycle remain
independently inventoried components. The host must bind authenticated
owner-authorized services. The adapter is not registered in production and
creates no real todos in these contracts.

The test driver directly imports the actual TypeScript factory. Complete
metadata plus 192 scripted scenarios compare complete results, UTF-16 message
units, ordered calls and consumed steps. They cover both owner states,
missing/foreign owners, repository inference and overrides, field omission,
Unicode tags, preview bounds, thread presence and Error/non-Error failures at
each dependency boundary. Typed service outputs and Unicode scalar JSON inputs
form the boundary; clipped messages retain full UTF-16 code-unit semantics.
All service calls assert original native context-capability identity.

Six isolated deliberate regressions cover owner/repository checks, tag bounds,
nullable date clearing, thread attribution and preview limits; sources are
restored and the focused suite and strict Clippy must pass before integration.
Evidence: .jait/artifacts/gateway-rust/security-workbench/repo-todo-*. Native
component credit requires the full frozen source gate and grants no underlying
thread, deployment or production-activation credit.
