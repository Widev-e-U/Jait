import { describe, expect, it } from 'vitest'

import type { MessengerRoom } from './model'
import { chatListAvatarProps } from './room-avatar'

function room(overrides: Partial<MessengerRoom> = {}): MessengerRoom {
  return {
    id: '!room:matrix',
    name: 'Room',
    service: 'Matrix',
    network: 'matrix',
    unread: 0,
    membership: 'join',
    encrypted: false,
    timestamp: 0,
    preview: '',
    ...overrides,
  }
}

describe('chatListAvatarProps', () => {
  it('uses the peer picture for a direct chat', () => {
    const props = chatListAvatarProps(room({
      name: 'Alice',
      kind: 'chat',
      peer: { userId: '@alice:matrix', name: 'Alice', presence: 'online', avatarUrl: 'mxc://matrix/alice' },
    }))
    expect(props).toEqual({ name: 'Alice', mxcUrl: 'mxc://matrix/alice' })
  })

  it('falls back to the room picture when the peer has none', () => {
    const props = chatListAvatarProps(room({
      name: 'Team chat',
      avatarUrl: 'mxc://matrix/team',
      peer: { userId: '@bob:matrix', name: 'Bob', presence: 'offline' },
    }))
    expect(props.mxcUrl).toBe('mxc://matrix/team')
    expect(props.name).toBe('Bob')
  })

  it('treats an empty peer picture as missing', () => {
    const props = chatListAvatarProps(room({
      avatarUrl: 'mxc://matrix/fallback',
      peer: { userId: '@carol:matrix', name: 'Carol', presence: 'unknown', avatarUrl: '' },
    }))
    expect(props.mxcUrl).toBe('mxc://matrix/fallback')
  })

  it('omits mxcUrl entirely when no picture exists, so the initials render', () => {
    const props = chatListAvatarProps(room({ name: 'Dave Smith' }))
    expect('mxcUrl' in props).toBe(false)
    expect(props).toEqual({ name: 'Dave Smith' })
  })

  it('squares the corners and keeps the # placeholder for channels', () => {
    const props = chatListAvatarProps(room({ name: 'general', kind: 'channel', avatarUrl: 'mxc://matrix/general' }), true)
    expect(props).toEqual({ name: 'general', mxcUrl: 'mxc://matrix/general', rounded: 'lg', fallback: '#' })
  })

  it('leaves plain chats round with initials', () => {
    const props = chatListAvatarProps(room({ name: 'Erin' }))
    expect(props.rounded).toBeUndefined()
    expect(props.fallback).toBeUndefined()
  })
})
