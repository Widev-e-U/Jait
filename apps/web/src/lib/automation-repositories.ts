import type { AgentThread } from './agents-api'

export type AutomationRepositorySource = 'local' | 'shared'

export interface AutomationRepository {
  id: string
  name: string
  defaultBranch: string
  localPath: string
  githubToken?: string | null
  source: AutomationRepositorySource
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
    if (!key || seen.has(key)) {
      continue
    }

    sharedRepositories.push({
      id: `shared:${key}`,
      name,
      defaultBranch: 'main',
      localPath: thread.workingDirectory ?? name,
      githubToken: null,
      source: 'shared',
    })
    seen.add(key)
  }

  return sharedRepositories
}
