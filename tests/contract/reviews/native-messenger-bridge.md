# Native owner-scoped Messenger dispatch

Reference: `packages/gateway/src/services/messenger-bridge.ts` and the shared
`messengerCommandSchema`. Native implementation: `services/messenger_bridge.rs`.

The native bridge preserves gateway-handler precedence, owner identity, unique
active browser selection, revocation on re-registration, the global 32-request
ceiling, synchronous send callbacks, one-shot completion, cancellation, timeout
uncertainty and stop semantics. It never retries. Completion requires the exact
selected browser and its current owner. Invalid replies are ignored; oversized
JSON replies fail closed; only ok/message/data survive and messages retain the
first 2,000 UTF-16 units, including a possible lone surrogate.

Seven differential tests execute the actual TypeScript class and shared Zod
schema. Hundreds of schema inputs cover strict fields, action discrimination,
defaults, ranges, Unicode lengths, whitespace and invalid types. Browser callbacks
are simulated: these tests send no Matrix messages and contact no services.
They compare selected-client sends, parsed commands, expiry values, pending
counts, Promise/future results and cleanup. A fixed clock and explicit virtual
ticks remove real delays; generated request IDs are represented by logical fixture
IDs. JSON numbers are compared after ECMAScript serialization so integral f64
expiry values match JavaScript numbers without changing their values.

Five native tests additionally cover abandoned receivers, retained pending-state
lifetime after dropping the bridge, synchronous abort precedence, deep JSON and
multi-threaded timer delivery. Reproduced fail/pass regressions corrected a timer
that could interrupt a synchronous send callback and a recursive JSON graph
conversion that panicked on a valid 600-level browser reply. The reply-size check
now counts JSON UTF-16 units iteratively and stops at the ceiling. Pending requests
retain insertion order when revoked. Callbacks execute with registry locks released.

Three isolated mutations remove the owner binding, raise capacity to 33 and
change clipping to 2,001 units. Each causes a differential mismatch; each restored
run passes. Evidence: `.jait/artifacts/messenger-bridge-port/mutations.json`.
Focused native tests, TypeScript comparisons, driver typechecking, lint and strict
contract Clippy pass. The full source-bound gate must pass before granting credit.

The bridge requires the native Tokio runtime for pending browser requests. The
runtime must register authenticated browser connections and install its native
Messenger gateway handler. No production WS/Matrix adapter or tool activation is
claimed here. JSON inputs use the existing native serde Value boundary; arbitrary
JavaScript objects/prototypes and cyclic browser replies are outside that boundary.
Supported-platform and complete client workflows remain separate migration gates.
