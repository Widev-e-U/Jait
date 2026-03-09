import type { FastifyInstance } from "fastify";
import type { HookBus } from "../scheduler/hooks.js";
export declare function registerHookRoutes(app: FastifyInstance, deps: {
    hookSecret: string;
    hooks: HookBus;
    onWake: () => Promise<unknown>;
    onAgentHook: (payload: unknown) => Promise<unknown>;
}): void;
//# sourceMappingURL=hooks.d.ts.map