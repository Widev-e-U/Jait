import { describe, expect, it } from 'vitest'
import { isMissingGitIdentityError } from './git-errors'

describe('isMissingGitIdentityError', () => {
  it('detects author identity errors', () => {
    expect(isMissingGitIdentityError(new Error('Author identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('Committer identity unknown'))).toBe(true)
  })

  it('detects the "please tell me who you are" hint', () => {
    expect(isMissingGitIdentityError(new Error('Please tell me who you are.'))).toBe(true)
  })

  it('detects auto-detection failures', () => {
    expect(isMissingGitIdentityError(new Error('unable to auto-detect email address'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('No email was given and auto-detection is disabled'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('No name was given and auto-detection is disabled'))).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isMissingGitIdentityError(new Error('AUTHOR IDENTITY UNKNOWN'))).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isMissingGitIdentityError(new Error('fatal: not a git repository'))).toBe(false)
    expect(isMissingGitIdentityError(new Error('Permission denied'))).toBe(false)
  })

  it('handles non-Error values', () => {
    expect(isMissingGitIdentityError('Please tell me who you are')).toBe(true)
    expect(isMissingGitIdentityError('some other string')).toBe(false)
    expect(isMissingGitIdentityError(null)).toBe(false)
    expect(isMissingGitIdentityError(undefined)).toBe(false)
    expect(isMissingGitIdentityError(42)).toBe(false)
  })
})
