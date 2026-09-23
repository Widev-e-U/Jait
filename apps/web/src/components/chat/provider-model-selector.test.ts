import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PROVIDER_SELECTOR_POPOVER_STYLE,
  RemoteProviderLogo,
  providerBrandIconOrNull,
  providerIconFor,
  providerRemoteIconUrl,
  resolveProviderModelReconciliation,
} from './provider-model-selector'
import { CodexIcon } from '@/components/icons/provider-icons'

describe('provider model transitions', () => {
  it('does not assign the previous provider default while the new catalogue loads', () => {
    expect(resolveProviderModelReconciliation({
      provider: 'codex-pc-work',
      activeScopeKey: 'codex-pc-work:desktop-win32',
      loadedScopeKey: 'jait:gateway',
      loading: false,
      currentModel: null,
      models: [{ id: 'jait://omniroute/legacy-omniroute/auto', isDefault: true }],
    })).toBeUndefined()
  })

  it('selects the default after the active provider catalogue loads', () => {
    expect(resolveProviderModelReconciliation({
      provider: 'codex-pc-work',
      activeScopeKey: 'codex-pc-work:desktop-win32',
      loadedScopeKey: 'codex-pc-work:desktop-win32',
      loading: false,
      currentModel: null,
      models: [{ id: 'gpt-5.6-sol', isDefault: true }],
    })).toBe('gpt-5.6-sol')
  })
})

describe('provider selector geometry', () => {
  it('reserves its full panel height while another provider loads models', () => {
    expect(PROVIDER_SELECTOR_POPOVER_STYLE.height).toBe(
      PROVIDER_SELECTOR_POPOVER_STYLE.maxHeight,
    )
  })
})

describe('provider selector icons', () => {
  const remote = 'https://cdn.example.com/icons/codex-acp.svg'

  it('prefers the brand icon so Codex matches the projects/chats panels', () => {
    expect(providerBrandIconOrNull('codex-acp', 'codex-acp')).toBe(CodexIcon)
    expect(providerIconFor('codex-acp', 'codex-acp')).toBe(CodexIcon)
    // …and the registry logo is dropped instead of overriding it.
    expect(providerRemoteIconUrl('codex-acp', 'codex-acp', remote)).toBeUndefined()
  })

  it('still resolves dynamic ACP agent ids to brand icons', () => {
    expect(providerBrandIconOrNull(undefined, 'claude-code-acp')).not.toBeNull()
    expect(providerRemoteIconUrl(undefined, 'claude-code-acp', remote)).toBeUndefined()
  })

  it('keeps the remote logo only for providers without a brand icon', () => {
    expect(providerBrandIconOrNull('totally-unknown-agent', 'totally-unknown-agent')).toBeNull()
    expect(providerRemoteIconUrl('totally-unknown-agent', 'totally-unknown-agent', remote)).toBe(remote)
  })

  it('rejects non-https remote logos', () => {
    expect(providerRemoteIconUrl('mystery', 'mystery', 'javascript:alert(1)')).toBeUndefined()
    expect(providerRemoteIconUrl('mystery', 'mystery', 'http://cdn.example.com/a.svg')).toBeUndefined()
  })

  it('draws remote logos as a themed mask rather than a hard-coded black image', () => {
    const html = renderToStaticMarkup(RemoteProviderLogo({ url: remote, className: 'h-4 w-4' }))
    expect(html).not.toContain('<img')
    expect(html).toContain('mask-image')
    expect(html).toContain('bg-current')
    expect(html).toContain(remote)
  })
})
