# Native plugin REST adapter

Reviewed 2026-10-24. Reference: `packages/gateway/src/routes/plugins.ts`.

The opt-in native router preserves the eight reference handlers over an explicit typed manager port: list/detail, enable/disable, uninstall, config get/patch and rescan. This adds no plugin-manager, installer, package-execution or production activation credit. Every handler authenticates before calling the manager and retains the existing native origin/user boundary.

`gateway_rust_plugin_http` compares the actual Fastify registration/authentication with native loopback HTTP, including response bodies/statuses and every ordered manager call/argument. Checks cover bearer/cookie authentication, unauthenticated requests on all handlers, missing plugins, decoded IDs, GET/DELETE of a plugin named scan, nested config replacement, retained keys, arrays/strings/null/primitives in shallow spreads, manager failures at each phase, caught Error/non-Error values, scan order, malformed JSON and malformed percent/UTF-8 IDs. Invalid JSON is rejected before dispatch, matching Fastify's parsing order. The fixture does not load plugins or contact a registry.

The comparisons caught a static-route precedence mismatch: native GET scan initially returned 405 rather than looking up that plugin ID. It now shares GET/DELETE handling with ordinary IDs. Native config spread retains each UTF-16 unit using raw JSON; a native assertion checks split surrogate units and shallow replacement. A shared transport limitation remains for request JSON with pre-existing lone surrogates; this adapter does not claim to resolve that gateway-wide parser limitation.

Four isolated mutations were rejected by their intended comparisons: authentication bypass, dropping the request config patch, skipping the scan and changing caught error status. The restored eight-test target passes. Evidence: `.jait/artifacts/gateway-rust/chat-loops/plugin-expanded.log`, `plugin-unicode.log`, `plugin-mutations.json` and `plugin-mutations-restored.log`.

While preparing isolated mutations, preserved source mtimes caused Cargo to reuse a library without the newly registered module. The frozen-copy helper now gives changed bytes fresh mtimes while preserving unchanged inputs for incremental builds. The new validation-output regression uses backdated source and target files to prevent this recurrence. The next aggregate gate refreshes Rust source mtimes once in the existing snapshot to discard any cache state created by the old copier.
