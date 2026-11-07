import { describe, expect, it } from 'vitest'
import {
  VOICE_LEVEL_BAR_COUNT,
  VOICE_LEVEL_FLOOR,
  createSilentVoiceLevels,
  measureVoiceLevel,
  summarizeForVoice,
} from './voice-levels'

describe('createSilentVoiceLevels', () => {
  it('returns one bar per configured count', () => {
    expect(createSilentVoiceLevels()).toHaveLength(VOICE_LEVEL_BAR_COUNT)
  })

  it('starts every bar at the silent floor', () => {
    const levels = createSilentVoiceLevels()
    expect(levels.every((level) => level === VOICE_LEVEL_FLOOR)).toBe(true)
  })
})

describe('summarizeForVoice', () => {
  it('returns an empty string for empty or whitespace-only input', () => {
    expect(summarizeForVoice('')).toBe('')
    expect(summarizeForVoice('   \n\t ')).toBe('')
  })

  it('keeps only the first sentence', () => {
    expect(summarizeForVoice('Hello world. More text here.')).toBe('Hello world.')
  })

  it('handles sentences ending in a question mark', () => {
    expect(summarizeForVoice('Is this working? Yes it is.')).toBe('Is this working?')
  })

  it('returns the whole text when there is no sentence terminator', () => {
    expect(summarizeForVoice('Just a fragment')).toBe('Just a fragment')
  })

  it('replaces fenced code blocks with a placeholder', () => {
    const input = 'Here is the fix:\n```js\nconst x = 1\n```\nDone.'
    expect(summarizeForVoice(input)).toBe('Here is the fix: code omitted Done.')
  })

  it('strips inline code backticks', () => {
    expect(summarizeForVoice('Run `npm install` now.')).toBe('Run npm install now.')
  })

  it('converts markdown links to their label text', () => {
    expect(summarizeForVoice('See [docs](https://example.com) for details.')).toBe(
      'See docs for details.',
    )
  })

  it('strips markdown heading and emphasis symbols', () => {
    expect(summarizeForVoice('# Heading\n\nSome *bold* text.')).toBe('Heading Some bold text.')
  })

  it('collapses runs of whitespace', () => {
    expect(summarizeForVoice('Line one.\n\n   Line   two.')).toBe('Line one.')
  })

  it('truncates an over-long first sentence with an ellipsis', () => {
    const long = 'This is a very long sentence that should be truncated for speech synthesis.'
    expect(summarizeForVoice(long, 20)).toBe('This is a very long…')
  })

  it('respects a custom maxLength when the sentence fits', () => {
    expect(summarizeForVoice('Short. Longer sentence here.', 10)).toBe('Short.')
  })
})


describe('measureVoiceLevel', () => {
  it('tracks changing microphone amplitude and returns to silence', () => {
    const silence = new Uint8Array(256).fill(128)
    const quiet = new Uint8Array(256).fill(132)
    const loud = new Uint8Array(256).fill(144)
    expect(measureVoiceLevel(silence)).toBe(VOICE_LEVEL_FLOOR)
    expect(measureVoiceLevel(quiet)).toBeGreaterThan(measureVoiceLevel(silence))
    expect(measureVoiceLevel(loud)).toBeGreaterThan(measureVoiceLevel(quiet))
    expect(measureVoiceLevel(silence)).toBeLessThan(measureVoiceLevel(loud))
    expect(measureVoiceLevel(new Uint8Array())).toBe(VOICE_LEVEL_FLOOR)
  })
})
