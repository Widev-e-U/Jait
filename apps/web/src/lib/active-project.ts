export type ActiveProjectState = { surfaceId: string; projectRoot: string; nodeId?: string } | null

export function areActiveProjectsEqual(a: ActiveProjectState, b: ActiveProjectState) {
  return a?.surfaceId === b?.surfaceId
    && a?.projectRoot === b?.projectRoot
    && (a?.nodeId ?? 'gateway') === (b?.nodeId ?? 'gateway')
}
