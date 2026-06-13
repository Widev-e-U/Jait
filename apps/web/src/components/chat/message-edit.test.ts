import { describe, expect, it } from 'vitest'

import { createUserMessageEditSubmission } from './message-edit'
import {
  getUserMessageEditComposerShellClassName,
  getUserMessageEditComposerTransitionClassName,
} from './message-edit-layout'
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

  it('preserves non-image attachment segments that are not represented in the editable text', () => {
    const editedSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Updated prompt' },
    ]
    const preservedSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Original prompt' },
      { type: 'attachment', name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
    ]

    expect(createUserMessageEditSubmission('Updated prompt', editedSegments, preservedSegments)?.displaySegments).toEqual([
      { type: 'text', text: 'Updated prompt' },
      { type: 'attachment', name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
    ])
  })
})

describe('message edit mobile layout', () => {
  it('centers the edit composer above the mobile keyboard instead of inline with the message', () => {
    const classes = getUserMessageEditComposerShellClassName()

    expect(classes).toContain('fixed')
    expect(classes).toContain('left-1/2')
    expect(classes).toContain('-translate-x-1/2')
    expect(classes).toContain('bottom-[max(0.75rem,env(safe-area-inset-bottom))]')
    expect(classes).toContain('w-[min(42rem,calc(100vw-1rem))]')
  })

  it('renders the floating mobile composer as an opaque card so messages do not bleed through', () => {
    const classes = getUserMessageEditComposerShellClassName()

    expect(classes).toContain('bg-background')
    expect(classes).toContain('border')
    expect(classes).toContain('shadow-2xl')
    // ...and removes that card styling for the inline desktop layout
    expect(classes).toContain('md:bg-transparent')
    expect(classes).toContain('md:border-0')
    expect(classes).toContain('md:shadow-none')
  })

  it('does not animate vertical position while typing in the edit composer', () => {
    const classes = getUserMessageEditComposerTransitionClassName(true)

    expect(classes).toContain('transition-opacity')
    expect(classes).not.toContain('transition-all')
    expect(classes).not.toContain('translate-y-0')
  })

  it('restores desktop edits to the original inline message bubble layout', () => {
    const classes = getUserMessageEditComposerShellClassName()

    expect(classes).toContain('md:static')
    expect(classes).toContain('md:w-full')
    expect(classes).toContain('md:max-w-3xl')
    expect(classes).toContain('md:translate-x-0')
  })
})
