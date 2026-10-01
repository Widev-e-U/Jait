import { createRoot } from 'react-dom/client'

import { Message } from '@/components/chat/message'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'

function Harness() {
  return (
    <TooltipProvider>
      <ConfirmDialogProvider>
        <div style={{ width: '100%', maxWidth: 600, margin: '0 auto' }}>
          <Message role="user" content="User message" />
          <Message role="user" kind="system-notice" content="Background terminal completed (exit code 0)." />
          <Message role="user" kind="system-notice" content={'Background terminal completed: ' + 'Long command output with details. '.repeat(12)} />
        </div>
      </ConfirmDialogProvider>
    </TooltipProvider>
  )
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
