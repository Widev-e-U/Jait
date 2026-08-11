/**
 * Chat organisation — folder tree, colour palette, and instruction inheritance.
 *
 * Shared between the gateway (validation, prompt assembly) and the web app
 * (rendering, drag targets) so both sides agree on depth limits, cycle rules,
 * and what counts as a valid colour.
 */

export type ProjectKind = 'workspace' | 'folder'

/** Deeper than this and the 256px sidebar stops being readable. */
export const MAX_FOLDER_DEPTH = 5

/** Instructions inherited down a long chain can silently eat the context window. */
export const MAX_INSTRUCTION_CHARS = 8000

/**
 * The nine default category colours. Values are CSS colours that work on both
 * light and dark backgrounds; the picker may store any `#rrggbb` instead.
 */
export const PROJECT_COLORS = [
  { token: 'slate', label: 'Slate', value: '#64748b' },
  { token: 'red', label: 'Red', value: '#ef4444' },
  { token: 'orange', label: 'Orange', value: '#f97316' },
  { token: 'amber', label: 'Amber', value: '#f59e0b' },
  { token: 'green', label: 'Green', value: '#22c55e' },
  { token: 'teal', label: 'Teal', value: '#14b8a6' },
  { token: 'blue', label: 'Blue', value: '#3b82f6' },
  { token: 'violet', label: 'Violet', value: '#8b5cf6' },
  { token: 'pink', label: 'Pink', value: '#ec4899' },
] as const

export type ProjectColorToken = (typeof PROJECT_COLORS)[number]['token']

const COLOR_BY_TOKEN = new Map(PROJECT_COLORS.map((c) => [c.token, c.value]))
const HEX_PATTERN = /^#[0-9a-f]{6}$/i

/**
 * Accept either a palette token or a `#rrggbb` literal. Anything else — including
 * `rgb()`, `hsl()`, and bare colour names — is rejected so the value can be
 * dropped straight into a style attribute without an injection risk.
 */
export function normalizeProjectColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (COLOR_BY_TOKEN.has(trimmed as ProjectColorToken)) return trimmed
  return HEX_PATTERN.test(trimmed) ? trimmed : null
}

/** Resolve a stored colour to something renderable; null when unset. */
export function resolveProjectColor(value: string | null | undefined): string | null {
  if (!value) return null
  const token = COLOR_BY_TOKEN.get(value as ProjectColorToken)
  if (token) return token
  return HEX_PATTERN.test(value) ? value : null
}

/** Minimum shape the tree helpers need — both gateway rows and UI records satisfy it. */
export interface ProjectTreeNodeInput {
  id: string
  parentId?: string | null
  kind?: string | null
}

export interface ProjectTreeNode<T extends ProjectTreeNodeInput> {
  project: T
  depth: number
  children: ProjectTreeNode<T>[]
}

/**
 * Build a forest from a flat list. Nodes whose parent is missing (archived,
 * deleted, or belonging to another user) are surfaced at the root rather than
 * dropped — a chat must never become unreachable because its folder vanished.
 */
export function buildProjectTree<T extends ProjectTreeNodeInput>(rows: T[]): ProjectTreeNode<T>[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []

  for (const row of rows) {
    const parentId = row.parentId ?? null
    if (parentId && byId.has(parentId)) {
      const bucket = childrenOf.get(parentId) ?? []
      bucket.push(row)
      childrenOf.set(parentId, bucket)
    } else {
      roots.push(row)
    }
  }

  // `seen` guards against a cycle that survived in the data (e.g. written by an
  // older build); without it this recursion would not terminate.
  const build = (row: T, depth: number, seen: Set<string>): ProjectTreeNode<T> => {
    const children = seen.has(row.id) ? [] : (childrenOf.get(row.id) ?? [])
    const nextSeen = new Set(seen).add(row.id)
    return {
      project: row,
      depth,
      children: children.map((child) => build(child, depth + 1, nextSeen)),
    }
  }

  return roots.map((row) => build(row, 0, new Set()))
}

