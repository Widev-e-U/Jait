# R01 external-interface inventory review

This change establishes a versioned, deterministic interface candidate baseline and a native Rust drift auditor. **R01 remains pending.** The manifest records 407 source/metadata/asset files, 2673 interface candidates, and 13 explicit category gaps. None is credited as reviewed behavioral coverage or a complete external contract.

Read alongside `docs/gateway-rust-migration.md` R01, `docs/vision.md`, and `docs/security-roadmap.md`. In particular, the security scope/consent/evidence contracts require their own exact Rust test mappings; discovering names or imports does not verify security boundaries or product capabilities.

## Owned files and source boundary

Only five new files are authored: `tests/contract/interfaces.json`, `tests/contract/tooling/capture-interfaces.mjs`, its colocated `.test.mjs`, `tests/contract/src/bin/interfaces.rs` (including unit tests), and this review. No production, existing coverage inventory/generator, workflow, root package, Cargo manifest, lockfile or shared dependency changes are required. Cargo discovers the new bin automatically.

The manifest pins every non-test file under `packages/gateway/src` and `packages/shared/src`, plus gateway `bin` and `scripts` and both package manifests. It is intentionally overinclusive: declaration files and embedded fixtures/assets are pinned too. Files with a final `.test`/`.spec` stem are excluded; dependency/build/cache directories are excluded explicitly and identically in both implementations. Gateway/shared source additions of any extension fail the Rust drift gate. Symlinks are rejected.

Other packages (screen-share, desktop/mobile clients, API client), generated web-dist, built messenger bundles, downloaded engines and packaging outputs are outside this file walk. Their integration, provenance and platform compatibility remain explicit category gaps, not implicit completeness claims. No live targets, credentials, `.env` files, dependency modules or gateway code are executed by capture/audit.

## Captured evidence

| Candidate category | Occurrences |
| --- | ---: |
| `asset` | 6 |
| `bridge` | 241 |
| `cli` | 45 |
| `config` | 232 |
| `db_migration` | 75 |
| `db_table` | 48 |
| `dependency` | 658 |
| `platform` | 117 |
| `route` | 408 |
| `schema` | 294 |
| `sse_event` | 80 |
| `tool` | 168 |
| `ws_event` | 301 |

Counts are source occurrences, not unique activated routes/tools/events or supported targets. HTTP candidates carry literal URL or `<dynamic>`, HTTP method/expression and schema expression (or an explicit handler-validation/unresolved marker). Receiver spelling and `FastifyInstance` parameter syntax filter candidates; compiler symbol resolution, imported aliases, plugin prefixes and activation still need review. Comments and code-looking string contents do not become route registrations.

Tool objects retain parameter/input-schema expressions. Shared declarations and schema variables retain source definitions; TypeScript types are labelled as such, not represented as completed JSON Schemas. Event unions and discriminants are candidates whose actual WS/SSE transport may be unresolved. Templates/computed names remain dynamic. DB migration IDs/names and Drizzle table definitions are captured; raw SQL, FTS, conditional DDL and legacy tables require reconciliation. Config captures AppConfig fields and direct env accesses; computed keys and persisted settings/precedence remain pending. CLI dispatch literals, package bins, subprocess/registration sites, static imports, dependency version constraints and assets are pinned. Platform/architecture branch literals observed: `android`, `arm64`, `darwin`, `linux`, `win32`, `x64`. These do not establish a supported OS/architecture matrix; Linux is the only host used for this audit.

Each candidate includes a source-local ID, byte offsets (including UTF-8), evidence fingerprint, details, pending status, empty required-test list and explicit gap. Every file has a full-byte fingerprint, interface-ID cross-reference and canonical claim-list fingerprint. FNV-1a detects accidental drift; it is not an authenticity signature or a defense against coordinated malicious baseline/code edits.

## Migration and test ownership

| Migration workstream | Files |
| --- | ---: |
| `R01-runtime-and-shared` | 234 |
| `R04-http` | 49 |
| `R05-streaming` | 2 |
| `R06-execution` | 116 |
| `R07-storage` | 6 |

These are workstream assignments, not named individual commitments. Every file explicitly records that an individual assignee and exact behavioral Rust test IDs/branch coverage are pending. No inference from the existing coverage inventory or direct imports is credited. Schema v1 intentionally permits only `pending` status with an explicit gap and no asserted test IDs; attempts to assert completeness or invented passing tests are rejected. A future reviewed mapping/evidence protocol must define executable IDs before granting status beyond pending.

