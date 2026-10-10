import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '../../../apps/web/src/components/chat/conversation'
import { mergeSnapshotMessagesWithOptimisticUsers, type OptimisticUserMessageLike } from '../../../apps/web/src/lib/optimistic-chat-messages'
import '../../../apps/web/src/index.css'

const history: OptimisticUserMessageLike[] = Array.from({ length: 30 }, (_, i) => ({
  id: `history-${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}`,
}))
const prompt: OptimisticUserMessageLike = { id: 'local-prompt', role: 'user', content: 'Current prompt', optimistic: true }
const answer: OptimisticUserMessageLike = { id: 'local-answer', role: 'assistant', content: 'Long streamed answer' }
function Harness() {
  const [messages, setMessages] = useState(history)
  const [answerHeight, setAnswerHeight] = useState(80)
  const latestUser = [...messages].reverse().find(message => message.role === 'user')
  const renderKey = (message: OptimisticUserMessageLike) => (message.renderId ?? message.id)
  return <>
    <button onClick={() => setMessages([...history, prompt, answer])}>Start reply</button>
    <button onClick={() => setAnswerHeight(1200)}>Grow reply</button>
    <button onClick={() => setMessages(current => mergeSnapshotMessagesWithOptimisticUsers([
      ...history, { ...prompt, id: 'saved-prompt', optimistic: false }, { ...answer, id: 'saved-answer' },
    ], current))}>Finish reply</button>
    <button onClick={() => setMessages(current => [...current, { ...prompt, id: 'next-prompt' }])}>Send again</button>
    <div style={{ height: 400, display: 'flex' }}>
      <Conversation className="h-full w-full" messageContents={messages.map(message => message.content)}
        messageEstimateInputs={messages} scrollToMessageId={latestUser && renderKey(latestUser)}>
        {messages.map(message => <div key={renderKey(message)} style={{ height: message.content === answer.content ? answerHeight : 160 }}>
          {message.content}
        </div>)}
      </Conversation>
    </div>
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
