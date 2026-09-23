import { describe, expect, it } from 'vitest'
import { Network } from 'lucide-react'
import {
  AnthropicIcon,
  ClaudeCodeIcon,
  ClaudeIcon,
  CodexIcon,
  CursorIcon,
  DeepAgentsIcon,
  DeepSeekIcon,
  GeminiIcon,
  GithubCopilotIcon,
  GrokIcon,
  JaitIcon,
  KimiIcon,
  MistralIcon,
  MoonshotIcon,
  OllamaIcon,
  OpenAIIcon,
  OpenRouterIcon,
  PerplexityIcon,
  PiIcon,
  QwenIcon,
  WindsurfIcon,
  ZhipuIcon,
  providerBrandIcon,
  providerIcon,
  providerIconUrl,
} from './provider-icons'

describe('providerBrandIcon', () => {
  it('resolves every curated provider id/type to its brand icon', () => {
    const cases: Array<[string, unknown]> = [
      ['jait', JaitIcon],
      ['github-copilot-cli', GithubCopilotIcon],
      ['copilot', GithubCopilotIcon],
      ['claude-code', ClaudeCodeIcon],
      ['claudecode', ClaudeCodeIcon],
      ['anthropic', AnthropicIcon],
      ['claude', ClaudeIcon],
      ['codex', CodexIcon],
      ['cursor', CursorIcon],
      ['windsurf', WindsurfIcon],
      ['codeium', WindsurfIcon],
      ['deepseek', DeepSeekIcon],
      ['grok', GrokIcon],
      ['xai', GrokIcon],
      ['kimi', KimiIcon],
      ['moonshot', MoonshotIcon],
      ['mistral', MistralIcon],
      ['ollama', OllamaIcon],
      ['perplexity', PerplexityIcon],
      ['openrouter', OpenRouterIcon],
      ['qwen', QwenIcon],
      ['zhipu', ZhipuIcon],
      ['chatglm', ZhipuIcon],
      ['gemini', GeminiIcon],
      ['vertex', GeminiIcon],
      ['deepagents', DeepAgentsIcon],
      ['deep-agents', DeepAgentsIcon],
      ['pi-gemini', GeminiIcon],
      ['pi', PiIcon],
      ['openai', OpenAIIcon],
    ]
    for (const [id, expected] of cases) {
      expect(providerBrandIcon(id), `expected ${id} to resolve to its brand icon`).toBe(expected)
    }
  })

  it('prefers more specific patterns over broader ones', () => {
    // `claude-code` must win over the broader `claude` matcher.
    expect(providerBrandIcon('claude-code')).toBe(ClaudeCodeIcon)
    expect(providerBrandIcon('claude')).toBe(ClaudeIcon)
    // `pi-gemini` must win over the broader `pi` matcher.
    expect(providerBrandIcon('pi-gemini')).toBe(GeminiIcon)
    expect(providerBrandIcon('pi')).toBe(PiIcon)
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(providerBrandIcon('  Claude-Code ')).toBe(ClaudeCodeIcon)
    expect(providerBrandIcon('GitHub-Copilot-CLI')).toBe(GithubCopilotIcon)
  })

  it('returns null for unknown or empty input so callers own the fallback', () => {
    expect(providerBrandIcon('some-unknown-acp-agent')).toBeNull()
    expect(providerBrandIcon('')).toBeNull()
    expect(providerBrandIcon('   ')).toBeNull()
    expect(providerBrandIcon(undefined)).toBeNull()
    expect(providerBrandIcon(null)).toBeNull()
  })
})

describe('providerIcon', () => {
  it('falls back to the generic network glyph only when nothing matches', () => {
    expect(providerIcon('claude-code')).toBe(ClaudeCodeIcon)
    expect(providerIcon('some-unknown-acp-agent')).toBe(Network)
    expect(providerIcon(undefined)).toBe(Network)
  })
})

describe('providerIconUrl', () => {
  it('accepts absolute https URLs and normalizes them', () => {
    expect(providerIconUrl('https://cdn.example.com/logo.svg')).toBe('https://cdn.example.com/logo.svg')
    expect(providerIconUrl('  https://cdn.example.com/logo.svg  ')).toBe('https://cdn.example.com/logo.svg')
    expect(providerIconUrl('https://cdn.example.com/a b.svg')).toBe('https://cdn.example.com/a%20b.svg')
  })

  it('rejects unsafe schemes, relative values and empty input', () => {
    expect(providerIconUrl('http://cdn.example.com/logo.svg')).toBeUndefined()
    expect(providerIconUrl('javascript:alert(1)')).toBeUndefined()
    expect(providerIconUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBeUndefined()
    expect(providerIconUrl('//cdn.example.com/logo.svg')).toBeUndefined()
    expect(providerIconUrl('/logo.svg')).toBeUndefined()
    expect(providerIconUrl('logo.svg')).toBeUndefined()
    expect(providerIconUrl('')).toBeUndefined()
    expect(providerIconUrl('   ')).toBeUndefined()
  })

  it('ignores non-string values coming from a registry payload', () => {
    expect(providerIconUrl(undefined)).toBeUndefined()
    expect(providerIconUrl(null)).toBeUndefined()
    expect(providerIconUrl(42)).toBeUndefined()
    expect(providerIconUrl({ href: 'https://cdn.example.com/logo.svg' })).toBeUndefined()
  })
})
