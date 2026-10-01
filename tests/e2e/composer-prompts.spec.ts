import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true })
const secret = {
  id: 'password', sessionId: 'session', title: 'Administrator password', prompt: 'Password needed to continue.',
  requestedBy: 'jait.terminal', command: 'sudo example-command', rememberable: true, rememberLabel: 'this terminal',
  expiresAt: '2099-01-01', status: 'pending',
}
const question = {
  id: 'question', sessionId: 'session', title: 'Choose your preferences', requestedBy: null, attention: 'normal',
  expiresAt: '2099-01-01', status: 'pending', questions: [
    { id: 'approach', header: 'Approach', question: 'How should I continue?', options: [
      { label: 'Focused change', description: 'Keep the changes small and easy to review.', recommended: true },
      { label: 'Broader cleanup', description: 'Include nearby improvements.' },
    ] },
    { id: 'timing', header: 'Timing', question: 'Choose the times that work.', multiSelect: true,
      options: [{ label: 'Morning' }, { label: 'Evening' }], allowFreeformInput: false },
  ],
}
async function openPrompt(page: Page, mode: 'secret' | 'question', request = question) {
  const submissions: unknown[] = []
  await page.routeWebSocket(/.*/, () => {})
  await page.route('**/api/secrets/requests**', async route => {
    if (route.request().method() === 'POST') submissions.push(route.request().postDataJSON())
    await route.fulfill({ json: { requests: mode === 'secret' && route.request().method() === 'GET' ? [secret] : [] } })
  })
  await page.route('**/api/user-questions/requests**', async route => {
    if (route.request().method() === 'POST') submissions.push(route.request().postDataJSON())
    await route.fulfill({ json: { requests: mode === 'question' && route.request().method() === 'GET' ? [request] : [] } })
  })
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/composer-prompts.html')}`)
  return submissions
}

test('terminal passwords appear above the composer and remain private', async ({ page }) => {
  const submissions = await openPrompt(page, 'secret')
  const card = page.getByTestId('inline-secret-prompt')
  await expect(card).toBeVisible()
  const cardBox = await card.boundingBox()
  const composerBox = await page.getByTestId('composer').boundingBox()
  expect(cardBox!.y + cardBox!.height).toBeLessThan(composerBox!.y)
  await expect(page.getByRole('textbox', { name: 'Secret' })).toHaveAttribute('type', 'password')
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()
  // Mobile arrival must not focus the input and raise the keyboard.
  await expect(page.getByRole('textbox', { name: 'Secret' })).not.toBeFocused()
  await page.screenshot({ path: '/tmp/jait-secret-mobile.png' })
  await page.getByRole('textbox', { name: 'Secret' }).fill('test-secret')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByRole('textbox', { name: 'Secret' })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('textbox', { name: 'Secret' }).press('Enter')
  await expect(card).toHaveCount(0)
  expect(submissions).toEqual([{ value: 'test-secret', remember: true }])
})

test('compact questions preserve answers across steps and support custom text', async ({ page }) => {
  const submissions = await openPrompt(page, 'question')
  await expect(page.getByTestId('inline-user-question-prompt')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByText('Focused change', { exact: true }).click()
  await expect(page.getByRole('radio').first()).toBeChecked()
  await page.screenshot({ path: '/tmp/jait-question-mobile.png' })
  await page.getByRole('button', { name: 'Write another answer' }).click()
  await page.getByRole('textbox', { name: 'Answer: Approach' }).fill('Include the related regression test.')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Morning' }).check()
  await page.getByRole('checkbox', { name: 'Evening' }).check()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Answer: Approach' })).toHaveValue('Include the related regression test.')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByTestId('inline-user-question-prompt')).toHaveCount(0)
  expect(submissions).toEqual([{ answers: {
    approach: { selected: ['Focused change'], freeText: 'Include the related regression test.', skipped: false },
    timing: { selected: ['Morning', 'Evening'], freeText: null, skipped: false },
  } }])
})

test('a long question scrolls independently while actions remain visible', async ({ page }) => {
  await openPrompt(page, 'question', { ...question, questions: [{ ...question.questions[0], options: Array.from({ length: 30 }, (_, i) => ({ label: `Choice ${i}`, description: 'Description' })) }] })
  const card = page.getByTestId('inline-user-question-prompt')
  await expect(card).toBeVisible()
  const submit = page.getByRole('button', { name: 'Submit', exact: true })
  await expect(submit).toBeInViewport()
  await page.getByRole('radio').last().check()
  await expect(submit).toBeEnabled()
  await expect(submit).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
