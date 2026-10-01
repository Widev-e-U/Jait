import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { collectAttachments } from './attachment-list'
import { MessageQueue } from './message-queue'

describe('queued attachments', () => {
  it('restores uploads from display segments and avoids showing duplicate chips', () => {
    const attachment = { name: 'invoice.txt', mimeType: 'text/plain', data: 'QQ==' }
    const segments = [{ type: 'attachment' as const, ...attachment }]
    expect(collectAttachments(undefined, segments)).toEqual([segments[0]])
    expect(collectAttachments([attachment], segments)).toEqual([attachment])
    expect(collectAttachments(['/tmp/reference.txt'], segments)).toEqual([segments[0]])
  })

  it('shows image and document filenames even when the row is collapsed', () => {
    const attachments = [{ name: 'photo.png', mimeType: 'image/png', data: 'AAAA' }, { name: 'invoice.txt', mimeType: 'text/plain', data: 'QQ==' }]
    const markup = renderToStaticMarkup(<MessageQueue items={[{ id: 'q-test', content: 'review these', queuedAt: 1, attachments }]} />)
    expect(markup).toContain('photo.png')
    expect(markup).toContain('invoice.txt')
    expect(markup).toContain('data:image/png;base64,AAAA')
  })
})
