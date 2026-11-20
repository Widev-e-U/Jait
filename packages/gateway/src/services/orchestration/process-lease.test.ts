import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileOrchestrationLease, LEASE_FILE_NAME, leasePathForDatabase } from "./process-lease.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jait-lease-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const leaseFile = () => join(dir, LEASE_FILE_NAME);
const onlyAlive = (...pids: number[]) => (pid: number) => pids.includes(pid);

describe("FileOrchestrationLease", () => {
  it("takes a free lease and records the holder's pid", () => {
    const lease = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive() });

    expect(lease.acquire()).toBe(true);
    expect(JSON.parse(readFileSync(leaseFile(), "utf8"))).toMatchObject({ pid: 1001 });
  });

  it("refuses a lease that another live process holds", () => {
    const owner = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive(1001) });
    const standby = new FileOrchestrationLease(leaseFile(), { pid: 1002, isAlive: onlyAlive(1001) });

    expect(owner.acquire()).toBe(true);
    expect(standby.acquire()).toBe(false);
    expect(JSON.parse(readFileSync(leaseFile(), "utf8"))).toMatchObject({ pid: 1001 });
  });

  it("takes over a lease whose holder is gone", () => {
    const owner = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive(1001) });
    const successor = new FileOrchestrationLease(leaseFile(), { pid: 1002, isAlive: onlyAlive(1002) });

    expect(owner.acquire()).toBe(true);
    expect(successor.acquire()).toBe(true);
    expect(JSON.parse(readFileSync(leaseFile(), "utf8"))).toMatchObject({ pid: 1002 });
  });

  it("lets a process that restarted under the same pid take the lease back", () => {
    const before = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive(1001) });
    const after = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive(1001) });

    expect(before.acquire()).toBe(true);
    expect(after.acquire()).toBe(true);
  });

  it("treats an unreadable lease file as free", () => {
    writeFileSync(leaseFile(), "{ not json");
    const lease = new FileOrchestrationLease(leaseFile(), { pid: 1002, isAlive: onlyAlive(1001) });

    expect(lease.acquire()).toBe(true);
  });

  it("releases only a lease it still holds, and removes its own", () => {
    const owner = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive(1001) });
    const successor = new FileOrchestrationLease(leaseFile(), { pid: 1002, isAlive: onlyAlive(1002) });
    owner.acquire();
    expect(successor.acquire()).toBe(true);

    owner.release();
    expect(JSON.parse(readFileSync(leaseFile(), "utf8"))).toMatchObject({ pid: 1002 });

    successor.release();
    expect(existsSync(leaseFile())).toBe(false);
  });

  it("does nothing when released before it was ever acquired", () => {
    const lease = new FileOrchestrationLease(leaseFile(), { pid: 1001, isAlive: onlyAlive() });

    expect(() => lease.release()).not.toThrow();
    expect(existsSync(leaseFile())).toBe(false);
  });
});

describe("leasePathForDatabase", () => {
  it("places the lease beside a file database, and leaves an in-memory database unleased", () => {
    const database = (file: string) => ({ prepare: () => ({ all: () => [{ seq: 0, name: "main", file }] }) });

    expect(leasePathForDatabase(database("/state/data/jait.db"))).toBe(join("/state/data", LEASE_FILE_NAME));
    expect(leasePathForDatabase(database(""))).toBeUndefined();
  });
});
