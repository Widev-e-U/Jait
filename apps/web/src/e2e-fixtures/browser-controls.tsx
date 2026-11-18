import { createRoot } from 'react-dom/client'
import { BrowserViewLayout } from '@/components/remote/browser-view-layout'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <main className="p-4">
      <h1>Browser controls fixture</h1>
      <div className="h-[420px] border">
        <BrowserViewLayout addressBar={{ sessionId: 'controls', currentUrl: 'https://example.test', sharedWithAgent: false }}>
          <NoVncSessionView source="/noVNC/vnc.html?path=api/live-view/6080/websockify" title="Test browser" />
        </BrowserViewLayout>
      </div>
      <button type="button">Outside browser</button>
    </main>
  </TooltipProvider>,
)
