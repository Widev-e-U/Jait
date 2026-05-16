import type { FastifyInstance } from "fastify";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { NetworkHost, NetworkScanResult, SshTestResult, GatewayNode } from "@jait/shared";
import type { WsControlPlane } from "../ws.js";
import { getLatestNetworkScan, setLatestNetworkScan } from "../tools/network-tools.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { createRequire } from "node:module";
import { scanNetwork } from "../lib/network-scan.js";
import type { SecretInputService } from "../services/secret-input.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../../package.json") as { version: string };

const __dirname = dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** TCP-connect probe to check if a single port is open. */
function probePort(ip: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port, timeout: timeoutMs });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

interface PtyProcess {
  onData(cb: (data: string) => void): void;
  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
}

type DeployAuthMethod = "key" | "password" | "auto";

interface DeployRunResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

function loadNodePty() {
  return require("node-pty") as {
    spawn: (
      command: string,
      args: string[],
      options: {
        name: string;
        cols: number;
        rows: number;
        cwd: string;
        env: Record<string, string | undefined>;
      },
    ) => PtyProcess;
  };
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, "");
}

function truncateDeployOutput(value: string): string {
  const clean = stripAnsi(value).replace(/\r/g, "").trim();
  if (clean.length > 200_000) return `...(truncated)\n${clean.slice(-200_000)}`;
  return clean;
}

function isPasswordFailure(output: string): boolean {
  return /permission denied|authentication failed|password was not provided|too many authentication failures/i.test(output);
}

