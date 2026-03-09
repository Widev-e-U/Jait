import { DesktopActivityFeed } from "./activity-feed.js";
import { DesktopTerminalService } from "./terminal-session.js";
export class DesktopApp {
    deps;
    activityFeed = new DesktopActivityFeed();
    terminalService;
    trayEnabled = false;
    notificationsEnabled = false;
    shortcuts = new Set();
    constructor(deps) {
        this.deps = deps;
        this.terminalService = new DesktopTerminalService(deps.terminalAdapter);
    }
    async launch(gatewayUrl) {
        await this.deps.transport.connect(gatewayUrl);
        this.trayEnabled = true;
        this.notificationsEnabled = true;
        this.shortcuts.add("Alt+Space");
        this.activityFeed.append("agent", "desktop.launch", `Connected to ${gatewayUrl}`);
    }
    async startNativeTerminal(cwd) {
        const started = await this.terminalService.start(process.platform === "win32" ? "pwsh" : "bash", cwd);
        this.activityFeed.append("terminal", "terminal.start", `${started.terminalId}:${started.pid}`);
        return started;
    }
    canNotify() {
        return this.notificationsEnabled;
    }
    hasTray() {
        return this.trayEnabled;
    }
    hasGlobalShortcut(shortcut) {
        return this.shortcuts.has(shortcut);
    }
}
//# sourceMappingURL=main.js.map