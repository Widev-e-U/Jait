import { useEffect, type RefObject } from 'react'

import type { PromptInputHandle } from '@/components/chat'

type LaunchQueueFileHandle = {
  getFile: () => Promise<File>
}

export function useLaunchQueueAttachments(promptInputRef: RefObject<PromptInputHandle | null>) {
  useEffect(() => {
    const launchQueue = (window as any).launchQueue
    if (!launchQueue) return

    launchQueue.setConsumer(async (launchParams: { files: LaunchQueueFileHandle[] }) => {
      if (!launchParams.files.length) return
      for (const handle of launchParams.files) {
        try {
          const file = await handle.getFile()
          const mimeType = file.type || 'application/octet-stream'
          const reader = new FileReader()
          reader.onload = () => {
            const data = (reader.result as string).split(',')[1] ?? ''
            const preview = mimeType.startsWith('image/') ? (reader.result as string) : undefined
            promptInputRef.current?.addAttachment({ name: file.name, mimeType, data, preview })
            promptInputRef.current?.focus()
          }
          if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file)
          } else {
            reader.readAsDataURL(new Blob([await file.arrayBuffer()], { type: mimeType }))
          }
        } catch {
          // skip unreadable file
        }
      }
    })
  }, [promptInputRef])
}
