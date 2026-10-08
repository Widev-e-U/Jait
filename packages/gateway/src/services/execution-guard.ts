import { createHash } from "node:crypto";
import type { ToolResult } from "../tools/contracts.js";

export interface ExecutionCheckpoint {
  calls: number;
  windowCalls: number;
  evidence: string[];
  windowProgress?: boolean;
  failures: Record<string, number>;
  infrastructureFailures?: number;
  lastAction?: string;
  stopReason?: string;
}

/** Deterministic limits; aliases and model-generated status prose cannot reset them. */
export class ExecutionGuard {
  private state: ExecutionCheckpoint;
  private seen: Set<string>;
  private windowProgress = false;

  constructor(checkpoint?: ExecutionCheckpoint, private readonly maxCalls = 120, private readonly windowSize = 20) {
    this.state = checkpoint ? { ...checkpoint, failures: { ...checkpoint.failures }, evidence: [...checkpoint.evidence] }
      : { calls: 0, windowCalls: 0, evidence: [], failures: {} };
    this.seen = new Set(this.state.evidence);
    this.windowProgress = this.state.windowProgress ?? false;
  }

  get stopReason(): string | undefined { return this.state.stopReason; }

  beforeCall(): string | undefined {
    if (this.stopReason) return this.stopReason;
    if (this.state.calls >= this.maxCalls) return this.stop(`Execution stopped at ${this.maxCalls} tool calls. Review the checkpoint before resuming.`);
    this.state.calls++;
    this.state.windowCalls++;
    return undefined;
  }

  record(tool: string, result: ToolResult): string | undefined {
    if (this.stopReason) return this.stopReason;
    const data = result.data as Record<string, unknown> | undefined;
    const output = `${result.message}\n${typeof data?.output === "string" ? data.output : ""}`;
    const canonicalTool = tool.replace(/^(?:functions\.)?mcp__.+?__/, "").replace(/_/g, ".");
    const commandTool = /^(?:execute|terminal\.run|jait\.terminal)$/.test(canonicalTool);
    const family = failureFamily(output);
    // A pipeline can hide an infrastructure error behind tail's successful exit.
    const hiddenFailure = commandTool && /^(?:(?:bash|sh|zsh|fish|bwrap|\/[^\s:]+): .*?(?:command not found|permission denied|operation not permitted)|Command '[^']+' not found|Error(?: \[ERR_MODULE_NOT_FOUND\])?: Cannot find (?:module|package)|fatal: not a git repository|No test files found)/im.test(output);
    const failed = !result.ok || (typeof data?.exitCode === "number" && data.exitCode !== 0) || (hiddenFailure && !!family);
    this.state.lastAction = `${tool}: ${failed ? "failed" : "succeeded"}`;
    if (failed) {
      // Known infrastructure errors are shared across aliases and changed arguments.
      const key = family ?? createHash("sha256").update(output.slice(0, 4000).replace(/call_[\w-]+|\b\d+\b/g, "#")).digest("hex");
      this.state.failures[key] = (this.state.failures[key] ?? 0) + 1;
      if (family) {
        this.state.infrastructureFailures = (this.state.infrastructureFailures ?? 0) + 1;
        if (this.state.infrastructureFailures >= 6) return this.stop("Execution blocked: environment recovery exhausted six failed attempts. Escalate with the checkpoint before resuming.");
      }
      if (this.state.failures[key] >= 3) return this.stop(`Execution blocked: ${family ?? "the same tool failure"} persisted after two retries. Fix the underlying cause before resuming.`);
    } else if (!/^(?:todo|jait\.todos|memory\.|team\.chat|thread\.control|agent\.|tools\.|jait\.catalog)/.test(canonicalTool)) {
      // A new observation, successful edit, or command result is evidence. Repeated
      // reads with different labels/ranges but identical content are not progress.
      const evidence = typeof data?.content === "string" ? data.content : typeof data?.output === "string" ? data.output : JSON.stringify(data ?? result.message);
      const hash = createHash("sha256").update(evidence.replace(/^\d+\t/gm, "")).digest("hex");
      if (evidence.trim() && !this.seen.has(hash)) {
        this.seen.add(hash);
        this.windowProgress = true;
      }
      if (family) delete this.state.failures[family];
    }
    if (this.state.windowCalls >= this.windowSize) {
      if (!this.windowProgress) return this.stop(`Execution blocked: ${this.windowSize} tool calls produced no new evidence, edits, or test results.`);
      this.state.windowCalls = 0;
      this.windowProgress = false;
    }
    return undefined;
  }

  snapshot(): ExecutionCheckpoint {
    return { ...this.state, windowProgress: this.windowProgress, failures: { ...this.state.failures }, evidence: [...this.seen].slice(-120) };
  }

  private stop(reason: string): string { this.state.stopReason = reason; return reason; }
}

function failureFamily(message: string): string | undefined {
  if (/not a git repository|invalid gitfile|\.git.*(?:not found|no such file)|unable to read.*git/i.test(message)) return "Git metadata unavailable";
  if (/source chat not found/i.test(message)) return "Thread sender identity unavailable";
  if (/ENOENT|no such file or directory/i.test(message)) return "Project path unavailable";
  if (/command (?:'[^']+'\s+)?not found|not recognized as (?:an internal|the name of a cmdlet)/i.test(message)) return "Required executable unavailable";
  if (/cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|could not locate.*bindings/i.test(message)) return "Required dependency unavailable";
  if (/no test files found/i.test(message)) return "Test configuration unavailable";
  if (/permission denied|operation not permitted|EACCES/i.test(message)) return "Execution permission denied";
  if (/consent.*(?:timed? out|timeout)/i.test(message)) return "Tool consent unavailable";
  return undefined;
}
