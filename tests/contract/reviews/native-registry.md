# Native registry, discovery ranking and audited dispatch

Reference: `packages/gateway/src/tools/registry.ts`. Native `tools/registry.rs`
implements registration/replacement/removal, plugin provenance, default metadata,
weighted lexical/synonym/fuzzy discovery, bounded input/corpus/token work,
visibility filters, explicit System One ranking and validated audited dispatch.

`nativetoolregistry.ts` bundles the actual source with its actual validator, plugin
conversion and shared page catalog. Only UUID allocation and the explicit model
ranking service are controlled. Complete definitions/results, list ordering,
rank scores/terms, model descriptions/options/candidate identity, mutable input
wire, UTF-16 keys/messages, context copying/capability identity and ordered audit
and ID events are compared. No model request or tool engine executes in fixtures.

Eight focused domain tests plus four shared transport checks cover category and
source/tier combinations, inference and explicit overrides, replacement position,
plugin provenance, aliases, disabled and MCP visibility, OS core exclusions,
lexical/synonym/fuzzy/substring matching, locale tie ordering, budgets and limits,
prototype-like query words, model candidate caps/score mutation/identity fallback,
UTF-16 head/tail splits, model failures, input coercion/validation exceptions,
action IDs, links, mutation snapshots, unknown tools and audit failure boundaries.
Start/validation audit failures propagate; result audit failures enter the error
boundary, and error-audit failures propagate. Absent audit ports do not consume
completion/error IDs. Existing page-link arrays and primitive/null data remain
unchanged. Lossless validated JSON and malformed UTF-16 strings reach execution
and audit through the owned validator's wire representation.

Twelve deliberate regressions exercise external risk/consent inference,
replacement position, disabled discovery, synonym weighting, query budget,
model identity fallback, MCP core exposure, initial OS exclusion, page links,
action context and result-audit status. Behavioral assertion failures and restored
results are recorded in `.jait/artifacts/gateway-rust/registry-mutations.json`
and sibling logs. The full frozen gate controls component credit.

The registry is an internal capability, not an authorization layer. Its caller
must enforce user/project/node/target scope, consent, cancellation and engine
bounds. Registration does not activate MCP/WS/HTTP transports or wire native
engines into production. Explicit rankers retain model credential/privacy policy;
the injected ID generator must supply production-quality IDs when activated.
Typed metadata is valid JSON with valid declared pages; arbitrary JavaScript
object/function identity outside the explicitly preserved ranked-candidate and
capability identities is not a native transport promise. Supported-platform,
resource and production replacement gates remain separate.
