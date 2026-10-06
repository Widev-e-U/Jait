import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SecurityToolResult } from './security-tool-result'
import { getSecurityResultModel } from '@/lib/security-tool-results'
import { cardFinding, cardRun } from '@/e2e-fixtures/security-tool-card-data'

const render = (tool: string, data: unknown, message = '') => renderToStaticMarkup(createElement(SecurityToolResult, { tool, data, message }))
describe('security chat results', () => {
  it('renders the measured rule, confidence, cited evidence, engine and vantage without raw artifacts', () => {
    const html = render('security.http.check', { ...cardRun, raw: 'PRIVATE RAW REPORT', artifact: { body: 'PRIVATE ARTIFACT' }, scope: { ...cardRun.scope, projectRoot: '/PRIVATE/ROOT' } })
    expect(html).toContain(cardFinding.title)
    expect(html).toContain('Confidence: high')
    expect(html).toContain('evidence-header')
    expect(html).toContain('fixture-gateway')
    expect(html).toContain('native-http')
    expect(html).not.toContain('PRIVATE')
  })
  it('preserves incomplete coverage and suspected findings without confirming vulnerabilities', () => {
    const html = render('security.software.scan', { ...cardRun, status: 'partial', findings: [{ ...cardFinding, status: 'suspected' }], coverageGaps: ['Scanner output was truncated'] })
    expect(html).toContain('Incomplete coverage')
    expect(html).toContain('Scanner output was truncated')
    expect(html).toContain('Suspected')
    expect(html).not.toContain('Confirmed')
  })
  it.each(['still-observed', 'inconclusive', 'verified-absent'])('shows %s as its own verification outcome', status => {
    const html = render('security.verification.run', { findingId: cardFinding.id, runId: 'verify-run', status, reason: 'Compatible repeat check' })
    expect(html).toContain(status === 'still-observed' ? 'Still observed' : status === 'inconclusive' ? 'Inconclusive' : 'Verified absent')
    expect(html).toContain('verify-run')
    if (status !== 'verified-absent') expect(html).not.toContain('Verified absent')
  })
  it('shows a rollback plan while making clear it has not applied a change', () => {
    const html = render('security.remediation.plan', { findingId: cardFinding.id, target: cardFinding.target, recommendation: cardFinding.remediation, steps: ['Back up the headers', 'Add nosniff'], rollback: ['Restore headers'], requiresApproval: true })
    expect(html).toContain('Back up the headers')
    expect(html).toContain('Restore headers')
    expect(html).toContain('Preparing this plan does not apply it')
  })
  it('escapes untrusted evidence and ignores credential-like facts and non-scalar output', () => {
    const html = render('security.http.check', { ...cardRun, evidence: [{ ...cardRun.evidence[0], summary: '<img src=x onerror=alert(1)>', facts: { password: 'SECRET', cookie: 'SESSION', body: 'PRIVATE BODY', statusCode: 200, nested: { raw: 'RAW' } } }] })
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    for (const hidden of ['SECRET', 'SESSION', 'PRIVATE BODY', 'RAW']) expect(html).not.toContain(hidden)
  })
  it('retains normalized SSH policy evidence while hiding actual credentials', () => {
    const html = render('security.host.audit', { ...cardRun, evidence: [{ ...cardRun.evidence[0], facts: { passwordAuthenticationDirective: 'yes', password: 'PRIVATE', effectivePolicyConfirmed: false } }] })
    expect(html).toContain('password Authentication Directive')
    expect(html).toContain('yes')
    expect(html).not.toContain('PRIVATE')
    expect(render('security.host.audit', { ...cardRun, evidence: [{ ...cardRun.evidence[0], facts: { passwordAuthenticationDirective: 'NOT-A-POLICY-VALUE' } }] })).not.toContain('NOT-A-POLICY-VALUE')
  })
  it('renders native TCP observations and keeps timeout distinct from refusal', () => {
    const html = render('security.results.show', { ...cardRun, findings: undefined, evidence: undefined, engine: 'node-net-tcp-connect', plannedChecks: 2, observations: [
      { target: '127.0.0.1', port: 22, state: 'timeout', evidenceId: 'tcp-timeout' },
      { target: '127.0.0.1', port: 80, state: 'refused', evidenceId: 'tcp-refused' },
    ] })
    expect(html).toContain('Timed out')
    expect(html).toContain('Connection refused')
    expect(html).toContain('2 of 2 planned TCP checks')
  })
  it('does not treat empty results as proof of security', () => {
    expect(render('security.findings.list', [])).toContain('does not prove the target is secure')
    expect(render('security.http.check', { ...cardRun, findings: [] })).toContain('does not prove')
  })
  it('never converts an incomparable baseline into a verified fix', () => {
    const html = render('security.baseline.compare', { comparable: false, addedRules: [], noLongerObservedRules: ['http.nosniff'], coverageGaps: ['Different engine version'] })
    expect(html).toContain('Inconclusive')
    expect(html).toContain('Different engine version')
    expect(html).not.toContain('Verified absent')
    expect(html).not.toContain('http.nosniff')
  })
  it('renders only the redacted report contract and retains asset aliases', () => {
    const report = { format: 'jait-security-report-v1', redacted: true, run: { ...cardRun, scope: undefined, input: undefined, evidence: [{ ...cardRun.evidence[0], target: 'asset-1' }] }, findings: [{ ...cardFinding, target: 'asset-1' }] }
    const html = render('security.report.export', report)
    expect(html).toContain('asset-1')
    expect(html).not.toContain('127.0.0.1')
    expect(render('security.report.export', { ...report, redacted: false })).toContain('could not be read')
  })
  it('shows missing engines explicitly and collapses long evidence lists after five', () => {
    expect(render('security.engines.status', [{ name: 'nmap', available: false, version: null }])).toContain('Not installed')
    const html = render('security.results.show', { ...cardRun, evidence: Array.from({ length: 9 }, (_, index) => ({ ...cardRun.evidence[0], id: 'entry-' + index })) })
    expect(html).toContain('Show 4 more evidence entries')
    expect(render('security.results.show', { ...cardRun, evidence: Array.from({ length: 300 }, () => cardRun.evidence[0]) })).toContain('Some entries are omitted')
  })
  it('decodes native, MCP structured and text-only persisted envelopes', () => {
    for (const data of [cardRun, { structuredContent: { data: cardRun } }, { content: [{ type: 'text', text: 'Saved assessment\n' + JSON.stringify({ data: cardRun }) }] }]) {
      expect(getSecurityResultModel('security.results.show', data)?.kind).toBe('run')
    }
    expect(getSecurityResultModel('security.findings.list', { content: [{ type: 'text', text: JSON.stringify([cardFinding]) }] })?.kind).toBe('findings')
  })
  it('rejects malformed, cyclic, oversized and foreign-tool payloads without a fabricated result', () => {
    const cycle: Record<string, unknown> = {}; cycle.data = cycle
    for (const data of [cycle, { status: 'completed' }, '{broken', 'x'.repeat(524_289)]) expect(getSecurityResultModel('security.http.check', data)).toBeNull()
    expect(getSecurityResultModel('mcp.other.security.http.check', cardRun)).toBeNull()
    expect(render('security.http.check', { status: 'completed' }, 'Scanner returned malformed output')).toContain('Scanner returned malformed output')
    expect(render('security.http.check', null, 'RAW\n{secret:PRIVATE}')).not.toContain('PRIVATE')
  })
})
