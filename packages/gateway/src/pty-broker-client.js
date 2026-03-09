/**
 * PTY Broker Client — communicates with the Node.js PTY broker subprocess.
 *
 * The broker runs under Node.js to work around Bun's broken node:net streams
 * that prevent node-pty ConPTY writes on Windows.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
export class PtyBrokerClient {
    proc = null;
    rl = null;
    nextId = 1;
    pending = new Map();
    ready = false;
    /** Callback when a PTY produces output */
    onOutput;
    /** Callback when a PTY process exits */
    onExit;
    /**
     * Start the broker subprocess.
     * Resolves once the broker signals readiness on stderr.
     */
    async start() {
        const brokerPath = resolve(dirname(fileURLToPath(import.meta.url)), "pty-broker.mjs");
        this.proc = spawn("node", [brokerPath], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        // Read newline-delimited JSON responses from stdout
        this.rl = createInterface({ input: this.proc.stdout });
        this.rl.on("line", (line) => {
            try {
                const msg = JSON.parse(line);
                this.handleMessage(msg);
            }
            catch {
                // ignore malformed
            }
        });
        // Wait for "pty-broker ready" on stderr (up to 10s)
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("PTY broker startup timeout")), 10_000);
            const errRl = createInterface({ input: this.proc.stderr });
            errRl.on("line", (line) => {
                if (line.includes("pty-broker ready")) {
                    clearTimeout(timer);
                    this.ready = true;
                    errRl.close();
                    resolve();
                }
            });
        });
        console.log("PTY broker started (Node.js subprocess)");
    }
    handleMessage(msg) {
        // Event (no id) — output or exit
        if (msg.event) {
            if (msg.event === "output" && msg.ptyId && msg.data != null) {
                this.onOutput?.(msg.ptyId, msg.data);
            }
            else if (msg.event === "exit" && msg.ptyId) {
                this.onExit?.(msg.ptyId, msg.exitCode ?? -1, msg.signal);
            }
            return;
        }
        // RPC response (has id)
        if (msg.id != null) {
            const pending = this.pending.get(msg.id);
            if (pending) {
                this.pending.delete(msg.id);
                clearTimeout(pending.timer);
                pending.resolve(msg);
            }
        }
    }
    /** Send a command and wait for the response */
    rpc(cmd, timeoutMs = 15_000) {
        const id = this.nextId++;
        const payload = JSON.stringify({ id, ...cmd }) + "\n";
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`PTY broker RPC timeout: ${cmd["cmd"]}`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.proc?.stdin?.write(payload);
        });
    }
    /** Spawn a new PTY process, returns { ptyId, pid } */
    async spawn(opts) {
        const resp = await this.rpc({
            cmd: "spawn",
            shell: opts.shell,
            cols: opts.cols,
            rows: opts.rows,
            cwd: opts.cwd,
            env: opts.env,
        });
        if (!resp.ok)
            throw new Error(resp.error ?? "spawn failed");
        return { ptyId: resp.ptyId, pid: resp.pid };
    }
    /** Write data to a PTY */
    async write(ptyId, data) {
        const resp = await this.rpc({ cmd: "write", ptyId, data });
        if (!resp.ok)
            throw new Error(resp.error ?? "write failed");
    }
    /** Resize a PTY */
    async resize(ptyId, cols, rows) {
        const resp = await this.rpc({ cmd: "resize", ptyId, cols, rows });
        if (!resp.ok)
            throw new Error(resp.error ?? "resize failed");
    }
    /** Kill a PTY */
    async kill(ptyId) {
        const resp = await this.rpc({ cmd: "kill", ptyId });
        if (!resp.ok)
            throw new Error(resp.error ?? "kill failed");
    }
    /** Gracefully stop the broker */
    async stop() {
        this.ready = false;
        // Clear pending
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error("Broker stopping"));
        }
        this.pending.clear();
        this.rl?.close();
        this.rl = null;
        if (this.proc) {
            this.proc.kill("SIGTERM");
            this.proc = null;
        }
    }
    get isReady() {
        return this.ready;
    }
}
//# sourceMappingURL=pty-broker-client.js.map