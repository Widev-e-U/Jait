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
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Strip ANSI escape sequences */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

// OSC 633 sequence patterns (same as terminal-tools.ts)
const OSC_DONE_RE = /\x1b\]633;D;(-?\d*)(?:\x07|\x1b\\)/;
const OSC_PROMPT_END_RE = /\x1b\]633;B(?:\x07|\x1b\\)/;

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
      // Ensure shell integration is ready before executing
      await surface.waitForPrompt();

      // Execute command using OSC 633 shell integration
      const result = await new Promise<{ output: string; exitCode: number | null; timedOut: boolean }>((resolve) => {
        let raw = "";
        let settled = false;

        // Cached D-marker result so we only scan for it once
        let dMatch: { exitCode: number; end: number } | null = null;

        // Settle timer: after D+B is detected, wait briefly for any late
        // output from PowerShell's deferred formatting pipeline.
        let settleTimer: ReturnType<typeof setTimeout> | null = null;

        const listener = (data: string) => {
          raw += data;

          if (settled) return;

          // If settling (D+B already found), reset timer on new data.
          if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => finish(false, dMatch!.exitCode), 50);
            return;
          }

          // Step 1: Find D marker (command done — provides exit code)
          if (!dMatch) {
            const m = raw.match(OSC_DONE_RE);
            if (m) {
              dMatch = {
                exitCode: m[1] ? parseInt(m[1], 10) : 0,
                end: m.index! + m[0].length,
              };
            }
          }

          // Step 2: After D, wait for B (prompt-end).  Start a settle
          // timer instead of finishing immediately — PowerShell can
          // flush output after the prompt markers.
          if (dMatch && OSC_PROMPT_END_RE.test(raw.slice(dMatch.end))) {
            settleTimer = setTimeout(() => finish(false, dMatch!.exitCode), 50);
          }
        };

        const finish = (timedOut: boolean, exitCode: number | null = null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (settleTimer) clearTimeout(settleTimer);
          surface.removeOutputListener(listener);

          // Clean up temp script file
          if (tmpFile) {
            try { unlinkSync(tmpFile); } catch { /* already gone */ }
          }

          // Strip all OSC 633 sequences — they are invisible control codes,
          // so removing them leaves visible text in order:
          //   echoed command → command output → prompt text
          let output = raw.replace(/\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)/g, "");
          output = stripAnsi(output).replace(/\r/g, "");

          // Split into lines for targeted cleanup
          const lines = output.split("\n");

          // Remove echoed command line(s)
          if (tmpFile) {
            // For dot-sourced multi-line: remove the ". 'path'" echo
            if (lines.length > 0 && (lines[0]!.trim().startsWith(". '") || lines[0]!.trim().startsWith("."))) {
              lines.shift();
            }
          } else {
            const cmdLines = command.trim().split("\n").map((l) => l.trim());
            while (lines.length > 0 && cmdLines.length > 0) {
              const head = lines[0]!.trim();
              const cmdHead = cmdLines[0]!;
              if (head === cmdHead || head.endsWith(cmdHead) || cmdHead.startsWith(head)) {
                lines.shift();
                cmdLines.shift();
              } else {
                break;
              }
            }
          }

          // Remove trailing empty lines
          while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
            lines.pop();
          }

          // Remove the prompt line at the end (e.g. "PS E:\path> ")
          if (lines.length > 0) {
            const lastLine = lines[lines.length - 1]!.trim();
            if (/^PS .+?>/.test(lastLine)) {
              lines.pop();
            }
          }

          output = lines.join("\n").trim();
          if (output.length > 200_000) output = "…(truncated)\n" + output.slice(-200_000);
          resolve({ output: output || "(no output)", exitCode, timedOut });
        };

        surface.addOutputListener(listener);

        const timer = setTimeout(() => {
          surface.write("\x03\r");
          setTimeout(() => finish(true), 500);
        }, timeout);

        // For multi-line commands, write to a temp .ps1 file and
        // dot-source it — PSReadLine treats \n as separate Enter
        // keystrokes, garbling execution order.
        let tmpFile: string | null = null;
        if (command.includes("\n")) {
          const dir = join(tmpdir(), "jait-terminal");
          mkdirSync(dir, { recursive: true });
          tmpFile = join(dir, `cmd-${Date.now()}.ps1`);
          writeFileSync(tmpFile, command, "utf-8");
          surface.write(`. '${tmpFile.replace(/'/g, "''")}'\r`);
        } else {
          surface.write(command + "\r");
        }
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
