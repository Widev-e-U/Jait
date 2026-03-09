/**
 * Terminal Surface — uses bun-pty directly.
 *
 * Each TerminalSurface owns a persistent interactive PTY shell process
 * (viewable in the frontend via xterm.js + WebSocket).
 *
 * Shell integration:
 * On start, sources an integration script that hooks into the shell's
 * prompt lifecycle and emits OSC 633 escape sequences (same protocol as
 * VS Code's terminal shell integration).  This lets us detect command
 * boundaries, exit codes, and CWD changes without wrapping commands.
 */
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function spawnPty(shell, shellArgs, opts) {
    // Bun runtime path
    if (typeof Bun !== "undefined") {
        const bunPty = require("bun-pty");
        return bunPty.spawn(shell, shellArgs, opts);
    }
    // Node/Vitest fallback path
    const nodePty = require("node-pty");
    return nodePty.spawn(shell, shellArgs, opts);
}
/** Directory containing shell integration scripts */
const SHELL_INTEGRATION_DIR = join(__dirname, "shell-integration");
function defaultShell() {
    if (platform() === "win32") {
        // Prefer PowerShell 7 (pwsh) over Windows PowerShell 5.1 (powershell)
        // pwsh supports modern escape sequences and PSReadLine features
        try {
            execSync("pwsh.exe -v", { stdio: "ignore", timeout: 3000 });
            return "pwsh.exe";
        }
        catch {
            return "powershell.exe";
        }
    }
    return process.env["SHELL"] ?? "/bin/bash";
}
/** Detect which integration script to source based on the shell binary */
function shellIntegrationScript(shell) {
    const name = shell.toLowerCase().replace(/\.exe$/, "");
    if (name.includes("pwsh") || name.includes("powershell")) {
        return { path: join(SHELL_INTEGRATION_DIR, "pwsh.ps1"), type: "pwsh" };
    }
    if (name.includes("zsh")) {
        return { path: join(SHELL_INTEGRATION_DIR, "zsh.sh"), type: "zsh" };
    }
    if (name.includes("bash") || name.includes("sh")) {
        return { path: join(SHELL_INTEGRATION_DIR, "bash.sh"), type: "bash" };
    }
    return null;
}
export class TerminalSurface {
    id;
    type = "terminal";
    _state = "idle";
    _sessionId = null;
    _startedAt = null;
    _cwd = null;
    _pid = null;
    _pty = null;
    _outputBuffer = [];
    _cols;
    _rows;
    shell;
    extraEnv;
    _outputListeners = [];
    /** Whether the OSC 633 shell integration has emitted its first prompt (B marker) */
    _shellIntegrationReady = false;
    _shellIntegrationReadyResolve;
    _shellIntegrationReadyPromise;
    /** External callbacks (wired by index.ts / routes) */
    onOutput;
    onStateChange;
    onExit;
    constructor(id, opts = {}) {
        this.id = id;
        this.shell = opts.shell ?? defaultShell();
        this._cols = opts.cols ?? 120;
        this._rows = opts.rows ?? 30;
        this.extraEnv = opts.env ?? {};
        this._shellIntegrationReadyPromise = new Promise((resolve) => {
            this._shellIntegrationReadyResolve = resolve;
        });
    }
    get state() {
        return this._state;
    }
    get sessionId() {
        return this._sessionId;
    }
    get pid() {
        return this._pid ?? undefined;
    }
    /** True once the shell has emitted at least one OSC 633;B prompt-end marker */
    get shellIntegrationReady() {
        return this._shellIntegrationReady;
    }
    /** Resolves when the shell integration prompt is first ready (or after a timeout fallback) */
    waitForPrompt(timeoutMs = 5000) {
        if (this._shellIntegrationReady)
            return Promise.resolve();
        return Promise.race([
            this._shellIntegrationReadyPromise,
            new Promise((r) => setTimeout(r, timeoutMs)),
        ]);
    }
    async start(input) {
        if (this._state === "running")
            return;
        this._setState("starting");
        this._sessionId = input.sessionId;
        this._cwd = input.workspaceRoot;
        this._startedAt = new Date().toISOString();
        try {
            const integration = shellIntegrationScript(this.shell);
            // Build shell args — inject our integration script
            let shellArgs;
            if (integration?.type === "pwsh") {
                // PowerShell: -NoExit -File <script> runs the script then stays interactive
                shellArgs = ["-NoExit", "-File", integration.path];
            }
            else if (integration?.type === "bash") {
                shellArgs = ["--rcfile", integration.path];
            }
            else if (integration?.type === "zsh") {
                // zsh: source our script via ZDOTDIR override is complex —
                // instead we'll source it after spawn via write()
                shellArgs = [];
            }
            else {
                shellArgs = platform() === "win32" ? ["-NoProfile"] : [];
            }
            const pty = spawnPty(this.shell, shellArgs, {
                name: "xterm-256color",
                cols: this._cols,
                rows: this._rows,
                cwd: input.workspaceRoot,
                env: { ...process.env, TERM: "xterm-256color", ...this.extraEnv },
            });
            this._pty = pty;
            this._pid = pty.pid;
            // Wire PTY output → surface listeners + buffer
            // Also watch for OSC 633;B to know when prompt is ready
            pty.onData((data) => {
                this._outputBuffer.push(data);
                if (this._outputBuffer.length > 10000) {
                    this._outputBuffer = this._outputBuffer.slice(-5000);
                }
                // Detect shell integration prompt-end marker
                if (!this._shellIntegrationReady && data.includes("\x1b]633;B")) {
                    this._shellIntegrationReady = true;
                    this._shellIntegrationReadyResolve?.();
                }
                this.onOutput?.(data);
                for (const listener of this._outputListeners) {
                    listener(data);
                }
            });
            // Wire PTY exit
            pty.onExit((event) => {
                this._pid = null;
                this._pty = null;
                this._setState("stopped");
                this.onExit?.(event.exitCode, event.signal);
            });
            this._setState("running");
            // For zsh: source integration after the shell starts
            if (integration?.type === "zsh") {
                setTimeout(() => {
                    this.write(`source '${integration.path}'\n`);
                }, 300);
            }
        }
        catch (err) {
            this._setState("error");
            throw err;
        }
    }
    async stop(_input) {
        if (!this._pty) {
            this._setState("stopped");
            return;
        }
        this._setState("stopping");
        try {
            this._pty.kill();
        }
        catch {
            // already dead
        }
        this._pty = null;
        this._pid = null;
        this._setState("stopped");
    }
    /** Write raw data to the PTY (user keyboard input from frontend) */
    write(data) {
        if (this._state !== "running" || !this._pty)
            return;
        try {
            this._pty.write(data);
        }
        catch (err) {
            console.error(`PTY write error (${this.id}):`, err);
        }
    }
    /** Resize the PTY */
    resize(cols, rows) {
        if (!this._pty || this._state !== "running")
            return;
        this._cols = cols;
        this._rows = rows;
        try {
            this._pty.resize(cols, rows);
        }
        catch (err) {
            console.error(`PTY resize error (${this.id}):`, err);
        }
    }
    /** Add an output listener (used by terminal.run to mirror output) */
    addOutputListener(listener) {
        this._outputListeners.push(listener);
    }
    /** Remove an output listener */
    removeOutputListener(listener) {
        const idx = this._outputListeners.indexOf(listener);
        if (idx !== -1)
            this._outputListeners.splice(idx, 1);
    }
    snapshot() {
        return {
            id: this.id,
            type: this.type,
            state: this._state,
            sessionId: this._sessionId ?? "",
            startedAt: this._startedAt ?? undefined,
            metadata: {
                shell: this.shell,
                cols: this._cols,
                rows: this._rows,
                pid: this._pid ?? null,
                cwd: this._cwd,
            },
        };
    }
    getRecentOutput(lines = 100) {
        return this._outputBuffer.slice(-lines).join("");
    }
    _setState(s) {
        this._state = s;
        this.onStateChange?.(s);
    }
}
export class TerminalSurfaceFactory {
    type = "terminal";
    opts;
    constructor(opts = {}) {
        this.opts = opts;
    }
    create(id) {
        return new TerminalSurface(id, this.opts);
    }
}
//# sourceMappingURL=terminal.js.map