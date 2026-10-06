# Security workbench usecases

Open **Network → Security checks** on a gateway running this source version. Choose a profile, enter an owned or authorized literal IP and TCP port, then confirm authorization. Changing scope fields resets the checkbox. File checks also require an owned project chat and an authorized project-relative path.

Scopes expire within one hour, carry the operator and gateway vantage point, and apply only to the dedicated security tools/routes. They do not authorize generic terminal commands or the existing `network.scan`. Literal unicast IPv4 only: no implicit subnet expansion, DNS resolution, URL targets, IPv6 or remote-node execution. Exclusions always override targets. Scheduled executions enforce the same boundaries.

## Agent results in chat

Security tools render readable chat cards automatically: scope, scanner availability, services, findings, cited evidence, coverage, fix/rollback plans, verification, comparisons and monitoring. Completed result cards remain visible when a call finishes and when a conversation is reloaded. Evidence facts and long lists expand within the card. Scanner content is plain text; raw artifacts and credential-like facts are not rendered.

Ask the agent to show an existing assessment: `security.results.show` takes its `runId`, enforces ownership and reads the saved native TCP or expanded check without rescanning. `security.findings.list/explain`, `security.remediation.plan` and `security.verification.run` also render their own cards. Preparing a plan does not apply changes; approval continues through the existing tool workflow.

“Still observed,” “inconclusive” and “verified absent” are separate outcomes. A successful tool invocation does not imply the issue is fixed, and an empty findings list does not prove security.

## Available profiles

| View / tool | Practical usecase | Evidence and limitations |
| --- | --- | --- |
| Service inventory / `security.assets.discover`, `security.services.scan` | Identify intended management listeners, detect an unexpected listener, repeat after shutdown | TCP open/refused/timeout/error; port convention is not application identity; timeout is inconclusive |
| `security.services.nmap` | Cross-check selected scoped TCP ports with Nmap | Fixed unprivileged connect scan, XML, no scripts/version probes/UDP/OS/DNS |
| `security.tls.check` | Check certificate renewal, expected identity and gateway trust | Dates, fingerprint, identity and negotiated protocol; private CA trust is gateway-specific; no exhaustive cipher or legacy protocol sweep |
| `security.http.check`, `security.https.check` | Inspect root response header policy, repeat after a header change | One GET /, no redirects; bodies/cookies/credentials are discarded; only 2xx response coverage is conclusive; HTTPS trust uses a separate TLS check |
| `security.ssh.check` | Read SSH identification without logging in | Bounded identification line; comments discarded; banner alone never confirms a CVE |
| `security.host.audit` | Review gateway OS and selected SSH directives, or read a remote host through an approved existing key | No proxy/forwarding/password prompts; strict host-key verification; file directives remain suspected because includes/Match/defaults may change effective policy |
| `security.web.scan` | Independently inspect missing nosniff using reviewed Nuclei logic | Only Jait's hash-pinned template; GET /, no arbitrary templates/callbacks/redirects/headless/code/fuzzing; independent native response check supplies coverage |
| `security.software.scan` | Review a Dockerfile or Kubernetes snapshot and correlate packages with cached advisories | Trivy offline snapshot; secrets scanning disabled; package option needs a prepared local database; CVE applicability remains suspected |
| `security.telemetry.ingest` | Review an exported Wazuh/Suricata JSONL file alongside measurements | Up to 100 in-scope normalized alerts, numeric source rule IDs; original sensor version/vantage unknown; imported reports cannot prove a fix |

Scanner availability appears above the form. Missing engines disable their UI profile and return an explicit unavailable result through API/tools. No binary or database is installed during assessment. Native profiles need no scanner dependency.

## Evidence to verified improvement

1. Run one check and inspect its evidence, time, scanner/profile revision, exact scope and coverage.
2. Open **Findings**. Observed policy failures and suspected package/source reports are distinct; severity and confidence are recorded without a blanket security score.
3. Choose **Inspect cited evidence** or **Prepare fix and rollback**. Review the target-specific recommendation, backup and legitimate-access requirements.
4. Apply an authorized change through the existing consent workflow. The workbench does not apply changes automatically.
5. Choose **Verify same check**. A compatible conclusive run from the same gateway and scanner revision may record **verified-absent**. Failed, cancelled, unavailable or changed-engine checks remain inconclusive. Trivy configuration verification requires the specific rule to report PASS; disappearing behind unsupported or different checks is inconclusive. Software absence describes the same snapshot check; it does not prove live deployment or exploitability.
6. Repeat a check and use **Compare previous check** to see newly observed and no-longer-observed rules. Baseline comparison alone does not mark findings fixed.
7. Accept a reviewed risk or mark a false positive; decisions survive repeated observations. Reopen a decision when appropriate.

