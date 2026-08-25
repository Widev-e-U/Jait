import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { TrajectoryPanel, nextStickToBottom } from './trajectory-panel'

describe('TrajectoryPanel', () => {
  it('participates in the chat flex layout without claiming the composer height', () => {
    const markup = renderToStaticMarkup(<TrajectoryPanel onClose={() => {}} />)

    expect(markup).toContain('flex flex-1 min-h-0 min-w-0 flex-col')
    expect(markup).toContain('aria-label="Trajectory timeline"')
    expect(markup).not.toContain('flex flex-col h-full')
  })
})

describe('nextStickToBottom', () => {
  it('keeps following when content grows under an untouched viewport', () => {
    // The regression: a step streamed in, scrollHeight grew, and the scroll
    // event fired before the pin caught up. Reading that as "scrolled away"
    // detached the panel permanently and it stopped following the run.
    expect(nextStickToBottom({ distanceFromBottom: 900, stuck: true, userScrolling: false })).toBe(true)
  })

  it('detaches when the user is the one scrolling away', () => {
    expect(nextStickToBottom({ distanceFromBottom: 900, stuck: true, userScrolling: true })).toBe(false)
  })

  it('stays detached while the user reads back through history', () => {
    expect(nextStickToBottom({ distanceFromBottom: 900, stuck: false, userScrolling: false })).toBe(false)
  })

  it('re-attaches as soon as the bottom is reached again', () => {
    expect(nextStickToBottom({ distanceFromBottom: 0, stuck: false, userScrolling: true })).toBe(true)
  })

  it('treats a near-bottom position as the bottom', () => {
    expect(nextStickToBottom({ distanceFromBottom: 23, stuck: false, userScrolling: true })).toBe(true)
    expect(nextStickToBottom({ distanceFromBottom: 24, stuck: false, userScrolling: true })).toBe(false)
  })

  it('starts a fresh timeline attached, so it opens at the newest step', () => {
    // An empty panel has nothing to scroll: distance 0 must read as bottom.
    expect(nextStickToBottom({ distanceFromBottom: 0, stuck: true, userScrolling: false })).toBe(true)
  })
})
