import type { AutomationRepository } from './automation-repositories'

export interface ProjectRepositoryMetadata {
  metadata: string | null
}

export function parseProjectMetadata(project: ProjectRepositoryMetadata | null | undefined): Record<string, unknown> {
  if (!project?.metadata) return {}
  try {
    const parsed = JSON.parse(project.metadata) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function getProjectRepositoryId(project: ProjectRepositoryMetadata | null | undefined): string | null {
  const metadata = parseProjectMetadata(project)
  const value = metadata.repositoryId ?? metadata.repoId
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getProjectRepository<T extends Pick<AutomationRepository, 'id'>>(
  project: ProjectRepositoryMetadata | null | undefined,
  repositories: T[],
): T | null {
  const repoId = getProjectRepositoryId(project)
  if (!repoId) return null
  return repositories.find((repo) => repo.id === repoId) ?? null
}
