import { describe, expect, it } from 'vitest'
import { getPersonalChatNodeId, resolveChatNodeId } from './chat-node.js'

describe('chat device selection', () => {
  it('defaults old personal chats to the gateway', () => {
    for (const metadata of [null, '{}', 'invalid', 'null', '{"chat":{"nodeId":5}}']) {
      expect(resolveChatNodeId({ metadata })).toBe('gateway')
    }
  })
  it('restores personal device selection', () => {
    expect(resolveChatNodeId({ metadata: '{"chat":{"nodeId":" node-a "}}' })).toBe('node-a')
  })
  it('uses project location even with a saved personal choice', () => {
    const session = { projectId: 'p', metadata: '{"chat":{"nodeId":"node-a"}}' }
    expect(getPersonalChatNodeId(session)).toBeUndefined()
    expect(resolveChatNodeId(session, 'node-b')).toBe('node-b')
    expect(resolveChatNodeId(session, 'gateway')).toBe('gateway')
  })
})
