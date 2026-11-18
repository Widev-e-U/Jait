/**
 * Validation of agent output. A report is untrusted input: it must answer the
 * task and attempt it was issued for, may not set verification or task state,
 * and is redacted and bounded before it is stored or shown.
 */
import type { AgentReportStatus, AgentTaskReport } from "@jait/shared/types";
import { isNamedResourceKey, normalizeResourceKey, PROJECT_ROOT_KEY } from "./resources.js";

const REPORT_FIELDS = new Set(["taskId", "attemptId", "status", "summary", "changedFiles", "artifacts", "error", "followUps"]);
/** Fields an agent might use to claim success or set state. The orchestrator owns these. */
const CONTROL_FIELDS = new Set([
  "verified", "verification", "verifiedBy", "passed", "success", "state", "gates", "commands", "command", "approved",
]);

const MAX_SUMMARY = 4000;
const MAX_ERROR = 2000;
const MAX_FOLLOW_UPS = 20;
const MAX_FOLLOW_UP = 500;
const MAX_CHANGED_FILES = 500;
const MAX_ARTIFACTS = 50;

const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[redacted token]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[redacted token]"],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted token]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]"],
  [/\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)\S+/gi, "$1$2[redacted]"],
];

/** Best-effort masking of common credential shapes before text is stored or shown. Not a DLP guarantee. */
export function redactSecrets(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) redacted = redacted.replace(pattern, replacement);
  return redacted;
}

export function boundText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type AgentReportParseResult = { ok: true; report: AgentTaskReport } | { ok: false; reason: string };

class ReportRejected extends Error {}

function reject(reason: string): never {
  throw new ReportRejected(reason);
}

function isReportStatus(value: unknown): value is AgentReportStatus {
  return value === "completed" || value === "failed" || value === "blocked";
}

function readText(value: unknown, field: string, max: number, required: boolean): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") reject(`${field} must be a string`);
  const text = value.trim();
  if (!text && required) reject(`${field} must not be empty`);
  return boundText(redactSecrets(text), max);
}

function isSafeFilePath(path: string | null): path is string {
  return path !== null && path !== PROJECT_ROOT_KEY && !isNamedResourceKey(path);
}

function readPaths(value: unknown, field: string, max: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) reject(`${field} must be an array of at most ${max} entries`);
  const paths: string[] = [];
  for (const entry of value) {
    const path = normalizeResourceKey(entry);
    if (!isSafeFilePath(path)) reject(`${field} entries must be safe project-relative file paths`);
    paths.push(path);
  }
  return [...new Set(paths)];
}

function readArtifacts(value: unknown): AgentTaskReport["artifacts"] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ARTIFACTS) {
    reject(`artifacts must be an array of at most ${MAX_ARTIFACTS} entries`);
  }
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      reject("each artifact must be an object with a path");
    }
    const record = entry as Record<string, unknown>;
    const path = normalizeResourceKey(record.path);
    if (!isSafeFilePath(path)) reject("artifact paths must be safe project-relative files");
    const kind = typeof record.kind === "string" ? record.kind.trim().slice(0, 64) : "";
    return kind ? { path, kind } : { path };
  });
}

function readFollowUps(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_FOLLOW_UPS) {
    reject(`followUps must be an array of at most ${MAX_FOLLOW_UPS} strings`);
  }
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") reject("followUps entries must be strings");
    const text = boundText(redactSecrets(entry.trim()), MAX_FOLLOW_UP);
    if (text) items.push(text);
  }
  return items;
}

function readReport(raw: unknown, expected: { taskId: string; attemptId: string }): AgentTaskReport {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) reject("report must be an object");
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (CONTROL_FIELDS.has(key)) {
      reject(`report may not set "${key}"; verification and task state belong to the orchestrator`);
    }
    if (!REPORT_FIELDS.has(key)) reject(`unknown report field "${key}"`);
  }
  if (record.taskId !== expected.taskId) reject("report belongs to a different task");
  if (record.attemptId !== expected.attemptId) reject("report belongs to a stale or foreign attempt");
  const status = record.status;
  if (!isReportStatus(status)) reject('status must be "completed", "failed" or "blocked"');

  const base: AgentTaskReport = {
    taskId: expected.taskId,
    attemptId: expected.attemptId,
    status,
    summary: readText(record.summary, "summary", MAX_SUMMARY, true),
    changedFiles: readPaths(record.changedFiles, "changedFiles", MAX_CHANGED_FILES),
    artifacts: readArtifacts(record.artifacts),
    followUps: readFollowUps(record.followUps),
  };
  if (status === "completed") {
    if (record.error !== undefined) reject("a completed report must not carry an error");
    return base;
  }
  return { ...base, error: readText(record.error, "error", MAX_ERROR, true) };
}

/** Never throws: anything unreadable is reported as a rejection, never as a success. */
export function parseAgentTaskReport(raw: unknown, expected: { taskId: string; attemptId: string }): AgentReportParseResult {
  try {
    return { ok: true, report: readReport(raw, expected) };
  } catch (error) {
    if (error instanceof ReportRejected) return { ok: false, reason: error.message };
    return { ok: false, reason: "report could not be read" };
  }
}
