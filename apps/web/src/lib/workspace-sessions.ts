export interface WorkspaceSessionForSelection {
  id: string
  createdAt: string
  lastActiveAt: string
}

export interface WorkspaceForSessionSelection {
  sessions: WorkspaceSessionForSelection[]
}

export function getLatestWorkspaceSessionId(workspace: WorkspaceForSessionSelection | null | undefined): string | null {
  const latest = workspace?.sessions.reduce<WorkspaceSessionForSelection | null>((current, session) => {
    if (!current) return session
    const currentTime = Date.parse(current.lastActiveAt || current.createdAt)
    const sessionTime = Date.parse(session.lastActiveAt || session.createdAt)
    return sessionTime > currentTime ? session : current
  }, null)
  return latest?.id ?? null
}
