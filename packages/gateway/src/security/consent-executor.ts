/**
 * Consent-Aware Tool Executor — Sprint 4.7
 *
 * Wraps ToolRegistry.execute() with consent checking. When a tool requires
 * consent (based on permissions + trust level), execution is paused and a
 * consent request is created. The tool only runs after approval.
 *
 * In dry-run mode, the executor returns the plan (what would happen)
 * without executing anything, regardless of consent level.
 */

import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AuditWriter } from "../services/audit.js";
import type { ConsentManager } from "./consent-manager.js";
import type { TrustEngine } from "./trust-engine.js";
import type { ToolPermission } from "./tool-permissions.js";
import { requiresConsent, isCommandAllowed } from "./tool-permissions.js";

export interface ConsentAwareExecutorOptions {
  toolRegistry: ToolRegistry;
  consentManager: ConsentManager;
  trustEngine: TrustEngine;
  audit?: AuditWriter;
  /** Permission map: toolName -> ToolPermission */
  permissions: Map<string, ToolPermission>;
  /** Session-scoped set of tools approved via "once" */
  sessionApprovals: Set<string>;
}

export interface ExecuteOptions {
  /** If true, return the plan without executing */
  dryRun?: boolean;
  /** Consent timeout override (ms) */
  consentTimeoutMs?: number;
}

export class ConsentAwareExecutor {
  private readonly toolRegistry: ToolRegistry;
  private readonly consentManager: ConsentManager;
  private readonly trustEngine: TrustEngine;
  private readonly audit?: AuditWriter;
  private readonly permissions: Map<string, ToolPermission>;
  private readonly sessionApprovals: Set<string>;

  constructor(opts: ConsentAwareExecutorOptions) {
    this.toolRegistry = opts.toolRegistry;
    this.consentManager = opts.consentManager;
    this.trustEngine = opts.trustEngine;
    this.audit = opts.audit;
    this.permissions = opts.permissions;
    this.sessionApprovals = opts.sessionApprovals;
  }

  /**
   * Execute a tool with consent checking and trust-level awareness.
   */
  async execute(
    toolName: string,
    input: unknown,
    context: ToolContext,
    options: ExecuteOptions = {},
  ): Promise<ToolResult> {
    const permission = this.permissions.get(toolName);
    const trustLevel = this.trustEngine.getLevel(toolName);

    // Build a summary for the consent card
    const summary = this.buildSummary(toolName, input);
    const preview = this.buildPreview(toolName, input);

    // ── Dry-run mode: return plan without executing ──
    if (options.dryRun) {
      const needsConsent = requiresConsent(permission, trustLevel, this.sessionApprovals);
      return {
        ok: true,
        message: "Dry-run: showing plan without executing",
        data: {
          dryRun: true,
          toolName,
          input,
          summary,
          preview,
          requiresConsent: needsConsent,
          trustLevel,
          consentLevel: permission?.consentLevel ?? "unknown",
          risk: permission?.risk ?? "high",
        },
      };
    }

    // ── Command allow/deny check (for terminal tools) ──
    if (toolName === "terminal.run" || toolName === "terminal.stream") {
      const command = (input as Record<string, unknown>)?.command;
      if (typeof command === "string") {
        const cmdCheck = isCommandAllowed(command, permission);
        if (!cmdCheck.allowed) {
          return {
            ok: false,
            message: `Command blocked: ${cmdCheck.reason}`,
          };
        }
      }
    }

    // ── Auto-execute if no consent required ──
    const needsConsent = requiresConsent(permission, trustLevel, this.sessionApprovals);

    if (!needsConsent) {
      const result = await this.toolRegistry.execute(toolName, input, context, this.audit);

      // Record successful approval for trust progression
      if (result.ok) {
        this.trustEngine.recordApproval(toolName);
      }

      return result;
    }

    // ── Consent required: create request and wait ──
    const decision = await this.consentManager.requestConsent({
      actionId: context.actionId,
      toolName,
      summary,
      preview,
      risk: permission?.risk ?? "high",
      sessionId: context.sessionId,
      timeoutMs: options.consentTimeoutMs,
    });

    if (!decision.approved) {
      return {
        ok: false,
        message: decision.decidedVia === "timeout"
          ? `Consent timed out for ${toolName}`
          : `User rejected ${toolName}: ${decision.reason ?? "no reason given"}`,
        data: { consentRejected: true, decidedVia: decision.decidedVia },
      };
    }

    // ── Approved: execute the tool ──
    const result = await this.toolRegistry.execute(toolName, input, context, this.audit);

    // Record for trust progression
    if (result.ok) {
      this.trustEngine.recordApproval(toolName);
      // Mark as session-approved for "once" consent level
      if (permission?.consentLevel === "once") {
        this.sessionApprovals.add(toolName);
      }
    }

    return result;
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private buildSummary(toolName: string, input: unknown): string {
    const inp = input as Record<string, unknown> | undefined;

    switch (toolName) {
      case "terminal.run":
        return `Run command: ${inp?.command ?? "(unknown)"}`;
      case "terminal.stream":
        return "Open a new terminal session";
      case "file.write":
        return `Write to file: ${inp?.path ?? "(unknown)"}`;
      case "file.patch":
        return `Patch file: ${inp?.path ?? "(unknown)"}`;
      case "file.read":
        return `Read file: ${inp?.path ?? "(unknown)"}`;
      case "os.install":
        return `Install package: ${inp?.package ?? "(unknown)"}`;
      case "os.query":
        return `Query OS: ${inp?.type ?? "(unknown)"}`;
      case "surfaces.start":
        return `Start surface: ${inp?.type ?? "(unknown)"}`;
      case "surfaces.stop":
        return `Stop surface: ${inp?.id ?? "(unknown)"}`;
      default:
        return `Execute tool: ${toolName}`;
    }
  }

  private buildPreview(toolName: string, input: unknown): Record<string, unknown> {
    const inp = input as Record<string, unknown> | undefined;

    switch (toolName) {
      case "terminal.run":
        return { command: inp?.command, timeout: inp?.timeout };
      case "file.write":
        return {
          path: inp?.path,
          content: typeof inp?.content === "string"
            ? (inp.content as string).slice(0, 500)
            : undefined,
        };
      case "file.patch":
        return { path: inp?.path, search: inp?.search, replace: inp?.replace };
      case "os.install":
        return { package: inp?.package };
      default:
        return inp ?? {};
    }
  }
}
