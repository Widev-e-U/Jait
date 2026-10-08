import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '@/components/chat/conversation'
import '@/index.css'

const messages = Array.from({ length: 40 }, (_, index) => `Saved message ${index + 1}`)

function ChatIdleRepro() {
  return <main className="flex h-screen flex-col">
    <div data-testid="saved-message-count">{messages.length}</div>
    <Conversation messageContents={messages}>
      {messages.map((content, index) => <div key={`message-${index}`} style={{ height: 120 }}>{content}</div>)}
    </Conversation>
  </main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><ChatIdleRepro /></StrictMode>)
