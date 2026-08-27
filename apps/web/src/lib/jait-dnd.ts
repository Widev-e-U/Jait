export const JAIT_FILE_REF_MIME = 'text/jait-file'
export const JAIT_TREE_NODE_MIME = 'text/jait-tree-node'
export const JAIT_TAB_MIME = 'text/jait-tab'
export const JAIT_PROJECT_REF_MIME = 'application/x-jait-project+json'
export const JAIT_TERMINAL_REF_MIME = 'application/x-jait-terminal+json'
export const JAIT_CHAT_REF_MIME = 'application/x-jait-chat+json'

export interface JaitProjectDragPayload {
  path: string
  name: string
}

export interface JaitChatDragPayload {
  sessionId: string
  name: string
}

export interface JaitTerminalDragPayload {
  terminalId: string
  name: string
  projectRoot?: string | null
}

export function buildProjectDragPayload(path: string, name?: string): JaitProjectDragPayload {
  return {
    path,
    name: name || path.split(/[\\/]/).pop() || path,
  }
}

export function buildTerminalDragPayload(
  terminalId: string,
  name?: string,
  projectRoot?: string | null,
): JaitTerminalDragPayload {
  return {
    terminalId,
    name: name || terminalId,
    ...(projectRoot ? { projectRoot } : {}),
  }
}

export function buildChatDragPayload(sessionId: string, name?: string): JaitChatDragPayload {
  return {
    sessionId,
    name: name || sessionId,
  }
}
