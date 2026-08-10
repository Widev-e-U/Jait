/**
 * What the folder/project settings dialog is pointed at.
 *
 * Editing targets a row that exists. Creating only remembers where the folder
 * would go — nothing is written until Save, so Cancel leaves no trace.
 */
import { getProjectAncestors } from '@jait/shared'
import type { ProjectRecord } from '@/hooks/useProjects'

export type ProjectContextTarget =
  | { mode: 'edit'; projectId: string }
  | { mode: 'create'; parentId: string | null }

export interface ProjectContextView {
  project: ProjectRecord | null
  /** Root-first chain whose instructions the dialog shows as inherited. */
  ancestors: ProjectRecord[]
}

export function resolveProjectContextView(
  projects: ProjectRecord[],
  target: ProjectContextTarget | null,
): ProjectContextView {
  if (!target) return { project: null, ancestors: [] }

  if (target.mode === 'edit') {
    return {
      project: projects.find((p) => p.id === target.projectId) ?? null,
      ancestors: getProjectAncestors(projects, target.projectId),
    }
  }

  // The folder does not exist yet, so its parent is an ancestor of the
  // folder-to-be and contributes context too — unlike in the edit case, where
  // getProjectAncestors already excludes the row itself.
  const { parentId } = target
  if (!parentId) return { project: null, ancestors: [] }
  const parent = projects.find((p) => p.id === parentId)
  if (!parent) return { project: null, ancestors: [] }
  return { project: null, ancestors: [...getProjectAncestors(projects, parentId), parent] }
}
