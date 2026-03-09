import type { JaitDB } from "../db/index.js";
import type { MemoryBackend, MemoryEntry, MemoryScope } from "./contracts.js";
export declare class SqliteMemoryBackend implements MemoryBackend {
    private readonly db;
    constructor(db: JaitDB);
    save(entry: MemoryEntry): Promise<void>;
    list(scope?: MemoryScope): Promise<MemoryEntry[]>;
    forget(id: string): Promise<boolean>;
    forgetExpired(now?: Date): Promise<number>;
}
//# sourceMappingURL=sqlite-backend.d.ts.map