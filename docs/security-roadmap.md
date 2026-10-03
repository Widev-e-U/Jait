# Network and Cybersecurity Roadmap

Research and implementation proposal, 2026-10-03. All tool names below are proposals unless explicitly marked existing. This change defines direction; it does not ship scanner adapters or run a network assessment.

## Goal and Evidence

Make Jait a practical security workbench for owned or explicitly authorized networks. The first success criterion is a repeatable home-network assessment with an asset inventory, evidence-backed findings, a prioritized fix plan, and verification of at least one known issue after remediation.

Inventory, configuration review, and vulnerability management form a coherent starting point in the [CIS Controls](https://www.cisecurity.org/controls/cis-controls-navigator). Nmap and Wazuh offer complementary external service observations and authenticated software inventory. This supports starting with inventory and evidence rather than promising complete coverage from a port scan.

Confidence is high in the tool capabilities documented below; integration effort and network-specific coverage require prototypes. No current claim about the security of the maintainer's network is made.

## Existing Jait Capabilities and Gaps

| Existing code | Reusable foundation | Gap |
| --- | --- | --- |
| `packages/gateway/src/lib/network-scan.ts`, `tools/network-tools.ts` | ARP/neighbour discovery, IPv4 subnet sweep, probes on nine ports; existing `network.scan` | Full service inventory, IPv6 assessment, explicit scope enforcement, scan history and vantage point |
| `packages/gateway/src/routes/network.ts` | Network host records, interfaces, node deployment | Deployment is not assessment; asset identity needs more than IP alone |
| `packages/gateway/src/tools/ssh-tools.ts` | Existing `ssh.run` and SSH sessions | Bounded authenticated audit profiles and normalized evidence |
| `packages/gateway/src/security/` | Consent executor, permissions, path and SSRF guards | Assessment scope shared across tools, routes, nodes, and scheduled jobs |
| `packages/gateway/src/db/`, `tools/cron-tools.ts` | SQLite and recurring work | Durable assessments, findings, artifact retention and meaningful change alerts |
| `packages/shared/src/`, `apps/web/src/` | Typed contracts and existing UI | Assets → services → findings → fixes → verification workflow |

The present scan infers IPv4 subnet prefixes and supports /24 discovery. It must not be represented as full topology discovery or vulnerability scanning.

## Approaches Considered

1. Shell commands and security skills only: useful for an immediate manual pilot, but weak normalization and scope guarantees.
2. Typed adapters around established security tools: recommended. Reuses proven engines while giving Jait consistent policy, provenance, reports, and verification.
3. Build an enterprise SIEM/EDR first: broad coverage but large infrastructure and maintenance cost. Integrate with existing systems later.

## Dedicated Tools to Build

| Proposed tool | Purpose and engine | Priority / limits |
| --- | --- | --- |
| `security.scope.create/get` | Authorized CIDRs, IPs, hosts/URLs, exclusions, operator, allowed profiles, expiry, node/vantage point | First; scope enforced by execution code |
| `security.assets.discover` | Existing discovery, then Nmap host discovery; asset identity and scan snapshots | First; bounded target count and rate |
| `security.services.scan` | Nmap TCP/service checks, parsed XML | First; explicit ports, no default aggressive scan or arbitrary NSE scripts |
| `security.tls.check`, `security.http.check`, `security.ssh.check` | Protocol/certificate checks and read-only configuration evidence | Next; distinguish protocol results from policy recommendations |
| `security.host.audit` | Authenticated read-only OS, package, listening-service, firewall and SSH configuration checks | Next; per-platform profiles, least privilege |
| `security.web.scan` | Curated, revision-pinned Nuclei templates; optional ZAP Baseline | Later; active requests, template allowlist and budgets |
| `security.software.scan` | Trivy image/filesystem/configuration checks | Later; does not establish remote network exploitability |
| `security.findings.list/explain`, `security.report.export` | Deterministic results, supporting artifacts, priorities and redacted reports | Core MVP; AI explanation cites evidence IDs |
| `security.remediation.plan`, `security.verification.run` | Reviewable changes, rollback instructions and targeted retest | Core MVP; “fixed” requires verification |
| `security.baseline.compare`, `security.monitor.schedule` | New assets, newly exposed ports, changed findings and expiring certificates | After MVP; schedules retain authorized scope and expiry |
| `security.telemetry.ingest` | Optional Wazuh inventory/alerts and Suricata EVE JSON | Later; deployment and visibility prerequisites |

## Engine Research

- [Nmap XML output](https://nmap.org/book/output-formats-xml-output.html) is the recommended programmatic interface and includes service identification method/confidence. Parse XML with external entities disabled; retain raw output separately. Banner or port-name matches alone do not confirm a CVE.
- [Nuclei execution documentation](https://docs.projectdiscovery.io/opensource/nuclei/running) documents JSONL output, template selection, rate limits and concurrency. Select explicit reviewed templates, pin engine/template revisions, and disable out-of-band callbacks and code/headless/fuzzing modes in the initial profile. Severity filters alone do not make templates nonintrusive.
- [Trivy scanner documentation](https://trivy.dev/docs/latest/scanner/misconfiguration/) describes vulnerability, secret and configuration scanning. Configuration scanning requires explicit enablement for image/filesystem/repository targets. Keep secret values out of transcripts and reports.
- [ZAP Baseline](https://www.zaproxy.org/docs/docker/baseline-scan/) spiders a site and passively analyzes responses; it does not run attack rules. Crawling still sends requests and can follow links: enforce scope and exclude logout/state-changing paths.
- [Wazuh vulnerability detection](https://documentation.wazuh.com/current/user-manual/capabilities/vulnerability-detection/how-it-works.html) correlates collected OS/package inventory with vulnerability data. Prefer importing its results over recreating an endpoint agent.
- [Suricata EVE JSON](https://docs.suricata.io/en/latest/output/eve/eve-json-output.html) supplies structured telemetry. A sensor requires traffic visibility through a mirror/TAP or suitable network position; installing it on a laptop does not reveal the whole switched network.

These engines answer different questions. Combining service observations with authenticated inventory improves context, but coverage and false positives must still be reported. Review individual engines' redistribution licenses before bundling binaries; Jait's MIT license does not relicense them. Start with explicitly installed executables and version checks.

## Contract and Execution Design

Proposed shared schemas: `SecurityScope`, `AssessmentRun`, `SecurityAsset`, `ServiceObservation`, `SecurityFinding`, `EvidenceArtifact`, `RemediationPlan`, and `VerificationRun`.

Each run records scope revision, operator, node/vantage point, resolved targets, profile and scanner versions, timestamps, exit status, cancellation, skipped targets and coverage. Findings record stable rule identity, asset/service, severity, confidence, observed/suspected/confirmed status, evidence references, first/last seen, remediation and verification history. Preserve accepted-risk and false-positive decisions with provenance. An IP change must not silently merge unrelated devices.

Invoke executables with argument arrays, no model-supplied shell fragments. Enforce target allowlists, exclusions, IPv4/IPv6 boundaries, target limits, timeouts, output limits and cancellation before dispatch and on the execution node. Resolve and validate hostnames at execution; constrain DNS changes, redirects, crawling, template callbacks and proxies so they cannot expand scope. Generic web-fetch SSRF protection stays intact; authorized private-network assessment needs a dedicated scoped path.

Use explicit reviewed scan profiles. Start unprivileged, with conservative rate/concurrency and selected TCP ports; assess IoT devices separately. Sensitive changes, exploitation, credential testing, packet capture and disruptive profiles need authorization specific to the method and target. Approval of an assessment does not authorize installing agents or changing firewall rules.

Store raw artifacts under protected local storage, with hashes, size limits, retention/deletion controls and redacted derived evidence. Send only necessary redacted context to models. Local models reduce external disclosure but do not disable scanner database downloads or cloud connectors. Treat all captured strings as untrusted content.

## Ordered Implementation

1. **Scope and records:** add schemas in `packages/shared/src`; scope policy and assessment service under `packages/gateway/src/security`; SQLite migration using existing migration conventions. Test exclusions, CIDR/IPv6 handling, DNS/redirect escape, expiry, node enforcement and scheduled execution.
2. **Discovery and Nmap:** add adapters under `packages/gateway/src/lib/security` and tool registration under `packages/gateway/src/tools`. Add typed API-client methods. Test XML fixtures, malformed/oversized output, partial runs, missing binaries and cancellation.
3. **Checks and findings:** add TLS/HTTP/SSH checks, authenticated host audit profiles, normalized findings and local artifacts. Include positive and negative fixtures; no blanket security score or banner-only confirmed CVEs.
4. **Assessment UI and reports:** build asset/service/finding views under `apps/web/src`, show evidence and coverage, export redacted reports. Add meaningful UI E2E tests.
5. **Remediation and verification:** reuse existing consent paths for concrete changes; retain backups and compare the same check from the same vantage point. Demonstrate issue-present → fix → issue-absent in an isolated fixture.
6. **Pilot the owned network:** follow the procedure below and adjust profiles against measured impact.
7. **Extend:** curated Nuclei, Trivy, scheduled drift detection; optional ZAP/Wazuh/Suricata integrations after the MVP is useful.

New database tables and artifact storage are expected; exact migration names remain implementation decisions. Additive API routes/tools should preserve existing network/SSH compatibility. No schema migration, environment-variable change, binary installation or runtime change is included in this direction update.

## Home-Network Pilot

1. Confirm current owned subnets, domains, public IPv4/IPv6 addresses, excluded/fragile devices and a scan window. Historical network observations are leads, not current evidence.
2. Record LAN interfaces/routes and router-provided DHCP/lease inventory if accessible. Compare low-impact discovery with known devices; mark unknown and unreachable assets.
3. Run bounded service discovery on selected hosts. Review router WAN forwarding, UPnP, remote management and IPv6 firewall policy through authorized read-only access.
4. Check exposed web services, TLS, SSH and authenticated host configuration. Start with the router, Jait gateway, servers and management interfaces; handle cameras/IoT conservatively.
5. Use a separately authorized external vantage point for WAN reachability. LAN scans and NAT loopback cannot prove public exposure or isolation.
6. Produce an evidence-backed prioritized report, including unsupported firmware/software, unexpected services, authentication and segmentation issues. Do not copy private topology or credentials into public docs.
7. Choose one confirmed issue, prepare a concrete fix and rollback, apply with authorization, and repeat the original check. Confirm legitimate access still works.
8. Save a baseline and schedule only agreed checks. Report drift and expired/failed checks instead of announcing that the network is “secure.”

Completion requires scope, timestamps, vantage points, tool revisions, findings with evidence, coverage gaps, and one verified improvement. Do not run intrusive tests, credential attacks, or automatic remediation as part of this initial pilot.
