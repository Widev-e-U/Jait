/**
 * Deterministic authorization for tool calls made by workflow workers. It runs
 * before the consent-aware executor, so a call that is outside the task's
 * workspace or its declared claims is refused without asking the owner.
 * Consent still applies to every call that passes.
 */
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { isNamedResourceKey, PROJECT_ROOT_KEY, type ResourceClaims } from "./resources.js";

export type WorkspaceMode = "read" | "write";

export const WORKFLOW_READ_TOOLS: readonly string[] = ["file.read", "file.list"];
export const WORKFLOW_WRITE_TOOLS: readonly string[] = ["file.read", "file.list", "file.write", "file.patch"];

const MUTATING_TOOLS = new Set(["file.write", "file.patch"]);

export type ToolAuthorization = { ok: true } | { ok: false; reason: string };

export function allowedWorkflowTools(mode: WorkspaceMode): readonly string[] {
  return mode === "write" ? WORKFLOW_WRITE_TOOLS : WORKFLOW_READ_TOOLS;
}

export interface WorkflowToolCall {
  tool: string;
  args: unknown;
  mode: WorkspaceMode;
  /** Absolute path of the task workspace the worker was given. */
  workspaceRoot: string;
  claims: ResourceClaims;
}

export function authorizeWorkflowToolCall(call: WorkflowToolCall): ToolAuthorization {
  if (!allowedWorkflowTools(call.mode).includes(call.tool)) {
    return deny(`tool ${call.tool} is not available to a ${call.mode} workflow task`);
  }
  const requested = pathArgument(call.args);
  if (requested === null) return deny("path must be a string without control characters");

  const absoluteRoot = resolve(call.workspaceRoot);
  const absolutePath = resolve(absoluteRoot, requested);
  const relativePath = projectRelative(absoluteRoot, absolutePath);
  if (relativePath === null) return deny(`path ${requested} is outside the task workspace`);
  if (!realpathInside(absolutePath, absoluteRoot)) return deny(`path ${requested} resolves outside the task workspace`);

  const mutating = MUTATING_TOOLS.has(call.tool);
  const declared = mutating ? call.claims.writes : [...call.claims.reads, ...call.claims.writes];
  if (!covers(declared, relativePath)) {
    return deny(`path ${relativePath} is outside the declared ${mutating ? "writes" : "reads and writes"} of this task`);
  }
  return { ok: true };
}

function deny(reason: string): ToolAuthorization {
  return { ok: false, reason };
}

/** `file.list` may omit the path, which means the workspace root. */
function pathArgument(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const path = (args as Record<string, unknown>).path;
  if (path === undefined) return ".";
  if (typeof path !== "string" || path.length > 4096 || [...path].some((char) => char.charCodeAt(0) < 32)) return null;
  return path;
}

function projectRelative(root: string, path: string): string | null {
  const rel = relative(root, path);
  if (rel === "") return PROJECT_ROOT_KEY;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

function covers(declared: readonly string[], path: string): boolean {
  return declared.some((claim) => {
    if (isNamedResourceKey(claim)) return false;
    return claim === PROJECT_ROOT_KEY || path === claim || path.startsWith(`${claim}/`);
  });
}

/** Rejects symlinks that lead out of the workspace, checking the deepest existing ancestor for new paths. */
function realpathInside(path: string, root: string): boolean {
  try {
    let probe = path;
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const real = realpathSync(probe);
    const realRoot = realpathSync(root);
    return real === realRoot || real.startsWith(`${realRoot}${sep}`);
  } catch {
    return false;
  }
}
