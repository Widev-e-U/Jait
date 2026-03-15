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
      providersLoaded: true,
    })).toEqual({
      hostType: 'device',
      locationLabel: 'Desktop (Windows)',
      online: true,
      loading: false,
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
      providersLoaded: true,
    })

    expect(buildRepositoryFallbackUnavailableMessage(repository, runtime)).toBe(
      'Desktop app is offline and no GitHub URL is configured for gateway fallback. Reconnect it or pick a connected repo/device.',
    )
  })
})

// ── Runtime info: loading state ─────────────────────────────────────

describe('getRepositoryRuntimeInfo loading state', () => {
  it('shows loading=true when providers have not loaded yet and device is not online', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-1' },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [],
        providersLoaded: false,
      },
    )
    expect(runtime).toMatchObject({
      hostType: 'device',
      online: false,
      loading: true,
    })
  })

  it('shows loading=false once providers are loaded even if device is offline', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-1' },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime).toMatchObject({
      hostType: 'device',
      online: false,
      loading: false,
    })
  })

  it('shows loading=false when device is online regardless of providersLoaded', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-1' },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [
          { nodeId: 'desktop-1', nodeName: 'Desktop', platform: 'windows', providers: ['codex'] },
        ],
        providersLoaded: false,
      },
    )
    expect(runtime).toMatchObject({
      hostType: 'device',
      online: true,
      loading: false,
    })
  })
})

// ── Runtime info: gateway repos ─────────────────────────────────────

describe('getRepositoryRuntimeInfo gateway repos', () => {
  it('treats a repo with no deviceId as gateway-hosted and always online', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: null },
      {
        localDeviceId: 'browser-1',
        localProviders: [
          { id: 'jait', name: 'Jait', available: true } as any,
          { id: 'codex', name: 'Codex', available: false } as any,
        ],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime).toEqual({
      hostType: 'gateway',
      locationLabel: 'Gateway',
      online: true,
      loading: false,
      availableProviders: ['jait'],
    })
  })

  it('treats a repo with empty string deviceId as gateway-hosted', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: '' },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime.hostType).toBe('gateway')
    expect(runtime.online).toBe(true)
    expect(runtime.loading).toBe(false)
  })

  it('gateway repos are never loading', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: undefined },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [],
        providersLoaded: false,
      },
    )
    expect(runtime.loading).toBe(false)
    expect(runtime.online).toBe(true)
  })
})

// ── Runtime info: device repos ──────────────────────────────────────

describe('getRepositoryRuntimeInfo device repos', () => {
  it('labels "This device" when repo deviceId matches local client', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'electron-abc-123' },
      {
        localDeviceId: 'electron-abc-123',
        localProviders: [],
        remoteProviders: [
          { nodeId: 'electron-abc-123', nodeName: 'Desktop (Win32)', platform: 'windows', providers: ['codex'] },
        ],
        providersLoaded: true,
      },
    )
    expect(runtime.locationLabel).toBe('This device')
    expect(runtime.online).toBe(true)
  })

  it('uses remote node name when deviceId differs from local', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-remote' },
      {
        localDeviceId: 'browser-local',
        localProviders: [],
        remoteProviders: [
          { nodeId: 'desktop-remote', nodeName: 'MacBook Pro', platform: 'macos', providers: [] },
        ],
        providersLoaded: true,
      },
    )
    expect(runtime.locationLabel).toBe('MacBook Pro')
  })

  it('falls back to "Desktop app" when node is not connected', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-gone' },
      {
        localDeviceId: 'browser-local',
        localProviders: [],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime.locationLabel).toBe('Desktop app')
    expect(runtime.online).toBe(false)
  })

  it('reports correct available providers from the remote node', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-1' },
      {
        localDeviceId: 'browser-1',
        localProviders: [],
        remoteProviders: [
          {
            nodeId: 'desktop-1',
            nodeName: 'Desktop',
            platform: 'windows',
            providers: ['codex', 'claude-code', 'codex'], // duplicate
          },
        ],
        providersLoaded: true,
      },
    )
    expect(runtime.availableProviders).toEqual(['codex', 'claude-code'])
  })

  it('returns empty providers when device is offline', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'desktop-offline' },
      {
        localDeviceId: 'browser-1',
        localProviders: [
          { id: 'jait', name: 'Jait', available: true } as any,
        ],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime.availableProviders).toEqual([])
  })
})

// ── Repo assignment: deviceId comes from the hosting node ───────────

describe('repo deviceId assignment semantics', () => {
  it('a repo browsed from gateway node should have no deviceId (gateway-hosted)', () => {
    // When the folder picker selects a path on the gateway node,
    // handleFolderSelected receives nodeId = "gateway" and sets deviceId = undefined.
    // The runtime info should then treat it as gateway-hosted.
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: undefined },
      {
        localDeviceId: 'electron-client',
        localProviders: [{ id: 'jait', name: 'Jait', available: true } as any],
        remoteProviders: [],
        providersLoaded: true,
      },
    )
    expect(runtime.hostType).toBe('gateway')
    expect(runtime.online).toBe(true)
  })

  it('a repo browsed from a desktop node should have that node ID as deviceId', () => {
    // When the folder picker selects a path on a desktop node "electron-abc-123",
    // handleFolderSelected receives that nodeId and sets it as deviceId.
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'electron-abc-123' },
      {
        localDeviceId: 'browser-viewer',
        localProviders: [],
        remoteProviders: [
          { nodeId: 'electron-abc-123', nodeName: 'Desktop (Win32)', platform: 'windows', providers: ['codex', 'claude-code'] },
        ],
        providersLoaded: true,
      },
    )
    expect(runtime.hostType).toBe('device')
    expect(runtime.online).toBe(true)
    expect(runtime.availableProviders).toEqual(['codex', 'claude-code'])
  })

  it('a device-hosted repo shows offline when node disconnects', () => {
    const runtime = getRepositoryRuntimeInfo(
      { deviceId: 'electron-abc-123' },
      {
        localDeviceId: 'browser-viewer',
        localProviders: [],
        remoteProviders: [], // node disconnected
        providersLoaded: true,
      },
    )
    expect(runtime.hostType).toBe('device')
    expect(runtime.online).toBe(false)
    expect(runtime.loading).toBe(false)
    expect(runtime.availableProviders).toEqual([])
  })
})
