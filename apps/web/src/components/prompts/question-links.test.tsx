import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { UserQuestionForm } from './input-prompts'

describe('Q&A links', () => {
  it('renders markdown and bare URLs in questions and options as links', () => {
    const html = renderToStaticMarkup(<UserQuestionForm
      request={{ id: 'r', sessionId: 's', title: 'Choose', requestedBy: null, attention: 'normal', expiresAt: '2099-01-01', status: 'pending', questions: [{
        id: 'q', header: 'Docs', question: 'Read [guide](https://example.com/guide) or https://example.com/plain',
        options: [{ label: 'https://example.com/option', description: '[Details](https://example.com/details)' }],
      }] }} answers={{}} submitting={false} onAnswerChange={() => {}}
      onSubmit={async () => {}} onCancel={async () => {}} />)
    for (const path of ['guide', 'plain', 'option', 'details']) {
      expect(html).toContain(`href="https://example.com/${path}"`)
    }
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
