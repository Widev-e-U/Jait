import { ScrollArea } from '@/components/ui/scroll-area';
export function ActivityFeed({ events }) {
    return (<ScrollArea className="h-full w-full">
      <div className="p-4 space-y-2">
        {events.length === 0 ? (<p className="text-sm text-muted-foreground">No activity yet.</p>) : events.map((event) => (<div key={event.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{event.title}</p>
              <span className="text-xs text-muted-foreground">{event.source}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{event.detail}</p>
          </div>))}
      </div>
    </ScrollArea>);
}
//# sourceMappingURL=activity-feed.js.map