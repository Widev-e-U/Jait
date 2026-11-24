import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '@/components/chat/conversation'
import { MessageQueue, type QueuedMessage } from '@/components/chat/message-queue'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [items, setItems] = useState<QueuedMessage[]>([{ id: 'single', content: Array.from({ length: 14 }, (_, i) => `Queued detail ${i}`).join('\n'), queuedAt: 1 }])
  const [tailHeight, setTailHeight] = useState(100)
  return <TooltipProvider><main style={{ height: 600, width: '100%', maxWidth: 800 }}>
    <button onClick={() => setItems(prev => [...prev, { id: 'second', content: 'Second message', queuedAt: 2 }])}>Add second</button>
    <button onClick={() => setTailHeight(height => height + 160)}>Grow transcript</button>
    <Conversation className="h-[540px]" showMinimap={false}>
      {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ height: i === 11 ? tailHeight : 100 }}>Transcript {i}</div>)}
      <MessageQueue items={items} onEdit={(id, content) => setItems(prev => prev.map(item => item.id === id ? { ...item, content } : item))} onReorder={(sourceId, targetId, placement) => setItems(prev => {
        const source = prev.find(item => item.id === sourceId)
        if (!source) return prev
        const next = prev.filter(item => item.id !== sourceId)
        const targetIndex = next.findIndex(item => item.id === targetId)
        next.splice(targetIndex < 0 ? next.length : targetIndex + (placement === 'after' ? 1 : 0), 0, source)
        return next
      })} />
    </Conversation>
  </main></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
