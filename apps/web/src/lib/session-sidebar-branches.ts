interface BranchSession {
  id: string
  metadata?: string | null
}

type SessionBranchRow<T> = { session: T; depth: number }

function readParentId(metadata: BranchSession['metadata']): string | undefined {
  if (!metadata) return undefined
  try {
    const parentId = JSON.parse(metadata)?.branch?.parentSessionId
    return typeof parentId === 'string' ? parentId : undefined
  } catch {
    return undefined
  }
}

/** Keep each parent and its visible descendants together when paging the sidebar. */
export function sessionSidebarBranches<T extends BranchSession>(
  sessions: readonly T[],
  limit = Infinity,
  manualOrder?: readonly string[],
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
    const rows: SessionBranchRow<T>[] = []
    let rank = indices.get(root.id)!
    const pending: SessionBranchRow<T>[] = [{ session: root, depth: 0 }]
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
    groups.push({ rows, rank })
  }

  groups.sort((a, b) => a.rank - b.rank)
  return {
    rows: groups.slice(0, limit).flatMap((group) => group.rows),
    hasOlder: groups.length > limit,
  }
}
