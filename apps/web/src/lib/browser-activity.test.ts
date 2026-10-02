import { describe, expect, it } from 'vitest'
import { browserPageUrl, getBrowserActivity } from './browser-activity'
import { getToolCallBodyKind } from './tool-call-body'

describe('browser activity', () => {
  it('shows existing navigation and interaction payloads without requiring screenshots', () => {
    const activity = getBrowserActivity('browser.click', { selector: 'text=Docs' }, {
      title: 'Documentation', url: 'https://example.com/docs', textPreview: 'Getting started',
      interactiveElements: [{ role: 'link', name: 'Install', active: true }, null, 'bad', { value: 'password' }],
    })
    expect(activity).toMatchObject({ title: 'Documentation', url: 'https://example.com/docs', target: 'text=Docs', textPreview: 'Getting started' })
    expect(activity.elements).toEqual([{ label: 'Install', role: 'link', active: true, disabled: false }])
    expect(getToolCallBodyKind({ tool: 'browser.click', args: {}, status: 'success', displayOutput: 'result', screenshotPath: null, snapshotText: null })).toBe('browserActivity')
    expect(getToolCallBodyKind({ tool: 'browser.search', args: {}, status: 'success', displayOutput: 'result', screenshotPath: null, snapshotText: null })).toBe('output')
  })

  it('keeps captures, targets, element values, and typed text out of secret-safe cards', () => {
    for (const flag of [{ captureSuppressed: true }, { secretSafe: true }, { browserSession: { secretSafe: true } }]) {
      const activity = getBrowserActivity('browser.type', { selector: '#password', text: 'secret' }, { ...flag, textPreview: 'secret', snapshot: 'secret', interactiveElements: [{ name: 'secret' }] })
      expect(activity).toMatchObject({ suppressed: true, target: '', textPreview: '', snapshot: '', elements: [] })
      expect(JSON.stringify(activity)).not.toContain('"secret"')
    }
    expect(JSON.stringify(getBrowserActivity('browser.type', { selector: '#email', text: 'private-value' }, {}))).not.toContain('private-value')
  })

  it('only makes web URLs clickable and strips URL credentials', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/page', '/relative', 'invalid']) expect(browserPageUrl(url)).toBeNull()
    expect(browserPageUrl('https://user:pass@example.com/docs')).toBe('https://example.com/docs')
    expect(getBrowserActivity('browser.snapshot', {}, { snapshot: 'Title: Old page\nURL: https://example.com' })).toMatchObject({ title: 'Old page', url: 'https://example.com/' })
  })

  it('shows obstruction diagnostics and running scroll targets', () => {
    expect(getBrowserActivity('browser_scroll', { y: 300 }, { obstruction: { hasModal: true, activeDialogTitle: 'Cookie preferences' } })).toMatchObject({ target: 'x: 0, y: 300', notice: 'Dialog open: Cookie preferences' })
  })
})
