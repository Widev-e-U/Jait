import { describe, expect, it } from 'vitest'

import { shouldSyncComposerDraft } from '@/lib/prompt-input-draft'
import { normalizeUserMessageSegments, type UserMessageSegment } from '@/lib/user-message-segments'
import { shouldRemovePreviousChipOnBackspace } from './prompt-input'

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

describe('shouldSyncComposerDraft with folder drops', () => {
  it('does not wipe local folder chip refs when value changes from drop', () => {
    const localSegments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\Users\\jake\\project', name: 'project', kind: 'dir' },
      { type: 'text', text: ' ' },
    ]

    // After a drop, onChange fires with just the text ' '
    // segments prop stays undefined — should NOT trigger a rebuild
    expect(shouldSyncComposerDraft(
      signature('', undefined),
      ' ',
      undefined,
      localSegments,
    )).toBe(false)
  })

  it('does not wipe local folder chip refs when typing after drop', () => {
    const localSegments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\Users\\jake\\project', name: 'project', kind: 'dir' },
      { type: 'text', text: ' explain this folder' },
    ]

    expect(shouldSyncComposerDraft(
      signature(' ', undefined),
      ' explain this folder',
      undefined,
      localSegments,
    )).toBe(false)
  })
})

describe('normalizeUserMessageSegments with kind', () => {
  it('preserves kind: dir on file segments', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'C:\\folder', name: 'folder', kind: 'dir' },
    ]
    const result = normalizeUserMessageSegments(segments)
    expect(result[0]).toEqual({ type: 'file', path: 'C:\\folder', name: 'folder', kind: 'dir' })
  })

  it('does not add kind when not present', () => {
    const segments: UserMessageSegment[] = [
      { type: 'file', path: 'src/index.ts', name: 'index.ts' },
    ]
    const result = normalizeUserMessageSegments(segments)
    expect(result[0]).toEqual({ type: 'file', path: 'src/index.ts', name: 'index.ts' })
    expect('kind' in result[0]).toBe(false)
  })
})

describe('shouldRemovePreviousChipOnBackspace', () => {
  it('does not remove a chip when the caret is mid-text after that chip', () => {
    expect(shouldRemovePreviousChipOnBackspace({
      startContainerIsRoot: false,
      startContainerIsText: true,
      startOffset: 4,
      childIndex: 1,
    })).toBe(false)
  })

  it('removes a chip when the caret is at the start of the text node right after it', () => {
    expect(shouldRemovePreviousChipOnBackspace({
      startContainerIsRoot: false,
      startContainerIsText: true,
      startOffset: 0,
      childIndex: 1,
    })).toBe(true)
  })

  it('removes a chip when the caret is at the root position immediately after it', () => {
    expect(shouldRemovePreviousChipOnBackspace({
      startContainerIsRoot: true,
      startContainerIsText: false,
      startOffset: 1,
      childIndex: 1,
    })).toBe(true)
  })
})
