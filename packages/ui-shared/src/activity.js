export function createActivityEvent(input) {
    return {
        id: input.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: input.source,
        title: input.title,
        detail: input.detail,
        createdAt: input.createdAt ?? new Date().toISOString(),
    };
}
//# sourceMappingURL=activity.js.map