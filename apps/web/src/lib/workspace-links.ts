export interface WorkspaceLinkTarget {
  path: string
  line?: number
  column?: number
}

const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/
const UNIX_ABS_PATH_RE = /^\//

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function isAbsoluteWorkspacePath(value: string): boolean {
  return WINDOWS_ABS_PATH_RE.test(value) || UNIX_ABS_PATH_RE.test(value)
}

export function parseWorkspaceLinkTarget(href?: string | null): WorkspaceLinkTarget | null {
  if (!href) return null

  const trimmed = href.trim()
  if (!trimmed) return null

  let pathPart = trimmed
  let fragment = ''
  const hashIndex = trimmed.indexOf('#')
  if (hashIndex >= 0) {
    pathPart = trimmed.slice(0, hashIndex)
    fragment = trimmed.slice(hashIndex + 1)
  }

  const decodedPath = decodeURIComponent(pathPart)
  if (!isAbsoluteWorkspacePath(decodedPath)) return null

  const target: WorkspaceLinkTarget = { path: decodedPath }

  const lineMatch = fragment.match(/^L(\d+)(?:C(\d+))?$/i)
  if (lineMatch) {
    target.line = Number.parseInt(lineMatch[1]!, 10)
    if (lineMatch[2]) {
      target.column = Number.parseInt(lineMatch[2], 10)
    }
  }

  return target
}

export function isPathWithinWorkspace(path: string, workspaceRoot?: string | null): boolean {
  if (!workspaceRoot) return false

  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(workspaceRoot)
  if (!normalizedPath || !normalizedRoot) return false

  const comparablePath = WINDOWS_ABS_PATH_RE.test(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath
  const comparableRoot = WINDOWS_ABS_PATH_RE.test(normalizedRoot)
    ? normalizedRoot.toLowerCase()
    : normalizedRoot

  return comparablePath === comparableRoot || comparablePath.startsWith(`${comparableRoot}/`)
}

export function getWorkspaceRootForPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex <= 0) return null
  return normalized.slice(0, slashIndex)
}
