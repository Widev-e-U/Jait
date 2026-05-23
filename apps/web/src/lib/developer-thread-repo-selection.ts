import type { SendTarget } from '@/components/chat/send-target-selector'
import type { ViewMode } from '@/components/chat/view-mode-selector'

interface RepositoryIdLike {
  id: string
}

interface DeveloperThreadRepoAutoSelectArgs<T extends RepositoryIdLike> {
  viewMode: ViewMode
  sendTarget: SendTarget
  projectId: string | null
  projectRepoId: string | null
  repositories: T[]
  lastAppliedKey: string | null
}

export interface DeveloperThreadRepoAutoSelectResult {
  nextAppliedKey: string
  repoId: string | null
}

export function getDeveloperThreadRepoAutoSelectKey(
  projectId: string | null,
  projectRepoId: string | null,
): string {
  return `${projectId ?? ''}::${projectRepoId ?? ''}`
}

export function resolveDeveloperThreadRepoAutoSelect<T extends RepositoryIdLike>({
  viewMode,
  sendTarget,
  projectId,
  projectRepoId,
  repositories,
  lastAppliedKey,
}: DeveloperThreadRepoAutoSelectArgs<T>): DeveloperThreadRepoAutoSelectResult | null {
  if (viewMode !== 'developer' || sendTarget !== 'thread') {
    return null
  }

  const nextAppliedKey = getDeveloperThreadRepoAutoSelectKey(projectId, projectRepoId)
  if (lastAppliedKey === nextAppliedKey) {
    return null
  }

  if (!projectRepoId) {
    return {
      nextAppliedKey,
      repoId: null,
    }
  }

  if (!repositories.some((repo) => repo.id === projectRepoId)) {
    return null
  }

  return {
    nextAppliedKey,
    repoId: projectRepoId,
  }
}