/** Depth-first flatten, parents before children — the order the sidebar renders in. */
export function flattenProjectTree<T extends ProjectTreeNodeInput>(
  nodes: ProjectTreeNode<T>[],
): ProjectTreeNode<T>[] {
  const out: ProjectTreeNode<T>[] = []
  const walk = (list: ProjectTreeNode<T>[]) => {
    for (const node of list) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** Ancestors from the root down to (but excluding) `id`. */
export function getProjectAncestors<T extends ProjectTreeNodeInput>(rows: T[], id: string): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const chain: T[] = []
  const seen = new Set<string>([id])
  let cursor = byId.get(id)?.parentId ?? null
  while (cursor && !seen.has(cursor)) {
    const parent = byId.get(cursor)
    if (!parent) break
    chain.unshift(parent)
    seen.add(cursor)
    cursor = parent.parentId ?? null
  }
  return chain
}

/** Every descendant of `id`, at any depth. */
export function getProjectDescendantIds<T extends ProjectTreeNodeInput>(rows: T[], id: string): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const row of rows) {
    const parentId = row.parentId ?? null
    if (!parentId) continue
    const bucket = childrenOf.get(parentId) ?? []
    bucket.push(row.id)
    childrenOf.set(parentId, bucket)
  }
  const out: string[] = []
  const queue = [...(childrenOf.get(id) ?? [])]
  const seen = new Set<string>([id])
  while (queue.length > 0) {
    const next = queue.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    out.push(next)
    queue.push(...(childrenOf.get(next) ?? []))
  }
  return out
}

export type MoveRejection =
  | 'PARENT_NOT_FOUND'
  | 'CYCLE'
  | 'TOO_DEEP'

/**
 * Decide whether `projectId` may be re-parented under `newParentId`.
 * Returns null when the move is allowed, otherwise the reason it is not.
 *
 * The same function backs the API guard and the greyed-out entries in the move
 * menu, so the UI can never offer a target the server would reject.
 *
 * Any row may hold children, including one with a directory of its own. The
 * earlier "only folders may be parents" rule became a trap once a folder could
 * be given a directory later: attaching a repository would silently strip the
 * folder's ability to contain the children it already had. Which directory
 * applies is answered by inheritance instead — the nearest ancestor that has
 * one, see ProjectService.effectiveRootPath.
 */
export function validateProjectMove<T extends ProjectTreeNodeInput>(
  rows: T[],
  projectId: string,
  newParentId: string | null,
): MoveRejection | null {
  if (!newParentId) return null

  const byId = new Map(rows.map((row) => [row.id, row]))
  if (!byId.has(newParentId)) return 'PARENT_NOT_FOUND'
  if (newParentId === projectId) return 'CYCLE'
  if (getProjectDescendantIds(rows, projectId).includes(newParentId)) return 'CYCLE'

  // Depth of the parent, plus the moved node, plus its own deepest branch.
  const parentDepth = getProjectAncestors(rows, newParentId).length + 1
  const subtreeHeight = measureSubtreeHeight(rows, projectId)
  if (parentDepth + 1 + subtreeHeight > MAX_FOLDER_DEPTH) return 'TOO_DEEP'

  return null
}

/** Levels below `id`; a leaf measures 0. */
function measureSubtreeHeight<T extends ProjectTreeNodeInput>(rows: T[], id: string): number {
  const childrenOf = new Map<string, string[]>()
  for (const row of rows) {
    const parentId = row.parentId ?? null
    if (!parentId) continue
    const bucket = childrenOf.get(parentId) ?? []
    bucket.push(row.id)
    childrenOf.set(parentId, bucket)
  }
  const walk = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0
    const children = childrenOf.get(nodeId) ?? []
    if (children.length === 0) return 0
    const nextSeen = new Set(seen).add(nodeId)
    return 1 + Math.max(...children.map((child) => walk(child, nextSeen)))
  }
  return walk(id, new Set())
}

export interface InstructionChainEntry {
  id: string
  title: string | null
  instructions: string
}

/**
 * Render an inherited instruction chain into a single prompt block.
 *
 * Order is root → leaf, so the most specific folder speaks last and wins any
 * contradiction. Output is capped at `MAX_INSTRUCTION_CHARS`: entries are
 * dropped from the *root* end, because the leaf is the one the user just set
 * and the one they expect to take effect.
 */
export function renderInstructionChain(entries: InstructionChainEntry[]): string | null {
  const usable = entries.filter((entry) => entry.instructions.trim().length > 0)
  if (usable.length === 0) return null

  const format = (entry: InstructionChainEntry) => {
    const label = entry.title?.trim() || 'Project'
    return `## ${label}\n${entry.instructions.trim()}`
  }

  const kept: InstructionChainEntry[] = []
  let total = 0
  for (let i = usable.length - 1; i >= 0; i--) {
    const block = format(usable[i]!)
    if (total + block.length > MAX_INSTRUCTION_CHARS) break
    kept.unshift(usable[i]!)
    total += block.length
  }

  // The leaf alone can exceed the cap — keep a truncated version rather than
  // silently returning nothing.
  if (kept.length === 0) {
    const leaf = usable[usable.length - 1]!
    return `${format(leaf).slice(0, MAX_INSTRUCTION_CHARS)}\n[truncated]`
  }

  const truncated = kept.length < usable.length
  return kept.map(format).join('\n\n') + (truncated ? '\n\n[earlier project context truncated]' : '')
}
