import { describe, expect, it, vi } from 'vitest'

import { createStreamTextPacer, splitStreamText } from '@/lib/stream-text-pacer'

function createFakeClock() {
  let frameCallback: ((timestamp: number) => void) | null = null
  let deadlineCallback: (() => void) | null = null
  const timeoutHandle = 9 as unknown as ReturnType<typeof setTimeout>

  const requestFrame = vi.fn((callback: (timestamp: number) => void) => {
    frameCallback = callback
    return 7
  })
  const cancelFrame = vi.fn(() => {
    frameCallback = null
  })
  const setDeadline = vi.fn((callback: () => void) => {
    deadlineCallback = callback
    return timeoutHandle
  })
  const clearDeadline = vi.fn(() => {
    deadlineCallback = null
  })

  return {
    requestFrame,
    cancelFrame,
    setDeadline,
    clearDeadline,
    runFrame() {
      const callback = frameCallback
      frameCallback = null
      callback?.(16)
    },
    runDeadline() {
      const callback = deadlineCallback
      deadlineCallback = null
      callback?.()
    },
  }
}

describe('splitStreamText', () => {
  it('keeps word boundaries when chunking a burst', () => {
    expect(splitStreamText('Lorem ipsum dolor sit amet', 10)).toEqual([
      'Lorem ',
      'ipsum ',
      'dolor sit ',
      'amet',
    ])
  })

  it('splits very long unbroken tokens safely', () => {
    expect(splitStreamText('abcdefghijklmnop', 5)).toEqual([
      'abcde',
      'fghij',
      'klmno',
      'p',
    ])
  })
})

describe('createStreamTextPacer', () => {
  it('drains a single burst across multiple frames instead of one commit', async () => {
    const clock = createFakeClock()
    let content = ''
    const commits: string[] = []
    const pacer = createStreamTextPacer({
      onText: (chunk) => {
        content += chunk
      },
      onThinking: () => {},
      onCommit: () => {
        commits.push(content)
      },
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
      maxChunkChars: 8,
    })

    pacer.enqueueText('word1 word2 word3 word4')

    expect(commits).toEqual(['word1 '])

    clock.runFrame()
    expect(commits).toEqual(['word1 ', 'word1 word2 '])

    clock.runFrame()
    clock.runFrame()

    await expect(pacer.waitUntilIdle()).resolves.toBeUndefined()
    expect(commits).toEqual([
      'word1 ',
      'word1 word2 ',
      'word1 word2 word3 ',
      'word1 word2 word3 word4',
    ])
  })

  it('can flush queued content synchronously at ordering boundaries', () => {
    const clock = createFakeClock()
    let content = ''
    const commits: string[] = []
    const pacer = createStreamTextPacer({
      onText: (chunk) => {
        content += chunk
      },
      onThinking: () => {},
      onCommit: () => {
        commits.push(content)
      },
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      setDeadline: clock.setDeadline,
      clearDeadline: clock.clearDeadline,
      maxChunkChars: 6,
    })

    pacer.enqueueText('alpha beta gamma')
    pacer.flushNow()

    expect(pacer.isIdle()).toBe(true)
    expect(commits.at(-1)).toBe('alpha beta gamma')
  })
})
