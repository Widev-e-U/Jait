#!/usr/bin/env node

/**
 * Jait Gateway CLI — the single entry point for `npm install -g @jait/gateway`.
 *
 * Usage:
 *   jait                     Start the gateway with defaults
 *   jait start               Start the gateway in the background
 *   jait stop                Stop the background gateway
 *   jait status              Check if the gateway is running
 *   jait doctor              Run local diagnostics
 *   jait reset               Wipe all data
 *   jait --port 9000         Use a custom port
 *   jait --host 127.0.0.1   Bind to specific host
 *   jait --help              Show help
 *   jait --version           Show version
 *   jait daemon install      Install systemd user service (Linux)
 *   jait daemon start        Start the service
 *   jait daemon stop         Stop the service
 *   jait daemon restart      Restart the service
 *   jait daemon status       Show service status
 *   jait daemon uninstall    Remove the systemd service
 *   jait daemon logs         Tail service logs
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, openSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
);

// ── Constants ───────────────────────────────────────────────────────

const SERVICE_NAME = "jait-gateway";
const JAIT_DIR = join(homedir(), ".jait");
const ENV_PATH = join(JAIT_DIR, ".env");
const LOG_PATH = join(JAIT_DIR, "gateway.log");
const ERR_LOG_PATH = join(JAIT_DIR, "gateway.err.log");
const PID_PATH = join(JAIT_DIR, "jait.pid");
const LEGACY_PID_PATH = join(JAIT_DIR, "gateway.pid");

function systemdUnitDir() {
  return join(homedir(), ".config", "systemd", "user");
}

function systemdUnitPath() {
  return join(systemdUnitDir(), `${SERVICE_NAME}.service`);
}

// ── Helpers ─────────────────────────────────────────────────────────

function printBanner() {
  const v = pkg.version;
  console.log(`
     ██╗ █████╗ ██╗████████╗
     ██║██╔══██╗██║╚══██╔══╝
     ██║███████║██║   ██║
██   ██║██╔══██║██║   ██║
╚█████╔╝██║  ██║██║   ██║
 ╚════╝ ╚═╝  ╚═╝╚═╝   ╚═╝   v${v}
`);
}

function printHelp() {
  printBanner();
  console.log(`Usage: jait [options]
       jait <command> [options]

Commands:
  start              Start the gateway in the background
  stop               Stop the background gateway
  status             Check if the gateway is running
  doctor             Run local diagnostics
  reset              Wipe all data (~/.jait)
  daemon <cmd>       Manage systemd service (Linux only)

Options:
  --port <number>    Port to listen on            (default: 8000, env: PORT)
  --host <address>   Address to bind to           (default: 0.0.0.0, env: HOST)
  --env  <path>      Path to .env file            (auto-detected)
  --version, -v      Show version number
  --help, -h         Show this help message

Daemon commands (Linux systemd):
  daemon install     Install systemd user service (auto-starts on boot)
  daemon uninstall   Remove systemd user service
  daemon start       Start the service
  daemon stop        Stop the service
  daemon restart     Restart the service
  daemon status      Show service status + health check
  daemon logs        Tail service logs (journalctl)

Environment files are loaded in order (first found wins):
  1. --env flag path
  2. ./.env  (current directory)
  3. ~/.jait/.env

All configuration can also be set via environment variables.
See https://github.com/Widev-e-U/Jait for full documentation.
`);
}

function run(cmd, { silent = false } = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: silent ? "pipe" : "inherit",
    });
  } catch (err) {
    if (silent) return err.stdout || "";
    throw err;
  }
}

function runSilent(cmd) {
  return run(cmd, { silent: true }).trim();
}

function cleanupPidFile(pidPath) {
  try { unlinkSync(pidPath); } catch {}
}

function getTrackedProcess() {
  for (const pidPath of [PID_PATH, LEGACY_PID_PATH]) {
    if (!existsSync(pidPath)) continue;

    const pid = readFileSync(pidPath, "utf8").trim();
    if (!pid) {
      cleanupPidFile(pidPath);
      continue;
    }

    if (isProcessRunning(pid)) {
      return { pid, pidPath };
    }

    cleanupPidFile(pidPath);
  }

  return null;
}

// ── Cross-platform commands ─────────────────────────────────────────

function healthCheck(port) {
  return new Promise((resolveP) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(port) }, () => {
      // Connected — send a minimal HTTP request
      socket.write(`GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);

      let data = "";
      socket.on("data", (chunk) => { data += chunk.toString(); });
      socket.on("end", () => {
        socket.destroy();
        // Parse HTTP response body (after blank line)
        const bodyStart = data.indexOf("\r\n\r\n");
        if (bodyStart < 0) return resolveP(null);
        const body = data.slice(bodyStart + 4);
        try { resolveP(JSON.parse(body)); } catch { resolveP(null); }
      });
    });
    socket.on("error", () => resolveP(null));
    socket.setTimeout(3000, () => { socket.destroy(); resolveP(null); });
  });
}

function isPortReachable(port) {
  return new Promise((resolveP) => {
    const socket = createConnection({ host: "127.0.0.1", port: Number(port) }, () => {
      socket.destroy();
      resolveP(true);
    });

    socket.on("error", () => resolveP(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolveP(false);
    });
  });
}

function sleep(ms) {
  return new Promise((resolveP) => setTimeout(resolveP, ms));
}

async function waitForBackgroundStart(pid, port, { timeoutMs = 5000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return { ok: false, reason: "exit" };
    }

    const health = await healthCheck(port);
    if (health) {
      return { ok: true, health };
    }

    await sleep(pollMs);
  }

  if (!isProcessRunning(pid)) {
    return { ok: false, reason: "exit" };
  }

  return { ok: false, reason: "timeout" };
}

async function cmdStatus(port) {
  printBanner();
  port = port || process.env.PORT || "8000";

  const tracked = getTrackedProcess();
  const pid = tracked?.pid ?? null;

  const health = await healthCheck(port);
  if (health) {
    console.log(`  Status:   running`);
    if (pid) console.log(`  PID:      ${pid}`);
    console.log(`  Port:     ${port}`);
    console.log(`  Version:  ${health.version}`);
    console.log(`  Healthy:  ${health.healthy ? "yes" : "no"}`);
    console.log(`  Uptime:   ${health.uptime}s`);
  } else {
    const reachable = await isPortReachable(port);
    console.log(`  Status:   not running`);
    console.log(`  Port:     ${port} (checked)`);
    if (pid) {
      console.log(`  PID:      ${pid} (process exists but not responding)`);
    } else if (reachable) {
      console.log(`  Health:   timed out on /health`);
      console.log(`  Note:     another process is listening on port ${port}`);
    }
  }
  console.log("");
}

async function cmdDoctor({ envPath, envLoaded }) {
  printBanner();
  if (envLoaded) {
    console.log(`  Config loaded from ${envLoaded}`);
  }
  console.log("");

  let doctorModule;
  try {
    doctorModule = await import("../dist/cli/doctor.js");
  } catch (err) {
    console.error("  Failed to load doctor diagnostics module from dist.");
    console.error("  Build the gateway package first so the CLI can import compiled diagnostics.");
    console.error(`  ${err.message}`);
    console.log("");
    process.exit(1);
  }

  const report = await doctorModule.runDoctorDiagnostics({
    env: process.env,
    envPath: envLoaded || envPath || null,
    healthCheck: (port) => healthCheck(port),
  });

  for (const check of report.checks) {
    const marker = check.status === "pass"
      ? "PASS"
      : check.status === "warn"
        ? "WARN"
        : "FAIL";
    console.log(`  [${marker}] ${check.label}: ${check.summary}`);
    for (const detail of check.details ?? []) {
      console.log(`         ${detail}`);
    }
  }

  console.log("");
  console.log(
    `  Summary: ${report.counts.pass} passed, ${report.counts.warn} warnings, ${report.counts.fail} failed`,
  );
  console.log(`  Result:  ${report.ok ? "ok" : "issues found"}`);
  console.log("");

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function cmdStart(cliFlags) {
  printBanner();
  const port = cliFlags.port || process.env.PORT || "8000";

  // Check if already running
  const tracked = getTrackedProcess();
  if (tracked) {
    if (await healthCheck(port)) {
      console.log(`  Jait is already running (PID ${tracked.pid}).`);
      console.log(`  Run 'jait stop' first, or 'jait status' for details.`);
      console.log("");
      process.exit(1);
    }

    console.error(`  A tracked Jait process already exists (PID ${tracked.pid}) but is not healthy.`);
    console.error(`  Run 'jait stop' or inspect ${LOG_PATH} before starting a new instance.`);
    console.log("");
    process.exit(1);
  }

  if (await isPortReachable(port)) {
    console.error(`  Port ${port} is already in use.`);
    console.error(`  A gateway or another process is listening but not responding to /health.`);
    console.error(`  Stop the existing process or start Jait on a different port with 'jait start --port <port>'.`);
    console.log("");
    process.exit(1);
  }

  mkdirSync(JAIT_DIR, { recursive: true });

  const jaitBin = resolve(__dirname, "jait.mjs");
  const childArgs = [jaitBin];
  if (cliFlags.port) childArgs.push("--port", String(cliFlags.port));
  if (cliFlags.host) childArgs.push("--host", cliFlags.host);
  if (cliFlags.envPath) childArgs.push("--env", cliFlags.envPath);

  const logFd = openSync(LOG_PATH, "a");
  const errFd = openSync(ERR_LOG_PATH, "a");

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ["ignore", logFd, errFd],
    env: { ...process.env, __JAIT_BACKGROUND: "1" },
    windowsHide: true,
  });

  writeFileSync(PID_PATH, String(child.pid), "utf8");
  child.unref();

  const started = await waitForBackgroundStart(child.pid, port);
  if (!started.ok) {
    cleanupPidFile(PID_PATH);
    console.error(`  Jait failed to become healthy on port ${port}.`);
    if (started.reason === "exit") {
      console.error(`  The background process exited during startup.`);
    } else {
      console.error(`  The background process did not answer /health within 5 seconds.`);
    }
    console.error(`  Logs: ${LOG_PATH}`);
    console.log("");
    process.exit(1);
  }

  console.log(`  Jait started in background (PID ${child.pid}).`);
  console.log(`  Logs: ${LOG_PATH}`);
  console.log(`  Run 'jait status' to check health.`);
  console.log(`  Run 'jait stop' to stop the gateway.`);
  console.log("");
}

async function cmdStop() {
  printBanner();

  const port = process.env.PORT || flags.port || "8000";

  // Case 1: Process tracked via PID file
  const tracked = getTrackedProcess();
  if (tracked) {
    const { pid, pidPath } = tracked;
    try {
      if (platform() === "win32") {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } else {
        process.kill(Number(pid), "SIGTERM");
      }
      console.log(`  Sent stop signal to PID ${pid}.`);
    } catch (err) {
      console.error(`  Failed to stop process ${pid}: ${err.message}`);
    }
    cleanupPidFile(pidPath);
    console.log("");
    return;
  }

  // Case 2: systemd unit is active
  if (platform() === "linux") {
    let unitActive = false;
    try {
      const status = runSilent(`systemctl --user is-active ${SERVICE_NAME} 2>/dev/null`);
      if (status.trim() === "active") {
        console.log(`  No PID file found. Stopping via systemd...`);
        try {
          run(`systemctl --user stop ${SERVICE_NAME}`, { silent: true });
          console.log(`  ${SERVICE_NAME} stopped.`);
          console.log("");
          return;
        } catch (err) {
          console.error(`  Failed to stop via systemd: ${err.message}`);
        }
        unitActive = true;
      }
    } catch {}

    if (!unitActive) {
      // Case 3: check if port is actually answering /health — kill that process
      const health = await healthCheck(port);
      if (health) {
        console.log(`  No PID file found, but gateway is healthy on port ${port}.`);

        // Find the PID listening on the port
        let targetPids = [];
        try {
          const lsofOut = runSilent(
            `lsof -ti:${port} 2>/dev/null`
          );
          targetPids = lsofOut
            ? lsofOut.split("\n").filter(Boolean).map(Number)
            : [];
        } catch {}

        // Also try ss/fuser as fallback
        if (targetPids.length === 0) {
          try {
            const fuserOut = runSilent(
              `fuser ${port}/tcp 2>/dev/null`
            );
            targetPids = fuserOut
              ? fuserOut.split(/\s+/).map(Number)
              : [];
          } catch {}
        }

        let stopped = false;
        for (const pid of targetPids) {
          const exePath = "/proc/" + pid + "/exe";
          try {
            if (!existsSync(exePath)) continue;
            const exeTarget = readFileSync(exePath, "utf8");
            if (exeTarget.includes("node") || exeTarget.includes("jait")) {
              try {
                process.kill(pid, "SIGTERM");
                console.log(`  Sent stop signal to PID ${pid}.`);
                stopped = true;
              } catch (err) {
                // already dead
              }
            }
          } catch {}
        }

        if (!stopped) {
          // Last resort: kill all processes on the port that are owned by this user
          for (const pid of targetPids) {
            try {
              process.kill(pid, "SIGTERM");
              console.log(`  Sent stop signal to PID ${pid}.`);
              stopped = true;
            } catch {}
          }
        }

        if (!stopped) {
          console.log(`  Could not find process to stop. Try 'sudo lsof -i :${port}' and kill manually.`);
        } else {
          // Clean up stale PID file if one exists (from a prior crash)
          for (const p of [PID_PATH, LEGACY_PID_PATH]) {
            if (existsSync(p)) cleanupPidFile(p);
          }
        }

        console.log("");
        return;
      }

      // Nothing found: no PID file, no systemd unit, port not in use
      const reachable = await isPortReachable(port);
      if (reachable) {
        console.log(`  Port ${port} is in use, but health check timed out.`);
        console.log(`  Another process may be listening. Run 'lsof -i :${port}' to inspect.`);
      } else {
        console.log("  Jait is not running (no PID file found).");
      }
      console.log("");
      return;
    }
    return;
  }

  // Non-Linux: port check fallback
  const reachable = await isPortReachable(port);
  if (reachable) {
    const health = await healthCheck(port);
    if (health) {
      console.log(`  No PID file found, but gateway is healthy on port ${port}.`);
      let targetPids = [];
      try {
        targetPids = runSilent(
          platform() === "darwin"
            ? `lsof -ti:${port} 2>/dev/null`
            : `netstat -tlnp | grep :${port} | awk '{print $NF}' | cut -d/ -f1 | uniq'`
        ).split("\n").filter(Boolean).map(Number);
      } catch {}

      for (const pid of targetPids) {
        try {
          process.kill(pid, "SIGTERM");
          console.log(`  Sent stop signal to PID ${pid}.`);
        } catch {}
      }
    } else {
      console.log(`  Port ${port} is in use but not a Jait health endpoint.`);
    }
  } else {
    console.log("  Jait is not running (no PID file found).");
    console.log("");
    process.exit(1);
  }
  console.log("");
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (answer) => { rl.close(); res(answer.trim()); }));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(p);
      else try { total += statSync(p).size; } catch {}
    }
  } catch {}
  return total;
}

async function cmdReset() {
  printBanner();

  if (!existsSync(JAIT_DIR)) {
    console.log(`  Nothing to reset — ${JAIT_DIR} does not exist.`);
    console.log("");
    process.exit(0);
  }

  // Show what will be deleted
  const size = dirSize(JAIT_DIR);
  console.log(`  This will permanently delete ALL Jait data:`);
  console.log(``);
  console.log(`    ${JAIT_DIR}  (${formatBytes(size)})`);
  console.log(``);
  console.log(`  This includes:`);
  console.log(`    • Database (accounts, sessions, threads, messages)`);
  console.log(`    • Configuration (.env, settings)`);
  console.log(`    • Logs`);
  console.log(`    • PID files`);
  console.log(``);

  const answer1 = await prompt("  Are you sure? Type 'yes' to continue: ");
  if (answer1.toLowerCase() !== "yes") {
    console.log("  Aborted.");
    console.log("");
    process.exit(0);
  }

  const answer2 = await prompt("  This cannot be undone. Type 'delete everything' to confirm: ");
  if (answer2.toLowerCase() !== "delete everything") {
    console.log("  Aborted.");
    console.log("");
    process.exit(0);
  }

  // Stop running instance first
  if (existsSync(PID_PATH)) {
    const pid = readFileSync(PID_PATH, "utf8").trim();
    if (isProcessRunning(pid)) {
      console.log(`  Stopping running instance (PID ${pid})...`);
      try {
        if (platform() === "win32") {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } else {
          process.kill(Number(pid), "SIGTERM");
        }
      } catch {}
    }
  }

  rmSync(JAIT_DIR, { recursive: true, force: true });
  console.log(``);
  console.log(`  Done. All data in ${JAIT_DIR} has been deleted.`);
  console.log(`  Run 'jait' to start fresh.`);
  console.log("");
}

// ── Daemon commands ─────────────────────────────────────────────────

function ensureLinux() {
  if (platform() !== "linux") {
    console.error("Error: daemon commands are only supported on Linux (systemd).");
    process.exit(1);
  }
}

function resolveNodePath() {
  try {
    return runSilent("which node");
  } catch {
    return "/usr/bin/node";
  }
}

function resolveJaitBin() {
  return resolve(__dirname, "jait.mjs");
}

function buildUnit({ port, host, envPath } = {}) {
  const nodePath = resolveNodePath();
  const jaitBin = resolveJaitBin();
  const envFlag = envPath && existsSync(envPath) ? envPath : ENV_PATH;

  const execArgs = [nodePath, jaitBin];
  if (existsSync(envFlag)) execArgs.push("--env", envFlag);
  if (port) execArgs.push("--port", String(port));
  if (host) execArgs.push("--host", host);

  const execStart = execArgs.join(" ");

  // Build a PATH that includes common global-bin locations so that
  // redeploy can find npm/node/jait, and codex can be discovered.
  const home = homedir();
  const extraPaths = [
    join(home, ".local", "bin"),
    join(home, ".npm-global", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].join(":");

  return `[Unit]
Description=Jait AI Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${execStart}
Environment=PATH=${extraPaths}
Environment=JAIT_UNIT=${SERVICE_NAME}
Restart=always
RestartSec=5
KillMode=process
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;
}

function daemonInstall(flags) {
  ensureLinux();
  const unitDir = systemdUnitDir();
  const unitPath = systemdUnitPath();

  // Ensure directories exist
  mkdirSync(unitDir, { recursive: true });
  mkdirSync(JAIT_DIR, { recursive: true });

  const unit = buildUnit(flags);
  writeFileSync(unitPath, unit, "utf8");
  console.log(`  Wrote ${unitPath}`);

  // Enable user lingering so service runs without active login session
  try {
    const user = runSilent("whoami");
    run(`loginctl enable-linger ${user}`, { silent: true });
    console.log(`  Enabled linger for user ${user}`);
  } catch {
    console.warn("  Warning: could not enable lingering (service may stop on logout)");
  }

  // Reload systemd and enable the service
  run(`systemctl --user daemon-reload`, { silent: true });
  run(`systemctl --user enable ${SERVICE_NAME}`, { silent: true });
  console.log(`  Service ${SERVICE_NAME} installed and enabled`);
  console.log("");
  console.log("  Run 'jait daemon start' to start the gateway.");
}

function daemonUninstall() {
  ensureLinux();
  const unitPath = systemdUnitPath();

  try {
    run(`systemctl --user stop ${SERVICE_NAME}`, { silent: true });
    run(`systemctl --user disable ${SERVICE_NAME}`, { silent: true });
  } catch { /* may not be running */ }

  if (existsSync(unitPath)) {
    unlinkSync(unitPath);
    run(`systemctl --user daemon-reload`, { silent: true });
    console.log(`  Removed ${unitPath}`);
  } else {
    console.log("  Service not installed.");
  }
}

