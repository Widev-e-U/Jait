/**
 * PTY Broker Client — communicates with the Node.js PTY broker subprocess.
 *
 * The broker runs under Node.js to work around Bun's broken node:net streams
 * that prevent node-pty ConPTY writes on Windows.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

/** Pending RPC call awaiting a response */
interface PendingCall {
  resolve: (msg: BrokerResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BrokerResponse {
  id?: number;
  ok?: boolean;
  error?: string;
  ptyId?: string;
  pid?: number;
  event?: string;
  data?: string;
  exitCode?: number;
  signal?: number;
}

export class PtyBrokerClient {
  private proc: ChildProcess | null = null;
  private rl: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private ready = false;

  /** Callback when a PTY produces output */
  onOutput?: (ptyId: string, data: string) => void;
  /** Callback when a PTY process exits */
  onExit?: (ptyId: string, exitCode: number, signal?: number) => void;

  /**
   * Start the broker subprocess.
   * Resolves once the broker signals readiness on stderr.
   */
  async start(): Promise<void> {
    const brokerPath = resolve(dirname(fileURLToPath(import.meta.url)), "pty-broker.mjs");

    this.proc = spawn("node", [brokerPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Read newline-delimited JSON responses from stdout
    this.rl = createInterface({ input: this.proc.stdout! });

    this.rl.on("line", (line: string) => {
      try {
        const msg: BrokerResponse = JSON.parse(line);
        this.handleMessage(msg);
      } catch {
        // ignore malformed
      }
    });

    // Wait for "pty-broker ready" on stderr (up to 10s)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("PTY broker startup timeout")), 10_000);
      const errRl = createInterface({ input: this.proc!.stderr! });
      errRl.on("line", (line: string) => {
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

  private handleMessage(msg: BrokerResponse) {
    // Event (no id) — output or exit
    if (msg.event) {
      if (msg.event === "output" && msg.ptyId && msg.data != null) {
        this.onOutput?.(msg.ptyId, msg.data);
      } else if (msg.event === "exit" && msg.ptyId) {
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
  private rpc(cmd: Record<string, unknown>, timeoutMs = 15_000): Promise<BrokerResponse> {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, ...cmd }) + "\n";

    return new Promise<BrokerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`PTY broker RPC timeout: ${cmd["cmd"]}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      this.proc?.stdin?.write(payload);
    });
  }

  /** Spawn a new PTY process, returns { ptyId, pid } */
  async spawn(opts: {
    shell?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<{ ptyId: string; pid: number }> {
    const resp = await this.rpc({
      cmd: "spawn",
      shell: opts.shell,
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
    });

    if (!resp.ok) throw new Error(resp.error ?? "spawn failed");
    return { ptyId: resp.ptyId!, pid: resp.pid! };
  }

  /** Write data to a PTY */
  async write(ptyId: string, data: string): Promise<void> {
    const resp = await this.rpc({ cmd: "write", ptyId, data });
    if (!resp.ok) throw new Error(resp.error ?? "write failed");
  }

  /** Resize a PTY */
  async resize(ptyId: string, cols: number, rows: number): Promise<void> {
    const resp = await this.rpc({ cmd: "resize", ptyId, cols, rows });
    if (!resp.ok) throw new Error(resp.error ?? "resize failed");
  }

  /** Kill a PTY */
  async kill(ptyId: string): Promise<void> {
    const resp = await this.rpc({ cmd: "kill", ptyId });
    if (!resp.ok) throw new Error(resp.error ?? "kill failed");
  }

  /** Gracefully stop the broker */
  async stop(): Promise<void> {
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
