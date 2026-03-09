import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform, networkInterfaces } from "node:os";
import { createConnection } from "node:net";
const execAsync = promisify(exec);
// ---------------------------------------------------------------------------
// Helpers (shared with routes/network.ts — extract later if needed)
// ---------------------------------------------------------------------------
function getLocalSubnets() {
    const ifaces = networkInterfaces();
    const subnets = [];
    for (const entries of Object.values(ifaces)) {
        if (!entries)
            continue;
        for (const entry of entries) {
            if (entry.family === "IPv4" && !entry.internal) {
                // Skip link-local / APIPA addresses (169.254.x.x)
                if (entry.address.startsWith("169.254."))
                    continue;
                const parts = entry.address.split(".");
                subnets.push(parts.slice(0, 3).join("."));
            }
        }
    }
    return [...new Set(subnets)];
}
function parseArpTable(output) {
    const results = [];
    const lineRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(?:at\s+)?([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/;
    for (const line of output.split("\n")) {
        const match = lineRegex.exec(line);
        if (match) {
            results.push({ ip: match[1], mac: match[2].replace(/-/g, ":").toLowerCase() });
        }
    }
    return results;
}
function probePort(ip, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = createConnection({ host: ip, port, timeout: timeoutMs });
        socket.once("connect", () => { socket.destroy(); resolve(true); });
        socket.once("timeout", () => { socket.destroy(); resolve(false); });
        socket.once("error", () => { socket.destroy(); resolve(false); });
    });
}
async function reverseResolve(ip) {
    try {
        const cmd = platform() === "win32"
            ? `nslookup ${ip} 2>nul`
            : `host ${ip} 2>/dev/null || true`;
        const { stdout } = await execAsync(cmd, { timeout: 3000 });
        const winMatch = /Name:\s+(\S+)/i.exec(stdout);
        if (winMatch)
            return winMatch[1];
        const linMatch = /pointer\s+(\S+)/i.exec(stdout);
        if (linMatch)
            return linMatch[1].replace(/\.$/, "");
        return null;
    }
    catch {
        return null;
    }
}
/** In-memory cache of the latest scan result, populated by the tool/job */
let latestScan = null;
export function getLatestNetworkScan() {
    return latestScan;
}
export function setLatestNetworkScan(data) {
    latestScan = data;
}
// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export function createNetworkScanTool() {
    return {
        name: "network.scan",
        description: "Scan the local network using ARP + port probing. Discovers hosts, checks SSH (port 22), and detects running Jait gateway nodes. Returns a summary of discovered hosts.",
        tier: "standard",
        category: "network",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                subnet: {
                    type: "string",
                    description: 'Target subnet prefix (e.g. "192.168.1"). If omitted, auto-detects from local interfaces.',
                },
            },
        },
        execute: async (input) => {
            const { subnet: targetSubnet } = (input ?? {});
            const subnets = targetSubnet ? [targetSubnet] : getLocalSubnets();
            if (subnets.length === 0) {
                return { ok: false, message: "No active IPv4 subnets found" };
            }
            const start = Date.now();
            // 1. Collect / refresh ARP table
            let arpEntries = [];
            try {
                const { stdout } = await execAsync("arp -a", { timeout: 10000 });
                arpEntries = parseArpTable(stdout);
            }
            catch {
                // continue without ARP
            }
            // 2. Quick ping sweep for every detected subnet to populate ARP cache
            try {
                for (const subnet of subnets) {
                    if (platform() === "win32") {
                        const pingCmd = Array.from({ length: 254 }, (_, i) => `start /b ping -n 1 -w 500 ${subnet}.${i + 1} > nul 2>&1`).join(" & ");
                        await execAsync(pingCmd, { timeout: 30000 }).catch(() => { });
                    }
                    else {
                        const pingCmd = `for i in $(seq 1 254); do ping -c 1 -W 1 ${subnet}.$i & done; wait`;
                        await execAsync(pingCmd, { timeout: 30000, shell: "/bin/bash" }).catch(() => { });
                    }
                }
                // Re-read ARP table after all sweeps
                const { stdout } = await execAsync("arp -a", { timeout: 10000 });
                arpEntries = parseArpTable(stdout);
            }
            catch {
                // use existing ARP entries
            }
            // 3. Filter to subnet
            const subnetFiltered = arpEntries.filter((e) => subnets.some((s) => e.ip.startsWith(s + ".")));
            // 4. Probe ports in parallel
            const PROBE_PORTS = [22, 80, 443, 8000, 8080];
            const hosts = await Promise.all(subnetFiltered.map(async (entry) => {
                const portResults = await Promise.all(PROBE_PORTS.map(async (port) => ({
                    port,
                    open: await probePort(entry.ip, port, 1500),
                })));
                const openPorts = portResults.filter((p) => p.open).map((p) => p.port);
                const sshReachable = openPorts.includes(22);
                const hostname = await reverseResolve(entry.ip);
                let agentStatus = "not-installed";
                if (openPorts.includes(8000)) {
                    try {
                        const res = await fetch(`http://${entry.ip}:8000/health`, {
                            signal: AbortSignal.timeout(2000),
                        });
                        if (res.ok) {
                            const health = (await res.json());
                            if (health.name === "jait-gateway")
                                agentStatus = "running";
                        }
                    }
                    catch {
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
                    lastSeen: new Date().toISOString(),
                };
            }));
            // Sort by IP
            hosts.sort((a, b) => {
                const aNum = a.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
                const bNum = b.ip.split(".").map(Number).reduce((sum, n) => sum * 256 + n, 0);
                return aNum - bNum;
            });
            const result = {
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
//# sourceMappingURL=network-tools.js.map