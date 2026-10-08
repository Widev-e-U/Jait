/** Staged updates shared by the CLI and HTTP gateway. Never install over live files. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, cp, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const modulePath = fileURLToPath(import.meta.url);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export async function run(command, args, options = {}) {
  return exec(command, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options });
}

export async function validatePackage(root, runCommand = run) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (pkg.name !== "@jait/gateway" || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
    throw new Error("Invalid staged gateway package");
  }
  for (const entry of ["bin/jait.mjs", "dist/index.js", "web-dist/index.html"]) {
    await access(join(root, entry));
  }
  // Some dependencies expose only CLI binaries or ESM exports. Check their
  // installed manifests rather than resolving a CommonJS entry point.
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    const dependencyPackage = JSON.parse(await readFile(join(root, "node_modules", dependency, "package.json"), "utf8"));
    if (dependencyPackage.name !== dependency) throw new Error(`Invalid installed dependency: ${dependency}`);
  }
  await runCommand(process.execPath, ["--check", join(root, "dist/index.js")]);
  await runCommand(process.execPath, [join(root, "bin/jait.mjs"), "--version"], { timeout: 30_000 });
  return pkg.version;
}

export async function prepareUpdate({ live = resolve(dirname(modulePath), ".."), version = "latest", runCommand = run } = {}) {
  if (!/^(?:[A-Za-z][0-9A-Za-z._-]*|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.test(version)) {
    throw new Error(`Invalid gateway version or npm tag: ${version}`);
  }
  // Keeping staging beside the live directory makes renames stay on one filesystem.
  const lock = `${live}.update-lock`;
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`An update is already pending. Inspect ${lock} before retrying.`);
  }
  let stage;
  try {
    await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    stage = await mkdtemp(join(dirname(live), ".jait-update-"));
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    // No whole-install deadline: npm's network retries bound failed downloads.
    // This is asynchronous, so HTTP and the health monitor remain responsive.
    await runCommand(npm, ["install", "--global", "--prefix", stage, `@jait/gateway@${version}`, "--no-audit", "--no-fund"]);
    const candidate = join(stage, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@jait/gateway");
    const newVersion = await validatePackage(candidate, runCommand);
    const previousVersion = JSON.parse(await readFile(join(live, "package.json"), "utf8")).version;
    const plan = { live, lock, stage, candidate, newVersion, previousVersion, backup: join(stage, "previous") };
    // A copied controller survives both the directory swap and service shutdown.
    await cp(modulePath, join(stage, "safe-update.mjs"));
    await writeFile(join(stage, "plan.json"), JSON.stringify(plan));
    return plan;
  } catch (error) {
    if (stage) await rm(stage, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
    throw error;
  }
}

export async function discardUpdate(plan) {
  await rm(plan.stage, { recursive: true, force: true });
  await rm(plan.lock, { recursive: true, force: true });
}

export async function waitForVersion(port, version, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3_000) });
      const health = await response.json();
      if (response.ok && health.healthy !== false && health.version === version) return;
    } catch { /* process is still starting */ }
    await sleep(1_000);
  }
  throw new Error(`Gateway ${version} did not become healthy on port ${port}`);
}

export async function activateUpdate(plan, { restart, stop, health = waitForVersion, port = 8000 } = {}) {
  let moved = false;
  let installed = false;
  try {
    // Stop only after the candidate is installed and validated. No npm work in downtime.
    if (stop) await stop();
    await rename(plan.live, plan.backup);
    moved = true;
    await rename(plan.candidate, plan.live);
    installed = true;
    if (restart) {
      await restart();
      await health(port, plan.newVersion);
    }
    await writeFile(join(plan.stage, "result.json"), JSON.stringify({ ok: true, version: plan.newVersion }));
    // Retain the previous installation for manual recovery; no destructive cleanup.
    await rm(plan.lock, { recursive: true, force: true });
  } catch (error) {
    if (moved) {
      if (stop) await stop();
      if (installed) await rename(plan.live, join(plan.stage, "failed"));
      await rename(plan.backup, plan.live);
      if (restart) {
        await restart();
        await health(port, plan.previousVersion);
      }
    }
    await writeFile(join(plan.stage, "result.json"), JSON.stringify({ ok: false, error: String(error), rolledBack: moved }));
    await rm(plan.lock, { recursive: true, force: true });
    throw error;
  }
}

export async function activateSystemdUpdate(plan, unit, port) {
  await activateUpdate(plan, {
    port,
    stop: () => run("systemctl", ["--user", "stop", unit]),
    restart: () => run("systemctl", ["--user", "start", unit]),
  });
}

export async function launchSystemdUpdate(plan, unit, port) {
  // A transient service has its own cgroup. detached:true alone does not escape
  // KillMode=mixed, and would kill the rollback controller during gateway shutdown.
  await run("systemd-run", ["--user", "--collect", `--unit=jait-update-${Date.now()}`, "--property=Type=exec",
    process.execPath, join(plan.stage, "safe-update.mjs"), "--activate", join(plan.stage, "plan.json"), unit, String(port)]);
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath && process.argv[2] === "--activate") {
  const plan = JSON.parse(await readFile(process.argv[3], "utf8"));
  // Give the HTTP response time to reach the browser before stopping its server.
  await sleep(1_000);
  try {
    await activateSystemdUpdate(plan, process.argv[4], Number(process.argv[5]));
    console.log(`Updated Jait to ${plan.newVersion}. Previous version retained in ${plan.backup}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
