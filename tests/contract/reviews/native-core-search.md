# Core search wrapper

Reference: `packages/gateway/src/tools/core/search.ts`. Native:
`packages/gateway-rust/src/tools/core_search.rs`.

This implements wrapper routing, presentation, file-root rewriting, result-limit
normalization, retry and error semantics. Root lookup, filesystem stat and the
search engine are explicit host ports. The host owns authorization, process argv,
gitignore handling, candidate collection/ranking, timeouts and filesystem limits.
No `get-fs.ts` or `services/project-search.ts` engine credit is claimed.

The reference driver bundles the actual wrapper and actual exported limit helper.
Only dependency imports are isolated. Bun leaves built-in modules external before
plugin resolution, so a checked replacement changes exactly the stat import's
module specifier; wrapper statements and Node path operations remain unchanged.
Generated fixture modules are source-root-anchored and content addressed.

Differential contracts compare metadata, full results and ordered port calls over
absolute/relative/dot/dot-dot/repeated-slash/trailing-slash/root/backslash/literal
shell-looking paths, file-target directory/basename rewriting, default/explicit
project roots, missing/stat failures, default/null/fractional/negative/large limits,
file/content modes, empty/singular/plural results, limited-result messages, output
projection, nullish option forwarding, root errors outside the result handler,
search errors, typed unavailable reasons and non-Error throws. Empty content
results retry the opposite regex mode once; retry errors/wrong modes retain the
first empty result. A successful initial result never retries.

Four mutations are caught/restored: absolute path handling, raised maximum limit,
reversed retry condition and removed file-root rewrite. Restored contracts pass.
Evidence: `.jait/artifacts/gateway-rust/core-search/`.

The pure POSIX resolver was delegated to DeepSeek through Ollama using a generic
specification with no repository source, then reviewed and tested against actual
Node path operations. The source-free prompt/response is saved under
`.jait/artifacts/gateway-rust/core-io/deepseek-path-helper.json`.

Boundary: Linux/POSIX execution with absolute resolved project roots, published
schema numeric limits and scalar Unicode JSON inputs; platform-specific Windows
paths, arbitrary JS coercion/prototypes and malformed engine responses are outside
this typed wrapper port. The production TypeScript gateway remains unchanged.
Only the full source-bound gate grants checkpoint credit.
