# Unused assertion helper review

Some translated cases carry assertion slots from shared lexical helper definitions.
A test that never calls a particular helper cannot observe those slots. Requiring
such slots to execute rejects valid translations; allowing every optional slot to
remain unobserved would also hide missing assertions in reachable code.

`tooling/unused-assertion-helpers.mjs` supplies a conservative per-declaration check.
It locates the original test by line and column, includes its enclosing suite
scopes, and starts with the test callback, all lifecycle callbacks, lexical
initialization effects, classes and exported helpers. It follows identifier
references into named function declarations and arrow/function initializers.
References through aliases, callback arguments, nested callbacks, property names
and shadowed names retain helpers. The last two intentionally overestimate
reachability. Unmodeled enclosing blocks, duplicate helper definitions, unknown
lexical setup, `eval` and dynamic `Function` lookup fail closed.

A zero-observation slot is eligible only when all of these hold:

- The structural audit maps its exact original assertion and operands to the Rust
  rule and fixture capture, preserving setup, imports, hooks and callback bodies.
- The rule was already optional; this check never changes Rust rule optionality.
- The original assertion's entire source range is inside a helper proven
  unreferenced by this declaration's execution roots and their reachable helpers.
- Every reachable source assertion executes, every observed comparison passes,
  peer completion and successful process exit are recorded, and the live values
  satisfy the separate transport/domain guard.
- Real Vitest and Rust agree on each observation and reject an opposing example.
  A fresh full source-bound translated report must also pass before mapping credit.

The proof applies only to the reviewed unchanged fixture. It does not establish
runtime branch coverage, certify helpers that other declarations exercise, or
excuse zero-count assertions behind conditions in reachable functions. Shared
helpers remain present and checked when a reviewed test invokes them. Failed
intermediate assertions in retry callbacks are not granted credit by this batch.

Eight tooling regressions cover range bounds, transitive calls, aliases,
callbacks, lifecycle hooks, lexical initialization, classes, exports, ambiguous
scopes, shadowed names and dynamic lookup. They run in the existing contract CI
step (`node --test tests/contract/tooling/*.test.mjs`). Review artifacts, focused
observations and comparison results are under `.jait/artifacts/parity-resume/`.
