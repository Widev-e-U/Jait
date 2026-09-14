import { createRoot } from 'react-dom/client'
import { Message } from '../../../apps/web/src/components/chat/message'
import { ConfirmDialogProvider } from '../../../apps/web/src/components/ui/confirm-dialog'
import { TooltipProvider } from '../../../apps/web/src/components/ui/tooltip'

// 1x1 transparent PNG.
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

createRoot(document.getElementById('root')!).render(<Harness />)
