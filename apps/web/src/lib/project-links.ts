export interface ProjectLinkTarget {
  path: string
  line?: number
  column?: number
}

const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/
const UNIX_ABS_PATH_RE = /^\//

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized || (path.startsWith('/') ? '/' : '')
}

function pathFromFileUrl(url: URL): string {
  const pathname = url.pathname || '/'
  const normalizedPathname = /^\/[A-Za-z]:\//.test(pathname)
    ? pathname.slice(1)
    : pathname
  if (!url.hostname || url.hostname === 'localhost') {
    return normalizedPathname
  }
  return `//${url.hostname}${normalizedPathname}`
}

export function isAbsoluteProjectPath(value: string): boolean {
  return WINDOWS_ABS_PATH_RE.test(value) || UNIX_ABS_PATH_RE.test(value)
}

function isLikelyProjectFilePath(path: string, fragment: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized || normalized === '/') return false

  if (/^L\d+(?:C\d+)?$/i.test(fragment)) return true

  const baseName = normalized.split('/').pop() ?? ''
  return /\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?$/.test(baseName)
}

function extractColonLocation(path: string, fragment: string): ProjectLinkTarget | null {
  if (fragment) return null

  const normalized = path.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  const baseName = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized
  const baseMatch = baseName.match(/^(.*?):(\d+)(?::(\d+))?$/)
  if (!baseMatch) return null

  const candidatePath = slashIndex >= 0
    ? `${path.slice(0, slashIndex + 1)}${baseMatch[1] ?? ''}`
    : (baseMatch[1] ?? '')

  if (!isAbsoluteProjectPath(candidatePath) || !isLikelyProjectFilePath(candidatePath, `L${baseMatch[2]}`)) {
    return null
  }

  const target: ProjectLinkTarget = {
    path: candidatePath,
    line: Number.parseInt(baseMatch[2]!, 10),
  }
  if (baseMatch[3]) {
    target.column = Number.parseInt(baseMatch[3], 10)
  }
  return target
}

export function parseProjectLinkTarget(href?: string | null): ProjectLinkTarget | null {
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
      if (!isLikelyProjectFilePath(pathPart, fragment)) return null
    } else if (url.protocol === 'file:') {
      pathPart = pathFromFileUrl(url)
      fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
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

  if (!isAbsoluteProjectPath(decodedPath)) return null

  const target: ProjectLinkTarget = { path: decodedPath }

  const lineMatch = fragment.match(/^L(\d+)(?:C(\d+))?$/i)
  if (lineMatch) {
    target.line = Number.parseInt(lineMatch[1]!, 10)
    if (lineMatch[2]) {
      target.column = Number.parseInt(lineMatch[2], 10)
    }
  }

  return target
}

// Bare file names only count with an extension that is clearly a file, so
// `node.js`, `e.g.` or a version like `v1.2` stay plain code.
const KNOWN_FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'md', 'mdx', 'markdown', 'txt', 'log', 'csv', 'tsv',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'dart', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'lua',
  'sh', 'bash', 'zsh', 'ps1', 'sql', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'xml', 'svg',
  'yml', 'yaml', 'toml', 'ini', 'conf', 'env', 'lock', 'gradle', 'properties', 'dockerfile',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'pdf',
])

/**
 * A path written as inline code in a chat message (`src/a.ts`, `./x.png`,
 * `docs/guide.md:12`, `/abs/file.ts:3:1`). Relative paths are returned as-is;
 * the opener resolves them against the chat's project.
 */
export function parseInlinePathCandidate(text: string): ProjectLinkTarget | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 300 || /\s/.test(trimmed) || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null
  const match = trimmed.match(/^(.*?)(?::(\d+)(?::(\d+))?)?$/)
  const path = match?.[1] ?? ''
  if (!/^(?:[A-Za-z]:[\\/]|[./~]|[\w@-])[\w@~+.\\/-]*$/.test(path) || path.includes('//')) return null
  const baseName = path.split(/[\\/]/).pop() ?? ''
  const extension = baseName.includes('.') ? baseName.split('.').pop()!.toLowerCase() : ''
  const hasDirectory = /[\\/]/.test(path.replace(/[\\/]+$/, ''))
  if (!extension || !/^[a-z0-9]{1,10}$/.test(extension)) return null
  if (!hasDirectory && !KNOWN_FILE_EXTENSIONS.has(extension)) return null
  const target: ProjectLinkTarget = { path }
  if (match?.[2]) target.line = Number.parseInt(match[2], 10)
  if (match?.[3]) target.column = Number.parseInt(match[3], 10)
  return target
}

/** Resolve a chat path against the project root; absolute paths pass through. */
export function resolveProjectPath(path: string, projectRoot?: string | null): string {
  if (isAbsoluteProjectPath(path) || !projectRoot) return path
  const relative = path.replace(/\\/g, '/').replace(/^\.\//, '')
  return `${projectRoot.replace(/[\\/]+$/, '')}/${relative}`
}

export function isPathWithinProject(path: string, projectRoot?: string | null): boolean {
  if (!projectRoot) return false

  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(projectRoot)
  if (!normalizedPath || !normalizedRoot) return false

  if (!isAbsoluteProjectPath(normalizedPath)) {
    let depth = 0
    for (const segment of normalizedPath.split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') {
        if (depth === 0) return false
        depth -= 1
        continue
      }
      depth += 1
    }
    return depth > 0
  }

  const comparablePath = WINDOWS_ABS_PATH_RE.test(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath
  const comparableRoot = WINDOWS_ABS_PATH_RE.test(normalizedRoot)
    ? normalizedRoot.toLowerCase()
    : normalizedRoot

  return comparablePath === comparableRoot
    || (comparableRoot === '/' ? comparablePath.startsWith('/') : comparablePath.startsWith(`${comparableRoot}/`))
}

export function getProjectRootForPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/')
  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex <= 0) return null
  return normalized.slice(0, slashIndex)
}
