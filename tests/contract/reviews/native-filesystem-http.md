# Native filesystem HTTP routes

Reference: `packages/gateway/src/routes/filesystem.ts`. The opt-in Axum router
serves node listing, local and remote roots, and directory browsing. Gateway
registration preserves platform mapping, identity and timestamp. Local metadata
and directory operations run through a bounded blocking lane; overload rejects
with 503. Remote calls require an explicit control-plane adapter, which retains
its node access policy and transport deadlines. No process is spawned by the
native route: Windows drive discovery is an explicit fixed-purpose host callback.
The executable does not mount this router by default.

The HTTP contract runs the actual reference route source and actual Fastify
server (including central authentication/origin/deleted-user hooks). Scripted
seams replace only OS identity and Windows drive-command modules; real local
filesystem/path functions and all route logic are preserved. The route is
substituted at the server's existing import so it registers exactly once.
Fixtures and generated source copies are anchored inside project artifacts.

Five behavioral scenarios compare complete status/body results and node dispatch
traces: local default/relative/root paths, parent null, lexical resolution,
directories before files, locale sorting including accents/case/numbers, hidden
Windows system names, symlink entry exclusion, file/missing/nested-file errors,
remote roots/browse forwarding and tilde default, Error and non-Error throws,
repeated query values, absent control-plane fallback, Windows drive parsing,
empty drive output and command failure, gateway identity on macOS/Linux/unknown
platforms, and authentication checks before remote effects. NUL and repeated
local paths reproduce the reference's specific errors. Tests exposed Linux
Bun's statx error name and array type wording; those differences were corrected.
Four shared checks verify the bounded driver protocol and artifact handling.

Caught and restored mutations expose dot entries, change the remote default
path and corrupt the fallback drive. Evidence is recorded under
`.jait/artifacts/gateway-rust/filesystem-http-*`. The new route introduces no
scanner, writable operation or automatic production filesystem mount.

Boundaries: real filesystem behavior is checked on Linux. Windows drive/root
branches are checked using host fixtures, not a Windows kernel; local native
filesystem syscall strings on other systems still require platform gates.
Unicode scalar filenames and the installed default collation are the contract
boundary. The reference's authenticated broad browsing behavior is preserved;
this route is not the guarded project-file-edit surface. Final component credit
requires the full source-bound gate and matching live fingerprints.