function validateSshTargetPart(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required`;
  if (/[\s@'"]/u.test(value)) return `${label} cannot contain whitespace, quotes, or @`;
  return null;
}

export function buildNonInteractiveSshArgs(input: {
  ip: string;
  username: string;
  password: string | null;
  command: string;
}): string[] {
  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-o", "LogLevel=ERROR",
    "-o", "NumberOfPasswordPrompts=1",
    "-o", input.password ? "BatchMode=no" : "BatchMode=yes",
  ];
  if (input.password) {
    args.push(
      "-o", "PreferredAuthentications=password,keyboard-interactive",
      "-o", "PubkeyAuthentication=no",
    );
  }
  args.push(`${input.username}@${input.ip}`, input.command);
  return args;
}

export function buildNonInteractiveScpArgs(input: {
  ip: string;
  username: string;
  password: string | null;
  source: string;
  target: string;
}): string[] {
  const args = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-o", "LogLevel=ERROR",
    "-o", "NumberOfPasswordPrompts=1",
    "-o", input.password ? "BatchMode=no" : "BatchMode=yes",
  ];
  if (input.password) {
    args.push(
      "-o", "PreferredAuthentications=password,keyboard-interactive",
      "-o", "PubkeyAuthentication=no",
    );
  }
  args.push(input.source, `${input.username}@${input.ip}:${input.target}`);
  return args;
}

function runPtyCommand(input: {
  command: string;
  args: string[];
  password: string | null;
  stdinAfterAuth?: string;
  timeoutMs: number;
  onOutput?: (line: string) => void;
}): Promise<DeployRunResult> {
  return new Promise((resolve) => {
    const pty = loadNodePty().spawn(input.command, input.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: {
        ...process.env,
        SSH_ASKPASS: undefined,
        DISPLAY: undefined,
      },
    });
    let raw = "";
    let exitCode: number | null = null;
    let timedOut = false;
    let settled = false;
    let passwordSent = false;
    let stdinSent = false;
    let lastOutputLength = 0;

    const sendStdin = () => {
      if (stdinSent || !input.stdinAfterAuth) return;
      stdinSent = true;
      pty.write(input.stdinAfterAuth);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try { pty.kill("SIGTERM"); } catch {}
      setTimeout(() => finish(), 300);
    }, input.timeoutMs);

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        output: truncateDeployOutput(raw),
        exitCode,
        timedOut,
      });
    };

    const sendNewOutput = () => {
      if (!input.onOutput) return;
      const clean = truncateDeployOutput(raw);
      const next = clean.slice(lastOutputLength);
      lastOutputLength = clean.length;
      for (const line of next.split("\n").map((value) => value.trim()).filter(Boolean)) {
        if (!/password|passphrase/i.test(line)) input.onOutput(line);
      }
    };

    pty.onData((data) => {
      raw += data;
      const visible = stripAnsi(raw).replace(/\r/g, "");
      if (input.password && !passwordSent && /(?:password|passphrase).*:\s*$/im.test(visible)) {
        passwordSent = true;
        pty.write(`${input.password}\r`);
        setTimeout(sendStdin, 300);
        return;
      }
      sendNewOutput();
    });

    pty.onExit((event) => {
      exitCode = typeof event.exitCode === "number" ? event.exitCode : null;
      finish();
    });

    if (input.stdinAfterAuth) {
      setTimeout(sendStdin, input.password ? 1500 : 300);
    }
  });
}

async function requestDeployPassword(input: {
  secretInput?: SecretInputService;
  sessionId: string;
  title: string;
  prompt: string;
  requestedBy: string;
  secretKey: string;
}): Promise<string | null> {
  if (!input.secretInput) throw new Error("Secret input service is unavailable");
  return input.secretInput.requestSecret({
    sessionId: input.sessionId,
    title: input.title,
    prompt: input.prompt,
    requestedBy: input.requestedBy,
    rememberable: true,
    rememberLabel: input.prompt,
    secretType: "network-deploy-password",
    secretKey: input.secretKey,
    timeoutMs: 180_000,
  });
}

function buildRemoteSetupScript(input: {
  username: string;
  sudoMode: "root" | "nopass" | "password";
  sudoPassword: string | null;
}): string {
  return [
    "set -e",
    `SUDO_MODE=${shellQuote(input.sudoMode)}`,
    `SUDO_PASSWORD=${shellQuote(input.sudoPassword ?? "")}`,
    "run_priv() {",
    "  if [ \"$SUDO_MODE\" = 'root' ]; then",
    "    sh -c \"$1\"",
    "  elif [ \"$SUDO_MODE\" = 'nopass' ]; then",
    "    sudo -n sh -c \"$1\"",
    "  else",
    "    printf '%s\\n' \"$SUDO_PASSWORD\" | sudo -S -p '' sh -c \"$1\"",
    "  fi",
    "}",
    "chmod +x ~/.jait/jait-gateway",
    "[ -f ~/.jait/.env ] || cat > ~/.jait/.env <<'ENVEOF'",
    "PORT=8000",
    "HOST=0.0.0.0",
    "LOG_LEVEL=info",
    "CORS_ORIGIN=*",
    "ENVEOF",
    "service_file=\"${TMPDIR:-/tmp}/jait-gateway.service.$$\"",
    "cat > \"$service_file\" <<'SVCEOF'",
    "[Unit]",
    "Description=Jait Gateway",
    "After=network.target",
    "",
    "[Service]",
    `User=${input.username}`,
    "WorkingDirectory=%h/.jait",
    "ExecStart=%h/.jait/jait-gateway",
    "Restart=on-failure",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "SVCEOF",
    "run_priv \"install -m 0644 '$service_file' /etc/systemd/system/jait-gateway.service\"",
    "rm -f \"$service_file\"",
    "run_priv \"systemctl daemon-reload\"",
    "run_priv \"systemctl enable --now jait-gateway\"",
    "echo 'Jait Gateway deployed successfully'",
    "",
  ].join("\n");
}

async function runGuidedDeploy(input: {
  ip: string;
  username: string;
  authMethod: DeployAuthMethod;
  sessionId: string;
  secretInput?: SecretInputService;
}): Promise<{ ok: true; logs: string[]; url: string } | { ok: false; logs: string[]; error: string }> {
  const logs: string[] = [];
  const addLog = (line: string) => {
    if (!line.trim()) return;
    logs.push(line);
  };

  let sshPassword: string | null = null;
  const passwordKey = `${input.username}@${input.ip}:22`;

  if (input.authMethod === "password") {
    sshPassword = await requestDeployPassword({
      secretInput: input.secretInput,
      sessionId: input.sessionId,
      title: "SSH password",
      prompt: `Password for ${input.username}@${input.ip}`,
      requestedBy: "network.deploy",
      secretKey: passwordKey,
    });
    if (!sshPassword) return { ok: false, logs, error: "SSH password was not provided" };
  }

  addLog(`Connecting to ${input.username}@${input.ip}...`);
  let archResult = await runPtyCommand({
    command: "ssh",
    args: buildNonInteractiveSshArgs({
      ip: input.ip,
      username: input.username,
      password: sshPassword,
      command: "uname -m",
    }),
    password: sshPassword,
    timeoutMs: 30_000,
  });

  if (input.authMethod === "auto" && archResult.exitCode !== 0 && isPasswordFailure(archResult.output)) {
    sshPassword = await requestDeployPassword({
      secretInput: input.secretInput,
      sessionId: input.sessionId,
      title: "SSH password",
      prompt: `Password for ${input.username}@${input.ip}`,
      requestedBy: "network.deploy",
      secretKey: passwordKey,
    });
    if (!sshPassword) return { ok: false, logs, error: "SSH password was not provided" };
    archResult = await runPtyCommand({
      command: "ssh",
      args: buildNonInteractiveSshArgs({
        ip: input.ip,
        username: input.username,
        password: sshPassword,
        command: "uname -m",
      }),
      password: sshPassword,
      timeoutMs: 30_000,
    });
  }

  if (archResult.timedOut || archResult.exitCode !== 0) {
    return { ok: false, logs, error: archResult.output || "Unable to connect over SSH" };
  }

  const rawArch = archResult.output.split("\n").map((line) => line.trim()).filter(Boolean).pop() ?? "";
  const arch = rawArch === "x86_64" || rawArch === "amd64"
    ? "x64"
    : rawArch === "aarch64" || rawArch === "arm64"
      ? "arm64"
      : null;
  if (!arch) return { ok: false, logs, error: `Unsupported architecture: ${rawArch}` };
  addLog(`Detected linux-${arch}`);

  const tsEntry = resolve(__dirname, "../index.ts");
  const jsEntry = resolve(__dirname, "../index.js");
  const entry = existsSync(tsEntry) ? tsEntry : jsEntry;
  const cacheDir = `${process.env.TMPDIR ?? "/tmp"}/jait-deploy`;
  const outFile = `${cacheDir}/jait-gateway-${PKG_VERSION}-linux-${arch}`;
  addLog("[1/4] Compiling gateway binary...");
  await execAsync(`mkdir -p ${shellQuote(cacheDir)}`);
  if (existsSync(outFile)) {
    addLog(`Using cached binary (v${PKG_VERSION})`);
  } else {
    await execAsync([
      "bun", "build", "--compile",
      shellQuote(`--target=bun-linux-${arch}`),
      "--minify",
      shellQuote(entry),
      "--outfile",
      shellQuote(outFile),
    ].join(" "), { maxBuffer: 20 * 1024 * 1024 });
    addLog("Binary compiled");
  }

  addLog("[2/4] Preparing remote directory...");
  const mkdirResult = await runPtyCommand({
    command: "ssh",
    args: buildNonInteractiveSshArgs({
      ip: input.ip,
      username: input.username,
      password: sshPassword,
      command: "mkdir -p ~/.jait",
    }),
    password: sshPassword,
    timeoutMs: 30_000,
  });
  if (mkdirResult.timedOut || mkdirResult.exitCode !== 0) {
    return { ok: false, logs, error: mkdirResult.output || "Failed to prepare remote directory" };
  }

  addLog("[3/4] Transferring gateway binary...");
  const scpResult = await runPtyCommand({
    command: "scp",
    args: buildNonInteractiveScpArgs({
      ip: input.ip,
      username: input.username,
      password: sshPassword,
      source: outFile,
      target: "~/.jait/jait-gateway",
    }),
    password: sshPassword,
    timeoutMs: 120_000,
  });
  if (scpResult.timedOut || scpResult.exitCode !== 0) {
    return { ok: false, logs, error: scpResult.output || "Failed to transfer gateway binary" };
  }

  addLog("[4/4] Configuring service...");
  const sudoCheck = await runPtyCommand({
    command: "ssh",
    args: buildNonInteractiveSshArgs({
      ip: input.ip,
      username: input.username,
      password: sshPassword,
      command: "if [ \"$(id -u)\" -eq 0 ]; then echo root; elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then echo nopass; elif command -v sudo >/dev/null 2>&1; then echo password; else echo none; fi",
    }),
    password: sshPassword,
    timeoutMs: 30_000,
  });
  if (sudoCheck.timedOut || sudoCheck.exitCode !== 0) {
    return { ok: false, logs, error: sudoCheck.output || "Failed to inspect sudo access" };
  }
  const sudoMode = sudoCheck.output.split("\n").map((line) => line.trim()).filter(Boolean).pop();
  if (sudoMode === "none") {
    return { ok: false, logs, error: `${input.username} is not root and sudo is unavailable on the target` };
  }
  let sudoPassword = sshPassword;
  if (sudoMode === "password" && !sudoPassword) {
    sudoPassword = await requestDeployPassword({
      secretInput: input.secretInput,
      sessionId: input.sessionId,
      title: "Administrator password",
      prompt: `Sudo password for ${input.username}@${input.ip}`,
      requestedBy: "network.deploy",
      secretKey: `sudo:${passwordKey}`,
    });
    if (!sudoPassword) return { ok: false, logs, error: "Sudo password was not provided" };
  }

  const setupResult = await runPtyCommand({
    command: "ssh",
    args: buildNonInteractiveSshArgs({
      ip: input.ip,
      username: input.username,
      password: sshPassword,
      command: "bash -s",
    }),
    password: sshPassword,
    stdinAfterAuth: `${buildRemoteSetupScript({
      username: input.username,
      sudoMode: sudoMode as "root" | "nopass" | "password",
      sudoPassword,
    })}\x04`,
    timeoutMs: 60_000,
    onOutput: addLog,
  });
  if (setupResult.timedOut || setupResult.exitCode !== 0) {
    return { ok: false, logs, error: setupResult.output || "Failed to configure remote service" };
  }

  const url = `http://${input.ip}:8000`;
  addLog(`Gateway v${PKG_VERSION} deployed to ${input.ip}`);
  addLog(`Dashboard: ${url}`);
  return { ok: true, logs, url };
}

