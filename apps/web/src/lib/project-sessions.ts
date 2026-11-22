import type { ProjectSession } from '@/hooks/useProjects'

export interface ProjectSessionForSelection {
  id: string
  createdAt: string
  lastActiveAt: string
}

export interface ProjectForSessionSelection {
  sessions: ProjectSessionForSelection[]
}

export function getLatestProjectSessionId(project: ProjectForSessionSelection | null | undefined): string | null {
  const latest = project?.sessions.reduce<ProjectSessionForSelection | null>((current, session) => {
    if (!current) return session
    const currentTime = Date.parse(current.lastActiveAt || current.createdAt)
    const sessionTime = Date.parse(session.lastActiveAt || session.createdAt)
    return sessionTime > currentTime ? session : current
  }, null)
  return latest?.id ?? null
}

export function isReadOnlyChatSession(
  session: Pick<ProjectSession, 'projectId' | 'isOwner' | 'canManageShare'> | null | undefined,
): boolean {
  if (session?.isOwner !== undefined) return !session.isOwner
  // Older gateways mark personal chats as ineligible for project sharing.
  return Boolean(session?.projectId) && session?.canManageShare === false
}
