import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Conversation } from '../../../apps/web/src/components/chat/conversation'
import { useChat } from '../../../apps/web/src/hooks/useChat'
import { useProjects } from '../../../apps/web/src/hooks/useProjects'
import { isSessionUnread } from '../../../apps/web/src/components/chat/session-row'
import '../../../apps/web/src/index.css'

function Harness() {
  const index = useProjects('read-marker-test')
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [long, setLong] = useState(false)
  const session = [...index.personalSessions, ...index.projects.flatMap(p => p.sessions)]
    .find(s => s.id === index.activeSessionId)
  const realChat = new URLSearchParams(location.search).has('real')
  const chat = useChat(realChat ? session?.id ?? null : null, realChat ? 'read-marker-test' : null,
    undefined, null, session?.lastActiveAt)
  const viewedProps = { onLatestContentViewed: () => {
    const at = realChat ? chat.viewedActivityAt : session?.lastActiveAt
    if (session && at) void index.markSessionViewed(session.id, at)
  } }
  return <>
    <button onClick={() => setLoading(false)}>Load transcript</button>
    <button onClick={() => index.switchProject('project-1')}>Open project</button>
    <button onClick={() => index.switchSession(null, 'personal-1')}>Open personal</button>
    <button onClick={() => setHidden(v => !v)}>Toggle panel</button>
    <button onClick={() => setLong(true)}>Long transcript</button>
    <button onClick={() => index.fetchProjects()}>Refresh index</button>
    <button onClick={() => session && index.handleProjectEvent('chat.updated', { session: {
      ...session, lastActiveAt: '2026-09-13T10:01:00.000Z', viewedAt: null,
    } })}>Receive reply</button>
    <output data-testid="active">{session?.id}</output>
    <output data-testid="unread">{session ? String(isSessionUnread(session)) : ''}</output>
    <output data-testid="viewed">{session?.viewedAt ?? ''}</output>
    <div style={{ height: 350, display: hidden ? 'none' : 'flex' }}>
      <Conversation key={session?.id} loading={loading || (realChat && chat.isLoadingHistory)} className="h-full w-full" {...viewedProps}
        messageContents={realChat ? chat.messages.map(m => m.content) : [session?.lastActiveAt ?? '']}>
        <div key="reply" style={{ height: long ? 2000 : 80 }}>{realChat ? chat.messages.map(m => m.content).join(' ') : `Latest reply ${session?.lastActiveAt}`}</div>
      </Conversation>
    </div>
  </>
}
createRoot(document.getElementById('root')!).render(<Harness />)
