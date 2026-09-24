import type { ComponentType } from 'react'
import { Network } from 'lucide-react'
import Anthropic from '@lobehub/icons/es/Anthropic'
import Claude from '@lobehub/icons/es/Claude'
import ClaudeCode from '@lobehub/icons/es/ClaudeCode'
import Codex from '@lobehub/icons/es/Codex'
import Cursor from '@lobehub/icons/es/Cursor'
import DeepSeek from '@lobehub/icons/es/DeepSeek'
import Gemini from '@lobehub/icons/es/Gemini'
import GithubCopilot from '@lobehub/icons/es/GithubCopilot'
import Grok from '@lobehub/icons/es/Grok'
import Kimi from '@lobehub/icons/es/Kimi'
import Mistral from '@lobehub/icons/es/Mistral'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Ollama from '@lobehub/icons/es/Ollama'
import OpenAI from '@lobehub/icons/es/OpenAI'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import Perplexity from '@lobehub/icons/es/Perplexity'
import Qwen from '@lobehub/icons/es/Qwen'
import Windsurf from '@lobehub/icons/es/Windsurf'
import Zhipu from '@lobehub/icons/es/Zhipu'

/**
 * Shared provider brand-icon library.
 *
 * Every known agent/provider maps to its real brand icon sourced from
 * `@lobehub/icons`. `providerBrandIcon` resolves an arbitrary provider id or
 * provider type (including dynamic ACP agent ids such as `github-copilot-cli`)
 * to the correct brand glyph, so the UI never falls back to the generic
 * network icon for a provider that has a real logo.
 */

export type ProviderIconComponent = ComponentType<{ className?: string }>

/** Wrap a `@lobehub/icons` component so it renders at the selector's 16px size. */
const brand = (Icon: ComponentType<{ size?: number | string; className?: string }>): ProviderIconComponent => {
  const Wrapped = ({ className }: { className?: string }) => <Icon size={16} className={className} />
  Wrapped.displayName = (Icon as { displayName?: string }).displayName ?? 'ProviderBrandIcon'
  return Wrapped
}

// ---------------------------------------------------------------------------
// Custom glyphs for providers without an icon in `@lobehub/icons`.
// ---------------------------------------------------------------------------

export const JaitIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1024 1024" className={className}>
    <path d="M318 372 L430 486 L318 600" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M610 258 L610 642 C610 734 549 796 455 796 C393 796 338 766 299 715" fill="none" stroke="currentColor" strokeWidth="88" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Pi (pi.dev) — official pixel-art "pi" wordmark, sourced from pi.dev/logo.svg
export const PiIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 800 800" fill="none" className={className}>
    <rect width="800" height="800" rx="150" fill="#09090b" />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
    />
    <path fill="#fff" d="M517.36 400H634.72V634.72H517.36Z" />
  </svg>
)

// DeepAgents (multi-agent framework) has no dedicated brand icon — use a
// stack-of-agents glyph so it is distinct from the generic network fallback.
export const DeepAgentsIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className={className}>
    <rect x="4" y="3" width="16" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M8 6h8M8 9h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 17h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M14 19h5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
)

// ---------------------------------------------------------------------------
// Brand icons (individually exported for direct use in provider definitions).
// ---------------------------------------------------------------------------

export const OpenAIIcon = brand(OpenAI)
export const ClaudeIcon = brand(Claude)
export const ClaudeCodeIcon = brand(ClaudeCode)
export const CodexIcon = brand(Codex)
export const CursorIcon = brand(Cursor)
export const GeminiIcon = brand(Gemini)
export const GithubCopilotIcon = brand(GithubCopilot)
export const AnthropicIcon = brand(Anthropic)
export const DeepSeekIcon = brand(DeepSeek)
export const GrokIcon = brand(Grok)
export const KimiIcon = brand(Kimi)
export const MistralIcon = brand(Mistral)
export const MoonshotIcon = brand(Moonshot)
export const OllamaIcon = brand(Ollama)
export const OpenRouterIcon = brand(OpenRouter)
export const PerplexityIcon = brand(Perplexity)
export const QwenIcon = brand(Qwen)
export const WindsurfIcon = brand(Windsurf)
export const ZhipuIcon = brand(Zhipu)

