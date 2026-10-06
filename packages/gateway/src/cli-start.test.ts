import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/jait.mjs");

async function fixture({ installed = false, available = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "jait-cli-start-"));
  const bin = join(root, "bin");
  const unitDir = join(root, ".config/systemd/user");
  await mkdir(bin);
  await mkdir(unitDir, { recursive: true });
  const unitPath = join(unitDir, "jait-gateway.service");
  if (installed) await writeFile(unitPath, "existing custom unit\n");
  const calls = join(root, "calls");
  await writeFile(join(bin, "systemctl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$JAIT_TEST_CALLS"
if [ "$2" = "show-environment" ]; then exit ${available ? 0 : 1}; fi
exit 0
`, { mode: 0o755 });
  await writeFile(join(bin, "loginctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cliPath, "start", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, ".config"), PATH: `${bin}:/usr/bin:/bin`, JAIT_TEST_CALLS: calls },
  });
  return { root, unitPath, calls, run };
}

describe.skipIf(process.platform !== "linux")("supervised CLI start", () => {
  it("installs and enables a daemon on first start, including requested flags", async () => {
    const f = await fixture();
    const result = f.run("--port", "8123", "--host", "127.0.0.1");
    expect(result.status).toBe(0);
    expect(await readFile(f.calls, "utf8")).toContain("--user enable jait-gateway");
    expect(await readFile(f.calls, "utf8")).toContain("--user start jait-gateway");
    const unit = await readFile(f.unitPath, "utf8");
    expect(unit).toContain("--port 8123 --host 127.0.0.1");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("TimeoutStopSec=15");
    expect(unit).toContain("StartLimitIntervalSec=0");
    expect(result.stdout).toContain("supervised by systemd");
  });

  it("starts an installed daemon without replacing its configuration", async () => {
    const f = await fixture({ installed: true });
    expect(f.run().status).toBe(0);
    expect(await readFile(f.unitPath, "utf8")).toBe("existing custom unit\n");
    expect(await readFile(f.calls, "utf8")).not.toContain("daemon-reload");
  });

  it("refuses to silently ignore flags for an installed daemon", async () => {
    const f = await fixture({ installed: true });
    const result = f.run("--port", "8123");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("jait daemon install");
    expect(await readFile(f.calls, "utf8")).not.toContain("--user start");
  });

  it("requires an explicit foreground start when systemd is unavailable", async () => {
    const f = await fixture({ available: false });
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("jait start --foreground");
    expect(await readFile(f.calls, "utf8")).not.toContain("--user start");
  });

  it("does not create a daemon alongside a tracked unsupervised gateway", async () => {
    const f = await fixture();
    await mkdir(join(f.root, ".jait"));
    await writeFile(join(f.root, ".jait/jait.pid"), String(process.pid));
    const result = f.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unsupervised gateway is still running");
    expect(await readFile(f.calls, "utf8")).not.toContain("--user start");
  });

  it("rejects unknown or incomplete start options", async () => {
    const f = await fixture();
    expect(f.run("--background").status).toBe(1);
    expect(f.run("--port").status).toBe(1);
  });

  it("explains foreground mode in help without touching systemd", async () => {
    const f = await fixture({ available: false });
    const result = f.run("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--foreground");
  });

  it("runs foreground mode directly without consulting systemd", async () => {
    const f = await fixture({ available: false });
    const isolatedCli = join(f.root, "bin/jait.mjs");
    await writeFile(isolatedCli, await readFile(cliPath));
    await writeFile(join(f.root, "package.json"), JSON.stringify({ type: "module", version: "0.0.0" }));
    await writeFile(join(f.root, "bin/compile-cache.mjs"), "export {};\n");
    await mkdir(join(f.root, "dist"));
    await writeFile(join(f.root, "dist/index.js"), 'export async function main() { console.log(`foreground port=${process.env.PORT}`); }\n');
    const result = spawnSync(process.execPath, [isolatedCli, "start", "--foreground", "--port", "8123"], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, HOME: f.root, PATH: `${join(f.root, "bin")}:/usr/bin:/bin`, JAIT_TEST_CALLS: f.calls },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("foreground port=8123");
    await expect(readFile(f.calls, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
