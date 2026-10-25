# Native session SQL engine

Reference: packages/gateway/src/services/session-sql.ts.
Native: packages/gateway-rust/src/services/session_sql.rs.

The complete query/schema service implements ordered statement refusals,
comment/literal/quoted-identifier tokenization, mutation and pragma prefix bans,
function-call bans, credential-table text matching, top-level LIMIT clamping,
independent output caps, schema discovery, internal/FTS-shadow table filtering,
column metadata, duplicate/numeric aliases, blob and large-integer conversion,
first-success table-list state, and error projection. Native SQLite additionally
checks statement.readonly after lexical validation. No queryable credentials,
mutation path, extension loader, or filesystem query function is introduced.

SessionSqlWorker dispatches through the existing bounded dedicated DB worker.
It shares first-success state across cloned async handles and the native tool
can bind it with SessionSqlTool::with_service. The caller supplies the connection
and worker; no live state path, automatic service registration, or route is added.
Native service/real tool output is compared against the real TypeScript service
and factory on the same disposable in-memory fixture. Cancellation before
worker dispatch does not consume the first-success metadata state; a current-
thread Tokio test verifies pending work yields while the DB lane is held.

Behavioral edge cases found and corrected by differential comparisons:
- The current Bun statement metadata retains duplicate projection names for
  empty results. Nonempty results use the first row's own keys, which collapse
  duplicates. The earlier runtime deduplicated both; the frozen gate caught the
  changed empty-result behavior. Duplicate and numeric projections are compared
  both with and without rows.
- Bun row own-key enumeration retains numeric alias projection order, while
  sanitizing rows produces ordinary JavaScript integer-key ordering.
- A permitted trailing semicolon causes Bun to prepare only the first statement,
  ignoring the appended LIMIT tail; rusqlite validates every tail statement.
  Native code keeps the first lexically verified statement and still independently
  truncates results. Original multi-statement inputs remain refused first.
- Unbound query parameters are null in the reference: native uses raw_query.
- __proto__ projection names are omitted by reference sanitizeRow's ordinary
  object setter; columns still record the projection.
- Execution continues after the visible row cap so later SQL failures cannot be
  hidden behind a partial successful response.

Reference evidence includes 195 static SQL strings extracted with TypeScript's
AST from the original normal/adversarial suites and a Rust-owned matrix of real
queries, refusal inputs, normalization/limit combinations, metadata, FTS5,
prototype aliases, non-finite output, and state/failure recovery. Seed mutations
exist only in the test bridge on disposable memory databases. Attack payload
paths from the original suite are normalized to project artifact paths, retaining
the refusal under test without probing unrelated host files.

Limitations retain the original service's documented execution boundary: row
limits do not establish a wall-clock SQL deadline, and started SQLite work is
not interrupted by caller cancellation. Statements finish on the DB worker.
The physical native SQLite backend always provides projection metadata; the
reference's optional metadata fallback for other JS shims is unnecessary here.
Default integer output follows the actual Bun reference's IEEE-754 number domain.
The native route/tool/executor activation and production readiness are separate
from this component's behavior credit.

Focused logs, mutation reports, source extraction and final gate evidence belong
under .jait/artifacts/gateway-rust/session-sql-engine/.

Evidence:
- `contract-first.log` captures duplicate metadata/trailing-semicolon mismatches;
  `contract-second.log` captures numeric-alias projection order mismatch.
- `contract-integrated.log` passes the real SQL/tool/worker contracts, including
  pre-dispatch cancellation and unchanged seeded rows after mutation attempts.
- `mutations.json` records four caught/restored mutants: sensitive-table refusal,
  quoted dangerous function calls, final row cap, and first-success table state.
- `ascii-before.log` reproduces a native false refusal of distinct Unicode table
  names: Rust Unicode case folding matched long-s against ASCII s, whereas the
  source's non-Unicode JavaScript regex does not. Scoped ASCII-insensitive folding
  corrects that without weakening the refusal of actual ASCII credential names.
  The same regression is included in the restored contracts and full gate.
- `contract-restored-final.log` / `clippy-final.log` are the current post-fix focused
  command outputs; all three focused targets and strict all-target Clippy passed.
  The added first-keyword edge matrix is also included in the full gate. Final
  component credit requires the complete source-bound gate.

The scope validator added in `assessments/scope.rs` is independent partial work;
this SQL engine entry grants no AssessmentService or assessment-route credit.
