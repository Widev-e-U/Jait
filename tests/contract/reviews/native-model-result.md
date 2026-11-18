# Native model-facing tool results

Reference: `packages/gateway/src/tools/model-result.ts`.
Native: `packages/gateway-rust/src/tools/model_result.rs` with the existing
`contracts/bounded_json.rs` JSON encoder. Target: `gateway_rust_model_result`.
Driver: `drivers/nativemodelresult.ts`, which imports the production exports.

Eleven differential tests compare projection, clipping, and final serialization.
Four bounded-transport checks and five independent native regressions also pass.
Existing context-overhead and audit/JSON contracts pass after the helper move and
shared number encoder change. The original context-overhead API remains available
through compatibility re-exports.

Projection clones the model copy, removes terminal ANSI echoes, and removes plain
terminal echoes only when canonical output is a string (including an empty string).
Only top-level string values identical to the tool message are deduplicated; arrays,
nested evidence, null data and scalar data survive. Empty object data is omitted.
Missing data remains distinct from explicit null. Differential results also assert
that the reference input remains unchanged.

Clipping uses UTF-16 lengths for both the original JSON and the candidate envelope,
retains scalar execution/evidence status, and prevents prefixes ending inside a
surrogate pair. Boundary matrices cover emoji, escapes, control characters, arrays,
scalars, exact ceilings, fractional/negative budgets, and the default 30,000 ceiling.
As in the reference, a budget below the minimum evidence envelope returns that
envelope, which may exceed the requested budget; no stricter bound is claimed.

JSON encoding preserves ECMAScript numeric property order, stable nonnumeric insertion
order, and JavaScript Number spelling through ryu-js (already a pinned dependency).
Serialized strings and preview text compare byte-for-byte, including large numbers,
negative zero, scientific notation and small exponents. For JSON-valued projections,
test numeric leaves are compared in the JavaScript Number domain: 1 and 1.0 have the
same numeric value. This normalization does not modify string outputs or previews.
Native inputs are JSON values with well-formed Unicode strings; JavaScript-only
undefined object members, cycles, BigInts, custom serialization hooks, and isolated
surrogates do not enter this typed boundary. Omitted top-level tool data is explicit.

The first differential run exposed a real partial-native defect: candidate metadata
was measured with serde JSON spelling, causing decimal counters to shorten the preview.
It now uses the same JavaScript-compatible encoder as the original payload. The first
run also exposed test transport distinctions for 1 versus 1.0 and negative zero; the
numeric comparison above corrects those without relaxing exact serialized outputs.
Evidence: `.jait/artifacts/gateway-rust/model-result-before.log`.

Four mutations are caught by both native and differential tests: dropping the only
plain terminal evidence, retaining duplicate message fields, counting UTF-8 bytes
instead of UTF-16 units, and measuring candidate metadata with serde JSON spelling.
Source restoration is byte-verified. Logs and `model-result-mutations.json` are saved
under `.jait/artifacts/gateway-rust/`, alongside `model-result-contract.log`,
`model-result-native.log`, and `model-result-clippy.log` for restored passing runs.

These are native library helpers. Production gateway dispatch, model-history wiring,
and provider execution remain separate migration work. No configuration or database
migration is introduced.
