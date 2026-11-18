# Native memory tool adapters

Reference: `packages/gateway/src/tools/memory-tools.ts`. Native `memory_tools.rs`
implements all seven factories over explicit memory/reminder service ports and an
injected clock. This adapter creates no database, discovers no saved memory and
activates no production tool. Underlying storage/privacy/user authorization remain
service responsibilities and receive no new engine credit.

The reference driver imports the actual factories and list helpers directly;
there are no module substitutions. Service returns/errors and Date.now are
controlled. Comparisons include complete metadata, argument projection, ordered
calls, uncaught errors and results. Save preserves source shape, positive/negative/
fractional/absent/zero TTL, date overflow errors and reminder project/session
nullish defaults. Search compares active owned reminder queries, exact limit
semantics, opt-out, absent service, optional retrieval tracking and ordered IDs.
Forget checks reminder deletion before memory deletion and the explicit reminder
branch. List/update retain optional service failures, archive labels, complete
patch null/empty values, unknown-field omission and update miss data. Hygiene and
chat review preserve user and scan-limit arguments and full returned evidence.
Service Error and non-Error throws remain uncaught, stopping later side effects.

Preview fixtures cover order, eight-item truncation, whitespace cleanup, UTF-16
length and a supplementary character split by the reference's clipping boundary.
The result carries Utf16Text through JSON serialization, preserving escaped lone
surrogates. Comparison normalizes only the returned message into exact UTF-16
units on both sides; a separate assertion checks the actual native JSON escape.
This normalization is not Unicode replacement or changed content.

Six deliberate regressions fail assertions and are restored: wrong owner,
search reminder opt-out, missing retrieval tracking, forget precedence, TTL units
and reversed update presence. Focused, mutation and restored evidence is under
`.jait/artifacts/gateway-rust/memory-tools-*.log` and `memory-tools-mutations.json`.
Boundary: valid published JSON inputs and typed service results; explicit optional
reminder support applies where published. Clock injection changes no expiry rule.
Full frozen validation controls credit; production stays TypeScript.
