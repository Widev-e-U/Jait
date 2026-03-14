import type { ToolDefinition, ToolResult } from "./contracts.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform, networkInterfaces } from "node:os";
import { createConnection } from "node:net";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Helpers (shared with routes/network.ts — extract later if needed)
// ---------------------------------------------------------------------------

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

function parseArpTable(output: string): { ip: string; mac: string }[] {
  const results: { ip: string; mac: string }[] = [];
  const lineRegex =
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?:at\s+)?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/;
  for (const line of output.split("\n")) {
    const match = lineRegex.exec(line);
    if (match) {
      results.push({ ip: match[1]!, mac: match[2]!.replace(/-/g, ":").toLowerCase() });
    }
  }
  return results;
}

function probePort(ip: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port, timeout: timeoutMs });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

async function reverseResolve(ip: string): Promise<string | null> {
  try {
    const cmd = platform() === "win32"
      ? `nslookup ${ip} 2>nul`
      : `host ${ip} 2>/dev/null || true`;
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    const winMatch = /Name:\s+(\S+)/i.exec(stdout);
    if (winMatch) return winMatch[1]!;
    const linMatch = /pointer\s+(\S+)/i.exec(stdout);
    if (linMatch) return linMatch[1]!.replace(/\.$/, "");
    return null;
  } catch {
    return null;
  }
}