// ---------------------------------------------------------------------------
// DB helpers — persist and read scanned hosts
// ---------------------------------------------------------------------------

function persistHostsToDb(sqlite: SqliteDatabase, hosts: NetworkHost[], scannedAt: string): void {
  const upsert = sqlite.prepare(`
    INSERT INTO network_hosts (ip, mac, hostname, os_version, open_ports, ssh_reachable, agent_status, providers, first_seen_at, last_seen_at, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ip) DO UPDATE SET
      mac = excluded.mac,
      hostname = excluded.hostname,
      os_version = COALESCE(excluded.os_version, network_hosts.os_version),
      open_ports = excluded.open_ports,
      ssh_reachable = excluded.ssh_reachable,
      agent_status = excluded.agent_status,
      providers = excluded.providers,
      last_seen_at = excluded.last_seen_at,
      scanned_at = excluded.scanned_at
  `);
  for (const h of hosts) {
    upsert.run(
      h.ip,
      h.mac ?? null,
      h.hostname ?? null,
      h.osVersion ?? null,
      JSON.stringify(h.openPorts),
      h.sshReachable ? 1 : 0,
      h.agentStatus,
      h.providers?.length ? JSON.stringify(h.providers) : null,
      scannedAt,
      h.lastSeen,
      scannedAt,
    );
  }
}

