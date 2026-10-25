# Native local filesystem surface

Reference: `packages/gateway/src/surfaces/filesystem.ts`. The native surface owns
lifecycle state, session/panel/start-time metadata, operation counts and backups.
Every file operation runs on an explicit bounded blocking lane, reusing the
existing native PathGuard. Its factory implements the native SurfaceFactory.
This is surface implementation credit, not file-tool registry/consent dispatch
or production activation.

`nativefilesystem.ts` imports the actual TypeScript class/factory and operates
only under UUID-owned project-local fixtures. Rust recreates exactly the same
seed at the same absolute paths. The comparison checks every operation outcome,
error name/message/code/syscall/path/destination/boundary, output/state callback
sequence and complete final byte tree. It does not replace the original methods
with stubs. Start clocks are injected deterministically. Stat modification times
must be valid ISO values before being normalized; file sizes and directory flags
are retained. No directory-result sorting is done by the comparator.

Coverage includes all exported methods/getters, both construction paths,
pre-start/post-stop rejection for every I/O operation, restart, panel defaults,
guard-root override, text and binary reads, invalid UTF-8, UTF-16 output lengths,
parent creation, first/missing/null backups, external backup idempotence, restore
and clear, matched/unmatched/empty patch searches, JavaScript dollar replacement
syntax, existence/list/stat, rename/move/copy/create/delete, directory recursion,
self/descendant/alias copy rejection, existing copy destinations, nested symlinks,
custom/global denials, traversal/null bytes, secondary endpoints and failed I/O.
Callbacks that throw preserve the source's effect/state order.

The first run exposed native alphabetical directory sorting and an incorrect
Linux lstat error label. Rust now preserves filesystem enumeration order and the
reference Bun statx error envelope. Before/after evidence is in
`.jait/artifacts/gateway-rust/filesystem-{first,expanded,restored}-contracts.log`.
All twelve final focused checks pass, including four driver transport checks.
Five mutants are caught and restored: lost original backup, wrong operation
count, skipped new-file removal on restore, wrong patch substitution and inverted
directory-copy guard. See `filesystem-mutations.json` and the per-mutant logs.
Full frozen validation controls new source-bound checkpoint credit.


Bun 1.4.0 refresh (2026-10-25): actual reference checks exposed changed cp
SystemError envelopes for same-inode and file/directory conflicts, destination
symlink replacement, nested symlink target resolution, and stat/lstat labels.
The native implementation now matches these effects and errors without response
normalization. The existing copy corpus additionally checks file-to-directory
failure. All twelve focused checks pass; evidence:
`.jait/artifacts/gateway-rust/channels-http/filesystem-refresh.log`. A separate
owned-fixture probe covers same inode via hardlink and symlink. Path validation,
operation counts and bounded execution remain in place. This repair adds no
component credit and remains subject to the full frozen gate.

Limits: Linux, typed Unicode-scalar paths/content, serial operations and the
existing reference path policy. Directory enumeration is filesystem dependent.
The original final-symlink check and lexical-only metadata/destination checks are
preserved; this does not establish a stronger filesystem sandbox or solve parent
symlink/TOCTOU races. The checkSymlinks=false corpus stays inside its separately
owned outer fixture. Windows/macOS, concurrent lifecycle races, large-file and
resource acceptance require separate evidence. Native non-Unix symlink copy
still reports an explicit unsupported-platform error. No production filesystem
mount, external node access or permission expansion is enabled by this change.
