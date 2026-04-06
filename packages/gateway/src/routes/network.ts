import type { FastifyInstance } from "fastify";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { platform, tmpdir } from "node:os";
import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { NetworkHost, NetworkScanResult, SshTestResult, GatewayNode } from "@jait/shared";
import type { WsControlPlane } from "../ws.js";
import { getLatestNetworkScan, setLatestNetworkScan } from "../tools/network-tools.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { createRequire } from "node:module";
import { scanNetwork } from "../lib/network-scan.js";

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

export function buildSshAuthArgs(authMethod: string, password: string): string[] {
  if (authMethod === "password" && password) {
    return [
      "-o", "BatchMode=no",
      "-o", "PreferredAuthentications=password,keyboard-interactive",
      "-o", "PubkeyAuthentication=no",
      "-o", "NumberOfPasswordPrompts=1",
    ];
  }
  return ["-o", "BatchMode=yes"];
}

function createAskpassEnv(password: string): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const askpassDir = mkdtempSync(join(tmpdir(), "jait-ssh-askpass-"));
  const askpassPath = join(askpassDir, "askpass.sh");
  writeFileSync(askpassPath, "#!/bin/sh\nprintf '%s\\n' \"$JAIT_DEPLOY_SSH_PASSWORD\"\n");
  chmodSync(askpassPath, 0o700);
  return {
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || "jait-askpass",
      SSH_ASKPASS: askpassPath,
      SSH_ASKPASS_REQUIRE: "force",
      JAIT_DEPLOY_SSH_PASSWORD: password,
    },
    cleanup: () => {
      rmSync(askpassDir, { force: true, recursive: true });
    },
  };
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

