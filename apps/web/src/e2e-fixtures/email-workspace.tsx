import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/hooks/useAuth'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EmailPage } from '@/components/email/EmailPage'
import { ToolCallCard, type ToolCallInfo } from '@/components/chat/tool-call-card'
import '@/index.css'

const params = new URLSearchParams(window.location.search)
const chat = params.get('preview') === 'chat'
const fixtureMessage = (window as unknown as { emailFixture?: Record<string, unknown> }).emailFixture || { id: 'm1', from: 'sender@example.test', subject: 'Welcome', bodyHtml: '<p>Hello</p>' }
const call: ToolCallInfo = {
  callId: 'mail-preview', tool: 'mcp__jait__email_view', args: { action: 'open', accountId: 'personal', messageId: 'm1' },
  status: 'success', startedAt: 1, completedAt: 2, result: { ok: true, message: 'Email preview', data: { accountId: 'personal', message: fixtureMessage } },
}
window.history.replaceState(null, '', '/emails' + window.location.search)
document.documentElement.classList.add('dark')
createRoot(document.getElementById('root')!).render(
  <AuthProvider><ConfirmDialogProvider><TooltipProvider>
    <div className={chat ? 'min-h-dvh bg-background p-4 text-foreground' : 'h-dvh bg-background text-foreground'}>
      {chat ? <div className="mx-auto max-w-3xl"><ToolCallCard call={call} /></div> : <EmailPage isMobile={window.innerWidth < 768} />}
    </div><Toaster />
  </TooltipProvider></ConfirmDialogProvider></AuthProvider>,
)
