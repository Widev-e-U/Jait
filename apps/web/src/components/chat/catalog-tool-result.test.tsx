import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogToolResult } from './catalog-tool-result'
import { isAgentToolName } from '@/lib/tool-call-body'

describe('catalog and page tool cards', () => {
  it('never treats persistent profiles as delegated workers', () => {
    expect(isAgentToolName('agent.profiles')).toBe(false)
    expect(isAgentToolName('agent.profiles.inspect')).toBe(false)
    expect(isAgentToolName('agent.spawn')).toBe(true)
  })
  it('reads nested external MCP results and ignores arbitrary URLs or titles', () => {
    const data = { content: [{ type: 'text', text: 'Found catalog\n' + JSON.stringify({
      pages: [{ id: 'agents', tools: [{ name: 'agent.profiles' }], features: [{ id: 'profiles', description: 'Manage people' }] }],
      pageLinks: [{ pageId: 'agents', title: 'Untrusted title', href: 'https://evil.example' }, { pageId: 'invented', href: '/oops' }],
    }) }] }
    const html = renderToStaticMarkup(createElement(CatalogToolResult, { data }))
    expect(html).toContain('Manage persistent Jait people and teams')
    expect(html).toContain('agent.profiles')
    expect(html).not.toContain('evil.example')
  })
});
