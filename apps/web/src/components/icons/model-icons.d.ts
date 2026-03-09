/**
 * Model icons using @lobehub/icons
 * Maps LLM providers and models to their icons
 * Uses deep imports to avoid pulling in @lobehub/ui features
 */
import OpenAI from '@lobehub/icons/es/OpenAI';
import Anthropic from '@lobehub/icons/es/Anthropic';
import Ollama from '@lobehub/icons/es/Ollama';
import Claude from '@lobehub/icons/es/Claude';
import Qwen from '@lobehub/icons/es/Qwen';
import Meta from '@lobehub/icons/es/Meta';
import Mistral from '@lobehub/icons/es/Mistral';
import DeepSeek from '@lobehub/icons/es/DeepSeek';
import Gemini from '@lobehub/icons/es/Gemini';
import Grok from '@lobehub/icons/es/Grok';
export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'local';
export interface ModelIconProps {
    provider: string;
    model?: string;
    size?: number;
    className?: string;
}
/**
 * Get the appropriate icon component for a model
 */
export declare function getModelIcon(provider: string, model?: string): React.ComponentType<{
    size?: number;
    className?: string;
}>;
/**
 * Model icon component
 */
export declare function ModelIcon({ provider, model, size, className }: ModelIconProps): import("react").JSX.Element;
/**
 * Provider name display
 */
export declare function getProviderDisplayName(provider: ProviderType): string;
/**
 * Get model display name (without version tags)
 */
export declare function getModelDisplayName(model: string): string;
export { OpenAI, Anthropic, Ollama, Claude, Qwen, Meta as Llama, Mistral, DeepSeek, Gemini, Grok };
//# sourceMappingURL=model-icons.d.ts.map