import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '../../../apps/web/src/components/chat/conversation'
import '../../../apps/web/src/index.css'

const history = Array.from({ length: 30 }, (_, index) => ({
  id: `message-${index}`, role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
  content: `Message ${index}`, height: 160,
}))
function Harness() {
  const [messages, setMessages] = useState(history)
  const [height, setHeight] = useState(500)
  const [target, setTarget] = useState('message-28')
  const send = (long = false) => {
    const id = `follow-up-${messages.length}`
    setTarget(id)
    setMessages([...messages, { id, role: 'user', content: id, height: 90 },
      ...(long ? [{ id: `${id}-reply`, role: 'assistant' as const, content: 'Fast long reply', height: 800 }] : [])])
  }
  return <>
    <button onClick={() => send()}>Send follow-up</button>
    <button onClick={() => send(true)}>Send with fast reply</button>
    <button onClick={() => setMessages([...messages, { id: `reply-${messages.length}`, role: 'assistant', content: 'Streamed reply', height: 250 }])}>Grow reply</button>
    <button onClick={() => setHeight(height === 500 ? 300 : 500)}>Resize keyboard</button>
    <div style={{ height, display: 'flex', position: 'relative' }}>
      <div data-testid="header" style={{ position: 'absolute', top: 8, left: 8, right: 8, height: 44, zIndex: 20, background: '#333' }}>Chat controls</div>
      <Conversation mobile className="h-full w-full" messageContents={messages.map(m => m.content)}
        messageEstimateInputs={messages} scrollToMessageId={target}>
        {messages.map(m => <div key={m.id} data-testid={m.id} style={{ height: m.height }}>{m.content}</div>)}
      </Conversation>
    </div>
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
