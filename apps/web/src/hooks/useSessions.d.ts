export interface Session {
    id: string;
    name: string | null;
    workspacePath: string | null;
    status: 'active' | 'archived' | 'deleted';
    createdAt: string;
    lastActiveAt: string;
    metadata: string | null;
}
export declare function useSessions(token?: string | null, onLoginRequired?: () => void): {
    sessions: Session[];
    activeSessionId: string | null;
    loading: boolean;
    fetchSessions: () => Promise<void>;
    createSession: (name?: string) => Promise<Session | null>;
    switchSession: (sessionId: string) => void;
    archiveSession: (sessionId: string) => Promise<void>;
};
//# sourceMappingURL=useSessions.d.ts.map