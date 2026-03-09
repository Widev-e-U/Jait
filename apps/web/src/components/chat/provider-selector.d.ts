/**
 * ProviderSelector — dropdown to choose the agent provider for chat.
 * Follows the same pattern as ModeSelector.
 */
import { type ProviderId } from '@/lib/agents-api';
interface ProviderSelectorProps {
    provider: ProviderId;
    onChange: (provider: ProviderId) => void;
    disabled?: boolean;
    className?: string;
}
export declare function ProviderSelector({ provider, onChange, disabled, className }: ProviderSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=provider-selector.d.ts.map