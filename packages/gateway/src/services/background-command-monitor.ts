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
  /**
   * Stop watching after this long. Guards against never-ending processes
   * (servers/watchers) leaking listeners forever. Default 30 minutes.
   */
  maxWatchMs?: number;
}

// OSC 633;D;{exitCode} — command finished (exit code may be empty/negative).
// eslint-disable-next-line no-control-regex
const OSC_DONE_RE = /\x1b\]633;D;(-?\d*)(?:\x07|\x1b\\)/;
const SENTINEL_RE = /__JAIT_BACKGROUND_DONE_[0-9a-f-]+__:(-?\d+)/;

const DEFAULT_MAX_WATCH_MS = 30 * 60_000;
const MAX_OUTPUT_CHARS = 4000;
/** Hard cap on simultaneously-watched background commands (safety valve). */
const MAX_CONCURRENT_WATCHERS = 50;

/** Strip OSC 633 + ANSI, drop the echoed command line, and tail-truncate. */
export function extractCompletionOutput(raw: string, command: string): string {
  let out = raw
    // OSC 633 shell-integration sequences (A/B/C/D/E/P …)
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\]633;[A-Z][^\x07]*(?:\x07|\x1b\\)/g, "")
    // Remaining ANSI / OSC escape sequences
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1b\\))/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\x07/g, "")
    .replace(SENTINEL_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "");

  const lines = out.split("\n");
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();

  // Drop the first line if it is just the echoed command.
  const cmdHead = command.trim().split("\n")[0]?.trim();
  if (cmdHead && lines.length > 0) {
    const head = lines[0]!.trim();
    if (head === cmdHead || head.endsWith(cmdHead)) lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();

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
   * Begin watching a background command for completion. Non-blocking: attaches
   * an output listener to the terminal surface and returns immediately.
   */
  track(options: TrackBackgroundCommandOptions): void {
    if (this.active.size >= MAX_CONCURRENT_WATCHERS) return;

    const startedAt = Date.now();
    let raw = "";
    let finished = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        options.surface.removeOutputListener(listener);
      } catch {
        /* surface already gone */
      }
      this.active.delete(entry);
    };

    const listener = (data: string) => {
      if (finished) return;
      raw += data;
      const tokenMatch = options.completionToken
        ? raw.match(new RegExp(`${escapeRegExp(options.completionToken)}:(-?\\d+)`))
        : null;
      const match = raw.match(OSC_DONE_RE) ?? tokenMatch;
      if (!match) return;

      finished = true;
      const exitCode = match[1] ? parseInt(match[1], 10) : 0;
      const output = extractCompletionOutput(raw, options.command);
      cleanup();

      const result: BackgroundCommandResult = {
        sessionId: options.sessionId,
        terminalId: options.terminalId,
        command: options.command,
        exitCode: Number.isNaN(exitCode) ? null : exitCode,
        output,
        durationMs: Date.now() - startedAt,
      };
      const handler = this.handler;
      if (handler) {
        void Promise.resolve()
          .then(() => handler(result))
          .catch(() => {
            /* handler errors must not crash the terminal output pump */
          });
      }
    };

    const timer = setTimeout(cleanup, options.maxWatchMs ?? DEFAULT_MAX_WATCH_MS);
    const entry: ActiveWatcher = { sessionId: options.sessionId, cancel: cleanup };

    options.surface.addOutputListener(listener);
    this.active.add(entry);
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
