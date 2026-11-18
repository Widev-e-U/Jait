# Native on-demand discovery tools

Reference: `packages/gateway/src/tools/meta-tools.ts`. Native
`tools/meta_tools.rs` supplies both factory definitions and discovery execution,
with `NativeDiscovery` connecting directly to the native registry and explicit
ranking port. No engine executes while listing or searching.

`nativemetatools.ts` imports the actual factories, preview helpers and name
converter. Spy fixtures compare complete results/messages, full catalogues and
schemas, ordered registry calls, supplied MCP candidates, API-key forwarding and
ranking error propagation. Factory metadata is compared without projections.
Integration fixtures use actual TypeScript/native registries; the reference
integration adapter deliberately selects the lexical ranking path, paired with
an explicitly disabled native ranker, so it never consults live model settings.
The registry's separate contract suite covers model ranking semantics.

Six domain tests plus four shared driver checks cover empty lists, category
filtering, exact MCP requester matching, visibility and category insertion order,
core/external badges, 60-line catalogue previews, full unabridged data, whitespace
and UTF-16 description clipping, eight-result search previews, no matches,
missing/null/fractional/negative/oversized limits, complete schemas and dotted
provider names, nullish tier/category defaults, score rounding including negative
ties and near-tie f64 values, very large scores and ranking errors. Integration
checks compare native/reference registry normalization, exposure and ranking.

Eight deliberate regressions target MCP visibility, category filtering, catalogue
preview budget, full catalogue data, search limit cap, score rounding, provider
names and search preview length. Assertion failures, restoration and successful
reruns are recorded in `.jait/artifacts/gateway-rust/meta-tools-mutations.json`
and sibling logs. Full frozen validation controls component credit.

Metadata and inputs follow the typed contracts and outer registry validation.
Discovery does not grant execution permission. The outer caller retains scope,
consent and cancellation; the ranking adapter retains model privacy and response
bounds. These factories do not activate transport endpoints or native engines,
and grant no reference-test reconstruction or production replacement credit.
