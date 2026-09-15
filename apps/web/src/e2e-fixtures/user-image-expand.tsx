import { createRoot } from 'react-dom/client'

import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function Harness() {
  return (
    <TooltipProvider>
      <ConfirmDialogProvider>
        <Message
          messageId="msg-1"
          role="user"
          content="have a look at this"
          displayContent="have a look at this"
          attachments={[{ name: 'photo.png', mimeType: 'image/png', data: TINY_PNG }]}
          onEditMessage={() => true}
        />
      </ConfirmDialogProvider>
    </TooltipProvider>
  )
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
