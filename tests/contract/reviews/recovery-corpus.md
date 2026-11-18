# R07 executable recovery corpus

Status: concrete reference-adapter evidence delivered; **full R07 acceptance remains open** for the gaps below. Only the four assigned source files were authored. No Cargo, shared, migration, runner, account, service, or production files were edited. No gateway was started and no live messages, models, credentials, accounts, or databases were used.

## Executed evidence

On Linux x86_64, Bun 1.3.10, `bun:sqlite` SQLite 3.51.2:

- Three Rust integration tests pass. The upgrade test executes **all 76 current-definition prefixes (0–75)**, with no skipped prefixes. Prefix 0 is an empty migration ledger. Prefix construction executes the actual numbered `migrations.ts` functions in ID order, inserts their real IDs/names in `_migrations`, then closes the file. Reopening uses `openDatabase` and upgrading uses the unchanged `connection.ts:migrateDatabase`, including `verifySchema`. Prefix construction intentionally does not run today's repair safety net against old prefixes. These are synthetic, sanitized reconstructions from current source, not archived release databases or proof of a released-version support matrix.
- Every upgraded prefix has the exact current migration ID/name inventory. Rerunning the runner preserves applied timestamps and schema. Rust compares all observed schema objects (DDL, triggers and indexes), table columns, index uniqueness/columns, and declared FKs with a fresh current-schema database. Named required tables/indexes and the message-context cascade FK also have explicit Rust assertions. `integrity_check = ok`, `foreign_key_check = []`, WAL mode, and enabled FK enforcement are asserted. All 67 tables, including FTS shadow tables, have explicit coverage classifications in the metadata.
- Synthetic retained payloads span sessions, messages, memory content/provenance, audit entries, disabled schedules and settings (prefix >=1), session state (>=4), threads (>=7), security findings (>=68), thread recovery (>=70), and emergency halt state (75). These are selected fields/rows, not exhaustive domain serialization or service tests. No scheduled job or provider is executed.
- Migration 54 intentionally loses legacy memory embedding values; migration 56 restores a compatibility column with `{}` rather than the original embedding. Rust asserts this loss, preserved content/provenance, and **exact original embedding restoration from the pre-upgrade backup** where that column existed. Migration 73's `steer` to `queue` normalization is asserted along with retained theme. Prefixes already at 73+ explicitly seed `queue`; this does not claim that migration 73 changes the SQL column default or preserves every explicit settings choice.
- Each prefix creates a real SQLite **`VACUUM INTO` snapshot**, upgrades the source, copies the independent snapshot to a fresh restore path, and verifies the exact old schema, migration ledger including timestamps, version, integrity, and core retained payloads. The memory embedding check proves restoration of intentionally lost data. Additional domain fields have upgrade assertions; restore payload assertions cover the five core tables and legacy embedding, not every seeded domain. This is SQLite snapshot backup/restore, not a raw copy of an active WAL database or the online-backup API.
- An immediate transaction updates a message then violates a unique constraint: Rust requires the error and original data. An orphan context row must fail FK validation. A failing transaction rolls back both parent deletion and child cascade; successful parent deletion cascades. Reader isolation and a separate process's `SQLITE_BUSY` while a writer holds `BEGIN IMMEDIATE` are asserted; a separate writer succeeds after release.
- Before the crash, all parent database handles close. The only child connection commits one update, opens a second transaction, updates again, and kills itself with **SIGKILL** after reporting six executed statements. Rust requires that marker, SIGKILL, and surviving WAL bytes before reopening. The recorded run left **20,632 WAL bytes**. Reopening through the actual connection/runner retains `durable-before-kill` and excludes `uncommitted-killed`. A subsequent SQLite snapshot excludes a later source update on restoration. WAL + `synchronous=NORMAL` does not establish durability under host power loss.
- A malformed synthetic table makes actual migration 74 fail. Rust requires the runner's migration-specific error, no ledger entry for 74 or 75, and visible partial DDL. Removing the malformed fixture table and retrying succeeds. This establishes that the runner reports failure without a global atomic-upgrade guarantee; it does not test SIGKILL partway through each individual migration.

Rust owns every seed, operation sequence, expected value, failure expectation, comparison and mutation. The TS bridge only opens bounded project-local fixtures, invokes production functions/SQLite calls, launches bounded child calls, and returns observations. No TS assertion supplies the oracle. Source SHA-256 anchors for migrations, connection and SQLite shim are pinned in `corpus/versioned-metadata.json` and asserted by Rust. A source change requires deliberate corpus review.

## Reproduction

Run from the repository root (Cargo on PATH, or use `$HOME/.cargo/bin/cargo`):

```sh
CARGO_TARGET_DIR="$PWD/.jait/artifacts/rust-continuation/recovery/target" CARGO_BUILD_JOBS=2 cargo test --locked --manifest-path tests/contract/Cargo.toml --test recovery_corpus -- --test-threads=1
```

