export interface NetworkHost {
    ip: string;
    mac: string | null;
    hostname: string | null;
    vendor: string | null;
    alive: boolean;
    openPorts: number[];
    sshReachable: boolean;
    agentStatus: 'not-installed' | 'installed' | 'running' | 'unreachable';
    lastSeen: string;
}
export interface NetworkScanResult {
    subnet: string;
    hosts: NetworkHost[];
    scannedAt: string;
    durationMs: number;
}
export interface SshTestResult {
    ip: string;
    reachable: boolean;
    authMethods: string[];
    platform?: string;
    error?: string;
}
export interface NetworkInterface {
    name: string;
    ip: string;
    mac: string;
    netmask: string;
    internal: boolean;
}
export interface GatewayNode {
    id: string;
    ip: string;
    hostname: string | null;
    platform: string;
    version: string;
    status: 'online' | 'offline' | 'degraded';
    lastSeen: string;
    capabilities: string[];
}
export interface DeployResult {
    ip: string;
    username: string;
    authMethod: string;
    deployScript: string;
    sshCommand: string;
    instructions: string[];
    estimatedDuration: string;
}
export interface SshEnableInfo {
    platform: string;
    command: string;
    steps: string[];
}
export declare function useNetwork(token?: string | null): {
    interfaces: NetworkInterface[];
    scanResult: NetworkScanResult | null;
    nodes: GatewayNode[];
    scanning: boolean;
    error: string | null;
    fetchInterfaces: () => Promise<void>;
    fetchLatestScan: () => Promise<void>;
    scan: (subnet?: string) => Promise<NetworkScanResult | null>;
    testSsh: (ip: string, port?: number) => Promise<SshTestResult | null>;
    getSshEnableInfo: (targetPlatform: string) => Promise<SshEnableInfo | null>;
    deploy: (ip: string, username: string, authMethod?: string) => Promise<DeployResult | null>;
    fetchNodes: () => Promise<void>;
    cancelScan: () => void;
};
//# sourceMappingURL=useNetwork.d.ts.map