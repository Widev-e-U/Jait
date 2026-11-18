# Native per-session Pi MCP provisioning

Reference: packages/gateway/src/providers/pi-mcp-provision.ts.
Native: providers/pi_mcp_provision.rs. Target: gateway_rust_pi_mcp.
The TypeScript driver imports the actual provisioning functions, reads the files they
create, and executes a fixture wrapper on Linux. Rust creates and inspects real files too.
Both use project-local scratch roots. Random per-session directories are normalized in
wrapper paths/text and argv; other content is compared directly.

Three production-reference defects were reproduced before correction:
1. Double quotes alone expanded shell metacharacters in real executable/config paths.
   The wrapper attempted paths containing "expanded" instead of literal quotes and
   $JAIT_PI_MARKER, and could not find the executable. The unchanged test now runs the
   intended file and receives exact --mcp-config and forwarded arguments.
2. mkdtemp ran before the best-effort error handler; a file used as the temporary root
   threw ENOTDIR during session startup. The unchanged assertion now receives null and
   one warning. Directory creation and later writes now share the same error boundary.
3. Assigning a __proto__ server to an ordinary object changed its prototype, losing the
   server from serialized config. The unchanged hasOwn assertion changed from false to
   true after using a null-prototype dictionary.

Both implementations also reject session identifiers containing path separators or NUL
within the best-effort failure boundary. Native provisioning takes an explicit authorized
scratch root and owns a unique directory; cleanup is idempotent and also runs on owner drop.
A real partial-write failure test writes config, creates a directory where the wrapper file
should be, and forces EISDIR; the factory returns none, warns once and removes all partial
files. Multiple provisions for one session have independent directories/lifetimes.

Exact comparisons cover provider detection, absent/empty server lists, default command
and ECMAScript trimming, stdio args/env, HTTP and SSE lazy lifecycle, duplicate names,
numeric object-key ordering, __proto__/constructor names, generated config, Unix and
Windows wrapper text, private directory permissions, executable Unix wrappers, command/
config quoting, forwarded whitespace/metacharacters/Unicode arguments, invalid roots
and session paths, and explicit cleanup. Native-only checks cover final-owner cleanup.

Evidence under .jait/artifacts/gateway-rust:
- pi-provision-before.log: 3 failures, 7 passes; failures match the symptoms above.
- pi-provision-after.log: the same 10 TypeScript tests pass.
- pi-mcp-restored.log: 10 executions pass (six component tests and four transport checks).
- pi-mcp-partial-write-restored.log: real partial-write failure cleanup passes.
- pi-mcp-clippy.log: strict focused Clippy passes.
- pi-typescript-check-current.log: gateway TypeScript project checks pass.
- pi-artifact-check.log: project artifact path guard passes.
- pi-mcp-mutations.json: three restored mutations fail assertions: unescaped dollar
  expansion, dropping the __proto__ server, and removing owner cleanup.

Commands:
  ~/.cargo/bin/cargo test --manifest-path tests/contract/Cargo.toml --test gateway_rust_pi_mcp
  node packages/gateway-rust/run.mjs test --lib providers::pi_mcp_provision
  node node_modules/vitest/vitest.mjs run packages/gateway/src/providers/pi-mcp-provision.test.ts

Runtime evidence is Linux. Windows wrapper text is compared by a platform fixture; no
Windows shell execution, Windows ACL guarantees or arbitrary Windows metacharacter
quoting is claimed. Pi itself, pi-mcp-adapter installation, actual MCP connectivity and
provider dispatch remain separate integration work. No global/project Pi config,
credentials or production gateway startup was changed.
