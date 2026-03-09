export interface ScheduledJob {
    id: string;
    name: string;
    cron: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface SchedulerService {
    create(job: Omit<ScheduledJob, "id" | "createdAt" | "updatedAt">): Promise<ScheduledJob>;
    list(): Promise<ScheduledJob[]>;
    remove(id: string): Promise<boolean>;
    trigger(id: string): Promise<void>;
}
//# sourceMappingURL=contracts.d.ts.map