// Only registered Jait tools get the security renderer; foreign MCP tools retain their own UI.
export const SECURITY_TOOL_LABELS: Record<string, string> = {
  'security.scope.create': 'Assessment authorization',
  'security.scope.get': 'Assessment scope',
  'security.assets.discover': 'Asset discovery',
  'security.services.scan': 'TCP service inventory',
  'security.services.nmap': 'Nmap service inventory',
  'security.tls.check': 'TLS certificate check',
  'security.http.check': 'HTTP header check',
  'security.https.check': 'HTTPS header check',
  'security.ssh.check': 'SSH identification check',
  'security.host.audit': 'Host configuration review',
  'security.web.scan': 'Reviewed web check',
  'security.software.scan': 'Software configuration check',
  'security.telemetry.ingest': 'Imported security alerts',
  'security.engines.status': 'Scanner availability',
  'security.assessments.list': 'Assessment history',
  'security.assessments.get': 'Assessment evidence',
  'security.assessments.cancel': 'Stop assessment',
  'security.results.show': 'Saved assessment',
  'security.findings.list': 'Security findings',
  'security.findings.explain': 'Finding evidence',
  'security.remediation.plan': 'Fix and rollback plan',
  'security.verification.run': 'Fix verification',
  'security.baseline.compare': 'Assessment comparison',
  'security.report.export': 'Redacted security report',
  'security.monitor.schedule': 'Scoped monitoring',
  'security.monitor.tick': 'Monitoring result',
}
export function isSecurityToolName(tool: string): boolean {
  return Object.hasOwn(SECURITY_TOOL_LABELS, tool)
}
export type SecurityRecord = Record<string, unknown>
export function securityRecord(value: unknown): SecurityRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as SecurityRecord : null
}
export function securityText(value: unknown, limit = 500): string {
  return typeof value === 'string' ? (value.length > limit ? value.slice(0, limit) + '…' : value) : ''
}
export function securityRows(value: unknown): SecurityRecord[] {
  return Array.isArray(value) ? value.slice(0, 256).map(securityRecord).filter((row): row is SecurityRecord => row !== null) : []
}
export function securityStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.slice(0, 256).filter((item): item is string => typeof item === 'string').map(item => securityText(item)) : []
}
export function securityTarget(row: SecurityRecord): string {
  const target = securityText(row.target, 120)
  return target + (typeof row.port === 'number' && Number.isInteger(row.port) ? ':' + row.port : '')
}
export const SECURITY_STATE_LABELS: Record<string, string> = {
  running: 'Running', completed: 'Check completed', partial: 'Incomplete coverage',
  cancelled: 'Cancelled', unavailable: 'Scanner unavailable', interrupted: 'Interrupted',
  'verified-absent': 'Verified absent', 'still-observed': 'Still observed', inconclusive: 'Inconclusive',
  observed: 'Observed', suspected: 'Suspected', open: 'Open', 'accepted-risk': 'Risk accepted', 'false-positive': 'False positive',
  refused: 'Connection refused', timeout: 'Timed out', error: 'Check failed', responsive: 'Responsive', unknown: 'Unknown',
}
export function securityState(value: unknown): string {
  const text = securityText(value, 80)
  return SECURITY_STATE_LABELS[text] ?? (text || 'Unknown')
}
type SecurityKind = 'scope' | 'run' | 'findings' | 'explanation' | 'plan' | 'verification'
  | 'comparison' | 'report' | 'assets' | 'history' | 'engines' | 'monitor'
