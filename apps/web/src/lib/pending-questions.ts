/**
 * Pending `user.ask` questions, keyed by request ID.
 *
 * A single chat can hold more than one open question at a time, so request IDs
 * are tracked (not just session IDs) and the sidebar badge is derived from the
 * session IDs present in the map.
 */
export function applyPendingQuestionEvent(
  pending: ReadonlyMap<string, string>,
  event: { type: string; payload: unknown },
): ReadonlyMap<string, string> {
  const payload = event.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return pending
  if (event.type === 'user-question.pending-snapshot') {
    if (!Array.isArray(payload.requests)) return pending
    const next = new Map<string, string>()
    for (const request of payload.requests) {
      if (request && typeof request.id === 'string' && typeof request.sessionId === 'string') {
        next.set(request.id, request.sessionId)
      }
    }
    return next
  }
  if (event.type === 'user-question.requested' && typeof payload.id === 'string' && typeof payload.sessionId === 'string') {
    return new Map(pending).set(payload.id, payload.sessionId)
  }
  if (event.type === 'user-question.resolved' && typeof payload.id === 'string') {
    if (!pending.has(payload.id)) return pending
    const next = new Map(pending)
    next.delete(payload.id)
    return next
  }
  return pending
}

/** Session IDs that currently have at least one unanswered question. */
export function pendingQuestionSessionIds(pending: ReadonlyMap<string, string>): ReadonlySet<string> {
  return new Set(pending.values())
}
