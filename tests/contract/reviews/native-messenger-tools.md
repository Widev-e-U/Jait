# Native Messenger tool factories

Reference: `packages/gateway/src/tools/messenger-tools.ts`, importing the shared
command schema and connection-link helper in `packages/shared/src/messenger.ts`.
Native `tools/messenger.rs` implements all seven factories: connect, status,
rooms, messages, search, send and open. Full metadata is captured from the actual
factory and compared independently, including always-consent writes and the
credential-free connection workflow.

The adapter reuses the existing native bridge command parser for acceptance and
defaults. Rejected inputs receive schema-compatible, ordered diagnostics for
required fields, types, UTF-16 lengths, integer/range checks, room prefixes,
search trimming, message whitespace, Matrix user IDs and strict unknown keys.
JavaScript object spreading and numeric property ordering are preserved. A
caller-supplied action cannot replace the selected factory's action.

Connect accepts only homeserver and optional username. It enforces the original
UTF-16 bounds, HTTPS or loopback HTTP, and rejects embedded credentials, nonempty
queries/fragments and additional fields. URL serialization, removal of one final
slash, private username prefilling and URLSearchParams form encoding are compared
against the actual shared helper. It neither logs in nor sends credentials.

The TypeScript driver imports the real factory and schema without module
substitution. Only bridge effects are scripted. The fixture compares 384 cases,
including exact results, ordered bridge arguments, missing/empty owners, original
signal identity and abort state, sync throws, non-Error throws and async rejection.
Valid commands retain exact content and normalized defaults; invalid commands
produce no bridge effects. Fixtures are batched below the bounded driver input
limit to avoid repeated interpreter startup.

A concrete constructor binds the existing native MessengerBridge. An integration
test exercises gateway dispatch, owner forwarding, shared cancellation identity,
pre-aborted sends, missing authentication and shutdown using an in-memory handler.
No network connection or message delivery is performed. The adapter never retries
uncertain delivery. Executor consent, user ownership, assistant-access policy,
transport limits and gateway/browser selection remain bridge/executor duties.
This grants only tool-factory credit; the existing bridge is a separate component.

Evidence is saved under `.jait/artifacts/gateway-rust/messenger-tools/`. Focused
checks alone do not grant shared frozen-gate credit. No production activation,
database schema or environment change is part of this slice.
