import { expect, test } from '@playwright/test'

test('Q&A links open independently of answer selection on desktop and mobile', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const React = await import('/node_modules/.vite/deps/react.js')
    const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { UserQuestionForm } = await import('/src/components/prompts/input-prompts.tsx')
    const mount = document.createElement('div')
    document.body.replaceChildren(mount)
    function Harness() {
      const [answers, setAnswers] = React.useState({})
      return React.createElement(UserQuestionForm, {
        request: { id: 'links', sessionId: 's', questions: [{
          id: 'q', header: 'Choose', question: 'Read [guide](https://example.com/guide)',
          options: [{ label: 'First', description: '[Details](https://example.com/details)' }],
        }] },
        answers, submitting: false,
        onAnswerChange: (id: string, answer: unknown) => setAnswers({ [id]: answer }),
        onSubmit: async () => {}, onCancel: async () => {},
      })
    }
    createRoot(mount).render(React.createElement(Harness))
  })
  const details = page.getByRole('link', { name: 'Details' })
  await expect(details).toHaveAttribute('href', 'https://example.com/details')
  const popupPromise = page.waitForEvent('popup')
  await details.click()
  const popup = await popupPromise
  await popup.close()
  await expect(page.getByRole('radio')).not.toBeChecked()
  await page.getByText('First', { exact: true }).click()
  await expect(page.getByRole('radio')).toBeChecked()
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled()
})
