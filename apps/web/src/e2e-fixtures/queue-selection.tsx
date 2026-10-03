import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '@/components/chat/conversation'
import { MessageQueue, type QueuedMessage } from '@/components/chat/message-queue'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [items, setItems] = useState<QueuedMessage[]>([{ id: 'single', content: Array.from({ length: 14 }, (_, i) => `Queued detail ${i}`).join('\n'), queuedAt: 1 }])
  return <TooltipProvider><main style={{ height: 600, width: '100%', maxWidth: 800 }}>
    <button onClick={() => setItems(prev => [...prev, { id: 'second', content: 'Second message', queuedAt: 2 }])}>Add second</button>
    <Conversation className="h-[540px]" showMinimap={false}>
      {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ height: 100 }}>Transcript {i}</div>)}
      <MessageQueue items={items} onEdit={(id, content) => setItems(prev => prev.map(item => item.id === id ? { ...item, content } : item))} onReorder={(sourceId, targetId) => setItems(prev => targetId && sourceId !== targetId ? [...prev].reverse() : prev)} />
    </Conversation>
  </main></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
