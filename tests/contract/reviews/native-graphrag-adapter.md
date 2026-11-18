# Native GraphRAG export adapter

Reference: `packages/gateway/src/services/code-graph/graphrag-adapter.ts`.
Native: `services/code_graph/graphrag.rs`. Both runtime exports are implemented:
graph projection and the four-file GraphRAG export. No Graphify process, source
code reader, database, model or GraphRAG indexing runtime is started here.

The standard bounded bridge executes the unchanged source exports. Eleven checks
pass (seven component checks and four bridge guards). Projection tests compare
complete entities, relationships and text units for empty graphs, optional source
locations, duplicate IDs, missing endpoint nodes, property overrides, all confidence
labels, nullish/zero/negative/fractional scores, degree addition and source-only
edge files. Duplicate node lookup is last-wins while entity output retains input
order. A 124-node case retains every ID while capping the symbol summary at 100.

Unicode filename sorting uses UTF-16 order; the corpus deliberately puts a private
use character beside an astral character where scalar ordering differs. Token
estimates also count UTF-16 units. JSONL passes through the native ECMAScript
serializer for numeric formatting and integer-property ordering, including nested
properties. Normal and empty exports compare all four file contents byte for
byte: JSONL newline rules, field order, metadata and pretty-printed manifest.

Export tests control only the clock, use real files under project artifacts,
and exercise absolute and relative directory arguments without changing the Rust
test process CWD. Reference subprocess CWD is aligned explicitly. Missing versions
fail before directory creation. An existing output file produces the same filesystem
error category. A native failure fixture verifies every sibling write is attempted
when one target is a directory. Filesystem work belongs on the caller's bounded
blocking lane; four scoped writers preserve concurrent-attempt behavior.

Two caught/restored mutations prove UTF-16 sorting and the summary limit. Restored
GraphRAG and session HTTP suites pass (11 and 21 checks); strict native Clippy
passes. Evidence: `.jait/artifacts/gateway-rust/graphrag-standard.log`,
`graphrag-mutations/`, and `graphrag-clippy.log`. Full gate controls credit.

Limits: Linux filesystem/error categories and finite JSON DTOs with well-formed
Unicode are verified. Engine-specific exception wording, arbitrary JavaScript
prototypes, post-projection nested-object alias mutation and other-platform path
semantics are outside these wire-data checks. Multiple simultaneous write errors
have no portable first-error ordering guarantee. The native DTO owns output values.
Output-directory authorization remains at the existing caller boundary. This
adapter adds no route/tool registration or path-policy bypass.
