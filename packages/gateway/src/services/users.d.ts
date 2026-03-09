import type { JaitDB } from "../db/connection.js";
export type ThemeMode = "light" | "dark" | "system";
export type SttProvider = "simulated" | "browser";
export type ChatProvider = "jait" | "codex" | "claude-code";
export interface UserRecord {
    id: string;
    username: string;
    createdAt: string;
    updatedAt: string;
}
export interface UserSettingsRecord {
    userId: string;
    theme: ThemeMode;
    apiKeys: Record<string, string>;
    disabledTools: string[];
    sttProvider: SttProvider;
    chatProvider: ChatProvider;
    updatedAt: string;
}
export declare class UserService {
    private readonly db;
    constructor(db: JaitDB);
    countUsers(): number;
    findByUsername(username: string): UserRecord | null;
    findById(id: string): UserRecord | null;
    createUser(username: string, password: string): UserRecord;
    verifyCredentials(username: string, password: string): UserRecord | null;
    getSettings(userId: string): UserSettingsRecord;
    updateSettings(userId: string, patch: {
        theme?: ThemeMode;
        apiKeys?: Record<string, string>;
        disabledTools?: string[];
        sttProvider?: SttProvider;
        chatProvider?: ChatProvider;
    }): UserSettingsRecord;
    bindSessionToUser(userId: string, sessionId: string): boolean;
    clearArchivedSessions(userId: string): number;
}
//# sourceMappingURL=users.d.ts.map