interface DbHostRow {
  ip: string;
  mac: string | null;
  hostname: string | null;
  os_version: string | null;
  open_ports: string;
  ssh_reachable: number;
  agent_status: string;
  providers: string | null;
  first_seen_at: string;
  last_seen_at: string;
  scanned_at: string;
}

function readHostsFromDb(sqlite: SqliteDatabase): { hosts: NetworkHost[]; scannedAt: string | null } {
  const rows = sqlite.prepare(
    "SELECT * FROM network_hosts ORDER BY last_seen_at DESC"
  ).all() as DbHostRow[];
  let scannedAt: string | null = null;
  const hosts: NetworkHost[] = rows.map((r) => {
    if (!scannedAt || r.scanned_at > scannedAt) scannedAt = r.scanned_at;
    return {
      ip: r.ip,
      mac: r.mac,
      hostname: r.hostname,
      vendor: null,
      isRouter: false,
      alive: true,
      openPorts: JSON.parse(r.open_ports) as number[],
      sshReachable: r.ssh_reachable === 1,
      agentStatus: r.agent_status as NetworkHost["agentStatus"],
      osVersion: r.os_version,
      providers: r.providers ? (JSON.parse(r.providers) as string[]) : undefined,
      lastSeen: r.last_seen_at,
    };
  });
  return { hosts, scannedAt };
}

