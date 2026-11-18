export interface AgentGraphMember { id: string; reportsToId?: string | null }
export interface AgentGraphPoint { id: string; x: number; y: number }

interface AgentGraphArea {
  width: number
  height: number
  cardWidth: number
  cardHeight: number
  anchorY: number
}

/** Solve a reporting tree before rendering, independent of input order or live activity. */
export function layoutAgentGraph(members: readonly AgentGraphMember[], area: AgentGraphArea): AgentGraphPoint[] {
  if (!members.length) return []
  const { width, height, cardWidth, cardHeight, anchorY } = area
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id))
  const ids = new Set(sorted.map(member => member.id))
  const children = new Map<string, AgentGraphMember[]>()
  for (const member of sorted) {
    if (member.reportsToId && member.reportsToId !== member.id && ids.has(member.reportsToId)) {
      const reports = children.get(member.reportsToId) ?? []
      reports.push(member)
      children.set(member.reportsToId, reports)
    }
  }
  const levels: AgentGraphPoint[][] = []
  const seen = new Set<string>()
  let leaves = 0
  const visit = (member: AgentGraphMember, depth: number): AgentGraphPoint | undefined => {
    if (seen.has(member.id)) return
    seen.add(member.id)
    const point = { id: member.id, x: 0, y: 0 }
    levels[depth] ??= []
    levels[depth].push(point)
    const reports = (children.get(member.id) ?? []).flatMap(report => {
      const child = visit(report, depth + 1)
      return child ? [child] : []
    })
    // Parents sit over the centre of their branches; a lone report stays below its manager.
    point.x = reports.length ? (reports[0].x + reports[reports.length - 1].x) / 2 : leaves++
    return point
  }
  for (const member of sorted) {
    if (!member.reportsToId || member.reportsToId === member.id || !ids.has(member.reportsToId)) visit(member, 0)
  }
  // Cyclic or orphaned legacy teams still get a stable, finite layout.
  for (const member of sorted) visit(member, 0)

  const gapX = 32
  const gapY = 48
  const paddingX = Math.min(96, Math.max(24, width * 0.08))
  const paddingY = Math.min(64, Math.max(24, height * 0.06))
  const availableWidth = Math.max(cardWidth, width - paddingX * 2)
  const availableHeight = Math.max(cardHeight, height - paddingY * 2)
  const columns = Math.max(1, Math.floor((availableWidth + gapX) / (cardWidth + gapX)))
  const wrap = leaves > columns
  const rows = levels.flatMap(level => {
    if (!wrap) return [level]
    return Array.from({ length: Math.ceil(level.length / columns) }, (_, index) => level.slice(index * columns, (index + 1) * columns))
  })
  const widest = wrap ? Math.max(...rows.map(row => row.length)) : leaves
  // Comfortable margins and balanced proportions, without stretching a small team to the edges.
  const contentWidth = widest === 1 ? cardWidth : Math.min(availableWidth,
    Math.max(widest * cardWidth + (widest - 1) * gapX, width * 0.65))
  const minimumHeight = rows.length * cardHeight + (rows.length - 1) * gapY
  const contentHeight = rows.length === 1 ? cardHeight : Math.max(minimumHeight,
    Math.min(availableHeight, height * 0.7, cardHeight + (rows.length - 1) * (cardHeight + 140)))
  const stepY = rows.length > 1 ? (contentHeight - cardHeight) / (rows.length - 1) : 0
  const top = (height - contentHeight) / 2

  return rows.flatMap((row, rowIndex) => row.map((point, index) => ({
    id: point.id,
    x: width / 2 + (wrap
      ? row.length === 1 ? 0 : (index / (row.length - 1) - 0.5) * (contentWidth - cardWidth)
      : leaves === 1 ? 0 : (point.x / (leaves - 1) - 0.5) * (contentWidth - cardWidth)),
    y: top + rowIndex * stepY + anchorY,
  })))
}
