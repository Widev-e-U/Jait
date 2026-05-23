import type { FsChangesPayload } from '@jait/shared'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\//.test(path)
}

function pathsEqual(a: string, b: string): boolean {
  const left = normalizePath(a)
  const right = normalizePath(b)
  if (/^[a-zA-Z]:\//.test(left) || /^[a-zA-Z]:\//.test(right)) {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

export function fsChangesIncludeFile(
  payload: FsChangesPayload | null | undefined,
  projectRoot: string | null | undefined,
  filePath: string | null | undefined,
): boolean {
  if (!payload || !projectRoot || !filePath) return false

  const root = normalizePath(projectRoot)
  const target = normalizePath(filePath)

  for (const change of payload.changes) {
    const changed = normalizePath(change.path)
    if (!changed) continue

    if (isAbsolutePath(changed)) {
      if (pathsEqual(changed, target)) return true
      continue
    }

    if (pathsEqual(`${root}/${changed.replace(/^\.\//, '')}`, target)) return true
  }

  return false
}
