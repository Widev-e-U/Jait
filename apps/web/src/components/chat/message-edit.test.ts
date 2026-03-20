import { describe, expect, it } from 'vitest'

import { createUserMessageEditSubmission, isUserMessageEditUnchanged } from './message-edit'
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

  it('detects unchanged edits so restart is skipped', () => {
    const previousSegments: UserMessageSegment[] = [
      { type: 'text', text: 'Review this' },
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
    ]

    expect(isUserMessageEditUnchanged('Review this', 'Review this', previousSegments)).toBe(true)
    expect(isUserMessageEditUnchanged('Review that instead', 'Review this', previousSegments)).toBe(false)
  })

  it('rejects blank edits', () => {
    expect(createUserMessageEditSubmission('   ')).toBeNull()
  })
})
