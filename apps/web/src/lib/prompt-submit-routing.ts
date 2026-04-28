import type { SendTarget } from '@/components/chat/send-target-selector'

export function shouldQueuePromptSubmit(input: {
  isLoading?: boolean
  sendTarget?: SendTarget
  hasQueueHandler: boolean
}): boolean {
  return Boolean(input.isLoading && input.hasQueueHandler && input.sendTarget !== 'thread')
}
