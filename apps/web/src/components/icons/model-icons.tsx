/**
 * Model icons using @lobehub/icons
 * Maps LLM providers and models to their icons
 * Uses deep imports to avoid pulling in @lobehub/ui features
 */

function JaitIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={className}
    >
      <path
        d="M318 372 L430 486 L318 600"
        fill="none"
        stroke="currentColor"
        strokeWidth="88"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715"
        fill="none"
        stroke="currentColor"
        strokeWidth="88"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

import OpenAI from '@lobehub/icons/es/OpenAI'
import Anthropic from '@lobehub/icons/es/Anthropic'
import Ollama from '@lobehub/icons/es/Ollama'
import Claude from '@lobehub/icons/es/Claude'
import Qwen from '@lobehub/icons/es/Qwen'
import Meta from '@lobehub/icons/es/Meta'
import Mistral from '@lobehub/icons/es/Mistral'
import DeepSeek from '@lobehub/icons/es/DeepSeek'
import Gemini from '@lobehub/icons/es/Gemini'
import Grok from '@lobehub/icons/es/Grok'

// Alias Meta as Llama for clarity
const Llama = Meta

export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'local'

export interface ModelIconProps {
  provider: string
  model?: string
  size?: number
  className?: string
}

// Map model names to their icons
const MODEL_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  // OpenAI models
  'gpt-4': OpenAI,
  'gpt-4o': OpenAI,
  'gpt-4-turbo': OpenAI,
  'gpt-5': OpenAI,
  'gpt-3.5-turbo': OpenAI,
  'o1': OpenAI,
  'o1-mini': OpenAI,
  'o1-preview': OpenAI,
  'codex': OpenAI,
  
  // Anthropic models
  'claude-3': Claude,
  'claude-3-opus': Claude,
  'claude-3-sonnet': Claude,
  'claude-sonnet': Claude,
  'claude-3-haiku': Claude,
  'claude-2': Claude,
  
  // Qwen models (Ollama)
  'qwen': Qwen,
  'qwen2': Qwen,
  'qwen2.5': Qwen,
  'qwen3': Qwen,
  
  // Llama models
  'llama': Llama,
  'llama2': Llama,
  'llama3': Llama,
  'llama3.1': Llama,
  'llama3.2': Llama,
  
  // Mistral / Dolphin (dolphin fine-tunes of Mistral)
  'mistral': Mistral,
  'mixtral': Mistral,
  'dolphin': Mistral,
  'dolphin-mistral': Mistral,
  'dolphin-mistral-nemo': Mistral,
  
  // DeepSeek
  'deepseek': DeepSeek,
  'deepseek-coder': DeepSeek,
  
  // Gemini
  'gemini': Gemini,
  'gemini-pro': Gemini,
  
  // Grok
  'grok': Grok,
}

// Provider icons as fallback
const PROVIDER_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  openai: OpenAI,
  anthropic: Claude,
  ollama: Ollama,
  local: Llama, // Default for local models
  jait: JaitIcon,
}

/**
 * Get the appropriate icon component for a model
 */
export function getModelIcon(provider: string, model?: string): React.ComponentType<{ size?: number; className?: string }> {
  if (model) {
    // Try exact match first
    if (MODEL_ICONS[model]) {
      return MODEL_ICONS[model]
    }
    
    // Try prefix match (e.g., "qwen3:14b" matches "qwen3")
    const modelBase = model.split(':')[0].toLowerCase()
    // Strip org prefix like "CognitiveComputations/"
    const modelName = modelBase.includes('/') ? modelBase.split('/').pop()! : modelBase
    for (const [key, icon] of Object.entries(MODEL_ICONS)) {
      if (modelName.startsWith(key.toLowerCase()) || key.toLowerCase().startsWith(modelName)) {
        return icon
      }
    }
  }
  
  // Fall back to provider icon
  return PROVIDER_ICONS[provider] ?? PROVIDER_ICONS.ollama
}

/**
 * Model icon component
 */
export function ModelIcon({ provider, model, size = 20, className }: ModelIconProps) {
  const IconComponent = getModelIcon(provider, model)
  return <IconComponent size={size} className={className} />
}

/**
 * Provider name display
 */
export function getProviderDisplayName(provider: ProviderType): string {
  const names: Record<ProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama',
    local: 'Local',
  }
  return names[provider] || provider
}

/**
 * Get model display name (without version tags)
 */
export function getModelDisplayName(model: string): string {
  // Strip org prefix like "CognitiveComputations/"
  const withoutOrg = model.includes('/') ? model.split('/').pop()! : model
  // Remove version suffixes like ":14b", ":latest"
  const parts = withoutOrg.split(':')
  const baseName = parts[0]
  const version = parts[1]
  
  // Capitalize and format
  const formatted = baseName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  
  if (version && !['latest', 'stable'].includes(version.toLowerCase())) {
    return `${formatted} ${version.toUpperCase()}`
  }
  
  return formatted
}

export { OpenAI, Anthropic, Ollama, Claude, Qwen, Meta as Llama, Mistral, DeepSeek, Gemini, Grok, JaitIcon }
