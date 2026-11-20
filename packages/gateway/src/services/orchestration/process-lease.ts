/**
 * Single-owner lease for plan orchestration on one database file. Only the
 * process holding it recovers interrupted attempts, pauses runs, dispatches
 * work and releases claims. A second gateway on the same database (for example
 * the canary of a redeploy, which inherits the state directory) stands by and
 * changes nothing, so it cannot interrupt or pause a live owner's runs.
 *
 * The lease is a small JSON file beside the database. A lease is free when its
 * holder is gone (its pid no longer exists) or is this same process, which is
 * how a restart within one process takes over. Coordination is local to one host.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const LEASE_FILE_NAME = "orchestration.lease.json";

export interface OrchestrationLease {
  /** Takes the lease when it is free. Returns whether this process holds it afterwards. */
  acquire(): boolean;
  /** Gives the lease up, but only removes the file while this process still holds it. */
  release(): void;
}

interface LeaseRecord {
  pid: number;
  token: string;
}

export interface FileLeaseOptions {
  /** Process that claims the lease. Defaults to this process. */
  pid?: number;
  /** Whether a pid is still running. Defaults to a signal-0 probe. */
  isAlive?: (pid: number) => boolean;
}

export class FileOrchestrationLease implements OrchestrationLease {
  private readonly pid: number;
  private readonly isAlive: (pid: number) => boolean;
  private readonly token = randomUUID();
  private held = false;

  constructor(readonly path: string, options: FileLeaseOptions = {}) {
    this.pid = options.pid ?? process.pid;
    this.isAlive = options.isAlive ?? processIsAlive;
  }

  acquire(): boolean {
    const current = this.read();
    if (current && current.token !== this.token && current.pid !== this.pid && this.isAlive(current.pid)) return false;
    this.write();
    // Two processes racing for a free lease both write. Re-reading decides, so only the last writer keeps it.
    this.held = this.read()?.token === this.token;
    return this.held;
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    if (this.read()?.token !== this.token) return;
    try {
      unlinkSync(this.path);
    } catch {
      // Already gone; nothing to release.
    }
  }

  private read(): LeaseRecord | null {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<LeaseRecord>;
      if (typeof parsed.pid !== "number" || typeof parsed.token !== "string") return null;
      return { pid: parsed.pid, token: parsed.token };
    } catch {
      return null;
    }
  }

  private write(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${this.token}.tmp`;
    writeFileSync(temp, JSON.stringify({ pid: this.pid, token: this.token }));
    renameSync(temp, this.path);
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The lease file for the database that `sqlite` has open, beside its file.
 * Undefined for an in-memory database, which no other process can share.
 */
export function leasePathForDatabase(sqlite: { prepare(sql: string): { all(...params: unknown[]): unknown[] } }): string | undefined {
  const rows = sqlite.prepare("PRAGMA database_list").all() as Array<{ name?: string; file?: string }>;
  const main = rows.find((row) => row.name === "main");
  return main?.file ? join(dirname(main.file), LEASE_FILE_NAME) : undefined;
}
