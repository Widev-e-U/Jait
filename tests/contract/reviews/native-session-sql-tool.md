# Native session SQL tool adapter

Reference `packages/gateway/src/tools/session-sql-tools.ts`; native
`packages/gateway-rust/src/tools/session_sql.rs` and its exact metadata asset.
This component is the tool's presentation and dispatch adapter, not the SQL
service or its security engine. The constructor accepts an explicit read-only
service port. It opens no database, runs no SQL, exposes no route, and grants no
new query authority. The native SessionSqlService is reviewed separately; this entry grants only tool-adapter credit.

The adapter preserves schema-mode precedence, query input checks using ECMAScript
whitespace, unmodified SQL and max_rows forwarding, service failure projection,
schema fallback for results without rowCount, exact row-count/truncation messages,
data passthrough, and thrown service errors. The port models the service's valid
SessionSqlResult union, including required error/message/data fields.

The actual-source driver invokes the real factory and execute callback. Only the
SessionSqlService boundary is isolated. Contracts compare all metadata, calls to
schema/query, input preservation, results and failures. Cases include schema mode
with malicious-looking SQL (which must never dispatch a query), absent/null/other
invalid SQL, Unicode whitespace, omitted/explicit/null max_rows, empty projections,
truncated rows, blocked-table service responses and thrown schema/query failures.
The tool does not reinterpret or weaken the service's security decisions.

Evidence under `.jait/artifacts/gateway-rust/session-sql-tool/`:
- `contract-first.log`: actual-source differential contracts pass.
- `mutations.json` and mutation logs: bypassing the required SQL guard, using an
  incorrect rowCount key, and hiding truncation each fail the real-reference
  assertions. Source is restored in finally.
- The restored focused gate and strict Clippy results are recorded before full
  source-bound verification. No SessionSqlService component credit is claimed.

The adapter now supports async backend futures and `with_service`, which binds the
actual native SessionSqlWorker on a supplied bounded DatabaseWorker. Real tool +
service comparisons and pre-dispatch cancellation tests live in
`gateway_rust_session_sql.rs`; no live database path is opened implicitly.
