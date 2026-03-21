const DEFAULT_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.idea',
  '.vscode',
])

export interface WorkspaceContentSearchMatch {
  file: string
  line: number
  content: string
}

export interface DirectoryLikeEntry {
  kind: 'file' | 'directory'
  name: string
}

export interface FileLikeEntry extends DirectoryLikeEntry {
  kind: 'file'
  getFile: () => Promise<{ size: number; text: () => Promise<string> }>
}

export interface DirectoryLikeHandle extends DirectoryLikeEntry {
  kind: 'directory'
  values: () => AsyncIterable<DirectoryLikeHandle | FileLikeEntry>
}

export async function searchWorkspaceContent(
  root: DirectoryLikeHandle,
  query: string,
  limit: number,
  signal?: AbortSignal,
  skipDirs: Set<string> = DEFAULT_SKIP_DIRS,
): Promise<WorkspaceContentSearchMatch[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery || limit < 1) return []

  const matches: WorkspaceContentSearchMatch[] = []
  const maxFileSizeBytes = 1024 * 1024

  const searchTextContent = (path: string, text: string) => {
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (signal?.aborted || matches.length >= limit) return
      const line = lines[index] ?? ''
      if (line.toLowerCase().includes(normalizedQuery)) {
        matches.push({
          file: path,
          line: index + 1,
          content: line.trim(),
        })
      }
    }
  }

  const walkDir = async (dirHandle: DirectoryLikeHandle, prefix: string): Promise<boolean> => {
    if (signal?.aborted || matches.length >= limit) return true
    try {
      for await (const entry of dirHandle.values()) {
        if (signal?.aborted || matches.length >= limit) return true
        const entryName = entry.name
        if (entryName.startsWith('.') || skipDirs.has(entryName)) continue
        const entryPath = prefix ? `${prefix}/${entryName}` : entryName

        if (entry.kind === 'directory') {
          const done = await walkDir(entry, entryPath)
          if (done) return true
          continue
        }

        try {
          const file = await entry.getFile()
          if (file.size > maxFileSizeBytes) continue
          const text = await file.text()
          if (text.includes('\u0000')) continue
          searchTextContent(entryPath, text)
        } catch {
          // Ignore unreadable files.
        }
      }
    } catch {
      // Ignore traversal and permission errors.
    }
    return signal?.aborted === true || matches.length >= limit
  }

  await walkDir(root, '')
  return matches
}
