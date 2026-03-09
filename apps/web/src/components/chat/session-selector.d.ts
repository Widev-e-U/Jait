import type { Session } from '@/hooks/useSessions';
interface SessionSelectorProps {
    sessions: Session[];
    activeSessionId: string | null;
    onSelect: (sessionId: string) => void;
    onCreate: () => void;
    onArchive: (sessionId: string) => void;
}
export declare function SessionSelector({ sessions, activeSessionId, onSelect, onCreate, onArchive, }: SessionSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=session-selector.d.ts.map