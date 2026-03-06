import type { FastifyInstance } from "fastify";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import type { NetworkHost, NetworkScanResult, SshTestResult, GatewayNode } from "@jait/shared";
import { getLatestNetworkScan, setLatestNetworkScan } from "../tools/network-tools.js";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the local subnet (e.g. "192.168.1") from active network interfaces. */
function getLocalSubnets(): string[] {
  const ifaces = networkInterfaces();
  const subnets: string[] = [];
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        // Skip link-local / APIPA addresses (169.254.x.x)
        if (entry.address.startsWith("169.254.")) continue;
        const parts = entry.address.split(".");
        subnets.push(parts.slice(0, 3).join("."));
      }
    }
  }
  return [...new Set(subnets)];
}

/** Parse the output of `arp -a` into a list of IP→MAC pairs. */
function parseArpTable(output: string): { ip: string; mac: string }[] {
  const results: { ip: string; mac: string }[] = [];
  // Matches lines like "  192.168.1.1           00-0a-95-9d-68-16     dynamic"
  // or "(192.168.1.1) at 00:0a:95:9d:68:16 [ether] on eth0"
  const lineRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?:at\s+)?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/;
  for (const line of output.split("\n")) {
    const match = lineRegex.exec(line);
    if (match) {
      results.push({ ip: match[1]!, mac: match[2]!.replace(/-/g, ":").toLowerCase() });
    }
  }
  return results;
}

/** TCP-connect probe to check if a single port is open. */
function probePort(ip: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port, timeout: timeoutMs });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

/** Resolve hostname via reverse-DNS. */
async function reverseResolve(ip: string): Promise<string | null> {
  try {
    const cmd = platform() === "win32"
      ? `nslookup ${ip} 2>nul`
      : `host ${ip} 2>/dev/null || true`;
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    // Windows: "Name:    myhost.local"
    const winMatch = /Name:\s+(\S+)/i.exec(stdout);
    if (winMatch) return winMatch[1]!;
    // Linux: "1.168.192.in-addr.arpa domain name pointer myhost.local."
    const linMatch = /pointer\s+(\S+)/i.exec(stdout);
    if (linMatch) return linMatch[1]!.replace(/\.$/, "");
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory node registry (gateway mesh)
// ---------------------------------------------------------------------------

const knownNodes = new Map<string, GatewayNode>();

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerNetworkRoutes(app: FastifyInstance) {
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

  // ---- GET /api/network/scan/latest — return cached scan from the scheduled job ----
  app.get("/api/network/scan/latest", async () => {
    const cached = getLatestNetworkScan();
    if (!cached) {
      return { ok: false, message: "No scan results yet. Trigger a scan or wait for the scheduled job." };
    }
    return cached;
  });

  // ---- POST /api/network/scan — ARP scan + port probe ----
  app.post("/api/network/scan", async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetSubnet = body["subnet"] as string | undefined;

    const subnets = targetSubnet ? [targetSubnet] : getLocalSubnets();
    if (subnets.length === 0) {
      return { error: "No active IPv4 subnets found" };
    }

    const start = Date.now();

    // 1. Collect ARP table
    let arpOutput = "";
    try {
      const { stdout } = await execAsync("arp -a", { timeout: 10000 });
      arpOutput = stdout;
    } catch {
      // ARP might not be available — continue with ping sweep
    }

    const arpEntries = parseArpTable(arpOutput);

    // 2. Ping sweep every detected subnet to populate ARP cache
    try {
      for (const subnet of subnets) {
        if (platform() === "win32") {
          const pingCmd = Array.from({ length: 254 }, (_, i) =>
            `start /b ping -n 1 -w 500 ${subnet}.${i + 1} > nul 2>&1`
          ).join(" & ");
          await execAsync(pingCmd, { timeout: 30000 }).catch(() => {});
        } else {
          const pingCmd = `for i in $(seq 1 254); do ping -c 1 -W 1 ${subnet}.$i & done; wait`;
          await execAsync(pingCmd, { timeout: 30000, shell: "/bin/bash" }).catch(() => {});
        }
      }
      // Re-read ARP table after all sweeps
      const { stdout } = await execAsync("arp -a", { timeout: 10000 });
      arpOutput = stdout;
      arpEntries.length = 0;
      arpEntries.push(...parseArpTable(stdout));
    } catch {
      // Ping sweep optional — use whatever ARP gave us
    }

    // 3. Filter to target subnet(s)
    const subnetFiltered = arpEntries.filter(e =>
      subnets.some(s => e.ip.startsWith(s + "."))
    );

    // 4. Probe SSH (port 22) and common ports in parallel
    const PROBE_PORTS = [22, 80, 443, 8000, 8080];
    const hosts: NetworkHost[] = await Promise.all(
      subnetFiltered.map(async (entry) => {
        const portResults = await Promise.all(
          PROBE_PORTS.map(async (port) => ({ port, open: await probePort(entry.ip, port, 1500) }))
        );
        const openPorts = portResults.filter(p => p.open).map(p => p.port);
        const sshReachable = openPorts.includes(22);
        const hostname = await reverseResolve(entry.ip);

        // Check if this is a known Jait gateway node
        let agentStatus: NetworkHost["agentStatus"] = "not-installed";
        if (openPorts.includes(8000)) {
          try {
            const res = await fetch(`http://${entry.ip}:8000/health`, { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
              const health = await res.json() as { name?: string };
              if (health.name === "jait-gateway") agentStatus = "running";
            }
          } catch {
            agentStatus = "not-installed";
          }
        }

        return {
          ip: entry.ip,
          mac: entry.mac,
          hostname,
          vendor: null, // Could add OUI lookup later
          alive: true,
          openPorts,
          sshReachable,
          agentStatus,
          lastSeen: new Date().toISOString(),
        };
      })
    );

    const result: NetworkScanResult = {
      subnet: subnets.map(s => s + ".0/24").join(", "),
      hosts: hosts.sort((a, b) => {
        const aNum = a.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
        const bNum = b.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
        return aNum - bNum;
      }),
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
    };

    // Update the shared cache so /api/network/scan/latest reflects this scan
    setLatestNetworkScan(result as import("../tools/network-tools.js").NetworkScanData);

    return result;
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
}
