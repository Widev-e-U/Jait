interface PreviewLogLike {
  id: number
}

interface PreviewBrowserEventLike {
  id: number
}

interface PreviewRemoteBrowserLike {
  containerName: string
  novncUrl: string
  novncPort: number
  vncPort: number
  startedAt: string
}

export interface PreviewSessionLike {
  id: string
  status: string
  mode: string
  target: string | null
  command: string | null
  port: number | null
  url: string | null
  browserId: string | null
  processId: number | null
  containerId: string | null
  remoteBrowser?: PreviewRemoteBrowserLike | null
  lastError: string | null
  updatedAt: string
  logs: PreviewLogLike[]
  browserEvents: PreviewBrowserEventLike[]
}

function lastId(items: { id: number }[]): number | null {
  return items.length > 0 ? items[items.length - 1]?.id ?? null : null
}

export function isSamePreviewSession(
  previous: PreviewSessionLike | null,
  next: PreviewSessionLike | null,
): boolean {
  if (previous === next) return true
  if (!previous || !next) return false

  return previous.id === next.id
    && previous.status === next.status
    && previous.mode === next.mode
    && previous.target === next.target
    && previous.command === next.command
    && previous.port === next.port
    && previous.url === next.url
    && previous.browserId === next.browserId
    && previous.processId === next.processId
    && previous.containerId === next.containerId
    && (previous.remoteBrowser?.containerName ?? null) === (next.remoteBrowser?.containerName ?? null)
    && (previous.remoteBrowser?.novncUrl ?? null) === (next.remoteBrowser?.novncUrl ?? null)
    && previous.lastError === next.lastError
    && previous.updatedAt === next.updatedAt
    && previous.logs.length === next.logs.length
    && lastId(previous.logs) === lastId(next.logs)
    && previous.browserEvents.length === next.browserEvents.length
    && lastId(previous.browserEvents) === lastId(next.browserEvents)
}
