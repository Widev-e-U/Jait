import type { AutomationRepository } from './automation-repositories'

export interface WorkspaceRepositoryMetadata {
  metadata: string | null
}

export function parseWorkspaceMetadata(workspace: WorkspaceRepositoryMetadata | null | undefined): Record<string, unknown> {
  if (!workspace?.metadata) return {}
  try {
    const parsed = JSON.parse(workspace.metadata) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function getWorkspaceRepositoryId(workspace: WorkspaceRepositoryMetadata | null | undefined): string | null {
  const metadata = parseWorkspaceMetadata(workspace)
  const value = metadata.repositoryId ?? metadata.repoId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getWorkspaceRepository<T extends Pick<AutomationRepository, 'id'>>(
  workspace: WorkspaceRepositoryMetadata | null | undefined,
  repositories: T[],
): T | null {
  const repoId = getWorkspaceRepositoryId(workspace)
  if (!repoId) return null
  return repositories.find((repo) => repo.id === repoId) ?? null
}
