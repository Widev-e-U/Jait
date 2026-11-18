/** System notices share the user role but do not start a user turn. */
export function isUserTurn(message: { role?: unknown; kind?: unknown }): boolean {
  return message.role === 'user' && message.kind !== 'system-notice'
}

export function latestUserTurnId(messages: readonly { role?: unknown; kind?: unknown; id: string; renderId?: string }[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!
    if (isUserTurn(message)) return message.renderId ?? message.id
  }
  return null
}
