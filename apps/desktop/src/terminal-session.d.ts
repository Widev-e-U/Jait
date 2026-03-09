export interface NativeTerminalAdapter {
    spawn(command: string, cwd: string): Promise<{
        terminalId: string;
        pid: number;
    }>;
}
export declare class DesktopTerminalService {
    private readonly adapter;
    constructor(adapter: NativeTerminalAdapter);
    start(command: string, cwd: string): Promise<{
        terminalId: string;
        pid: number;
    }>;
}
//# sourceMappingURL=terminal-session.d.ts.map