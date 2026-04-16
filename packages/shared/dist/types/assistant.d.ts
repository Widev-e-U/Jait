export interface AssistantProfile {
    id: string;
    userId: string | null;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    runtimeMode: "full-access" | "supervised" | null;
    toolProfile: string | null;
    enabledSkills: string[];
    enabledPlugins: string[];
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface CreateAssistantProfileParams {
    name: string;
    description?: string | null;
    systemPrompt?: string | null;
    runtimeMode?: "full-access" | "supervised" | null;
    toolProfile?: string | null;
    enabledSkills?: string[];
    enabledPlugins?: string[];
    isDefault?: boolean;
}
export interface UpdateAssistantProfileParams {
    name?: string;
    description?: string | null;
    systemPrompt?: string | null;
    runtimeMode?: "full-access" | "supervised" | null;
    toolProfile?: string | null;
    enabledSkills?: string[];
    enabledPlugins?: string[];
    isDefault?: boolean;
}
//# sourceMappingURL=assistant.d.ts.map