import { claimAssessmentExecution } from "./assessment-lease.js";
import { PathGuard } from "./path-guard.js";
import { SECURITY_PROFILES } from "@jait/shared";
import { createConnection, isIP } from "node:net";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { SecurityScopeInput, SecurityScope, SecurityAssessmentRun, SecurityProbeState, SecurityAssessmentHistory } from "@jait/shared";
import type { SqliteDatabase } from "../db/sqlite-shim.js";

export const ASSESSMENT_LIMITS = { targets: 16, ports: 16, timeoutMs: 750, intervalMs: 200, durationMs: 60_000 };
const LIMITATIONS = [
  "IPv4 TCP connections only; no UDP, IPv6, service identification or vulnerability testing.",
  "LAN observations cannot establish WAN exposure. Open ports are observations, not confirmed vulnerabilities.",
  "Timeouts and network errors are inconclusive; a refused connection does not prove the host is secure.",
];

export function validateScope(input: SecurityScopeInput, now = Date.now()): SecurityScopeInput {
  if (!input || input.authorized !== true) throw new Error("Explicit target authorization is required");
  const validateIps = (values: unknown, label: string, allowEmpty: boolean): string[] => {
    if (!Array.isArray(values) || values.length > 16 || (!allowEmpty && values.length === 0))
      throw new Error(label + " must contain " + (allowEmpty ? "0" : "1") + "–16 explicit IPv4 addresses");
    for (const value of values) {
      if (typeof value !== "string" || isIP(value) !== 4 || value !== value.trim())
        throw new Error("Only literal IPv4 addresses are supported; no hostnames, URLs or CIDRs");
      const first = Number(value.split(".")[0]);
      if (first === 0 || first >= 224 || value === "255.255.255.255") throw new Error("Unicast targets required");
    }
    return [...new Set(values)];
  };
  const targets = validateIps(input.targets, "Targets", false);
  const exclusions = validateIps(input.exclusions, "Exclusions", true);
  if (!Array.isArray(input.ports) || input.ports.length < 1 || input.ports.length > 16 ||
      input.ports.some(p => !Number.isInteger(p) || p < 1 || p > 65535))
    throw new Error("Choose 1–16 TCP ports from 1–65535");
  const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(expires) || expires <= now || expires > now + 3_600_000)
    throw new Error("Scope expiry must be in the next hour");
  if (targets.every(ip => exclusions.includes(ip))) throw new Error("All targets are excluded");
  const methods = input.methods ?? ["tcp"];
  if (!Array.isArray(methods) || methods.length < 1 || methods.length > 12 || methods.some(method => method !== "tcp" && !SECURITY_PROFILES.includes(method)))
    throw new Error("Select explicitly authorized assessment methods");
  for (const field of [input.paths ?? [], input.serverNames ?? [], input.sshUsernames ?? []]) {
    if (!Array.isArray(field) || field.length > 4 || field.some(value => typeof value !== "string" || value.length > 240 || !value || /[\x00-\x1f]/.test(value)))
      throw new Error("Invalid scoped paths, server names or SSH users");
  }
  if ((input.serverNames ?? []).some(name => !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,238}[a-zA-Z0-9])?$/.test(name)))
    throw new Error("TLS server names must be plain DNS names; they are used only for SNI and identity checks");
  if ((input.sshUsernames ?? []).some(name => !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name)))
    throw new Error("Invalid authorized SSH username");
  return { targets, exclusions, ports: [...new Set(input.ports)], expiresAt: new Date(expires).toISOString(), authorized: true,
    methods: [...new Set(methods)], paths: [...(input.paths ?? [])], serverNames: [...(input.serverNames ?? [])], sshUsernames: [...(input.sshUsernames ?? [])] };

}