export function registerNetworkRoutes(app: FastifyInstance, ws?: WsControlPlane, sqlite?: SqliteDatabase, providerRegistry?: import("../providers/registry.js").ProviderRegistry) {
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
    const authMethod = String(body["authMethod"] ?? "publickey").trim();
    const password = String(body["password"] ?? "");

    if (!ip) {
      return reply.status(400).send({ error: "IP address is required" });
    }
    if (authMethod === "password" && !password) {
      return reply.status(400).send({ error: "Password is required for password authentication" });
    }

    // Stream deploy output via SSE
    const reqOrigin = request.headers.origin ?? "*";
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": reqOrigin,
      "Access-Control-Allow-Credentials": "true",
    });

    const send = (event: string, data: string) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const sshBase = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=10",
      ...buildSshAuthArgs(authMethod, password),
    ];
    const askpass = authMethod === "password" && password ? createAskpassEnv(password) : null;
    const spawnEnv = askpass?.env ?? process.env;

    /** Run a command on the remote host and return stdout. */
    const sshExec = (cmd: string): Promise<string> =>
      new Promise((res, rej) => {
        const proc = spawn("ssh", [...sshBase, `${username}@${ip}`, cmd], {
          stdio: ["ignore", "pipe", "pipe"],
          env: spawnEnv,
        });
        let out = "";
        proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
        proc.stderr.on("data", (d: Buffer) => {
          d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
        });
        proc.on("close", (code) => (code === 0 ? res(out.trim()) : rej(new Error(`exit ${code}`))));
        proc.on("error", rej);
      });

    /** Run a long script on the remote host, streaming output via SSE. */
    const sshScript = (script: string): Promise<void> =>
      new Promise((res, rej) => {
        const proc = spawn("ssh", [...sshBase, `${username}@${ip}`, "bash -s"], {
          stdio: ["pipe", "pipe", "pipe"],
          env: spawnEnv,
        });
        proc.stdin.write(script);
        proc.stdin.end();
        proc.stdout.on("data", (d: Buffer) => {
          d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
        });
        proc.stderr.on("data", (d: Buffer) => {
          d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
        });
        proc.on("close", (code) => (code === 0 ? res() : rej(new Error(`exit ${code}`))));
        proc.on("error", rej);
        setTimeout(() => { proc.kill(); rej(new Error("Timed out")); }, 5 * 60_000);
      });

    try {
      // --- Phase 1: Detect remote architecture ---
      send("log", `Connecting to ${username}@${ip}...`);
      const raw = await sshExec("uname -m");
      let arch: string;
      if (raw === "x86_64" || raw === "amd64") arch = "x64";
      else if (raw === "aarch64" || raw === "arm64") arch = "arm64";
      else {
        send("error", `Unsupported architecture: ${raw}`);
        reply.raw.end();
        return reply;
      }
      send("log", `Detected linux-${arch}`);

      // --- Phase 2: Compile binary (cached by version+arch) ---
      send("log", "[1/3] Compiling gateway binary...");
      const cacheDir = join(tmpdir(), "jait-deploy");
      mkdirSync(cacheDir, { recursive: true });
      const outFile = join(cacheDir, `jait-gateway-${PKG_VERSION}-linux-${arch}`);

      if (existsSync(outFile)) {
        send("log", `Using cached binary (v${PKG_VERSION})`);
      } else {
        // Find entry point — .ts in dev, .js from npm install
        const tsEntry = resolve(__dirname, "../index.ts");
        const jsEntry = resolve(__dirname, "../index.js");
        const entry = existsSync(tsEntry) ? tsEntry : jsEntry;

        await new Promise<void>((res, rej) => {
          const target = `bun-linux-${arch}`;
          const args = ["build", "--compile", `--target=${target}`, "--minify", entry, "--outfile", outFile];
          send("log", `bun build --compile --target=${target} --minify`);
          const proc = spawn("bun", args, { stdio: ["ignore", "pipe", "pipe"] });
          proc.stdout.on("data", (d: Buffer) => {
            d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
          });
          proc.stderr.on("data", (d: Buffer) => {
            d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
          });
          proc.on("close", (code) => (code === 0 ? res() : rej(new Error("Compilation failed"))));
          proc.on("error", rej);
        });
        send("log", "Binary compiled");
      }

      // --- Phase 3: Transfer binary via SCP ---
      const sizeMB = (statSync(outFile).size / 1_048_576).toFixed(1);
      send("log", `[2/3] Transferring binary (${sizeMB} MB)...`);

      await sshExec("mkdir -p ~/.jait");

      await new Promise<void>((res, rej) => {
        const proc = spawn("scp", [...sshBase, outFile, `${username}@${ip}:~/.jait/jait-gateway`], { env: spawnEnv });
        proc.stderr.on("data", (d: Buffer) => {
          d.toString().split("\n").filter(Boolean).forEach((l) => send("log", l));
        });
        proc.on("close", (code) => (code === 0 ? res() : rej(new Error("Transfer failed"))));
        proc.on("error", rej);
        setTimeout(() => { proc.kill(); rej(new Error("Transfer timed out")); }, 5 * 60_000);
      });
      send("log", "Binary transferred");

      // --- Phase 4: Configure and start ---
      send("log", "[3/3] Configuring and starting...");

      const setupScript = [
        "set -e",
        "chmod +x ~/.jait/jait-gateway",
        "SUDO=''",
        "if [ \"$(id -u)\" -ne 0 ] && command -v sudo >/dev/null 2>&1; then",
        "  SUDO='sudo'",
        "fi",
        `if [ \"$SUDO\" = 'sudo' ] && [ ${shellQuote(authMethod)} = 'password' ]; then`,
        "  cat > ~/.jait/.deploy-sudo-askpass <<'ASKPASS'",
        "  #!/bin/sh",
        `  printf '%s\\n' ${shellQuote(password)}`,
        "ASKPASS",
        "  chmod 700 ~/.jait/.deploy-sudo-askpass",
        "  export SUDO_ASKPASS=~/.jait/.deploy-sudo-askpass",
        "  SUDO='sudo -A'",
        "fi",
        "",
        "# Write .env if it doesn't exist yet",
        "[ -f ~/.jait/.env ] || cat > ~/.jait/.env << 'ENVEOF'",
        "PORT=8000",
        "HOST=0.0.0.0",
        "LOG_LEVEL=info",
        "CORS_ORIGIN=*",
        "ENVEOF",
        "",
        "# Systemd service",
        "${SUDO:+$SUDO }tee /etc/systemd/system/jait-gateway.service > /dev/null << SVCEOF",
        "[Unit]",
        "Description=Jait Gateway",
        "After=network.target",
        "",
        "[Service]",
        `User=${username}`,
        "WorkingDirectory=%h/.jait",
        "ExecStart=%h/.jait/jait-gateway",
        "Restart=on-failure",
        "",
        "[Install]",
        "WantedBy=multi-user.target",
        "SVCEOF",
        "",
        "${SUDO:+$SUDO }systemctl daemon-reload",
        "${SUDO:+$SUDO }systemctl enable --now jait-gateway",
        "rm -f ~/.jait/.deploy-sudo-askpass",
        "echo 'Jait Gateway deployed successfully!'",
      ].join("\n");

      await sshScript(setupScript);
      send("done", `Gateway v${PKG_VERSION} deployed to ${ip}`);
    } catch (err) {
      send("error", err instanceof Error ? err.message : "Deployment failed");
    } finally {
      askpass?.cleanup();
    }

    reply.raw.end();
    return reply;
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
