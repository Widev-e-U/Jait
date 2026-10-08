/** Request IDs must be tracked separately: one chat can have multiple approvals. */
export function applyPendingApprovalEvent(
  pending: ReadonlyMap<string, string>,
  event: { type: string; payload: unknown },
): ReadonlyMap<string, string> {
  const payload = event.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return pending
  if (event.type === 'consent.pending-snapshot') {
    if (!Array.isArray(payload.requests)) return pending
    const next = new Map<string, string>()
    for (const request of payload.requests) {
      if (request && typeof request.id === 'string' && typeof request.sessionId === 'string') {
        next.set(request.id, request.sessionId)
      }
    }
    return next
  }
  if (event.type === 'consent.required' && typeof payload.id === 'string' && typeof payload.sessionId === 'string') {
    return new Map(pending).set(payload.id, payload.sessionId)
  }
  if (event.type === 'consent.resolved' && typeof payload.requestId === 'string') {
    if (!pending.has(payload.requestId)) return pending
    const next = new Map(pending)
    next.delete(payload.requestId)
    return next
  }
  return pending
}
