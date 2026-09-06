import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { TooltipHint, TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MessageAction } from '@/components/ai-elements/message'
import '@/index.css'

function TooltipRepro() {
  const [clicks, setClicks] = useState(0)
  const [content, setContent] = useState<string>()
  return (
    <main className="flex items-center gap-4 p-10">
      <TooltipProvider>
        <TooltipHint content="First hint"><Button onClick={() => setClicks(clicks + 1)}>First</Button></TooltipHint>
        <TooltipHint content="Second hint"><Button>Second</Button></TooltipHint>
        <TooltipHint content="Unavailable hint"><Button disabled>Unavailable</Button></TooltipHint>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TooltipHint content="Menu hint"><Button>Menu</Button></TooltipHint>
          </DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem onSelect={() => setClicks(clicks + 1)}>Choose</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <TooltipHint content={content}><Button onClick={() => setContent(content ? undefined : 'Updated hint')}>Dynamic</Button></TooltipHint>
        <TooltipHint content="Truncated text"><span>Truncated</span></TooltipHint>
        <MessageAction tooltip="Copy hint" label="Copy">Copy</MessageAction>
      </TooltipProvider>
      <TooltipHint content="Standalone hint"><Button>Standalone</Button></TooltipHint>
      <output aria-label="Clicks">{clicks}</output>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><TooltipRepro /></StrictMode>)
