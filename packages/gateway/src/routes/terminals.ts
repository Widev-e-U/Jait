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
import { TerminalSurface } from "../surfaces/terminal.js";
import { uuidv7 } from "../lib/uuidv7.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

/** Strip ANSI escape sequences */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

/** Escape a string for use in a RegExp */
function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function registerTerminalRoutes(
  app: FastifyInstance,
  surfaceRegistry: SurfaceRegistry,
  toolRegistry: ToolRegistry,
  audit: AuditWriter,
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

      // onOutput is auto-wired by surfaceRegistry.onSurfaceStarted
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
      // Execute command inside the persistent terminal using sentinel markers
      const ts = Date.now();
      const rnd = Math.random().toString(36).slice(2, 8);
      const startMark = `__JS${ts}${rnd}`;
      const doneMark = `__JD${ts}${rnd}`;
      const doneRe = new RegExp(`${escRegex(doneMark)}:(\\d+)`);
      const { platform } = await import("node:os");

      const result = await new Promise<{ output: string; exitCode: number | null; timedOut: boolean }>((resolve) => {
        let raw = "";
        let settled = false;

        const listener = (data: string) => {
          raw += data;
          const clean = stripAnsi(raw);
          const m = clean.match(doneRe);
          if (m && m[1] !== undefined) {
            finish(false, parseInt(m[1], 10));
          }
        };

        const finish = (timedOut: boolean, exitCode: number | null = null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          surface.removeOutputListener(listener);

          let clean = stripAnsi(raw).replace(/\r/g, "");
          const si = clean.indexOf(startMark);
          const di = clean.search(doneRe);
          if (si !== -1 && di !== -1) {
            const afterStart = clean.indexOf("\n", si);
            clean = clean.slice(afterStart !== -1 ? afterStart + 1 : si + startMark.length, di);
          } else if (si !== -1) {
            const afterStart = clean.indexOf("\n", si);
            clean = clean.slice(afterStart !== -1 ? afterStart + 1 : si + startMark.length);
          }
          clean = clean.trim();
          if (clean.length > 200_000) clean = "…(truncated)\n" + clean.slice(-200_000);
          resolve({ output: clean || "(no output)", exitCode, timedOut });
        };

        surface.addOutputListener(listener);

        const timer = setTimeout(() => {
          surface.write("\x03");
          setTimeout(() => finish(true), 500);
        }, timeout);

        const isWin = platform() === "win32";
        const isMultiLine = command.includes("\n");
        let wrappedCmd: string;

        if (isWin && isMultiLine) {
          // Multi-line PowerShell: write to a temp .ps1 and invoke it
          const tmpScript = join(tmpdir(), `jait-cmd-${ts}-${rnd}.ps1`);
          writeFileSync(tmpScript, command, "utf-8");
          const escaped = tmpScript.replace(/'/g, "''");
          wrappedCmd = [
            `Write-Host '${startMark}'`,
            `& '${escaped}'`,
            `$__jec = if ($LASTEXITCODE) { [int]$LASTEXITCODE } elseif (-not $?) { 1 } else { 0 }`,
            `Remove-Item -LiteralPath '${escaped}' -Force -ErrorAction SilentlyContinue`,
            `Write-Host "${doneMark}:$__jec"`,
          ].join("; ") + "\r";
        } else if (isWin) {
          wrappedCmd = [
            `Write-Host '${startMark}'`,
            `& { ${command} }`,
            `$__jec = if ($LASTEXITCODE) { [int]$LASTEXITCODE } elseif (-not $?) { 1 } else { 0 }`,
            `Write-Host "${doneMark}:$__jec"`,
          ].join("; ") + "\r";
        } else {
          wrappedCmd = `echo '${startMark}'; ${command}; __jec=$?; echo '${doneMark}:'$__jec\n`;
        }

        surface.write(wrappedCmd);
      });

      const cleanOutput = result.output;
      const ok = !result.timedOut && result.exitCode === 0;
      const message = ok
        ? "Command completed (exit code 0)"
        : result.timedOut
          ? `Command timed out after ${timeout}ms`
          : result.exitCode == null
            ? "Command failed (exit status unavailable)"
            : `Command failed (exit code ${result.exitCode})`;

      audit.write({
        sessionId: surface.sessionId ?? undefined,
        actionId: uuidv7(),
        actionType: "terminal.run",
        toolName: "terminal.run",
        inputs: { command },
        outputs: {
          output: cleanOutput.slice(0, 10000),
          exitCode: result.exitCode,
          timedOut: result.timedOut,
        },
        status: ok ? "executed" : "failed",
      });

      return {
        ok,
        message,
        output: cleanOutput,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      };
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
