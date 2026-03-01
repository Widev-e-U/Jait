export interface HookEvent<T = unknown> {
  type: string;
  timestamp: string;
  payload: T;
}

type HookHandler = (event: HookEvent) => void;

export class HookBus {
  private handlers = new Map<string, Set<HookHandler>>();

  on(eventType: string, handler: HookHandler): () => void {
    const bucket = this.handlers.get(eventType) ?? new Set<HookHandler>();
    bucket.add(handler);
    this.handlers.set(eventType, bucket);
    return () => this.off(eventType, handler);
  }

  off(eventType: string, handler: HookHandler): void {
    const bucket = this.handlers.get(eventType);
    if (!bucket) return;
    bucket.delete(handler);
    if (bucket.size === 0) this.handlers.delete(eventType);
  }

  emit<T = unknown>(type: string, payload: T): void {
    const event: HookEvent<T> = {
      type,
      timestamp: new Date().toISOString(),
      payload,
    };

    for (const [registeredType, handlers] of this.handlers.entries()) {
      if (registeredType === type || (registeredType.endsWith(".*") && type.startsWith(registeredType.slice(0, -1)))) {
        for (const handler of handlers) {
          handler(event as HookEvent);
        }
      }
    }
  }
}

export function registerBuiltInHooks(hooks: HookBus): void {
  hooks.on("session.start", () => undefined);
  hooks.on("session.end", () => undefined);
  hooks.on("session.compact", () => undefined);
  hooks.on("agent.error", () => undefined);
  hooks.on("surface.*", () => undefined);
}
