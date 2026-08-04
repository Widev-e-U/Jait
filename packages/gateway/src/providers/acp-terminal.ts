/**
 * Backing implementation for the ACP `terminal` client capability.
 *
 * When an ACP agent (Codex, Claude Code, etc.) calls `createTerminal`, it
 * expects Jait (the client) to actually run the command and let it poll
 * output / wait for exit / kill / release it — see
 * https://agentclientprotocol.com/protocol/terminals. Each instance here
 * backs exactly one such terminal with a plain child process (no PTY/shell
 * integration needed: the protocol only requires captured output + exit
 * status, not an interactive shell).
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { EnvVariable, TerminalExitStatus } from "@agentclientprotocol/sdk";
import { extractCompletionOutput } from "../services/background-command-monitor.js";

export interface AcpTerminalOptions {
  command: string;
  args?: string[];
  cwd?: string | null;
  env?: EnvVariable[];
  outputByteLimit?: number | null;
}

export class AcpTerminal {
  readonly command: string;
  readonly startedAt = Date.now();

  private readonly child: ChildProcess;
  private readonly outputByteLimit: number | null;
  private output = "";
  private truncated = false;
  private exitStatus: TerminalExitStatus | null = null;
  private readonly exitPromise: Promise<TerminalExitStatus>;
  private resolveExit!: (status: TerminalExitStatus) => void;

  constructor(opts: AcpTerminalOptions) {
    this.command = [opts.command, ...(opts.args ?? [])].join(" ");
    this.outputByteLimit = opts.outputByteLimit ?? null;

    const env: Record<string, string | undefined> = { ...process.env };
    for (const kv of opts.env ?? []) env[kv.name] = kv.value;

    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });

    this.child = spawn(opts.command, opts.args ?? [], {
      cwd: opts.cwd ?? undefined,
      env,
    });
    this.child.on("error", (err) => {
      this.appendOutput(`\n[terminal error: ${err instanceof Error ? err.message : String(err)}]`);
    });
    this.child.stdout?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString("utf8")));
    this.child.stderr?.on("data", (chunk: Buffer) => this.appendOutput(chunk.toString("utf8")));
    this.child.on("exit", (code, signal) => {
      this.exitStatus = { exitCode: code, signal: signal ?? null };
      this.resolveExit(this.exitStatus);
    });
  }

  private appendOutput(text: string): void {
    this.output += text;
    if (this.outputByteLimit && Buffer.byteLength(this.output, "utf8") > this.outputByteLimit) {
      while (this.output.length > 0 && Buffer.byteLength(this.output, "utf8") > this.outputByteLimit) {
        this.output = this.output.slice(1);
      }
      this.truncated = true;
    }
  }

  get isRunning(): boolean {
    return this.exitStatus === null;
  }

  currentOutput(): { output: string; exitStatus: TerminalExitStatus | null; truncated: boolean } {
    return { output: this.output, exitStatus: this.exitStatus, truncated: this.truncated };
  }

  waitForExit(): Promise<TerminalExitStatus> {
    return this.exitPromise;
  }

  /** Await completion and return output cleaned up for a completion notification. */
  async waitForCompletion(): Promise<{ exitCode: number | null; output: string }> {
    const status = await this.exitPromise;
    return { exitCode: status.exitCode ?? null, output: extractCompletionOutput(this.output, this.command) };
  }

  kill(): void {
    if (this.isRunning) {
      try {
        this.child.kill();
      } catch {
        /* already dead */
      }
    }
  }

  /** Kill (if running) and mark released; safe to call multiple times. */
  release(): void {
    this.kill();
  }
}
