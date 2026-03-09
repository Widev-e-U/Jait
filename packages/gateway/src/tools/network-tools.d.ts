import type { ToolDefinition } from "./contracts.js";
export interface NetworkScanHost {
    ip: string;
    mac: string | null;
    hostname: string | null;
    alive: boolean;
    openPorts: number[];
    sshReachable: boolean;
    agentStatus: "not-installed" | "installed" | "running" | "unreachable";
    lastSeen: string;
}
export interface NetworkScanData {
    subnet: string;
    hosts: NetworkScanHost[];
    scannedAt: string;
    durationMs: number;
}
export declare function getLatestNetworkScan(): NetworkScanData | null;
export declare function setLatestNetworkScan(data: NetworkScanData): void;
export declare function createNetworkScanTool(): ToolDefinition;
//# sourceMappingURL=network-tools.d.ts.map