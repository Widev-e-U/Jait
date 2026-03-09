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
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
);

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

Options:
  --port <number>    Port to listen on            (default: 8000, env: PORT)
  --host <address>   Address to bind to           (default: 0.0.0.0, env: HOST)
  --env  <path>      Path to .env file            (auto-detected)
  --version, -v      Show version number
  --help, -h         Show this help message

Environment files are loaded in order (first found wins):
  1. --env flag path
  2. ./.env  (current directory)
  3. ~/.jait/.env

All configuration can also be set via environment variables.
See https://github.com/JakobWl/Jait for full documentation.
`);
}

// ── Argument parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};

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
