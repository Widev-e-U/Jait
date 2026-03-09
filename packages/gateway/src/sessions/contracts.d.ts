export interface SessionDescriptor {
    id: string;
    name: string;
    workspaceId: string;
    createdAt: string;
    lastActivityAt: string;
}
export interface SessionRouter {
    create(name: string, workspaceId: string): Promise<SessionDescriptor>;
    list(workspaceId?: string): Promise<SessionDescriptor[]>;
    activate(sessionId: string): Promise<void>;
    getActive(workspaceId: string): Promise<SessionDescriptor | null>;
}
//# sourceMappingURL=contracts.d.ts.map