import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform, networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import type { NetworkHost, NetworkScanResult } from "@jait/shared";

const execAsync = promisify(exec);

const QUICK_DISCOVERY_PORTS = [53, 80, 139, 443, 445, 554, 8000, 8080, 22];
const DETAIL_PROBE_PORTS = [22, 53, 80, 139, 443, 445, 554, 8000, 8080];

export interface NetworkScanOptions {
  subnet?: string;
  deep?: boolean;
  includeIps?: string[];
}

interface HostEntry {
  ip: string;
  mac: string | null;
  responsive: boolean;
}

export function getLocalSubnets(): string[] {
  const ifaces = networkInterfaces();
  const subnets: string[] = [];
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        if (entry.address.startsWith("169.254.")) continue;
        const parts = entry.address.split(".");
        subnets.push(parts.slice(0, 3).join("."));
      }
    }
  }
  return [...new Set(subnets)];
}

function normalizeSubnetPrefix(value: string): string | null {
  const trimmed = value.trim();
  const cidrMatch = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\/24$/.exec(trimmed);
  if (cidrMatch) return cidrMatch[1]!;

  const fullIpMatch = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(trimmed);
  if (fullIpMatch) return fullIpMatch[1]!;

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function normalizeIps(ips: string[] | undefined): string[] {
  if (!ips?.length) return [];
  return [...new Set(
    ips
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0 && isValidIpv4(ip)),
  )];
}

