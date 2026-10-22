# Native update failure diagnostic review

Scope: `routes/update-failure.ts` only. The native helper consumes the host's
Error.message/String(thrown) display text and optional string error code. It
never executes npm, changes installations, or activates a production route.
JavaScript object coercion hooks remain the host boundary; callers must extract
`.code` only from values carrying that property. This is native diagnostic
behavior coverage, not self-update or arbitrary JavaScript runtime coverage.

The reference driver imports the actual production helper. Rust owns all inputs
and exact code/hint/detail-code-unit comparisons. Coverage: every classifier,
all ordered classifier pairs, mixed case, code-only signals, null/undefined,
object-vs-Error behavior, primitive codes, arrays, exact 1200-code-unit limits,
ECMAScript whitespace and lone/split surrogates. Classification uses the full
message even if the diagnostic tail drops its identifying code. No fields of
those three output values are normalized; UTF-16 units avoid a JSON parser
repairing an unpaired surrogate. Raw serializer behavior is checked separately.

Validation: 3 focused differential tests and 4 protocol checks pass; all nine
original Vitest tests pass. Five runtime mutations (tail threshold, tail length,
classification of tail only, lost error code, incorrect unknown hint) were
caught by failed behavioral assertions, restored byte-exactly, and the full
focused target passed. Evidence: `.jait/artifacts/gateway-rust/update-failure/`.
Component remains a candidate until a complete source-bound gate passes.

Reference SHA256: 09f4da5491ff92213c3973b384d2c6428b77f9897f9412b3e069c5b117740d0d
