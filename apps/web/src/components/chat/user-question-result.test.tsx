import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { humanizeToolName, getToolCallBodyKind } from '@/lib/tool-call-body'
import { UserQuestionResult, questionAnswerData } from './user-question-result'

const answers = { target: { selected: ['Homelab', 'Local'], freeText: '<script>text</script>', skipped: false }, later: { selected: [], freeText: null, skipped: true } }
describe('question results in chat', () => {
  it('renders selections, custom text and skipped answers safely after replay', () => {
    const html = renderToStaticMarkup(createElement(UserQuestionResult, {
      args: { questions: [{ id: 'target', question: 'Where should it run?' }] },
      data: { content: [{ type: 'text', text: JSON.stringify({ ok: true, data: { answers } }) }] },
      status: 'success',
    }))
    for (const text of ['Where should it run?', 'Homelab', 'Local', 'Skipped', '&lt;script&gt;text&lt;/script&gt;']) expect(html).toContain(text)
    expect(html).not.toContain('<script>')
    expect(questionAnswerData({ structuredContent: { answers } })?.answers).toEqual(answers)
  })
  it.each([
    { data: [{ type: 'text', text: JSON.stringify({ ok: true, data: { answers } }) }], message: 'Answered' },
    { data: undefined, message: JSON.stringify({ ok: true, data: { answers } }) },
  ])('renders an answer from provider output or a replayed message', (result) => {
    const html = renderToStaticMarkup(createElement(UserQuestionResult, {
      args: { requestId: 'question-1' },
      status: 'success',
      ...result,
    }))
    expect(html).toContain('Homelab')
    expect(html).toContain('&lt;script&gt;text&lt;/script&gt;')
    expect(html).not.toContain('Waiting for your answers')
  })
  it('renders explicit pending and cancellation states without inventing an answer', () => {
    const render = (status: string, message?: string) => renderToStaticMarkup(createElement(UserQuestionResult, { args: {}, data: {}, status, message }))
    expect(render('running')).toContain('Waiting for your answers')
    expect(render('success')).toContain('Answer unavailable')
    expect(render('error', 'The user cancelled')).toContain('The user cancelled')
    expect(questionAnswerData('invalid')).toBeUndefined()
    expect(getToolCallBodyKind({ tool: 'user.ask', args: {}, status: 'success', displayOutput: '', snapshotText: null, screenshotPath: null })).toBe('questionAnswers')
  })
  it('humanizes unknown dotted and provider tool identifiers', () => {
    expect(humanizeToolName('context.read')).toBe('Context Read')
    expect(humanizeToolName('mcp__custom__get_items')).toBe('Custom Get Items')
    expect(humanizeToolName('terminal.execution')).toBe('Terminal Execution')
  })
})
