import { type ScheduledJob } from '@/lib/jobs-api';
interface CreateJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (job: ScheduledJob) => void;
    editJob?: ScheduledJob | null;
    onUpdated?: (job: ScheduledJob) => void;
}
export declare function CreateJobDialog({ isOpen, onClose, onCreated, editJob, onUpdated, }: CreateJobDialogProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=CreateJobDialog.d.ts.map