import type { ToolContext, ToolDefinition } from "./contracts.js";
import type { SecurityCheckInput, SecurityProfile } from "@jait/shared";
import { getSecurityWorkbench } from "../security/workbench.js";
import { getAssessmentService } from "../security/assessment.js";
import type { SchedulerService } from "../scheduler/service.js";

export function createSecurityWorkbenchTools(scheduler?: SchedulerService): ToolDefinition[] {
  const inputProperties = {
    scopeId: { type: "string", description: "Previously authorized scope ID" },
    target: { type: "string", description: "Literal IP from the scope" },
    port: { type: "number", description: "TCP port from the scope" },
    serverName: { type: "string", description: "Previously authorized TLS SNI/identity name" },
    username: { type: "string", description: "Previously authorized SSH user (existing key and trusted host key required)" },
    path: { type: "string", description: "Previously authorized project-relative file/directory" },
    source: { type: "string", enum: ["wazuh", "suricata"] },
    scheme: { type: "string", enum: ["http", "https"] },
    includePackages: { type: "boolean", description: "Use an already-prepared local Trivy vulnerability database; never download during scans" },
  };
  const operator = (context: ToolContext) => context.userId ?? context.requestedBy;
  const runTool = (name: string, profile: SecurityProfile, description: string): ToolDefinition => ({
    name, description, tier: "standard", category: "network", source: "builtin", risk: profile === "host-audit" || profile === "nuclei" ? "medium" : "low",
    parameters: { type: "object", properties: inputProperties, required: ["scopeId"] },
    execute: async (input, context) => {
      const service = getSecurityWorkbench();
      const body = (input ?? {}) as SecurityCheckInput;
      const run = service.start({ ...body, profile }, operator(context), context.executionNodeId ?? "gateway", context.signal);
      const result = await service.wait(run.id, operator(context));
      return { ok: result.status === "completed", message: profile + " check " + result.status + "; " + result.findingIds.length + " evidence-backed observations. Results appear in the chat card.", data: result };
    },
  });
  const tools: ToolDefinition[] = [
    runTool("security.tls.check", "tls", "Inspect a scoped TLS certificate, trust, identity and negotiated protocol. No exhaustive cipher or legacy-protocol test."),
    runTool("security.http.check", "http", "Request only GET / on a scoped IP/port; inspect status and header presence. No redirects, cookies, credentials, bodies or crawling."),
    runTool("security.https.check", "https", "Inspect HTTPS GET / header policy. Certificate/trust findings require security.tls.check."),
    runTool("security.ssh.check", "ssh", "Read a bounded SSH identification string; no authentication, credentials or banner-only CVE conclusions."),
    runTool("security.host.audit", "host-audit", "Read gateway OS/SSH directives, or a fixed SSH audit on an authorized user/target. SSH uses existing keys, strict host-key verification and no proxy or forwarding. Effective policy may remain unknown."),
    runTool("security.web.scan", "nuclei", "Run only Jait's hash-pinned GET / nosniff template via Nuclei, then confirm HTTP response coverage. No arbitrary templates, redirects, callbacks, code, headless, fuzzing or credentials."),
    runTool("security.software.scan", "trivy", "Run offline Trivy configuration checks on a bounded project snapshot. No secrets, symlinks, external paths, image pulls or database downloads. Optional package correlation uses a prepared local database and records its metadata revision; applicability remains suspected."),
    runTool("security.telemetry.ingest", "telemetry", "Import up to 100 Wazuh/Suricata JSONL events from a scoped project file, preserving only in-scope normalized alerts as unverified source reports."),
    runTool("security.services.nmap", "nmap", "Run fixed unprivileged Nmap selected-port TCP inventory; no scripts, DNS, UDP, OS detection or version scripts. Parse bounded XML with scope checks."),
    {
      name: "security.results.show", displayName: "Show saved security assessment",
      risk: "low", defaultConsentLevel: "none",
      description: "Display a saved assessment in a readable chat tool card with findings, evidence, scanner version, time, vantage and coverage gaps. Read-only: retrieves an owned native TCP or expanded check by runId without rescanning. Use after a check or when the user asks to see existing results.",
      tier: "standard", category: "network", source: "builtin",
      parameters: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
      execute: async (input, context) => {
        const runId = (input as { runId: string }).runId;
        const owner = operator(context);
        let run;
        try { run = getSecurityWorkbench().get(runId, owner); }
        catch { run = getAssessmentService().getRun(runId, owner); }
        return { ok: true, message: "Saved assessment evidence; no new checks performed", data: run };
      },
    },
    {
      name: "security.scope.get", description: "Get an assessment scope owned by the current operator; does not extend expiry or authorization.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { scopeId: { type: "string" } }, required: ["scopeId"] },
      execute: async (input, context) => ({ ok: true, message: "Authorized scope", data: getAssessmentService().getScope((input as {scopeId: string}).scopeId, operator(context)) }),
    },
    {
      name: "security.engines.status", description: "Check locally installed Nmap, Nuclei and Trivy versions. Missing engines are reported explicitly; nothing is installed or downloaded.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: {} },
      execute: async (_input, context) => ({ ok: true, message: "Scanner availability", data: await getSecurityWorkbench().engines(context.signal) }),
    },
    {
      name: "security.assets.discover", description: "Discover responsiveness among explicit authorized scope targets using bounded selected-port TCP checks; no automatic subnet expansion or unscoped ARP hosts.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { scopeId: { type: "string" } }, required: ["scopeId"] },
      execute: async (input, context) => {
        const service = getAssessmentService(); const owner = operator(context);
        const result = await service.wait(service.start((input as {scopeId: string}).scopeId, owner, context.executionNodeId ?? "gateway", context.signal).id, owner);
        const targets = result.scope.targets.filter(ip => !result.scope.exclusions.includes(ip));
        return { ok: result.status === "completed", message: "Explicit-target asset discovery " + result.status, data: { runId: result.id, scannedAt: result.completedAt, vantagePoint: result.scope.vantagePoint,
          assets: targets.map(target => ({ target, status: result.observations.some(o => o.target === target && (o.state === "open" || o.state === "refused")) ? "responsive" : "unknown",
            evidenceIds: result.observations.filter(o => o.target === target).map(o => o.evidenceId) })), coverageGaps: result.coverageGaps } };
      },
    },
    {
      name: "security.findings.list", description: "List recent normalized findings with confidence, evidence references, disposition and verification state; no blanket security score.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: {} },
      execute: async (_input, context) => ({ ok: true, message: "Recent findings", data: getSecurityWorkbench().history(operator(context)).findings.slice(0, 25) }),
    },
    {
      name: "security.findings.explain", description: "Explain a measured rule using its cited evidence, confidence, coverage and remediation recommendation.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { findingId: {type: "string"} }, required: ["findingId"] },
      execute: async (input, context) => {
        const service = getSecurityWorkbench(); const owner = operator(context);
        const finding = service.finding((input as {findingId: string}).findingId, owner); const run = service.get(finding.runId, owner);
        return { ok: true, message: finding.title, data: { finding, evidence: run.evidence.filter(e => finding.evidenceIds.includes(e.id)), coverageGaps: run.coverageGaps, engine: run.engine, engineVersion: run.engineVersion } };
      },
    },
    {
      name: "security.remediation.plan", description: "Prepare concrete rule-specific remediation, backup, rollback and same-check verification instructions. Changes still use existing consent paths.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { findingId: {type: "string"} }, required: ["findingId"] },
      execute: async (input, context) => ({ ok: true, message: "Reviewable remediation plan", data: getSecurityWorkbench().plan((input as {findingId: string}).findingId, operator(context)) }),
    },
    {
      name: "security.verification.run", description: "Repeat the original scoped check from the same gateway. Mark verified-absent only after a conclusive compatible protocol result; failures/timeouts/changed engines remain inconclusive.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { findingId: {type: "string"} }, required: ["findingId"] },
      execute: async (input, context) => {
        const result = await getSecurityWorkbench().verify((input as {findingId: string}).findingId, operator(context), context.executionNodeId ?? "gateway", context.signal);
        return { ok: result.status !== "inconclusive", message: result.reason, data: result };
      },
    },
    {
      name: "security.baseline.compare", description: "Compare two completed checks with identical authorized scope, profile, engine version and gateway vantage. Incompatible/incomplete runs remain inconclusive.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { beforeRunId: {type: "string"}, afterRunId: {type: "string"} }, required: ["beforeRunId", "afterRunId"] },
      execute: async (input, context) => {
        const body = input as {beforeRunId: string; afterRunId: string};
        return { ok: true, message: "Baseline comparison", data: getSecurityWorkbench().compare(body.beforeRunId, body.afterRunId, operator(context)) };
      },
    },
    {
      name: "security.report.export", description: "Export a report with deterministic evidence, scanner versions and limits. Target addresses and operator/vantage identities are aliased by default; no raw artifacts or scope paths are exported.",
      tier: "standard", category: "network", source: "builtin", parameters: { type: "object", properties: { runId: {type: "string"} }, required: ["runId"] },
      execute: async (input, context) => ({ ok: true, message: "Redacted security report; review before sharing", data: getSecurityWorkbench().report((input as {runId: string}).runId, operator(context)) }),
    },
  ];
  if (scheduler) tools.push({
    name: "security.monitor.schedule", description: "Schedule the exact scoped network check every 15, 30 or 60 minutes. Expiry is enforced on every execution; the job disables itself when scope expires. No host audits or software/telemetry jobs.",
    tier: "standard", category: "network", source: "builtin", risk: "medium", defaultConsentLevel: "always",
    parameters: { type: "object", properties: { ...inputProperties, profile: { type: "string", enum: ["tls", "http", "https", "ssh", "nmap"] }, minutes: { type: "number" } }, required: ["scopeId", "profile", "minutes"] },
    execute: async (input, context) => {
      const body = input as SecurityCheckInput & {minutes: number};
      if (![15, 30, 60].includes(body.minutes) || !["tls", "http", "https", "ssh", "nmap"].includes(body.profile)) throw new Error("Unsupported monitoring interval or profile");
      getSecurityWorkbench().authorize(body, operator(context), context.executionNodeId ?? "gateway");
      const job = scheduler.create({ userId: operator(context), name: "Security " + body.profile + " change check", cron: body.minutes === 60 ? "0 * * * *" : "*/" + body.minutes + " * * * *", toolName: "security.monitor.tick", input: body, sessionId: context.sessionId, projectRoot: context.projectRoot });
      scheduler.update(job.id, { input: { ...body, monitorJobId: job.id } }, operator(context));
      return { ok: true, message: "Scoped monitor scheduled; it stops when authorization expires", data: { jobId: job.id, scopeId: body.scopeId, expiresAt: getAssessmentService().getScope(body.scopeId, operator(context)).expiresAt } };
    },
  }, {
    name: "security.monitor.tick", description: "Execute a previously scheduled scoped check and compare its baseline; expired authorization disables the owned monitor.",
    tier: "standard", category: "network", source: "builtin",
    parameters: { type: "object", properties: { ...inputProperties, profile: { type: "string" }, monitorJobId: { type: "string" } }, required: ["scopeId", "profile", "monitorJobId"] },
    execute: async (input, context) => {
      const request = input as {monitorJobId: string};
      const owner = operator(context); const job = scheduler.get(request.monitorJobId, owner);
      if (!job || !job.enabled || job.userId !== owner || job.toolName !== "security.monitor.tick") throw new Error("Monitor job not found or disabled");
      // The stored job is authoritative; callers cannot substitute targets or methods.
      const body = job.input as SecurityCheckInput;
      if (!["tls", "http", "https", "ssh", "nmap"].includes(body.profile)) throw new Error("Unsupported monitoring profile");
      const scope = getAssessmentService().getScope(body.scopeId, owner);
      if (Date.parse(scope.expiresAt) <= Date.now()) {
        scheduler.update(job.id, { enabled: false }, owner);
        return { ok: false, message: "Scope expired; monitor disabled. New authorization is required." };
      }
      const service = getSecurityWorkbench(); const previous = service.history(owner).runs.find(run => run.scopeId === body.scopeId && run.input.profile === body.profile && run.status === "completed");
      const result = await service.wait(service.start(body, owner, context.executionNodeId ?? "gateway", context.signal).id, owner);
      return { ok: result.status === "completed", message: "Scoped monitoring check " + result.status, data: { runId: result.id, comparison: previous ? service.compare(previous.id, result.id, owner) : null, coverageGaps: result.coverageGaps } };
    },
  });
  return tools.map(tool => ({ ...tool, execute: async (input, context) => {
    try { return await tool.execute(input, context); }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Security operation failed" }; }
  } }));
}
