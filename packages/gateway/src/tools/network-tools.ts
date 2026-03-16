import type { ToolDefinition, ToolResult } from "./contracts.js";
import { scanNetwork } from "../lib/network-scan.js";

// ---------------------------------------------------------------------------
// Shared scan result cache — accessible from network routes too
// ---------------------------------------------------------------------------

export interface NetworkScanHost {
  ip: string;
  mac: string | null;
  hostname: string | null;
  isRouter?: boolean;
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
  routerIp?: string | null;
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
        deep: {
          type: "boolean",
          description:
            "Whether to run a deeper sweep across the full subnet instead of relying mostly on ARP/neighbour cache. Defaults to true.",
        },
        includeIps: {
          type: "array",
          items: { type: "string" },
          description:
            'Specific IPs to force-include in the scan, for example ["192.168.178.53"].',
        },
      },
    },
    execute: async (input: unknown): Promise<ToolResult> => {
      try {
        const { subnet: targetSubnet, deep = true, includeIps = [] } = (input ?? {}) as {
          subnet?: string;
          deep?: boolean;
          includeIps?: string[];
        };
        const result: NetworkScanData = await scanNetwork({ subnet: targetSubnet, deep, includeIps });

        latestScan = result;

        const gatewayCount = result.hosts.filter((host) => host.agentStatus === "running").length;
        const sshCount = result.hosts.filter((host) => host.sshReachable).length;

        return {
          ok: true,
          message: `Network scan complete: ${result.hosts.length} hosts found (${sshCount} with SSH, ${gatewayCount} running Jait Gateway)`,
          data: result,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Network scan failed",
        };
      }
    },
  };
}
