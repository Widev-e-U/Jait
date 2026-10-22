# Native messaging channel declarations

Reference: `packages/gateway/src/channels/types.ts`. Native records, callbacks and
connector traits represent every exported declaration. This adds no connector,
account, network transport, pairing workflow or production channel activation.
Credential redaction and execution consent remain the caller's responsibility.

The test driver writes isolated project-local TypeScript modules importing the
actual source declarations. Strict TypeScript compiles positive fixtures, exact
parameter/return tuple assertions for all connector callbacks/methods, and
expected-error cases for readonly fields, invalid status/config, missing inbound
flags, missing nullable QR and invalid live-message results. A runtime import
checks that the original declaration module has no runtime exports. TypeScript
source mutation is detected by these fixtures, not a duplicate native schema.

Native roundtrips compare all 33 source-typed values across ten wire families:
statuses, details, pairings, inbound messages, choices, outbound messages, command
entries, pair options, setup guides and config. They retain all thirteen config
fields, missing/false/empty values, missing/empty choices, Unicode strings,
required nullable QR and ECMAScript numeric serialization including nonfinite
values. Required nullable QR decoding rejects a missing field. Connector trait
signature checks exercise required operations, callback signatures and the
absence of optional methods; an optional method's presence is separate from
its async result, including a nullable live message ID.

Four mutations are caught/restored: invalid status naming, lost config property,
omitted null QR and a changed TypeScript sendLive return type. Focused validation
has seven checks (three declaration/trait tests and four shared bounded driver
checks). Evidence: `.jait/artifacts/gateway-rust/channel-contracts-*.log` and
`channel-contracts-mutations.json`. The full source-bound gate controls credit.

Boundary: declared fields and Unicode scalar strings. Structural TypeScript
interfaces are not runtime validators; native decoding is not a replacement
for request validation. Extra runtime properties, getters/prototypes and invalid
optional-null inputs are outside these fixtures. Nonfinite numbers share the
null JSON representation and decode canonically as NaN, so internal numeric
identity is not promised after JSON roundtrip. Actual connectors/managers and
their credential/authorization paths remain separate components.
