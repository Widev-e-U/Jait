import '@xterm/xterm/css/xterm.css';
export interface TerminalInfo {
    id: string;
    type: string;
    state: string;
    sessionId: string;
    metadata: Record<string, unknown>;
}
export declare function useTerminals(): {
    terminals: TerminalInfo[];
    activeTerminalId: string | null;
    setActiveTerminalId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    createTerminal: (sessionId: string, workspaceRoot?: string) => Promise<TerminalInfo>;
    killTerminal: (id: string) => Promise<void>;
    refresh: () => Promise<TerminalInfo[]>;
};
interface TerminalViewProps {
    terminalId: string;
    className?: string;
}
export declare function TerminalView({ terminalId, className }: TerminalViewProps): import("react").JSX.Element;
interface TerminalTabsProps {
    terminals: TerminalInfo[];
    activeTerminalId: string | null;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onKill: (id: string) => void;
}
export declare function TerminalTabs({ terminals, activeTerminalId, onSelect, onCreate, onKill }: TerminalTabsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=terminal-view.d.ts.map