/**
 * jait — Platform meta-tool for Jait-specific capabilities.
 *
 * Combines: memory management, cron/scheduler, network scanning,
 * and gateway status into a single tool with an `action` dispatcher.
 *
 * This keeps the core tool count at 8 while still exposing
 * platform-specific features that don't fit the generic tools.
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import type { SchedulerService } from "../../scheduler/service.js";
import type { MemoryService, MemoryScope } from "../../memory/contracts.js";
import type { SessionService } from "../../services/sessions.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import type { WsControlPlane } from "../../ws.js";
import type { HookBus } from "../../scheduler/hooks.js";

export interface JaitToolDeps {
  memoryService?: MemoryService;
  scheduler?: SchedulerService;
  sessionService?: SessionService;
  surfaceRegistry?: SurfaceRegistry;
  ws?: WsControlPlane;
  startedAt?: number;
  hooks?: HookBus;
}

interface JaitInput {
  /** The action to perform */
  action: string;

  // ── Memory params ──
  /** Memory content to save */
  content?: string;
  /** Memory scope: workspace, project, or contact */
  scope?: string;
  /** Search query for memory.search */
  query?: string;
  /** Memory ID (for forget) */
  memoryId?: string;
  /** Source type for memory save */
  sourceType?: string;
  /** Source ID for memory save */
  sourceId?: string;
  /** TTL in seconds for memory expiry */
  ttlSeconds?: number;
  /** Max results for memory search */
  limit?: number;

  // ── Cron params ──
  /** Cron job name */
  name?: string;
  /** Cron expression */
  cron?: string;
  /** Tool name to execute on schedule */
  toolName?: string;
  /** Tool input arguments */
  input?: Record<string, unknown>;
  /** Cron job ID (for update/remove) */
  jobId?: string;
  /** Enable/disable flag for cron update */
  enabled?: boolean;
}

