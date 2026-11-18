import { createRoot } from 'react-dom/client'
import { JobsPage } from '@/components/jobs/JobsPage'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <ConfirmDialogProvider><TooltipProvider><div className="min-h-dvh bg-background text-foreground"><JobsPage /></div></TooltipProvider></ConfirmDialogProvider>,
)
