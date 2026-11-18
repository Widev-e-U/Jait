# Native ACP registry

Reference: `packages/gateway/src/providers/acp-registry.ts`.
Native: `packages/gateway-rust/src/providers/acp_registry.rs`.

The registry implements npx/uvx configuration, validated per-platform binary launch
specifications, provider aliases, stable ICU name ordering, fallback preference,
owner state-directory resolution, HTTP loading and disk/memory caching. Network
collection runs as an owned task; dropping subscribers does not suspend it.
`with_ports` supplies a clock and collator for deterministic expiry and host locale.

## Verified evidence

Commands: `bun packages/gateway-rust/run.mjs test --lib providers::acp_registry`,
`bun tests/contract/run.mjs test --test gateway_rust_acp_registry`, and
`bun run test -- packages/gateway/src/providers/acp-registry.test.ts`.
Six library tests, fourteen component contract tests (eighteen executions including
four shared driver checks), and five original TypeScript tests pass on the host.
The parser comparison exercises 114 registry inputs, including required fields,
invalid records, distribution priority, aliases/deduplication, environment and
argument filtering, Unicode/canonical ties, binary paths and checksum forms.
Binary configs compare the exact encoded specification; only the interpreter/shim
pair is projected to the injected native launcher argv.

Real loopback HTTP comparisons exercise success, errors, malformed JSON, empty and
oversized bodies, BOM removal, replacement-decoded byte ceilings, twelve redirects,
headers, caching, forced loads, concurrent subscribers and fallback merging.
Separate comparisons exercise the exact one-hour TTL and invalid-UTF8 cache reads.
All reference scenarios have isolated state directories and process caches.

Host reproductions in `.jait/artifacts/gateway-rust/parallel-20261020/acp-registry/`:
- `refresh-before.log`: dropped subscribers left collection paused; cache directories
  were 0775 instead of 0700; BOM responses yielded an empty registry.
- `binary-before.log`: a registry id of `constructor` exposed the source alias
  object's inherited property. The current TypeScript
  source now uses own-property alias lookup; native matches that correction, preserving textual
  id/providerType. Host revalidation passed all 18 contract executions, including constructor-ID
  differential vectors, before refreshing the source fingerprint.
- `transport-before.log`: the default native ten-redirect ceiling failed a
  twelve-redirect chain that TypeScript accepted. Native now allows twenty.
- `transport-after.log`: all eighteen contract executions pass after corrections.

Four deliberate mutations (alias, checksum, fallback precedence, collation) fail
both library and differential suites. Every mutation is restored byte-for-byte;
logs and JSON records are in the same artifact directory. Native formatting and
strict Clippy are checked again by the source-bound gate.

## Boundaries

The launcher is a separate source component. `LauncherAdapter::Unconfigured`
withholds binary agents with explicit `ParseOutcome::unlaunchable` diagnostics;
a configured adapter supplies a real native executable and leading args. This
registry review grants no launcher installation, archive extraction, child-process
or production activation credit. npx/uvx configs refer to their external engines.
The standalone native launcher is being validated independently.

ICU root collation matches the tested en-US host; hosts with tailored locales must
supply their collator through the ports. Other scripts/ICU version combinations
and Windows/macOS real execution remain supported-platform gates. Native JSON DTOs
use Unicode scalar strings; this evidence does not cover arbitrary executable
JavaScript objects or lone-surrogate strings. OS-specific error prose is normalized
while domain warnings/errors, config fields, ordering and cache effects are exact.

No external registry or provider is contacted, and no production state is read or
changed. Full source-bound validation, rather than this review, grants component
credit. Replacement readiness remains false.
