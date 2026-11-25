import { describe, expect, it } from 'vitest'
import { imageMessageGroups, IMAGE_GROUP_WINDOW_MS } from './image-groups'
import type { MessengerMessage } from './model'

const photo = (id: string, overrides: Partial<MessengerMessage> = {}): MessengerMessage => ({
  id, sender: 'Katja', senderId: '@katja:example', body: `${id}.jpg`, timestamp: 1_700_000_000_000,
  own: false, encrypted: false, unableToDecrypt: false, pending: false, failed: false,
  attachment: { url: `mxc://example/${id}`, name: `${id}.jpg`, mime: 'image/jpeg', image: true },
  ...overrides,
})

describe('imageMessageGroups', () => {
  it('groups consecutive photos and retains every message in order', () => {
    const messages = Array.from({ length: 5 }, (_, i) => photo(String(i), { timestamp: 1_700_000_000_000 + i }))
    expect(imageMessageGroups(messages).map(group => group.messages.map(message => message.id))).toEqual([['0', '1', '2', '3', '4']])
  })

  it('groups uncaptioned videos with photos and leaves captioned videos separate', () => {
    const video = photo('video', {
      body: 'clip.webm',
      attachment: { url: 'mxc://example/clip', name: 'clip.webm', mime: 'video/webm', image: false },
    })
    expect(imageMessageGroups([photo('a'), video, { ...video, id: 'captioned', body: 'At the beach' }])
      .map(group => group.messages.map(message => message.id))).toEqual([['a', 'video'], ['captioned']])
  })

  it('separates captions, replies, unsettled messages, different people and distant photos', () => {
    const first = photo('a')
    for (const second of [
      photo('b', { body: 'caption' }), photo('b', { pending: true }), photo('b', { failed: true }),
      photo('b', { senderId: '@other:example' }), photo('b', { timestamp: first.timestamp + IMAGE_GROUP_WINDOW_MS + 1 }),
      photo('b', { replyTo: { id: 'x', sender: 'Someone', body: 'Hello' } }),
    ]) expect(imageMessageGroups([first, second]).map(group => group.messages.length)).toEqual([1, 1])
  })

  it('preserves original boundaries and visible indexes when filtering search results', () => {
    const messages = [photo('a'), photo('hidden', { attachment: undefined, body: 'hello' }), photo('b'), photo('c')]
    const groups = imageMessageGroups(messages, message => message.body !== 'hello')
    expect(groups.map(group => ({ startIndex: group.startIndex, ids: group.messages.map(message => message.id) }))).toEqual([
      { startIndex: 0, ids: ['a'] }, { startIndex: 1, ids: ['b', 'c'] },
    ])
  })

  it('does not join photos across another message or a date divider', () => {
    const midnight = new Date(2025, 1, 2, 0, 0).getTime()
    expect(imageMessageGroups([photo('a', { timestamp: midnight - 1 }), photo('b', { timestamp: midnight })])).toHaveLength(2)
    expect(imageMessageGroups([photo('a'), photo('text', { attachment: undefined, body: 'hello' }), photo('b')])).toHaveLength(3)
  })
})
