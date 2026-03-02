export interface NativeTerminalAdapter {
  spawn(command: string, cwd: string): Promise<{ terminalId: string; pid: number }>;
}

export class DesktopTerminalService {
  constructor(private readonly adapter: NativeTerminalAdapter) {}

  async start(command: string, cwd: string): Promise<{ terminalId: string; pid: number }> {
    return this.adapter.spawn(command, cwd);
  }
}
