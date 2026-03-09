export interface HookEvent<T = unknown> {
    type: string;
    timestamp: string;
    payload: T;
}
type HookHandler = (event: HookEvent) => void;
export declare class HookBus {
    private handlers;
    on(eventType: string, handler: HookHandler): () => void;
    off(eventType: string, handler: HookHandler): void;
    emit<T = unknown>(type: string, payload: T): void;
    listenerCount(eventType?: string): number;
    registeredEventTypes(): string[];
}
interface BuiltInHooksOptions {
    defaultWorkspaceRoot?: string;
}
export declare function registerBuiltInHooks(hooks: HookBus, options?: BuiltInHooksOptions): void;
export {};
//# sourceMappingURL=hooks.d.ts.map