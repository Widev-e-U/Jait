export type ActiveProjectState = { surfaceId: string; projectRoot: string; nodeId?: string; opening?: boolean } | null

export interface ProjectSwitchTarget {
  rootPath: string | null
  nodeId: string | null
}

export function activeProjectDuringSwitch(
  current: ActiveProjectState,
  target: ProjectSwitchTarget,
  willOpen = true,
): ActiveProjectState {
  const projectRoot = target.rootPath?.trim()
  if (!projectRoot) return null
  if (!willOpen) {
    const nodeId = target.nodeId?.trim() || 'gateway'
    return current?.surfaceId && current.projectRoot === projectRoot && (current.nodeId ?? 'gateway') === nodeId
      ? { ...current, opening: false }
      : null
  }
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
