import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
export class HookBus {
    handlers = new Map();
    on(eventType, handler) {
        const bucket = this.handlers.get(eventType) ?? new Set();
        bucket.add(handler);
        this.handlers.set(eventType, bucket);
        return () => this.off(eventType, handler);
    }
    off(eventType, handler) {
        const bucket = this.handlers.get(eventType);
        if (!bucket)
            return;
        bucket.delete(handler);
        if (bucket.size === 0)
            this.handlers.delete(eventType);
    }
    emit(type, payload) {
        const event = {
            type,
            timestamp: new Date().toISOString(),
            payload,
        };
        for (const [registeredType, handlers] of this.handlers.entries()) {
            if (registeredType === type || (registeredType.endsWith(".*") && type.startsWith(registeredType.slice(0, -1)))) {
                for (const handler of handlers) {
                    handler(event);
                }
            }
        }
    }
    listenerCount(eventType) {
        if (eventType)
            return this.handlers.get(eventType)?.size ?? 0;
        let total = 0;
        for (const handlers of this.handlers.values()) {
            total += handlers.size;
        }
        return total;
    }
    registeredEventTypes() {
        return [...this.handlers.keys()];
    }
}
const BOOTSTRAP_PATHS = [
    ".jait/bootstrap.md",
    ".jait/session-bootstrap.md",
    "BOOTSTRAP.md",
];
function loadBootstrapFiles(workspaceRoot) {
    const loaded = [];
    for (const relativePath of BOOTSTRAP_PATHS) {
        const absolutePath = join(workspaceRoot, relativePath);
        if (!existsSync(absolutePath))
            continue;
        loaded.push({ path: relativePath, content: readFileSync(absolutePath, "utf8") });
    }
    return loaded;
}
export function registerBuiltInHooks(hooks, options = {}) {
    hooks.on("session.start", (event) => {
        const payload = (event.payload ?? {});
        const workspaceRoot = payload.workspaceRoot ?? options.defaultWorkspaceRoot ?? process.cwd();
        const files = loadBootstrapFiles(workspaceRoot);
        hooks.emit("session.bootstrap.loaded", {
            sessionId: payload.sessionId,
            workspaceRoot,
            fileCount: files.length,
            files,
        });
    });
    hooks.on("session.end", () => undefined);
    hooks.on("session.compact", () => undefined);
    hooks.on("agent.error", () => undefined);
    hooks.on("surface.*", () => undefined);
}
//# sourceMappingURL=hooks.js.map