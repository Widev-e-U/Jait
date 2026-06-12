import type { ChangedFile } from '@/components/chat'
import type { GitStatusResult } from '@/lib/git-api'

export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getRelativeProjectPath(path: string, projectRoot: string | null): string {
  const normalizedPath = normalizeProjectPath(path)
  if (!projectRoot) return normalizedPath
  const normalizedRoot = normalizeProjectPath(projectRoot)
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : normalizedPath
}

export function buildGitDiffCountMap(status: GitStatusResult | null, projectRoot: string | null): Map<string, { insertions: number; deletions: number }> {
  const counts = new Map<string, { insertions: number; deletions: number }>()
  if (!status) return counts

  const addCounts = (path: string, insertions: number, deletions: number) => {
    const normalizedPath = normalizeProjectPath(path)
    const existing = counts.get(normalizedPath) ?? { insertions: 0, deletions: 0 }
    counts.set(normalizedPath, {
      insertions: existing.insertions + insertions,
      deletions: existing.deletions + deletions,
    })
  }

  for (const file of [...status.index.files, ...status.workingTree.files]) {
    addCounts(file.path, file.insertions, file.deletions)
    if (projectRoot) {
      addCounts(`${normalizeProjectPath(projectRoot)}/${normalizeProjectPath(file.path)}`, file.insertions, file.deletions)
    }
  }

  return counts
}

export function enrichChangedFilesWithDiffCounts(
  files: ChangedFile[],
  status: GitStatusResult | null,
  projectRoot: string | null,
): ChangedFile[] {
  const counts = buildGitDiffCountMap(status, projectRoot)
  if (counts.size === 0) return files

  return files.map((file) => {
    const normalizedPath = normalizeProjectPath(file.path)
    const relativePath = getRelativeProjectPath(file.path, projectRoot)
    const diffCounts = counts.get(normalizedPath) ?? counts.get(relativePath)
    return diffCounts ? { ...file, ...diffCounts } : file
  })
}
