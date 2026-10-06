import { claimAssessmentExecution } from "./assessment-lease.js";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SecurityCheckInput, SecurityCheckRun, SecurityFinding, SecurityScope,
  SecurityWorkbenchHistory, SecurityRemediationPlan, SecurityVerificationResult, SecurityBaselineComparison,
} from "@jait/shared";
import { SECURITY_PROFILES } from "@jait/shared";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { getAssessmentService, validateScope } from "./assessment.js";
import { checkTls, checkHttp, checkSsh, type AdapterResult } from "../lib/security/protocols.js";
import { scanNmap, scanNuclei, EngineUnavailable, engineStatus, runCommand, type CommandRunner } from "../lib/security/engines.js";
import { auditHost, scanSoftware, createSnapshot, parseTelemetry } from "../lib/security/host-software.js";

type Adapter = (input: SecurityCheckInput, scope: SecurityScope, signal: AbortSignal) => Promise<AdapterResult>;
export class SecurityWorkbenchService {
  private runs = new Map<string, SecurityCheckRun>();
  private findings = new Map<string, SecurityFinding>();
  private active: { id: string; scopeId: string; controller: AbortController; done: Promise<void> } | null = null;
  constructor(private sqlite?: SqliteDatabase, private overrideAdapter?: Adapter, private runner: CommandRunner = runCommand) {
    if (sqlite) {
      const runs = sqlite.prepare("SELECT data FROM security_check_runs ORDER BY started_at DESC LIMIT 50").all() as {data: string}[];
      for (const row of runs) {
        const run = JSON.parse(row.data) as SecurityCheckRun;
        if (run.status === "running") { run.status = "interrupted"; run.completedAt = new Date().toISOString(); run.coverageGaps.push("Gateway restarted before this check completed"); this.saveRun(run); }
        this.runs.set(run.id, run);
      }
    }
  }
  private ownScope(id: string, operatorId: string): SecurityScope { return getAssessmentService().getScope(id, operatorId); }
  authorize(input: SecurityCheckInput, operatorId: string, nodeId = "gateway"): SecurityScope {
    if (nodeId !== "gateway") throw new Error("Security checks currently execute on the gateway only");
    const scope = this.ownScope(input.scopeId, operatorId);
    validateScope(scope);
    if (input.scheme !== undefined && !["http", "https"].includes(input.scheme)) throw new Error("Unsupported web transport");
    if (input.includePackages !== undefined && typeof input.includePackages !== "boolean") throw new Error("Package scan option must be boolean");
    if (!SECURITY_PROFILES.includes(input.profile)) throw new Error("Unsupported security profile");
    if (!(scope.methods ?? ["tcp"]).includes(input.profile)) throw new Error("This method is not authorized by the scope");
    if (input.target !== undefined && (!scope.targets.includes(input.target) || scope.exclusions.includes(input.target))) throw new Error("Target is outside the authorized scope");
    if (input.port !== undefined && (!Number.isInteger(input.port) || !scope.ports.includes(input.port))) throw new Error("Port is outside the authorized scope");
    if (input.serverName !== undefined && !(scope.serverNames ?? []).includes(input.serverName)) throw new Error("TLS name is outside the authorized scope");
    if (input.username !== undefined && !(scope.sshUsernames ?? []).includes(input.username)) throw new Error("SSH username is outside the authorized scope");
    if (input.path !== undefined && !(scope.paths ?? []).includes(input.path)) throw new Error("Filesystem target is outside the authorized scope");
    if (["tls", "http", "https", "ssh", "nuclei", "host-audit"].includes(input.profile) && !input.target) throw new Error("An explicit target is required for this profile");
    if (["tls", "http", "https", "ssh", "nuclei"].includes(input.profile) && input.port === undefined) throw new Error("An explicit port is required for this profile");
    if (["trivy", "telemetry"].includes(input.profile) && (!input.path || !scope.projectRoot)) throw new Error("A project-bound filesystem target is required");
    if (input.profile === "host-audit" && input.username && (input.port === undefined || !scope.ports.includes(input.port))) throw new Error("Remote host audit requires an explicitly authorized SSH port");
    if (input.profile === "telemetry" && !["wazuh", "suricata"].includes(input.source ?? "")) throw new Error("Select Wazuh or Suricata import");
    return scope;
  }
  start(input: SecurityCheckInput, operatorId: string, nodeId = "gateway", signal?: AbortSignal): SecurityCheckRun {
    input = normalizeCheckInput(input);
    const scope = this.authorize(input, operatorId, nodeId);
    if (this.active || getAssessmentService().history(operatorId).runs.some(run => run.status === "running")) throw new Error("A security assessment is already running");
    const run: SecurityCheckRun = {
      id: randomUUID(), scopeId: scope.id, operatorId, scope, input: structuredClone(input), profileRevision: "security-profiles-v1",
      status: "running", startedAt: new Date().toISOString(), completedAt: null, engine: input.profile, engineVersion: "pending",
      evidence: [], findingIds: [], findings: [], coverageGaps: [],
    };
    const release = claimAssessmentExecution(run.id);
    try { this.saveRun(run); } catch (error) { release(); throw error; }
    this.runs.set(run.id, run);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const active = { id: run.id, scopeId: scope.id, controller, done: Promise.resolve() };
    this.active = active;
    active.done = this.execute(run, controller).catch(() => {
      run.status = "partial"; run.completedAt = new Date().toISOString();
      run.coverageGaps.push("Completion could not be persisted; evidence may not survive restart");
    }).finally(() => { release(); signal?.removeEventListener("abort", abort); if (this.active === active) this.active = null; });
    return structuredClone(run);
  }
  async wait(id: string, operatorId: string): Promise<SecurityCheckRun> {
    if (this.active?.id === id) await this.active.done;
    return this.get(id, operatorId);
  }
  get(id: string, operatorId: string): SecurityCheckRun {
    let run = this.runs.get(id);
    if (!run && this.sqlite) {
      const row = this.sqlite.prepare("SELECT data FROM security_check_runs WHERE id = ? AND operator_id = ?").get(id, operatorId) as {data: string} | undefined;
      if (row) run = JSON.parse(row.data) as SecurityCheckRun;
    }
    if (!run || run.operatorId !== operatorId) throw new Error("Check not found");
    return structuredClone(run);
  }
  history(operatorId: string): SecurityWorkbenchHistory {
    const runs = this.sqlite
      ? (this.sqlite.prepare("SELECT data FROM security_check_runs WHERE operator_id = ? ORDER BY started_at DESC LIMIT 50").all(operatorId) as {data: string}[]).map(row => JSON.parse(row.data) as SecurityCheckRun)
      : [...this.runs.values()].filter(run => run.operatorId === operatorId).reverse().slice(0, 50);
    const findings = this.sqlite
      ? (this.sqlite.prepare("SELECT data FROM security_findings WHERE operator_id = ? ORDER BY updated_at DESC LIMIT 256").all(operatorId) as {data: string}[]).map(row => JSON.parse(row.data) as SecurityFinding)
      : [...this.findings.values()].filter(finding => { try { this.ownScope(finding.scopeId, operatorId); return true; } catch { return false; } }).slice(-256).reverse();
    return structuredClone({ runs, findings });
  }
  finding(id: string, operatorId: string): SecurityFinding {
    let finding = this.findings.get(id);
    if (!finding && this.sqlite) {
      const row = this.sqlite.prepare("SELECT data FROM security_findings WHERE id = ? AND operator_id = ?").get(id, operatorId) as {data: string} | undefined;
      if (row) finding = JSON.parse(row.data) as SecurityFinding;
    }
    if (!finding) throw new Error("Finding not found");
    this.ownScope(finding.scopeId, operatorId);
    return structuredClone(finding);
  }
  cancel(id: string, operatorId: string): void { this.get(id, operatorId); if (this.active?.id === id) this.active.controller.abort(); }
  async engines(signal: AbortSignal = new AbortController().signal) { return engineStatus(signal, this.runner); }
  private async execute(run: SecurityCheckRun, controller: AbortController) {
    const deadline = Math.min(Date.now() + 60_000, Date.parse(run.scope.expiresAt));
    let budgetExpired = false;
    // Preserve the first stop cause instead of inferring it from a mutable wall clock.
    const timer = setTimeout(() => { if (!controller.signal.aborted) { budgetExpired = true; controller.abort(); } }, Math.max(1, deadline - Date.now()));
    try {
      // Re-authorize immediately before dispatch. Routes, tools, scheduler and
      // verification all converge here; they cannot add targets or methods.
      this.authorize(run.input, run.operatorId);
      if (controller.signal.aborted) throw new Error("Cancelled before dispatch");
      const output = await (this.overrideAdapter ? this.overrideAdapter(run.input, run.scope, controller.signal) : this.dispatch(run.input, run.scope, controller.signal));
      if (output.evidence.length > 256 || output.rules.length > 256) throw new Error("Adapter output exceeded its limit");
      run.engine = output.engine; run.engineVersion = output.engineVersion;
      run.evidence = output.evidence; run.coverageGaps = output.coverageGaps;
      run.status = controller.signal.aborted ? budgetExpired ? "partial" : "cancelled" : output.conclusive ? "completed" : "partial";
      if (output.raw && Buffer.byteLength(output.raw) <= 512 * 1024 && this.sqlite) {
        const id = randomUUID(); const sha256 = createHash("sha256").update(output.raw).digest("hex");
        this.sqlite.prepare("INSERT INTO security_artifacts (id, run_id, operator_id, sha256, content_type, raw) VALUES (?, ?, ?, ?, ?, ?)").run(id, run.id, run.operatorId, sha256, output.contentType ?? "text/plain", output.raw);
        run.artifact = { id, sha256, bytes: Buffer.byteLength(output.raw), contentType: output.contentType ?? "text/plain" };
      }
      for (const observation of output.rules) {
        const measured = output.evidence[observation.evidenceIndex];
        if (!measured) throw new Error("Finding references missing evidence");
        const target = run.input.target ?? measured.target;
        const id = createHash("sha256").update([run.scopeId, observation.ruleId, target, run.input.port ?? measured.port ?? ""].join("|")).digest("hex");
        let existing: SecurityFinding | undefined;
        try { existing = this.finding(id, run.operatorId); } catch { /* first observation */ }
        const finding: SecurityFinding = {
          id, scopeId: run.scopeId, runId: run.id, ruleId: observation.ruleId, target,
          ...(measured.port !== undefined ? { port: measured.port } : {}),
          title: observation.title, severity: observation.severity, status: observation.status ?? "observed", confidence: observation.confidence ?? "high",
          disposition: existing?.disposition === "accepted-risk" || existing?.disposition === "false-positive" ? existing.disposition : "open",
          evidenceIds: [measured.id], firstSeen: existing?.firstSeen ?? measured.observedAt, lastSeen: measured.observedAt,
          remediation: observation.remediation, rollback: observation.rollback,
          ...(existing?.decisionBy ? { decisionBy: existing.decisionBy, decisionAt: existing.decisionAt } : {}),
        };
        this.saveFinding(finding, run.operatorId); run.findingIds.push(id); run.findings.push(structuredClone(finding));
      }
    } catch (error) {
      run.status = error instanceof EngineUnavailable ? "unavailable" : controller.signal.aborted && !budgetExpired ? "cancelled" : "partial";
      run.coverageGaps.push(error instanceof EngineUnavailable ? error.message : "Check failed or was stopped; no successful verification is inferred");
    } finally { clearTimeout(timer); if (budgetExpired) run.coverageGaps.push("Run budget or scope expiry reached; remaining checks were stopped"); run.completedAt = new Date().toISOString(); this.saveRun(run); }
  }
  private async dispatch(input: SecurityCheckInput, scope: SecurityScope, signal: AbortSignal): Promise<AdapterResult> {
    const target = input.target!; const port = input.port!;
    switch (input.profile) {
      case "tls": return checkTls(target, port, input.serverName, signal);
      case "http": return checkHttp(target, port, false, signal);
      case "https": return checkHttp(target, port, true, signal);
      case "ssh": return checkSsh(target, port, signal);
      case "host-audit": return auditHost(target, input.port ?? 22, input.username, signal, this.runner);
      case "nmap": {
        const targets = (input.target ? [input.target] : scope.targets).filter(address => !scope.exclusions.includes(address));
        const ports = input.port === undefined ? scope.ports : [input.port];
        return scanNmap(targets, ports, signal, this.runner);
      }
      case "nuclei": {
        const url = (input.scheme ?? "http") + "://" + target + ":" + port;
        const output = await scanNuclei(url, signal, this.runner);
        if (signal.aborted) return output;
        const response = await checkHttp(target, port, input.scheme === "https", signal);
        const nativeRule = response.rules.find(r => r.ruleId === "http.nosniff");
        const nativeEvidence = response.evidence[0];
        if (nativeEvidence) {
          const index = output.evidence.length; output.evidence.push(nativeEvidence);
          // Use deterministic response evidence for both present and absent outcomes.
          output.rules = nativeRule ? [{ ...nativeRule, evidenceIndex: index }] : output.rules;
        }
        output.conclusive = response.conclusive && !output.coverageGaps.some(gap => gap.includes("exited unsuccessfully"));
        output.coverageGaps.push(...response.coverageGaps);
        return output;
      }
      case "trivy": return scanSoftware(scope.projectRoot!, input.path!, signal, this.runner, input.includePackages ?? false);
      case "telemetry": {
        const snapshot = await createSnapshot(scope.projectRoot!, input.path!, signal);
        try {
          const { readdir } = await import("node:fs/promises");
          const files = await readdir(snapshot.root);
          if (files.length !== 1) throw new Error("Telemetry import requires one file");
          const raw = await readFile(join(snapshot.root, files[0]!), "utf8");
          return parseTelemetry(raw, input.source!, scope.targets.filter(ip => !scope.exclusions.includes(ip)));
        } finally { await snapshot.cleanup(); }
      }
    }
  }
  private saveRun(run: SecurityCheckRun) {
    this.sqlite?.prepare("INSERT INTO security_check_runs (id, operator_id, scope_id, started_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(run.id, run.operatorId, run.scopeId, run.startedAt, JSON.stringify(run));
  }
  private saveFinding(finding: SecurityFinding, operatorId: string) {
    this.findings.set(finding.id, finding);
    this.sqlite?.prepare("INSERT INTO security_findings (id, operator_id, scope_id, updated_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data").run(finding.id, operatorId, finding.scopeId, finding.lastSeen, JSON.stringify(finding));
  }
  decide(id: string, operatorId: string, disposition: "open" | "accepted-risk" | "false-positive"): SecurityFinding {
    if (!["open", "accepted-risk", "false-positive"].includes(disposition)) throw new Error("Unsupported finding decision");
    const finding = this.finding(id, operatorId);
    finding.disposition = disposition; finding.decisionBy = operatorId; finding.decisionAt = new Date().toISOString();
    this.saveFinding(finding, operatorId); return finding;
  }
  plan(id: string, operatorId: string): SecurityRemediationPlan {
    const finding = this.finding(id, operatorId); const run = this.get(finding.runId, operatorId);
    return {
      findingId: id, target: finding.target, port: finding.port, recommendation: finding.remediation,
      steps: ["Review the cited evidence and effective service configuration.", "Record a backup, current version and a way to retain legitimate access.", finding.remediation, "Apply only the reviewed target-specific change through the existing consent-controlled terminal or configuration workflow.", "Run the same verification check from this gateway."],
      rollback: [finding.rollback, "Repeat the check after rollback and confirm legitimate access."],
      verificationInput: run.input, requiresApproval: true,
    };
  }
  async verify(id: string, operatorId: string, nodeId = "gateway", signal?: AbortSignal): Promise<SecurityVerificationResult> {
    const finding = this.finding(id, operatorId); const before = this.get(finding.runId, operatorId);
    const run = await this.wait(this.start(before.input, operatorId, nodeId, signal).id, operatorId);
    const afterRules = run.findingIds.map(findingId => this.finding(findingId, operatorId).ruleId);
    let status: SecurityVerificationResult["status"] = "inconclusive";
    let reason = "Verification failed, was incomplete, or used a different engine/profile; the finding stays open.";
    if (run.status === "completed" && run.scope.vantagePoint === before.scope.vantagePoint && run.engine === before.engine && run.engineVersion === before.engineVersion && run.profileRevision === before.profileRevision) {
      if (afterRules.includes(finding.ruleId)) { status = "still-observed"; reason = "The same rule is still observed by the repeated check."; }
      else if (["tls", "http", "https", "ssh", "nuclei", "trivy"].includes(run.input.profile) && run.evidence.length > 0 &&
        (!finding.ruleId.startsWith("trivy.config.") || run.evidence.some(e => String(e.facts.passingConfigurationRules ?? "").split(",").includes(finding.ruleId.slice("trivy.config.".length))))) {
        status = "verified-absent"; reason = "The same check completed conclusively from the same gateway and no longer observed this rule.";
        finding.disposition = "verified-absent"; finding.verifiedByRunId = run.id; this.saveFinding(finding, operatorId);
      } else reason = "This check did not record the relevant rule passing. Imported alerts and file directives cannot prove a live finding fixed by absence alone.";
    }
    return { findingId: id, runId: run.id, status, reason };
  }
  compare(beforeId: string, afterId: string, operatorId: string): SecurityBaselineComparison {
    const before = this.get(beforeId, operatorId); const after = this.get(afterId, operatorId);
    const comparable = before.scopeId === after.scopeId && JSON.stringify(normalizeCheckInput(before.input)) === JSON.stringify(normalizeCheckInput(after.input)) &&
      before.scope.vantagePoint === after.scope.vantagePoint && before.engineVersion === after.engineVersion &&
      before.profileRevision === after.profileRevision && before.status === "completed" && after.status === "completed";
    const rules = (run: SecurityCheckRun) => run.findings.map(finding => finding.ruleId);
    const previous = rules(before); const current = rules(after);
    return { beforeRunId: beforeId, afterRunId: afterId, comparable, addedRules: comparable ? current.filter(id => !previous.includes(id)) : [],
      noLongerObservedRules: comparable ? previous.filter(id => !current.includes(id)) : [],
      coverageGaps: comparable ? after.coverageGaps : ["Runs differ in scope, profile, engine version, vantage point or completion; changes are inconclusive"] };
  }
  report(id: string, operatorId: string) {
    const run = this.get(id, operatorId);
    const findings = run.findings;
    const targets = [...new Set([...run.scope.targets, ...run.evidence.map(e => e.target), ...findings.map(f => f.target)])];
    const aliases = new Map(targets.map((target, i) => [target, "asset-" + (i + 1)]));
    const replaceTarget = (value: string) => aliases.get(value) ?? "scoped-asset";
    return {
      format: "jait-security-report-v1", redacted: true,
      run: { id: run.id, profile: run.input.profile, profileRevision: run.profileRevision, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt,
        engine: run.engine, engineVersion: run.engineVersion, vantagePoint: "authorized-gateway", coverageGaps: run.coverageGaps.map(g => g.replace(/(?:\d{1,3}\.){3}\d{1,3}/g, "[address]")),
        evidence: run.evidence.map(e => ({ ...e, target: replaceTarget(e.target) })) },
      findings: findings.map(finding => ({ ...finding, target: replaceTarget(finding.target), decisionBy: finding.decisionBy ? "operator" : undefined })),
      notice: "Aliases conceal selected target addresses. Review report content before sharing. No findings is not proof of security.",
    };
  }
  deleteRun(id: string, operatorId: string): void {
    const run = this.get(id, operatorId);
    if (this.active?.id === id || run.status === "running") throw new Error("Stop the running assessment before deletion");
    if (this.sqlite) {
      this.sqlite.prepare("DELETE FROM security_artifacts WHERE run_id = ? AND operator_id = ?").run(id, operatorId);
      this.sqlite.prepare("DELETE FROM security_check_runs WHERE id = ? AND operator_id = ?").run(id, operatorId);
    }
    this.runs.delete(id);
    // Finding history is retained; deleting raw evidence never marks it fixed.
  }
}
function normalizeCheckInput(input: SecurityCheckInput): SecurityCheckInput {
  if (!input || typeof input !== "object") throw new Error("Check input required");
  return {
    scopeId: input.scopeId, profile: input.profile,
    ...(input.target !== undefined ? {target: input.target} : {}),
    ...(input.port !== undefined ? {port: input.port} : {}),
    ...(input.serverName !== undefined ? {serverName: input.serverName} : {}),
    ...(input.username !== undefined ? {username: input.username} : {}),
    ...(input.path !== undefined ? {path: input.path} : {}),
    ...(input.source !== undefined ? {source: input.source} : {}),
    ...(input.scheme !== undefined ? {scheme: input.scheme} : {}),
    ...(input.includePackages !== undefined ? {includePackages: input.includePackages} : {}),
  };
}
let workbench = new SecurityWorkbenchService();
export function setSecurityWorkbenchDb(sqlite: SqliteDatabase): void { workbench = new SecurityWorkbenchService(sqlite); }
export function getSecurityWorkbench(): SecurityWorkbenchService { return workbench; }
