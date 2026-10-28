import { describe, expect, it } from 'vitest'
import { findConversationBrowser } from './conversation-browser'

const data = { browserId: 'browser-a', browserSession: { sessionId: 'chat-a', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } }
const navigate = { tool: 'mcp__jait__browser_navigate', result: { data } }

describe('conversation browser selection', () => {
  it('selects one live browser across turns and actions without session metadata', () => {
    expect(findConversationBrowser([{ toolCalls: [navigate] }, { toolCalls: [{ tool: 'browser.click' }, { tool: 'browser.snapshot' }] }], 'chat-a')).toEqual({ data })
  })
  it('does not leave a blank browser panel after a failed opening', () => {
    expect(findConversationBrowser([{ toolCalls: [{ tool: 'browser.open', result: { ok: false, message: 'Invalid URL' } }] }], 'chat-a')).toBeNull()
    expect(findConversationBrowser([{ toolCalls: [navigate, { tool: 'browser.open', result: { ok: false } }] }], 'chat-a')).toEqual({ data })
  })
  it('recognizes a running browser call before its result arrives', () => {
    expect(findConversationBrowser([{ toolCalls: [{ tool: 'functions.mcp__jait_core__browser_navigate' }] }], 'chat-a')).toEqual({ data: undefined })
  })
  it('ignores other sessions, unrelated tools, and malformed history', () => {
    expect(findConversationBrowser([{ toolCalls: [navigate, null, { tool: 'terminal.run' }] }, { toolCalls: {} }], 'chat-b')).toBeNull()
  })
  it('ignores preview results whose top-level session belongs to another chat', () => {
    const foreignPreview = { tool: 'preview.open', result: { data: { sessionId: 'chat-a', url: data.browserSession.previewUrl } } }
    expect(findConversationBrowser([{ toolCalls: [foreignPreview] }], 'chat-b')).toBeNull()
    expect(findConversationBrowser([{ toolCalls: [foreignPreview] }], 'chat-a')).toEqual({ data: foreignPreview.result.data })
  })
  it('uses the latest browser after a restart', () => {
    const restarted = { ...data, browserId: 'browser-b' }
    expect(findConversationBrowser([{ toolCalls: [navigate, { tool: 'preview.restart', result: { data: restarted } }] }], 'chat-a')).toEqual({ data: restarted })
  })
  it('keeps the browser after the user sends another message', () => {
    const turn = [{ role: 'user', toolCalls: null }, { role: 'assistant', toolCalls: [navigate] }, { role: 'user', toolCalls: null }]
    expect(findConversationBrowser(turn, 'chat-a')).toEqual({ data })
  })
  it('retains browser metadata across turns', () => {
    const turn = [{ role: 'assistant', toolCalls: [navigate] }, { role: 'user' }, { role: 'assistant', toolCalls: [{ tool: 'browser.click' }] }]
    expect(findConversationBrowser(turn, 'chat-a')).toEqual({ data })
  })
  it('keeps the browser while only system notices arrive', () => {
    // System notices reuse role 'user' but are not turns.
    const turn = [{ role: 'user' }, { role: 'assistant', toolCalls: [navigate] }, { role: 'user', kind: 'system-notice' }]
    expect(findConversationBrowser(turn, 'chat-a')).toEqual({ data })
  })
})
