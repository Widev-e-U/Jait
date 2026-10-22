# Core filesystem, terminal and web wrappers

The native `core_io` module implements the complete wrapper control flow of
`tools/core/edit.ts`, `execute.ts`, `web.ts` and `read.ts`. The underlying engines
are explicit host ports: filesystem resolution and operations, terminal execution,
web search and URL fetch. This grants no credit to `get-fs.ts`, filesystem surfaces,
terminal-tools, browser-tools or the project search engine. The host retains scope,
consent, credentials, URL protection and cancellation. No real shell commands,
filesystem writes or outbound requests are executed by the differential fixtures.

The driver bundles the actual reference modules. Only their explicit dependency
imports are replaced; list formatting comes from the real implementation. The
metadata asset is extracted from those actual factories and compared on every case.
The terminal fixture verifies positional factory wiring before executing. Generated
fixture modules are content addressed under the source root's `.jait/artifacts/`.

Contracts cover mixed edit modes before filesystem resolution, validation after
resolution, exact patch forwarding, misses, Unicode UTF-8 byte counts, preserved
whitespace/newlines, host error/non-Error behavior, terminal field projection and
background null omission, untouched host results, context identity, web inference,
search/single-fetch/multiple-fetch arguments, body omission only for multiple URLs,
concurrent settlement with stable output order, URL overrides, duplicate URLs,
partial/all failures and the eight-entry preview. Read contracts cover directory
entries and previews, stat failure fallback, final list failures, empty files,
trailing newline lines, out-of-range/reversed/fractional line numbers, line limits,
independent byte limits, Unicode byte counts and one oversized initial line.

Five deliberate native mutations are caught by assertion failures and restored:
terminal projection bypass, edit character-count substitution, multi-fetch body
forwarding, line cap expansion/change and byte cap expansion. The byte-limit
mutation initially survived because the first fixtures hit the line cap earlier;
independent long-line fixtures now catch it. Restored contracts pass.

Boundary: these wrappers accept JSON object requests under their published tool
schemas and JSON-compatible host results. The native strings are Unicode scalar
strings; arbitrary JavaScript getters/prototypes, cyclic graphs and lone UTF-16
surrogates are not exposed by these ports. Native read preserves the reference's
first-oversized-line exception; its byte cap is intentionally not a hard bound on
that one line. This work does not change the production TypeScript gateway.

Focused evidence is under `.jait/artifacts/gateway-rust/core-io/`: restored.log,
mutation-results.json, clippy.log, native.log and a source-free DeepSeek review.
Only a completed source-bound full gate grants verified checkpoint credit.

Responsive execution update (2026-10-21): the wrapper forwards `yieldTimeMs`
without coercion alongside the execution deadline. Native metadata was
regenerated from the actual TypeScript factory, and the differential field
projection case supplies a non-default initial wait. The terminal execution
engine remains an explicit host port; new Rust-owned lifecycle acceptance cases
in `gateway_rust_terminal_execution` exercise the real TypeScript tool separately.
