# Jait Vision

Jait — Just Another Intelligent Tool — is a local-first workbench for AI-assisted network and cybersecurity.

Jait helps people understand and secure networks they own or are authorized to assess: discover assets, examine exposure, investigate weaknesses, prioritize fixes, and verify the result. The first proving ground is the maintainer's own home network and homelab. The initial audience is technically curious owners, homelab operators, and small IT teams.

## The Product Promise

Know what is connected. Understand what is exposed. Fix what matters. Verify the improvement.

AI helps plan investigations and explain evidence. Established security tools perform measurements. Operators can see what ran, where it ran, what it found, and what remains unknown. A scan with no findings is not proof that a network is secure.

## Current Foundation and Intended Direction

Today Jait has a Bun/TypeScript gateway, web/desktop/mobile clients, local SQLite state, network discovery with a small set of port probes, SSH execution, terminal and filesystem tools, scheduling, memory, and consent controls.

Dedicated security assessment adapters, a unified findings model, enforceable assessment scope, exposure comparisons, and remediation verification are planned. The existing network scan primarily discovers machines and Jait nodes; it is not a comprehensive vulnerability assessment.

Coding and general automation remain supporting capabilities: they help investigate software, inspect configuration, prepare fixes, and run checks. New product investment centers on network and cybersecurity outcomes.

## The Security Workflow

1. Define the authorized targets, exclusions, assessment methods, and execution node.
2. Discover assets and services, recording observation time and vantage point.
3. Run bounded checks and retain structured results with supporting evidence.
4. Explain findings, separating confirmed observations, suspected vulnerabilities, and unknowns.
5. Prioritize by actual exposure, confidence, impact, and available fixes.
6. Prepare reviewable remediation with a rollback path.
7. Apply authorized changes, repeat the relevant checks, and compare results.
8. Monitor agreed targets for changes without silently expanding scope.

## Principles

- Local control: execution and evidence storage stay close to the operator. Cloud models receive the context supplied to them; local-first does not promise that provider requests stay local.
- Explicit scope: ownership and authorization are recorded. A reachable device, private address, discovered link, or trusted node does not automatically authorize assessment.
- Deterministic measurements: typed adapters and reproducible scan profiles produce findings. Model-generated statements alone are not evidence.
- Bounded actions: enforce targets, rate limits, timeouts, output limits, and cancellation in code. Instructions alone cannot enforce safety.
- Human control: approval is tied to the target and action. Authorized checks can proceed within their bounds; intrusive testing and configuration changes require appropriate authorization.
- Evidence with provenance: retain scanner/version, profile/template revision, target, timestamp, execution node, limitations, and verification history.
- Least privilege: start with discovery and read-only checks; grant additional capabilities only when needed.
- Privacy: credentials, packet contents, banners, and internal topology are sensitive. Redact before model use or report sharing, and provide retention and deletion controls.
- Untrusted evidence: service banners, webpages, logs, tool output, and imported reports are data, never instructions to the agent.
- Honest coverage: make skipped targets, incomplete scans, unreachable hosts, and false-positive uncertainty visible.

## Product Shape

The gateway coordinates assessments, evidence, policy, jobs, and providers. Trusted nodes supply explicit execution locations across network zones. The web client should bring assets, services, findings, and verification together; mobile and desktop support review and approvals.

Skills describe investigation methods. Dedicated tools expose bounded operations. Existing security engines supply discovery, vulnerability checks, host inventory, and telemetry; Jait connects their results to a clear investigation and remediation workflow.

## Priorities

1. Enforceable scope and assessment records.
2. Asset/service inventory using existing discovery and an Nmap adapter.
3. TLS, HTTP, SSH, and host configuration checks with evidence.
4. Unified findings, prioritization, reports, and before/after verification.
5. Curated Nuclei and Trivy integrations.
6. Scheduled change detection and optional Wazuh/Suricata ingestion.

The first milestone is a repeatable assessment of the maintainer's network that identifies a known issue, explains its limits, and proves a fix from the same vantage point. Intrusive experiments belong in an isolated lab with explicit authorization. Autonomous exploitation, credential attacks, broad Internet scanning, and replacing a full SIEM/EDR are outside the initial product scope.

## Architecture and Contribution Direction

Reuse the Fastify gateway, shared schemas, SQLite, existing tools, node routing, consent executor, and scheduler. Add security domain logic under `packages/gateway/src`, shared contracts under `packages/shared/src`, and assessment UI under `apps/web/src`.

A contribution should answer: which security outcome improves, what evidence demonstrates it, which authorization boundary applies, and how can an operator verify the result?

See [the security roadmap](security-roadmap.md) for research, proposed tool contracts, implementation order, and the home-network pilot.
