import { describe, expect, it } from 'vitest'
import { isStatusRoom, messengerConnectionLink } from './messenger.js'

describe('messenger helpers', () => {
  it('omits the username when creating a connection link', () => {
    const url = new URL(messengerConnectionLink('https://matrix.example'), 'https://jait.example')
    expect(url.searchParams.get('homeserver')).toBe('https://matrix.example')
    expect(url.searchParams.has('username')).toBe(false)
  })

  it('recognizes a status room from its topic without a name', () => {
    expect(isStatusRoom({ topic: 'Status updates from your contacts' })).toBe(true)
    expect(isStatusRoom({})).toBe(false)
  })
})
