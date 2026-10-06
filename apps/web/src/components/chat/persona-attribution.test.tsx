import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Message } from './message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'

const persona = { id: 'speaker-a', name: 'Captain <Standup>', avatar: 'creature-2', providerId: 'codex', model: 'saved-model' }

describe('saved agent message header', () => {
  it('renders the saved name, avatar, provider and model with escaped profile text', () => {
    const markup = renderToStaticMarkup(<ConfirmDialogProvider><Message role="assistant" content="Response" persona={persona} /></ConfirmDialogProvider>)
    expect(markup).toContain('data-persona-agent-id="speaker-a"')
    expect(markup).toContain('Captain &lt;Standup&gt;')
    expect(markup).toContain('saved-model')
    expect(markup).toContain('agent-creature')
  })
  it('does not attribute ordinary assistant messages to an agent', () => {
    expect(renderToStaticMarkup(<ConfirmDialogProvider><Message role="assistant" content="Response" /></ConfirmDialogProvider>)).not.toContain('data-persona-agent-id')
  })
})
