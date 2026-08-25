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
import { RemoteTerminalSurface } from "../surfaces/remote-terminal.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import type { WsControlPlane } from "../ws.js";
import type { TerminalExecutionPayload } from "@jait/shared";
import type { SecretInputService } from "../services/secret-input.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
import { isShellPromptLine } from "./shell-prompt.js";
import { writeFileSync, unlinkSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Constants ────────────────────────────────────────────────────

const MAX_TERMINALS = 10;
const SANDBOX_PROJECT_PATH = "/project";
const INTERACTIVE_PROMPT_PATTERNS = [
  /\[sudo\]\s+password\s+for\s+[^:]+:/i,
  /password:\s*$/im,
  /enter\s+passphrase\s+for\s+key/i,
  /verification\s+code:\s*$/im,
  /press\s+enter\s+to\s+continue/i,
];

/** Patterns that indicate a terminal pager (less, more, man) is waiting for input */
const PAGER_PROMPT_PATTERNS = [
  /\(END\)\s*$/m,
  /press\s+RETURN/i,
  /No\s+next\s+tag/i,
  /Use\s+old\s+bottom/i,
  /\.{3}skipping\.{3}/i,
  /lines?\s+\d+-\d+/i,
  // lone ":" at the very end of output (less default prompt)
  /:\s*$/m,
];
const SECRET_INPUT_PROMPT_PATTERNS = INTERACTIVE_PROMPT_PATTERNS.filter(
  (pattern) => !pattern.source.includes("press\\s+enter"),
);

// ── Session → terminal mapping ───────────────────────────────────

/** sessionId → terminalId of the session's "default" terminal */
const sessionTerminalMap = new Map<string, string>();

type ManagedTerminalSurface = TerminalSurface | RemoteTerminalSurface;

export interface ManagedTerminalExecution {
  command: string;
  actionId: string;
  startedAt: string;
  completedAt: string | null;
  outputOffset: number;
  outputEndOffset: number | null;
  output: string | null;
  isBackground: boolean;
  watched: boolean | null;
}

const MAX_TERMINAL_EXECUTION_HISTORY = 50;
const MAX_TERMINAL_HISTORY_ENTRIES = 100;
const managedTerminalExecutions = new Map<string, ManagedTerminalExecution>();
const managedTerminalExecutionHistory = new Map<string, ManagedTerminalExecution[]>();

export function getManagedTerminalExecution(terminalId: string): ManagedTerminalExecution | null {
  return managedTerminalExecutions.get(terminalId) ?? null;
}

export function getManagedTerminalExecutions(terminalId: string): ManagedTerminalExecution[] {
  return managedTerminalExecutionHistory.get(terminalId) ?? [];
}

/**
 * The wire form of an execution: everything a tool card needs to attach a live
 * terminal, minus `output` — the client replays the real bytes off the terminal
 * stream, so echoing a completed command's whole output here would only bloat
 * the event.
 */
export function toTerminalExecutionPayload(
  terminalId: string,
  execution: ManagedTerminalExecution | null,
): TerminalExecutionPayload {
  if (!execution) return { terminalId, execution: null };
  const { output: _output, ...rest } = execution;
  return { terminalId, execution: rest };
}

function setManagedTerminalExecution(
  terminalId: string,
  context: ToolContext,
  command: string,
  outputOffset: number,
  isBackground: boolean,
  watched: boolean | null,
  ws?: WsControlPlane,
): void {
  const execution: ManagedTerminalExecution = {
    command,
    actionId: context.actionId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    outputOffset,
    outputEndOffset: null,
    output: null,
    isBackground,
    watched,
  };
  managedTerminalExecutions.set(terminalId, execution);
  // Pushed before the command is written to the PTY so the card is already
  // attached when the first byte of output arrives.
  ws?.broadcastTerminalExecution(
    context.sessionId,
    context.userId,
    toTerminalExecutionPayload(terminalId, execution),
  );
}

function clearManagedTerminalExecution(
  terminalId: string,
  actionId: string,
  context?: ToolContext,
  ws?: WsControlPlane,
): void {
  if (managedTerminalExecutions.get(terminalId)?.actionId !== actionId) return;
  managedTerminalExecutions.delete(terminalId);
  if (context) {
    ws?.broadcastTerminalExecution(
      context.sessionId,
      context.userId,
      toTerminalExecutionPayload(terminalId, null),
    );
  }
}

function completeManagedTerminalExecution(
  terminalId: string,
  actionId: string,
  outputEndOffset: number,
  output: string,
  context?: ToolContext,
  ws?: WsControlPlane,
): ManagedTerminalExecution | null {
  const active = managedTerminalExecutions.get(terminalId);
  if (!active || active.actionId !== actionId) return null;

  const completed: ManagedTerminalExecution = {
    ...active,
    completedAt: new Date().toISOString(),
    outputEndOffset,
    output,
    watched: active.isBackground ? false : active.watched,
  };
  managedTerminalExecutions.delete(terminalId);
  if (context) {
    ws?.broadcastTerminalExecution(
      context.sessionId,
      context.userId,
      toTerminalExecutionPayload(terminalId, completed),
    );
  }
  if (!active.isBackground) return completed;

  const history = [...(managedTerminalExecutionHistory.get(terminalId) ?? []), completed]
    .slice(-MAX_TERMINAL_EXECUTION_HISTORY);
  managedTerminalExecutionHistory.delete(terminalId);
  managedTerminalExecutionHistory.set(terminalId, history);
  while (managedTerminalExecutionHistory.size > MAX_TERMINAL_HISTORY_ENTRIES) {
    const oldestTerminalId = managedTerminalExecutionHistory.keys().next().value;
    if (typeof oldestTerminalId !== "string") break;
    managedTerminalExecutionHistory.delete(oldestTerminalId);
  }
  return completed;
}

function getTerminalOutputOffset(surface: ManagedTerminalSurface): number {
  if ("getOutputOffset" in surface && typeof surface.getOutputOffset === "function") {
    return surface.getOutputOffset();
  }
  return 0;
}

function sessionTerminalKey(context: ToolContext): string {
  const nodeId = context.executionNodeId && context.executionNodeId !== "gateway"
    ? context.executionNodeId
    : "gateway";
  return `${nodeId}:${context.sessionId}`;
}

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

function hasShellPrompt(rawOutput: string, shell: string): boolean {
  const cleaned = stripAnsi(rawOutput).replace(/\r/g, "");
  const lines = cleaned
    .split("\n")
    .map((line) => line.replace(/^[^\x07]*\x07/, "").trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? "";
  return isShellPromptLine(lastLine, shell);
}

function inferFallbackExitCode(rawOutput: string): number {
  const cleaned = stripAnsi(rawOutput).replace(/\r/g, "");
  if (/command (?:'[^']+'\s+)?not found|not recognized as (?:an internal|the name of a cmdlet)|No such file or directory/i.test(cleaned)) {
    return 127;
  }
  if (/permission denied|access is denied/i.test(cleaned)) {
    return 126;
  }
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteProjectPathForSandboxCommand(command: string, projectRoot: string): string {
  const root = projectRoot.trim();
  if (!root) return command;
  const escapedRoot = escapeRegExp(root);
  const rootPattern = new RegExp(
    `(?<![A-Za-z0-9._~\\\\/-])${escapedRoot}(?=$|[\\\\/\\s"'\\\`:;,|&()\\[\\]{}<>])`,
    "g",
  );
  return command.replace(rootPattern, SANDBOX_PROJECT_PATH);
}

export function detectInteractivePrompt(output: string): boolean {
  if (!output) return false;
  return INTERACTIVE_PROMPT_PATTERNS.some((pattern) => pattern.test(output));
}

/** Detect if the output ends with a pager prompt (less/more/man) */
export function detectPagerPrompt(output: string): boolean {
  if (!output) return false;
  const cleaned = stripAnsi(output).replace(/\r/g, "");
  return PAGER_PROMPT_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function getInteractivePromptLabel(output: string): string | null {
  const cleaned = stripAnsi(output).replace(/\r/g, "");
  const promptLine = cleaned.slice(cleaned.lastIndexOf("\n") + 1).trim();
  if (!promptLine) return null;
  return SECRET_INPUT_PROMPT_PATTERNS.some((pattern) => pattern.test(promptLine))
    ? promptLine
    : null;
}

function isPowerShellShell(shell: string): boolean {
  return /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(shell);
}

export function buildTerminalExitMarkerCommand(shell: string, token: string): string {
  return isPowerShellShell(shell)
    ? `$jaitExitCode = if ($?) { 0 } elseif ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 1 }; Write-Output "${token}:$jaitExitCode"`
    : `printf '\\n${token}:%s\\n' "$?"`;
}

function isSshCommand(command: string): boolean {
  return /^\s*ssh(?:\s|$)/.test(command);
}

function isSshSecretPrompt(command: string, prompt: string): boolean {
  return isSshCommand(command) && /(?:password|passphrase).*:\s*$/i.test(prompt);
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

/** Age at which leftover command scripts are swept (best effort). */
const COMMAND_SCRIPT_TTL_MS = 24 * 60 * 60_000;

/**
 * Write a multi-line command to a temp script for the shell to source.
 *
 * Sourcing keeps the command atomic: PSReadLine otherwise treats each \n as a
 * separate Enter keystroke, and every shell reports a separate exit code per
 * line — which the background-completion watcher would read as the whole
 * command having finished. Dot-sourcing runs in the current scope, so cwd and
 * variables still persist across calls.
 */
function writeCommandScript(command: string): string {
  const dir = join(tmpdir(), "jait-terminal");
  mkdirSync(dir, { recursive: true });

  // Background commands have no natural point at which to delete their script
  // (the shell reads it while running), so sweep old ones here instead.
  try {
    const cutoff = Date.now() - COMMAND_SCRIPT_TTL_MS;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
      } catch { /* raced with another sweep */ }
    }
  } catch { /* sweeping is best effort */ }

  const file = join(dir, `cmd-${uuidv7()}.ps1`);
  writeFileSync(file, command, "utf-8");
  return file;
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
  ws?: WsControlPlane,
): Promise<{ surface: ManagedTerminalSurface; terminalId: string; isNew: boolean; warning?: string }> {
  const terminalKey = sessionTerminalKey(context);

  if (preferredId) {
    const existingSurface = registry.getSurface(preferredId);
    if (existingSurface?.type === "terminal" && existingSurface.state === "running") {
      (existingSurface as ManagedTerminalSurface).touch();
      return { surface: existingSurface as ManagedTerminalSurface, terminalId: preferredId, isNew: false };
    }

    const remoteNodeId = context.executionNodeId && context.executionNodeId !== "gateway"
      ? context.executionNodeId
      : null;
    if (!remoteNodeId) {
      throw new Error(`Requested terminal ${preferredId} is not running`);
    }
    if (!ws) {
      throw new Error("Remote terminal execution requires the WebSocket control plane");
    }

    const remoteSurface = new RemoteTerminalSurface(preferredId, ws, remoteNodeId, { reuseOnly: true });
    registry.registerInstance(preferredId, remoteSurface);
    try {
      await remoteSurface.start({
        sessionId: context.sessionId,
        projectRoot: context.projectRoot,
        nodeId: remoteNodeId,
      });
      registry.onSurfaceStarted?.(preferredId, remoteSurface);
      sessionTerminalMap.set(terminalKey, preferredId);
      await remoteSurface.waitForPrompt();
      return { surface: remoteSurface, terminalId: preferredId, isNew: false };
    } catch (error) {
      registry.unregister(preferredId);
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Requested terminal ${preferredId} is unavailable: ${reason}`);
    }
  }

  // 2. Try the session's default terminal
  const existingId = sessionTerminalMap.get(terminalKey);
  if (existingId) {
    try {
      const s = registry.getSurface(existingId);
      if (s && s.type === "terminal" && s.state === "running") {
        (s as ManagedTerminalSurface).touch();
        return { surface: s as ManagedTerminalSurface, terminalId: existingId, isNew: false };
      }
    } catch { /* gone */ }
    sessionTerminalMap.delete(terminalKey);
  }

  // 3. Enforce global limit — stop oldest terminal(s) if at cap
  let warning: string | undefined;
  const allTerminals = registry
    .listSurfaces()
    .filter((s) => s.type === "terminal" && s.state === "running");

  if (allTerminals.length >= MAX_TERMINALS) {
    // Never evict a terminal running a watched background command — killing it
    // loses both the command and the completion notification the agent is
    // waiting on.
    const evictable = allTerminals.filter(
      (s) => !backgroundCommandMonitor.hasWatcherForTerminal(s.id),
    );
    const oldest = evictable[0];
    if (oldest) {
      await registry.stopSurface(oldest.id, "terminal limit reached");
      // Clean up stale session mapping
      for (const [sid, tid] of sessionTerminalMap.entries()) {
        if (tid === oldest.id) { sessionTerminalMap.delete(sid); break; }
      }
      warning = `Terminal limit (${MAX_TERMINALS}) reached — stopped oldest terminal ${oldest.id}`;
    } else {
      warning = `Terminal limit (${MAX_TERMINALS}) reached, but every terminal is running a background command — starting an extra terminal`;
    }
    console.log(`[terminal] ${warning}`);
  }

  // 4. Create a new terminal
  const terminalId = `term-${uuidv7()}`;
  let surface: ManagedTerminalSurface;
  const remoteNodeId = context.executionNodeId && context.executionNodeId !== "gateway"
    ? context.executionNodeId
    : null;
  if (remoteNodeId) {
    if (!ws) throw new Error("Remote terminal execution requires the WebSocket control plane");
    const remoteSurface = new RemoteTerminalSurface(terminalId, ws, remoteNodeId);
    registry.registerInstance(terminalId, remoteSurface);
    try {
      await remoteSurface.start({
        sessionId: context.sessionId,
        projectRoot: context.projectRoot,
        nodeId: remoteNodeId,
      });
      registry.onSurfaceStarted?.(terminalId, remoteSurface);
      surface = remoteSurface;
    } catch (error) {
      registry.unregister(terminalId);
      throw error;
    }
  } else {
    surface = (await registry.startSurface("terminal", terminalId, {
      sessionId: context.sessionId,
      projectRoot: context.projectRoot,
    })) as TerminalSurface;
  }

  sessionTerminalMap.set(terminalKey, terminalId);

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
  surface: ManagedTerminalSurface,
  command: string,
  timeoutMs: number,
  shell: string,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
  requestInteractiveSecret?: (prompt: string) => Promise<string | null>,
): Promise<{ output: string; exitCode: number | null; timedOut: boolean; interactionRequired?: boolean }> {
  return new Promise((resolve) => {
    let raw = "";
    let settled = false;
    let promptRequestInFlight = false;
    let promptAnswered = false;
    const remoteCompletionToken = surface instanceof RemoteTerminalSurface
      ? `__JAIT_REMOTE_DONE_${uuidv7()}__`
      : null;

    // Cached D-marker result so we only scan for it once
    let dMatch: { exitCode: number; end: number } | null = null;

    // Settle timer: after D+B is detected, wait briefly for any late
    // output from PowerShell's deferred formatting pipeline before
    // calling finish().  Each new PTY chunk resets the timer.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let settleExitCode: number | null = null;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const armTimer = () => {
      if (timeoutMs <= 0 || settled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // If stuck in a pager (less/more), send 'q' to exit cleanly;
        // otherwise send Ctrl+C + Enter for normal interrupt.
        if (detectPagerPrompt(raw)) {
          surface.write("q");
        } else {
          surface.write("\x03\r");
        }
        setTimeout(() => finish(true), 500);
      }, timeoutMs);
    };

    const listener = (data: string) => {
      raw += data;

      // Stream cleaned output to the frontend (strip OSC 633 / ANSI / BEL
      // to avoid system beeps and rendering issues in the browser)
      if (onChunk) {
        const clean = cleanChunk(data);
        if (clean) onChunk(clean);
      }

      if (settled) return;

      if (requestInteractiveSecret && !promptRequestInFlight && !promptAnswered) {
        const prompt = getInteractivePromptLabel(raw);
        if (prompt) {
          promptRequestInFlight = true;
          if (timer) clearTimeout(timer);
          void requestInteractiveSecret(prompt).then((secret) => {
            if (settled) return;
            promptRequestInFlight = false;
            promptAnswered = true;
            if (!secret) {
              surface.write("\x03\r");
              setTimeout(() => finish(false, null), 500);
              return;
            }
            surface.write(`${secret}\r`);
            armTimer();
          });
          return;
        }
      }

      if (remoteCompletionToken) {
        const completionMatch = raw.match(new RegExp(`${remoteCompletionToken}:(-?\\d+)`));
        if (completionMatch) {
          settleExitCode = parseInt(completionMatch[1]!, 10);
          settleTimer = setTimeout(() => finish(false, settleExitCode), 50);
          return;
        }
      }

      // If we're in the settling phase (D+B already detected), reset
      // the timer — more data just arrived that we want to capture.
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(false, settleExitCode), 50);
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
        settleExitCode = dMatch.exitCode;
        settleTimer = setTimeout(() => finish(false, settleExitCode), 50);
        return;
      }

      // Some sessions have a working interactive shell but no OSC 633
      // completion markers.  A returned prompt is still enough to know a
      // simple command has finished, so fall back to prompt detection.
      if (!dMatch && hasShellPrompt(raw, shell)) {
        settleExitCode = inferFallbackExitCode(raw);
        settleTimer = setTimeout(() => finish(false, settleExitCode), 100);
      }
    };

    const finish = (timedOut: boolean, exitCode: number | null = null, interactionRequired = false) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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
      const lines = output
        .split("\n")
        .filter((line) => !remoteCompletionToken || !line.includes(remoteCompletionToken));

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
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!.trim();
        if (isShellPromptLine(line, shell)) {
          lines.splice(i, 1);
        }
      }

      output = lines.join("\n").trim();
      if (output.length > 200_000) {
        output = "…(truncated)\n" + output.slice(-200_000);
      }

      resolve({ output: output || "(no output)", exitCode, timedOut, interactionRequired });
    };

    // Listen BEFORE writing so we don't miss fast output
    surface.addOutputListener(listener);

    const onAbort = () => {
      surface.write("\x03");
      setTimeout(() => finish(false, null), 500);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    armTimer();

    // For multi-line commands, write to a temp .ps1 file and dot-source it.
    // PSReadLine treats each \n as a separate Enter keystroke — bracketed
    // paste mode is unreliable across PSReadLine versions.  Dot-sourcing
    // runs the script in the current scope (variables persist) and
    // guarantees atomic execution.  Cleanup happens in finish().
    let tmpFile: string | null = null;
    if (surface instanceof RemoteTerminalSurface && remoteCompletionToken) {
      const terminalInput = [
        command,
        buildTerminalExitMarkerCommand(shell, remoteCompletionToken),
      ].join("\n");
      surface.write(`\x1b[200~${terminalInput}\x1b[201~\r`);
    } else if (command.includes("\n")) {
      tmpFile = writeCommandScript(command);
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
  isBackground?: boolean;
  sandbox?: boolean;
  sandboxMountMode?: SandboxMountMode;
}

interface TerminalStreamInput {
  sessionId: string;
  projectRoot?: string;
  cols?: number;
  rows?: number;
}

export function createTerminalRunTool(
  registry: SurfaceRegistry,
  sandboxManager = new SandboxManager(),
  ws?: WsControlPlane,
  secretInput?: SecretInputService,
): ToolDefinition<TerminalRunInput> {
  return {
    name: "terminal.run",
    displayName: "Terminal",
    description:
      "Execute a shell command in a persistent terminal (visible to the user) and return the output. " +
      "The terminal stays alive between calls — like VS Code's integrated terminal. " +
      "Multi-line scripts, pipes, and complex syntax all work unchanged.",
    tier: "standard",
    category: "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        terminalId: { type: "string", description: "Reuse a specific terminal (omit to auto-select or create)" },
        timeout: { type: "number", description: "Execution timeout in ms (default 30000). Use 0 for no timeout." },
        isBackground: { type: "boolean", description: "If true, start the command and return immediately without blocking. Use for long-running commands you don't need to watch inline — servers, watchers, and long test/build runs. You'll be notified automatically when the command finishes, so end your turn and wait instead of polling." },
        sandbox: { type: "boolean", description: "Run inside Docker sandbox container" },
        sandboxMountMode: { type: "string", description: "Sandbox mount mode: none, read-only, read-write" },
      },
      required: ["command"],
    },
    async execute(input: TerminalRunInput, context: ToolContext): Promise<ToolResult> {
      const { command, timeout = 30000, terminalId: preferredId, isBackground } = input;

      if (input.sandbox) {
        const sandboxCommand = rewriteProjectPathForSandboxCommand(command, context.projectRoot);
        const result = context.sandboxContainerName
          ? await sandboxManager.execInContainer({
              containerName: context.sandboxContainerName,
              command: sandboxCommand,
              timeoutMs: timeout,
            })
          : await sandboxManager.runCommand({
              command: sandboxCommand,
              projectRoot: context.projectRoot,
              timeoutMs: timeout,
              mountMode: input.sandboxMountMode ?? "read-write",
              networkEnabled: false,
              memoryLimitMb: 512,
              cpuLimit: "1.0",
            });

        return {
          ok: result.ok,
          message: result.ok
            ? context.sandboxContainerName
              ? "Sandbox command completed (thread container isolated)"
              : "Sandbox command completed (container isolated)"
            : result.timedOut
              ? `Sandbox command timed out after ${timeout}ms`
              : `Sandbox command failed (exit code ${result.exitCode ?? "unknown"})`,
          data: {
            output: result.output,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            sandbox: true,
            containerName: result.containerName,
            threadSandbox: Boolean(context.sandboxContainerName),
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
          await ensureSessionTerminal(registry, context, preferredId, ws);
        const outputOffset = getTerminalOutputOffset(surface);

        // 2. Background mode: start the command and return immediately. Watch
        //    the terminal for completion (OSC 633) so the agent can be
        //    automatically re-triggered when the command finishes.
        if (isBackground) {
          const completionToken = `__JAIT_BACKGROUND_DONE_${uuidv7()}__`;
          const watched = backgroundCommandMonitor.track({
            sessionId: context.sessionId,
            terminalId,
            command,
            surface,
            completionToken,
            shell: String(surface.snapshot().metadata?.shell ?? ""),
            onComplete: ({ output }) => {
              completeManagedTerminalExecution(
                terminalId,
                context.actionId,
                getTerminalOutputOffset(surface),
                output,
                context,
                ws,
              );
            },
            onStop: () => clearManagedTerminalExecution(terminalId, context.actionId, context, ws),
          });
          setManagedTerminalExecution(terminalId, context, command, outputOffset, true, watched, ws);
          // Multi-line commands must reach the shell as a *single* command.
          // Written raw, each line completes separately and the completion
          // marker for line 1 was mistaken for the whole command finishing —
          // so the agent got a "done" notification seconds in, and the real
          // completion was never reported. Sourcing a temp file runs the
          // whole thing in the current shell (cwd and variables persist) and
          // produces exactly one completion marker.
          const shell = String(surface.snapshot().metadata?.shell ?? "");
          const scriptFile = command.includes("\n") && !(surface instanceof RemoteTerminalSurface)
            ? writeCommandScript(command)
            : null;
          const commandLine = scriptFile
            ? `. '${scriptFile.replace(/'/g, "''")}'`
            : command;
          const terminalInput = [
            commandLine,
            buildTerminalExitMarkerCommand(shell, completionToken),
          ].join("\n");
          if (surface instanceof RemoteTerminalSurface) {
            surface.write(`\x1b[200~${terminalInput}\x1b[201~\r`);
          } else {
            surface.write(`${terminalInput}\r`);
          }
          return {
            ok: true,
            message: watched
              ? `Background command started in terminal ${terminalId}. You'll be notified automatically when it finishes — end your turn and wait rather than polling.`
              : `Background command started in terminal ${terminalId}, but it is NOT being watched (too many background commands are already running). You will NOT be notified when it finishes — check on it yourself with terminal.run.`,
            data: {
              output: watched
                ? "(background — running; you'll be notified on completion)"
                : "(background — running; NOT watched, no completion notification will be sent)",
              exitCode: null,
              timedOut: false,
              terminalId,
              outputOffset,
              isBackground: true,
              watched,
            },
          };
        }

        // 3. Execute the command (sentinel-based)
        setManagedTerminalExecution(terminalId, context, command, outputOffset, false, null, ws);
        let result: Awaited<ReturnType<typeof executeInTerminal>>;
        let outputEndOffset: number | null = null;
        try {
          const execPromise = executeInTerminal(
            surface,
            command,
            timeout,
            String(surface.snapshot().metadata?.shell ?? ""),
            context.onOutputChunk,
            context.signal,
            secretInput
              ? (prompt) => secretInput.requestSecret({
                  sessionId: context.sessionId,
                  userId: context.userId,
                  title: isSshSecretPrompt(command, prompt) ? "SSH password" : "Terminal input required",
                  prompt,
                  requestedBy: "terminal.run",
                  command,
                  timeoutMs: 120_000,
                })
              : undefined,
          );

          result = context.signal
            ? await raceAbort(execPromise, context.signal)
            : await execPromise;
          outputEndOffset = getTerminalOutputOffset(surface);
          completeManagedTerminalExecution(
            terminalId,
            context.actionId,
            outputEndOffset,
            result.output,
            context,
            ws,
          );
        } finally {
          clearManagedTerminalExecution(terminalId, context.actionId, context, ws);
        }

        // 3. Build response
        // Mark as failed if exit code != 0 or timed out.
        // Also detect likely-failed commands that exit 0 but have short output
        // dominated by failure indicators (e.g. "failed to connect to X").
        const exitOk = !result.timedOut && result.exitCode === 0;
        const outputLooksLikeFail = exitOk
          && result.output.length < 500
          && /^[^\n]*\b(fail(ed)?|error:|fatal:|cannot|connection refused)\b/im.test(result.output);
        const ok = exitOk && !outputLooksLikeFail;
        const pagerDetected = result.timedOut && detectPagerPrompt(result.output);
        const needsInteraction = Boolean(result.interactionRequired)
          || (result.timedOut && (detectInteractivePrompt(result.output) || pagerDetected));
        const reason = result.timedOut
          ? `timed out after ${timeout}ms`
          : result.exitCode == null
            ? "exit status unavailable"
            : `exit code ${result.exitCode}`;
        let message = ok ? "Command completed (exit code 0)" : `Command failed (${reason})`;
        if (pagerDetected) {
          message += " [pager detected — auto-exited]";
        } else if (needsInteraction) {
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
            outputOffset,
            outputEndOffset,
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
  secretInput?: SecretInputService,
): ToolDefinition<TerminalRunInput> {
  const base = createTerminalRunTool(registry, sandboxManager, ws, secretInput);
  return {
    ...base,
    name: "jait.terminal",
    tier: "standard",
    description:
      "Jait terminal MCP tool. Execute a shell command in Jait and optionally target an existing terminal by terminalId. " +
      "Use this when the user refers to a specific terminal or wants commands run in the integrated terminal. " +
      "Every command runs as a live terminal inside the chat card, so do not create a separate terminal surface first. " +
      "Set isBackground: true for long-running commands (servers, watchers, long test/build runs) — Jait notifies you " +
      "automatically when they finish, so prefer this over your own shell's background mode, which Jait cannot watch.",
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
        projectRoot: { type: "string", description: "Working directory for the terminal" },
        cols: { type: "number", description: "Terminal width in columns" },
        rows: { type: "number", description: "Terminal height in rows" },
      },
      required: ["sessionId"],
    },
    async execute(input: TerminalStreamInput, context: ToolContext): Promise<ToolResult> {
      const termId = `term-${uuidv7()}`;
      const projectRoot = input.projectRoot ?? context.projectRoot;

      const surface = await registry.startSurface("terminal", termId, {
        sessionId: input.sessionId || context.sessionId,
        projectRoot,
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
