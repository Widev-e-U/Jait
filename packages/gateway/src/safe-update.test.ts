import { mkdtemp, mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareUpdate, activateUpdate } from "../bin/safe-update.mjs";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function packageAt(root: string, version: string) {
  for (const dir of ["bin", "dist", "web-dist"]) await mkdir(join(root, dir), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@jait/gateway", version }));
  await writeFile(join(root, "bin/jait.mjs"), `console.log('${version}')`);
  await writeFile(join(root, "dist/index.js"), "export {};");
  await writeFile(join(root, "web-dist/index.html"), "<html></html>");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jait-safe-update-"));
  roots.push(root);
  const live = join(root, "gateway");
  await packageAt(live, "0.1.909");
  return live;
}

const installer = async (_command: string, args: string[]) => {
  if (args[0] === "install") {
    const stage = args[args.indexOf("--prefix") + 1]!;
    await packageAt(join(stage, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@jait/gateway"), "0.1.910");
  }
};

describe("staged gateway updates", () => {
  it("keeps the live installation available throughout an asynchronous install", async () => {
    const live = await fixture();
    let unblock!: () => void;
    const pending = prepareUpdate({ live, runCommand: async (command, args) => {
      if (args[0] === "install") await new Promise<void>((done) => { unblock = done; });
      await installer(command, args);
    } });
    await vi.waitFor(() => expect(unblock).toBeTypeOf("function"));
    expect(JSON.parse(await readFile(join(live, "package.json"), "utf8")).version).toBe("0.1.909");
    await expect(prepareUpdate({ live })).rejects.toThrow("already pending");
    unblock();
    const plan = await pending;
    expect(plan.newVersion).toBe("0.1.910");
    expect(JSON.parse(await readFile(join(live, "package.json"), "utf8")).version).toBe("0.1.909");
  });

  it("preserves live files and releases the lock when npm fails", async () => {
    const live = await fixture();
    await expect(prepareUpdate({ live, runCommand: async () => { throw new Error("download failed"); } })).rejects.toThrow("download failed");
    await access(join(live, "bin/jait.mjs"));
    await expect(access(`${live}.update-lock`)).rejects.toThrow();
  });

  it("rejects incomplete candidates without touching live files", async () => {
    const live = await fixture();
    await expect(prepareUpdate({ live, runCommand: async () => undefined })).rejects.toThrow();
    await access(join(live, "bin/jait.mjs"));
  });

  it("switches only after validation and retains the previous installation", async () => {
    const live = await fixture();
    const plan = await prepareUpdate({ live, runCommand: installer });
    const health = vi.fn(async () => undefined);
    await activateUpdate(plan, { restart: async () => undefined, health, port: 9000 });
    expect(JSON.parse(await readFile(join(live, "package.json"), "utf8")).version).toBe("0.1.910");
    expect(JSON.parse(await readFile(join(plan.backup, "package.json"), "utf8")).version).toBe("0.1.909");
    expect(health).toHaveBeenCalledWith(9000, "0.1.910");
  });

  it("restores and verifies the old version when the new gateway fails startup", async () => {
    const live = await fixture();
    const plan = await prepareUpdate({ live, runCommand: installer });
    const restart = vi.fn(async () => undefined);
    const health = vi.fn(async (_port: number, version: string) => { if (version === "0.1.910") throw new Error("startup failed"); });
    await expect(activateUpdate(plan, { restart, health })).rejects.toThrow("startup failed");
    expect(restart).toHaveBeenCalledTimes(2);
    expect(health).toHaveBeenLastCalledWith(8000, "0.1.909");
    expect(JSON.parse(await readFile(join(live, "package.json"), "utf8")).version).toBe("0.1.909");
    await access(join(plan.stage, "failed/bin/jait.mjs"));
  });
});
