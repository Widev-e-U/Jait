import type { ChatMode } from '@/components/chat/mode-selector';
import type { ViewMode } from '@/components/chat/view-mode-selector';
import type { ProviderId } from '@/lib/agents-api';
export interface ReferencedFile {
    path: string;
    name: string;
}
interface PromptInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (chipFiles?: ReferencedFile[]) => void;
    onStop?: () => void;
    /** Queue a message while the agent is busy (shown as dropdown option). */
    onQueue?: (chipFiles?: ReferencedFile[]) => void;
    isLoading?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    onVoiceInput?: () => void;
    viewMode?: ViewMode;
    onViewModeChange?: (viewMode: ViewMode) => void;
    mode?: ChatMode;
    onModeChange?: (mode: ChatMode) => void;
    provider?: ProviderId;
    onProviderChange?: (provider: ProviderId) => void;
    /** Model override for CLI providers (codex / claude-code). */
    cliModel?: string | null;
    onCliModelChange?: (model: string | null) => void;
    /** All files available for @ mention (pre-loaded from visible tree) */
    availableFiles?: ReferencedFile[];
    /** Lazy search across the entire workspace directory */
    onSearchFiles?: (query: string, limit: number, signal?: AbortSignal) => Promise<ReferencedFile[]>;
    /** Whether a workspace directory is currently open — @ mentions only work when true */
    workspaceOpen?: boolean;
}
export interface PromptInputHandle {
    /** Insert a file chip into the input (used by workspace Send button). */
    insertChip: (file: ReferencedFile) => void;
}
export declare const PromptInput: import("react").ForwardRefExoticComponent<PromptInputProps & import("react").RefAttributes<PromptInputHandle>>;
export {};
//# sourceMappingURL=prompt-input.d.ts.map