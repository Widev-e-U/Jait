# Provider update policy adapter

Reference: `packages/gateway/src/services/provider-updates.ts`.
Native: `packages/gateway-rust/src/services/provider_updates.rs`.
Target: `gateway_rust_provider_updates`.

The native policy supports only the two own-property provider specifications,
Codex and Claude Code. Version checks request the fixed npm latest endpoint and
run the fixed CLI `--version` argv with the reference timeout and output budget.
The two independent operations start together. A failure rejects the check while
the other operation remains supervised; HTTP errors do not decode a JSON body.
The first matching version is read from combined stdout/stderr using ASCII word
boundaries. Numeric core components compare as JavaScript numbers; prerelease
suffixes do not influence update availability, matching the current reference.

Successes cache their completion time; freshness uses strict less-than against
the interval. Non-forced calls share an in-flight check. Force bypasses both
cache and in-flight reuse. Completion unconditionally removes the provider's
in-flight entry, including older forced requests completing during newer work.
A failed refresh retains an earlier successful cache entry. These sometimes
surprising behaviors are preserved, rather than silently introducing revision
fencing or semantic-version ordering.

Updates use only the fixed global npm installation argv, or Claude's fixed native
`update` argv after PATH resolution identifies one of its native install paths.
Windows selects `npm.cmd`. Successful commands invalidate cache and require a
fresh version check; an update still available after the command is an error.
Command errors prefer trimmed stderr, then Error.message, then the provider's
fallback message. Unsupported providers never cross an effect port.

PATH search skips empty directories, uses platform extension order and lexical
joining, checks execute access and resolves symlinks. Any access/realpath failure
continues search. Joining and filesystem probes are explicit host capabilities;
Windows fixtures emulate Node's win32 path semantics without executing Windows
binaries. Native install matching normalizes separators and case.

Start performs immediate forced refreshes for both providers and installs one
non-owning interval. Repeated start is idempotent; stop unregisters its timer and
does not cancel already admitted work. Independent requests and updates remain
supervised when a caller drops its future. Admission is atomic across concurrent
native callers, preserving the reference's single-threaded deduplication. The
host must not re-enter service methods inline from a process or fetch port.

Two native lifecycle checks exercise 24 concurrent callers, one shared timer,
final-owner timer cleanup, and dropped unpolled/polled supervisor tasks. A dropped
worker resolves waiters with an internal typed cancellation error and releases
its in-flight entry so a subsequent check can retry. This is explicit native
supervisor failure handling, not a new public HTTP or provider protocol.

The source-bound TypeScript driver changes only injected filesystem/platform,
clock, process, fetch and timer boundaries. It runs 64 scripted scenarios in
three comparisons, including forced overlap, expiry at the exact boundary,
negative clock movement, TimeClip limits and extended years, ignored prereleases, invalid/failed registry results,
fixed command arguments, post-command verification and sibling completion after
failure. It records all port events and returned values. The only diagnostic
normalization maps Bun's null `body.version` TypeError expression wording to the
corresponding property error; it does not turn failed outcomes into successes.
Fetch timeout metadata is observed at the actual AbortSignal.timeout boundary.

Evidence lives under `.jait/artifacts/gateway-rust/provider-updates/`. The mutation
runner edits only a locked isolated frozen snapshot, requires the named assertion
test to fail, restores every changed file and reruns the entire focused suite.
All fifteen bounded native/reference mutations produced their named value-
comparison assertion failure; the restored nine-check suite passes.
The full frozen gate must pass separately before this component advances the
completed migration checkpoint.

The adapter has no default process, registry, filesystem or timer implementation.
The host must enforce existing update consent, executable/path identity, fixed
argv, network policy, deadlines, cancellation, output/response limits and bounded
supervision through actual effect completion. Tests do not install software or
contact npm. Real process/HTTP/platform integration, production composition,
resource/recovery and replacement/activation gates remain open. This earns one
service policy component, not a complete updater engine or production cutover.
