# Native team chat tool adapter

Reference: `packages/gateway/src/tools/team-chat-tools.ts`. Native `tools/team_chat.rs`
ports the complete tool factory metadata and action dispatcher over an explicit
service port. The host supplies UUIDv7 retry keys. The adapter starts no workers,
discovers no state, and does not implement TeamChatService. Authorization,
persistent identities, goal completion verification and delivery policy remain
service responsibilities. This slice grants no underlying service credit.

The driver imports the actual TypeScript factory without module substitution.
Sixty-seven scenarios compare complete results and ordered service calls. They
cover authentication before validation, schema errors and coercion, list short
circuiting, explicit/work/agent room precedence, null versus empty room IDs,
room creation, canonical member lookup, history and deliveries, goal/evidence
forwarding, chat relay attribution, each agent message kind, omitted versus empty
recipient arrays, target session and client retry key propagation, action ID
fallback, parent messages and work threads. Error and non-Error throws are
checked at every service method, including stopping subsequent side effects.
Complete metadata is compared separately against the actual factory.

Random retry keys alone are normalized to `<uuidv7>` after checking the
TypeScript key's UUIDv7 syntax. Native entropy/clock policy is supplied by the
runtime through the injected retry-key function. Ordinary retry keys, empty
strings, and all service arguments are compared without normalization.

Boundary: published JSON inputs and typed service outputs. The native schema
validator preserves the reference's coercion before dispatch. The reference's
service sync/async distinction is represented by an awaited port; service call
ordering and rejection behavior stay observable. Consent belongs to the caller's
executor and the service's existing scope checks remain required.

Evidence is saved under `.jait/artifacts/gateway-rust/team-chat-adapter/`.
Focused verification does not itself award full-gate component credit; the
migration gate owner must include this slice in a frozen source validation.

Five isolated deliberate regressions were caught and restored: wrong owner, chat
relay attribution, retry-key precedence, explicit room precedence and delivery
filtering. The restored suite, strict contract Clippy and formatting checks pass.
`bun run check:artifacts` passes. The mutation runner copies private helper code
verbatim and reuses the contract lockfile; no live production sources are mutated.
