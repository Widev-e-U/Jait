import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

  listenerCount(eventType?: string): number {
    if (eventType) return this.handlers.get(eventType)?.size ?? 0;
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.size;
    }
    return total;
  }

  registeredEventTypes(): string[] {
    return [...this.handlers.keys()];
  }
}

interface SessionStartPayload {
  sessionId: string;
  projectRoot?: string;
}

interface BuiltInHooksOptions {
  defaultProjectRoot?: string;
}

const BOOTSTRAP_PATHS = [
  ".jait/bootstrap.md",
  ".jait/session-bootstrap.md",
  "BOOTSTRAP.md",
] as const;

function loadBootstrapFiles(projectRoot: string): Array<{ path: string; content: string }> {
  const loaded: Array<{ path: string; content: string }> = [];
  for (const relativePath of BOOTSTRAP_PATHS) {
    const absolutePath = join(projectRoot, relativePath);
    if (!existsSync(absolutePath)) continue;
    loaded.push({ path: relativePath, content: readFileSync(absolutePath, "utf8") });
  }
  return loaded;
}

export function registerBuiltInHooks(hooks: HookBus, options: BuiltInHooksOptions = {}): void {
  hooks.on("session.start", (event) => {
    const payload = (event.payload ?? {}) as SessionStartPayload;
    const projectRoot = payload.projectRoot ?? options.defaultProjectRoot ?? process.cwd();
    const files = loadBootstrapFiles(projectRoot);
    hooks.emit("session.bootstrap.loaded", {
      sessionId: payload.sessionId,
      projectRoot,
      fileCount: files.length,
      files,
    });
  });
  hooks.on("session.end", () => undefined);
  hooks.on("session.compact", () => undefined);
  hooks.on("agent.error", () => undefined);
  hooks.on("surface.*", () => undefined);
}