The adapter anchors artifacts on its module URL and Rust anchors them on `CARGO_MANIFEST_DIR`, so fixture paths do not depend on the caller's CWD. Fixtures use UUID basenames under `.jait/artifacts/rust-continuation/recovery/`; database and artifact-directory symlinks are rejected. The adapter sets test mode, clears the default DB environment override, and always passes an explicit fixture path. Each bridge has a 30-second timeout; each child call has a 10-second timeout.

Negative control (expected **exit 101**, never a green acceptance run):

```sh
R07_MUTATION=drop-message CARGO_TARGET_DIR="$PWD/.jait/artifacts/rust-continuation/recovery/target" CARGO_BUILD_JOBS=2 cargo test --locked --manifest-path tests/contract/Cargo.toml --test recovery_corpus every_current_migration_prefix_upgrades_and_restores -- --exact --test-threads=1
```

Rust adds `DELETE FROM messages WHERE id='m'` after a successful prefix-1 upgrade. The actual database observation loses that row and **`R07 retained persisted data at prefix 1` fails**. The intended assertion and exit code were verified, rather than treating any process failure as a successful mutation test. Negative artifacts have a separate `negative-` prefix and preserve ordinary passing observations. Normal acceptance, targeted Clippy with warnings denied, rustfmt check, and adapter oxlint passed.

Evidence directory, relative to the project root: `.jait/artifacts/rust-continuation/recovery/`:

- `acceptance.log`: passing three-test run.
- `canonical.json`: current adapter/backend, runtime versions, source hashes and reference schema.
- `prefix-0.json` through `prefix-75.json`, matching `*-plan.json` and `*-stderr.log`: executable plans, per-operation SQLite observations and actual migration runner logs; `open.value.path` identifies the retained sanitized source fixture; backup/restore paths are in each plan.
- `recovery.json` and `recovery-plan.json`: transaction, FK, contention, SIGKILL, surviving WAL and backup/restore observations.
- `migration-failure.json`: failed migration ledger and recovery observations.
- `negative-control.log`, `negative-control-result.json`, `negative-prefix-1.json`: exact intended Rust failure and mutated database observations.
- `clippy.log`, `fmt.log`, `lint.log`: focused code checks. `evidence-manifest.json` anchors authored source and evidence hashes.

## Supported rollback policy for this evidence

1. Quiesce every writer before cutover and take a pre-upgrade SQLite snapshot. Retain the matching application version and configuration separately.
2. For any destructive or data-transforming migration, keep cutover blocked until restoring that snapshot to a **fresh database path** passes original-version ledger/schema and retained-data checks. The corpus proves this restoration for migration 54's embedding loss and the representative seeded data. Other domain-specific irreversible transformations still require their own data vectors.
3. Roll back by stopping the upgraded writer, restoring the pre-upgrade snapshot to a fresh path, and starting the matching old application against it. Post-snapshot writes are absent from that snapshot and require a separate reconciliation decision.
4. **Unsupported:** in-place down migrations, binary-only downgrade on an upgraded file, mixed old/new writers sharing a database, or automatic merge of post-upgrade writes. Never replace just an active `.db` while reusing unrelated WAL/SHM sidecars.

This is the supported test/review policy, not a claim that the current gateway enforces a production cutover gate. Old application startup against the restored file is not executed here. The assigned four-file boundary permits evidence and policy, not production cutover enforcement.

## Remaining acceptance gaps

The metadata classifies **11 tables with representative payload-retention assertions, one migration ledger, one FK behavior table, and 54 structural-only tables**. Structural equality and an empty `foreign_key_check` do not establish data retention or business behavior for empty tables. Structural-only tables include users/secrets/invitations, provider/email/calendar accounts, provider usage, nodes and permissions, projects and project state, automation repositories/plans/proposals, browser sessions/interventions, plugins, profiles/personas, network hosts, reminders, job runs, consent/trust records, sub-agent history, session events, team rooms/messages/deliveries, GitHub App metadata, security scopes/runs/artifacts, code graph/architecture state, thread activities and FTS shadow tables. The complete table-by-table inventory is in the JSON metadata.

In particular, populated repository deduplication/remapping (migration 62), workspace-to-project conversion data, every historical field encoding, FTS query semantics, all service-level storage read/write contracts, and settings combinations remain open. Only the message-context FK has behavioral rejection/cascade vectors; the calendar FK receives structural/integrity coverage. No archived released binaries/fixtures, Node SQLite adapters, other platforms/filesystems, storage exhaustion, corrupted/truncated backups, mid-DDL kill matrix, host power loss, online backup API, encrypted backup flow, or service restore orchestration were exercised. Full R07 must remain open until those requirements are covered or explicitly accepted as unsupported by the maintainer.
