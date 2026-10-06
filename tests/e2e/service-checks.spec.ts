import { expect, test } from '@playwright/test'

test('explicit scope, evidence, repeat verification and cancellation', async ({ page }) => {
  const scope = {
    id: 'scope-fixture', targets: ['192.0.2.10'], exclusions: [], ports: [22], authorized: true,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    operatorId: 'fixture-owner', nodeId: 'gateway', vantagePoint: 'fixture-gateway', profile: 'tcp-connect-v1',
  }
  const baseline = {
    id: 'baseline', scopeId: scope.id, scope, operatorId: scope.operatorId,
    startedAt: new Date(Date.now() - 60_000).toISOString(), completedAt: new Date(Date.now() - 59_000).toISOString(),
    status: 'completed', engine: 'node-net-tcp-connect', engineVersion: 'test',
    plannedChecks: 1, coverageGaps: ['LAN checks cannot prove WAN exposure.'],
    observations: [{ target: '192.0.2.10', port: 22, state: 'open', evidenceId: 'baseline-evidence', observedAt: new Date().toISOString() }],
  }
  let history = [baseline]
  let run = { ...baseline, id: 'current', startedAt: new Date().toISOString(), status: 'running', observations: [] as typeof baseline.observations }
  let creationCount = 0
  let cancelCount = 0
  let startCount = 0
  await page.route('**/api/security/**', async route => {
    expect(route.request().headers().authorization).toBe('Bearer assessment-test-token')
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    let body: unknown
    if (path === '/api/security/scopes') {
      const submitted = route.request().postDataJSON()
      expect(submitted.targets).toEqual(['192.0.2.10'])
      expect(submitted.ports).toEqual([22])
      expect(submitted.authorized).toBe(true)
      creationCount++
      body = scope
    } else if (path.endsWith('/cancel')) {
      cancelCount++; run = { ...run, status: 'cancelled' }; body = { ok: true }
    } else if (path === '/api/security/assessments' && method === 'POST') {
      startCount++; run = { ...run, id: 'current-' + startCount, status: 'running', observations: [] }
      body = run
    } else if (path === '/api/security/assessments') body = { scopes: [scope], runs: history }
    else {
      if (startCount === 1) {
        run = { ...run, status: 'completed', observations: [{ ...baseline.observations[0], state: 'refused', evidenceId: 'verification-evidence' }] }
        history = [run, baseline]
      }
      body = run
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/service-checks.html', { waitUntil: 'domcontentloaded' })
  const start = page.getByRole('button', { name: 'Start service checks' })
  await expect(start).toBeDisabled()
  await page.getByRole('textbox', { name: 'Authorized target IPs' }).fill('192.0.2.10')
  await page.getByRole('textbox', { name: 'TCP ports' }).fill('22')
  const consent = page.getByRole('checkbox')
  await consent.check()
  await page.getByRole('textbox', { name: 'TCP ports' }).fill('22, 80')
  await expect(consent).not.toBeChecked()
  await page.getByRole('textbox', { name: 'TCP ports' }).fill('22')
  await consent.check()
  await start.click()
  await expect(page.getByRole('heading', { name: 'Assessment completed' })).toBeVisible()
  await expect(page.getByText('Previously reachable; now refused')).toBeVisible()
  await expect(page.getByText('Connection refused', { exact: true })).toBeVisible()
  await page.screenshot({ path: '../../.jait/service-checks-preview.png', fullPage: true })
  await page.getByText('Inspect evidence and authorization').click()
  await expect(page.getByText('verification-evidence', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Repeat same checks' }).click()
  await expect(page.getByRole('button', { name: 'Stop checks' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop checks' }).click()
  await expect(page.getByRole('heading', { name: 'Assessment cancelled' })).toBeVisible()
  expect(creationCount).toBe(1)
  expect(cancelCount).toBe(1)
})

test('shows invalid scope errors without starting an assessment', async ({ page }) => {
  let scanStarted = false
  await page.route('**/api/security/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/security/scopes') await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Only literal IPv4 addresses are supported' }) })
    else {
      if (route.request().method() === 'POST') scanStarted = true
      await route.fulfill({ contentType: 'application/json', body: '{"scopes":[],"runs":[]}' })
    }
  })
  await page.goto('/service-checks.html', { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox', { name: 'Authorized target IPs' }).fill('router.local')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Start service checks' }).click()
  await expect(page.getByRole('alert')).toContainText('Only literal IPv4')
  expect(scanStarted).toBe(false)
})
