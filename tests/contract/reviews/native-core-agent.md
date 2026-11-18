# Core agent wrapper

Reference: `packages/gateway/src/tools/core/agent.ts`.
Native: `tools/core_agent.rs` and its complete metadata asset.

The actual TypeScript wrapper is bundled with only the explicit
`createAgentSpawnTool` factory dependency replaced by a recording port. Its
metadata, eager one-time construction, raw arguments, method receiver, repeated
calls, results and thrown errors are compared with the native implementation.
The fixture does not invoke a provider or create a worker. Forty-nine reference
cases include null/scalar/object/array inputs, unknown/internal fields, arbitrary
context fields, empty repeat sequences, nested results, Error messages and opaque
JSON throws at both construction and execution.

The native context parameter is generic, so real host context (including live
cancellation/callback state) need not be serialized or rebuilt as a JSON DTO.
Reference-identity assertions compare the borrowed input and context addresses.
Result-ownership assertions compare retained string/vector/object-key allocation
addresses across return; cloning a result fails these checks. Plain JSON values
retain value semantics. The fixed native closure captures its own dependency
state, corresponding to the source's fixed inner method receiver.

Four isolated draft mutations (clone input, clone result, swallow error, remove a
required metadata field) each fail assertions, restore exactly, and bind the same
source/metadata hashes integrated into the native crate. The integrated target
passes against the actual source. Evidence is under
`.jait/artifacts/gateway-rust/core-agent-draft/`. The source-bound full gate grants
credit only after its integrated target passes.

This wrapper does not implement the agent spawn engine, provider selection,
tool execution, authorization, conversation persistence or agent loop. Those
remain explicit host dependency responsibilities and separate components. It
introduces no round cap or inferred privileges. Inputs/results use well-formed
Unicode JSON; native error variants preserve Error messages and opaque JSON
throws, rather than claiming JavaScript prototype/stack equivalence.

DeepSeek via Ollama supplied a source-free generic callback boilerplate example.
Review corrected its independent borrow lifetimes and function-pointer-only
callback type before adapting the pattern. No repository source was exported.
