# Native GitHub response and installation binding — partial candidate

No component credit. This extends `native-agent-github-exchange.md`; production
remains TypeScript. No ambient HTTP client, credential-service port composition,
production activation, publication or agents are introduced.

The common outbound helper retains status, message and credential-rejection state.
401/404 reject credentials; 403 gets the same diagnostic suffix but remains an
ordinary error. It handles HTTP failures, transport errors, JSON parse failures,
null versus false/zero/array success data, replacement decoding for invalid UTF-8,
and one leading BOM, matching the actual TypeScript request method. An exhaustive
fixture matrix covers eleven HTTP statuses and multiple message/data types. The
reference driver uses real Response.text() for byte fixtures, with no GitHub I/O.

Malformed manifest-success PEM values produce the measured Bun reference errors
before any key write, leaving the prior connection and pending state unchanged.
Runtime-generated JavaScript diagnostics are runtime-specific: this evidence binds
to the current Bun driver, not all Node/platform error strings. Non-string webhook
secrets and adversarial property-shaped PEM objects remain outside this matrix.
The expected successful GitHub schema is still the operational contract.

Installation binding reads the owner/agent registration and encrypted private key,
signs an RS256 App JWT, requests the encoded installation path, rejects mismatched
App ids, and updates account, permissions, repository-selection and installation
metadata. Failure status follows the reference: 401/404 revoked, 403/network error.
Missing registration/key has no outbound effect. Tests compare encrypted rows,
public results and exact signed request headers with the real TypeScript service,
including owner/agent isolation and sparse/mismatched installation responses.
There is no token cache yet; cache invalidation must be added with minting.

The service now uses the existing bounded DatabaseWorker for preparation and
completion, and opaque owned states across the network await. Requests, pending
results and encrypted revision snapshots have no Debug implementation. Full
manifest/installation futures compile under tokio::spawn's Send requirement.
SQLite is available to independent work while the network request is held.
No new database worker or pool is created by the service itself.

An explicit native compatibility choice rejects stale completion after a newer
setup, disconnect or key update. The revision checks the owner/agent connection
and encrypted key/webhook ciphertext, IV and tag inside the completion DB job.
Successful and failed stale responses cannot overwrite newer state; another
owner's changes proceed independently. This tightens the TypeScript overlap
behavior, which has no stale-response guard. Focused client calls demonstrate the
chosen new error and retained state. It still requires canonical HTTP/tool client
composition evidence before implementation credit. Operation ordering remains
sequential by host authority; this is not a general parallel GitHub scheduler.

Cancellation drops the outbound future and preserves prepared state. Existing
15-second deadline, 1 MiB postcondition, no-redirect request policy, and no-retry
behavior remain. The host must enforce streaming/destination/proxy/redirect
policy and cancel actual I/O. A DB job already started may finish after caller
cancellation under the existing DatabaseWorker contract; queued cancelled work
is skipped. Tests also exercise database progress, drop cleanup, deadline and
oversized response behavior. A snapshot is not a monotonic generation counter:
identical state deletion/recreation (ABA) and cross-process writes remain limits;
canonical operation ownership must be integrated before production readiness.

The frozen baseline passes 59 focused checks, 316 library tests, strict Clippy,
formatting and the artifact guard. Seven isolated native/reference controls catch
replacement-decoding, 403 classification, App identity and stale-completion
regressions. The stale control triggers an unexpected-success panic; the initial
runner's narrow panic parser was corrected and all existing failure logs verified.
The restored focused suite passes. An unrelated concurrent workbench fixture
filename change (adding process.pid) was then preserved, reviewed as lazy fixture
code, and copied into the snapshot with separate before/after fingerprints. The
focused gate is revalidated for that reconciled source set. No workbench component
or contract is credited from this batch. Separate manifests preserve the initial
control source set and final reconciled source set.

Validation results and frozen/live fingerprints are recorded after completion in
`.jait/artifacts/gateway-rust/agent-github-response/partial-result.json`.
Installation verification/revocation checks, token mint/cache/invalidation,
repository tests, execution environment, canonical port composition, real host
network policy and the full native gate remain pending. Verified counts remain
228/370 originals and 5/6 newer additions.
