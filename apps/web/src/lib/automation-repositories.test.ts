import type { AgentThread } from './agents-api'
import {
  buildRepositoryFallbackUnavailableMessage,
  getRepositoryRuntimeInfo,
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
      source: 'local',
    }
    const thread = makeThread({
      title: '[Jait] Fix mobile thread sync',
      workingDirectory: 'C:\\Users\\jakob\\.jait\\worktrees\\Jait\\jait-abcd1234',
    })

    expect(threadBelongsToRepository(thread, repository)).toBe(true)
    expect(inferSharedRepositories([thread], [repository])).toEqual([])
  })

  it('reports remote CLI providers for a repository host device', () => {
    const repository: AutomationRepository = {
      id: 'repo-2',
      name: 'Remote Repo',
      defaultBranch: 'main',
      localPath: '/remote/repo',
      deviceId: 'desktop-1',
      source: 'shared',
    }

    expect(getRepositoryRuntimeInfo(repository, {
      localDeviceId: 'browser-1',
      localProviders: [],
      remoteProviders: [
        {
          nodeId: 'desktop-1',
          nodeName: 'Desktop (Windows)',
          platform: 'windows',
          providers: ['codex', 'claude-code'],
        },
      ],
    })).toEqual({
      hostType: 'device',
      locationLabel: 'Desktop (Windows)',
      online: true,
      availableProviders: ['codex', 'claude-code'],
    })
  })

  it('returns a clearer fallback message when a repo host is offline', () => {
    const repository: AutomationRepository = {
      id: 'repo-3',
      name: 'Offline Repo',
      defaultBranch: 'main',
      localPath: '/offline/repo',
      deviceId: 'desktop-2',
      githubUrl: null,
      source: 'shared',
    }
    const runtime = getRepositoryRuntimeInfo(repository, {
      localDeviceId: 'browser-1',
      localProviders: [],
      remoteProviders: [],
    })

    expect(buildRepositoryFallbackUnavailableMessage(repository, runtime)).toBe(
      'Desktop app is offline and no GitHub URL is configured for gateway fallback. Reconnect it or pick a connected repo/device.',
    )
  })
})
