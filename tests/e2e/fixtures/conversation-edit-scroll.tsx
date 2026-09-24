import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '../../../apps/web/src/components/chat/conversation'
import '../../../apps/web/src/index.css'

const original = Array.from({ length: 30 }, (_, index) => ({
  id: `message-${index}`,
  role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
  content: `Message ${index}`,
}))

function Harness() {
  const [messages, setMessages] = useState(original)
  const latestUserId = [...messages].reverse().find(message => message.role === 'user')?.id
  return <>
    <button onClick={() => setMessages([...original.slice(0, 10), {
      id: 'edited-message', role: 'user', content: 'Edited message',
    }])}>Edit and send</button>
    <div style={{ height: 400, display: 'flex' }}>
      <Conversation className="h-full w-full" messageContents={messages.map(message => message.content)}
        messageEstimateInputs={messages} scrollToMessageId={latestUserId}>
        {messages.map(message => <div key={message.id} style={{ height: 160 }}>{message.content}</div>)}
      </Conversation>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<Harness />)
