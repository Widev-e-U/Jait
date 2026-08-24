import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { shouldShowProviderLoginAction } from './provider-account-actions'
import { getBackendInstanceDrafts } from './SettingsPage'
import { highlightSearchMatchHtml } from './settings-search-highlight'

describe('highlightSearchMatch', () => {
  it('wraps matching settings search text in mark tags', () => {
    const markup = renderToStaticMarkup(
      createElement('span', {
        dangerouslySetInnerHTML: { __html: highlightSearchMatchHtml('OPENAI_API_KEY', 'openai') },
      }),
    )

    expect(markup).toContain('<mark')
    expect(markup).toContain('>OPENAI</mark>_API_KEY')
  })

  it('returns plain text when there is no match', () => {
    const markup = renderToStaticMarkup(
      createElement(Fragment, null, highlightSearchMatchHtml('Session archive', 'token')),
    )

    expect(markup).toBe('Session archive')
  })
})

describe('getBackendInstanceDrafts', () => {
  it('migrates legacy Ollama settings into an editable instance', () => {
    expect(getBackendInstanceDrafts({
      OLLAMA_URL: 'http://gpu-server:11434',
      OLLAMA_MODEL: 'qwen3:32b',
      OLLAMA_NUM_CTX: '65536',
    }, 'ollama')).toEqual([
      {
        id: 'legacy-ollama',
        type: 'ollama',
        name: 'Local Ollama',
        baseUrl: 'http://gpu-server:11434',
        apiKey: '',
        model: 'qwen3:32b',
        numCtx: '65536',
      },
    ])
  })

  it('keeps multiple saved instances of the same backend type', () => {
    const drafts = getBackendInstanceDrafts({
      JAIT_BACKEND_INSTANCES: JSON.stringify([
        { id: 'one', type: 'ollama', name: 'One', baseUrl: 'http://one:11434' },
        { id: 'two', type: 'ollama', name: 'Two', baseUrl: 'http://two:11434' },
      ]),
    }, 'openai')

    expect(drafts.map((instance) => instance.id)).toEqual(['one', 'two'])
  })
})

describe('shouldShowProviderLoginAction', () => {
  it('hides login for an authenticated Codex account that supports login', () => {
    expect(shouldShowProviderLoginAction({
      login: true,
      logout: true,
      deviceCode: false,
      authenticated: true,
    })).toBe(false)
  })

  it('shows login for a signed-out account that supports login', () => {
    expect(shouldShowProviderLoginAction({
      login: true,
      logout: false,
      deviceCode: false,
      authenticated: false,
    })).toBe(true)
  })
})
