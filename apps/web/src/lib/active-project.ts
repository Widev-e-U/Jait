export type ActiveProjectState = { surfaceId: string; projectRoot: string; nodeId?: string; opening?: boolean } | null

export interface ProjectSwitchTarget {
  rootPath: string | null
  nodeId: string | null
}

export function activeProjectDuringSwitch(
  _current: ActiveProjectState,
  target: ProjectSwitchTarget,
): ActiveProjectState {
  const projectRoot = target.rootPath?.trim()
  if (!projectRoot) return null
  return {
    surfaceId: '',
    projectRoot,
    nodeId: target.nodeId?.trim() || 'gateway',
    opening: true,
  }
}

export function areActiveProjectsEqual(a: ActiveProjectState, b: ActiveProjectState) {
  return a?.surfaceId === b?.surfaceId
    && a?.projectRoot === b?.projectRoot
    && (a?.nodeId ?? 'gateway') === (b?.nodeId ?? 'gateway')
    && Boolean(a?.opening) === Boolean(b?.opening)
}
