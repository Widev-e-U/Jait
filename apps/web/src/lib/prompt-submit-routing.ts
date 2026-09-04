import type { SendTarget } from '@/components/chat/send-target-selector'

export type PromptSubmitAction = 'steer' | 'queue' | 'thread' | 'submit'

/** What the user picked in Settings as the default action while streaming. */
export type DefaultStreamingAction = 'steer' | 'queue' | 'thread'

/**
 * Decide what pressing Enter (or the send button) should do:
 * - not loading → submit a new message
 * - thread target → submit (threads keep their existing behavior)
 * - streaming → honor the configured default action when a handler exists for it
 * - fallback → steer if possible, then queue (preserves old semantics)
 */
export function resolvePromptSubmitAction(input: {
  isLoading?: boolean
  sendTarget?: SendTarget
  hasQueueHandler: boolean
  hasSteerHandler?: boolean
  /** Handler for submitting into a fresh thread while a session is streaming. */
  hasThreadHandler?: boolean
  /** User-configured default for streaming sessions. */
  defaultAction?: DefaultStreamingAction
}): PromptSubmitAction {
  if (!input.isLoading) return 'submit'
  if (input.sendTarget === 'thread') return 'submit'
  const hasHandler = {
    steer: Boolean(input.hasSteerHandler),
    queue: Boolean(input.hasQueueHandler),
    thread: Boolean(input.hasThreadHandler),
  }
  const preferred = input.defaultAction ?? 'steer'
  if (hasHandler[preferred]) return preferred
  if (input.hasSteerHandler) return 'steer'
  if (input.hasQueueHandler) return 'queue'
  return 'submit'
}

/** The secondary (Alt+Enter) action for a given default. */
export function alternateStreamingAction(defaultAction: DefaultStreamingAction): 'steer' | 'queue' {
  return defaultAction === 'steer' ? 'queue' : 'steer'
}

export function shouldQueuePromptSubmit(input: {
  isLoading?: boolean
  sendTarget?: SendTarget
  hasQueueHandler: boolean
  defaultAction?: DefaultStreamingAction
}): boolean {
  return resolvePromptSubmitAction({ ...input, hasSteerHandler: false }) === 'queue'
}