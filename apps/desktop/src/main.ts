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

export class DesktopApp {
  readonly activityFeed = new DesktopActivityFeed();
  readonly terminalService: DesktopTerminalService;
  private trayEnabled = false;
  private notificationsEnabled = false;
  private readonly shortcuts = new Set<string>();

  constructor(private readonly deps: DesktopRuntimeDeps) {
    this.terminalService = new DesktopTerminalService(deps.terminalAdapter);
  }

  async launch(gatewayUrl: string): Promise<void> {
    await this.deps.transport.connect(gatewayUrl);
    this.trayEnabled = true;
    this.notificationsEnabled = true;
    this.shortcuts.add("Alt+Space");
    this.activityFeed.append("agent", "desktop.launch", `Connected to ${gatewayUrl}`);
  }

  async startNativeTerminal(cwd: string): Promise<{ terminalId: string; pid: number }> {
    const started = await this.terminalService.start(process.platform === "win32" ? "pwsh" : "bash", cwd);
    this.activityFeed.append("terminal", "terminal.start", `${started.terminalId}:${started.pid}`);
    return started;
  }

  canNotify(): boolean {
    return this.notificationsEnabled;
  }

  hasTray(): boolean {
    return this.trayEnabled;
  }

  hasGlobalShortcut(shortcut: string): boolean {
    return this.shortcuts.has(shortcut);
  }
}
