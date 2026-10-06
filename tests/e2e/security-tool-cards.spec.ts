import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/security-tool-cards.html')
})

test('shows persisted Jait MCP assessments as visible cards inside completed tool groups', async ({ page }) => {
  const cards = page.getByTestId('persisted-cards')
  await expect(cards.getByTestId('security-tool-result')).toHaveCount(4)
  await expect(cards.getByText('Content type protection header is missing', { exact: true })).toBeVisible()
  await expect(cards.getByText('No findings recorded by this check. This does not prove the target is secure.')).toBeVisible()
  await expect(cards.getByText('Not installed', { exact: false })).toBeVisible()
  await expect(cards.getByText('Sensor vantage point is unknown')).toBeVisible()
  await expect(cards.getByText('Suspected', { exact: true })).toBeVisible()
  const saved = cards.getByTestId('security-tool-result').first()
  await saved.getByText('GET / returned 200; content type protection header absent', { exact: false }).click()
  await expect(saved.getByText('Evidence ID: evidence-header', { exact: false })).toBeVisible()
  await saved.getByText('Evidence references and suggested fix').click()
  await expect(saved.getByText('Finding ID: finding-header', { exact: false })).toBeVisible()
})

test('keeps the results visible when a running check completes', async ({ page }) => {
  const card = page.getByTestId('stream-card')
  await expect(card.getByText('Running HTTP header check', { exact: false })).toBeVisible()
  await card.getByRole('button', { name: 'Finish fixture check' }).click()
  await expect(card.getByTestId('security-tool-result')).toBeVisible()
  await expect(card.getByText('Check completed', { exact: true })).toBeVisible()
  await expect(card.getByText('Content type protection header is missing', { exact: true })).toBeVisible()
  await page.screenshot({ path: '../../.jait/security-tool-cards-preview.png', fullPage: true })
})

test('shows rollback planning and keeps verification outcomes distinct', async ({ page }) => {
  const plan = page.getByTestId('plan-card')
  await expect(plan.getByText('Back up the current header configuration')).toBeVisible()
  await expect(plan.getByText('Restore the previous header configuration')).toBeVisible()
  await expect(plan.getByText('Preparing this plan does not apply it.', { exact: false })).toBeVisible()
  const verify = page.getByTestId('verify-card')
  await expect(verify.getByTestId('security-tool-result').getByText('Inconclusive', { exact: true })).toBeVisible()
  await expect(verify.getByText('This check could not establish whether the issue is fixed.')).toBeVisible()
  await verify.getByLabel('Verification outcome').selectOption('still-observed')
  await expect(verify.getByTestId('security-tool-result').getByText('Still observed', { exact: true })).toBeVisible()
  await expect(verify.getByText('Verified absent', { exact: true })).not.toBeVisible()
  await verify.getByLabel('Verification outcome').selectOption('verified-absent')
  await expect(verify.getByTestId('security-tool-result').getByText('Verified absent', { exact: true })).toBeVisible()
})

test('escapes scanner text and preserves scope approval in the original tool card', async ({ page }) => {
  const cards = page.getByTestId('persisted-cards')
  await expect(cards.getByText('<img src=x onerror=alert(1)>', { exact: false })).toBeVisible()
  await expect(cards.locator('img')).toHaveCount(0)
  await expect(cards.getByText('DO-NOT-SHOW', { exact: false })).toHaveCount(0)
  const scope = page.getByTestId('scope-card')
  await expect(scope.getByText('Waiting for approval').first()).toBeVisible()
  await expect(scope.getByTestId('security-tool-result')).toHaveCount(0)
  await scope.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(scope.getByTestId('security-tool-result')).toBeVisible()
  await expect(scope.getByText('Authorized targets')).toBeVisible()
  await expect(scope.getByText('Recording a scope does not perform checks.')).toBeVisible()
})
