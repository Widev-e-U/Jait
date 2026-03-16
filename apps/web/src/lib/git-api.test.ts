import { describe, expect, it } from 'vitest'
import { isMissingGitIdentityError } from './git-errors'

describe('isMissingGitIdentityError', () => {
  it('matches missing git author identity errors', () => {
    expect(isMissingGitIdentityError(new Error('Author identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: unable to auto-detect email address'))).toBe(true)
    expect(isMissingGitIdentityError('Please tell me who you are.')).toBe(true)
  })

  it('does not match unrelated git errors', () => {
    expect(isMissingGitIdentityError(new Error('nothing to commit, working tree clean'))).toBe(false)
  })
})
