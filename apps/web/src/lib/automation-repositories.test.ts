import type { AgentThread } from './agents-api'
import {
  inferSharedRepositories,
  inferThreadRepositoryName,
  threadBelongsToRepository,
  type AutomationRepository,
} from './automation-repositories'

function makeThread(overrides: Partial<AgentThread>): AgentThread {
  return {
    id: 'thread-1',
    userId: 'user-1',
    sessionId: null,
    title: 'Thread',
    providerId: 'jait',
    model: null,
    runtimeMode: 'full-access',
    workingDirectory: null,
    branch: null,
    status: 'running',
    providerSessionId: null,
    error: null,
    prUrl: null,
    prNumber: null,
    prTitle: null,
    prState: null,
    createdAt: '2026-03-08T20:00:00.000Z',
    updatedAt: '2026-03-08T20:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

describe('automation repositories', () => {
  it('infers a shared repository from a worktree thread', () => {
    const thread = makeThread({
      title: '[Jait] Fix mobile thread sync',
      workingDirectory: '/home/jakob/.jait/worktrees/Jait/jait-abcd1234',
    })

    expect(inferThreadRepositoryName(thread)).toBe('Jait')
    expect(inferSharedRepositories([thread], [])).toEqual([
      expect.objectContaining({
        id: 'shared:jait',
        name: 'Jait',
        source: 'shared',
      }),
    ])
  })

  it('matches worktree threads to a local repository entry', () => {
    const repository: AutomationRepository = {
      id: 'repo-1',
      name: 'Jait',
      defaultBranch: 'main',
      localPath: 'C:\\Users\\jakob\\code\\Jait',
      githubToken: null,
      source: 'local',
    }
    const thread = makeThread({
      title: '[Jait] Fix mobile thread sync',
      workingDirectory: 'C:\\Users\\jakob\\.jait\\worktrees\\Jait\\jait-abcd1234',
    })

    expect(threadBelongsToRepository(thread, repository)).toBe(true)
    expect(inferSharedRepositories([thread], [repository])).toEqual([])
  })
})
