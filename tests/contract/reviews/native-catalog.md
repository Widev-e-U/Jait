# Native live capability catalog

Reference: `packages/gateway/src/tools/catalog-tools.ts`. `tools/catalog.rs`
implements the factory metadata and complete discovery adapter over an explicit
registry port. The embedded page contract is copied from the actual shared
capability catalog and compared in full on every contract run. The native adapter
implements longest-prefix/category/explicit-feature page membership; ranking and
MCP exposure remain the live registry's capabilities and receive no engine credit.
No tools execute, no services are discovered and no running catalog is replaced.

`nativecatalog.ts` imports the actual factory, shared page helpers and production
name converter directly. There are no module replacements. Only the registry's
list, listForMcp and search boundaries are scripted; the comparison includes every
port call and candidate ordering as well as the complete returned metadata/data.
Fixtures compare all page IDs, overview/detail links and supported parameters,
features and available/missing tool references, uncatalogued tools, risk/consent
defaults, query normalization and stopwords, stable score ties and top-three page
selection, exact-page versus registry-search selection, negative/fractional/huge
offsets, fifteen-tool pagination and three-schema selection, MCP visibility,
explicit feature membership despite a different tool page and empty registries.

Large schemas exercise ASCII, quotes/backslashes/newlines, accented text and
supplementary Unicode. The budget uses JavaScript-compatible JSON serialization
and UTF-16 units; excess matches are removed in the source order and their exact
names added to schemaLookupRequired. Navigation/features remain as in the source,
including cases where base metadata alone exceeds the schema-dropping threshold.
All fixture/artifact paths are project-anchored and the existing driver limits
remain active.

Seven deliberate regressions are caught and restored: MCP selection, explicit
feature membership, available references, top-three page selection, counting
Unicode scalars instead of UTF-16, wrong schema lookup refs and lost pagination
offset. Evidence: catalog-mutations.json and per-mutant/restored logs under
`.jait/artifacts/gateway-rust/`. Five behavioral/metadata checks plus four shared
transport checks pass after restoration. Full frozen validation controls credit.

Limits: valid typed JSON registry metadata and synchronous pure registry ports.
The source adapter is unbounded in registry size and has no cancellation protocol;
this native component does not establish stronger resource acceptance. General
registry authorization/search ranking, MCP transport, supported-platform behavior
and production activation remain separate components and replacement gates.
