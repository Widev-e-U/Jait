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
import type { ProfileName } from "./tool-profiles.js";
import type { ToolPermission } from "./tool-permissions.js";
import { requiresConsent, isCommandAllowed, classifyIrreversibleCommand, resolveToolPermission } from "./tool-permissions.js";

const COMMAND_TOOL_NAMES = new Set(["terminal.run", "terminal.stream", "execute", "jait.terminal"]);

export interface ConsentAwareExecutorOptions {
  toolRegistry: ToolRegistry;
  consentManager: ConsentManager;
  trustEngine: TrustEngine;
  audit?: AuditWriter;
  /** Permission map: toolName -> ToolPermission */
  permissions: Map<string, ToolPermission>;
  /** Session-scoped set of tools approved via "once" */
  sessionApprovals: Set<string>;
  /** Human-readable active profile name */
  profileName?: ProfileName;
  /**
   * Optional delegate that performs the *actual* tool execution after
   * consent is granted. When provided, this is used instead of
   * `toolRegistry.execute(...)` so tools can be transparently routed to a
   * remote node (e.g. when the project lives on another device).
   * Returns a result just like `ToolRegistry.execute`.
   */
  delegate?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    audit?: AuditWriter,
  ) => Promise<ToolResult>;
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
  private readonly profileName?: ProfileName;
  private readonly delegate?: ConsentAwareExecutorOptions["delegate"];

  constructor(opts: ConsentAwareExecutorOptions) {
    this.toolRegistry = opts.toolRegistry;
    this.consentManager = opts.consentManager;
    this.trustEngine = opts.trustEngine;
    this.audit = opts.audit;
    this.permissions = opts.permissions;
    this.sessionApprovals = opts.sessionApprovals;
    this.profileName = opts.profileName;
    this.delegate = opts.delegate;
  }

  /** Execute a tool, routing through the delegate when one is configured. */
  private runTool(
    toolName: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    if (this.delegate) {
      return this.delegate(toolName, input, context, this.audit);
    }
    return this.toolRegistry.execute(toolName, input, context, this.audit);
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
    const permission = resolveToolPermission(toolName, this.permissions);
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
          risk: permission.risk,
          policy: {
            profileName: this.profileName ?? null,
            consentLevel: permission.consentLevel,
            description: permission.description,
            knownTool: permission.knownTool,
            source: permission.source,
          },
        },
      };
    }

    // ── Command allow/deny check (for terminal tools) ──
    let irreversibleReason: string | undefined;
    if (COMMAND_TOOL_NAMES.has(toolName)) {
      const command = (input as Record<string, unknown>)?.command;
      if (typeof command === "string") {
        const commandPermission = toolName === "execute" || toolName === "jait.terminal"
          ? (this.permissions.get("terminal.run") ?? permission)
          : permission;
        const cmdCheck = isCommandAllowed(command, commandPermission);
        if (!cmdCheck.allowed) {
          return {
            ok: false,
            message: `Command blocked: ${cmdCheck.reason}`,
          };
        }
        irreversibleReason = classifyIrreversibleCommand(command).reason;
      }
    }

    // ── Auto-execute if no consent required ──
    // An irreversible command always re-asks. Consent is granted per tool, so
    // without this a single earlier approval — or an approve-all session meant
    // for ordinary commands — silently authorizes destroying uncommitted work.
    const needsConsent = requiresConsent(permission, trustLevel, this.sessionApprovals) || !!irreversibleReason;
    const approveAllEnabled = this.consentManager.isApproveAllEnabledForSession(context.sessionId);
    const isScheduler = context.requestedBy === "scheduler";
    // Full-access mode never prompts for approval — the LLM has full access to
    // every tool, including irreversible commands.
    const isFullAccess = context.runtimeMode === "full-access";

    if (isFullAccess || !needsConsent || (!irreversibleReason && (approveAllEnabled || isScheduler))) {
      const result = await this.runTool(toolName, input, context);

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
      summary: irreversibleReason ? `${summary} — ${irreversibleReason}` : summary,
      preview,
      risk: irreversibleReason ? "high" : permission.risk,
      policy: {
        consentLevel: irreversibleReason ? "dangerous" : permission.consentLevel,
        description: irreversibleReason ?? permission.description,
        knownTool: permission.knownTool,
        source: permission.source,
      },
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
    const result = await this.runTool(toolName, input, context);

    // Record for trust progression
    if (result.ok) {
      this.trustEngine.recordApproval(toolName);
      // Mark as session-approved for "once" consent level
      if (permission.consentLevel === "once") {
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
      case "execute":
      case "jait.terminal":
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
      case "computer.session":
        return inp?.action === "start"
          ? `Start visible computer control on ${inp?.nodeId ?? "the selected desktop"}`
          : `${String(inp?.action ?? "Manage")} computer control`;
      case "computer.act":
        return `Computer input: ${String(inp?.action ?? "action")}`;
      case "computer.observe":
        return "Capture the controlled computer screen";
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
      case "execute":
      case "jait.terminal":
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
