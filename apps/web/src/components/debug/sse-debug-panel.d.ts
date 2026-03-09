export interface SSEDebugEvent {
    id: number;
    ts: number;
    type: string;
    raw: string;
}
export declare function pushSSEDebugEvent(type: string, raw: string): void;
export declare function clearSSEDebugEvents(): void;
interface SSEDebugPanelProps {
    onClose: () => void;
}
export declare function SSEDebugPanel({ onClose }: SSEDebugPanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=sse-debug-panel.d.ts.map