/**
 * Terminal Tools — persistent-terminal edition
 *
 * terminal.run    — execute a command in a persistent interactive terminal (like VS Code)
 * terminal.stream — start a new interactive terminal
 *
 * Commands run inside a real, visible terminal that the user can open and
 * interact with in the frontend.  Output is captured via shell-integration
 * style sentinel markers.  Terminals persist between commands (up to 10
 * globally — oldest is stopped when the limit is exceeded).
 */

import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { uuidv7 } from "../lib/uuidv7.js";
import type { TerminalSurface } from "../surfaces/terminal.js";

// ── Constants ────────────────────────────────────────────────────

const MAX_TERMINALS = 10;
/** Time to let a freshly-spawned shell initialise before sending commands */
const SHELL_INIT_MS = 800;

// ── Session → terminal mapping ───────────────────────────────────

/** sessionId → terminalId of the session's "default" terminal */
const sessionTerminalMap = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────────

/** Strip ANSI escape sequences from PTY output for clean text */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

/** Escape a string for use in a RegExp */
function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Race a promise against an AbortSignal */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("Cancelled"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("Cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
      (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
    );
  });
}

// ── Session terminal management ──────────────────────────────────

/**
 * Get the session's existing terminal or spin up a new one.
 * Enforces the global MAX_TERMINALS limit — oldest terminal is
 * stopped when the cap is hit (the tool result will mention this).
 */
async function ensureSessionTerminal(
  registry: SurfaceRegistry,
  context: ToolContext,
  preferredId?: string,
): Promise<{ surface: TerminalSurface; terminalId: string; isNew: boolean; warning?: string }> {
  // 1. Try preferred terminal (if provided and alive)
  if (preferredId) {
    try {
      const s = registry.getSurface(preferredId);
      if (s && s.type === "terminal" && s.state === "running") {
        return { surface: s as TerminalSurface, terminalId: preferredId, isNew: false };
      }
    } catch { /* gone — fall through */ }
  }

  // 2. Try the session's default terminal
  const existingId = sessionTerminalMap.get(context.sessionId);
  if (existingId) {
    try {
      const s = registry.getSurface(existingId);
      if (s && s.type === "terminal" && s.state === "running") {
        return { surface: s as TerminalSurface, terminalId: existingId, isNew: false };
      }
    } catch { /* gone */ }
    sessionTerminalMap.delete(context.sessionId);
  }

  // 3. Enforce global limit — stop oldest terminal(s) if at cap
  let warning: string | undefined;
  const allTerminals = registry
    .listSurfaces()
    .filter((s) => s.type === "terminal" && s.state === "running");

  if (allTerminals.length >= MAX_TERMINALS) {
    const oldest = allTerminals[0]!;
    await registry.stopSurface(oldest.id, "terminal limit reached");
    // Clean up stale session mapping
    for (const [sid, tid] of sessionTerminalMap.entries()) {
      if (tid === oldest.id) { sessionTerminalMap.delete(sid); break; }
    }
    warning = `Terminal limit (${MAX_TERMINALS}) reached — stopped oldest terminal ${oldest.id}`;
    console.log(`[terminal] ${warning}`);
  }

  // 4. Create a new terminal
  const terminalId = `term-${uuidv7()}`;
  const surface = (await registry.startSurface("terminal", terminalId, {
    sessionId: context.sessionId,
    workspaceRoot: context.workspaceRoot,
  })) as TerminalSurface;

  sessionTerminalMap.set(context.sessionId, terminalId);

  // Give the shell a moment to show its prompt
  await new Promise((r) => setTimeout(r, SHELL_INIT_MS));

  return { surface, terminalId, isNew: true, warning };
}

// ── Sentinel-based command execution ─────────────────────────────

/**
 * Write a command into a persistent terminal and capture its output +
 * exit code using start/done sentinel markers.
 *
 *   <start marker>
 *   <command output>
 *   <done marker>:<exit code>
 *
 * The markers are short unique strings unlikely to collide with real
 * output. On timeout the running command receives Ctrl-C.
 */
