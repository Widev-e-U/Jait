import type { AgentThread, ProviderId, ProviderInfo, RemoteProviderInfo } from './agents-api'

export type AutomationRepositorySource = 'local' | 'shared'

export interface AutomationRepository {
  id: string
  name: string
  defaultBranch: string
  localPath: string
  deviceId?: string | null
  githubUrl?: string | null
  source: AutomationRepositorySource
}

export interface RepositoryRuntimeInfo {
  hostType: 'gateway' | 'device'
  locationLabel: string
  online: boolean
  availableProviders: ProviderId[]
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function folderName(path: string): string {
  const normalized = normalizePath(path)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function extractTaggedRepoName(title: string): string | null {
  const match = title.match(/^\[([^\]]+)\]/)
  return match?.[1]?.trim() || null
}

function extractWorktreeRepoName(path?: string | null): string | null {
  if (!path) return null
  const normalized = normalizePath(path)
  const parts = normalized.split('/').filter(Boolean)
  const worktreesIndex = parts.lastIndexOf('worktrees')
  if (worktreesIndex === -1) return null
  return parts[worktreesIndex + 1] ?? null
}

export function inferThreadRepositoryName(thread: Pick<AgentThread, 'title' | 'workingDirectory'>): string | null {
  return (
    extractTaggedRepoName(thread.title) ??
    extractWorktreeRepoName(thread.workingDirectory) ??
    (thread.workingDirectory ? folderName(thread.workingDirectory) : null)
  )
}

export function threadBelongsToRepository(
  thread: Pick<AgentThread, 'title' | 'workingDirectory'>,
  repository: Pick<AutomationRepository, 'name' | 'localPath'>,
): boolean {
  const repoName = repository.name.trim().toLowerCase()
  const threadRepoName = inferThreadRepositoryName(thread)?.toLowerCase()
  const workingDirectory = thread.workingDirectory ? normalizePath(thread.workingDirectory) : null
  const repositoryPath = normalizePath(repository.localPath)

  if (workingDirectory && (workingDirectory === repositoryPath || workingDirectory.startsWith(`${repositoryPath}/`))) {
    return true
  }

  const worktreeRepoName = extractWorktreeRepoName(thread.workingDirectory)?.toLowerCase()
  if (worktreeRepoName && worktreeRepoName === repoName) {
    return true
  }

  return threadRepoName === repoName
}

export function inferSharedRepositories(
  threads: AgentThread[],
  localRepositories: AutomationRepository[],
): AutomationRepository[] {
  const sharedRepositories: AutomationRepository[] = []
  const seen = new Set<string>()

  for (const thread of threads) {
    if (localRepositories.some((repository) => threadBelongsToRepository(thread, repository))) {
      continue
    }

    const name = inferThreadRepositoryName(thread)
    const key = name?.trim().toLowerCase()
    if (!name || !key || seen.has(key)) {
      continue
    }

    sharedRepositories.push({
      id: `shared:${key}`,
      name,
      defaultBranch: 'main',
      localPath: thread.workingDirectory ?? name,
      source: 'shared',
    })
    seen.add(key)
  }

  return sharedRepositories
}

function toProviderId(value: string): ProviderId | null {
  if (value === 'jait' || value === 'codex' || value === 'claude-code') {
    return value
  }
  return null
}

function dedupeProviders(values: Iterable<string>): ProviderId[] {
  const seen = new Set<ProviderId>()
  for (const value of values) {
    const providerId = toProviderId(value)
    if (providerId) {
      seen.add(providerId)
    }
  }
  return [...seen]
}

export function getRepositoryRuntimeInfo(
  repository: Pick<AutomationRepository, 'deviceId'>,
  options: {
    localDeviceId: string
    localProviders: ProviderInfo[]
    remoteProviders: RemoteProviderInfo[]
  },
): RepositoryRuntimeInfo {
  const { localDeviceId, localProviders, remoteProviders } = options

  if (!repository.deviceId) {
    return {
      hostType: 'gateway',
      locationLabel: 'Gateway',
      online: true,
      availableProviders: localProviders.filter((provider) => provider.available).map((provider) => provider.id),
    }
  }

  const remoteNode = remoteProviders.find((node) => node.nodeId === repository.deviceId)
  const locationLabel = repository.deviceId === localDeviceId
    ? 'This device'
    : remoteNode?.nodeName ?? 'Desktop app'

  return {
    hostType: 'device',
    locationLabel,
    online: Boolean(remoteNode),
    availableProviders: dedupeProviders(remoteNode?.providers ?? []),
  }
}

export function buildRepositoryFallbackUnavailableMessage(
  repository: Pick<AutomationRepository, 'githubUrl'>,
  runtime: RepositoryRuntimeInfo,
): string {
  if (repository.githubUrl) {
    return `Couldn't reach ${runtime.locationLabel}.`
  }

  if (runtime.hostType === 'device' && !runtime.online) {
    const host = runtime.locationLabel === 'This device'
      ? 'This desktop app'
      : runtime.locationLabel
    return `${host} is offline and no GitHub URL is configured for gateway fallback. Reconnect it or pick a connected repo/device.`
  }

  return 'No GitHub URL is configured for this repo, so the gateway cannot clone it as a fallback.'
}
