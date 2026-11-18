# Native DeepSeek agent cadence contracts

This change belongs to R15 (native agent execution). The Rust-owned cases are in
[vectors/agentloop.json](../vectors/agentloop.json); the test-only TypeScript bridge
[drivers/agentloop.ts](../drivers/agentloop.ts) invokes the actual prompt registry,
serializers, stream parsers, queue, executor and continuation loop.

The existing internal-reference runner discovers this lane automatically.
Run `bun run test:contract:internal` for Rust assertions and a source-bound report.
The JavaScript vector verifier is a fast diagnostic, not Rust execution evidence.

## Required behavior

- DeepSeek bare API, namespaced/routed and Ollama cloud model IDs select the native
  DeepSeek prompt, ahead of generic Ollama fallback. Thread-style endpoints without
  a backend label work too. Unrelated local models keep their current selection.
- Instructions explicitly allow independent read-only tool calls in one response,
  wait for dependencies, preserve ordered terminal/mutating actions and ask for
  concise progress updates alongside continuing tool calls.
- The native prompt does not request a second thinking transcript or apply external
  CLI steering. ASK and PLAN mode restrictions survive selection.
- One provider response can carry progress text plus two independent reads. Both
  execute concurrently by default, with exactly one result per call, before the
  second model request. Assert content, event order and actual outbound history.
- Native Ollama arguments are objects and results retain tool_name. Compatible
  endpoints retain call IDs and reasoning_content. Continuation preserves native
  reasoning, including a 20,940-character fixture exceeding the normal persistence
  cap. This is synthetic protocol data, not a captured reasoning transcript.
- Mutations remain barriers between read batches. Dependent calls still require
  separate model requests. A failed sibling does not discard successful results.
- Cancellation before inference makes no request or tool execution. An incomplete
  native Ollama stream must not execute the tool calls it partially delivered.

The 13 stable IDs begin with `internal.agentloop.`. Do not drop them when replacing
the reference bridge. Reconstruct these observations against the native Rust
implementation with the same fixtures and Rust-owned expected results. Preserve
the production validation/consent/scope/cancellation path. Passing this reference
profile proves current TypeScript behavior, not completed Rust runtime parity.

## Reproduction and scope

Before changing production source, the Ollama selection case observed resolver
`ollama`, and both API selection cases observed `default`, instead of `deepseek`.
The Ollama template instructed one tool call at a time; the fallback requested
an extra thinking envelope. Those three cases failed before the fix and pass
after it. Existing batch execution already passed before the fix.

The production change is a DeepSeek prompt resolver and its registration. It
does not change generation settings, disable native reasoning, execute speculative
stream fragments, introduce code orchestration, or change consent/scope policy.
Deterministic tests prove selection and protocol behavior; an actual same-model
workload comparison remains necessary to quantify perceived latency or batching
frequency. No real model API calls are made by this lane.

Codex's completed-item dispatch is a separate adapter feature. The current Ollama
path is native NDJSON and its terminal completion is validated before execution.
A future Responses adapter must test item boundaries, exactly-once dispatch,
partial failures, ordering, cancellation and existing authorization before enabling
overlapped execution. WebSocket continuation and nested code execution are separate
features with their own provider and execution contracts.
