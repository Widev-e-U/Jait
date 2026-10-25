# Native remote filesystem facade

Reference: `packages/gateway/src/surfaces/remote-filesystem.ts`. The native class
and factory preserve lifecycle/getters/snapshots, raw remote paths, node routing,
operation counts, text/binary reads, writes, first-write backups, string patches,
exists/list/stat, external backups and restore/clear behavior. It implements the
native Surface interface and uses an explicit RemoteFsTransport capability.

The TypeScript driver imports the actual class/factory. Only its control-plane
transport is scripted; native and source compare complete RPC arguments/order,
outputs, callback errors, backup missing/null/string states, final file contents
and lifecycle metadata. Nine checks pass (five domain checks and four bounded
transport checks). A 539-string comparison uses actual Bun Buffer decoding,
including standard/URL-safe alphabets, padding, ignored characters, Unicode and
deterministically generated strings. Model-generated expected values are not
acceptance evidence.

Four caught/restored mutants cover operation counts, overwritten backups,
running-state errors and the URL-safe base64 alphabet. The first-write callback
failure tests deliberately preserve the source's null-backup behavior: a failed
backup read does not prevent the later write. The source-free DeepSeek helper
supplied the generic decoder; its contrary backup-failure advice was rejected.
Its input/output/review artifacts are under
`.jait/artifacts/gateway-rust/deepseek/remote-fs-helper-*`.

This facade neither discovers nor authorizes a node. The caller-supplied transport
must enforce node/path authorization, cancellation, deadlines and response bounds.
The source's simple case-insensitive prefix hint is preserved, including sibling
prefix matches; it is not an access-control policy. Null-backup restore clears the
backup without deleting the new remote file, as in the source. Typed content must
be a string; malformed native content fails with a redacted error. Arbitrary
JavaScript prototypes/coercion, concurrent lifecycle races, a real WebSocket/node
transport and supported-platform/resource acceptance remain outside this slice.
No production node or filesystem activation occurs here.

Bun 1.4.0 refresh (2026-10-25): the unchanged actual Buffer corpus exposed
UTF-16 low-byte semantics for `Tő==` and `TQĽAAAA`. The native decoder now
narrows UTF-16 code units before interpreting alphabet/padding. No reference
assertion or response normalization changes. This repair earns no additional
component credit; focused evidence is in
`.jait/artifacts/gateway-rust/channels-http/filesystem-refresh.log`.
