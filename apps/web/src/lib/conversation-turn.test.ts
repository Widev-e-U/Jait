import { describe, expect, it } from 'vitest'
import { isUserTurn, latestUserTurnId } from './conversation-turn'

describe('user turns', () => {
  it('keeps the scroll target stable when system notices arrive', () => {
    const prompt = { id: 'prompt', renderId: 'rendered-prompt', role: 'user' }
    const notice = { id: 'notice', role: 'user', kind: 'system-notice' }
    expect(latestUserTurnId([prompt, notice])).toBe('rendered-prompt')
    expect(latestUserTurnId([notice])).toBeNull()
    expect(latestUserTurnId([prompt, notice, { id: 'next', role: 'user' }])).toBe('next')
    expect(isUserTurn(notice)).toBe(false)
  })
})
