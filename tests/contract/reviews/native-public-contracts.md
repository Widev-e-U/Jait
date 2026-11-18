# Native memory, session and surface public declarations

References: `memory/contracts.ts`, `sessions/contracts.ts`, `surfaces/contracts.ts` under the
TypeScript gateway. These three type-only inventory components add no storage/router/surface
engine behavior or duplicate engine credit. Native declarations live in the corresponding
`contracts.rs` modules. Production routing remains unchanged.

The declarations cover every record, optional field, union, asynchronous method and callback.
Session descriptors and router signatures preserve nullable active sessions. Public memory
scopes are closed; legacy unknown scopes remain data in the existing storage record and require
explicit validation before conversion into a public record. Save inputs convert to the existing
native engine. Date arguments use a canonical TimeClip representation, including invalid dates,
fraction truncation and the full positive/negative ECMAScript range; serialization matches Date.
Search arguments retain Date values as arguments rather than treating them as plain strings.

Surface start inputs reuse the real registry input and retain arbitrary surface-specific fields.
Snapshots expose primitive-only metadata, with an explicit fallible conversion from the more
permissive existing registry storage shape. Optional output/state callbacks occupy assignable
native slots. Read-only identities are getters; fallible native results represent source throws.
Asynchronous service declarations do not pretend to implement those services.

`node tests/contract/run.mjs test --test gateway_rust_public_contracts` passes five component
checks plus four transport checks. Real TypeScript type-only modules have no runtime exports.
Positive/negative fixtures compile with strict TypeScript: wrong scope, session id, metadata
and callback types are rejected. Native checks roundtrip all valid record fixtures, typecheck
every asynchronous signature, exercise callback slots, validate storage-to-public conversions,
and compare Date serialization at normal, invalid and TimeClip boundary values. The existing
registry/engine tests remain full-gate dependencies, not newly claimed engine implementation.

Limits: these are public contracts only; native async engine wiring and concrete surface adapters
are separate work. JSON numeric metadata uses serde_json's finite wire-number representation;
non-finite JS numbers serialize as null and can be represented by the null metadata variant.
Unknown native storage scopes are not silently mapped into project/contact. No authorization
or scope checks have been removed or reinterpreted.
