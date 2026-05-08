import { describe, expect, it } from 'vitest'
import { appendTranscript, normalizeTranscript } from './transcript-merge'

describe('transcript merge helpers', () => {
  it('normalizes transcript spacing', () => {
    expect(normalizeTranscript('  hello\n   world  ')).toBe('hello world')
  })

  it('does not append an exact duplicate transcript', () => {
    expect(appendTranscript('staging every remaining change', 'every remaining change')).toBe('staging every remaining change')
  })

  it('merges repeated whole-word overlap', () => {
    expect(appendTranscript('I am staging', 'staging every remaining change')).toBe('I am staging every remaining change')
  })

  it('merges repeated word-fragment overlap before punctuation', () => {
    expect(appendTranscript('cleanly', 'ly.. I am done')).toBe('cleanly.. I am done')
  })

  it('merges short contraction overlap', () => {
    expect(appendTranscript('I', "I'm staging changes")).toBe("I'm staging changes")
  })

  it('keeps distinct short words when there is no safe overlap', () => {
    expect(appendTranscript('the', 'he went home')).toBe('the he went home')
  })
})