// ---------------------------------------------------------------------------
// In-memory node registry (gateway mesh)
// ---------------------------------------------------------------------------

const knownNodes = new Map<string, GatewayNode>();

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cached gateway node — expensive to compute (shell execs + provider checks),
// so we build it once and refresh every 5 minutes in the background.
// ---------------------------------------------------------------------------

interface CachedGatewayNode {
  node: {
    id: string;
    type: "gateway";
    name: string;
    platform: string;
    ip: string;
    version: string;
    osVersion: string | null;
    providers: string[];
    online: true;
  };
  builtAt: number;
}

let cachedGateway: CachedGatewayNode | null = null;
const GATEWAY_CACHE_TTL = 5 * 60_000; // 5 minutes

async function buildGatewayNode(providerRegistry?: import("../providers/registry.js").ProviderRegistry): Promise<CachedGatewayNode["node"]> {
  const ifaces = networkInterfaces();
  let gatewayIp = "127.0.0.1";
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        gatewayIp = entry.address;
        break;
      }
    }
    if (gatewayIp !== "127.0.0.1") break;
  }

  let osVersion: string | null = null;
  try {
    if (platform() === "win32") {
      const { stdout } = await execAsync("cmd /c ver", { timeout: 3000 });
      osVersion = stdout.trim().replace(/^\s*\n+/, "") || null;
    } else if (platform() === "darwin") {
      const { stdout } = await execAsync("sw_vers -productVersion", { timeout: 3000 });
      osVersion = `macOS ${stdout.trim()}`;
    } else {
      const { stdout } = await execAsync("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'", { timeout: 3000 });
      osVersion = stdout.trim() || null;
    }
  } catch {}

  const gatewayProviders: string[] = [];
  if (providerRegistry) {
    for (const p of providerRegistry.list()) {
      try { await p.checkAvailability(); } catch {}
      if (p.info.available) gatewayProviders.push(p.id);
    }
  }

  const name = platform() === "win32"
    ? process.env.COMPUTERNAME ?? "Gateway"
    : await execAsync("hostname").then(r => r.stdout.trim()).catch(() => "Gateway");

  return {
    id: "gateway",
    type: "gateway" as const,
    name,
    platform: platform() === "win32" ? "windows" : platform() === "darwin" ? "macos" : "linux",
    ip: gatewayIp,
    version: PKG_VERSION,
    osVersion,
    providers: gatewayProviders,
    online: true,
  };
}

async function getGatewayNode(providerRegistry?: import("../providers/registry.js").ProviderRegistry): Promise<CachedGatewayNode["node"]> {
  const now = Date.now();
  if (cachedGateway && now - cachedGateway.builtAt < GATEWAY_CACHE_TTL) {
    return cachedGateway.node;
  }
  const node = await buildGatewayNode(providerRegistry);
  cachedGateway = { node, builtAt: now };
  return node;
}

