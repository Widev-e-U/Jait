# Native transient state and inline raster images

References:
- services/computer-control.ts -> services/computer_control.rs
- security/assessment-lease.ts -> security/assessment_lease.rs
- tools/swarm-mailbox.ts -> tools/swarm_mailbox.rs
- services/email/inline-images.ts -> services/email/inline_images.rs

The focused target gateway_rust_ephemeral invokes the real TypeScript functions
through the bounded reference driver. Exact structural comparisons cover:
- computer ownership, node exclusivity, same-owner/foreign-owner errors,
  expiry at one millisecond before and exactly on the boundary, stable insertion
  ordering, missing leases, zero-duration leases, and stop without prior expiry;
- the single process-wide assessment owner, wrong-owner and repeated release,
  identifier reuse and the reference's empty-ID behavior. A separate native
  12-thread contention assertion admits exactly one owner;
- mailbox round replacement/removal, participant counts, unknown rounds,
  message order, clock values and retained live message arrays. Native shared
  handles preserve previously returned references after a round is replaced;
- supported raster MIME types, case folding, SVG rejection, nonempty ASCII
  base64 validation, URL-safe digits, noncanonical padding, incomplete sextets,
  exactly/over-limit data, URI decoding, unknown/empty CIDs, malformed escapes,
  Unicode whitespace and repeated angle delimiters. Large output is compared
  by UTF-16 length and SHA-256, within the reference transport output ceiling.

Computer UUIDs are replaced with per-scenario aliases in both output and errors;
clock values and all other fields are exact. Native computer leases use signed
integer millisecond clocks and lease durations; fractional and nonfinite durations
are outside this typed boundary. Native mailbox counts are nonnegative integers.

Four surgical mutations (expiry inequality, assessment release owner check,
mailbox removal, accepted raster MIME) fail their existing assertions. Restored
sources pass all nine tests (five domain and four driver-boundary tests). Evidence:
.jait/artifacts/gateway-rust/ephemeral-mutation-*.log and ephemeral-restored.log.

No assessment, process execution, remote email download or production mounting is
performed by this batch. Assessment releases are explicit as in the reference;
callers must release in their completion/cancellation cleanup path.
