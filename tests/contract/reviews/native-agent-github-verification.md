# Native GitHub credential verification — partial candidate

This extends native-agent-github-response.md with App and installation verification.
The credential-service component remains uncredited; production remains TypeScript.

Verification signs a GET /app request with the owner/agent private key, checks the
returned App id, and refreshes App slug/name/bot identity. An existing installation
requires a second signed GET with an encoded installation id. Its sparse response
preserves prior account, repository selection and permission metadata. Success
records verification time and clears the last error. Without an installation the
prior status is retained, matching the actual TypeScript service. App 401/404
failures revoke credentials, while other App failures mark error. All installation
failures revoke the connection, including 403 and network failures, and retain the
newly verified App metadata. Missing registration/private key has no HTTP effect.

The existing bounded DatabaseWorker runs preparation and completion around each
outbound await. Requests remain sequential, with no database handle held across
network waits. App metadata is not persisted between successful requests; a
cancelled second request leaves the prepared connection unchanged. The same
15-second per-request deadline, 1 MiB response postcondition and disabled redirects
apply. No ambient HTTP client or real network call is added. The host still owns
streaming limits, destination/proxy/redirect policy and I/O cancellation.

The native stale-snapshot compatibility choice now checks after both requests,
before writing success/failure or issuing the second request. Direct service-client
checks hold either request, perform disconnect/setup/key updates, and prove stale
success and failure cannot replace newer state. Unrelated owners can update and
the shared database continues to progress. Full futures compile under tokio::spawn.
Cancellation drops the pending effect at either phase without persisting success
or failure; timeout drops it and records phase-appropriate failure. A queued or
started DB job follows the existing DatabaseWorker cancellation contract.

The TypeScript implementation has no stale guard. This intentional tightening
still needs canonical HTTP/tool client composition and operation ownership before
component credit. Snapshot equality cannot detect identical-state ABA; host
serialization and cross-process changes remain integration limits. This batch is
not a capacity/load result.

Actual-TypeScript comparisons cover owner isolation, signed requests, App identity
mismatch, missing keys, sparse/null/empty metadata, enterprise URLs and failure
classification. The first recovered run passed 40/41 store checks; enterprise-URL
comparison failed in the harness because it supplied method instead of the driver
op field. The corrected operation reaches both implementations. No reference
behavior was changed to resolve that harness failure.

Final frozen checks, isolated native/reference mutation controls, restored checks,
source fingerprints and live drift audit are recorded in
.jait/artifacts/gateway-rust/agent-github-verification/partial-result.json.
Token mint/cache/invalidation, repository checks, execution environment, canonical
service-port composition and full native gate remain pending. Malformed upstream
schema/runtime diagnostic limits from the prior review still apply. Counts remain
228/370 originals plus 5/6 newer additions, with 142 originals and one addition
pending. Platform/load/recovery/rollback and activation gates remain open.

Completed 2026-10-26: 68 frozen and restored focused checks, 316 library tests,
strict Clippy, native/contract formatting and artifact checks pass. Seven isolated
controls fail for the intended semantic regressions. The identity control uses
the unexpected-request assertion; the recovery harness omitted its focus command
variable after the controls, then reused checked failure logs and completed the
restored run. No product code or reference behavior was changed for these harness
issues. Executable inputs match the frozen manifest; subsequent README/migration
documentation updates are recorded separately as metadata drift. Full233 remains
historical with 15 changed inputs and two unrecorded runtime paths.
