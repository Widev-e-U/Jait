import type { ChatAttachment } from '@/hooks/useChat'

export type AttachmentDraftStore = Map<string, ChatAttachment[]>

export function getAttachmentDraftForKey(input: {
  store: AttachmentDraftStore
  draftStateKey?: string
  previousDraftStateKey?: string
  currentAttachments: ChatAttachment[]
}): ChatAttachment[] {
  const { store, draftStateKey, previousDraftStateKey, currentAttachments } = input
  if (!draftStateKey) return []

  const storedAttachments = store.get(draftStateKey)
  if (storedAttachments) return storedAttachments

  if (previousDraftStateKey && previousDraftStateKey !== draftStateKey && currentAttachments.length > 0) {
    return currentAttachments
  }

  return []
}

export function persistAttachmentDraft(
  store: AttachmentDraftStore,
  draftStateKey: string | undefined,
  attachments: ChatAttachment[],
): void {
  if (!draftStateKey) return
  if (attachments.length === 0) {
    store.delete(draftStateKey)
    return
  }
  store.set(draftStateKey, attachments)
}
