/**
 * Terminal Routes — Sprint 3.5
 *
 * REST + WebSocket endpoints for terminal interaction.
 */

import type { FastifyInstance } from "fastify";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { AuditWriter } from "../services/audit.js";
import type { WsControlPlane } from "../ws.js";
import { TerminalSurface } from "../surfaces/terminal.js";
import { uuidv7 } from "../lib/uuidv7.js";

export function registerTerminalRoutes(
  app: FastifyInstance,
  surfaceRegistry: SurfaceRegistry,
  toolRegistry: ToolRegistry,
  audit: AuditWriter,
  ws?: WsControlPlane,
  toolExecutor?: (
    toolName: string,
    input: unknown,
    context: ToolContext,
    options?: { dryRun?: boolean; consentTimeoutMs?: number },
  ) => Promise<ToolResult>,
) {
  // POST /api/terminals — create a new terminal
  app.post("/api/terminals", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
    const workspaceRoot = typeof body["workspaceRoot"] === "string" ? body["workspaceRoot"] : process.cwd();
    const cols = typeof body["cols"] === "number" ? body["cols"] : 120;
    const rows = typeof body["rows"] === "number" ? body["rows"] : 30;

    const termId = `term-${uuidv7()}`;

    try {
      const surface = await surfaceRegistry.startSurface("terminal", termId, {
        sessionId,
        workspaceRoot,
      }) as TerminalSurface;

      // Wire PTY output → WebSocket broadcast
      if (ws) {
        surface.onOutput = (data) => ws.broadcastTerminalOutput(termId, data);
      }

      if (cols && rows) surface.resize(cols, rows);

      audit.write({
        sessionId,
        actionId: uuidv7(),
        actionType: "terminal.create",
        toolName: "terminal.stream",
        inputs: { termId, workspaceRoot },
        status: "executed",
      });

      return reply.status(201).send(surface.snapshot());
    } catch (err) {
      return reply.status(500).send({
        error: "TERMINAL_ERROR",
        details: err instanceof Error ? err.message : "Failed to create terminal",
      });
    }
  });

  // GET /api/terminals — list terminals
  app.get("/api/terminals", async () => {
    const terminals = surfaceRegistry
      .listSurfaces()
      .filter((s) => s.type === "terminal")
      .map((s) => s.snapshot());
    return { terminals };
  });

  // GET /api/terminals/:id — get terminal info
  app.get("/api/terminals/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const surface = surfaceRegistry.getSurface(id);
    if (!surface || surface.type !== "terminal") {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Terminal not found" });
    }
    return surface.snapshot();
  });

  // POST /api/terminals/:id/write — write data to terminal
  app.post("/api/terminals/:id/write", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const data = typeof body["data"] === "string" ? body["data"] : "";

    const surface = surfaceRegistry.getSurface(id) as TerminalSurface | undefined;
    if (!surface || surface.type !== "terminal") {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Terminal not found" });
    }

    try {
      surface.write(data);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({
        error: "TERMINAL_ERROR",
        details: err instanceof Error ? err.message : "Write failed",
      });
    }
  });

  // POST /api/terminals/:id/resize — resize terminal
  app.post("/api/terminals/:id/resize", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const cols = typeof body["cols"] === "number" ? body["cols"] : 120;
    const rows = typeof body["rows"] === "number" ? body["rows"] : 30;

    const surface = surfaceRegistry.getSurface(id) as TerminalSurface | undefined;
    if (!surface || surface.type !== "terminal") {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Terminal not found" });
    }

    surface.resize(cols, rows);
    return { ok: true, cols, rows };
  });

  // DELETE /api/terminals/:id — kill terminal
  app.delete("/api/terminals/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const stopped = await surfaceRegistry.stopSurface(id, "user request");
    if (!stopped) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Terminal not found" });
    }

    audit.write({
      actionId: uuidv7(),
      actionType: "terminal.stop",
      toolName: "terminal.stream",
      inputs: { termId: id },
      status: "executed",
    });

    return { ok: true };
  });

  // POST /api/terminals/:id/execute — run a command and return output
  app.post("/api/terminals/:id/execute", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const command = typeof body["command"] === "string" ? body["command"] : "";
    const timeout = typeof body["timeout"] === "number" ? body["timeout"] : 30000;

    if (!command.trim()) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "command is required" });
    }

    const surface = surfaceRegistry.getSurface(id) as TerminalSurface | undefined;
    if (!surface || surface.type !== "terminal") {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Terminal not found" });
    }

    try {
      const output = await surface.execute(command, timeout);

      audit.write({
        sessionId: surface.sessionId ?? undefined,
        actionId: uuidv7(),
        actionType: "terminal.run",
        toolName: "terminal.run",
        inputs: { command },
        outputs: { output: output.slice(0, 10000) },
        status: "executed",
      });

      return { ok: true, output };
    } catch (err) {
      return reply.status(500).send({
        error: "TERMINAL_ERROR",
        details: err instanceof Error ? err.message : "Command execution failed",
      });
    }
  });

  // POST /api/tools/execute — generic tool execution endpoint
  app.post("/api/tools/execute", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const toolName = typeof body["tool"] === "string" ? body["tool"] : "";
    const input = body["input"] ?? {};
    const sessionId = typeof body["sessionId"] === "string" ? body["sessionId"] : "default";
    const workspaceRoot = typeof body["workspaceRoot"] === "string" ? body["workspaceRoot"] : process.cwd();
    const dryRun = body["dryRun"] === true;
    const consentTimeoutMs = typeof body["consentTimeoutMs"] === "number" ? body["consentTimeoutMs"] : undefined;

    if (!toolName) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "tool name is required" });
    }

    const context = {
      sessionId,
      actionId: uuidv7(),
      workspaceRoot,
      requestedBy: "api",
    } as const;
    const result = toolExecutor
      ? await toolExecutor(toolName, input, context, { dryRun, consentTimeoutMs })
      : await toolRegistry.execute(toolName, input, context, audit);

    return result;
  });

  // GET /api/tools — list all available tools
  app.get("/api/tools", async () => {
    const tools = toolRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
    }));
    return { tools };
  });

  // GET /api/surfaces — list all surfaces
  app.get("/api/surfaces", async () => {
    return {
      surfaces: surfaceRegistry.listSnapshots(),
      registeredTypes: surfaceRegistry.registeredTypes,
    };
  });
}
