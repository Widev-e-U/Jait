/**
 * Terminal Tools — persistent-terminal edition (OSC 633 shell integration)
 *
 * terminal.run    — execute a command in a persistent interactive terminal (like VS Code)
 * terminal.stream — start a new interactive terminal
 *
 * Commands run inside a real, visible terminal that the user can open and
 * interact with in the frontend.  Output is captured via OSC 633 escape
 * sequences emitted by the shell integration scripts — the command itself
 * is sent unmodified.
 *
 * Terminals persist between commands (up to 10 globally — oldest is
 * stopped when the limit is exceeded).
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { TerminalSurface } from "../surfaces/terminal.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import type { WsControlPlane } from "../ws.js";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Constants ────────────────────────────────────────────────────

const MAX_TERMINALS = 10;
const INTERACTIVE_PROMPT_PATTERNS = [
  /\[sudo\]\s+password\s+for\s+[^:]+:/i,
  /password:\s*$/im,
  /enter\s+passphrase\s+for\s+key/i,
  /verification\s+code:\s*$/im,
  /press\s+enter\s+to\s+continue/i,
];

// ── Session → terminal mapping ───────────────────────────────────

/** sessionId → terminalId of the session's "default" terminal */
const sessionTerminalMap = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────────

/** Strip ANSI escape sequences from PTY output for clean text */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

/** Strip OSC 633 sequences + ANSI + stray BEL from a PTY chunk for safe display */
function cleanChunk(s: string): string {
  // Remove OSC 633 shell-integration sequences (contain BEL \x07 which causes system beep)
  let out = s.replace(/\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)/g, "");
  // Remove remaining ANSI escape sequences
  out = stripAnsi(out);
  // Remove any stray BEL characters
  out = out.replace(/\x07/g, "");
  // Normalise carriage returns
  out = out.replace(/\r\n/g, "\n").replace(/\r/g, "");
  return out;
}

export function detectInteractivePrompt(output: string): boolean {
  if (!output) return false;
  return INTERACTIVE_PROMPT_PATTERNS.some((pattern) => pattern.test(output));
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
        (s as TerminalSurface).touch();
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
        (s as TerminalSurface).touch();
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

  // Wait for shell integration to signal prompt-ready (OSC 633;B)
  await surface.waitForPrompt();

  return { surface, terminalId, isNew: true, warning };
}

// ── OSC 633 command execution ────────────────────────────────────

/**
 * Parse OSC 633 sequences from raw PTY data.
 *
 * The shell integration scripts emit:
 *   \x1b]633;C\x07       — command execution started
 *   \x1b]633;D;{exit}\x07 — command finished, exit code
 *   \x1b]633;B\x07       — prompt ready (after D)
 *
 * We listen for D (command done + exit code) to know the command
 * finished, and capture all output between C and D.
 */

// Regex for OSC 633;D;{exitCode} — terminated by BEL (\x07) or ST (\x1b\\)
// Exit code can be empty (null $LASTEXITCODE), a number, or negative
const OSC_DONE_RE = /\x1b\]633;D;(-?\d*)(?:\x07|\x1b\\)/;

// Regex for OSC 633;B — prompt end (command-line ready).
// B is always the LAST marker in the prompt sequence (D → P → A → prompt → B),
// but PowerShell's formatting pipeline can flush output *after* B arrives in
// the PTY.  We use a short settle timer after D+B to capture late output.
const OSC_PROMPT_END_RE = /\x1b\]633;B(?:\x07|\x1b\\)/;