function daemonStart() {
  ensureLinux();
  run(`systemctl --user start ${SERVICE_NAME}`);
  console.log(`  ${SERVICE_NAME} started`);
}

function daemonStop() {
  ensureLinux();
  run(`systemctl --user stop ${SERVICE_NAME}`);
  console.log(`  ${SERVICE_NAME} stopped`);
}

function daemonRestart() {
  ensureLinux();
  run(`systemctl --user restart ${SERVICE_NAME}`);
  console.log(`  ${SERVICE_NAME} restarted`);
}

function daemonStatus() {
  ensureLinux();

  // Show systemd status
  const status = runSilent(
    `systemctl --user show ${SERVICE_NAME} -p ActiveState,SubState,MainPID --no-pager`
  );
  const fields = {};
  for (const line of status.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) fields[line.slice(0, eq)] = line.slice(eq + 1);
  }

  const active = fields.ActiveState || "unknown";
  const sub = fields.SubState || "unknown";
  const pid = fields.MainPID || "0";

  console.log(`  Service:  ${SERVICE_NAME}`);
  console.log(`  State:    ${active} (${sub})`);
  console.log(`  PID:      ${pid === "0" ? "—" : pid}`);

  // Health check
  if (active === "active") {
    try {
      const port = process.env.PORT || "8000";
      const health = runSilent(
        `curl -sf --max-time 3 http://127.0.0.1:${port}/health`
      );
      const data = JSON.parse(health);
      console.log(`  Version:  ${data.version}`);
      console.log(`  Healthy:  ${data.healthy ? "yes" : "no"}`);
      console.log(`  Uptime:   ${data.uptime}s`);
    } catch {
      console.log("  Health:   unreachable (gateway may still be starting)");
    }
  }
}

