const MOBILE_BREAKPOINT = 768
const MOBILE_USER_AGENT_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
const COARSE_POINTER_MAX_VIEWPORT = 1024

export function detectMobileViewport(target: Window = window): boolean {
  const viewportWidth = target.innerWidth
  if (viewportWidth < MOBILE_BREAKPOINT) return true

  const userAgentData = (target.navigator as Navigator & {
    userAgentData?: { mobile?: boolean }
  }).userAgentData
  if (userAgentData?.mobile) return true

  if (MOBILE_USER_AGENT_PATTERN.test(target.navigator.userAgent)) return true

  const coarsePointer = typeof target.matchMedia === 'function'
    ? target.matchMedia('(pointer: coarse)').matches
    : false
  const shortestSide = Math.min(target.innerWidth, target.innerHeight)
  return coarsePointer && shortestSide <= COARSE_POINTER_MAX_VIEWPORT
}
