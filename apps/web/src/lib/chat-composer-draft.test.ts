import { describe, expect, it } from 'vitest'

import {
  getChatComposerDraftKey,
  resolveChatComposerDraftOnEnter,
  type ChatComposerDraft,
} from './chat-composer-draft'

const typed: ChatComposerDraft = { text: 'half a question', segments: undefined }

describe('getChatComposerDraftKey', () => {
  it('keys each chat separately and shares one slot for views without a chat yet', () => {
    expect(getChatComposerDraftKey('chat-1')).toBe('developer:chat-1')
    expect(getChatComposerDraftKey(null)).toBe('developer:new-chat')
    expect(getChatComposerDraftKey(undefined)).toBe('developer:new-chat')
  })
})

describe('resolveChatComposerDraftOnEnter', () => {
  it('restores the text a chat had saved, and does not show the typed text in it', () => {
    const saved: ChatComposerDraft = { text: 'own draft', segments: undefined }

    expect(resolveChatComposerDraftOnEnter(saved, typed)).toEqual(saved)
  })

  it('keeps the text being typed when the chat has none saved', () => {
    expect(resolveChatComposerDraftOnEnter(undefined, typed)).toEqual(typed)
    expect(resolveChatComposerDraftOnEnter({ text: '', segments: undefined }, typed)).toEqual(typed)
  })
})
