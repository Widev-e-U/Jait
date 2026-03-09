import { type ScheduledJob } from '@/lib/jobs-api';
interface JobHistoryDialogProps {
    job: ScheduledJob | null;
    isOpen: boolean;
    onClose: () => void;
}
export declare function JobHistoryDialog({ job, isOpen, onClose }: JobHistoryDialogProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=JobHistoryDialog.d.ts.map