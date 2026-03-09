export interface ToolCallInfo {
    callId: string;
    tool: string;
    args: Record<string, unknown>;
    status: 'pending' | 'running' | 'success' | 'error';
    result?: {
        ok: boolean;
        message: string;
        data?: unknown;
    };
    streamingOutput?: string;
    /** Accumulated raw JSON argument string while LLM is still streaming the tool call */
    streamingArgs?: string;
    startedAt: number;
    completedAt?: number;
}
interface ToolCallCardProps {
    call: ToolCallInfo;
    onOpenTerminal?: (terminalId: string | null) => void;
}
export declare function ToolCallCard({ call, onOpenTerminal }: ToolCallCardProps): import("react").JSX.Element;
/** Group of tool call cards rendered between message content */
interface ToolCallGroupProps {
    calls: ToolCallInfo[];
    onOpenTerminal?: (terminalId: string | null) => void;
}
export declare function ToolCallGroup({ calls, onOpenTerminal }: ToolCallGroupProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=tool-call-card.d.ts.map