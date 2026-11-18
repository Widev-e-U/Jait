# Native Ollama usage setup guidance

Reference: `packages/gateway/src/services/ollama-usage-setup.ts`.
Native: `services/ollama_usage_setup.rs`.
Target: `gateway_rust_ollama_setup`; driver: `nativeollamasetup.ts`.

Eight differential tests call the real setup export, the real device-auth URL
classifier and operator path helper. Only OS identity and metadata probes are
controlled. They compare complete results and exact stat/access order. Builtin
mocks preserve all original exports to avoid cached-module binding failures;
asserted probe traces ensure mocks actually take effect. One test uses the actual
filesystem stat/access operations on owned project-local fixtures, including a
file with shell metacharacters, symlink, directory, missing/NUL paths and a denied
file. It compares real results and verifies fixture contents remain unchanged.

Coverage includes strict loopback origins, WHATWG normalized IP spellings, empty
query/fragment/credentials, remote origins with no filesystem calls, URL paths,
configured-path ECMAScript trimming, standard key fallback order, lexical joining,
first unreadable path retention, directory traversal errors without ACL guesses,
a later readable key clearing earlier guidance, read/stat failures, and command
quoting. Platform/UID fixtures verify Linux-only nonnegative-UID ACL guidance.
All other platform strings suppress that guidance; mocked platform tests do not
claim a Windows filesystem integration run.

Six native tests independently pin classification, no remote probes, metadata
permission failures, readable fallback, quoting, path normalization and Unix host
identity lookup. The concrete Unix adapter uses stat and access(R_OK), without
opening or reading a private key; host identity uses bounded getpwuid_r buffers.
Caller-owned host configuration is explicit; key paths must never come from an
HTTP request. The Unix system entrypoint reads operator environment configuration
and should run on the gateway blocking-work pool. Non-Unix callers must provide
host identity through the typed boundary; actual Windows OS/ACL parity remains
an activation check. Return metadata has no key contents and commands are inert
text; no ACL command is executed.

A draft-native reproduction failed because default paths retained redundant
separators/parent components. For home `/owned//home/../other/`, the actual probe
path was `/owned//home/../other/.ollama/id_ed25519` instead of the reference
`/owned/other/.ollama/id_ed25519`. The same assertion passes after lexical joining.
Before evidence: `.jait/artifacts/gateway-rust/ollama-setup-path-before.log`;
after evidence: `ollama-setup-contract.log` in the same directory.

Five mutations fail assertions in both suites: remote probing, stale ACL guidance,
non-normalized home paths, missing shell quoting and overriding the first failed
path. A sensitivity run exposed missing differential coverage for stale guidance;
the added scenario catches it, and restored code passes the unchanged assertions.
Mutation JSON/logs are under `.jait/artifacts/gateway-rust/ollama-setup-*`.
Six native tests, eight differential tests (plus four driver safety checks), five
original Vitest tests and strict Clippy pass. Full source-bound gate remains the
only authority for component credit. The device-key cryptographic/authentication
component receives no credit from this helper's local URL/path support. Production
quota API wiring remains separate.
