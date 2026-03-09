import type { MemoryBackend, MemoryEntry, MemoryScope, MemoryService, SaveMemoryInput } from "./contracts.js";
export interface MemoryEngineOptions {
    backend: MemoryBackend;
    memoryDir?: string;
}
export declare class MemoryEngine implements MemoryService {
    private readonly backend;
    private readonly memoryDir?;
    constructor(options: MemoryEngineOptions);
    save(input: SaveMemoryInput): Promise<MemoryEntry>;
    search(query: string, limit?: number, scope?: MemoryScope): Promise<MemoryEntry[]>;
    forget(id: string): Promise<boolean>;
    forgetExpired(now?: Date): Promise<number>;
    flushPreCompaction(sessionId: string, snippets: string[]): Promise<number>;
    private writeMemoryLog;
}
//# sourceMappingURL=service.d.ts.map