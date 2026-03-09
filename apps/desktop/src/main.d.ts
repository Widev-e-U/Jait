import { DesktopActivityFeed } from "./activity-feed.js";
import { DesktopTerminalService, type NativeTerminalAdapter } from "./terminal-session.js";
export interface GatewayTransport {
    connect(url: string): Promise<void>;
    isConnected(): boolean;
}
export interface DesktopRuntimeDeps {
    transport: GatewayTransport;
    terminalAdapter: NativeTerminalAdapter;
}
export declare class DesktopApp {
    private readonly deps;
    readonly activityFeed: DesktopActivityFeed;
    readonly terminalService: DesktopTerminalService;
    private trayEnabled;
    private notificationsEnabled;
    private readonly shortcuts;
    constructor(deps: DesktopRuntimeDeps);
    launch(gatewayUrl: string): Promise<void>;
    startNativeTerminal(cwd: string): Promise<{
        terminalId: string;
        pid: number;
    }>;
    canNotify(): boolean;
    hasTray(): boolean;
    hasGlobalShortcut(shortcut: string): boolean;
}
//# sourceMappingURL=main.d.ts.map