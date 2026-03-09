import type { ScheduledJob, JobRun } from '@/lib/jobs-api';
interface JobCardProps {
    job: ScheduledJob;
    recentRun?: JobRun | null;
    onToggle: (id: string, enabled: boolean) => void;
    onTrigger: (id: string) => void;
    onDelete: (id: string) => void;
    onEdit: (job: ScheduledJob) => void;
    onViewHistory: (job: ScheduledJob) => void;
    isLoading?: boolean;
}
export declare function JobCard({ job, recentRun, onToggle, onTrigger, onDelete, onEdit, onViewHistory, isLoading, }: JobCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=JobCard.d.ts.map