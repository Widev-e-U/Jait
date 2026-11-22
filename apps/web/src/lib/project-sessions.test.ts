import { describe, expect, it } from 'vitest'
import { isReadOnlyChatSession } from './project-sessions'

describe('isReadOnlyChatSession', () => {
  it('keeps owned chats writable when the owner cannot manage project sharing', () => {
    expect(isReadOnlyChatSession({ projectId: null, isOwner: true, canManageShare: false })).toBe(false)
    expect(isReadOnlyChatSession({ projectId: 'project', isOwner: true, canManageShare: false })).toBe(false)
  })

  it('keeps shared chats read-only for project members', () => {
    expect(isReadOnlyChatSession({ projectId: 'project', isOwner: false, canManageShare: false })).toBe(true)
  })

  it('handles session records from before the ownership field was added', () => {
    expect(isReadOnlyChatSession({ projectId: null, canManageShare: false })).toBe(false)
    expect(isReadOnlyChatSession({ projectId: 'project', canManageShare: false })).toBe(true)
    expect(isReadOnlyChatSession({ projectId: 'project' })).toBe(false)
    expect(isReadOnlyChatSession(undefined)).toBe(false)
  })
})
