# Native consent executor review

Reference: `packages/gateway/src/security/consent-executor.ts` at
`8b56824919222cc6407247191bfbdc682211e26c`, SHA-256
`c4b28b93c73c42cd13bc313023abc5a4943d882e1004e30219c3e030ebb49837`.
Original tests: `packages/gateway/src/security/consent-executor.test.ts`, SHA-256
`1acf99002682608672c99ee8fc68d0f695cb75c51a01c955fd2480f967531bed`.
Native implementation: `packages/gateway-rust/src/security/consent_executor.rs`.
Evidence applies to these source contents; the source-bound whole gate controls credit.

The executor wraps actual execution. It neither implements a tool registry nor
replaces path, node, sandbox, assessment scope, route authentication or process
limits. Its mandatory `ToolDelegate` supplies the registry or remote execution
adapter. The adapter captures its authenticated audit writer, replacing the TS
constructor's optional `audit` argument forwarding. The TS executor writes no audit
records itself; duplicating registry audit here would change behavior. Native
construction explicitly requires an execution adapter, so there is no absent
registry/delegate branch to accidentally execute against a default host target.

| Reference behavior | Native evidence |
| --- | --- |
| Resolve configured/unknown policies; trust thresholds and existing approvals | Actual TS export differential matrix, unknown-tool provenance, all consent levels, integer/fractional trust |
| Dry-run returns plan without consent/effects/trust progression | Differential denied/irreversible plans, complete object summary/preview branches and durable-audit dry run |
| Command allow/deny precedes every full-access, scheduler, approve-all or trust bypass | All four command names, canonical alias fallback, allow-list and deny-list regressions |
| Irreversible commands re-ask despite existing consent/overrides | Differential full-access, scheduler, approve-all, permission-none and rejection scenarios |
| Pending request summary/preview/risk/policy/session/action binding | Differential request snapshots plus owner/model-spoofing and durable-audit identity checks |
| Reject/timeout returns exact message/data with no execution | Differential rejection with/without reason and real timeout, no trust credit |
| Only successful effects progress trust; successful consent-once persists tool approval | Differential two-turn success/failure/throw and bypass cases; durable-audit approval retention checks |
| Delegate result/exception propagation | Real bounded marker execution; differential failed result and thrown delegate followed by successful retry |
| Cancellation checks at entry and effect boundary | Pre-cancel, cancellation during a stalled trust lookup, synchronous trust/cancel race, cancellation after approval |
| Context/audit forwarding | Captured real SQLite audit writer, reopening database; authenticated owner/session/action/root/origin/mode/cancellation/output callback preserved across guarded agent, scheduler and full-access user cases |

The driver imports the actual TypeScript `ConsentAwareExecutor` and
`ConsentManager`; it does not copy permission or consent decisions. Forty-five
scenarios compare results, request details, delegate calls, trust progression,
session approval retention, remaining pending count and a real project-local
process side effect. Fixture exceptions are captured around the real executor
call in both implementations, preserving subsequent-turn behavior. Four shared
transport guards are separate from component checks.

Native safety additions deliberately precede any consent/trust/delegate effect:
owner/session equality, explicit object argument validation and a nonzero fixed
admission semaphore. The object boundary is concrete: reference
`tools/contracts.ts:63-65` defines `ToolParametersSchema.type` as the literal
`"object"`, and `consent-manager.ts:96` requires `Record<string, unknown>`
previews. Native `execute` now rejects null, scalar and array argument values
before trust, consent or effects, including dry-run/full-access calls. This is an
intentional stricter response to invalid inputs; it does not claim the TS
method's runtime coercions for malformed `unknown` values. A cancelled or
dropped pending wait schedules cleanup on a blocking lane and retains admission
until cleanup completes. Aborting an active delegate releases admission. A real
approved subprocess fixture verifies output truncation at 512 bytes and a 300 ms
deadline; unsuccessful timeout earns neither trust nor session approval. This
checks integration with `ProcessPool`, not general shell authorization.

Two concrete issues were caught during execution and corrected: async trust
lookup originally ignored cancellation while stalled; dry-run integral trust
levels serialized as `0.0` instead of the reference JSON number spelling `0`.
The implementation now selects cancellation during trust lookup and uses the
existing JS number formatter for dry-run wire values.

The focused baseline passes 14 checks: 10 component checks and four shared
transport guards. Validation and seven isolated mutation controls are recorded under
`.jait/artifacts/gateway-rust/consent-executor-full-review.log` and
`.jait/artifacts/gateway-rust/consent-executor-mutations/`. Mutations target owner
binding, denied commands, irreversible reapproval, trust credit, once retention,
pending cleanup and effect-boundary cancellation. All seven controls fail the named test with a behavioral assertion failure;
unrelated compilation failures are rejected by the runner. Before/after native
source SHA-256 is identical:
`437dbecd44cdc9e9a97c8dbf698e6e03651573735152d0f880e55d5eef6278f5`.
The restored focused suite passes all 14 checks; its log is
`.jait/artifacts/gateway-rust/consent-executor-restored.log`. Full reference,
native, test and driver hashes are recorded in
`.jait/artifacts/gateway-rust/consent-executor-source-review.json`.

Limits: the native integration takes typed JSON object tool arguments. Arbitrary
JS primitives/arrays as default preview values are outside that boundary; the TS
unknown-input method can preserve those values while the native consent request
has an object preview. Lossless lone-surrogate inputs and a UTF-16 preview cut
through a surrogate pair are not established. The real process fixtures are
Linux/Unix evidence; supported-platform results remain separate. Audit redaction
and schema validation belong to the injected registry/worker and are not
implemented by the executor. HTTP consent ownership/SSE delivery, populated
production state, scheduler authorization and remote route activation require
their own gates. No production service or generic host shell was activated.
