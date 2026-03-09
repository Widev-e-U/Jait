import { type ActivityEvent, type ActivityEventSource } from "@jait/ui-shared";
export declare class DesktopActivityFeed {
    private readonly events;
    append(source: ActivityEventSource, title: string, detail: string): ActivityEvent;
    list(limit?: number): ActivityEvent[];
}
//# sourceMappingURL=activity-feed.d.ts.map