const BRAND_ACCENT_CLASSES: Array<{ test: RegExp; className: string }> = [
  { test: /claude[-_]?code|claudecode|claude|anthropic/, className: 'text-orange-600 dark:text-orange-400' },
  { test: /codex/, className: 'text-indigo-600 dark:text-indigo-400' },
  { test: /deepseek/, className: 'text-blue-700 dark:text-blue-400' },
  { test: /gemini|google|vertex|pi[-_]?gemini/, className: 'text-blue-600 dark:text-blue-400' },
  { test: /kimi|moonshot/, className: 'text-violet-600 dark:text-violet-400' },
  { test: /mistral/, className: 'text-amber-600 dark:text-amber-400' },
  { test: /perplexity/, className: 'text-teal-600 dark:text-teal-400' },
  { test: /qwen|tongyi/, className: 'text-purple-600 dark:text-purple-400' },
  { test: /zhipu|chatglm|glm/, className: 'text-sky-600 dark:text-sky-400' },
]

/** Tint the same brand glyph used for read chats when a chat is unread. */
export function providerBrandAccentClass(idOrType: string | undefined | null): string {
  const key = idOrType?.trim().toLowerCase() ?? ''
  return BRAND_ACCENT_CLASSES.find(({ test }) => test.test(key))?.className ?? 'text-primary'
}

/**
 * Ordered provider-id/type → icon matchers. The first matching pattern wins, so
 * more specific patterns (e.g. `claude-code`, `github-copilot`) must precede
 * broader ones (`claude`, `codex`). Matchers are applied against a normalized
 * lowercase provider id/type.
 */
const MATCHERS: Array<{ test: RegExp; icon: ProviderIconComponent }> = [
  { test: /(^|[-_/])jait([-_/]|$)|^jait$/, icon: JaitIcon },
  { test: /copilot/, icon: GithubCopilotIcon },
  { test: /claude[-_]?code|claudecode/, icon: ClaudeCodeIcon },
  { test: /anthropic/, icon: AnthropicIcon },
  { test: /claude/, icon: ClaudeIcon },
  { test: /codex/, icon: CodexIcon },
  { test: /cursor/, icon: CursorIcon },
  { test: /windsurf|codeium/, icon: WindsurfIcon },
  { test: /deepseek/, icon: DeepSeekIcon },
  { test: /grok|xai|x-ai/, icon: GrokIcon },
  { test: /kimi/, icon: KimiIcon },
  { test: /moonshot/, icon: MoonshotIcon },
  { test: /mistral/, icon: MistralIcon },
  { test: /ollama/, icon: OllamaIcon },
  { test: /perplexity/, icon: PerplexityIcon },
  { test: /openrouter/, icon: OpenRouterIcon },
  { test: /qwen|tongyi/, icon: QwenIcon },
  { test: /zhipu|chatglm|glm/, icon: ZhipuIcon },
  { test: /gemini|google|vertex/, icon: GeminiIcon },
  { test: /deepagents|deep[-_]?agents/, icon: DeepAgentsIcon },
  { test: /pi[-_]?gemini/, icon: GeminiIcon },
  { test: /(^|[-_/])pi([-_/]|$)/, icon: PiIcon },
  { test: /openai|open[-_]?ai/, icon: OpenAIIcon },
]

/**
 * Resolve the brand icon for a provider id or provider type. Returns `null`
 * when no brand icon is known, letting callers decide on a generic fallback.
 */
export function providerBrandIcon(idOrType: string | undefined | null): ProviderIconComponent | null {
  if (!idOrType) return null
  const key = idOrType.trim().toLowerCase()
  if (!key) return null
  for (const { test, icon } of MATCHERS) {
    if (test.test(key)) return icon
  }
  return null
}

/** Resolve the brand icon for a provider, falling back to the generic network icon. */
export function providerIcon(idOrType: string | undefined | null): ProviderIconComponent {
  return providerBrandIcon(idOrType) ?? Network
}

/**
 * Sanitize a provider-advertised logo URL.
 *
 * Agent registries (for example ACP agents) may advertise an `icon` URL. Only
 * absolute `https:` URLs are accepted: `javascript:`, `data:`, `http:` and
 * relative values are rejected so a malicious or misconfigured provider cannot
 * inject script or leak over plaintext. Returns `undefined` when unusable.
 */
export function providerIconUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:') return undefined
  if (!parsed.hostname) return undefined
  return parsed.href
}
