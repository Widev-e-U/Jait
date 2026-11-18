# Native ClawHub store HTTP adapter

Reference: `packages/gateway/src/routes/store.ts`. Native:
`packages/gateway-rust/src/routes/store.rs`. Opt-in adapter; no production mounting
or installer/client implementation credit is claimed.

The adapter preserves search fallback (`q`, then `sort`, then the default query),
JavaScript number coercion/default/cap for limits (including repeated query keys),
ignored cursors, installed ID matching, ordered concurrent detail enrichment,
three-second optional lookup deadlines, detail overlays, install version forwarding,
and the distinct uninstall 400/error 500 envelopes. Uncaught read failures retain
the Fastify error envelope. Shared native body parsing and authentication precede
host operations; malformed percent encodings fail before dispatch.

All registry, local registry and installer operations are explicit `StorePort`
effects. The composing host must preserve installer consent, target paths and
ownership and enforce outbound request policy. Its asynchronous waits do not own
started effects: host work must remain supervised after an optional lookup times
out or a caller disconnects. Dropping a wait is no evidence of effect rollback or
permission to retry. This adapter neither downloads/extracts archives nor runs an
installer. The production server-wide origin/node policy remains a composition
gate. Valid finite-number JSON registry records form the response boundary; invalid
UTF-16 strings and JavaScript object identity/prototypes require separate runtime
representation work.

`gateway_rust_store_http` binds the actual TypeScript route source to scripted
ports. Only the exact installer import is replaced, guarded to occur once; Bun
transpiles the remaining route source unchanged. Fastify and its actual body/query
parsers serve reference requests. The fixture installs the existing authentication
helper as a pre-handler, corresponding to the production server boundary.
Native requests use a loopback Axum server, isolated SQLite owner record and signed
credentials. Assertions compare status, body and ordered host invocation arguments.
The test harness normalizes integral floating-point argument representations to
JavaScript JSON number spelling; it does not normalize response behavior/errors.

Coverage includes default and explicit search/sort, empty/repeated query keys,
negative/zero/fractional/non-numeric/infinite/hex/capped limits, Unicode and encoded
slugs, installed overlays, missing slugs, stats/version enrichment, optional lookup
failure/deadline, explicit/omitted/null install versions, arbitrary caught thrown
values, read and write failure envelopes, auth/cookie admission and malformed bodies
and percent encodings. No registry request, filesystem installation, provider call
or live user data is used.

Validation evidence is recorded under `.jait/artifacts/gateway-rust/store/`.
Focused comparisons, deliberate mutation controls and the full frozen-source gate
must pass before new checkpoint credit is reported. Broader platform, real host
ports, load/recovery and production replacement gates remain open.
