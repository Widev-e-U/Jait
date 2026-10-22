# Surface control tool wrappers

Reference: `packages/gateway/src/tools/surface-tools.ts`. Native implementation:
`packages/gateway-rust/src/tools/surfaces.rs`, using the existing native surface
registry directly. Browser inspection remains an explicit host port and retains
preview ownership, URL, process and consent policy. No browser engine, terminal
surface, frontend or production activation credit is claimed.

Actual-source contracts bundle the real wrappers, import the real TypeScript
registry and replace only browser inspection and the UUID source. Native fixtures
use the real native registry with matching lifecycle adapters. The existing UUIDv7
component supplies production IDs; only test IDs are fixed for exact comparison.
Metadata is extracted from the actual factories and compared without normalization.

Contracts compare full outcomes and callback traces: registration order and empty
lists; multi-entry previews; default/override/empty/nullish session and project
fields; unknown surface types; failed factory/start/snapshot/stop stages; start
state retained after failure; repeated stop; browser preview errors and non-Error
throws; same-chat enforcement before inspection; project-root projection while
preserving other context; missing browser results; result field preservation and
snapshot/data spread precedence. Unicode previews compare UTF-16 code units,
including a slice ending with a lone surrogate. Native list results retain
`Utf16Text` through JSON serialization rather than replacing or dropping code units.

Five deliberate mutations are caught and restored: removed browser-chat check,
ignored session override, reversed missing-stop outcome, reversed preview spread
precedence and changed UTF-16 preview length. Restored focused contracts pass.
Logs and mutation-results.json are under
`.jait/artifacts/gateway-rust/surface-tools/`.

Typed boundary: schema-shaped JSON requests, standard tool contexts with session
and project root, and the native registry's typed snapshots. Surface factory/stop
failures use the native registry's string error channel. This does not introduce a
new ownership policy for non-browser surfaces or change the reference behavior.
Credit requires the completed full source-bound gate.