async function detectDefaultGatewayIp(): Promise<string | null> {
  try {
    if (platform() === "win32") {
      const { stdout } = await execAsync(
        "powershell -NoProfile -Command \"Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric,InterfaceMetric | Select-Object -First 1 -ExpandProperty NextHop\"",
        { timeout: 4000 },
      );
      const ip = stdout.trim().split(/\r?\n/).find(isValidIpv4);
      return ip ?? null;
    }

    if (platform() === "darwin") {
      const { stdout } = await execAsync("route -n get default 2>/dev/null", { timeout: 4000, shell: "/bin/bash" });
      const match = stdout.match(/gateway:\s+(\d{1,3}(?:\.\d{1,3}){3})/i);
      return match?.[1] && isValidIpv4(match[1]) ? match[1] : null;
    }

    const { stdout } = await execAsync("ip route show default 2>/dev/null || true", { timeout: 4000, shell: "/bin/bash" });
    const match = stdout.match(/default via (\d{1,3}(?:\.\d{1,3}){3})/i);
    return match?.[1] && isValidIpv4(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

function parseArpTable(output: string): HostEntry[] {
  const results: HostEntry[] = [];
  const lineRegex =
    /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?:at\s+)?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/;
  const ignoredMacs = new Set(["ff:ff:ff:ff:ff:ff", "00:00:00:00:00:00"]);

  for (const line of output.split("\n")) {
    const match = lineRegex.exec(line);
    if (!match) continue;
    const mac = match[2]!.replace(/-/g, ":").toLowerCase();
    if (ignoredMacs.has(mac)) continue;
    const firstOctet = parseInt(mac.slice(0, 2), 16);
    if (firstOctet & 1) continue;
    results.push({ ip: match[1]!, mac, responsive: true });
  }

  return results;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const run = async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
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

async function probeAnyPort(ip: string, ports: number[], timeoutMs: number): Promise<boolean> {
  for (const port of ports) {
    if (await probePort(ip, port, timeoutMs)) {
      return true;
    }
  }
  return false;
}

async function pingHost(ip: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const command = platform() === "win32"
      ? `ping -n 1 -w ${timeoutMs} ${ip} > nul 2>&1`
      : `ping -c 1 -W ${Math.max(1, Math.ceil(timeoutMs / 1000))} ${ip} >/dev/null 2>&1`;
    await execAsync(
      command,
      platform() === "win32"
        ? { timeout: timeoutMs + 1500 }
        : { timeout: timeoutMs + 1500, shell: "/bin/bash" },
    );
    return true;
  } catch {
    return false;
  }
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

async function detectOsVersion(ip: string, sshReachable: boolean, agentStatus: string): Promise<string | null> {
  if (agentStatus === "running") {
    try {
      const res = await fetch(`http://${ip}:8000/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const health = (await res.json()) as { osVersion?: string; os?: string };
        if (health.osVersion) return health.osVersion;
        if (health.os) return health.os;
      }
    } catch {}
  }

  if (sshReachable) {
    try {
      const banner = await new Promise<string>((resolve) => {
        const socket = createConnection({ host: ip, port: 22, timeout: 3000 });
        let data = "";
        socket.on("data", (chunk: unknown) => { data += String(chunk); socket.destroy(); resolve(data); });
        socket.on("timeout", () => { socket.destroy(); resolve(""); });
        socket.on("error", () => { socket.destroy(); resolve(""); });
      });

      if (banner) {
        const trimmed = banner.trim().slice(0, 200);
        if (/ubuntu/i.test(trimmed)) {
          const match = /Ubuntu[\s-]*(\S*)/i.exec(trimmed);
          return match ? `Ubuntu ${match[1]}` : "Ubuntu";
        }
        if (/debian/i.test(trimmed)) return "Debian";
        if (/windows/i.test(trimmed)) return "Windows";
        if (/raspbian/i.test(trimmed)) return "Raspbian";
        if (trimmed.startsWith("SSH-")) return trimmed;
      }
    } catch {}
  }

  return null;
}

async function runSubnetPingSweep(subnets: string[]): Promise<void> {
  for (const subnet of subnets) {
    if (platform() === "win32") {
      const batchSize = 25;
      const batches: string[] = [];
      for (let i = 1; i <= 254; i += batchSize) {
        const end = Math.min(i + batchSize - 1, 254);
        const commands = Array.from({ length: end - i + 1 }, (_, offset) =>
          `ping -n 1 -w 500 ${subnet}.${i + offset} > nul 2>&1`,
        ).join(" & ");
        batches.push(commands);
      }
      await Promise.all(batches.map((command) => execAsync(command, { timeout: 45000 }).catch(() => {})));
      continue;
    }

    const pingCmd = `for i in $(seq 1 254); do ping -c 1 -W 1 ${subnet}.$i & done; wait`;
    await execAsync(pingCmd, { timeout: 30000, shell: "/bin/bash" }).catch(() => {});
  }
}

async function readArpEntries(): Promise<HostEntry[]> {
  try {
    const { stdout } = await execAsync("arp -a", { timeout: 10000 });
    return parseArpTable(stdout);
  } catch {
    return [];
  }
}

async function readWindowsNeighborEntries(subnets: string[]): Promise<HostEntry[]> {
  if (platform() !== "win32") return [];

  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -ne \'Unreachable\' -and $_.LinkLayerAddress -ne \'\' -and $_.LinkLayerAddress -ne \'00-00-00-00-00-00\' } | Select-Object IPAddress,LinkLayerAddress | ConvertTo-Csv -NoTypeInformation"',
      { timeout: 15000 },
    );

    const entries: HostEntry[] = [];
    for (const line of stdout.split("\n")) {
      const match = /"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"\s*,\s*"([0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2}-[0-9a-fA-F]{2})"/.exec(line);
      if (!match) continue;
      const ip = match[1]!;
      if (!subnets.some((subnet) => ip.startsWith(`${subnet}.`))) continue;
      entries.push({ ip, mac: match[2]!.replace(/-/g, ":").toLowerCase(), responsive: true });
    }
    return entries;
  } catch {
    return [];
  }
}

function mergeEntries(entries: HostEntry[]): HostEntry[] {
  const merged = new Map<string, HostEntry>();
  for (const entry of entries) {
    const existing = merged.get(entry.ip);
    if (!existing) {
      merged.set(entry.ip, entry);
      continue;
    }
    merged.set(entry.ip, {
      ip: entry.ip,
      mac: existing.mac ?? entry.mac,
      responsive: existing.responsive || entry.responsive,
    });
  }
  return [...merged.values()];
}

function buildSubnetCandidates(subnets: string[]): string[] {
  const candidates: string[] = [];
  for (const subnet of subnets) {
    for (let host = 1; host <= 254; host += 1) {
      candidates.push(`${subnet}.${host}`);
    }
  }
  return candidates;
}

export async function scanNetwork(options: NetworkScanOptions = {}): Promise<NetworkScanResult> {
  const requestedSubnet = options.subnet ? normalizeSubnetPrefix(options.subnet) : null;
  const subnets = requestedSubnet ? [requestedSubnet] : getLocalSubnets();
  if (subnets.length === 0) {
    throw new Error("No active IPv4 subnets found");
  }

  const includeIps = normalizeIps(options.includeIps);
  const includeIpSet = new Set(includeIps);
  const start = Date.now();
  const deepScan = options.deep !== false;
  const routerIp = await detectDefaultGatewayIp();

  let entries = mergeEntries([
    ...(await readArpEntries()),
    ...(await readWindowsNeighborEntries(subnets)),
  ]);

  await runSubnetPingSweep(subnets);
  await sleep(2500);

  entries = mergeEntries([
    ...entries,
    ...(await readArpEntries()),
    ...(await readWindowsNeighborEntries(subnets)),
  ]);

  if (deepScan) {
    const knownIps = new Set(entries.map((entry) => entry.ip));
    const candidates = [...new Set([
      ...buildSubnetCandidates(subnets),
      ...includeIps,
    ])].filter((ip) => !knownIps.has(ip));

    const discovered = await mapConcurrent<string, HostEntry | null>(candidates, 64, async (ip) => {
      if (await pingHost(ip, 900)) {
        return { ip, mac: null, responsive: true };
      }
      if (await probeAnyPort(ip, QUICK_DISCOVERY_PORTS, 250)) {
        return { ip, mac: null, responsive: true };
      }
      return null;
    });
    const discoveredEntries = discovered.filter((entry): entry is HostEntry => entry !== null);

    entries = mergeEntries([
      ...entries,
      ...discoveredEntries,
    ]);

    await sleep(1000);
    entries = mergeEntries([
      ...entries,
      ...(await readArpEntries()),
      ...(await readWindowsNeighborEntries(subnets)),
    ]);
  }

  const scopedEntries = mergeEntries([
    ...entries.filter((entry) =>
      includeIpSet.has(entry.ip) || subnets.some((subnet) => entry.ip.startsWith(`${subnet}.`)),
    ),
    ...includeIps
      .filter((ip) => !entries.some((entry) => entry.ip === ip))
      .map((ip) => ({ ip, mac: null, responsive: false })),
  ]);

  const hosts = await mapConcurrent(scopedEntries, 20, async (entry): Promise<NetworkHost> => {
    const portResults = await Promise.all(
      DETAIL_PROBE_PORTS.map(async (port) => ({
        port,
        open: await probePort(entry.ip, port, 1500),
      })),
    );
    const openPorts = portResults.filter((result) => result.open).map((result) => result.port);
    const hostname = await reverseResolve(entry.ip);

    let agentStatus: NetworkHost["agentStatus"] = "not-installed";
    let providers: string[] | undefined;
    if (openPorts.includes(8000)) {
      try {
        const res = await fetch(`http://${entry.ip}:8000/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const health = (await res.json()) as { name?: string };
          if (health.name === "jait-gateway") {
            agentStatus = "running";
            try {
              const topologyRes = await fetch(`http://${entry.ip}:8000/api/network/topology`, {
                signal: AbortSignal.timeout(2000),
              });
              if (topologyRes.ok) {
                const topology = (await topologyRes.json()) as { devices?: { providers?: string[] }[] };
                const allProviders = new Set<string>();
                for (const device of topology.devices ?? []) {
                  for (const provider of device.providers ?? []) {
                    allProviders.add(provider);
                  }
                }
                if (allProviders.size > 0) {
                  providers = [...allProviders];
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    const alive = entry.responsive || openPorts.length > 0;
    const sshReachable = openPorts.includes(22);

    return {
      ip: entry.ip,
      mac: entry.mac,
      hostname,
      vendor: null,
      isRouter: routerIp === entry.ip,
      alive,
      openPorts,
      sshReachable,
      agentStatus,
      osVersion: await detectOsVersion(entry.ip, sshReachable, agentStatus),
      providers,
      lastSeen: new Date().toISOString(),
    };
  });

  hosts.sort((a, b) => {
    const aNum = a.ip.split(".").map(Number).reduce((sum: number, value: number) => sum * 256 + value, 0);
    const bNum = b.ip.split(".").map(Number).reduce((sum: number, value: number) => sum * 256 + value, 0);
    return aNum - bNum;
  });

  return {
    subnet: subnets.map((subnet) => `${subnet}.0/24`).join(", "),
    hosts,
    routerIp,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };
}
