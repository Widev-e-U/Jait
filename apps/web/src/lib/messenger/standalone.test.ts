import { describe, expect, it } from 'vitest'
import type { MessengerMessage } from './model'
import { MAX_LARGE_EMOJI, isStandaloneEmoji, isStandaloneImage, messageCaption } from './standalone'

const message = (overrides: Partial<MessengerMessage> = {}): MessengerMessage => ({
  id: 'm1', sender: 'Katja', body: '', timestamp: 1_700_000_000_000,
  own: false, encrypted: false, unableToDecrypt: false, pending: false, failed: false,
  ...overrides,
})

const photo = { url: 'mxc://a', name: 'room.jpg', mime: 'image/jpeg', image: true }

describe('isStandaloneEmoji', () => {
  it('treats a short emoji run as jumbo content', () => {
    expect(isStandaloneEmoji('👍')).toBe(true)
    expect(isStandaloneEmoji(' 👍 ')).toBe(true)
    expect(isStandaloneEmoji('👍👍👍')).toBe(true)
    expect(isStandaloneEmoji('👍🏻')).toBe(true)
    expect(isStandaloneEmoji('👨‍👩‍👧')).toBe(true)
  })

  it('keeps longer emoji runs at text size', () => {
    expect(isStandaloneEmoji('👍'.repeat(MAX_LARGE_EMOJI + 1))).toBe(false)
  })

  it('never enlarges mixed content', () => {
    expect(isStandaloneEmoji('reicht das? 👍')).toBe(false)
    expect(isStandaloneEmoji('👍 ok')).toBe(false)
    expect(isStandaloneEmoji('')).toBe(false)
    expect(isStandaloneEmoji('   ')).toBe(false)
    expect(isStandaloneEmoji('hello')).toBe(false)
  })
})

describe('isStandaloneImage', () => {
  it('treats a photo without a caption as standalone', () => {
    expect(isStandaloneImage(message({ attachment: photo }))).toBe(true)
    expect(isStandaloneImage(message({ attachment: photo, body: 'room.jpg' }))).toBe(true)
  })

  it('keeps a captioned photo in the normal layout', () => {
    expect(isStandaloneImage(message({ attachment: photo, body: 'reicht das?' }))).toBe(false)
  })

  it('ignores non-image attachments', () => {
    expect(isStandaloneImage(message({ attachment: { ...photo, image: false, mime: 'application/pdf' } }))).toBe(false)
    expect(isStandaloneImage(message())).toBe(false)
  })
})

describe('messageCaption', () => {
  it('drops the file name that stands in for a missing caption', () => {
    expect(messageCaption(message({ attachment: photo, body: 'room.jpg' }))).toBe('')
  })

  it('keeps real captions and plain text bodies', () => {
    expect(messageCaption(message({ attachment: photo, body: ' reicht das? ' }))).toBe('reicht das?')
    expect(messageCaption(message({ body: 'reicht das?' }))).toBe('reicht das?')
  })
})
