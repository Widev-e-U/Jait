# Command timeout reference coverage

Scope: `packages/gateway/src/lib/command-timeout.ts`. This records prerequisite test coverage against TypeScript; no Rust gateway implementation is claimed.

Rust owns inputs and exact expected values in `vectors/boundaries.json`, executes them through `src/fixture_internal_contracts.rs`, and repeats them in `tests/boundaries.rs`. `drivers/boundaries.ts` materializes values that JSON cannot transport and calls the production exports. It restores both timeout environment variables and console warnings after each call, including exceptions.

| Production decision or observation | Boundary cases (`internal.boundaries.` prefix) |
| --- | --- |
| Missing/empty environment settings use one-hour default and one-day cap | `timeout-empty-env`, `timeout-invalid-inputs`, `timeout-exact-cap` |
| Parsed settings must be finite and positive | `timeout-invalid-env-infinite`, `timeout-invalid-env-nan`, `timeout-invalid-env-zero`, `timeout-invalid-env-negative`, `timeout-invalid-env-whitespace` |
| Positive environment settings override defaults | `timeout-positive-env` |
| Cap cannot fall below the configured default | `timeout-cap-lifted-to-default` |
| Number input and Number coercion both work | `timeout-fractional-and-numeric-string`, `timeout-coercion-inputs` |
| Nonfinite and nonpositive requests use the default | `timeout-invalid-inputs`, `timeout-nonfinite-inputs`, `timeout-coercion-inputs` |
| Valid fractional values round up, including below one millisecond | `timeout-fractional-and-numeric-string` |
| Exact cap does not warn; above-cap requests warn once and clamp | `timeout-exact-cap`, `timeout-over-cap-warning` |
| Noncoercible Symbol preserves the current TypeError behavior | `timeout-symbol-error` |

The final `Math.max(1, Math.ceil(ms))` minimum guard cannot independently select 1 over the rounded result: reaching it requires finite `ms > 0`, which makes `ceil(ms) >= 1`. The submillisecond cases check the observable result rather than claiming an impossible path. The `Number` builtin's complete coercion grammar is a JavaScript runtime dependency; this table covers representative primitive, array, object, function and Symbol inputs, not every possible custom coercion hook.

`tests/boundaries.rs::boundary_contracts_detect_source_mutations_then_pass_after_restore` changes only copies under project artifacts. Timeout mutations remove rounding, bypass the cap, accept Infinity as an environment setting, lower the cap below the default, and warn at cap equality. Each selected original case must pass before mutation, fail an equality assertion after mutation (fixture crashes do not count), and pass after restoration.

Source parity credit requires a current successful `typescript-internal-reference` report for every timeout boundary vector. The inventory retains its own source fingerprint and resets credit if this file changes. Bounded JSON remains a separate pending source requirement.
