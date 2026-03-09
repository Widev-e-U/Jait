export type SandboxMountMode = "none" | "read-only" | "read-write";
export interface SandboxRunOptions {
    command: string;
    workspaceRoot: string;
    timeoutMs: number;
    mountMode?: SandboxMountMode;
    networkEnabled?: boolean;
    memoryLimitMb?: number;
    cpuLimit?: string;
}
export interface SandboxRunResult {
    ok: boolean;
    output: string;
    exitCode: number | null;
    timedOut: boolean;
    containerName: string;
}
export interface SandboxBrowserOptions {
    workspaceRoot: string;
    novncPort?: number;
    vncPort?: number;
    mountMode?: SandboxMountMode;
}
export interface SandboxBrowserResult {
    containerName: string;
    novncUrl: string;
    vncPort: number;
    novncPort: number;
}
interface ProcessResult {
    output: string;
    exitCode: number | null;
    timedOut: boolean;
}
export declare class SandboxManager {
    private readonly runProcess;
    constructor(runProcess?: (cmd: string[], timeoutMs: number) => Promise<ProcessResult>);
    runCommand(options: SandboxRunOptions): Promise<SandboxRunResult>;
    startBrowserSandbox(options: SandboxBrowserOptions): Promise<SandboxBrowserResult>;
    private buildMountArgs;
}
export {};
//# sourceMappingURL=sandbox-manager.d.ts.map