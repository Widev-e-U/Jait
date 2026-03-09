/**
 * CliModelSelector — dropdown to choose a model when a CLI provider (codex / claude-code) is active.
 * Fetches available models from the gateway via `GET /api/providers/:id/models`.
 * Auto-selects the provider's default model on load.
 */
import { type ProviderId } from '@/lib/agents-api';
interface CliModelSelectorProps {
    provider: ProviderId;
    model: string | null;
    onChange: (model: string | null) => void;
    disabled?: boolean;
    className?: string;
}
export declare function CliModelSelector({ provider, model, onChange, disabled, className }: CliModelSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=cli-model-selector.d.ts.map