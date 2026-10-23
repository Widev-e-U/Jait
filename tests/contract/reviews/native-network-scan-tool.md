# Native network discovery tool/cache adapter

Reference: packages/gateway/src/tools/network-tools.ts.

The native factory preserves the complete network.scan definition, option
defaults, host counts, gateway/SSH tag precedence and UTF-16 preview output.
The original takes ten host lines before applying the eight-item preview;
the native adapter deliberately preserves that order and displayed remainder.

A shared cache handle preserves reference identity among public getters,
scanner returns and retained tool results. In-place changes remain visible;
replacing the latest record leaves previously retained results intact. The
factory changes memory directly, matching the source; it does not silently
invoke the separate persistence setter.

The public setter writes fixed, bound SQLite upserts through the database
worker. Conflicts preserve first-seen time and retain a prior OS version when
the new value is null; other selected host fields replace prior observations.
Empty provider arrays persist as null. Empty scans replace the memory cache
without deleting database history. A mid-batch failure stops subsequent writes,
retains earlier committed rows, reports a persistence error and keeps the
complete latest memory record. No raw SQL or database path comes from tool input.

The test driver executes the actual TypeScript factory and cache. Only its
scanner dependency is replaced; persistence uses the actual migrated disposable
SQLite database. Comparisons include options, complete metadata and results,
message code units, shared identity, current/retained state, SQL rows, first-seen
and OS retention, partial failures and Error/non-Error scanner rejection.
A separate native malformed-record check proves invalid host arrays fail without
a panic. Engine-specific invalid-record diagnostics are outside the typed
NetworkScanData scanner-port boundary.

Six isolated mutations exercise the default deep scan option, factory memory
versus persistence behavior, retained OS/first-seen data, ten-line preview input
and empty-provider storage. Restored focused tests and strict native/contract
Clippy are required. Evidence: .jait/artifacts/gateway-rust/security-workbench/network-tool-*.

This is a factory/cache component, not a native network scanner. Its supplied
scanner port must enforce operator authorization, exact target/exclusion scope,
execution vantage, rate/output/time limits and cancellation. The original
context capability reaches that port without serialization. No scanner is
mounted or activated by this batch, and no real network probes run in its
fixtures. Native network-scan engine implementation, production activation,
supported platforms and replacement acceptance remain separate inventory/gates.
