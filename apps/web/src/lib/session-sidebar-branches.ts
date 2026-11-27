interface BranchSession {
  id: string
  metadata?: string | null
}

type SessionBranchRow<T> = { session: T; depth: number; hasChildren: boolean }

function readParentId(metadata: BranchSession['metadata']): string | undefined {
  if (!metadata) return undefined
  try {
    const parentId = JSON.parse(metadata)?.branch?.parentSessionId
    return typeof parentId === 'string' ? parentId : undefined
  } catch {
    return undefined
  }
}

/** Parent chats within a single project or the personal chat list. */
export function sessionSidebarParentIds(sessions: readonly BranchSession[]): Set<string> {
  const ids = new Set(sessions.map((session) => session.id))
  const parents = new Set<string>()
  for (const session of sessions) {
    const parent = readParentId(session.metadata)
    if (parent && parent !== session.id && ids.has(parent)) parents.add(parent)
  }
  return parents
}

/** Keep each parent and its visible descendants together when paging the sidebar. */
export function sessionSidebarBranches<T extends BranchSession>(
  sessions: readonly T[],
  limit = Infinity,
  manualOrder?: readonly string[],
  collapsedParents?: ReadonlySet<string>,
): { rows: SessionBranchRow<T>[]; hasOlder: boolean } {
  const indices = new Map(sessions.map((session, index) => [session.id, index]))
  const arranged = new Set(manualOrder)
  const children = new Map<string, T[]>()
  const roots: T[] = []
  for (const session of sessions) {
    const parentId = readParentId(session.metadata)
    if (!parentId || parentId === session.id || !indices.has(parentId)) {
      roots.push(session)
      continue
    }
    const siblings = children.get(parentId) ?? []
    siblings.push(session)
    children.set(parentId, siblings)
  }

  const seen = new Set<string>()
  const groups: Array<{ rows: SessionBranchRow<T>[]; rank: number }> = []
  // The second pass also keeps rows reachable if older or malformed metadata forms a cycle.
  for (const root of [...roots, ...sessions]) {
    if (seen.has(root.id)) continue
    const rows: Array<Omit<SessionBranchRow<T>, 'hasChildren'>> = []
    let rank = indices.get(root.id)!
    const pending: typeof rows = [{ session: root, depth: 0 }]
    while (pending.length) {
      const row = pending.pop()!
      if (seen.has(row.session.id)) continue
      seen.add(row.session.id)
      rows.push(row)
      // Recent forks can bring an older parent into view. Reordering an existing
      // child only changes its place among siblings.
      if (!arranged.has(row.session.id)) rank = Math.min(rank, indices.get(row.session.id)!)
      const descendants = children.get(row.session.id) ?? []
      for (let index = descendants.length - 1; index >= 0; index--) {
        pending.push({ session: descendants[index]!, depth: row.depth + 1 })
      }
    }
    const visibleRows: SessionBranchRow<T>[] = []
    let collapsedDepth = Infinity
    for (const [index, row] of rows.entries()) {
      if (row.depth > collapsedDepth) continue
      const hasChildren = (rows[index + 1]?.depth ?? 0) > row.depth
      visibleRows.push({ ...row, hasChildren })
      collapsedDepth = hasChildren && collapsedParents?.has(row.session.id) ? row.depth : Infinity
    }
    groups.push({ rows: visibleRows, rank })
  }

  groups.sort((a, b) => a.rank - b.rank)
  return {
    rows: groups.slice(0, limit).flatMap((group) => group.rows),
    hasOlder: groups.length > limit,
  }
}
