export interface ConsentRequestInfo {
    id: string;
    actionId: string;
    toolName: string;
    summary: string;
    preview: Record<string, unknown>;
    risk: 'low' | 'medium' | 'high';
    sessionId: string;
    createdAt: string;
    expiresAt: string;
    status: 'pending' | 'approved' | 'rejected' | 'timeout';
}
export interface ConsentDecisionInfo {
    requestId: string;
    actionId: string;
    approved: boolean;
    decidedAt: string;
    decidedVia: string;
    reason?: string;
}
export declare function useConsentQueue(sessionId?: string | null): {
    queue: ConsentRequestInfo[];
    approve: (requestId: string) => Promise<void>;
    reject: (requestId: string, reason?: string) => Promise<void>;
    approveAllForSession: (targetSessionId: string, reason?: string) => Promise<boolean>;
    refresh: () => Promise<void>;
};
export interface ActionCardProps {
    request: ConsentRequestInfo;
    onApprove: (requestId: string) => void;
    onReject: (requestId: string, reason?: string) => void;
    compact?: boolean;
}
export declare function ActionCard({ request, onApprove, onReject, compact }: ActionCardProps): import("react").JSX.Element;
//# sourceMappingURL=action-card.d.ts.map