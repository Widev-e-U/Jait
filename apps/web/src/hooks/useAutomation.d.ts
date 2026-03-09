/**
 * useAutomation — hook encapsulating Manager-mode state.
 *
 * Manages repositories (DB-backed via API), threads, activities, and providers
 * for the automation / "Manager" workflow.  Extracted from AutomationPage
 * so it can be used inside the merged Chat view.
 */
import { type ProviderId } from '@/lib/agents-api';
import { type AutomationRepository } from '@/lib/automation-repositories';
import { type GitStatusPr } from '@/lib/git-api';
export type RepositoryConnection = AutomationRepository;
export type ThreadPrState = GitStatusPr['state'] | null;
export declare function useAutomation(enabled?: boolean): {
    repositories: any[];
    selectedRepoId: string | null;
    setSelectedRepoId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    selectedRepo: any;
    folderPickerOpen: boolean;
    setFolderPickerOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    handleFolderSelected: (path: string) => Promise<void>;
    removeRepository: (id: string) => Promise<void>;
    threads: AgentThread[];
    repoThreads: AgentThread[];
    selectedThreadId: string | null;
    setSelectedThreadId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    selectedThread: any;
    threadPrStates: Record<string, any>;
    ghAvailable: boolean;
    activities: ThreadActivity[];
    activityEndRef: import("react").RefObject<HTMLDivElement | null>;
    providers: ProviderInfo[];
    loading: boolean;
    error: string | null;
    setError: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    creating: false;
    showGitActions: boolean;
    refresh: () => Promise<void>;
    handleSend: (text: string, providerId?: ProviderId, model?: string | null) => Promise<void>;
    handleStop: (id: string) => Promise<void>;
    handleDelete: (id: string) => Promise<void>;
    handleThreadEvent: (eventType: string, payload: Record<string, unknown>) => void;
};
//# sourceMappingURL=useAutomation.d.ts.map