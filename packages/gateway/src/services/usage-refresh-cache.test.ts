import { expect, it, vi } from "vitest";
import { UsageRefreshCache } from "./usage-refresh-cache.js";

it("shares concurrent calls and suppresses provider calls for five minutes", async () => {
  let now = 0;
  const cache = new UsageRefreshCache<number>(() => now);
  let finish!: (value: number) => void;
  const load = vi.fn(() => new Promise<number>(resolve => { finish = resolve; }));
  const first = cache.run("user/account", load);
  expect(cache.run("user/account", load, { force: true })).toBe(first);
  await Promise.resolve();
  finish(42);
  expect(await first).toBe(42);
  now = 299_999;
  expect(await cache.run("user/account", load)).toBe(42);
  expect(load).toHaveBeenCalledTimes(1);
  now = 300_000;
  const next = cache.run("user/account", async () => 43);
  expect(await next).toBe(43);
});

it("isolates users and configurations and lets every forced read reload", async () => {
  let now = 100;
  const cache = new UsageRefreshCache<number>(() => now);
  const load = vi.fn(async () => 1);
  await cache.run("alice/config1", load);
  await cache.run("bob/config1", load);
  await cache.run("alice/config2", load);
  await cache.run("alice/config1", load, { force: true });
  expect(load).toHaveBeenCalledTimes(4);
  now += 30_000;
  await cache.run("alice/config1", load, { force: true });
  expect(load).toHaveBeenCalledTimes(5);
});

it("backs off automatic refreshes while every manual refresh retries", async () => {
  let now = 1;
  const cache = new UsageRefreshCache<{ failed: boolean }>(() => now);
  const load = vi.fn(async () => ({ failed: true }));
  const options = { force: true, failed: (value: { failed: boolean }) => value.failed };
  await cache.run("alice", load, options);
  expect(load).toHaveBeenCalledTimes(1);

  // Automatic refreshes honor the failure backoff.
  now += 300_000;
  await cache.run("alice", load);
  expect(load).toHaveBeenCalledTimes(1);

  // The Refresh button ignores the backoff entirely, even a second later.
  now += 1;
  await cache.run("alice", load, options);
  expect(load).toHaveBeenCalledTimes(2);
  now += 1_000;
  await cache.run("alice", load, options);
  expect(load).toHaveBeenCalledTimes(3);

  const broken = vi.fn(async () => { throw new Error("offline"); });
  await expect(cache.run("bob", broken)).rejects.toThrow("offline");
  await expect(cache.run("bob", broken, { force: true })).rejects.toThrow("offline");
  expect(broken).toHaveBeenCalledTimes(2);
  now += 30_000;
  await expect(cache.run("bob", broken, { force: true })).rejects.toThrow("offline");
  expect(broken).toHaveBeenCalledTimes(3);
});