export function probeTcp(target: string, port: number, signal: AbortSignal): Promise<SecurityProbeState> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve("error");
    const socket = createConnection({ host: target, port });
    let settled = false;
    const finish = (state: SecurityProbeState) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      signal.removeEventListener("abort", abort);
      resolve(state);
    };
    const abort = () => finish("error");
    signal.addEventListener("abort", abort, { once: true });
    socket.setTimeout(ASSESSMENT_LIMITS.timeoutMs, () => finish("timeout"));
    socket.once("connect", () => finish("open"));
    socket.once("error", (err: NodeJS.ErrnoException) => finish(err.code === "ECONNREFUSED" ? "refused" : "error"));
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve();
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export class AssessmentService {
  private scopes = new Map<string, SecurityScope>();
  private runs = new Map<string, SecurityAssessmentRun>();
  private active: { id: string; controller: AbortController; done: Promise<void> } | null = null;
  constructor(
    private sqlite?: SqliteDatabase,
    private probe = probeTcp,
    private intervalMs = ASSESSMENT_LIMITS.intervalMs,
    private durationMs = ASSESSMENT_LIMITS.durationMs,
  ) {
    if (sqlite) {
      const rows = sqlite.prepare("SELECT data FROM security_scopes ORDER BY created_at DESC LIMIT 50").all() as { data: string }[];
      for (const row of rows) { const scope = JSON.parse(row.data) as SecurityScope; this.scopes.set(scope.id, scope); }
      const runs = sqlite.prepare("SELECT data FROM security_assessment_runs ORDER BY started_at DESC LIMIT 50").all() as { data: string }[];
      for (const row of runs) {
        const run = JSON.parse(row.data) as SecurityAssessmentRun;
        if (run.status === "running") {
          run.status = "interrupted"; run.completedAt = new Date().toISOString();
          run.coverageGaps.push("Gateway restarted before the assessment completed");
          this.saveRun(run);
        }
        this.runs.set(run.id, run);
      }
    }
  }
  createScope(input: SecurityScopeInput, operatorId: string, projectRoot?: string): SecurityScope {
    if (!operatorId) throw new Error("Authenticated operator required");
    if ((input.paths?.length ?? 0) > 0 && !projectRoot) throw new Error("Filesystem checks require a project-bound scope");
    if (projectRoot) for (const path of input.paths ?? []) new PathGuard({ projectRoot }).validate(path);
    const scope: SecurityScope = {
      ...validateScope(input), ...(projectRoot ? { projectRoot } : {}), id: randomUUID(), operatorId, createdAt: new Date().toISOString(),
      nodeId: "gateway", vantagePoint: hostname(), profile: "tcp-connect-v1",
    };
    this.sqlite?.prepare("INSERT INTO security_scopes (id, operator_id, created_at, data) VALUES (?, ?, ?, ?)").run(
      scope.id, operatorId, scope.createdAt, JSON.stringify(scope));
    this.scopes.set(scope.id, scope);
    return structuredClone(scope);
  }
  getScope(id: string, operatorId: string): SecurityScope {
    let scope = this.scopes.get(id);
    if (!scope && this.sqlite) {
      const row = this.sqlite.prepare("SELECT data FROM security_scopes WHERE id = ? AND operator_id = ?").get(id, operatorId) as { data: string } | undefined;
      if (row) scope = JSON.parse(row.data) as SecurityScope;
    }
    if (!scope || scope.operatorId !== operatorId) throw new Error("Scope not found");
    return structuredClone(scope);
  }
  history(operatorId: string): SecurityAssessmentHistory {
    const scopes = this.sqlite
      ? (this.sqlite.prepare("SELECT data FROM security_scopes WHERE operator_id = ? ORDER BY created_at DESC LIMIT 50").all(operatorId) as {data: string}[]).map(r => JSON.parse(r.data) as SecurityScope)
      : [...this.scopes.values()].filter(s => s.operatorId === operatorId).reverse().slice(0, 50);
    const runs = this.sqlite
      ? (this.sqlite.prepare("SELECT data FROM security_assessment_runs WHERE operator_id = ? ORDER BY started_at DESC LIMIT 50").all(operatorId) as {data: string}[]).map(r => JSON.parse(r.data) as SecurityAssessmentRun)
      : [...this.runs.values()].filter(r => r.operatorId === operatorId).reverse().slice(0, 50);
    return structuredClone({ scopes, runs });
  }
  start(scopeId: string, operatorId: string, nodeId = "gateway", signal?: AbortSignal): SecurityAssessmentRun {
    if (nodeId !== "gateway") throw new Error("This profile executes on the gateway only");
    if (this.active) throw new Error("An assessment is already running on this gateway");
    const scope = this.getScope(scopeId, operatorId);
    validateScope(scope);
    if (!(scope.methods ?? ["tcp"]).includes("tcp")) throw new Error("TCP method is not authorized by this scope");
    const targets = scope.targets.filter(ip => !scope.exclusions.includes(ip));
    const run: SecurityAssessmentRun = {
      id: randomUUID(), scopeId, operatorId, scope, startedAt: new Date().toISOString(), completedAt: null,
      status: "running", engine: "node-net-tcp-connect", engineVersion: process.versions.bun ? "bun:" + process.versions.bun : process.version,
      observations: [], plannedChecks: targets.length * scope.ports.length, coverageGaps: [...LIMITATIONS],
    };
    const release = claimAssessmentExecution(run.id);
    try { this.saveRun(run); } catch (error) { release(); throw error; }
    this.runs.set(run.id, run);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const active = { id: run.id, controller, done: Promise.resolve() };
    this.active = active;
    active.done = this.execute(run, controller).catch(() => {
      // HTTP starts are detached. Persistence failure must not become an
      // unhandled rejection or erase the completed in-memory observations.
      run.status = "partial";
      run.coverageGaps.push("Run completion could not be persisted; this result may not survive restart");
      run.completedAt = new Date().toISOString();
    }).finally(() => {
      release();
      signal?.removeEventListener("abort", abort);
      if (this.active === active) this.active = null;
    });
    return structuredClone(run);
  }
  async wait(id: string, operatorId: string): Promise<SecurityAssessmentRun> {
    if (this.active?.id === id) await this.active.done;
    return this.getRun(id, operatorId);
  }
  getRun(id: string, operatorId: string): SecurityAssessmentRun {
    let run = this.runs.get(id);
    if (!run && this.sqlite) {
      const row = this.sqlite.prepare("SELECT data FROM security_assessment_runs WHERE id = ? AND operator_id = ?").get(id, operatorId) as { data: string } | undefined;
      if (row) run = JSON.parse(row.data) as SecurityAssessmentRun;
    }
    if (!run || run.operatorId !== operatorId) throw new Error("Assessment not found");
    return structuredClone(run);
  }
  cancel(id: string, operatorId: string): void {
    this.getRun(id, operatorId);
    if (this.active?.id === id) this.active.controller.abort();
  }
  private saveRun(run: SecurityAssessmentRun): void {
    this.sqlite?.prepare("INSERT INTO security_assessment_runs (id, operator_id, started_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(
      run.id, run.operatorId, run.startedAt, JSON.stringify(run));
  }
  private async execute(run: SecurityAssessmentRun, controller: AbortController): Promise<void> {
    const signal = controller.signal;
    const deadline = Date.now() + this.durationMs;
    let budgetExpired = false;
    // Preserve the first stop cause instead of inferring it from a mutable wall clock.
    const timer = setTimeout(() => { if (!controller.signal.aborted) { budgetExpired = true; controller.abort(); } }, Math.max(1, Math.min(this.durationMs, Date.parse(run.scope.expiresAt) - Date.now())));
    try {
      for (const target of run.scope.targets) {
        if (run.scope.exclusions.includes(target)) continue;
        for (const port of run.scope.ports) {
          // Recheck policy on each dispatch, including scheduled/repeated calls.
          if (signal.aborted || Date.now() >= deadline || Date.now() >= Date.parse(run.scope.expiresAt)) break;
          if (run.observations.length) await pause(this.intervalMs, signal);
          if (signal.aborted || Date.now() >= Date.parse(run.scope.expiresAt)) break;
          const state = await this.probe(target, port, signal);
          if (signal.aborted) break;
          run.observations.push({ target, port, state, observedAt: new Date().toISOString(), evidenceId: randomUUID() });
        }
      }
      run.status = run.observations.length === run.plannedChecks ? "completed" : signal.aborted && !budgetExpired ? "cancelled" : "partial";
    } catch {
      run.status = "partial";
      run.coverageGaps.push("Probe execution failed; remaining checks were not performed");
    } finally {
      clearTimeout(timer);
      if (budgetExpired) run.coverageGaps.push("Run budget or scope expiry reached; remaining checks were stopped");
      if (run.observations.length < run.plannedChecks) run.coverageGaps.push(`${run.plannedChecks - run.observations.length} checks not performed (cancellation, expiry, deadline or failure)`);
      run.completedAt = new Date().toISOString();
      this.saveRun(run);
    }
  }
}

let service = new AssessmentService();
export function setAssessmentDb(sqlite: SqliteDatabase): void { service = new AssessmentService(sqlite); }
export function getAssessmentService(): AssessmentService { return service; }
