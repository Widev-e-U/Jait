import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProjectChatSharing } from './project-chat-sharing'
import type { ProjectSession } from '@/hooks/useProjects'

const session: ProjectSession = {
  id: 'owner-chat', projectId: 'project', name: 'Design', projectPath: null,
  status: 'active', createdAt: '', lastActiveAt: '', viewedAt: null, metadata: null,
  canManageShare: true, sharedWithProject: false,
}

describe('project chat sharing', () => {
  it('offers explicit sharing only for chats the account owns', () => {
    const html = renderToStaticMarkup(<ProjectChatSharing token="token" sessions={[
      session, { ...session, id: 'other-chat', name: 'Other', canManageShare: false, sharedWithProject: true },
    ]} />)
    expect(html).toContain('Design')
    expect(html).toContain('Share with project')
    expect(html).toContain('Only the chat owner can send messages or run tools')
    expect(html).not.toContain('Other')
  })

  it('shows a shared chat can be made private again', () => {
    const html = renderToStaticMarkup(<ProjectChatSharing token="token" sessions={[{ ...session, sharedWithProject: true }]} />)
    expect(html).toContain('Stop sharing')
  })

  it('does not offer sharing when there are no owned chats', () => {
    const html = renderToStaticMarkup(<ProjectChatSharing token="token" sessions={[{ ...session, canManageShare: false }]} />)
    expect(html).toBe('')
  })
})
