# Native email and desktop public declarations

References: `packages/gateway/src/services/email/types.ts` and
`packages/gateway/src/os-control/types.ts`. These modules export declarations
only. Native email and desktop contract modules add records, enums and async
traits without activating transports, drivers, mail delivery or OS execution.

Email covers all thirteen shared re-exports and every MailboxClient operation,
including anonymous send-result IDs. Required nullable fields serialize as null;
optional account error preserves missing, explicit null and string distinctly.
Discovered settings have a separate password-free server record. Real credentials
are never used in tests; token/password fixtures are explicitly fictional.

Desktop covers screenshots, Buffer JSON shape, all optional operation arguments,
driver identity, async operations, sandbox run results and typed driver bindings.
Options do not impose validation absent from the source declarations: negative,
fractional and non-finite numeric values remain expressible. Mouse-button,
scroll-direction, provider/status and driver unions are closed. No implementation
or consent policy is supplied by these traits.

A shared numeric codec emits ECMAScript JSON number text, including -0 as 0 and
non-finite values as null. The latter wire form is inherently lossy; native decode
canonically uses NaN. Optional null values decoded from non-finite source numbers
remain present, while missing values remain absent. No new runtime numeric-policy
claim is made.

The TypeScript fixture imports the actual gateway declarations, checks every
method/readonly field, and compiles positive and expected-error cases with strict
TypeScript. It uses the installed Node declaration package from the dependency
cache so Buffer, process and transitive sandbox imports are checked against real
types. Missing ambient Node types initially failed the fixture (including an
unused expected-error marker); explicitly selecting the installed declarations
restored a meaningful strict check.

Native contracts roundtrip the source-generated JSON for every record/option and
probe invalid unions, malformed Buffer records and typed optional/null cases.
A native unit check covers numeric wire canonicalization and rejects wrong JSON
types. Native trait signature checks compile against every method and binding.
Dynamic imports prove the two reference modules have no runtime exports. The
focused target has four component checks plus four shared transport checks.

Boundary: known DTO fields and Unicode scalar strings; arbitrary JavaScript
getters/prototypes, lone surrogates, extra runtime object properties and object
identity are host-adapter concerns. Structural TypeScript declarations are not
a runtime JSON validator, and these records do not claim to add one. Mailbox/OS
engines, platform-specific drivers, authorization and activation remain separate
inventory rows. Full source-bound gate success controls declaration credit.

Strict Clippy passes with all native targets and warnings denied. The numeric
unit check passes. Three mutations are caught: dropping explicit null account
errors, changing Buffer's wire tag and changing the valid scroll-direction
spelling. The last rejects a positive source fixture during deserialization; the
runner explicitly recognizes that behavioral failure separately from compilation.
After restoration, all eight focused checks pass and source hashes match. Evidence:
`.jait/artifacts/gateway-rust/mail-os-draft/mutations.json`.
