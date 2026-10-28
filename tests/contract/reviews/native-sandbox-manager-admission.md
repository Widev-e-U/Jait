# Native sandbox manager admission slice — 2026-10-26

Status: partial and uncredited. Canonical implementation remains
`packages/gateway-rust/src/security/sandbox_manager.rs`; no wrapper or duplicate
manager was introduced. This extends the command/session review, not native
component coverage. Production remains TypeScript.

## Scope and behavior

`SandboxKind` selects the existing browser, Linux desktop or Windows preflight.
`assert_start_allowed` checks Windows KVM availability before process calls, then
runtime health and a bounded active-container listing, sequentially. Both calls
retain the 3,000 ms timeout. Errors and timeouts stop the sequence. Names are
counted only after JavaScript whitespace trimming and category prefix matching.
The host captures the appropriate `JAIT_MAX_*_SANDBOXES` setting and execution-node
KVM availability; the manager performs no ambient environment or filesystem
lookup. Defaults remain 2 browsers, 1 Linux desktop and 1 Windows VM. Decimal
parseInt prefix behavior, zero/negative/invalid/overflow fallback and Unicode
whitespace are preserved.

These checks are read-only policy, not consent or an atomic capacity reservation.
Concurrent starts can both pass a preflight against the same snapshot, as in
TypeScript. Startup must eventually compose this preflight with the session
owner and authorized host effects. A caller cannot infer authorization from a
successful check, KVM availability, a container prefix or engine reachability.
No startup method is claimed by this slice, and no new engine effects are enabled.

## Focused evidence

Evidence directory: `.jait/artifacts/gateway-rust/sandbox-manager-20261026/`.
Native `sandbox_admission_native_vectors` verifies expected decisions and errors,
early-stop call counts, category-specific literal argv and 3-second timeouts.
It emits `native-admission-vectors.json` when `JAIT_SANDBOX_EMIT_VECTORS=1`.
`admission-differential.ts` loads actual TypeScript with import-only host seams
and compares all 36 process scenarios and 30 configuration cases; three more
checks compare overflow fallback. The native empty-list scenario selects Podman;
the TS mock pins binary detection to Docker, so the comparison normalizes only
the binary and retains every subsequent argument. No real engine is invoked.

`admission-native-mutations.py` removes the Windows KVM check, changes capacity
`>=` to `>`, and removes timeout rejection independently from health and listing.
All four must fail assertions, then source is restored. The initial KVM mutation
did fail the expected success assertion but the mutation detector did not
recognize its custom panic text; using explicit equality made the evidence
machine-verifiable. This was an evidence-classification failure, not a surviving
protection bypass. Restored validation and source hashes are recorded in
`admission-slice-review.json`. Command/session differential evidence is rerun
against the extended source. Earlier command-slice-review.json remains historical.

## Remaining acceptance work

Browser/Linux/Windows startup, image recipe/build authority, port allocation and
readiness, retry/conflict cleanup, OS discovery, Windows storage containment and
symlink handling, existing-container/injected background routing, canonical
identity/worktree host integration and direct-caller owned-session compatibility
remain open. The real process/socket/engine, platform, resource, recovery and
activation gates remain open. No full frozen gate is refreshed for this partial
slice and no source component earns credit. The last full241 gate is historical;
its source fingerprints do not establish current all-original completion.
