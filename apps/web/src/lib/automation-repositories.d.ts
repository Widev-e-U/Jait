import type { AgentThread } from './agents-api';
export type AutomationRepositorySource = 'local' | 'shared';
export interface AutomationRepository {
    id: string;
    name: string;
    defaultBranch: string;
    localPath: string;
    deviceId?: string | null;
    source: AutomationRepositorySource;
}
export declare function inferThreadRepositoryName(thread: Pick<AgentThread, 'title' | 'workingDirectory'>): string | null;
export declare function threadBelongsToRepository(thread: Pick<AgentThread, 'title' | 'workingDirectory'>, repository: Pick<AutomationRepository, 'name' | 'localPath'>): boolean;
export declare function inferSharedRepositories(threads: AgentThread[], localRepositories: AutomationRepository[]): AutomationRepository[];
//# sourceMappingURL=automation-repositories.d.ts.map