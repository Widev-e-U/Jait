export type ActivityEventSource = "terminal" | "browser" | "filesystem" | "agent" | "chat";

export interface ActivityEvent {
  id: string;
  source: ActivityEventSource;
  title: string;
  detail: string;
  createdAt: string;
}

export function createActivityEvent(input: Omit<ActivityEvent, "id" | "createdAt"> & Partial<Pick<ActivityEvent, "id" | "createdAt">>): ActivityEvent {
  return {
    id: input.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: input.source,
    title: input.title,
    detail: input.detail,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
