import { createHash } from "node:crypto";
import { readFileSync, readlinkSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { getStateDirectory } from "../state-directory.js";

function read(path: string): string {
  try { return readFileSync(path, "utf8").trim(); } catch { return ""; }
}

function processStart(pid: number): string {
  // comm can contain spaces and parentheses; fields after the last ')' start at field 3.
  const stat = read(`/proc/${pid}/stat`);
  return stat ? stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/)[19] ?? "" : "";
}

function pidNamespace(): string {
  try { return readlinkSync("/proc/self/ns/pid"); } catch { return ""; }
}

/** Same state directory and PID namespace only; gateways sharing Docker stay isolated. */
export function commandSandboxGateway(): string {
  return createHash("sha256").update(JSON.stringify([
    hostname(), read("/etc/machine-id"), pidNamespace(), resolve(getStateDirectory()),
  ])).digest("hex").slice(0, 32);
}

export function commandSandboxOwner(): string {
  return `${process.pid}:${processStart(process.pid)}:${read("/proc/sys/kernel/random/boot_id")}`;
}

/** Unknown/permission-denied owners are retained. PID reuse and host reboot are detected on Linux. */
export function commandSandboxOwnerAlive(owner: string): boolean {
  if (!/^\d+:[^:]*:[^:]*$/.test(owner)) return true;
  const [pidText, start, boot] = owner.split(":");
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  const currentBoot = read("/proc/sys/kernel/random/boot_id");
  if (boot && currentBoot && boot !== currentBoot) return false;
  try { process.kill(pid, 0); } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
  const currentStart = processStart(pid);
  return !(start && currentStart && start !== currentStart);
}
