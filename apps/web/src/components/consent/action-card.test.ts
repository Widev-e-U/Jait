import { afterEach, describe, expect, it, vi } from 'vitest'
import { reconcileBulkApproval, submitConsentDecision, type ConsentRequestInfo } from './action-card'

function request(id: string, sessionId = 'session-1'): ConsentRequestInfo {
  return { id, sessionId } as ConsentRequestInfo
}

function queueState(initial: ConsentRequestInfo[]) {
  let queue = initial
  return {
    get: () => queue,
    set: (update: (previous: ConsentRequestInfo[]) => ConsentRequestInfo[]) => { queue = update(queue) },
  }
}

describe('bulk approval reconciliation', () => {
  it('removes only the IDs returned, retaining other sessions and pending requests', async () => {
    const queue = queueState([request('a'), request('b'), request('c', 'session-2')])
    expect(await reconcileBulkApproval(Response.json({ requestIds: ['a'] }), queue.set)).toBe(true)
    expect(queue.get().map((entry) => entry.id)).toEqual(['b', 'c'])
  })

  it.each([{ requestIds: [] }, {}, { requestIds: null }])('keeps the queue when no IDs are confirmed: %j', async (body) => {
    const queue = queueState([request('a'), request('b', 'session-2')])
    expect(await reconcileBulkApproval(Response.json(body), queue.set)).toBe(true)
    expect(queue.get().map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('rejects a JSON HTTP error without changing the queue', async () => {
    const queue = queueState([request('a')])
    const response = Response.json({ error: 'RETRY', requestIds: ['a'] }, { status: 503 })
    expect(await reconcileBulkApproval(response, queue.set)).toBe(false)
    expect(queue.get().map((entry) => entry.id)).toEqual(['a'])
  })
})


describe('individual consent decisions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['approve', 'reject'] as const)('%s retains the request for non-2xx responses', async (decision) => {
    const queue = queueState([request('a'), request('b')])
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'FORBIDDEN' }, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await submitConsentDecision('a', decision, queue.set, 'reason')).toBe(false)
    expect(queue.get().map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/consent/a/${decision}`), expect.objectContaining({ method: 'POST' }))
  })

  it.each(['approve', 'reject'] as const)('%s removes only the successful request', async (decision) => {
    const queue = queueState([request('a'), request('b')])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })))
    expect(await submitConsentDecision('a', decision, queue.set)).toBe(true)
    expect(queue.get().map((entry) => entry.id)).toEqual(['b'])
  })

  it('sends the rejection reason', async () => {
    const queue = queueState([request('a')])
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await submitConsentDecision('a', 'reject', queue.set, 'not authorized')
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ reason: 'not authorized' }))
  })
})
