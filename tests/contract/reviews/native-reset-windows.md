# Native Ollama reset windows

Reference: services/provider-reset-windows.ts. Target: gateway_rust_windows.
The actual TypeScript module and native implementation compare 1,120 input
combinations plus source parsing/description cases. Cases exercise daily,
weekly and monthly UTC grids; leap day/year boundaries and offsets; fractional
and nonpositive durations; future, invalid and old anchors; the 500-step cap;
rollover epsilon; strict observed lower bounds; null/malformed prior data;
evidence preservation; and exact-deadline behavior.

A real initial mismatch in year 0099's weekly start was fixed: Date.UTC first
maps the day to year 1999, and the weekday must come from that shifted day.
All eight tests pass after correction. A 0.005 -> 0.05 epsilon mutation fails an
assertion; restored tests pass. Input time and duration are valid finite values,
as declared by the reference interface. Native parsing accepts ISO timestamps
and date-only values; locale-dependent legacy Date.parse strings remain outside
this adapter's supported input contract. Chrono bounds apply to calendar
calculations; the shared formatter handles extended ECMAScript years.
The TypeScript 500-step ceiling is preserved even where very old data can
produce a past deadline. This is parity, not a change to quota policy.

Evidence: .jait/artifacts/gateway-rust/windows-mutation.log,
windows-tests.log, windows-diagrams-restored.log and slice-contract-clippy.log.
