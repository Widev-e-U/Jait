import { createActivityEvent, type ActivityEvent, type ActivityEventSource } from "@jait/ui-shared";

export class DesktopActivityFeed {
  private readonly events: ActivityEvent[] = [];

  append(source: ActivityEventSource, title: string, detail: string): ActivityEvent {
    const entry = createActivityEvent({ source, title, detail });
    this.events.unshift(entry);
    return entry;
  }

  list(limit = 100): ActivityEvent[] {
    return this.events.slice(0, limit);
  }
}
