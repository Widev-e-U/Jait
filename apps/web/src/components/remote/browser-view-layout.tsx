import { useState, type ReactNode } from 'react'
import { BrowserAddressBar, type BrowserAddressBarProps } from './browser-address-bar'
import { BrowserToolsPanel } from './browser-tools-panel'

export function BrowserViewLayout({ addressBar, children, compact = false }: {
  compact?: boolean
  addressBar?: BrowserAddressBarProps
  children: ReactNode
}) {
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div data-browser-layout className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {addressBar && (
        <div aria-hidden={compact || undefined} inert={compact || undefined}
          className={`relative z-40 grid shrink-0 transition-[grid-template-rows,opacity] [transition-duration:150ms] [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${compact ? 'grid-rows-[0fr] overflow-hidden opacity-0' : 'grid-rows-[1fr] overflow-visible opacity-100'}`}>
          <div className="min-h-0"><BrowserAddressBar {...addressBar} toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen(!toolsOpen)} /></div>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        {!compact && toolsOpen && addressBar && !addressBar.disabled && (
          <BrowserToolsPanel sessionId={addressBar.sessionId} authToken={addressBar.authToken} />
        )}
      </div>
    </div>
  )
}
