import type { FsChangeEvent, FsChangesPayload } from '@jait/shared'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function normalizeComparablePath(path: string): string {
  const normalized = normalizePath(path)
  return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function shouldRefreshSourceControlForStateKey(key: string): boolean {
  return key === 'file_changed'
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\//.test(path)
}

function pathsEqual(a: string, b: string): boolean {
  return normalizeComparablePath(a) === normalizeComparablePath(b)
}

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const parent = normalizeComparablePath(parentPath)
  const candidate = normalizeComparablePath(candidatePath)
  return candidate === parent || candidate.startsWith(`${parent}/`)
}

export function resolveFsChangePath(projectRoot: string, change: FsChangeEvent): string | null {
  const root = normalizePath(projectRoot)
  const changed = normalizePath(change.path)
  if (!changed) return null
  if (isAbsolutePath(changed)) return changed
  return `${root}/${changed.replace(/^\.\//, '')}`
}

export function getFsWatcherRefreshDirs(
  payload: FsChangesPayload | null | undefined,
  projectRoot: string | null | undefined,
  expandedDirs: Iterable<string>,
): string[] {
  if (!payload || !projectRoot) return []

  const root = normalizePath(projectRoot)
  const expanded = [...expandedDirs]
    .map(normalizePath)
    .filter((dirPath) => dirPath && isDescendantPath(root, dirPath))
    .sort((a, b) => b.length - a.length)
  const refreshDirs = new Set<string>()

  for (const change of payload.changes) {
    const changed = resolveFsChangePath(root, change)
    if (!changed || !isDescendantPath(root, changed)) continue

    const nearestExpandedParent = expanded.find((dirPath) => {
      return !pathsEqual(dirPath, changed) && isDescendantPath(dirPath, changed)
    })
    refreshDirs.add(nearestExpandedParent ?? root)
  }

  return [...refreshDirs]
}

export function fsChangesIncludeFile(
  payload: FsChangesPayload | null | undefined,
  projectRoot: string | null | undefined,
  filePath: string | null | undefined,
): boolean {
  if (!payload || !projectRoot || !filePath) return false

  const target = normalizePath(filePath)

  for (const change of payload.changes) {
    const changed = resolveFsChangePath(projectRoot, change)
    if (changed && pathsEqual(changed, target)) return true
  }

  return false
}
