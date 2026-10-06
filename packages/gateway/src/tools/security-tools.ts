import type { ToolDefinition } from "./contracts.js";
import type { SecurityScopeInput } from "@jait/shared";
import { getAssessmentService } from "../security/assessment.js";

export function createSecurityTools(): ToolDefinition[] {
  const stringArray = { type: "array", items: { type: "string" } };
  const definitions: ToolDefinition[] = [
    {
      name: "security.scope.create", displayName: "Authorize assessment targets",
      description: "Record explicit authorized IPv4 targets, excluded IPs, selected TCP ports and expiry (within one hour). Gateway-only TCP connection checks, up to 16 targets and 16 ports. Requires the operator's authorization.",
      tier: "standard", category: "network", source: "builtin", risk: "medium", defaultConsentLevel: "always",
      parameters: { type: "object", properties: {
        targets: { ...stringArray, description: "Explicit operator-authorized IPv4 addresses; no inferred authorization" },
        exclusions: stringArray,
        ports: { type: "array", items: { type: "number" } },
        expiresAt: { type: "string", description: "ISO timestamp, within the next hour" },
        methods: { ...stringArray, description: "Explicit allowed methods: tcp, tls, http, https, ssh, host-audit, nmap, nuclei, trivy, telemetry" },
        paths: { ...stringArray, description: "Project-relative file/directory targets for software scans or telemetry import" },
        serverNames: { ...stringArray, description: "Allowed TLS SNI/identity names (no DNS resolution)" },
        sshUsernames: { ...stringArray, description: "Allowed SSH users for read-only authenticated host audit" },
        authorized: { type: "boolean", description: "True only after operator authorization for these exact targets and methods" },
      }, required: ["targets", "exclusions", "ports", "expiresAt", "authorized"] },
      execute: async (input, context) => {
        if (context.executionNodeId && context.executionNodeId !== "gateway") return { ok: false, message: "Assessments currently execute on the gateway only" };
        const scope = getAssessmentService().createScope(input as SecurityScopeInput, context.userId ?? context.requestedBy, context.projectRoot);
        return { ok: true, message: "Authorized TCP scope recorded; no checks performed yet", data: scope };
      },
    },
    {
      name: "security.services.scan", displayName: "Check authorized TCP services",
      description: "Run bounded TCP connections for an existing authorized scope. No DNS, banners, HTTP requests, redirects, scripts or credential testing. Open ports are observations, not vulnerabilities. Records evidence, time and coverage.",
      tier: "standard", category: "network", source: "builtin", risk: "low",
      parameters: { type: "object", properties: { scopeId: { type: "string" } }, required: ["scopeId"] },
      execute: async (input, context) => {
        const operator = context.userId ?? context.requestedBy;
        const service = getAssessmentService();
        const run = service.start((input as {scopeId: string}).scopeId, operator, context.executionNodeId ?? "gateway", context.signal);
        const result = await service.wait(run.id, operator);
        return { ok: result.status === "completed", message: `Assessment ${result.status}: ${result.observations.length}/${result.plannedChecks} TCP checks; ${result.observations.filter(o => o.state === "open").length} reachable ports. Evidence appears in the chat card.`, data: result };
      },
    },
    {
      name: "security.assessments.list", displayName: "Review assessment evidence",
      description: "Review your recent assessment scopes, TCP observations, evidence IDs and coverage gaps.",
      tier: "standard", category: "network", source: "builtin",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context) => {
        const history = getAssessmentService().history(context.userId ?? context.requestedBy);
        return { ok: true, message: "Recent assessment summaries; use security.assessments.get for individual evidence", data: {
          scopes: history.scopes.slice(0, 10),
          runs: history.runs.slice(0, 10).map(run => ({
            id: run.id, scopeId: run.scopeId, startedAt: run.startedAt, completedAt: run.completedAt,
            status: run.status, vantagePoint: run.scope.vantagePoint, profile: run.scope.profile,
            engine: run.engine, engineVersion: run.engineVersion, plannedChecks: run.plannedChecks,
            performedChecks: run.observations.length,
            reachablePorts: run.observations.filter(o => o.state === "open").length,
            inconclusiveChecks: run.observations.filter(o => o.state === "timeout" || o.state === "error").length,
            coverageGaps: run.coverageGaps,
          })),
        } };
      },
    },
    {
      name: "security.assessments.get", displayName: "Inspect assessment evidence",
      description: "Get a single assessment's bounded TCP evidence, authorization scope, gateway vantage, engine version and coverage gaps.",
      tier: "standard", category: "network", source: "builtin",
      parameters: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
      execute: async (input, context) => ({
        ok: true, message: "Assessment evidence",
        data: getAssessmentService().getRun((input as {runId: string}).runId, context.userId ?? context.requestedBy),
      }),
    },
    {
      name: "security.assessments.cancel", displayName: "Stop service checks",
      description: "Cancel your running gateway TCP assessment and retain partial evidence.",
      tier: "standard", category: "network", source: "builtin",
      parameters: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] },
      execute: async (input, context) => {
        getAssessmentService().cancel((input as {runId: string}).runId, context.userId ?? context.requestedBy);
        return { ok: true, message: "Cancellation requested; completed observations retained" };
      },
    },
  ];
  return definitions.map(tool => ({ ...tool, execute: async (input, context) => {
    try { return await tool.execute(input, context); }
    catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Assessment failed" }; }
  } }));
}
