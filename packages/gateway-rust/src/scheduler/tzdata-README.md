The scheduler bundles IANA tzdata 2025b. The focused differential contracts pass
against the installed Bun 1.4.0 / ICU 78.3 reference. This is tested compatibility;
it does not infer ICU's internal tzdata release from its version number.

Source: https://data.iana.org/time-zones/releases/tzdata2025b.tar.gz
Archive SHA-256:
`11810413345fc7805017e27ea9fa4885fd74cd61b2911711ad038f5d28d71474`

`scheduler-tzdata-2025b.bin` concatenates 340 distinct TZif records for 597
names/aliases. `tzdata_2025b.rs` indexes their offsets and sizes. The source
license is retained in `tzdata-LICENSE`. Jiff parses the embedded records;
the native scheduler does not consult host timezone files, start a process,
or call a JavaScript/TypeScript bridge.

Regenerate with `tooling/generate-scheduler-tzdata.py` after compiling the standard
zone files and backward (excluding backzone) with `zic -b fat`. All working
archives/compiler outputs belong under the project-local
`.jait/artifacts/gateway-rust/scheduler/tzdb-2025b/`. Keep the original data,
archive hash, generated index and blob together in review.

The prior 2024a data rejected America/Coyhaique after the reference runtime
upgrade. Simply using host data is insufficient: the 2026e host source has
historical-link differences, and the standard 2026e release also disagrees with
the reference's Africa/Casablanca offset on 2026-10-21. The selected 2025b
standard release passes all canonical-name, alias, historical and current-time
comparisons, including Coyhaique. No fallback to host zone files is permitted.

Changing data versions changes observable scheduling behavior. Review it against
the actual reference runtime and run the complete differential suite. The focused
contracts probe canonical names, bundled aliases, unsupported names, case handling,
offset forms, malformed Unicode, transition boundaries and extreme Date values.
Runtime and selected data versions must remain explicit in checkpoint evidence.
