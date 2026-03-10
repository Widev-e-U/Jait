#!/usr/bin/env node

/**
 * Jait Gateway CLI — the single entry point for `npm install -g @jait/gateway`.
 *
 * Usage:
 *   jait                     Start the gateway with defaults
 *   jait --port 9000         Use a custom port
 *   jait --host 127.0.0.1   Bind to specific host
 *   jait --help              Show help
 *   jait --version           Show version
 *   jait daemon install      Install systemd user service
 *   jait daemon start        Start the service
 *   jait daemon stop         Stop the service
 *   jait daemon restart      Restart the service
 *   jait daemon status       Show service status
 *   jait daemon uninstall    Remove the systemd service
 *   jait daemon logs         Tail service logs
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

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
       jait daemon <command>

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
See https://github.com/JakobWl/Jait for full documentation.
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

  return `[Unit]
Description=Jait AI Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${execStart}
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

// Check for daemon subcommand first
if (args[0] === "daemon") {
  const subCmd = args[1];
  // Parse remaining flags for daemon install
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) flags.port = args[++i];
    else if (args[i] === "--host" && args[i + 1]) flags.host = args[++i];
    else if (args[i] === "--env" && args[i + 1]) flags.envPath = args[++i];
  }

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
