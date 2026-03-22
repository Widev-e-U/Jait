#!/usr/bin/env node

/**
 * Jait Gateway CLI — the single entry point for `npm install -g @jait/gateway`.
 *
 * Usage:
 *   jait                     Start the gateway with defaults
 *   jait start               Start the gateway in the background
 *   jait stop                Stop the background gateway
 *   jait status              Check if the gateway is running
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

import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, openSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import { createConnection } from "node:net";

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

async function cmdStatus(port) {
  printBanner();
  port = port || process.env.PORT || "8000";

  // Check PID file
  let pid = null;
  if (existsSync(PID_PATH)) {
    pid = readFileSync(PID_PATH, "utf8").trim();
    const alive = isProcessRunning(pid);
    if (!alive) {
      // Stale PID file
      try { unlinkSync(PID_PATH); } catch {}
      pid = null;
    }
  }

  const health = await healthCheck(port);
  if (health) {
    console.log(`  Status:   running`);
    if (pid) console.log(`  PID:      ${pid}`);
    console.log(`  Port:     ${port}`);
    console.log(`  Version:  ${health.version}`);
    console.log(`  Healthy:  ${health.healthy ? "yes" : "no"}`);
    console.log(`  Uptime:   ${health.uptime}s`);
  } else {
    console.log(`  Status:   not running`);
    console.log(`  Port:     ${port} (checked)`);
    if (pid) {
      console.log(`  PID:      ${pid} (process exists but not responding)`);
    }
  }
  console.log("");
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function cmdStart(cliFlags) {
  printBanner();
  // Check if already running
  if (existsSync(PID_PATH)) {
    const pid = readFileSync(PID_PATH, "utf8").trim();
    if (isProcessRunning(pid)) {
      console.log(`  Jait is already running (PID ${pid}).`);
      console.log(`  Run 'jait stop' first, or 'jait status' for details.`);
      console.log("");
      process.exit(1);
    }
    // Stale PID file
    try { unlinkSync(PID_PATH); } catch {}
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
  });

  writeFileSync(PID_PATH, String(child.pid), "utf8");
  child.unref();

  console.log(`  Jait started in background (PID ${child.pid}).`);
  console.log(`  Logs: ${LOG_PATH}`);
  console.log(`  Run 'jait status' to check health.`);
  console.log(`  Run 'jait stop' to stop the gateway.`);
  console.log("");
}

function cmdStop() {
  printBanner();
  if (!existsSync(PID_PATH)) {
    console.log("  Jait is not running (no PID file found).");
    console.log("");
    process.exit(1);
  }

  const pid = readFileSync(PID_PATH, "utf8").trim();

  if (!isProcessRunning(pid)) {
    console.log(`  Process ${pid} is not running (stale PID file).`);
    try { unlinkSync(PID_PATH); } catch {}
    console.log("");
    process.exit(0);
  }

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

  try { unlinkSync(PID_PATH); } catch {}
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
  cmdStart(flags);
  process.exit(0);
}

if (args[0] === "stop") {
  cmdStop();
  process.exit(0);
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
