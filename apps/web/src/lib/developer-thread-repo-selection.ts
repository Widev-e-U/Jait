import type { SendTarget } from '@/components/chat/send-target-selector'
import type { ViewMode } from '@/components/chat/view-mode-selector'

interface RepositoryIdLike {
  id: string
}

interface DeveloperThreadRepoAutoSelectArgs<T extends RepositoryIdLike> {
  viewMode: ViewMode
  sendTarget: SendTarget
  workspaceId: string | null
  workspaceRepoId: string | null
  repositories: T[]
  lastAppliedKey: string | null
}

export interface DeveloperThreadRepoAutoSelectResult {
  nextAppliedKey: string
  repoId: string | null
}

export function getDeveloperThreadRepoAutoSelectKey(
  workspaceId: string | null,
  workspaceRepoId: string | null,
): string {
  return `${workspaceId ?? ''}::${workspaceRepoId ?? ''}`
}

export function resolveDeveloperThreadRepoAutoSelect<T extends RepositoryIdLike>({
  viewMode,
  sendTarget,
  workspaceId,
  workspaceRepoId,
  repositories,
  lastAppliedKey,
}: DeveloperThreadRepoAutoSelectArgs<T>): DeveloperThreadRepoAutoSelectResult | null {
  if (viewMode !== 'developer' || sendTarget !== 'thread') {
    return null
  }

  const nextAppliedKey = getDeveloperThreadRepoAutoSelectKey(workspaceId, workspaceRepoId)
  if (lastAppliedKey === nextAppliedKey) {
    return null
  }

  if (!workspaceRepoId) {
    return {
      nextAppliedKey,
      repoId: null,
    }
  }

  if (!repositories.some((repo) => repo.id === workspaceRepoId)) {
    return null
  }

  return {
    nextAppliedKey,
    repoId: workspaceRepoId,
  }
}
