# Native terminal helpers and execution inspection

References: lib/command-syntax.ts, lib/command-wait.ts and
tools/terminal-execution.ts. These are three separately inventoried source
components. The pre-existing command monitor, process runner, surfaces and
terminal-run factory receive no additional credit.

The native parse-only helper chooses the same shell flags, overrides BASH_ENV
and ENV, supplies command bytes on stdin, ignores missing/unsupported shells,
and returns bounded diagnostics. One parser runs at a time, matching the
synchronous reference's serialization. Each child has a one-second deadline
and separate 8,000-byte stdout/stderr ceilings. All exits reap the child;
Unix process groups also stop owned descendants, including when the awaiting
future is dropped. Commands and shell paths remain caller-owned inputs.
The caller must authorize the shell executable; parsing grants no permission
to execute the submitted command.

Actual TypeScript comparisons cover Bash and POSIX sh syntax, multiline input,
incomplete substitutions/control structures, embedded NUL input, parse-only
side-effect markers, selected flags and environment, unsupported/missing shells,
permission failures, malformed executables, missing interpreters, non-directory
paths, symlink loops, output boundaries, timeout and successful parses with
stderr warnings. zsh flags use an owned fixture executable; a real zsh install
and non-Linux platform behavior remain supported-platform gates. Error text
matches the current shipping Bun node:child_process adapter; Node/V8 diagnostics
are not claimed equivalent. UTF-16 comparison preserves a diagnostic cutoff
inside an astral character without replacing its lone surrogate.

The yield policy has 199 comparisons across JSON types, omitted values,
negative/zero/fractional requests, large values, deadlines and nonfinite numeric
inputs. Nonfinite fixture numbers are reconstructed in the driver before the
unchanged reference helper is invoked. NaN deadlines now propagate rather than
being silently replaced by Rust's f64 minimum semantics.

The inspection adapter compares full metadata and 17 result/dispatch scenarios
with the real TypeScript factory and an owned monitor port. It preserves the
trusted context session, all snapshot fields, missing-result errors, exact
cancel-versus-inspect dispatch and cancellation errors. The native adapter also
runs against the actual native monitor: foreign/stale execution denial,
partial output, owner cancellation, retained cancellation history, repeated
cancellation without repeated effects, and reset. It never starts a terminal.
JSON integer/float representations compare numerically; no scope, identity,
status, output or error fields are discarded.

Focused and isolated mutation evidence lives under
.jait/artifacts/gateway-rust/terminal-helpers/. Mutation runs must reject their
intended assertions and restore the source copy. Formatting, strict Clippy and
the full frozen-source native gate are required before component credit.
Production registry mounting, terminal surface/process execution integration
and platform/replacement evidence remain separate gates.
