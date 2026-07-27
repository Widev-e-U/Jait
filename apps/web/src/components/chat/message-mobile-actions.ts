export function getMobileMessageActionsPositionClassName(isUser: boolean, outsideBubble = false): string {
  if (outsideBubble) return 'right-0 top-full mt-0.5'
  return isUser ? 'right-1.5 bottom-1' : '-right-7 bottom-0.5'
}
