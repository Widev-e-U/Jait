import { describe, expect, it } from 'vitest'

import { createUserMessageEditSubmission } from './message-edit'
import type { UserMessageSegment } from '@/lib/user-message-segments'

describe('message edit submission', () => {
  it('preserves referenced files while replacing edited text', () => {
    const previousSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Review this' },
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
    ]

    expect(createUserMessageEditSubmission('Review that instead', previousSegments)).toEqual({
      text: 'Review that instead',
      referencedFiles: [{ path: 'apps/web/src/App.tsx', name: 'App.tsx' }],
      displaySegments: [
        { type: 'text', text: 'Review that instead' },
        { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
      ],
    })
  })

  it('rejects blank edits', () => {
    expect(createUserMessageEditSubmission('   ')).toBeNull()
  })

  it('preserves image segments that are not represented in the editable text', () => {
    const editedSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Updated prompt' },
    ]
    const preservedSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Original prompt' },
      { type: 'image', name: 'screen.png', mimeType: 'image/png', data: 'abc123' },
    ]

    expect(createUserMessageEditSubmission('Updated prompt', editedSegments, preservedSegments)).toEqual({
      text: 'Updated prompt',
      referencedFiles: [],
      displaySegments: [
        { type: 'text', text: 'Updated prompt' },
        { type: 'image', name: 'screen.png', mimeType: 'image/png', data: 'abc123' },
      ],
    })
  })
})
