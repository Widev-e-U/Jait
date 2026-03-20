import { describe, expect, it } from 'vitest'

import { shouldSyncComposerDraft } from '@/lib/prompt-input-draft'
import type { UserMessageSegment } from '@/lib/user-message-segments'

function signature(value: string, segments: UserMessageSegment[] | undefined): string {
  return JSON.stringify({
    value,
    segments: segments ?? [],
  })
}

describe('shouldSyncComposerDraft', () => {
  it('does not wipe local workspace refs when props are unchanged', () => {
    const localSegments: UserMessageSegment[] = [
      { type: 'file', path: 'apps/web/src/App.tsx', name: 'App.tsx' },
      { type: 'text', text: ' explain this' },
    ]

    expect(shouldSyncComposerDraft(
      signature('', undefined),
      '',
      undefined,
      localSegments,
    )).toBe(false)
  })

  it('syncs when parent provides explicit display segments', () => {
    const nextSegments: UserMessageSegment[] = [
      { type: 'text', text: 'check ' },
      { type: 'file', path: 'README.md', name: 'README.md' },
    ]

    expect(shouldSyncComposerDraft(
      null,
      'check ',
      nextSegments,
      [],
    )).toBe(true)
  })

  it('syncs when plain text is externally replaced', () => {
    const localSegments: UserMessageSegment[] = [{ type: 'text', text: 'old draft' }]

    expect(shouldSyncComposerDraft(
      signature('old draft', undefined),
      'new draft',
      undefined,
      localSegments,
    )).toBe(true)
  })

  it('does not resync when local plain text already matches props', () => {
    const localSegments: UserMessageSegment[] = [{ type: 'text', text: 'current draft' }]

    expect(shouldSyncComposerDraft(
      signature('', undefined),
      'current draft',
      undefined,
      localSegments,
    )).toBe(false)
  })
})
