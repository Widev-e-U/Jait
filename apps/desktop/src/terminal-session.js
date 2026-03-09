export class DesktopTerminalService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async start(command, cwd) {
        return this.adapter.spawn(command, cwd);
    }
}
//# sourceMappingURL=terminal-session.js.map