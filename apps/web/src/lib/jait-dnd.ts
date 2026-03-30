export const JAIT_FILE_REF_MIME = 'text/jait-file'
export const JAIT_TREE_NODE_MIME = 'text/jait-tree-node'
export const JAIT_TAB_MIME = 'text/jait-tab'
export const JAIT_WORKSPACE_REF_MIME = 'application/x-jait-workspace+json'
export const JAIT_TERMINAL_REF_MIME = 'application/x-jait-terminal+json'

export interface JaitWorkspaceDragPayload {
  path: string
  name: string
}

export interface JaitTerminalDragPayload {
  terminalId: string
  name: string
  workspaceRoot?: string | null
}

export function buildWorkspaceDragPayload(path: string, name?: string): JaitWorkspaceDragPayload {
  return {
    path,
    name: name || path.split(/[\\/]/).pop() || path,
  }
}

export function buildTerminalDragPayload(
  terminalId: string,
  name?: string,
  workspaceRoot?: string | null,
): JaitTerminalDragPayload {
  return {
    terminalId,
    name: name || terminalId,
    ...(workspaceRoot ? { workspaceRoot } : {}),
  }
}
