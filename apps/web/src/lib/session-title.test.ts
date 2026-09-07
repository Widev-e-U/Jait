import { describe, expect, it } from 'vitest'
import { deriveSessionTitle, shouldAutoTitleSession } from './session-title'

describe('shouldAutoTitleSession', () => {
  it('auto-titles empty or whitespace-only names', () => {
    expect(shouldAutoTitleSession(null)).toBe(true)
    expect(shouldAutoTitleSession(undefined)).toBe(true)
    expect(shouldAutoTitleSession('')).toBe(true)
    expect(shouldAutoTitleSession('   ')).toBe(true)
  })

  it('auto-titles placeholder names', () => {
    expect(shouldAutoTitleSession('New Chat')).toBe(true)
    expect(shouldAutoTitleSession('Session 42')).toBe(true)
    expect(shouldAutoTitleSession('  Session 7  ')).toBe(true)
  })

  it('does not auto-title a bare "Session" without a number', () => {
    expect(shouldAutoTitleSession('Session')).toBe(false)
    expect(shouldAutoTitleSession('Session  ')).toBe(false)
  })

  it('keeps real user-provided titles', () => {
    expect(shouldAutoTitleSession('Fix the login bug')).toBe(false)
    expect(shouldAutoTitleSession('  My Title  ')).toBe(false)
  })
})

describe('deriveSessionTitle', () => {
  it('returns empty string for empty or whitespace-only input', () => {
    expect(deriveSessionTitle('')).toBe('')
    expect(deriveSessionTitle('   ')).toBe('')
    expect(deriveSessionTitle('\n\n  \n')).toBe('')
  })

  it('uses the first non-empty line', () => {
    expect(deriveSessionTitle('first line\nsecond line')).toBe('first line')
    expect(deriveSessionTitle('\n\n  hello world  \nnext')).toBe('hello world')
  })

  it('normalizes CRLF and CR line endings', () => {
    expect(deriveSessionTitle('line one\r\nline two')).toBe('line one')
    expect(deriveSessionTitle('line one\rline two')).toBe('line one')
  })

  it('collapses internal whitespace', () => {
    expect(deriveSessionTitle('  hello    world  ')).toBe('hello world')
  })

  it('truncates long titles to 80 chars with an ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = deriveSessionTitle(long)
    expect(result).toBe(`${'a'.repeat(77)}...`)
    expect(result.length).toBe(80)
  })

  it('keeps titles at or under 80 chars unchanged', () => {
    const exact = 'b'.repeat(80)
    expect(deriveSessionTitle(exact)).toBe(exact)
    const short = 'short title'
    expect(deriveSessionTitle(short)).toBe(short)
  })
})
