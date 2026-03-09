export type ThemeMode = 'light' | 'dark' | 'system';
export type SttProvider = 'simulated' | 'browser';
export type ChatProvider = 'jait' | 'codex' | 'claude-code';
interface User {
    id: string;
    username: string;
}
interface UserSettings {
    theme: ThemeMode;
    api_keys: Record<string, string>;
    stt_provider: SttProvider;
    chat_provider: ChatProvider;
    updated_at: string;
}
interface AuthResponse {
    access_token: string;
    user: User;
}
export declare function useAuth(): {
    user: User | null;
    token: string | null;
    settings: UserSettings;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<AuthResponse>;
    register: (username: string, password: string) => Promise<AuthResponse>;
    logout: () => void;
    bindSession: (sessionId: string) => Promise<void>;
    refreshSettings: () => Promise<UserSettings | null>;
    updateSettings: (patch: {
        theme?: ThemeMode;
        api_keys?: Record<string, string>;
        stt_provider?: SttProvider;
        chat_provider?: ChatProvider;
    }) => Promise<UserSettings>;
    clearSessionArchive: () => Promise<{
        ok: boolean;
        removed: number;
    }>;
};
export {};
//# sourceMappingURL=useAuth.d.ts.map