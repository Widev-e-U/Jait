# Native context estimates and provider todo normalization

Two independent Rust implementations are compared with the real exported source functions. Estimates preserve UTF-16 text lengths, JSON number/key ordering, separate text/JSON divisors, message overhead, hidden reasoning, tool call metadata, history priming, schema margin and floating-point ceilings, category totals and ratio clamps. Native inputs are JSON values and Unicode scalar strings; cyclic objects, functions and BigInts cannot enter the typed JSON boundary. Missing JSON is represented explicitly by Option and costs zero.

Todo normalization preserves data-before-arguments precedence, exact alias matching, validation of every row, empty arrays, nullable/missing values, legacy provider todos, status coercion, JavaScript String conversions, array joining and throwing object conversions. Numeric ids pass through ECMAScript numeric JSON canonicalization.

The focused suite passes ten tests including four driver transport checks. Mutating the text divisor and data precedence each fails the original comparison assertion; restored code passes. Logs and context-mutations.json live under .jait/artifacts/gateway-rust. The library is native; Bun only executes reference code during development verification. Full provider execution remains unported.
