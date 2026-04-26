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

function isLikelyWorkspaceFilePath(path: string, fragment: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized || normalized === '/') return false

  if (/^L\d+(?:C\d+)?$/i.test(fragment)) return true

  const baseName = normalized.split('/').pop() ?? ''
  return /\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?$/.test(baseName)
}

function extractColonLocation(path: string, fragment: string): WorkspaceLinkTarget | null {
  if (fragment) return null

  const normalized = path.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  const baseName = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized
  const baseMatch = baseName.match(/^(.*?):(\d+)(?::(\d+))?$/)
  if (!baseMatch) return null

  const candidatePath = slashIndex >= 0
    ? `${path.slice(0, slashIndex + 1)}${baseMatch[1] ?? ''}`
    : (baseMatch[1] ?? '')

  if (!isAbsoluteWorkspacePath(candidatePath) || !isLikelyWorkspaceFilePath(candidatePath, `L${baseMatch[2]}`)) {
    return null
  }

  const target: WorkspaceLinkTarget = {
    path: candidatePath,
    line: Number.parseInt(baseMatch[2]!, 10),
  }
  if (baseMatch[3]) {
    target.column = Number.parseInt(baseMatch[3], 10)
  }
  return target
}

export function parseWorkspaceLinkTarget(href?: string | null): WorkspaceLinkTarget | null {
  if (!href) return null

  const trimmed = href.trim()
  if (!trimmed) return null

  let pathPart = trimmed
  let fragment = ''
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      pathPart = url.pathname
      fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      if (!isLikelyWorkspaceFilePath(pathPart, fragment)) return null
    } else {
      const hashIndex = trimmed.indexOf('#')
      if (hashIndex >= 0) {
        pathPart = trimmed.slice(0, hashIndex)
        fragment = trimmed.slice(hashIndex + 1)
      }
    }
  } catch {
    const hashIndex = trimmed.indexOf('#')
    if (hashIndex >= 0) {
      pathPart = trimmed.slice(0, hashIndex)
      fragment = trimmed.slice(hashIndex + 1)
    }
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathPart)
  } catch {
    return null
  }

  const colonLocationTarget = extractColonLocation(decodedPath, fragment)
  if (colonLocationTarget) return colonLocationTarget

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
