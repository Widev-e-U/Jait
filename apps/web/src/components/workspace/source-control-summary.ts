import type { GitStatusFile, FileDiffEntry } from '@/lib/git-api'

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/')
}

export function mergeSourceControlWorkingTreeFiles(
  statusFiles: GitStatusFile[],
  diffEntries: FileDiffEntry[],
  stagedFiles: GitStatusFile[],
): GitStatusFile[] {
  if (diffEntries.length === 0) return statusFiles

  const statusByPath = new Map(statusFiles.map((file) => [normalizePath(file.path), file] as const))
  const stagedPaths = new Set(stagedFiles.map((file) => normalizePath(file.path)))
  const usedPaths = new Set<string>()
  const merged: GitStatusFile[] = []

  for (const entry of diffEntries) {
    const normalizedEntryPath = normalizePath(entry.path)
    const statusMatch = statusByPath.get(normalizedEntryPath)

    if (statusMatch) {
      usedPaths.add(normalizedEntryPath)
      merged.push(statusMatch)
      continue
    }

    if (stagedPaths.has(normalizedEntryPath)) continue

    usedPaths.add(normalizedEntryPath)
    merged.push({
      path: entry.path,
      insertions: 0,
      deletions: 0,
      status: entry.status,
    })
  }

  for (const file of statusFiles) {
    const normalizedPath = normalizePath(file.path)
    if (!usedPaths.has(normalizedPath)) {
      merged.push(file)
    }
  }

  return merged
}

export function getSourceControlChangeCount(
  stagedFiles: GitStatusFile[],
  workingTreeFiles: GitStatusFile[],
): number {
  return stagedFiles.length + workingTreeFiles.length
}
