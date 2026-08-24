/**
 * Background command monitor.
 *
 * When the agent starts a long-running shell command in "background" mode
 * (e.g. `execute` / `terminal.run` with `isBackground: true` for a test run,
 * build, or one-shot task), the tool returns immediately so the agent can end
 * its turn. This monitor watches the persistent terminal for the OSC 633
 * shell-integration "command done" marker and, when the command finishes,
 * invokes a completion handler so the agent can be automatically re-triggered
 * to react to the result — instead of the user having to type "continue".
 *
 * Never-ending processes (servers, watchers) simply never emit the done marker,
 * so they never fire the handler (and are dropped after `maxWatchMs`).
 */

import { isShellPromptLine } from "../tools/shell-prompt.js";

/** Minimal terminal-surface contract the monitor needs (satisfied by TerminalSurface). */
export interface MonitorableSurface {
  addOutputListener(listener: (data: string) => void): void;
  removeOutputListener(listener: (data: string) => void): void;
}

export interface BackgroundCommandResult {
  sessionId: string;
  terminalId: string;
  command: string;
  /** Exit code from OSC 633;D, or null when unavailable. */
  exitCode: number | null;
  /** Cleaned command output (OSC/ANSI stripped, echoed command removed, tail-truncated). */
  output: string;
  durationMs: number;
}

export type BackgroundCompletionHandler = (
  result: BackgroundCommandResult,
) => void | Promise<void>;

export interface TrackBackgroundCommandOptions {
  sessionId: string;
  terminalId: string;
  command: string;
  surface: MonitorableSurface;
  /** Optional sentinel printed by the terminal tool when shell integration is unavailable. */
  completionToken?: string;
  /** Terminal's shell, used to recognise (and strip) the trailing prompt. */
  shell?: string;
  /**
   * Stop watching after this long. Guards against never-ending processes
   * (servers/watchers) leaking listeners forever. Default 6 hours.
   */
  maxWatchMs?: number;
  /** Called once when the watcher completes, expires, or is cancelled. */
  onStop?: () => void;
}