The 13 category gaps are part of the required manifest schema. They cover routes/prefixes/methods/schema activation, dynamically supplied MCP/ACP/plugin tools, templated WS/SSE names and payloads/replay, raw SQL/upgrade/rollback, computed configuration, nested CLI/options, optional/native dependencies, Node/Bun workers/bridges, generated assets and supported-platform evidence. Removing a category or gap fails the audit.

## Reproduction and evidence

Run from the project (artifact locations are anchored to the source/manifest root, independent of CWD):

```sh
node tests/contract/tooling/capture-interfaces.mjs --check
node --test tests/contract/tooling/capture-interfaces.test.mjs
cargo check --locked --manifest-path tests/contract/Cargo.toml --bin interfaces
cargo test --locked --manifest-path tests/contract/Cargo.toml --bin interfaces
cargo run --locked --manifest-path tests/contract/Cargo.toml --bin interfaces
cargo run --locked --manifest-path tests/contract/Cargo.toml --bin interfaces -- --require-resolved
```

The last command must fail until the pending work is resolved. Plain `node .../capture-interfaces.mjs` explicitly rewrites the baseline; review its diff. `--check` is read-only and compares the entire deterministic capture. Node and the installed TypeScript compiler are authoring dependencies only. The compiled Rust auditor uses filesystem/JSON operations and never launches a subprocess. `--root <project>` supports isolated fixtures; unknown flags fail.

Executed through Jait terminal on 2026-10-17:

- Author tests: **5 passed, 0 skipped**. AST methods/options/schema references; comments/string decoys; inert injected source; UTF-8 offsets; dynamic names; source/asset/package capture; changed/new/removed files; malformed source/package; symlink rejection.
- Rust unit tests: **5 passed, 0 ignored**. Deterministic valid/pending fixture; changed/new/removed/shared files; 9 claim/owner/gap/evidence mutations; 7 malformed/path/scope/status mutations; invalid/duplicate/oversized JSON; symlink rejection. Claims are resealed in targeted mutations so the name/span/owner/status validations are exercised independently of the canonical-list check.
- Rust bin check and full manifest audit passed. Byte-identical AST recapture `--check` passed.
- Copied native binary ran from a different CWD with PATH set to an empty project directory: exit **0**. Node/Bun could not be located through PATH. The same native binary with `--require-resolved` exited **1**, reporting 407 pending source mappings, 2673 pending interface candidates and 13 category gaps.

Evidence: [audit.json](../../../.jait/artifacts/rust-continuation/interfaces/audit.json), [author tests](../../../.jait/artifacts/rust-continuation/interfaces/author-tests.log), [Rust tests](../../../.jait/artifacts/rust-continuation/interfaces/rust-tests.log), [Rust check](../../../.jait/artifacts/rust-continuation/interfaces/rust-check.log), [capture check](../../../.jait/artifacts/rust-continuation/interfaces/capture-check.log), [empty-PATH run](../../../.jait/artifacts/rust-continuation/interfaces/no-node.log), [runtime exits](../../../.jait/artifacts/rust-continuation/interfaces/runtime-checks.json), [strict rejection](../../../.jait/artifacts/rust-continuation/interfaces/strict-pending.log). All fixture files and reports are under `.jait/artifacts/rust-continuation/interfaces/`; Cargo reused the existing project-local `.jait/artifacts/rust-contract-target` build cache.

## Limits of this gate

The Rust auditor independently discovers scoped files and validates hashes, paths, evidence spans, claim-list integrity, owners and mandatory gaps. It does not duplicate the TypeScript parser, prove an arbitrary AST extraction complete, or infer omitted dynamic interfaces. Deterministic author `--check` detects additions/removals/edits to captured claims; runtime fingerprints reject changed source even when a new registration would evade the current extraction patterns. Both checks are useful, and neither grants behavioral parity. Their workflow integration belongs to the other lane and is not changed here.

Remaining R01 work: resolve the registration graph and runtime schema/event surface, review every candidate including false positives, assign individuals, attach exact executable contract IDs, reconcile out-of-tree bridges/assets/platforms, and collect passing behavioral evidence against the current gateway. Production migration remains blocked by the prerequisite; this inventory makes those gaps inspectable and drift-sensitive.