A new certificate, unexpected listener or package upgrade is not proof of network security. LAN measurements do not establish WAN reachability.

## Monitoring, privacy and storage

**Monitor this check every 15 minutes** schedules the exact saved TLS/HTTP/HTTPS/SSH/Nmap input. Typed scheduling also supports 30/60 minutes. The job disables itself when its scope expires. Renew authorization explicitly for longer monitoring; jobs cannot expand targets or change methods. Results appear in assessment history. This first profile does not send change notifications.

**Export redacted report** aliases target addresses and operator/vantage identities by default, includes normalized evidence and coverage, and omits raw scanner output and authorized filesystem paths. Review before sharing. Tool responses contain normalized selected facts; credentials, response bodies, cookies, SSH comments, sensor messages and scanner descriptions are discarded. Local execution/storage does not mean cloud provider processing is local.

Migration 67 stores scopes/native TCP runs. Migration 68 stores expanded runs, findings and separate hash-addressed scanner artifacts. Raw scanner reports stay in local SQLite and may contain private identifiers; they are not exposed to model-facing tools or report export. **Delete run data** removes an expanded run and its raw artifact. The finding ledger remains, so deletion never implies a fix; a deleted evidence run cannot subsequently be explained or verified. Automatic retention and native TCP record deletion remain planned.

## Execution budgets

One active assessment across all operators and profiles. Gateway execution only. Run duration at most 60 seconds or scope expiry, whichever comes first. Native TCP: up to 16 targets/16 ports, one connection at a time, five starts/second, 750 ms per connect. Protocol checks: three-second timeout, bounded HTTP headers/body consumption and SSH identification. Child engines: fixed argv, isolated temporary working/config directories, no shell, 512 KiB output limit, cancellation kills the child. Nmap is limited to five packets/second and one parallel probe; Nuclei to one request/second and one worker.

Filesystem assessment currently requires Linux descriptor-path validation. Snapshots validate the opened file descriptor as well as the pathname, reject external paths and parent/final symlinks, exclude credential directories and .env files, and cap 128 files, 1 MiB, traversal count/depth. Trivy permits built-in Dockerfile/Kubernetes misconfiguration checks and optional offline package correlation; no Terraform/Helm remote modules, image pulls or database updates. Telemetry import is capped at 64 KiB and 100 events.

## Developer validation

```sh
bun run typecheck
bun run test
npm --prefix tests/e2e test -- security-workbench.spec.ts service-checks.spec.ts security-tool-cards.spec.ts
```

The production bundle can exceed Jait's default terminal memory cap. On Linux with a user systemd manager, use a temporary build-only scope (permanent limits remain unchanged):

```sh
systemd-run --user --scope -p MemoryHigh=4G -p MemoryMax=6G \
  timeout --signal=TERM --kill-after=5s 240s \
  env NODE_OPTIONS=--max-old-space-size=4096 BUILD_SOURCEMAP=false bun run build
```

Tests exercise authentication/ownership, exclusions/expiry/node mismatch, target/argument injection, malformed/out-of-scope scanner output, entities/scripts, symlink escapes, partial failures, cancellation, redaction, persistence/restart, scheduler binding, and actual protocol fixtures before/after fixes.

Optional installed-engine tests use actual binaries on disposable loopback/filesystem fixtures:

```sh
JAIT_TEST_SECURITY_ENGINES=1 bunx vitest run packages/gateway/src/lib/security/engines.integration.test.ts
```

Run `bun packages/gateway/scripts/security-smoke.ts` with Nmap/Nuclei/Trivy on PATH to exercise the same workbench and issue/fix/verification cycle on the production Bun runtime, using disposable fixtures only.

Set `JAIT_TEST_TRIVY_CACHE` to an already-prepared test database cache to enable the package correlation fixture. The test verifies a specific historical advisory disappears after upgrading while preserving any newer advisories. Test binaries/database are development dependencies, not bundled shipping assets.

A real-network pilot remains pending exact owned targets/exclusions and a live gateway running the new code. No test automatically scans the LAN.
