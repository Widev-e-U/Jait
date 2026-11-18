# Native security and scheduler public contracts

Sources: `packages/gateway/src/security/contracts.ts` and
`packages/gateway/src/scheduler/contracts.ts` are type-only modules, with no
runtime exports. Their native equivalents declare the consent/audit/trust DTOs,
scheduled job/create DTOs, and asynchronous service traits. Native Result errors
represent rejected promises; requestConsent's successful None represents null.

`nativedomaincontracts.ts` builds fixtures with satisfies against the actual source
interfaces. A strict no-emit compiler check includes expected errors for invalid
trust literals and generated fields on create input. Three focused contract checks
compare native DTO serialization with those typed fixtures, verify empty runtime
exports, and compile every service method's arguments and asynchronous return type.
The seven target executions include four shared driver-harness checks. One native
unit test validates the 0..3 trust union, including decimal/exponent number spelling.
Optional strings preserve absence versus present empty strings; no date parsing,
cron interpretation or consent decisions are introduced into these type contracts.

These are two distinct inventoried declaration components, not new security or
scheduler engines. No engine implementation, consent path, authorization scope,
background execution or production registration is credited. The fixture's compile
stubs are test-only and never invoked. Existing audit database records remain in
services/audit.rs because their persistence shape differs from this public contract.
The source-bound gate controls component credit.
