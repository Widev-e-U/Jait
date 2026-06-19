import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchContextFlow,
  getCachedContextFlow,
  isContextFlowInFlight,
  invalidateContextFlowCache,
} from './context-flow-cache'
import type { LlmContextFlow } from '@/hooks/useChat'

// Mock getApiUrl so the module's fetch URL is deterministic.
vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'https://gateway.test' }))

const sampleFlow: LlmContextFlow = {
  provider: 'jait',
  model: 'gpt-4o',
  rounds: [{ round: 1, messages: [{ role: 'user', content: 'hi' }] }],
}

function mockFetchOnce(response: Response | Error, track?: { calls: number }) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', (...args: unknown[]) => {
    track.calls += 1
    return fn(...args)
  })
  return fn
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('context-flow-cache', () => {
  beforeEach(() => {
    invalidateContextFlowCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('caches a fetched payload so a second open does not refetch', async () => {
    const track = { calls: 0 }
    mockFetchOnce(jsonResponse({ contextFlow: sampleFlow }), track)

    const first = await fetchContextFlow('sess-1', 2)
    const second = await fetchContextFlow('sess-1', 2)

    expect(first).toEqual(sampleFlow)
    expect(second).toEqual(sampleFlow)
    expect(track.calls).toBe(1)
    expect(getCachedContextFlow('sess-1', 2)).toEqual(sampleFlow)
  })

  it('de-duplicates concurrent in-flight requests for the same key', async () => {
    const track = { calls: 0 }
    mockFetchOnce(jsonResponse({ contextFlow: sampleFlow }), track)

    expect(isContextFlowInFlight('sess-2', 0)).toBe(false)
    const [a, b, c] = await Promise.all([
      fetchContextFlow('sess-2', 0),
      fetchContextFlow('sess-2', 0),
      fetchContextFlow('sess-2', 0),
    ])
    expect(isContextFlowInFlight('sess-2', 0)).toBe(false)

    expect(a).toEqual(sampleFlow)
    expect(b).toEqual(sampleFlow)
    expect(c).toEqual(sampleFlow)
    expect(track.calls).toBe(1)
  })

  it('isolates cache entries by session and message index', async () => {
    const track = { calls: 0 }
    let i = 0
    vi.stubGlobal('fetch', async () => {
      track.calls += 1
      i += 1
      return jsonResponse({ contextFlow: { ...sampleFlow, note: `n${i}` } })
    })

    const a = await fetchContextFlow('sess-a', 0)
    const b = await fetchContextFlow('sess-b', 0)
    const a2 = await fetchContextFlow('sess-a', 0)

    expect(a?.note).toBe('n1')
    expect(b?.note).toBe('n2')
    expect(a2?.note).toBe('n1') // cached, no n4
    expect(track.calls).toBe(2)
  })

  it('does not poison the cache on a non-2xx response', async () => {
    const track = { calls: 0 }
    mockFetchOnce(new Response(null, { status: 500 }), track)

    const first = await fetchContextFlow('sess-err', 0)
    expect(first).toBeNull()
    // 500 stores a null entry — subsequent reads are cached as null (no retry).
    const second = await fetchContextFlow('sess-err', 0)
    expect(second).toBeNull()
    expect(track.calls).toBe(1)
  })

  it('allows a retry after a network failure (no cache poisoning)', async () => {
    const track = { calls: 0 }
    let fail = true
    vi.stubGlobal('fetch', async () => {
      track.calls += 1
      if (fail) throw new Error('boom')
      return jsonResponse({ contextFlow: sampleFlow })
    })

    const first = await fetchContextFlow('sess-net', 0)
    expect(first).toBeNull()
    fail = false
    const second = await fetchContextFlow('sess-net', 0)
    expect(second).toEqual(sampleFlow)
    expect(track.calls).toBe(2)
  })
})