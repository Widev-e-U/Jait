# Native file and image tools

Reference: `packages/gateway/src/tools/file-tools.ts`. Native `tools/file_tools.rs`
implements all six factories, complete metadata and reachable wrapper behavior.
The explicit `resolve`/filesystem port must use a scoped filesystem resolver and
retain caller authorization; this work grants no additional filesystem engine
credit and activates nothing in the production registry.

`nativefiletools.ts` bundles the actual TypeScript factory module, replacing only
its `get-fs` dependency with explicit host operations. Actual list formatting is
retained. Contracts compare complete metadata, results, ordered calls, projected
arguments and context identity. Read/write fixtures preserve Unicode UTF-8 byte
counts, empty/CRLF/trailing whitespace, literal backslashes and NUL. Patch cases
retain empty/identical/literal search/replace and matched-result branching. Lists
compare raw data and exact eight-item previews for strings, objects, nulls and
other JSON entries. Stat retains optional fields, explicit nulls and spread
precedence. Image cases include rejected suffixes before resolution, all supported
extensions, ECMAScript whitespace trimming for detection only, original paths in
host calls, directory rejection before binary reads, byte-wise base64 and MIME,
optional fields and the exact 7,999/8,000/8,001 inline boundary. Every host stage is
checked for Error and opaque thrown values with no later operations.

Six deliberately introduced native regressions fail behavioral assertions and
are restored: inline threshold, altered resolver path, byte counts, patch match,
preview limit and missing scope resolution. Evidence is in project artifacts:
`file-tools-focused.log`, `file-tools-mutations.json`, per-mutation logs and
`file-tools-restored.log` under `.jait/artifacts/gateway-rust/`.

Boundary: published valid JSON inputs and typed filesystem results, Unicode
scalar strings and byte arrays. Arbitrary prototypes/getters, malformed non-typed
filesystem return objects and lone-surrogate input strings are outside this port.
Basename follows the Linux reference host; supported-platform acceptance and
registry/transport activation remain separate replacement gates. Full frozen
validation controls component credit.
