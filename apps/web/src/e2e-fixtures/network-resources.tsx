import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NetworkPanel } from '@/components/network/network-panel'
import '@/index.css'

// Exercise the production graph and detail panel with deterministic HTTP inventory.
const host = document.createElement('div')
host.id = 'network-resource-fixture'
host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--background)'
document.body.append(host)
createRoot(host).render(<TooltipProvider><NetworkPanel token="fixture" sessionId="fixture" /></TooltipProvider>)
