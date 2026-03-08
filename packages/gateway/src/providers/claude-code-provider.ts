/**
 * Claude Code CLI Provider — wraps Anthropic's Claude Code CLI as a Jait provider.
 *
 * Spawns `claude` CLI with `--output-format stream-json` for structured output.
 * Claude Code supports MCP natively via its config, so Jait tools can be exposed.
 *
 * Claude Code outputs newline-delimited JSON events to stdout:
 *   { type: "assistant", message: { ... } }
 *   { type: "tool_use", tool: "...", input: {...} }
 *   { type: "tool_result", ... }
 *   { type: "result", ... }
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uuidv7 } from "../lib/uuidv7.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";

// ── Internal session state ───────────────────────────────────────────

interface ClaudeSessionState {
  session: ProviderSession;
  process: ChildProcess | null;
  buffer: string;
  workingDirectory: string;
  env: Record<string, string>;
  model?: string;
}

// ── Provider implementation ──────────────────────────────────────────

export class ClaudeCodeProvider implements CliProviderAdapter {
  readonly id = "claude-code" as const;
  readonly info: ProviderInfo = {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI agent with agentic coding and MCP support",
    available: false,
    modes: ["full-access", "supervised"],
  };

  private sessions = new Map<string, ClaudeSessionState>();
  private emitter = new EventEmitter();
  private claudePath: string | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const paths = ["claude"];
      for (const cmd of paths) {
        const available = await this.testCommand(cmd);
        if (available) {
          this.claudePath = cmd;
          this.info.available = true;
          return true;
        }
      }
      this.info.available = false;
      this.info.unavailableReason = "Claude Code CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code";
      return false;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Claude Code CLI availability";
      return false;
    }
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: "claude-code",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };

    // Inject MCP server config via Claude Code's config file
    if (options.mcpServers && options.mcpServers.length > 0) {
      const mcpConfig = this.buildClaudeMcpConfig(options.mcpServers, sessionId);
      if (mcpConfig) {
        env["CLAUDE_CODE_MCP_CONFIG"] = mcpConfig;
      }
    }

    const state: ClaudeSessionState = {
      session,
      process: null,
      buffer: "",
      workingDirectory: options.workingDirectory,
      env,
      model: options.model,
    };

    this.sessions.set(sessionId, state);
    state.session.status = "running";
    this.emit({ type: "session.started", sessionId });

    return session;
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);

    const args: string[] = [
      "--output-format", "stream-json",
      "--verbose",
    ];

    // Runtime mode
    if (state.session.runtimeMode === "full-access") {
      args.push("--dangerously-skip-permissions");
    }

    // Model
    if (state.model) {
      args.push("--model", state.model);
    }

    // Add the prompt
    args.push("--print");
    args.push(message);

    const cmd = this.claudePath ?? "claude";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    state.process = child;
    state.buffer = "";

    child.stdout?.on("data", (data: Buffer) => {
      state.buffer += data.toString();
      this.processBuffer(sessionId, state);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[claude-code:${sessionId}] stderr: ${text}`);
      }
    });

    return new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        state.process = null;
        if (code === 0) {
          state.session.status = "running"; // Ready for next turn
          this.emit({ type: "session.completed", sessionId });
          resolve();
        } else {
          const error = `Claude Code exited with code ${code}`;
          state.session.status = "error";
          state.session.error = error;
          this.emit({ type: "session.error", sessionId, error });
          reject(new Error(error));
        }
      });

      child.on("error", (err) => {
        state.process = null;
        state.session.status = "error";
        state.session.error = err.message;
        this.emit({ type: "session.error", sessionId, error: err.message });
        reject(err);
      });
    });
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      state.process.kill("SIGINT");
      state.session.status = "interrupted";
    }
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    // Claude Code's --print mode doesn't support interactive approvals.
    // In supervised mode, the CLI would pause; we'd need to write to stdin.
    console.warn("Claude Code approval response not yet implemented for --print mode");
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    if (state.process) {
      state.process.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          state.process?.kill("SIGKILL");
          resolve();
        }, 3000);
        state.process?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    state.session.status = "completed";
    state.session.completedAt = new Date().toISOString();
    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  // ── Private helpers ────────────────────────────────────────────────

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private getState(sessionId: string): ClaudeSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Claude Code session found: ${sessionId}`);
    return state;
  }

  private processBuffer(sessionId: string, state: ClaudeSessionState): void {
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEvent(sessionId, event);
      } catch {
        // Not JSON — could be status output
      }
    }
  }

  private handleEvent(_sessionId: string, event: Record<string, unknown>): void {
    const type = event["type"] as string;

    switch (type) {
      case "assistant": {
        const message = event["message"] as Record<string, unknown> | undefined;
        const content = message?.["content"];
        if (typeof content === "string") {
          this.emit({ type: "token", content });
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if ((block as Record<string, unknown>)?.["type"] === "text") {
              this.emit({ type: "token", content: String((block as Record<string, unknown>)["text"] ?? "") });
            }
          }
        }
        break;
      }

      case "content_block_delta": {
        const delta = event["delta"] as Record<string, unknown> | undefined;
        if (delta?.["type"] === "text_delta") {
          this.emit({ type: "token", content: String(delta["text"] ?? "") });
        }
        break;
      }

      case "tool_use": {
        this.emit({
          type: "tool.start",
          tool: String(event["name"] ?? event["tool"] ?? ""),
          args: event["input"] ?? {},
        });
        break;
      }

      case "tool_result": {
        this.emit({
          type: "tool.result",
          tool: String(event["tool"] ?? ""),
          ok: event["is_error"] !== true,
          message: String(event["content"] ?? event["output"] ?? ""),
        });
        break;
      }

      case "result": {
        const resultContent = event["result"] as string | undefined;
        if (resultContent) {
          this.emit({ type: "message", role: "assistant", content: resultContent });
        }
        break;
      }

      default:
        this.emit({
          type: "activity",
          kind: type ?? "unknown",
          summary: `Claude Code: ${type}`,
          payload: event,
        });
    }
  }

  private buildClaudeMcpConfig(
    servers: StartSessionOptions["mcpServers"],
    sessionId: string,
  ): string | undefined {
    if (!servers || servers.length === 0) return undefined;

    const config: Record<string, unknown> = { mcpServers: {} };
    const mcpServers = config["mcpServers"] as Record<string, unknown>;

    for (const server of servers) {
      if (server.transport === "stdio" && server.command) {
        mcpServers[server.name] = {
          command: server.command,
          args: server.args ?? [],
          env: server.env ?? {},
        };
      } else if (server.transport === "sse" && server.url) {
        mcpServers[server.name] = {
          url: server.url,
        };
      }
    }

    // Write to a temp file and return the path
    const configDir = join(tmpdir(), "jait-claude-code", sessionId);
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], {
        stdio: "pipe",
        shell: true,
      });
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
      child.on("exit", (code: number | null) => { clearTimeout(timer); resolve(code === 0); });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
    });
  }
}
