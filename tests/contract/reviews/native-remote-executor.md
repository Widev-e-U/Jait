# Native remote tool routing

Reference: `packages/gateway/src/tools/remote-executor.ts`. Native
`tools/remote_executor.rs` implements the allowlist router, persistent terminal
branch, local-path exception, proxy error boundary, finite timeout helper and
remote-node selection. The local executor and control plane are explicit ports;
the existing native filesystem resolver provides the actual gateway-local path
check. Node selection grants no execution authority. Local and remote execution
ports must retain user/node/path scope, consent, response bounds and cancellation.
No subprocess or remote connection is started by this component or its fixtures.

`nativeremoteexecutor.ts` directly imports the actual source, actual path helper
and actual command-timeout policy. Only the provided local executor and WS object
are controlled, together with per-case timeout environment values restored in a
finally block. Differential fixtures compare complete results, thrown values,
ordered local/WS calls, projected proxy options, callback identity and streamed
chunks, context identity and terminal context copying, with unchanged request and
execution options on local branches. Native context keeps the output callback as
a capability rather than trying to serialize it.

Cases exercise every allowlisted alias and several nonallowlisted tools, missing
node binding, connected/disconnected nodes, foreground/background terminal calls,
existing local absolute reads inside/outside the project, absent paths, Linux
and Windows project roots, untouched local and proxy returns, and proxy-only
error wrapping. Disconnected terminals stop before local execution; disconnected
nonterminal tools keep the reference's fallback to the local executor. Binding
resolution checks an explicit connected node before existence, then skips the
gateway and picks the first platform-compatible node. The filesystem checks use
real repository paths with no hardcoded gateway-home assumption.

Timeout tests cover null/primitive/empty input, invalid/negative/fractional/huge
and string-coerced budgets, exact-true background mode, explicit configuration
and invalid-config fallback. Proxy JSON numbers use ECMAScript-compatible number
text. The direct numeric helper is compared after lossless JSON number encoding;
no behavior or data fields are omitted from comparisons.

Seven deliberate regressions fail behavioral assertions and are restored:
default-local allowlist, persistent terminal routing, owning node context, finite
proxy timeout, callback preservation, explicit binding and Windows-node filtering.
Focused, mutation and restored logs and `remote-executor-mutations.json` are under
`.jait/artifacts/gateway-rust/`.

The reference's legacy background-registration code is unreachable: all three
terminal aliases return through the persistent local-terminal branch before that
code, and no nonterminal is in the terminal subset. The native router preserves
that reachable behavior and reserves no background slot. A terminal background
fixture confirms it emits neither proxy nor registration events. Reference
console diagnostics are outside result comparison. Native blocking filesystem
admission is bounded and can reject overload; supported-platform, resource,
control-plane transport and production activation remain replacement gates.