/**
 * Send a command into a persistent terminal and capture its output + exit
 * code using OSC 633 shell integration sequences.
 *
 * The command is sent **unmodified** — no wrapping, no temp files, no
 * escaping.  The shell's prompt hook emits OSC 633;D with the exit code
 * when the command completes.
 *
 * Completion is gated on **both** D (exit code) and B (prompt-end), followed
 * by a short settle period.  B is the last marker in the prompt sequence, but
 * PowerShell's formatting pipeline can flush command output *after* D+B arrive.
 * A 50 ms settle timer captures this late output without arbitrary long waits.
 *
 * Multi-line commands are written to a temp .ps1 file and dot-sourced so
 * they execute atomically in the current scope — PSReadLine otherwise
 * treats each \n as a separate Enter keystroke, garbling execution order.
 */
function executeInTerminal(
  surface: TerminalSurface,
  command: string,
  timeoutMs: number,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    let raw = "";
    let settled = false;

    // Cached D-marker result so we only scan for it once
    let dMatch: { exitCode: number; end: number } | null = null;

    // Settle timer: after D+B is detected, wait briefly for any late
    // output from PowerShell's deferred formatting pipeline before
    // calling finish().  Each new PTY chunk resets the timer.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const listener = (data: string) => {
      raw += data;

      // Stream cleaned output to the frontend (strip OSC 633 / ANSI / BEL
      // to avoid system beeps and rendering issues in the browser)
      if (onChunk) {
        const clean = cleanChunk(data);
        if (clean) onChunk(clean);
      }

      if (settled) return;

      // If we're in the settling phase (D+B already detected), reset
      // the timer — more data just arrived that we want to capture.
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

      // Step 2: After D, wait for B (prompt-end).  Don't finish
      // immediately — PowerShell can flush command output *after* the
      // prompt markers.  Start a settle timer: if no more data arrives
      // within 50 ms the output is considered complete.
      if (dMatch && OSC_PROMPT_END_RE.test(raw.slice(dMatch.end))) {
        settleTimer = setTimeout(() => finish(false, dMatch!.exitCode), 50);
      }
    };

    const finish = (timedOut: boolean, exitCode: number | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      signal?.removeEventListener("abort", onAbort);
      surface.removeOutputListener(listener);

      // Clean up temp script file
      if (tmpFile) {
        try { unlinkSync(tmpFile); } catch { /* already gone */ }
      }

      // Strip all OSC 633 sequences (A, B, C, D, E, P) — they are invisible
      // control codes, so removing them leaves only visible text in order:
      //   echoed command → command output → prompt text
      let output = raw.replace(/\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)/g, "");

      // Strip ANSI and clean up
      output = stripAnsi(output).replace(/\r/g, "");

      // Split into lines for targeted cleanup
      const lines = output.split("\n");

      // Remove the echoed command.  For single-line commands PSReadLine
      // echoes the command text.  For multi-line (dot-sourced via temp
      // file) it echoes the `. 'path'` invocation instead.
      if (tmpFile) {
        // Remove the dot-source line echo
        if (lines.length > 0 && lines[0]!.includes(tmpFile.replace(/\\/g, "\\\\"))) {
          lines.shift();
        } else if (lines.length > 0 && (lines[0]!.trim().startsWith(". '") || lines[0]!.trim().startsWith("."))) {
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
      if (output.length > 200_000) {
        output = "…(truncated)\n" + output.slice(-200_000);
      }

      resolve({ output: output || "(no output)", exitCode, timedOut });
    };

    // Listen BEFORE writing so we don't miss fast output
    surface.addOutputListener(listener);

    const timer = setTimeout(() => {
      // Interrupt the running command + Enter for clean prompt
      surface.write("\x03\r");
      setTimeout(() => finish(true), 500);
    }, timeoutMs);

    const onAbort = () => {
      surface.write("\x03");
      setTimeout(() => finish(false, null), 500);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    // For multi-line commands, write to a temp .ps1 file and dot-source it.
    // PSReadLine treats each \n as a separate Enter keystroke — bracketed
    // paste mode is unreliable across PSReadLine versions.  Dot-sourcing
    // runs the script in the current scope (variables persist) and
    // guarantees atomic execution.  Cleanup happens in finish().
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
}

// ── Tool definitions ─────────────────────────────────────────────

interface TerminalRunInput {
  command: string;
  sessionId?: string;
  terminalId?: string;
  timeout?: number;
  sandbox?: boolean;
  sandboxMountMode?: SandboxMountMode;
}

interface TerminalStreamInput {
  sessionId: string;
  workspaceRoot?: string;
  cols?: number;
  rows?: number;
}

export function createTerminalRunTool(
  registry: SurfaceRegistry,
  sandboxManager = new SandboxManager(),
  ws?: WsControlPlane,
): ToolDefinition<TerminalRunInput> {
  return {
    name: "terminal.run",
    description:
      "Execute a shell command in a persistent terminal (visible to the user) and return the output. " +
      "The terminal stays alive between calls — like VS Code's integrated terminal. " +
      "Multi-line scripts, pipes, and complex syntax all work unchanged.",
    tier: "core",
    category: "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        terminalId: { type: "string", description: "Reuse a specific terminal (omit to auto-select or create)" },
        timeout: { type: "number", description: "Execution timeout in ms (default 30000)" },
        sandbox: { type: "boolean", description: "Run inside Docker sandbox container" },
        sandboxMountMode: { type: "string", description: "Sandbox mount mode: none, read-only, read-write" },
      },
      required: ["command"],
    },
    async execute(input: TerminalRunInput, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 30000, terminalId: preferredId } = input;

      if (input.sandbox) {
        const result = await sandboxManager.runCommand({
          command,
          workspaceRoot: context.workspaceRoot,
          timeoutMs: timeout,
          mountMode: input.sandboxMountMode ?? "read-write",
          networkEnabled: false,
          memoryLimitMb: 512,
          cpuLimit: "1.0",
        });

        return {
          ok: result.ok,
          message: result.ok
            ? "Sandbox command completed (container isolated)"
            : result.timedOut
              ? `Sandbox command timed out after ${timeout}ms`
              : `Sandbox command failed (exit code ${result.exitCode ?? "unknown"})`,
          data: {
            output: result.output,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            sandbox: true,
            containerName: result.containerName,
            hostUnaffected: true,
          },
        };
      }

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
        const needsInteraction = result.timedOut && detectInteractivePrompt(result.output);
        const reason = result.timedOut
          ? `timed out after ${timeout}ms`
          : result.exitCode == null
            ? "exit status unavailable"
            : `exit code ${result.exitCode}`;
        let message = ok ? "Command completed (exit code 0)" : `Command failed (${reason})`;
        if (needsInteraction) {
          message += " [user interaction required in terminal]";
        }
        if (isNew) message += ` [new terminal ${terminalId}]`;
        if (warning) message += ` [${warning}]`;

        if (needsInteraction) {
          ws?.sendUICommand(
            {
              command: "terminal.focus",
              data: {
                terminalId,
                reason: "interactive-input-required",
                message: "This command is waiting for input in the terminal (for example a sudo password).",
              },
            },
            context.sessionId,
          );
        }

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
            needsInteraction,
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

export function createJaitTerminalTool(
  registry: SurfaceRegistry,
  sandboxManager = new SandboxManager(),
  ws?: WsControlPlane,
): ToolDefinition<TerminalRunInput> {
  const base = createTerminalRunTool(registry, sandboxManager, ws);
  return {
    ...base,
    name: "jait.terminal",
    tier: "standard",
    description:
      "Jait terminal MCP tool. Execute a shell command in Jait and optionally target an existing terminal by terminalId. " +
      "Use this when the user refers to a specific terminal or wants commands run in the integrated terminal.",
  };
}

export function createTerminalStreamTool(registry: SurfaceRegistry): ToolDefinition<TerminalStreamInput> {
  return {
    name: "terminal.stream",
    description: "Start a new streaming terminal session (output sent via WebSocket). Use when you need an interactive terminal.",
    tier: "standard",
    category: "terminal",
    source: "builtin",
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
