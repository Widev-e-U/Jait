# Native provider registry and MCP configuration

References: providers/registry.ts and providers/jait-mcp.ts.
Native: providers/registry.rs and providers/jait_mcp.rs.
Contracts: gateway_rust_registry and gateway_rust_mcp, using the real TypeScript registry/config functions.

The native registry stores adapter handles in insertion order; replacement retains the slot and does not dispose the replaced adapter. Owned adapters are visible only to their owner; absent or empty owners remain shared. Unregister removes the handle before awaiting disposal, including when disposal fails. Availability checks start for the complete snapshot, settle all results, log rejections in registration order, and return the currently registered adapters after completion. Tests hold and release checks deterministically; they replace/remove adapters during pending checks and assert current membership, invocation order, retained failure state and optional disposal.

Native MCP reference helpers preserve wildcard-host loopback mapping, explicit-base trimming, WHATWG URL resolution, encoded session/project/runtime context, the two tool sets, and separate opt-in authenticated OmniRoute access. Tests cover IPv6, userinfo, base paths/query/fragments, invalid URLs, keyless/disabled routes and router base suffix handling. Helpers consume explicit environment maps and do not change live environment or connect to a provider. Ports use the production u16 configuration invariant.

The configuration merger preserves unrelated/nested properties, filters and deduplicates string namespaces, inserts mcp__jait_core exactly once, preserves raw malformed/non-object configurations and treats ECMAScript whitespace as the reference does. Exact output strings are compared, including integer-key ordering, duplicate JSON keys, IEEE-754 number conversion, Unicode and repeat-application idempotence.

The two targets execute 17 tests, including repeated subprocess transport checks. Three reversible mutations remove correct namespace insertion, bypass owner filtering and retain an unregistered provider. Each produces the intended assertion failure; sources are restored in finally and rerun. Evidence:
.jait/artifacts/gateway-rust/provider-mcp-focused.log
.jait/artifacts/gateway-rust/provider-registry-focused.log
.jait/artifacts/gateway-rust/provider-mutations.json
.jait/artifacts/gateway-rust/provider-mutation-{core-namespace,owner,unregister}.log
.jait/artifacts/gateway-rust/provider-after.log

Adapters use a native Send/Sync trait returning owned futures and info snapshots. Concrete ACP/CLI processes and their event protocols remain separate, unported components. The source module's ACP/Jait re-exports are satisfied by those concrete adapters later. Malformed JSON input is preserved verbatim; valid JSON containing unpaired UTF-16 surrogates or overflow-to-infinity numbers remains outside the merger's focused well-formed Unicode/finite-number contracts, consistent with existing native JSON parser limits. The canonical native-progress report controls component credit and source freshness.

Current Bun reports `Invalid URL` for malformed bases and bases that cannot
resolve `/mcp`. The unchanged failing comparison identified the previous runtime
wording; expanded real-source checks now include malformed authorities and opaque
URLs. Evidence: `.jait/artifacts/gateway-rust/channels-http/runtime-errors-recheck.log`.
