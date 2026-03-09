export interface SessionInfo {
    id: string;
    name: string | null;
    workspacePath: string | null;
    status: "active" | "archived" | "deleted";
    createdAt: string;
    lastActiveAt: string;
    metadata: string | null;
}
export interface SessionCreateParams {
    name?: string;
    workspacePath?: string;
}
//# sourceMappingURL=session.d.ts.map