# Gateway Rust API inventory

The parity checklist is generated and committed as [`docs/api-inventory.md`](docs/api-inventory.md) and [`docs/api-inventory.json`](docs/api-inventory.json). Do not record counts in this file; they go stale.

- Regenerate: `node packages/gateway-rust/tooling/api-inventory.mjs --write`
- Check it is current: `node packages/gateway-rust/tooling/api-inventory.mjs --check` (exits 1 when stale)
- Sources: HTTP routes, WS messages and background services from the Node reference in `packages/gateway/src`; Rust routers and handlers in `packages/gateway-rust/src`; reviewed black-box tests mapped in `tooling/binary-test-evidence.json`; and path references from the web, desktop, CLI and API-client sources.

Each entry has one Rust status: `native-tested`, `native-untested`, or `missing`. An entry becomes `native-tested` only when a reviewed black-box test is mapped in the manifest and the generator finds it enabled. The generator does not run tests; a passing `cargo test` run is the pass signal. WS messages from the Node hub and gateway sources are read with the TypeScript compiler API (`tooling/ws-inventory.mjs`); dynamic frame types in send paths must have a reviewed reason in `tooling/api-inventory.mjs`. Background services are every composition start and timer or loop site in the Node source, each reviewed in `tooling/services-inventory.mjs`; an unlisted site fails generation. Client-side WS literals remain lexical candidates and can miss entries.
