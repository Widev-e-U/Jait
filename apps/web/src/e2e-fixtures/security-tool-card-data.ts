import type { SecurityCheckRun, SecurityFinding } from '@jait/shared'

export const cardFinding: SecurityFinding = {
  id: 'finding-header', scopeId: 'scope-card', runId: 'run-http', ruleId: 'http.nosniff',
  target: '127.0.0.1', port: 8080, title: 'Content type protection header is missing',
  severity: 'low', confidence: 'high', status: 'observed', disposition: 'open',
  evidenceIds: ['evidence-header'], firstSeen: '2026-10-05T12:00:00Z', lastSeen: '2026-10-05T12:00:00Z',
  remediation: 'Set X-Content-Type-Options: nosniff and repeat the header check.',
  rollback: 'Restore the previous response-header configuration.',
}
export const cardRun: SecurityCheckRun = {
  id: 'run-http', operatorId: 'fixture-owner', scopeId: 'scope-card',
  scope: { id: 'scope-card', operatorId: 'fixture-owner', createdAt: '2026-10-05T11:59:00Z',
    targets: ['127.0.0.1'], exclusions: [], ports: [8080], methods: ['http'], authorized: true,
    expiresAt: '2026-10-05T12:59:00Z', nodeId: 'gateway', vantagePoint: 'fixture-gateway', profile: 'tcp-connect-v1' },
  input: { scopeId: 'scope-card', profile: 'http', target: '127.0.0.1', port: 8080 },
  profileRevision: 'security-profiles-v1', status: 'completed', startedAt: '2026-10-05T12:00:00Z', completedAt: '2026-10-05T12:00:01Z',
  engine: 'native-http', engineVersion: 'fixture-v1',
  evidence: [{ id: 'evidence-header', target: '127.0.0.1', port: 8080, observedAt: '2026-10-05T12:00:01Z',
    summary: 'GET / returned 200; content type protection header absent', facts: { statusCode: 200, nosniff: false } }],
  findingIds: [cardFinding.id], findings: [cardFinding], coverageGaps: [],
}
