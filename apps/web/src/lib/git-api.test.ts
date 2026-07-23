import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitApi, isMissingGitIdentityError } from './git-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMissingGitIdentityError', () => {
  it('matches missing git identity errors for both author and committer flows', () => {
    expect(isMissingGitIdentityError(new Error('Author identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('Committer identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: unable to auto-detect email address'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: no email was given and auto-detection is disabled'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: no name was given and auto-detection is disabled'))).toBe(true)
    expect(isMissingGitIdentityError('Please tell me who you are.')).toBe(true)
  })

  it('does not match unrelated git errors', () => {
    expect(isMissingGitIdentityError(new Error('nothing to commit, working tree clean'))).toBe(false)
  })
})

describe('gitApi remote node routing', () => {
  it('sends the owning project node with Windows source-control requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchMock)

    await gitApi.status('C:\\work\\project', undefined, 'windows-two')

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      cwd: 'C:\\work\\project',
      nodeId: 'windows-two',
    })
  })
})
