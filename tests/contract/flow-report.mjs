// A source-linked flow is a scoped test specification, not a whole-program proof.
export function flowCoverage(flow, requiredCases, results, readSource) {
  if (flow.format !== 1 || !flow.nodes?.length || !flow.edges?.length) throw new Error('Invalid flow manifest')
  const nodes = new Set(flow.nodes.map(n => n.id))
  if (nodes.size !== flow.nodes.length) throw new Error('Duplicate flow node')
  const ids = new Set()
  const observed = new Map(results.map(r => [r.id, r]))
  const refs = Object.fromEntries(Object.entries(flow.sources).map(([id, source]) => {
    if (!/^packages\/gateway\/src\/[a-zA-Z0-9_./-]+\.ts$/.test(source.path) || source.path.split('/').includes('..')) throw new Error(`Invalid flow source path: ${id}`)
    if (!source.anchor?.trim()) throw new Error(`Missing source anchor: ${id}`)
    const lines = readSource(source.path).split('\n')
    const hits = lines.flatMap((line, index) => line.includes(source.anchor) ? [index + 1] : [])
    if (hits.length !== 1) throw new Error(`Flow source anchor drift: ${id} (${hits.length} matches)`)
    return [id, { ...source, line: hits[0] }]
  }))
  const edges = flow.edges.map(edge => {
    if (ids.has(edge.id) || !nodes.has(edge.from) || !nodes.has(edge.to)) throw new Error(`Invalid flow edge: ${edge.id}`)
    ids.add(edge.id)
    if (!['scoped', 'partial', 'uncovered'].includes(edge.coverage)) throw new Error(`Missing coverage scope: ${edge.id}`)
    if (!edge.sources.length || edge.sources.some(id => !refs[id])) throw new Error(`Unknown flow source: ${edge.id}`)
    if (new Set(edge.cases).size !== edge.cases.length || edge.cases.some(id => !requiredCases.includes(id))) throw new Error(`Unknown/duplicate flow case: ${edge.id}`)
    if (edge.coverage === 'scoped' && !edge.cases.length) throw new Error(`Scoped edge has no tests: ${edge.id}`)
    const cases = edge.cases.map(id => observed.get(id) ?? { id, status: 'blocked', reason: 'Flow scenario was not executed' })
    const verdict = cases.some(c => c.status === 'failed') ? 'failed' : cases.some(c => c.status !== 'passed') ? 'blocked' : cases.length ? 'passed' : 'uncovered'
    return { ...edge, verdict, cases, source_refs: edge.sources.map(id => refs[id]) }
  })
  return { format: 1, id: flow.id, description: flow.description, method: flow.method, nodes: flow.nodes, edges }
}
export function flowMarkdown(flow, backend, sourceRoot = '') {
  const lines = [`# ${flow.description} — ${backend}`, '', flow.method, '', '```mermaid', 'flowchart LR']
  for (const node of flow.nodes) lines.push(`  ${node.id}[${node.label}]`)
  for (const edge of flow.edges) lines.push(`  ${edge.from} -->|${edge.id}| ${edge.to}`)
  lines.push('```', '', 'A passed verdict applies to the listed scenarios. Partial and uncovered scopes remain open even when neighboring tests pass.', '', '| Edge | Data and transformation | Scope | Verdict | Evidence |', '| --- | --- | --- | --- | --- |')
  for (const edge of flow.edges) {
    const sources = edge.source_refs.map(s => `[${s.path}:${s.line}](${sourceRoot ? `${sourceRoot}${s.path}:${s.line}` : `${s.path}#L${s.line}`})`).join(', ')
    const cases = edge.cases.map(c => `\`${c.id}\` (${c.status})`).join(', ') || 'No executable assertion'
    lines.push(`| ${edge.id}: ${edge.from} → ${edge.to} | ${edge.data} | ${edge.coverage}: ${edge.limit} | ${edge.verdict} | ${sources}; ${cases} |`)
  }
  return lines.join('\n') + '\n'
}
