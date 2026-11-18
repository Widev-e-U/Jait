# Native tool input validation

Reference: `packages/gateway/src/tools/validate.ts`. Native:
`packages/gateway-rust/src/tools/validate.rs`. This component implements parameter
validation, without granting execution, scope, or consent.

The public validator preserves error order/text, root nullish handling, nullable
required fields, union selection before coercion, numeric/boolean/JSON coercion,
unknown schema types, enum string conversion, bounds, JavaScript RegExp patterns,
nested objects/arrays and conditional allOf checks. Object identity is shared
inside conditional shallow copies, including mutations made by failing conditions
and mutations completed before exceptions. Non-finite native numbers are retained
until serialization. Raw input parsing and nested JSON parsing use the existing
ECMAScript JSON parser; UTF-16 strings, lone surrogates and overflow numbers stay
intact. `stringify` provides lossless transport output; `value` explicitly offers
a lossy serde_json projection. Integer-index property order matches JavaScript.

The actual-source adapter calls the production export and normalizes only thrown
exception wording to its exception class. It returns exact JSON.stringify strings
for validation outcomes, mutated inputs and own keys, preserving surrogates that
the Rust test transport's serde_json data domain cannot directly decode.
602 cases are authored in `tests/contract/vectors/native-validate.json`, including
the original 514-case source exploration, nested errors, nullable behavior,
non-finite input, malformed/ECMAScript regexes, supplementary characters,
conditional shared and scalar mutations, exception side effects, numeric keys,
raw overflow and lone-surrogate strings and keys. The native contract checks each
case independently in bounded actual-source batches.

Evidence under `.jait/artifacts/gateway-rust/validator-draft/`:
- `contract-raw-final.log`: 602 comparisons and four transport guard tests pass.
- `clippy-raw.log`: strict all-target Clippy passes.
- `mutations.json` and four `mutation-*.log` files: wrong UTF-16 length, disabled
  true coercion deep condition-copy and skipped object string-conversion mutations all fail deterministic
  comparisons; source is restored in finally. The initial UTF-16 mutation exposed
  a missing boundary assertion, which was added before recording caught evidence.
- Earlier failing contract logs record numeric serialization, non-Unicode regex
  matching and raw integer-key ordering mismatches, subsequently corrected.

The input API models JSON graphs plus explicit non-finite numbers. Arbitrary host
objects, getters, custom prototypes, cyclic inputs and executable function values
are outside its native wire contract. Inherited ordinary Object properties used
by the actual-source boundary matrix retain their reference behavior. This is
focused component evidence, not application dispatch or production replacement
readiness. Full source-bound validation controls component credit.

Additional review cases verify TypeError when JSON objects shadow toString,
including nested objects in arrays. `contract-shadow-final.log` passes;
`mutation-object-string-conversion.log` fails when that guard is disabled.