function daemonLogs() {
  ensureLinux();
  try {
    execSync(
      `journalctl --user -u ${SERVICE_NAME} -f --no-pager -n 100`,
      { stdio: "inherit" },
    );
  } catch {
    // user Ctrl-C
  }
}

// ── Argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};

// Parse flags shared by subcommands
function parseSubcommandFlags(startIdx) {
  for (let i = startIdx; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) flags.port = args[++i];
    else if (args[i] === "--host" && args[i + 1]) flags.host = args[++i];
    else if (args[i] === "--env" && args[i + 1]) flags.envPath = args[++i];
  }
}

// Cross-platform top-level commands
if (args[0] === "status") {
  parseSubcommandFlags(1);
  await cmdStatus(flags.port);
  process.exit(0);
}

if (args[0] === "start") {
  parseSubcommandFlags(1);
  await cmdStart(flags);
  process.exit(0);
}

if (args[0] === "stop") {
  cmdStop();
  process.exit(0);
}

if (args[0] === "reset") {
  await cmdReset();
  process.exit(0);
}

let deferredDoctor = false;
if (args[0] === "doctor") {
  parseSubcommandFlags(1);
  deferredDoctor = true;
}

// Check for daemon subcommand first
if (args[0] === "daemon") {
  const subCmd = args[1];
  // Parse remaining flags for daemon install
  parseSubcommandFlags(2);

  printBanner();
  switch (subCmd) {
    case "install":
      daemonInstall(flags);
      break;
    case "uninstall":
      daemonUninstall();
      break;
    case "start":
      daemonStart();
      break;
    case "stop":
      daemonStop();
      break;
    case "restart":
      daemonRestart();
      break;
    case "status":
      daemonStatus();
      break;
    case "logs":
      daemonLogs();
      break;
    default:
      console.log("Unknown daemon command:", subCmd || "(none)");
      console.log("Available: install, uninstall, start, stop, restart, status, logs");
      process.exit(1);
  }
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  }
  if (arg === "--version" || arg === "-v") {
    console.log(pkg.version);
    process.exit(0);
  }
  if (arg === "--port" && args[i + 1]) {
    flags.port = args[++i];
  } else if (arg === "--host" && args[i + 1]) {
    flags.host = args[++i];
  } else if (arg === "--env" && args[i + 1]) {
    flags.envPath = args[++i];
  } else if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`);
    console.error("Run 'jait --help' for usage information.");
    process.exit(1);
  } else if (deferredDoctor && i === 0 && arg === "doctor") {
    continue;
  } else {
    console.error(`Unknown command: ${arg}`);
    console.error("Run 'jait --help' for usage information.");
    process.exit(1);
  }
}

// ── .env loading ────────────────────────────────────────────────────

function loadEnv(filePath) {
  if (!existsSync(filePath)) return false;
  const lines = readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Don't overwrite existing env vars
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

const envCandidates = [
  flags.envPath,
  resolve(process.cwd(), ".env"),
  join(homedir(), ".jait", ".env"),
].filter(Boolean);

let envLoaded = false;
for (const candidate of envCandidates) {
  if (loadEnv(candidate)) {
    envLoaded = candidate;
    break;
  }
}

// ── Apply CLI flags as env overrides ────────────────────────────────

if (flags.port) process.env.PORT = flags.port;
if (flags.host) process.env.HOST = flags.host;

// Mark that env was loaded externally so config.ts doesn't try again
process.env.__JAIT_CLI = "1";

if (deferredDoctor) {
  await cmdDoctor({ envPath: flags.envPath, envLoaded });
  process.exit(process.exitCode ?? 0);
}

// ── Start ───────────────────────────────────────────────────────────

printBanner();
if (envLoaded) {
  console.log(`  Config loaded from ${envLoaded}`);
}
console.log("");

const { main } = await import("../dist/index.js");
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