function executeInTerminal(
  surface: TerminalSurface,
  command: string,
  timeoutMs: number,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const startMark = `__JS${ts}${rnd}`;
  const doneMark = `__JD${ts}${rnd}`;
  const doneRe = new RegExp(`${escRegex(doneMark)}:(\\d+)`);

  return new Promise((resolve) => {
    let raw = "";
    let settled = false;

    const listener = (data: string) => {
      raw += data;
      onChunk?.(data);

      // Look for the done marker with exit code
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
      signal?.removeEventListener("abort", onAbort);
      surface.removeOutputListener(listener);

      // Extract the text between markers
      let clean = stripAnsi(raw).replace(/\r/g, "");
      const si = clean.indexOf(startMark);
      const di = clean.search(doneRe);

      if (si !== -1 && di !== -1) {
        // Skip the start-marker line itself
        const afterStart = clean.indexOf("\n", si);
        clean = clean.slice(afterStart !== -1 ? afterStart + 1 : si + startMark.length, di);
      } else if (si !== -1) {
        const afterStart = clean.indexOf("\n", si);
        clean = clean.slice(afterStart !== -1 ? afterStart + 1 : si + startMark.length);
      }
      // else: markers never appeared — return everything we got

      clean = clean.trim();
      if (clean.length > 200_000) {
        clean = "…(truncated)\n" + clean.slice(-200_000);
      }

      resolve({ output: clean || "(no output)", exitCode, timedOut });
    };

    // Listen BEFORE writing so we don't miss fast output
    surface.addOutputListener(listener);

    const timer = setTimeout(() => {
      // Interrupt the running command
      surface.write("\x03");
      setTimeout(() => finish(true), 500);
    }, timeoutMs);

    const onAbort = () => {
      surface.write("\x03");
      setTimeout(() => finish(false, null), 500);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    // Build the wrapped command with markers
    const isWin = platform() === "win32";
    const isMultiLine = command.includes("\n");
    let wrappedCmd: string;
    let tmpScript: string | null = null;

    if (isWin && isMultiLine) {
      // Multi-line PowerShell: write to a temp .ps1 and invoke it
      tmpScript = join(tmpdir(), `jait-cmd-${ts}-${rnd}.ps1`);
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
      // Single-line PowerShell
      wrappedCmd = [
        `Write-Host '${startMark}'`,
        `& { ${command} }`,
        `$__jec = if ($LASTEXITCODE) { [int]$LASTEXITCODE } elseif (-not $?) { 1 } else { 0 }`,
        `Write-Host "${doneMark}:$__jec"`,
      ].join("; ") + "\r";
    } else {
      // POSIX shell
      wrappedCmd = `echo '${startMark}'; ${command}; __jec=$?; echo '${doneMark}:'$__jec\n`;
    }

    surface.write(wrappedCmd);
  });
}

// ── Tool definitions ─────────────────────────────────────────────

interface TerminalRunInput {
  command: string;
  sessionId?: string;
  terminalId?: string;
  timeout?: number;
}

interface TerminalStreamInput {
  sessionId: string;
  workspaceRoot?: string;
  cols?: number;
  rows?: number;
}

export function createTerminalRunTool(registry: SurfaceRegistry): ToolDefinition<TerminalRunInput> {
  return {
    name: "terminal.run",
    description:
      "Execute a shell command in a persistent terminal (visible to the user) and return the output. " +
      "The terminal stays alive between calls — like VS Code's integrated terminal.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        terminalId: { type: "string", description: "Reuse a specific terminal (omit to auto-select or create)" },
        timeout: { type: "number", description: "Execution timeout in ms (default 30000)" },
      },
      required: ["command"],
    },
    async execute(input: TerminalRunInput, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 30000, terminalId: preferredId } = input;

      if (context.signal?.aborted) {
        return { ok: false, message: "Cancelled" };
      }

      try {
        // 1. Get or create a persistent terminal
        const { surface, terminalId, isNew, warning } =
          await ensureSessionTerminal(registry, context, preferredId);

        // 2. Execute the command (sentinel-based)
        const execPromise = executeInTerminal(
          surface,
          command,
          timeout,
          context.onOutputChunk,
          context.signal,
        );

        const result = context.signal
          ? await raceAbort(execPromise, context.signal)
          : await execPromise;

        // 3. Build response
        const ok = !result.timedOut && result.exitCode === 0;
        const reason = result.timedOut
          ? `timed out after ${timeout}ms`
          : result.exitCode == null
            ? "exit status unavailable"
            : `exit code ${result.exitCode}`;
        let message = ok ? "Command completed (exit code 0)" : `Command failed (${reason})`;
        if (isNew) message += ` [new terminal ${terminalId}]`;
        if (warning) message += ` [${warning}]`;

        console.log(
          `[terminal.run] ${message}; output (${result.output.length} chars): ${JSON.stringify(result.output.slice(0, 500))}`,
        );

        return {
          ok,
          message,
          data: {
            output: result.output,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            terminalId,
          },
        };
      } catch (err) {
        if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Command failed",
        };
      }
    },
  };
}

export function createTerminalStreamTool(registry: SurfaceRegistry): ToolDefinition<TerminalStreamInput> {
  return {
    name: "terminal.stream",
    description: "Start a new streaming terminal session (output sent via WebSocket). Use when you need an interactive terminal.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session to attach the terminal to" },
        workspaceRoot: { type: "string", description: "Working directory for the terminal" },
        cols: { type: "number", description: "Terminal width in columns" },
        rows: { type: "number", description: "Terminal height in rows" },
      },
      required: ["sessionId"],
    },
    async execute(input: TerminalStreamInput, context: ToolContext): Promise<ToolResult> {
      const termId = `term-${uuidv7()}`;
      const workspaceRoot = input.workspaceRoot ?? context.workspaceRoot;

      const surface = await registry.startSurface("terminal", termId, {
        sessionId: input.sessionId || context.sessionId,
        workspaceRoot,
      });

      return {
        ok: true,
        message: `Terminal started: ${termId}`,
        data: {
          terminalId: termId,
          ...surface.snapshot(),
        },
      };
    },
  };
}