export interface SecurityResultModel { kind: SecurityKind; payload: SecurityRecord | SecurityRecord[]; truncated?: boolean }
const runStates = ['running', 'completed', 'partial', 'cancelled', 'unavailable', 'interrupted']
function isRun(row: SecurityRecord): boolean {
  return typeof row.id === 'string' && runStates.includes(String(row.status))
    && (Array.isArray(row.evidence) || Array.isArray(row.observations))
}
function isFinding(row: SecurityRecord): boolean {
  return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.ruleId === 'string'
    && ['observed', 'suspected'].includes(String(row.status)) && Array.isArray(row.evidenceIds)
}
function matchPayload(tool: string, value: unknown): SecurityResultModel | null {
  if (Array.isArray(value)) {
    if (tool === 'security.findings.list' && value.every(item => { const row = securityRecord(item); return row && isFinding(row) })) {
      return { kind: 'findings', payload: securityRows(value), truncated: value.length > 256 }
    }
    if (tool === 'security.engines.status' && value.every(item => { const row = securityRecord(item); return row && typeof row.name === 'string' && typeof row.available === 'boolean' })) {
      return { kind: 'engines', payload: securityRows(value) }
    }
    return null
  }
  const row = securityRecord(value)
  if (!row) return null
  if (tool === 'security.report.export') {
    if (row.format === 'jait-security-report-v1' && row.redacted === true && securityRecord(row.run) && Array.isArray(row.findings)) return { kind: 'report', payload: row }
    return null
  }
  if (tool === 'security.verification.run') {
    return typeof row.reason === 'string' && typeof row.runId === 'string'
      && ['verified-absent', 'still-observed', 'inconclusive'].includes(String(row.status)) ? { kind: 'verification', payload: row } : null
  }
  if (tool === 'security.remediation.plan') {
    return typeof row.findingId === 'string' && typeof row.recommendation === 'string'
      && Array.isArray(row.steps) && Array.isArray(row.rollback) ? { kind: 'plan', payload: row } : null
  }
  if (tool === 'security.findings.explain') {
    const finding = securityRecord(row.finding)
    return finding && isFinding(finding) && Array.isArray(row.evidence) ? { kind: 'explanation', payload: row } : null
  }
  if (tool === 'security.baseline.compare') {
    return typeof row.comparable === 'boolean' && Array.isArray(row.addedRules) && Array.isArray(row.noLongerObservedRules) ? { kind: 'comparison', payload: row } : null
  }
  if (tool === 'security.scope.create' || tool === 'security.scope.get') {
    return typeof row.id === 'string' && Array.isArray(row.targets) && Array.isArray(row.exclusions)
      && Array.isArray(row.ports) && typeof row.expiresAt === 'string' ? { kind: 'scope', payload: row } : null
  }
  if (tool === 'security.assessments.list') return Array.isArray(row.runs) ? { kind: 'history', payload: row } : null
  if (tool === 'security.assets.discover') return Array.isArray(row.assets) ? { kind: 'assets', payload: row } : null
  if (tool === 'security.monitor.schedule') return typeof row.jobId === 'string' && typeof row.expiresAt === 'string' ? { kind: 'monitor', payload: row } : null
  if (tool === 'security.monitor.tick') return typeof row.runId === 'string' && Array.isArray(row.coverageGaps) ? { kind: 'monitor', payload: row } : null
  if (isRun(row)) return { kind: 'run', payload: row }
  return null
}

/** Decode native results and persisted MCP text/envelopes without evaluating scanner content. */
export function getSecurityResultModel(tool: string, data: unknown, message?: unknown): SecurityResultModel | null {
  if (!isSecurityToolName(tool)) return null
  const seen = new Set<unknown>()
  let visited = 0
  function visit(value: unknown, depth: number): SecurityResultModel | null {
    if (depth > 8 || ++visited > 128 || value == null || seen.has(value)) return null
    seen.add(value)
    if (typeof value === 'string') {
      if (value.length > 524_288) return null
      const start = value.search(/[[{]/)
      if (start < 0) return null
      try { return visit(JSON.parse(value.slice(start)), depth + 1) } catch { return null }
    }
    const match = matchPayload(tool, value)
    if (match) return match
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 32)) { const result = visit(item, depth + 1); if (result) return result }
    } else {
      const row = securityRecord(value)
      if (row) for (const key of ['data', 'result', 'structuredContent', 'content', 'text', 'message']) {
        const result = visit(row[key], depth + 1)
        if (result) return result
      }
    }
    return null
  }
  return visit(data, 0) ?? visit(message, 0)
}
export function getSecurityResultSummary(tool: string, data: unknown, message?: unknown): string {
  const model = getSecurityResultModel(tool, data, message)
  if (!model) return ''
  if (Array.isArray(model.payload)) return model.payload.length + (model.kind === 'engines' ? (model.payload.length === 1 ? ' scanner' : ' scanners') : (model.payload.length === 1 ? ' finding' : ' findings'))
  const row = model.payload
  if (model.kind === 'verification') return securityState(row.status)
  if (model.kind === 'comparison') return row.comparable ? securityStrings(row.addedRules).length + ' new observations' : 'Inconclusive'
  if (model.kind === 'run') {
    const input = securityRecord(row.input)
    const target = securityTarget(input ?? {}) || securityStrings(securityRecord(row.scope)?.targets).join(', ')
    const count = Array.isArray(row.findings) ? row.findings.length : Array.isArray(row.observations) ? row.observations.length : 0
    return [target, securityState(row.status), count + (Array.isArray(row.findings) ? (count === 1 ? ' finding' : ' findings') : (count === 1 ? ' check' : ' checks'))].filter(Boolean).join(' · ')
  }
  if (model.kind === 'explanation') return securityText(securityRecord(row.finding)?.title)
  if (model.kind === 'scope') return securityStrings(row.targets).join(', ')
  if (model.kind === 'plan') return securityTarget(row)
  if (model.kind === 'assets') return securityRows(row.assets).length + ' scoped assets'
  if (model.kind === 'history') return securityRows(row.runs).length + ' assessments'
  if (model.kind === 'report') return 'Redacted · ' + securityRows(row.findings).length + ' findings'
  if (model.kind === 'monitor') return row.expiresAt ? 'Authorization expires ' + securityText(row.expiresAt) : 'Saved scoped check'
  return ''
}
