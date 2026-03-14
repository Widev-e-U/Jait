import type { FastifyInstance } from "fastify";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import type { NetworkHost, NetworkScanResult, SshTestResult, GatewayNode } from "@jait/shared";
import type { WsControlPlane } from "../ws.js";
import { getLatestNetworkScan, setLatestNetworkScan } from "../tools/network-tools.js";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { createRequire } from "node:module";
import { scanNetwork } from "../lib/network-scan.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../../package.json") as { version: string };

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
        return { subnet: "", hosts, scannedAt: scannedAt ?? new Date().toISOString(), durationMs: 0 };
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

  // ---- POST /api/network/deploy — deploy gateway to a remote host via SSH ----
  app.post("/api/network/deploy", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ip = String(body["ip"] ?? "").trim();
    const username = String(body["username"] ?? "").trim();
    const authMethod = String(body["authMethod"] ?? "password");

    if (!ip || !username) {
      return { error: "IP and username are required" };
    }

    // Build the deployment script that would be executed via SSH
    const deployScript = [
      "#!/bin/bash",
      "set -e",
      "",
      "echo '[1/5] Checking system requirements...'",
      "which curl > /dev/null 2>&1 || { echo 'curl is required'; exit 1; }",
      "",
      "echo '[2/5] Installing Bun runtime...'",
      "curl -fsSL https://bun.sh/install | bash",
      "export PATH=$HOME/.bun/bin:$PATH",
      "",
      "echo '[3/5] Downloading Jait Gateway...'",
      "mkdir -p ~/.jait",
      "cd ~/.jait",
      "bun init -y 2>/dev/null || true",
      "bun add @jait/gateway@latest",
      "",
      "echo '[4/5] Configuring gateway...'",
      `cat > ~/.jait/.env << 'ENVEOF'`,
      "PORT=8000",
      "HOST=0.0.0.0",
      "LOG_LEVEL=info",
      "CORS_ORIGIN=*",
      "ENVEOF",
      "",
      "echo '[5/5] Starting gateway service...'",
      "# Create systemd service",
      "sudo tee /etc/systemd/system/jait-gateway.service > /dev/null << 'SVCEOF'",
      "[Unit]",
      "Description=Jait Gateway",
      "After=network.target",
      "",
      "[Service]",
      `User=${username}`,
      "WorkingDirectory=%h/.jait",
      "ExecStart=%h/.bun/bin/bun run node_modules/@jait/gateway/src/index.ts",
      "Restart=on-failure",
      "Environment=PATH=%h/.bun/bin:/usr/local/bin:/usr/bin:/bin",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "SVCEOF",
      "",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable --now jait-gateway",
      "echo 'Jait Gateway deployed successfully!'",
    ].join("\n");

    // Build the SSH command (user would need to enter password or have key auth)
    const sshCommand = authMethod === "key"
      ? `ssh -o StrictHostKeyChecking=no ${username}@${ip} 'bash -s' << 'DEPLOY'\n${deployScript}\nDEPLOY`
      : `sshpass -p '<PASSWORD>' ssh -o StrictHostKeyChecking=no ${username}@${ip} 'bash -s' << 'DEPLOY'\n${deployScript}\nDEPLOY`;

    return {
      ip,
      username,
      authMethod,
      deployScript,
      sshCommand,
      instructions: [
        `SSH into ${ip} as ${username}`,
        "The deployment script will install Bun, download Jait Gateway, configure it, and set up a systemd service.",
        "After deployment, the gateway will be accessible at http://" + ip + ":8000",
      ],
      estimatedDuration: "2-5 minutes",
    };
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
    // Gateway node (self)
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
        // Try /etc/os-release for Linux distros
        const { stdout } = await execAsync("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'", { timeout: 3000 });
        osVersion = stdout.trim() || null;
      }
    } catch {}

    // Discover local providers available on the gateway
    const gatewayProviders: string[] = [];
    if (providerRegistry) {
      for (const p of providerRegistry.list()) {
        try { await p.checkAvailability(); } catch {}
        if (p.info.available) gatewayProviders.push(p.id);
      }
    }

    const gatewayNode = {
      id: "gateway",
      type: "gateway" as const,
      name: platform() === "win32" ? process.env.COMPUTERNAME ?? "Gateway" : (await execAsync("hostname").then(r => r.stdout.trim()).catch(() => "Gateway")),
      platform: platform() === "win32" ? "windows" : platform() === "darwin" ? "macos" : "linux",
      ip: gatewayIp,
      version: PKG_VERSION,
      osVersion,
      providers: gatewayProviders,
      online: true,
    };

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
    let hostSource: { ip: string; mac: string | null; hostname: string | null; alive?: boolean; openPorts: number[]; sshReachable: boolean; agentStatus: string; osVersion?: string | null; providers?: string[] }[] =
      scan?.hosts ?? [];
    let scannedAt: string | null = scan?.scannedAt ?? null;

    if (hostSource.length === 0 && sqlite) {
      const dbData = readHostsFromDb(sqlite);
      hostSource = dbData.hosts;
      scannedAt = dbData.scannedAt;
    }

    const scannedHosts = hostSource.map(h => ({
      id: `host-${h.ip}`,
      type: "host" as const,
      name: h.hostname ?? h.ip,
      ip: h.ip,
      mac: h.mac,
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
      scannedAt,
    };
  });
}
