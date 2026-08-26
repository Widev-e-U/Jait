import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('first-message startup', () => {
  it('starts the optimistic send before a new session request resolves', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    const start = source.indexOf('const handleSubmit = async')
    const end = source.indexOf('/** Submit to an automation thread', start)
    const handleSubmit = source.slice(start, end)

    expect(handleSubmit).not.toContain('const session = await createSession(undefined)')
    expect(handleSubmit).toContain('sessionIdPromise')

    const chatSource = readFileSync(new URL('../hooks/useChat.ts', import.meta.url), 'utf8')
    const sendStart = chatSource.indexOf('const sendMessage = useCallback(async')
    const sendEnd = chatSource.indexOf('// --- Message queue', sendStart)
    const sendMessage = chatSource.slice(sendStart, sendEnd)
    expect(sendMessage.indexOf('setState(prev => ({')).toBeLessThan(
      sendMessage.indexOf('await options.sessionIdPromise'),
    )
  })

  it('keeps the current transcript stable until the new chat exists', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    const start = source.indexOf('const handleStartNewChat = useCallback(')
    const end = source.indexOf('const handleStartNewChatInTab', start)
    const handleStartNewChat = source.slice(start, end)

    expect(handleStartNewChat).toContain('void createSession()')
    expect(handleStartNewChat).not.toContain('clearMessages()')
  })
})