// OSC 633;D;{exitCode} — command finished (exit code may be empty/negative).
// eslint-disable-next-line no-control-regex
const OSC_DONE_RE = /\x1b\]633;D;(-?\d*)(?:\x07|\x1b\\)/;
/** Any line mentioning the sentinel — the echoed `printf` as well as its output. */
const SENTINEL_TOKEN_RE = /__JAIT_BACKGROUND_DONE_[0-9a-f-]+__/;
/** The `. '<path>'` line used to source a multi-line command atomically. */
const SOURCED_SCRIPT_RE = /^\.\s+'[^']*jait-terminal[^']*'$/;

/**
 * Give up on a command after this long. Long builds and test suites routinely
 * run past 30 minutes (the previous value), and expiry is silent from the
 * agent's point of view — it is told it will be notified and then never is —
 * so the cap is deliberately generous.
 */
const DEFAULT_MAX_WATCH_MS = 6 * 60 * 60_000;
const MAX_OUTPUT_CHARS = 4000;
/** Hard cap on simultaneously-watched background commands (safety valve). */
const MAX_CONCURRENT_WATCHERS = 50;
/**
 * How long to wait for the completion sentinel after the OSC 633;D marker
 * arrives. D is emitted by the shell's prompt hook, which runs *before* the
 * sentinel `printf` on the next input line, so the sentinel — which captures
 * `$?` directly — lands a few milliseconds later and is the more trustworthy
 * exit code of the two.
 */
const SENTINEL_GRACE_MS = 250;

/** Strip OSC 633 + ANSI, drop the echoed command line, and tail-truncate. */
export function extractCompletionOutput(raw: string, command: string, shell = ""): string {
  const out = raw
    // OSC 633 shell-integration sequences (A/B/C/D/E/P …)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)/g, "")
    // Remaining ANSI / OSC escape sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1b\\))/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\x07/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "");

  // Drop the sentinel's echoed `printf` line and its result line. The token is
  // unique per command, so matching it anywhere on a line is safe — and it
  // takes the trailing shell prompt with it, since the shell echoes both on
  // the same line.
  const lines = out.split("\n").filter((line) => !SENTINEL_TOKEN_RE.test(line));
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();

  // Drop the first line if it is just the echoed command — or, for multi-line
  // commands, the `. '<script>'` line used to source them atomically.
  const cmdHead = command.trim().split("\n")[0]?.trim();
  if (lines.length > 0) {
    const head = lines[0]!.trim();
    if ((cmdHead && (head === cmdHead || head.endsWith(cmdHead))) || SOURCED_SCRIPT_RE.test(head)) {
      lines.shift();
    }
  }

  // The shell redraws its prompt once the command returns; that trailing
  // prompt is terminal furniture, not command output.
  while (lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (last.trim() !== "" && !isShellPromptLine(last, shell)) break;
    lines.pop();
  }

  let text = lines.join("\n").trim();
  if (text.length > MAX_OUTPUT_CHARS) {
    text = "…(truncated)\n" + text.slice(-MAX_OUTPUT_CHARS);
  }
  return text || "(no output)";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ActiveWatcher {
  sessionId: string;
  terminalId: string;
  cancel: () => void;
}

class BackgroundCommandMonitor {
  private handler: BackgroundCompletionHandler | undefined;
  private readonly active = new Set<ActiveWatcher>();

  /**
   * Register the (single) handler invoked when a tracked background command
   * finishes. Returns an unregister function. A later call replaces the
   * previous handler.
   */
  setCompletionHandler(handler: BackgroundCompletionHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) this.handler = undefined;
    };
  }

  /** Number of commands currently being watched (for tests/introspection). */
  get activeCount(): number {
    return this.active.size;
  }

  /**
   * Whether a background command is still being watched in this terminal.
   * The idle reaper consults this so it never kills a PTY out from under a
   * command whose completion someone is waiting on.
   */
  hasWatcherForTerminal(terminalId: string): boolean {
    for (const entry of this.active) {
      if (entry.terminalId === terminalId) return true;
    }
    return false;
  }

  private invokeHandler(result: BackgroundCommandResult): void {
    const handler = this.handler;
    if (!handler) {
      console.warn(
        `[background-command] ${result.terminalId}: "${result.command.slice(0, 80)}" finished but no completion handler is registered — the agent will not be notified`,
      );
      return;
    }
    void Promise.resolve()
      .then(() => handler(result))
      .catch(() => {
        /* handler errors must not crash the caller */
      });
  }

  /**
   * Report a completion that was observed somewhere else — a remote node
   * watching its own child process, for example. The caller owns correlating
   * the result back to a trusted session; this only fans it out to the
   * completion handler.
   */
  reportCompletion(result: BackgroundCommandResult): void {
    this.invokeHandler(result);
  }

  /**
   * Track a background command that isn't backed by a `MonitorableSurface`
   * (e.g. a process spawned directly for an ACP agent's native `terminal/create`
   * request) via an exit promise instead of output-scanning.
   */
  trackExternal(options: {
    sessionId: string;
    terminalId: string;
    command: string;
    startedAt: number;
    exitPromise: Promise<{ exitCode: number | null; output: string }>;
  }): void {
    if (this.active.size >= MAX_CONCURRENT_WATCHERS) return;

    const entry: ActiveWatcher = {
      sessionId: options.sessionId,
      terminalId: options.terminalId,
      cancel: () => this.active.delete(entry),
    };
    this.active.add(entry);

    void options.exitPromise
      .then(({ exitCode, output }) => {
        entry.cancel();
        this.invokeHandler({
          sessionId: options.sessionId,
          terminalId: options.terminalId,
          command: options.command,
          exitCode,
          output,
          durationMs: Date.now() - options.startedAt,
        });
      })
      .catch(() => entry.cancel());
  }

  /**
   * Begin watching a background command for completion. Non-blocking: attaches
   * an output listener to the terminal surface and returns immediately.
   *
   * Returns `false` when the command is *not* being watched, so the caller can
   * tell the agent the truth instead of promising a notification that will
   * never arrive.
   */
  track(options: TrackBackgroundCommandOptions): boolean {
    if (this.active.size >= MAX_CONCURRENT_WATCHERS) {
      console.warn(
        `[background-command] refusing to watch "${options.command.slice(0, 80)}" — ` +
          `already watching ${this.active.size} commands (cap ${MAX_CONCURRENT_WATCHERS})`,
      );
      return false;
    }

    const startedAt = Date.now();
    let raw = "";
    let finished = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
      try {
        options.surface.removeOutputListener(listener);
      } catch {
        /* surface already gone */
      }
      this.active.delete(entry);
      options.onStop?.();
    };

    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true;
      const output = extractCompletionOutput(raw, options.command, options.shell);
      cleanup();

      this.invokeHandler({
        sessionId: options.sessionId,
        terminalId: options.terminalId,
        command: options.command,
        exitCode,
        output,
        durationMs: Date.now() - startedAt,
      });
    };

    const listener = (data: string) => {
      if (finished) return;
      raw += data;

      // The sentinel echoes `$?` for the command itself, so it beats the OSC
      // marker whenever both are available.
      const tokenMatch = options.completionToken
        ? raw.match(new RegExp(`${escapeRegExp(options.completionToken)}:(-?\\d+)`))
        : null;
      if (tokenMatch) {
        const parsed = parseInt(tokenMatch[1]!, 10);
        finish(Number.isNaN(parsed) ? null : parsed);
        return;
      }

      const oscMatch = raw.match(OSC_DONE_RE);
      if (!oscMatch) return;

      const oscExit = oscMatch[1] ? parseInt(oscMatch[1], 10) : 0;
      const oscResult = Number.isNaN(oscExit) ? null : oscExit;

      // D has landed but the sentinel hasn't. Hold briefly — it runs on the
      // next input line and is only milliseconds behind.
      if (options.completionToken) {
        if (!graceTimer) graceTimer = setTimeout(() => finish(oscResult), SENTINEL_GRACE_MS);
        return;
      }
      finish(oscResult);
    };

    const timer = setTimeout(() => {
      console.warn(
        `[background-command] ${options.terminalId}: giving up on "${options.command.slice(0, 80)}" after ` +
          `${Math.round((options.maxWatchMs ?? DEFAULT_MAX_WATCH_MS) / 60_000)}min — no completion marker seen`,
      );
      cleanup();
    }, options.maxWatchMs ?? DEFAULT_MAX_WATCH_MS);
    const entry: ActiveWatcher = {
      sessionId: options.sessionId,
      terminalId: options.terminalId,
      cancel: cleanup,
    };

    options.surface.addOutputListener(listener);
    this.active.add(entry);
    return true;
  }

  /** Stop watching every background command for a session (e.g. on session close). */
  stopForSession(sessionId: string): void {
    for (const entry of [...this.active]) {
      if (entry.sessionId === sessionId) entry.cancel();
    }
  }

  clearForTests(): void {
    for (const entry of [...this.active]) entry.cancel();
    this.active.clear();
    this.handler = undefined;
  }
}

/** Process-wide singleton, mirroring `interventionRunResumeRegistry`. */
export const backgroundCommandMonitor = new BackgroundCommandMonitor();
