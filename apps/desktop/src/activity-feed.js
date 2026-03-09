import { createActivityEvent } from "@jait/ui-shared";
export class DesktopActivityFeed {
    events = [];
    append(source, title, detail) {
        const entry = createActivityEvent({ source, title, detail });
        this.events.unshift(entry);
        return entry;
    }
    list(limit = 100) {
        return this.events.slice(0, limit);
    }
}
//# sourceMappingURL=activity-feed.js.map