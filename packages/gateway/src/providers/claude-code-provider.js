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
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uuidv7 } from "../lib/uuidv7.js";
// ── Provider implementation ──────────────────────────────────────────
export class ClaudeCodeProvider {
    id = "claude-code";
    info = {
        id: "claude-code",
        name: "Claude Code",
        description: "Anthropic Claude Code CLI agent with agentic coding and MCP support",
        available: false,
        modes: ["full-access", "supervised"],
    };
    sessions = new Map();
    emitter = new EventEmitter();
    claudePath = null;
    async checkAvailability() {
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
        }
        catch {
            this.info.available = false;
            this.info.unavailableReason = "Failed to check Claude Code CLI availability";
            return false;
        }
    }
    /**
     * Claude Code doesn't expose a model listing API.
     * Return known model aliases — the CLI accepts both aliases and full names.
     */
    async listModels() {
        return [
            { id: "sonnet", name: "Sonnet", description: "Claude Sonnet — fast & capable (alias)", isDefault: true },
            { id: "opus", name: "Opus", description: "Claude Opus — most capable (alias)" },
            { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", description: "Claude Sonnet 4 (full name)" },
            { id: "claude-opus-4-20250514", name: "Claude Opus 4", description: "Claude Opus 4 (full name)" },
        ];
    }
    async startSession(options) {
        const sessionId = uuidv7();
        const session = {
            id: sessionId,
            providerId: "claude-code",
            threadId: options.threadId,
            status: "starting",
            runtimeMode: options.mode,
            startedAt: new Date().toISOString(),
        };
        const env = {
            ...process.env,
            ...options.env,
        };
        // Inject MCP server config via Claude Code's config file
        if (options.mcpServers && options.mcpServers.length > 0) {
            const mcpConfig = this.buildClaudeMcpConfig(options.mcpServers, sessionId);
            if (mcpConfig) {
                env["CLAUDE_CODE_MCP_CONFIG"] = mcpConfig;
            }
        }
        const state = {
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
    async sendTurn(sessionId, message, _attachments) {
        const state = this.getState(sessionId);
        const args = [
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
        child.stdout?.on("data", (data) => {
            state.buffer += data.toString();
            this.processBuffer(sessionId, state);
        });
        child.stderr?.on("data", (data) => {
            const text = data.toString().trim();
            if (text) {
                console.error(`[claude-code:${sessionId}] stderr: ${text}`);
            }
        });
        return new Promise((resolve, reject) => {
            child.on("exit", (code) => {
                state.process = null;
                if (code === 0) {
                    state.session.status = "running"; // Ready for next turn
                    this.emit({ type: "session.completed", sessionId });
                    resolve();
                }
                else {
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
    async interruptTurn(sessionId) {
        const state = this.getState(sessionId);
        if (state.process) {
            state.process.kill("SIGINT");
            state.session.status = "interrupted";
        }
    }
    async respondToApproval(_sessionId, _requestId, _approved) {
        // Claude Code's --print mode doesn't support interactive approvals.
        // In supervised mode, the CLI would pause; we'd need to write to stdin.
        console.warn("Claude Code approval response not yet implemented for --print mode");
    }
    async stopSession(sessionId) {
        const state = this.sessions.get(sessionId);
        if (!state)
            return;
        if (state.process) {
            state.process.kill("SIGTERM");
            await new Promise((resolve) => {
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
    onEvent(handler) {
        this.emitter.on("event", handler);
        return () => this.emitter.off("event", handler);
    }
    // ── Private helpers ────────────────────────────────────────────────
    emit(event) {
        this.emitter.emit("event", event);
    }
    getState(sessionId) {
        const state = this.sessions.get(sessionId);
        if (!state)
            throw new Error(`No Claude Code session found: ${sessionId}`);
        return state;
    }
    processBuffer(sessionId, state) {
        const lines = state.buffer.split("\n");
        state.buffer = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            try {
                const event = JSON.parse(trimmed);
                this.handleEvent(sessionId, event);
            }
            catch {
                // Not JSON — could be status output
            }
        }
    }
    handleEvent(sessionId, event) {
        const type = event["type"];
        switch (type) {
            case "assistant": {
                const message = event["message"];
                const content = message?.["content"];
                if (typeof content === "string") {
                    this.emit({ type: "token", sessionId, content });
                }
                else if (Array.isArray(content)) {
                    for (const block of content) {
                        if (block?.["type"] === "text") {
                            this.emit({ type: "token", sessionId, content: String(block["text"] ?? "") });
                        }
                    }
                }
                break;
            }
            case "content_block_delta": {
                const delta = event["delta"];
                if (delta?.["type"] === "text_delta") {
                    this.emit({ type: "token", sessionId, content: String(delta["text"] ?? "") });
                }
                break;
            }
            case "tool_use": {
                this.emit({
                    type: "tool.start",
                    sessionId,
                    tool: String(event["name"] ?? event["tool"] ?? ""),
                    args: event["input"] ?? {},
                });
                break;
            }
            case "tool_result": {
                this.emit({
                    type: "tool.result",
                    sessionId,
                    tool: String(event["tool"] ?? ""),
                    ok: event["is_error"] !== true,
                    message: String(event["content"] ?? event["output"] ?? ""),
                });
                break;
            }
            case "result": {
                const resultContent = event["result"];
                if (resultContent) {
                    this.emit({ type: "message", sessionId, role: "assistant", content: resultContent });
                }
                break;
            }
            default:
                this.emit({
                    type: "activity",
                    sessionId,
                    kind: type ?? "unknown",
                    summary: `Claude Code: ${type}`,
                    payload: event,
                });
        }
    }
    buildClaudeMcpConfig(servers, sessionId) {
        if (!servers || servers.length === 0)
            return undefined;
        const config = { mcpServers: {} };
        const mcpServers = config["mcpServers"];
        for (const server of servers) {
            if (server.transport === "stdio" && server.command) {
                mcpServers[server.name] = {
                    command: server.command,
                    args: server.args ?? [],
                    env: server.env ?? {},
                };
            }
            else if (server.transport === "sse" && server.url) {
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
    testCommand(cmd) {
        return new Promise((resolve) => {
            const child = spawn(cmd, ["--version"], {
                stdio: "pipe",
                shell: true,
            });
            const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
            child.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
            child.on("error", () => { clearTimeout(timer); resolve(false); });
        });
    }
}
//# sourceMappingURL=claude-code-provider.js.map