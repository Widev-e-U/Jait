import type { GitStatusFile, FileDiffEntry } from '@/lib/git-api'

export function getSourceControlChangeCount(
  stagedFiles: GitStatusFile[],
  workingTreeFiles: Array<GitStatusFile | Pick<FileDiffEntry, 'path' | 'status'>>,
): number {
  return stagedFiles.length + workingTreeFiles.length
}
