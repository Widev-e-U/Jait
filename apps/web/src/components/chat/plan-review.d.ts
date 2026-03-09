export interface PlanAction {
    id: string;
    tool: string;
    args: unknown;
    description: string;
    order: number;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
    result?: {
        ok: boolean;
        message: string;
        data?: unknown;
    };
}
export interface PlanData {
    plan_id: string;
    summary: string;
    actions: PlanAction[];
}
interface PlanReviewProps {
    plan: PlanData;
    onApprove: (actionIds?: string[]) => void;
    onReject: () => void;
    isExecuting?: boolean;
    className?: string;
}
export declare function PlanReview({ plan, onApprove, onReject, isExecuting, className }: PlanReviewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=plan-review.d.ts.map