export function registerNetworkRoutes(
  app: FastifyInstance,
  ws?: WsControlPlane,
  sqlite?: SqliteDatabase,
  providerRegistry?: import("../providers/registry.js").ProviderRegistry,
  secretInput?: SecretInputService,
) {
  // ---- GET /api/network/interfaces — local NIC info ----
  app.get("/api/network/interfaces", async () => {
    const ifaces = networkInterfaces();
    const result: { name: string; ip: string; mac: string; netmask: string; internal: boolean }[] = [];
    for (const [name, entries] of Object.entries(ifaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.family === "IPv4") {
          result.push({ name, ip: entry.address, mac: entry.mac, netmask: entry.netmask, internal: entry.internal });
        }
      }
    }
    return { interfaces: result };
  });

  // ---- GET /api/network/scan/latest — return cached scan or DB data ----
  app.get("/api/network/scan/latest", async () => {
    const cached = getLatestNetworkScan();
    if (cached) return cached;
    // Fall back to DB if no in-memory cache yet
    if (sqlite) {
      const { hosts, scannedAt } = readHostsFromDb(sqlite);
      if (hosts.length > 0) {
        return { subnet: "", hosts, routerIp: null, scannedAt: scannedAt ?? new Date().toISOString(), durationMs: 0 };
      }
    }
    return { ok: false, message: "No scan results yet. Trigger a scan or wait for the scheduled job." };
  });

  // ---- POST /api/network/scan — ARP scan + port probe ----
  app.post("/api/network/scan", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetSubnet = body["subnet"] as string | undefined;
    const deep = body["deep"] === undefined ? true : Boolean(body["deep"]);
    const includeIps = Array.isArray(body["includeIps"])
      ? body["includeIps"].filter((value): value is string => typeof value === "string")
      : [];

    try {
      const result: NetworkScanResult = await scanNetwork({ subnet: targetSubnet, deep, includeIps });
      setLatestNetworkScan(result as unknown as import("../tools/network-tools.js").NetworkScanData);

      if (sqlite) {
        try {
          persistHostsToDb(sqlite, result.hosts, result.scannedAt);
        } catch (err) {
          console.error("Failed to persist network hosts to DB:", err);
        }
      }

      return result;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Network scan failed" };
    }
  });

  // ---- POST /api/network/ssh/test — test SSH connectivity ----
  app.post("/api/network/ssh/test", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ip = String(body["ip"] ?? "").trim();
    const port = Number(body["port"] ?? 22);

    if (!ip) return { error: "IP address required" };

    const reachable = await probePort(ip, port, 3000);
    const result: SshTestResult = {
      ip,
      reachable,
      authMethods: reachable ? ["password", "publickey"] : [],
    };

    if (reachable) {
      // Try to get platform info via SSH banner
      try {
        const banner = await new Promise<string>((resolve) => {
          const socket = createConnection({ host: ip, port, timeout: 3000 });
          let data = "";
          socket.on("data", (chunk) => { data += chunk.toString(); socket.destroy(); resolve(data); });
          socket.on("timeout", () => { socket.destroy(); resolve(""); });
          socket.on("error", () => { socket.destroy(); resolve(""); });
        });
        if (banner) result.platform = banner.trim().slice(0, 100);
      } catch {
        // ignore
      }
    }

    return result;
  });

  // ---- POST /api/network/ssh/enable — guide/enable SSH on a target ----
  app.post("/api/network/ssh/enable", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetPlatform = String(body["platform"] ?? "").trim();

    // Return platform-specific instructions for enabling SSH
    const instructions: Record<string, { command: string; steps: string[] }> = {
      windows: {
        command: "Add-WindowsCapability -Online -Name OpenSSH.Server; Start-Service sshd; Set-Service -Name sshd -StartupType Automatic",
        steps: [
          "Open PowerShell as Administrator on the target machine",
          "Run: Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
          "Run: Start-Service sshd",
          "Run: Set-Service -Name sshd -StartupType Automatic",
          'Run: New-NetFirewallRule -Name "OpenSSH-Server" -DisplayName "OpenSSH Server" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22',
        ],
      },
      linux: {
        command: "sudo apt-get install -y openssh-server && sudo systemctl enable --now sshd",
        steps: [
          "Run: sudo apt-get install -y openssh-server",
          "Run: sudo systemctl enable --now sshd",
          "Run: sudo ufw allow 22/tcp (if UFW is active)",
        ],
      },
      macos: {
        command: "sudo systemsetup -setremotelogin on",
        steps: [
          "Open System Preferences → Sharing → enable Remote Login",
          "Or run: sudo systemsetup -setremotelogin on",
        ],
      },
    };

    const key = targetPlatform.toLowerCase();
    const info = instructions[key] ?? instructions["linux"]!;

    return { platform: key || "linux", ...info };
  });

  // ---- POST /api/network/deploy — deploy gateway binary to a remote host ----
  app.post("/api/network/deploy", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ip = String(body["ip"] ?? "").trim();
    const username = String(body["username"] ?? "root").trim();
    const sessionId = String(body["sessionId"] ?? "default").trim() || "default";
    const authMethodValue = String(body["authMethod"] ?? "auto").trim();
    const authMethod: DeployAuthMethod = authMethodValue === "password" || authMethodValue === "key"
      ? authMethodValue
      : "auto";

    if (!ip) {
      return reply.status(400).send({ error: "IP address is required" });
    }
    const ipError = validateSshTargetPart(ip, "IP address");
    const usernameError = validateSshTargetPart(username, "username");
    if (ipError || usernameError) {
      return reply.status(400).send({ error: ipError ?? usernameError });
    }

    try {
      const result = await runGuidedDeploy({
        ip,
        username,
        authMethod,
        sessionId,
        secretInput,
      });
      if (!result.ok) {
        return reply.status(500).send(result);
      }
      return result;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : "Deployment failed" });
    }
  });

  // ---- GET /api/network/nodes — list known gateway mesh nodes ----
  app.get("/api/network/nodes", async () => {
    return { nodes: [...knownNodes.values()] };
  });

  // ---- POST /api/network/nodes/register — a remote gateway node announces itself ----
  app.post("/api/network/nodes/register", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const node: GatewayNode = {
      id: String(body["id"] ?? ""),
      ip: String(body["ip"] ?? ""),
      hostname: (body["hostname"] as string) ?? null,
      platform: String(body["platform"] ?? "unknown"),
      version: String(body["version"] ?? "unknown"),
      status: "online",
      lastSeen: new Date().toISOString(),
      capabilities: Array.isArray(body["capabilities"]) ? body["capabilities"].map(String) : [],
    };
    if (!node.id || !node.ip) return { error: "id and ip are required" };
    knownNodes.set(node.id, node);
    return { ok: true, node };
  });

  // ---- GET /api/network/devices — registered companion devices ----
  app.get("/api/network/devices", async () => {
    // Proxy to existing mobile device registry
    // This unifies the view of all connected devices in the Network panel
    return { devices: [] }; // Will be wired via deps if needed
  });

  // ---- GET /api/network/topology — unified graph data for the force-graph visualization ----
  app.get("/api/network/topology", async () => {
    // Gateway node — cached, refreshed every 5 min
    const gatewayNode = await getGatewayNode(providerRegistry);

    // Connected FsNode devices
    const connectedDevices = (ws?.getFsNodes() ?? []).filter(n => !n.isGateway).map(n => ({
      id: `device-${n.id}`,
      type: "device" as const,
      name: n.name,
      platform: n.platform,
      providers: n.providers ?? [],
      online: true,
      registeredAt: n.registeredAt,
    }));

    // Scanned network hosts — prefer in-memory cache, fall back to DB
    const scan = getLatestNetworkScan();
    let hostSource: { ip: string; mac: string | null; hostname: string | null; isRouter?: boolean; alive?: boolean; openPorts: number[]; sshReachable: boolean; agentStatus: string; osVersion?: string | null; providers?: string[] }[] =
      scan?.hosts ?? [];
    let scannedAt: string | null = scan?.scannedAt ?? null;

    if (hostSource.length === 0 && sqlite) {
      const dbData = readHostsFromDb(sqlite);
      hostSource = dbData.hosts;
      scannedAt = dbData.scannedAt;
    }

    const routerIp = scan?.routerIp ?? null;
    const scannedHosts = hostSource.map(h => ({
      id: `host-${h.ip}`,
      type: "host" as const,
      name: h.isRouter || h.ip === routerIp ? (h.hostname ?? "Router") : (h.hostname ?? h.ip),
      ip: h.ip,
      mac: h.mac,
      isRouter: Boolean(h.isRouter || h.ip === routerIp),
      openPorts: h.openPorts,
      sshReachable: h.sshReachable,
      agentStatus: h.agentStatus,
      osVersion: h.osVersion ?? null,
      providers: h.providers ?? [],
      online: h.alive ?? true,
    }));

    // Known gateway mesh nodes
    const meshNodes = [...knownNodes.values()].map(n => ({
      id: `mesh-${n.id}`,
      type: "mesh" as const,
      name: n.hostname ?? n.ip,
      ip: n.ip,
      platform: n.platform,
      version: n.version,
      status: n.status,
      online: n.status === "online",
    }));

    return {
      gateway: gatewayNode,
      devices: connectedDevices,
      hosts: scannedHosts,
      meshNodes,
      routerIp,
      scannedAt,
    };
  });
}
