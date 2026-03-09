/**
 * PTY Broker Client — communicates with the Node.js PTY broker subprocess.
 *
 * The broker runs under Node.js to work around Bun's broken node:net streams
 * that prevent node-pty ConPTY writes on Windows.
 */
export declare class PtyBrokerClient {
    private proc;
    private rl;
    private nextId;
    private pending;
    private ready;
    /** Callback when a PTY produces output */
    onOutput?: (ptyId: string, data: string) => void;
    /** Callback when a PTY process exits */
    onExit?: (ptyId: string, exitCode: number, signal?: number) => void;
    /**
     * Start the broker subprocess.
     * Resolves once the broker signals readiness on stderr.
     */
    start(): Promise<void>;
    private handleMessage;
    /** Send a command and wait for the response */
    private rpc;
    /** Spawn a new PTY process, returns { ptyId, pid } */
    spawn(opts: {
        shell?: string;
        cols?: number;
        rows?: number;
        cwd?: string;
        env?: Record<string, string>;
    }): Promise<{
        ptyId: string;
        pid: number;
    }>;
    /** Write data to a PTY */
    write(ptyId: string, data: string): Promise<void>;
    /** Resize a PTY */
    resize(ptyId: string, cols: number, rows: number): Promise<void>;
    /** Kill a PTY */
    kill(ptyId: string): Promise<void>;
    /** Gracefully stop the broker */
    stop(): Promise<void>;
    get isReady(): boolean;
}
//# sourceMappingURL=pty-broker-client.d.ts.map