/** Detect OS version via SSH banner and/or Jait gateway health endpoint. */
async function detectOsVersion(ip: string, sshReachable: boolean, agentStatus: string): Promise<string | null> {
  // If it's a running Jait gateway, ask its health endpoint for OS info
  if (agentStatus === "running") {
    try {
      const res = await fetch(`http://${ip}:8000/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const health = (await res.json()) as { platform?: string; osVersion?: string; os?: string };
        if (health.osVersion) return health.osVersion;
        if (health.os) return health.os;
      }
    } catch {}
  }
  // Try SSH banner for OS hints
  if (sshReachable) {
    try {
      const banner = await new Promise<string>((resolve) => {
        const socket = createConnection({ host: ip, port: 22, timeout: 3000 });
        let data = "";
        socket.on("data", (chunk) => { data += chunk.toString(); socket.destroy(); resolve(data); });
        socket.on("timeout", () => { socket.destroy(); resolve(""); });
        socket.on("error", () => { socket.destroy(); resolve(""); });
      });
      if (banner) {
        const trimmed = banner.trim().slice(0, 200);
        // Extract OS info from SSH banner (e.g. "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6")
        if (/ubuntu/i.test(trimmed)) {
          const m = /Ubuntu[\s-]*(\S*)/i.exec(trimmed);
          return m ? `Ubuntu ${m[1]}` : "Ubuntu";
        }
        if (/debian/i.test(trimmed)) return "Debian";
        if (/windows/i.test(trimmed)) return "Windows";
        if (/raspbian/i.test(trimmed)) return "Raspbian";
        // Return raw banner as fallback if it looks informative
        if (trimmed.startsWith("SSH-")) return trimmed;
      }
    } catch {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared scan result cache — accessible from network routes too
// ---------------------------------------------------------------------------

export interface NetworkScanHost {
  ip: string;
  mac: string | null;
  hostname: string | null;
  alive: boolean;
  openPorts: number[];
  sshReachable: boolean;
  agentStatus: "not-installed" | "installed" | "running" | "unreachable";
  osVersion: string | null;
  providers?: string[];
  lastSeen: string;
}

export interface NetworkScanData {
  subnet: string;
  hosts: NetworkScanHost[];
  scannedAt: string;
  durationMs: number;
}

/** In-memory cache of the latest scan result, populated by the tool/job */
let latestScan: NetworkScanData | null = null;

/** Optional DB reference, set once at startup for persistent storage */
let _sqlite: import("../db/sqlite-shim.js").SqliteDatabase | undefined;

export function setNetworkScanDb(sqlite: import("../db/sqlite-shim.js").SqliteDatabase): void {
  _sqlite = sqlite;
}

export function getLatestNetworkScan(): NetworkScanData | null {
  return latestScan;
}

export function setLatestNetworkScan(data: NetworkScanData): void {
  latestScan = data;
  // Persist to DB if available
  if (_sqlite && data.hosts.length > 0) {
    try {
      const upsert = _sqlite.prepare(`
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
      for (const h of data.hosts) {
        upsert.run(
          h.ip,
          h.mac ?? null,
          h.hostname ?? null,
          h.osVersion ?? null,
          JSON.stringify(h.openPorts),
          h.sshReachable ? 1 : 0,
          h.agentStatus,
          h.providers?.length ? JSON.stringify(h.providers) : null,
          data.scannedAt,
          h.lastSeen,
          data.scannedAt,
        );
      }
    } catch (err) {
      console.error("Failed to persist network hosts to DB:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function createNetworkScanTool(): ToolDefinition {
  return {
    name: "network.scan",
    description:
      "Scan the local network using ARP + port probing. Discovers hosts, checks SSH (port 22), and detects running Jait gateway nodes. Returns a summary of discovered hosts.",
    tier: "standard",
    category: "network",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        subnet: {
          type: "string",
          description:
            'Target subnet prefix (e.g. "192.168.1"). If omitted, auto-detects from local interfaces.',
        },
      },
    },
    execute: async (input: unknown): Promise<ToolResult> => {
      const { subnet: targetSubnet } = (input ?? {}) as { subnet?: string };
      const subnets = targetSubnet ? [targetSubnet] : getLocalSubnets();
      if (subnets.length === 0) {
        return { ok: false, message: "No active IPv4 subnets found" };
      }

      const start = Date.now();

      // 1. Collect / refresh ARP table
      let arpEntries: { ip: string; mac: string }[] = [];
      try {
        const { stdout } = await execAsync("arp -a", { timeout: 10000 });
        arpEntries = parseArpTable(stdout);
      } catch {
        // continue without ARP
      }

      // 2. Quick ping sweep for every detected subnet to populate ARP cache
      try {
        for (const subnet of subnets) {
          if (platform() === "win32") {
            // Batched ping sweep — 25 per batch, batches in parallel
            const BATCH = 25;
            const batches: string[] = [];
            for (let i = 1; i <= 254; i += BATCH) {
              const end = Math.min(i + BATCH - 1, 254);
              const cmds = Array.from({ length: end - i + 1 }, (_, j) =>
                `ping -n 1 -w 500 ${subnet}.${i + j} > nul 2>&1`
              ).join(" & ");
              batches.push(cmds);
            }
            await Promise.all(
              batches.map(cmd => execAsync(cmd, { timeout: 45000 }).catch(() => {}))
            );
          } else {
            const pingCmd = `for i in $(seq 1 254); do ping -c 1 -W 1 ${subnet}.$i & done; wait`;
            await execAsync(pingCmd, { timeout: 30000, shell: "/bin/bash" }).catch(() => {});
          }
        }
        // Brief pause for ARP cache to settle
        await new Promise(r => setTimeout(r, 2500));
        // Re-read ARP table after all sweeps
        const { stdout } = await execAsync("arp -a", { timeout: 10000 });
        arpEntries = parseArpTable(stdout);
      } catch {
        // use existing ARP entries
      }

      // 2b. On Windows, supplement with Get-NetNeighbor
      if (platform() === "win32") {
        try {
          const { stdout: pshOutput } = await execAsync(
            'powershell -NoProfile -Command "Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne \'Unreachable\' -and $_.LinkLayerAddress -ne \'\' -and $_.LinkLayerAddress -ne \'00-00-00-00-00-00\' } | Select-Object IPAddress,LinkLayerAddress | ConvertTo-Csv -NoTypeInformation"',
            { timeout: 15000 },
          );
          const existingIps = new Set(arpEntries.map(e => e.ip));
          for (const line of pshOutput.split("\n")) {
            const csvMatch = /"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"\s*,\s*"([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})"/.exec(line);
            if (!csvMatch) continue;
            const ip = csvMatch[1]!;
            const mac = csvMatch[2]!.replace(/-/g, ":").toLowerCase();
            if (existingIps.has(ip)) continue;
            if (mac === "ff:ff:ff:ff:ff:ff" || mac === "00:00:00:00:00:00") continue;
            const firstOctet = parseInt(mac.slice(0, 2), 16);
            if (firstOctet & 1) continue;
            if (subnets.some(s => ip.startsWith(s + "."))) {
              arpEntries.push({ ip, mac });
            }
          }
        } catch {}
      }

      // 3. Filter to subnet
      const subnetFiltered = arpEntries.filter((e) =>
        subnets.some((s) => e.ip.startsWith(s + ".")),
      );

      // 4. Probe ports in parallel
      const PROBE_PORTS = [22, 80, 443, 8000, 8080];
      const hosts: NetworkScanHost[] = await Promise.all(
        subnetFiltered.map(async (entry) => {
          const portResults = await Promise.all(
            PROBE_PORTS.map(async (port) => ({
              port,
              open: await probePort(entry.ip, port, 1500),
            })),
          );
          const openPorts = portResults.filter((p) => p.open).map((p) => p.port);
          const sshReachable = openPorts.includes(22);
          const hostname = await reverseResolve(entry.ip);

          let agentStatus: NetworkScanHost["agentStatus"] = "not-installed";
          let providers: string[] | undefined;
          if (openPorts.includes(8000)) {
            try {
              const res = await fetch(`http://${entry.ip}:8000/health`, {
                signal: AbortSignal.timeout(2000),
              });
              if (res.ok) {
                const health = (await res.json()) as { name?: string };
                if (health.name === "jait-gateway") {
                  agentStatus = "running";
                  // Try to discover providers from the remote gateway
                  try {
                    const topoRes = await fetch(`http://${entry.ip}:8000/api/network/topology`, {
                      signal: AbortSignal.timeout(2000),
                    });
                    if (topoRes.ok) {
                      const topo = (await topoRes.json()) as { devices?: { providers?: string[] }[] };
                      const all = new Set<string>();
                      for (const d of topo.devices ?? []) for (const p of d.providers ?? []) all.add(p);
                      if (all.size > 0) providers = [...all];
                    }
                  } catch {}
                }
              }
            } catch {
              agentStatus = "not-installed";
            }
          }

          return {
            ip: entry.ip,
            mac: entry.mac,
            hostname,
            alive: true,
            openPorts,
            sshReachable,
            agentStatus,
            osVersion: await detectOsVersion(entry.ip, sshReachable, agentStatus),
            providers,
            lastSeen: new Date().toISOString(),
          };
        }),
      );

      // Sort by IP
      hosts.sort((a, b) => {
        const aNum = a.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
        const bNum = b.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
        return aNum - bNum;
      });

      const result: NetworkScanData = {
        subnet: subnets.map(s => s + ".0/24").join(", "),
        hosts,
        scannedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };

      // Cache for the UI network panel
      latestScan = result;

      const gatewayCount = hosts.filter((h) => h.agentStatus === "running").length;
      const sshCount = hosts.filter((h) => h.sshReachable).length;

      return {
        ok: true,
        message: `Network scan complete: ${hosts.length} hosts found (${sshCount} with SSH, ${gatewayCount} running Jait Gateway)`,
        data: result,
      };
    },
  };
}
