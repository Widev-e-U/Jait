import type { ChangedFile, FileChangeState } from '@/components/chat/files-changed'

const validStates = new Set<FileChangeState>(['undecided', 'accepted', 'rejected'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeChangedFiles(value: unknown): ChangedFile[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const files: ChangedFile[] = []

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || entry.path.length === 0) continue
    if (seen.has(entry.path)) continue
    seen.add(entry.path)

    const name = typeof entry.name === 'string' && entry.name.length > 0
      ? entry.name
      : entry.path.split('/').pop() || entry.path
    const state = typeof entry.state === 'string' && validStates.has(entry.state as FileChangeState)
      ? entry.state as FileChangeState
      : 'undecided'
    const insertions = typeof entry.insertions === 'number' && Number.isFinite(entry.insertions)
      ? Math.max(0, entry.insertions)
      : undefined
    const deletions = typeof entry.deletions === 'number' && Number.isFinite(entry.deletions)
      ? Math.max(0, entry.deletions)
      : undefined

    files.push({
      path: entry.path,
      name,
      state,
      ...(insertions !== undefined ? { insertions } : {}),
      ...(deletions !== undefined ? { deletions } : {}),
    })
  }

  return files
}
