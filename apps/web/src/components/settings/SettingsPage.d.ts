import type { ActivityEvent } from '@jait/ui-shared';
import type { SttProvider } from '@/hooks/useAuth';
interface SettingsPageProps {
    username: string;
    token: string | null;
    apiKeys: Record<string, string>;
    onSaveApiKeys: (next: Record<string, string>) => Promise<void>;
    sttProvider: SttProvider;
    onSttProviderChange: (next: SttProvider) => Promise<void>;
    onClearArchive: () => Promise<number>;
    activityEvents?: ActivityEvent[];
}
export declare function SettingsPage({ username, token, apiKeys, onSaveApiKeys, sttProvider, onSttProviderChange, onClearArchive, activityEvents, }: SettingsPageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=SettingsPage.d.ts.map