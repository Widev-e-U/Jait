/**
 * RepositoryService — CRUD for automation repositories.
 *
 * Persists repos in SQLite so they sync across all devices.
 */
import type { JaitDB } from "../db/connection.js";
import { automationRepositories } from "../db/schema.js";
export interface CreateRepoParams {
    userId?: string;
    deviceId?: string;
    name: string;
    defaultBranch?: string;
    localPath: string;
}
export interface UpdateRepoParams {
    name?: string;
    defaultBranch?: string;
    localPath?: string;
    deviceId?: string;
}
export type RepoRow = typeof automationRepositories.$inferSelect;
export declare class RepositoryService {
    private db;
    constructor(db: JaitDB);
    create(params: CreateRepoParams): RepoRow;
    getById(id: string): RepoRow | undefined;
    list(userId?: string): RepoRow[];
    findByPath(localPath: string, userId?: string): RepoRow | undefined;
    update(id: string, params: UpdateRepoParams): RepoRow | undefined;
    delete(id: string): void;
}
//# sourceMappingURL=repositories.d.ts.map