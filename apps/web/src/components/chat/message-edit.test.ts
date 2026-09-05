import { describe, expect, it } from 'vitest'

import { createUserMessageEditSubmission } from './message-edit'
import {
  getChatComposerBoundaryClassName,
  getChatTranscriptBoundaryClassName,
  getMobileUserMessageEditTop,
  getUserMessageEditComposerShellClassName,
  getUserMessageEditComposerTransitionClassName,
  shouldShowChatContextIndicator,
  shouldShowNormalChatComposer,
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

describe('chat transcript and composer layout', () => {
  it('clips streamed transcript content below an isolated opaque composer layer', () => {
    const transcriptClasses = getChatTranscriptBoundaryClassName()
    const composerClasses = getChatComposerBoundaryClassName(false, false)

    expect(transcriptClasses).toContain('overflow-hidden')
    expect(transcriptClasses).toContain('isolate')
    expect(composerClasses).toContain('relative')
    expect(composerClasses).toContain('z-30')
    expect(composerClasses).toContain('isolate')
    expect(composerClasses).toContain('bg-background')
  })
})

describe('message edit mobile layout', () => {
  it('centers the edited user message in the visible mobile viewport', () => {
    const classes = getUserMessageEditComposerShellClassName()

    expect(classes).toContain('fixed')
    expect(classes).toContain('left-1/2')
    expect(classes).toContain('top-1/2')
    expect(classes).toContain('-translate-x-1/2')
    expect(classes).toContain('-translate-y-1/2')
    expect(classes).not.toContain('bottom-[')
    expect(classes).toContain('w-[min(42rem,calc(100vw-1rem))]')
  })

  it('uses the visual viewport center so the edited message stays above the keyboard', () => {
    expect(getMobileUserMessageEditTop({ offsetTop: 40, height: 500 }, 900)).toBe(290)
    expect(getMobileUserMessageEditTop(null, 900)).toBe(450)
  })

  it('hides the normal composer only while a mobile message edit owns input focus', () => {
    expect(shouldShowNormalChatComposer(true, 'message-1')).toBe(false)
    expect(shouldShowNormalChatComposer(true, null)).toBe(true)
    expect(shouldShowNormalChatComposer(false, 'message-1')).toBe(true)
  })

  it('hides the context indicator while trajectory mode is open', () => {
    expect(shouldShowChatContextIndicator(true, true)).toBe(false)
    expect(shouldShowChatContextIndicator(true, false)).toBe(true)
    expect(shouldShowChatContextIndicator(false, false)).toBe(false)
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

    expect(classes).not.toContain('md:static')
    expect(classes).toContain('md:w-full')
    expect(classes).toContain('md:max-w-4xl')
    expect(classes).toContain('md:translate-x-0')
    expect(classes).toContain('md:relative')
    expect(classes).toContain('md:z-40')
    expect(classes).toContain('md:left-auto')
    expect(classes).toContain('md:top-auto')
  })
})
