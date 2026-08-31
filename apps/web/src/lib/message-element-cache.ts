export function haveRenderInputsChanged(
  previous: readonly unknown[] | undefined,
  current: readonly unknown[],
): boolean {
  if (!previous || previous.length !== current.length) return true
  for (let index = 0; index < current.length; index += 1) {
    if (!Object.is(previous[index], current[index])) return true
  }
  return false
}
