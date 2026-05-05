import type { AgentThread, AutomationRepo, ProviderId, ProviderInfo, RemoteProviderInfo } from './agents-api'

export type AutomationRepositorySource = 'local' | 'shared'
export type ThreadRepositoryReference = Pick<AgentThread, 'title' | 'workingDirectory'> & Partial<Pick<AgentThread, 'prUrl'>>

export interface AutomationRepository {
  id: string
  name: string
  defaultBranch: string
  localPath: string
  deviceId?: string | null
  /** Remote forge URL (GitHub, GitLab, Gitea, Azure DevOps, Bitbucket) */
  forgeUrl?: string | null
  /** @deprecated Use forgeUrl */
  githubUrl?: string | null
  source: AutomationRepositorySource
}

export interface RepositoryRuntimeInfo {
  hostType: 'gateway' | 'device'
  locationLabel: string
  online: boolean
  loading: boolean
  availableProviders: ProviderId[]
}

export function mapDbRepoToAutomationRepository(repo: AutomationRepo): AutomationRepository {
  return {
    id: repo.id,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    localPath: repo.localPath,
    deviceId: repo.deviceId,
    forgeUrl: repo.forgeUrl,
    githubUrl: repo.githubUrl,
    source: 'local',
  }
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

interface RepositoryUrlIdentity {
  host: string
  path: string
  name: string
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '')
}

function normalizeRepositoryPath(pathname: string): string | null {
  let parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const azureGitIndex = parts.indexOf('_git')
  if (azureGitIndex >= 0 && parts[azureGitIndex + 1]) {
    parts = [...parts.slice(0, azureGitIndex), parts[azureGitIndex + 1]]
  } else {
    const gitlabMergeRequestIndex = parts.findIndex((part, index) => part === '-' && parts[index + 1] === 'merge_requests')
    const reviewMarkerIndex = gitlabMergeRequestIndex >= 0
      ? gitlabMergeRequestIndex
      : parts.findIndex((part) => part === 'pull' || part === 'pulls' || part === 'pullrequest' || part === 'pull-requests' || part === 'merge_requests')

    if (reviewMarkerIndex > 0) {
      parts = parts.slice(0, reviewMarkerIndex)
    }
  }

  const last = parts[parts.length - 1]
  if (!last) return null
  parts[parts.length - 1] = stripGitSuffix(last)

  return parts.join('/')
}

function parseRepositoryUrl(value?: string | null): RepositoryUrlIdentity | null {
  const raw = value?.trim()
  if (!raw) return null

  const scpLike = raw.match(/^git@([^:]+):(.+)$/)
  if (scpLike) {
    const path = normalizeRepositoryPath(scpLike[2] ?? '')
    if (!path) return null
    const segments = path.split('/')
    return { host: (scpLike[1] ?? '').toLowerCase(), path, name: segments[segments.length - 1] ?? path }
  }

  try {
    const url = new URL(raw)
    const path = normalizeRepositoryPath(url.pathname)
    if (!path) return null
    const segments = path.split('/')
    return { host: url.hostname.toLowerCase(), path, name: segments[segments.length - 1] ?? path }
  } catch {
    return null
  }
}

function sameRepositoryUrl(left: RepositoryUrlIdentity | null, right: RepositoryUrlIdentity | null): boolean {
  return Boolean(left && right && left.host === right.host && left.path.toLowerCase() === right.path.toLowerCase())
}

function repositoryUrlIdentities(repository: Partial<Pick<AutomationRepository, 'forgeUrl' | 'githubUrl'>>): RepositoryUrlIdentity[] {
  return [
    parseRepositoryUrl(repository.forgeUrl),
    parseRepositoryUrl(repository.githubUrl),
  ].filter((identity): identity is RepositoryUrlIdentity => Boolean(identity))
}

export function inferThreadRepositoryName(thread: ThreadRepositoryReference): string | null {
  return (
    extractTaggedRepoName(thread.title) ??
    extractWorktreeRepoName(thread.workingDirectory) ??
    parseRepositoryUrl(thread.prUrl)?.name ??
    (thread.workingDirectory ? folderName(thread.workingDirectory) : null)
  )
}

export function threadBelongsToRepository(
  thread: ThreadRepositoryReference,
  repository: Pick<AutomationRepository, 'name' | 'localPath'> & Partial<Pick<AutomationRepository, 'forgeUrl' | 'githubUrl'>>,
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

  const threadPrRepo = parseRepositoryUrl(thread.prUrl)
  if (threadPrRepo && repositoryUrlIdentities(repository).some((repoUrl) => sameRepositoryUrl(threadPrRepo, repoUrl))) {
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
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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
    providersLoaded: boolean
  },
): RepositoryRuntimeInfo {
  const { localDeviceId, localProviders, remoteProviders, providersLoaded } = options

  if (!repository.deviceId) {
    return {
      hostType: 'gateway',
      locationLabel: 'Gateway',
      online: true,
      loading: false,
      availableProviders: localProviders.filter((provider) => provider.available).map((provider) => provider.id),
    }
  }

  const remoteNode = remoteProviders.find((node) => node.nodeId === repository.deviceId)
  const locationLabel = repository.deviceId === localDeviceId
    ? 'This device'
    : remoteNode?.nodeName ?? 'Desktop app'
  const isOnline = Boolean(remoteNode)

  return {
    hostType: 'device',
    locationLabel,
    online: isOnline,
    loading: !isOnline && !providersLoaded,
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
