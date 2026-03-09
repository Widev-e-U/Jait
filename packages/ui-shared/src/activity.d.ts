export type ActivityEventSource = "terminal" | "browser" | "filesystem" | "agent" | "chat";
export interface ActivityEvent {
    id: string;
    source: ActivityEventSource;
    title: string;
    detail: string;
    createdAt: string;
}
export declare function createActivityEvent(input: Omit<ActivityEvent, "id" | "createdAt"> & Partial<Pick<ActivityEvent, "id" | "createdAt">>): ActivityEvent;
//# sourceMappingURL=activity.d.ts.map