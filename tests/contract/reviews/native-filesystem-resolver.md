# Native filesystem capability selection

Reference: `packages/gateway/src/tools/core/get-fs.ts`. The native resolver composes
the actual registry and local/remote filesystem classes. Registry surfaces support
native type downcasts so selection follows concrete class identity rather than
trusting a metadata type name. The resolver preserves remote-first routing,
conventional IDs, longest-root selection and stable ties, gateway-local existing
absolute targets, Windows path rejection on Linux, absolute file/directory/missing
path scoping, reuse/auto-start, fallback roots and creation/callback failure order.
Filesystem metadata work uses an explicit bounded blocking lane; CWD is injected.

The driver imports actual TypeScript helpers/classes/registry and creates only
UUID-owned project fixtures. Seven checks pass (three scenario matrices plus four
driver controls). They compare returned snapshots, registry state and start-hook
order for local/remote/stopped/idle/foreign-session/other-type surfaces, repeated
requests, factory absence/failure, hook failure, root fallbacks and path classes.
Real files and directories distinguish existing files, directories and missing
paths. Three restored mutants catch wrong specificity, local-existence handling
and remote-root precedence. Logs and the seven combined facade/resolver mutation
results are under `.jait/artifacts/gateway-rust/remote-fs-*`,
`resolver-*-mutation.log` and `remote-fs-mutations.json`.

Selection grants no new authority. Source-compatible absolute-target rescoping
still requires the caller's file/tool consent and scope checks; local I/O retains
PathGuard and remote I/O retains its authorized transport. The source prefix hint
and its limitations remain unchanged. Linux is the exercised host; foreign Windows
paths are routing tests, not proof of native Windows I/O. Concurrent creation and
lifecycle races, arbitrary JS subclass/prototype mutation and production registry
activation require separate integration work. A saturated/closed blocking lane
rejects admission rather than doing unbounded work.
