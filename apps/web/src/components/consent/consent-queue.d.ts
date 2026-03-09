export interface ConsentQueueProps {
    className?: string;
    /** If true, shows compact action cards instead of full cards */
    compact?: boolean;
    /** If provided, only show consent requests for this session */
    sessionId?: string | null;
    /** Called when approve-all mode is successfully enabled */
    onApproveAllEnabled?: () => void;
}
export declare function ConsentQueue({ className, compact, sessionId, onApproveAllEnabled }: ConsentQueueProps): import("react").JSX.Element | null;
//# sourceMappingURL=consent-queue.d.ts.map