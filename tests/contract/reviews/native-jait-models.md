# Native Jait model catalogue review

Reference: `packages/gateway/src/services/jait-models.ts`. Native: `services/jait_models.rs`.
Candidate for the full source-bound gate; production activation remains separate.

The native service covers legacy four-source routing, configured instances, eager concurrent
fetch admission with stable output order, isolated source failures, exact fallback/catalogue
rules and model decoration. It includes shared instance parsing, URL normalization and the
percent-encoded Jait model ID codec. `numCtx` uses JS-number coercion and f64 semantics,
including arrays, throwing object coercion and large numbers. The 16-entry static OpenRouter
catalogue is compared with the real reference. Model fetchers are a typed component boundary;
this component does not own provider HTTP requests.

Host validation: `node tests/contract/run.mjs test --test gateway_rust_jait_models`
passes 20 component checks (18 native assertions plus two multi-vector differential tests),
plus four subprocess transport checks. The differential driver executes the real TypeScript
module, replacing only its model-fetcher import with scripted peers. Tests compare ordered
models and call arguments, unknown model properties, source failures, fallback behavior,
Unicode IDs, malformed URLs and config coercion. Host corrections fixed stale worker fixture
expectations (an absent OpenAI key skips that fetch; malformed URL normalization follows the
actual reference) and f64 fixture types; assertions were checked against reference probes.

Two restored mutations (configured group separator and static model ID) fail the differential
routing test; restored source passes all 24 checks. Logs:
`.jait/artifacts/gateway-rust/continuation-mutations/` and `continuation-model-route.log`.

No live provider traffic, transport-engine credit or production wiring. Rust strings exclude
lone UTF-16 surrogates; JS encodeURIComponent throws for those inputs, so callers must reject
invalid text at their boundary. Native static data cannot reproduce a failing lazy module import.
The fetch seam is dropped with the caller; the reference specifies no cancellation protocol.


## 2026-10-20 cloud catalogue parity refresh

The live service gained `includeCloud` (defaults true) and preserves hosted model groups.
The native public option carries explicit false as well as the default; configured and
legacy fetch seams forward that option. Legacy models preserve even an empty group (nullish
fallback), whereas configured groups use truthiness before prefixing the instance name.
The real reference driver now records the second fetch argument. Added default/false
vectors for both branches and hosted/empty subgroups. A before run lost `Ollama Cloud`
and empty headings; after that correction, the same test exposed ignored explicit false.
Both are fixed; all 24 checks pass. Evidence: `cloud-groups-before.log`,
`cloud-option-before.log`, `cloud-catalogue-final.log` under the gateway-rust artifact root.
This refresh does not claim a new component or provider HTTP activation.
