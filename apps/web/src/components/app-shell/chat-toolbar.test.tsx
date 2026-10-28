import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatToolbar } from './chat-toolbar'

describe('desktop chat toolbar visibility', () => {
  it.each(['chat', 'threads'] as const)('omits the extra header in desktop developer %s', currentView => {
    // Hidden toolbars must return before reading unrelated workspace state.
    const props = { currentView, isMobile: false, viewMode: 'developer' } as Parameters<typeof ChatToolbar>[0]
    expect(renderToStaticMarkup(createElement(ChatToolbar, props))).toBe('')
  })
})
