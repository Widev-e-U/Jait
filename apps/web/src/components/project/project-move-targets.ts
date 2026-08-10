/**
 * The targets offered by "Move to folder" in the sidebar.
 *
 * Every row is a possible target, including one that has a directory of its
 * own. Folders and projects are the same entity — a folder is simply a row that
 * has no directory yet, and it can be given one at any time — so restricting
 * targets to "folders" would make the menu shrink the moment a folder got a
 * repository. Which directory applies is answered by inheritance: the nearest
 * ancestor that has one.
 *
 * Illegal targets are listed but disabled rather than hidden, so a folder that
 * is missing from the menu is never mistaken for a bug.
 */
import { buildProjectTree, flattenProjectTree, validateProjectMove, type MoveRejection } from '@jait/shared'
import type { ProjectRecord } from '@/hooks/useProjects'

export interface ProjectMoveTarget {
  project: ProjectRecord
  /** Indentation level in the folder tree. */
  depth: number
  disabled: boolean
  /** Why it is disabled — shown as the row's title. */
  reason: string | null
  /** The folder the project already sits in. */
  isCurrent: boolean
}

const REJECTION_REASONS: Record<MoveRejection, string> = {
  CYCLE: 'A folder cannot be moved into itself.',
  TOO_DEEP: 'That would nest folders too deeply.',
  PARENT_NOT_FOUND: 'That folder no longer exists.',
}

export function getProjectMoveTargets(
  projects: ProjectRecord[],
  projectId: string,
): ProjectMoveTarget[] {
  const moved = projects.find((p) => p.id === projectId)
  const currentParentId = moved?.parentId ?? null

  return flattenProjectTree(buildProjectTree(projects))
    // Offering a row as a destination for itself is never useful; its own
    // descendants stay listed but disabled, so the menu still explains itself.
    .filter((node) => node.project.id !== projectId)
    .map((node) => {
      const isCurrent = node.project.id === currentParentId
      // The same validator backs the API, so the menu can never offer a target
      // the server would reject.
      const rejection = validateProjectMove(projects, projectId, node.project.id)
      return {
        project: node.project,
        depth: node.depth,
        disabled: isCurrent || rejection !== null,
        reason: isCurrent ? null : rejection ? REJECTION_REASONS[rejection] : null,
        isCurrent,
      }
    })
}

/** Whether "Move to top level" would change anything. */
export function canMoveToTopLevel(projects: ProjectRecord[], projectId: string): boolean {
  const moved = projects.find((p) => p.id === projectId)
  return Boolean(moved?.parentId)
}