export function createJaitTool(deps: JaitToolDeps): ToolDefinition<JaitInput> {
  return {
    name: "jait",
    description:
      "Jait platform tool — access memory, scheduler, network, and gateway status.\n\n" +
      "**Actions:**\n" +
      "- `memory.save` — Save a memory entry for later retrieval. Provide `content`, `scope` (workspace/project/contact), " +
      "`sourceType`, `sourceId`.\n" +
      "- `memory.search` — Search saved memories using semantic similarity. Provide `query`, optional `limit` and `scope`.\n" +
      "- `memory.forget` — Delete a memory by ID. Provide `memoryId`.\n" +
      "- `cron.add` — Add a scheduled cron job. Provide `name`, `cron` (cron expression), `toolName`, optional `input`.\n" +
      "- `cron.list` — List all configured cron jobs.\n" +
      "- `cron.update` — Update a cron job. Provide `jobId`, plus any fields to change (`name`, `cron`, `enabled`, `input`).\n" +
      "- `cron.remove` — Remove a cron job. Provide `jobId`.\n" +
      "- `status` — Get gateway runtime health: uptime, sessions, surfaces, connected devices, scheduler stats.",
    tier: "core",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "The action to perform: memory.save, memory.search, memory.forget, " +
            "cron.add, cron.list, cron.update, cron.remove, status.",
          enum: [
            "memory.save", "memory.search", "memory.forget",
            "cron.add", "cron.list", "cron.update", "cron.remove",
            "status",
          ],
        },
        // Memory params
        content: {
          type: "string",
          description: "Memory content to save (for memory.save).",
        },
        scope: {
          type: "string",
          description: 'Memory scope: "workspace", "project", or "contact" (for memory.save/search).',
          enum: ["workspace", "project", "contact"],
        },
        query: {
          type: "string",
          description: "Search query (for memory.search).",
        },
        memoryId: {
          type: "string",
          description: "Memory ID to forget (for memory.forget).",
        },
        sourceType: {
          type: "string",
          description: "Source type (for memory.save).",
        },
        sourceId: {
          type: "string",
          description: "Source ID (for memory.save).",
        },
        ttlSeconds: {
          type: "number",
          description: "TTL in seconds for memory expiry (for memory.save).",
        },
        limit: {
          type: "number",
          description: "Max results (for memory.search, default: 5).",
        },
        // Cron params
        name: {
          type: "string",
          description: "Cron job name (for cron.add).",
        },
        cron: {
          type: "string",
          description: 'Cron expression (for cron.add/update). E.g. "0 9 * * *" for daily at 9am.',
        },
        toolName: {
          type: "string",
          description: "Tool name to execute on schedule (for cron.add).",
        },
        input: {
          type: "object",
          description: "Tool input arguments (for cron.add/update).",
        },
        jobId: {
          type: "string",
          description: "Cron job ID (for cron.update/remove).",
        },
        enabled: {
          type: "boolean",
          description: "Enable/disable toggle (for cron.update).",
        },
      },
      required: ["action"],
    },
    async execute(input: JaitInput, context: ToolContext): Promise<ToolResult> {
      try {
        switch (input.action) {
          // ── Memory ──────────────────────────────────────────────
          case "memory.save": {
            if (!deps.memoryService) {
              return { ok: false, message: "Memory service not available." };
            }
            if (!input.content) {
              return { ok: false, message: "memory.save requires `content`." };
            }
            const expiresAt = input.ttlSeconds
              ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
              : undefined;
            const entry = await deps.memoryService.save({
              scope: (input.scope as MemoryScope) ?? "workspace",
              content: input.content,
              source: {
                type: input.sourceType ?? "agent",
                id: input.sourceId ?? context.actionId,
                surface: "chat",
              },
              expiresAt,
            });
            return { ok: true, message: `Saved memory ${entry.id}`, data: entry };
          }

          case "memory.search": {
            if (!deps.memoryService) {
              return { ok: false, message: "Memory service not available." };
            }
            if (!input.query) {
              return { ok: false, message: "memory.search requires `query`." };
            }
            const results = await deps.memoryService.search(
              input.query,
              input.limit ?? 5,
              input.scope as MemoryScope | undefined,
            );
            return { ok: true, message: `Found ${results.length} memories`, data: results };
          }

          case "memory.forget": {
            if (!deps.memoryService) {
              return { ok: false, message: "Memory service not available." };
            }
            if (!input.memoryId) {
              return { ok: false, message: "memory.forget requires `memoryId`." };
            }
            const removed = await deps.memoryService.forget(input.memoryId);
            return {
              ok: removed,
              message: removed ? `Forgot memory ${input.memoryId}` : `Memory ${input.memoryId} not found`,
            };
          }

          // ── Cron ────────────────────────────────────────────────
          case "cron.add": {
            if (!deps.scheduler) {
              return { ok: false, message: "Scheduler not available." };
            }
            if (!input.name || !input.cron || !input.toolName) {
              return { ok: false, message: "cron.add requires `name`, `cron`, and `toolName`." };
            }
            // Normalize tool name (underscore → dot)
            const toolNameNormalized = input.toolName.includes("_") && !input.toolName.includes(".")
              ? input.toolName.replace("_", ".")
              : input.toolName;
            const job = deps.scheduler.create({
              userId: context.userId,
              name: input.name,
              cron: input.cron,
              toolName: toolNameNormalized,
              input: input.input ?? {},
              sessionId: context.sessionId,
              workspaceRoot: process.cwd(),
            });
            return { ok: true, message: "Cron job created", data: job };
          }

          case "cron.list": {
            if (!deps.scheduler) {
              return { ok: false, message: "Scheduler not available." };
            }
            const jobs = deps.scheduler.list(context.userId);
            return { ok: true, message: `${jobs.length} cron jobs`, data: { jobs } };
          }

          case "cron.update": {
            if (!deps.scheduler) {
              return { ok: false, message: "Scheduler not available." };
            }
            if (!input.jobId) {
              return { ok: false, message: "cron.update requires `jobId`." };
            }
            const updated = deps.scheduler.update(
              input.jobId,
              {
                name: input.name,
                cron: input.cron,
                enabled: input.enabled,
                input: input.input,
              },
              context.userId,
            );
            return {
              ok: !!updated,
              message: updated ? "Cron job updated" : "Cron job not found",
              data: updated ?? { id: input.jobId },
            };
          }

          case "cron.remove": {
            if (!deps.scheduler) {
              return { ok: false, message: "Scheduler not available." };
            }
            if (!input.jobId) {
              return { ok: false, message: "cron.remove requires `jobId`." };
            }
            const removed = deps.scheduler.remove(input.jobId, context.userId);
            return {
              ok: removed,
              message: removed ? "Cron job removed" : "Cron job not found",
            };
          }

          // ── Gateway status ──────────────────────────────────────
          case "status": {
            const sessions = deps.sessionService?.list("active").length ?? 0;
            const surfaces = deps.surfaceRegistry?.listSurfaces().length ?? 0;
            const devices = deps.ws?.clientCount ?? 0;
            const jobs = deps.scheduler?.list() ?? [];
            const enabledJobs = jobs.filter((j: any) => j.enabled).length;
            const hookEventTypes = deps.hooks?.registeredEventTypes() ?? [];

            return {
              ok: true,
              message: "Gateway status",
              data: {
                healthy: true,
                uptime: Math.floor((Date.now() - (deps.startedAt ?? Date.now())) / 1000),
                sessions,
                surfaces,
                devices,
                scheduler: { totalJobs: jobs.length, enabledJobs },
                hooks: {
                  registeredEventTypes: hookEventTypes,
                  listeners: deps.hooks?.listenerCount() ?? 0,
                },
              },
            };
          }

          default:
            return {
              ok: false,
              message:
                `Unknown action: "${input.action}". ` +
                "Valid actions: memory.save, memory.search, memory.forget, " +
                "cron.add, cron.list, cron.update, cron.remove, status.",
            };
        }
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Jait tool failed",
        };
      }
    },
  };
}
